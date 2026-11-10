import fs from 'fs';
import path from 'path';
import { createHash, randomBytes } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const TREE_HASH_CACHE = 'tree-hash-cache-v1.json';
const execFileAsync = promisify(execFile);

export type HarmonyGenerationFaultPoint =
  | 'after-generate' | 'after-validate' | 'after-backup' | 'after-install';

interface Owner { schemaVersion: 1; pid: number; token: string }
interface Journal {
  schemaVersion: 1;
  hashVersion?: 2;
  operation?: 'tree' | 'managed-patch';
  phase: 'GENERATING' | 'PREPARED' | 'BACKED_UP' | 'INSTALLED' | 'PATCH_PREPARED' | 'PATCHED' | 'COMMITTED';
  hadTarget: boolean;
  preserveBackup: boolean;
  candidateHash?: string;
  patch?: ManagedPatchEntry[];
}
type ManagedFingerprint =
  | { kind: 'absent' }
  | { kind: 'file'; sha256: string; mode: number };
type ManagedPatchEntry = { path: string; before: ManagedFingerprint; after: ManagedFingerprint };
type ManagedPatchPlan = {
  writes: string[];
  deletes: string[];
  entries: Record<string, { before: ManagedFingerprint; after: ManagedFingerprint }>;
};
type FileHashSnapshot = {
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
  mode: number;
  digest: Buffer;
};
type TreeHash = { digest: string; files: Map<string, FileHashSnapshot> };
type HarmonyGenerationHashContext = {
  reuseClonedRoot(relativeRoot: string): void;
  reuseCurrentTree(): void;
  applyManagedPatch(patch: ManagedPatchPlan): void;
};
type SerializedFileHash = [string, string, string, string, string, string, number, string];

async function exists(file: string) {
  try { await fs.promises.lstat(file); return true; }
  catch (error: any) { if (error.code === 'ENOENT') return false; throw error; }
}

async function assertDirectory(directory: string) {
  const stat = await fs.promises.lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`Harmony generation requires a directory, not a symlink: ${directory}`);
  }
}

async function mkdirSafe(directory: string, root: string): Promise<void> {
  const relative = path.relative(root, directory);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe Harmony transaction path');
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { await fs.promises.mkdir(current); }
    catch (error: any) { if (error.code !== 'EEXIST') throw error; }
    await assertDirectory(current);
  }
}

async function syncDirectory(directory: string) {
  const handle = await fs.promises.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function writeJSON(file: string, value: unknown) {
  const temporary = file + '.tmp';
  const handle = await fs.promises.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  await fs.promises.rename(temporary, file);
  await syncDirectory(path.dirname(file));
}

async function readTreeHashCache(file: string): Promise<Map<string, FileHashSnapshot> | undefined> {
  try {
    const stat = await fs.promises.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) return undefined;
    const value = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    if (value?.schemaVersion !== 1 || !Array.isArray(value.files)) return undefined;
    const files = new Map<string, FileHashSnapshot>();
    for (const row of value.files as SerializedFileHash[]) {
      if (!Array.isArray(row) || row.length !== 8) return undefined;
      const [relative, dev, ino, size, mtimeNs, ctimeNs, mode, digest] = row;
      if (!relative || path.isAbsolute(relative) || relative.includes('\\')
        || relative.split('/').some(part => !part || part === '.' || part === '..')
        || !Number.isInteger(mode) || mode < 0 || mode > 0o7777
        || !/^[a-f0-9]{64}$/.test(digest) || files.has(relative)) return undefined;
      files.set(relative, {
        dev: BigInt(dev),
        ino: BigInt(ino),
        size: BigInt(size),
        mtimeNs: BigInt(mtimeNs),
        ctimeNs: BigInt(ctimeNs),
        mode,
        digest: Buffer.from(digest, 'hex'),
      });
    }
    return files;
  } catch {
    return undefined;
  }
}

async function writeTreeHashCache(file: string, files: Map<string, FileHashSnapshot>): Promise<void> {
  const temporary = `${file}.${process.pid}.tmp`;
  const rows: SerializedFileHash[] = [...files.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relative, value]) => [
      relative,
      value.dev.toString(),
      value.ino.toString(),
      value.size.toString(),
      value.mtimeNs.toString(),
      value.ctimeNs.toString(),
      value.mode,
      value.digest.toString('hex'),
    ]);
  try {
    await fs.promises.writeFile(temporary, JSON.stringify({ schemaVersion: 1, files: rows }) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    await fs.promises.rename(temporary, file);
    await syncDirectory(path.dirname(file));
  } catch {
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function readOwner(file: string): Promise<Owner> {
  const stat = await fs.promises.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Invalid Harmony lock: ${file}`);
  const owner: Owner = JSON.parse(await fs.promises.readFile(file, 'utf8'));
  if (owner.schemaVersion !== 1 || !Number.isInteger(owner.pid) || owner.pid < 1 || !/^[a-f0-9]{32}$/.test(owner.token)) {
    throw new Error(`Invalid Harmony lock owner: ${file}`);
  }
  return owner;
}

function isAlive(pid: number) {
  try { process.kill(pid, 0); return true; }
  catch (error: any) { if (error.code === 'ESRCH') return false; return true; }
}

async function releaseLock(file: string, owner: Owner) {
  if (await exists(file) && (await readOwner(file)).token === owner.token) await fs.promises.unlink(file);
}

// A fully written owner is linked atomically. Token-specific recovery claims
// serialize stale-lock removal without stealing a new live generator's lock.
async function claimLock(
  file: string,
  ownerFile: string,
  owner: Owner,
  recover?: (previous: Owner) => Promise<void>,
  depth = 0
): Promise<void> {
  if (depth > 16) throw new Error('Too many interrupted Harmony lock recoveries');
  for (let attempt = 0; attempt < 16; attempt++) {
    try { await fs.promises.link(ownerFile, file); return; }
    catch (error: any) { if (error.code !== 'EEXIST') throw error; }
    let previous: Owner;
    try { previous = await readOwner(file); }
    catch (error: any) { if (error.code === 'ENOENT') continue; throw error; }
    if (isAlive(previous.pid)) throw new Error(`Harmony generation locked by running process ${previous.pid}`);
    const recoveryLock = `${file}.recover-${previous.token}`;
    await claimLock(recoveryLock, ownerFile, owner, undefined, depth + 1);
    try {
      if (!await exists(file)) continue;
      if ((await readOwner(file)).token !== previous.token) continue;
      await recover?.(previous);
      await fs.promises.unlink(file);
    } finally { await releaseLock(recoveryLock, owner); }
  }
  throw new Error('Harmony generation lock changed repeatedly; retry generation');
}

function canReuseFileHash(
  stat: fs.BigIntStats,
  previous: FileHashSnapshot,
  mode: number,
  allowMovedFile: boolean
): boolean {
  return (allowMovedFile || (stat.dev === previous.dev
    && stat.ino === previous.ino
    && stat.ctimeNs === previous.ctimeNs))
    && stat.size === previous.size
    && stat.mtimeNs === previous.mtimeNs
    && mode === previous.mode;
}

function isWithinRoot(file: string, roots?: Set<string>): boolean {
  if (!roots) return false;
  for (const root of roots) if (file === root || file.startsWith(`${root}/`)) return true;
  return false;
}

async function hashTree(
  root: string,
  includeModes = true,
  previousFiles?: Map<string, FileHashSnapshot>,
  reusableMovedRoots?: Set<string>
): Promise<TreeHash> {
  const hash = createHash('sha256');
  const files = new Map<string, FileHashSnapshot>();
  async function visit(directory: string, prefix: string) {
    const entries = (await fs.promises.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    // Bound open streams and retained digests, while preserving the exact journal
    // fingerprint order. Each call still reads every file independently.
    for (let offset = 0; offset < entries.length; offset += 8) {
      const batch = entries.slice(offset, offset + 8);
      const results = await Promise.allSettled(batch.map(async (entry) => {
        const absolute = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) return { link: await fs.promises.readlink(absolute) };
        if (entry.isDirectory()) return {};
        const relative = path.posix.join(prefix, entry.name);
        const stat = await fs.promises.lstat(absolute, { bigint: true });
        const mode = includeModes ? Number(stat.mode & 0o7777n) : 0;
        const previous = previousFiles?.get(relative);
        let digest: Buffer;
        if (previous && canReuseFileHash(stat, previous, mode, isWithinRoot(relative, reusableMovedRoots))) {
          digest = previous.digest;
        }
        else {
          const contentHash = createHash('sha256');
          for await (const chunk of fs.createReadStream(absolute)) contentHash.update(chunk);
          digest = contentHash.digest();
        }
        return { mode, digest, stat };
      }));
      // Settle all readers before recovery can remove or rename this tree.
      for (const result of results) if (result.status === 'rejected') throw result.reason;
      for (const [index, entry] of batch.entries()) {
        const relative = path.posix.join(prefix, entry.name);
        const result = results[index] as PromiseFulfilledResult<{
          link?: string;
          mode?: number;
          digest?: Buffer;
          stat?: fs.BigIntStats;
        }>;
        hash.update(JSON.stringify([relative, entry.isDirectory() ? 'dir' : entry.isSymbolicLink() ? 'link' : 'file']));
        if (entry.isSymbolicLink()) hash.update(result.value.link!);
        else if (entry.isDirectory()) await visit(path.join(directory, entry.name), relative);
        else {
          if (includeModes) hash.update(JSON.stringify(result.value.mode));
          hash.update(result.value.digest!);
          files.set(relative, {
            dev: result.value.stat!.dev,
            ino: result.value.stat!.ino,
            size: result.value.stat!.size,
            mtimeNs: result.value.stat!.mtimeNs,
            ctimeNs: result.value.stat!.ctimeNs,
            mode: result.value.mode!,
            digest: result.value.digest!,
          });
        }
      }
    }
  }
  await visit(root, '');
  return { digest: hash.digest('hex'), files };
}

async function hashTreeIdentity(root: string): Promise<string> {
  const hash = createHash('sha256');
  async function visit(directory: string, prefix: string) {
    const entries = (await fs.promises.readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (let offset = 0; offset < entries.length; offset += 8) {
      const batch = entries.slice(offset, offset + 8);
      const results = await Promise.allSettled(batch.map(async entry => {
        const absolute = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) return { link: await fs.promises.readlink(absolute) };
        if (entry.isDirectory()) return {};
        return { stat: await fs.promises.lstat(absolute, { bigint: true }) };
      }));
      for (const result of results) if (result.status === 'rejected') throw result.reason;
      for (const [index, entry] of batch.entries()) {
        const relative = path.posix.join(prefix, entry.name);
        const result = results[index] as PromiseFulfilledResult<{ link?: string; stat?: fs.BigIntStats }>;
        hash.update(JSON.stringify([relative, entry.isDirectory() ? 'dir' : entry.isSymbolicLink() ? 'link' : 'file']));
        if (entry.isSymbolicLink()) hash.update(result.value.link!);
        else if (entry.isDirectory()) await visit(path.join(directory, entry.name), relative);
        else {
          const stat = result.value.stat!;
          hash.update(JSON.stringify([
            stat.dev.toString(), stat.ino.toString(), stat.size.toString(),
            stat.mtimeNs.toString(), stat.ctimeNs.toString(), Number(stat.mode & 0o7777n),
          ]));
        }
      }
    }
  }
  await visit(root, '');
  return hash.digest('hex');
}

function managedPath(root: string, relative: string): string {
  if ((!relative || relative === '.' || relative.includes('\\') || path.isAbsolute(relative)
    || relative.split('/').some(part => !part || part === '.' || part === '..'))
    && relative !== '.expo-harmony-state.json') {
    throw new Error(`Invalid managed Harmony patch path: ${relative}`);
  }
  const target = path.join(root, relative);
  const normalized = path.relative(root, target);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) throw new Error(`Unsafe managed Harmony patch path: ${relative}`);
  return target;
}

function validFingerprint(value: ManagedFingerprint): boolean {
  return value?.kind === 'absent'
    || (value?.kind === 'file' && /^[a-f0-9]{64}$/.test(value.sha256)
      && Number.isInteger(value.mode) && value.mode >= 0 && value.mode <= 0o7777);
}

async function currentFingerprint(root: string, relative: string): Promise<ManagedFingerprint | { kind: 'other' }> {
  const target = managedPath(root, relative);
  let stat: fs.Stats;
  try { stat = await fs.promises.lstat(target); }
  catch (error: any) { if (error.code === 'ENOENT') return { kind: 'absent' }; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink()) return { kind: 'other' };
  const digest = createHash('sha256');
  for await (const chunk of fs.createReadStream(target)) digest.update(chunk);
  return { kind: 'file', sha256: digest.digest('hex'), mode: stat.mode & 0o7777 };
}

function sameFingerprint(
  left: ManagedFingerprint | { kind: 'other' },
  right: ManagedFingerprint
): boolean {
  return left.kind === right.kind
    && (left.kind === 'absent'
      || (left.kind === 'file' && right.kind === 'file'
        && left.sha256 === right.sha256 && left.mode === right.mode));
}

function normalizedPatchEntries(patch: ManagedPatchPlan): ManagedPatchEntry[] {
  if (!patch || !Array.isArray(patch.writes) || !Array.isArray(patch.deletes)
    || !patch.entries || typeof patch.entries !== 'object') throw new Error('Invalid managed Harmony patch');
  const writes = new Set(patch.writes);
  const deletes = new Set(patch.deletes);
  const paths = [...new Set([...writes, ...deletes])].sort();
  if (paths.length !== writes.size + deletes.size) throw new Error('Managed Harmony patch paths overlap');
  for (const relative of paths) {
    managedPath('/', relative);
    const entry = patch.entries[relative];
    if (!entry || !validFingerprint(entry.before) || !validFingerprint(entry.after)) {
      throw new Error(`Invalid managed Harmony patch fingerprint: ${relative}`);
    }
    if ((writes.has(relative) && entry.after.kind !== 'file')
      || (deletes.has(relative) && entry.after.kind !== 'absent')) {
      throw new Error(`Managed Harmony patch action mismatch: ${relative}`);
    }
  }
  for (let index = 0; index < paths.length; index++) {
    for (let other = index + 1; other < paths.length; other++) {
      if (paths[other].startsWith(`${paths[index]}/`)) throw new Error(`Overlapping managed Harmony patch paths: ${paths[index]}`);
    }
  }
  return paths.map(relative => ({ path: relative, ...patch.entries[relative] }));
}

async function cloneFileWithMetadata(source: string, target: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  if (process.platform === 'darwin') await execFileAsync('/bin/cp', ['-c', '-p', source, target]);
  else {
    await fs.promises.copyFile(source, target, fs.constants.COPYFILE_FICLONE);
    await fs.promises.chmod(target, (await fs.promises.stat(source)).mode & 0o7777);
  }
}

async function syncParents(root: string, entries: ManagedPatchEntry[]): Promise<void> {
  const parents = new Set(entries.map(entry => path.dirname(managedPath(root, entry.path))));
  for (const directory of parents) await syncDirectory(directory);
}

async function restoreManagedPatch(projectRoot: string, workspace: string, entries: ManagedPatchEntry[]): Promise<void> {
  const harmonyRoot = path.join(projectRoot, 'harmony');
  const backupRoot = path.join(workspace, 'patch-backup');
  for (const entry of [...entries].reverse()) {
    const actual = await currentFingerprint(harmonyRoot, entry.path);
    if (sameFingerprint(actual, entry.before)) continue;
    if (!sameFingerprint(actual, entry.after)) {
      throw new Error(`Harmony managed patch recovery conflict at ${entry.path}; backup retained at ${backupRoot}`);
    }
    const target = managedPath(harmonyRoot, entry.path);
    if (entry.before.kind === 'absent') await fs.promises.rm(target, { force: true });
    else {
      const temporary = `${target}.expo-harmony-restore-${process.pid}`;
      await fs.promises.rm(temporary, { force: true });
      await cloneFileWithMetadata(managedPath(backupRoot, entry.path), temporary);
      await fs.promises.rename(temporary, target);
    }
  }
  await syncParents(harmonyRoot, entries);
}

async function commitManagedPatch({
  projectRoot,
  workspace,
  stage,
  journal,
  journalPath,
  patch,
  fault,
}: {
  projectRoot: string;
  workspace: string;
  stage: string;
  journal: Journal;
  journalPath: string;
  patch: ManagedPatchPlan;
  fault?: (point: HarmonyGenerationFaultPoint) => Promise<void>;
}): Promise<void> {
  const harmonyRoot = path.join(projectRoot, 'harmony');
  const backupRoot = path.join(workspace, 'patch-backup');
  const entries = normalizedPatchEntries(patch);
  for (const entry of entries) {
    const actual = await currentFingerprint(harmonyRoot, entry.path);
    if (!sameFingerprint(actual, entry.before)) throw new Error(`Harmony managed patch conflict at ${entry.path}`);
    if (entry.before.kind === 'file') {
      await cloneFileWithMetadata(managedPath(harmonyRoot, entry.path), managedPath(backupRoot, entry.path));
    }
    if (entry.after.kind === 'file') {
      const prepared = await currentFingerprint(stage, entry.path);
      if (!sameFingerprint(prepared, entry.after)) throw new Error(`Harmony managed patch candidate changed at ${entry.path}`);
    }
  }
  journal.operation = 'managed-patch';
  journal.patch = entries;
  journal.phase = 'PATCH_PREPARED';
  await writeJSON(journalPath, journal);
  await fault?.('after-backup');

  for (const entry of entries) {
    const actual = await currentFingerprint(harmonyRoot, entry.path);
    if (!sameFingerprint(actual, entry.before)) throw new Error(`Harmony managed patch conflict before install at ${entry.path}`);
    const target = managedPath(harmonyRoot, entry.path);
    if (entry.after.kind === 'absent') await fs.promises.rm(target, { force: true });
    else {
      const temporary = `${target}.expo-harmony-install-${process.pid}`;
      await fs.promises.rm(temporary, { force: true });
      await cloneFileWithMetadata(managedPath(stage, entry.path), temporary);
      await fs.promises.rename(temporary, target);
    }
  }
  await syncParents(harmonyRoot, entries);
  journal.phase = 'PATCHED';
  await writeJSON(journalPath, journal);
  await fault?.('after-install');
  for (const entry of entries) {
    const actual = await currentFingerprint(harmonyRoot, entry.path);
    if (!sameFingerprint(actual, entry.after)) throw new Error(`Harmony managed patch verification failed at ${entry.path}`);
  }
  journal.phase = 'COMMITTED';
  await writeJSON(journalPath, journal);
}

function backupPath(projectRoot: string, workspace: string, token: string, preserve: boolean) {
  return preserve ? path.join(projectRoot, '.expo/harmony-backups', token, 'harmony') : path.join(workspace, 'backup');
}

async function recoverWorkspace(projectRoot: string, transactionRoot: string, owner: Owner) {
  const workspace = path.join(transactionRoot, owner.token);
  if (!await exists(workspace)) return;
  await assertDirectory(workspace);
  const journalPath = path.join(workspace, 'journal.json');
  if (!await exists(journalPath)) {
    await fs.promises.rm(workspace, { recursive: true, force: true });
    return;
  }
  const journal: Journal = JSON.parse(await fs.promises.readFile(journalPath, 'utf8'));
  if (journal.schemaVersion !== 1 || (journal.hashVersion !== undefined && journal.hashVersion !== 2) || !['GENERATING', 'PREPARED', 'BACKED_UP', 'INSTALLED', 'PATCH_PREPARED', 'PATCHED', 'COMMITTED'].includes(journal.phase)
    || typeof journal.hadTarget !== 'boolean' || typeof journal.preserveBackup !== 'boolean') {
    throw new Error(`Invalid Harmony recovery journal: ${journalPath}`);
  }
  if (journal.operation === 'managed-patch') {
    if (!Array.isArray(journal.patch) || journal.patch.some(entry => !entry || typeof entry.path !== 'string'
      || !validFingerprint(entry.before) || !validFingerprint(entry.after))) {
      throw new Error(`Invalid Harmony managed patch journal: ${journalPath}`);
    }
    if (journal.phase !== 'COMMITTED') await restoreManagedPatch(projectRoot, workspace, journal.patch);
    await fs.promises.rm(workspace, { recursive: true, force: true });
    await syncDirectory(projectRoot);
    return;
  }
  const target = path.join(projectRoot, 'harmony');
  const backup = backupPath(projectRoot, workspace, owner.token, journal.preserveBackup);
  await mkdirSafe(path.dirname(backup), projectRoot);
  if (journal.phase !== 'COMMITTED') {
    const hasBackup = await exists(backup);
    if (hasBackup || !journal.hadTarget) {
      if (await exists(target)) {
        await assertDirectory(target);
        if (!journal.candidateHash || (await hashTree(target, journal.hashVersion === 2)).digest !== journal.candidateHash) {
          throw new Error(`Harmony recovery conflict: current project changed after interruption; backup retained at ${backup}`);
        }
        await fs.promises.rm(target, { recursive: true });
      }
      if (hasBackup) {
        await assertDirectory(backup);
        await fs.promises.rename(backup, target);
      }
    }
  }
  await fs.promises.rm(workspace, { recursive: true, force: true });
  await syncDirectory(projectRoot);
}

export async function runHarmonyGenerationTransactionAsync<T>(options: {
  projectRoot: string;
  clean?: boolean;
  prepareOnly?: boolean;
  generate: (stageRoot: string, hash: HarmonyGenerationHashContext) => Promise<T>;
  validate?: (stageRoot: string) => Promise<void>;
  fault?: (point: HarmonyGenerationFaultPoint) => Promise<void>;
}): Promise<{ value: T; harmonyRoot: string; backupPath?: string }> {
  const projectRoot = await fs.promises.realpath(options.projectRoot);
  const harmonyRoot = path.join(projectRoot, 'harmony');
  if (await exists(harmonyRoot)) await assertDirectory(harmonyRoot);
  const transactionRoot = path.join(projectRoot, '.expo-harmony-generation');
  await mkdirSafe(transactionRoot, projectRoot);
  const owner: Owner = { schemaVersion: 1, pid: process.pid, token: randomBytes(16).toString('hex') };
  const workspace = path.join(transactionRoot, owner.token);
  await mkdirSafe(workspace, projectRoot);
  const ownerFile = path.join(workspace, 'owner.json');
  await writeJSON(ownerFile, owner);
  const lockFile = path.join(transactionRoot, 'lock.json');
  let acquired = false;
  let committed = false;
  let journal: Journal | undefined;
  try {
    await claimLock(lockFile, ownerFile, owner, previous => recoverWorkspace(projectRoot, transactionRoot, previous));
    acquired = true;
    const hadTarget = await exists(harmonyRoot);
    if (hadTarget) await assertDirectory(harmonyRoot);
    if (options.prepareOnly && hadTarget) throw new Error(`Harmony native project already exists at "${harmonyRoot}"`);
    const initialIdentity = hadTarget ? await hashTreeIdentity(harmonyRoot) : undefined;
    const hashCacheFile = path.join(transactionRoot, TREE_HASH_CACHE);
    const preserveBackup = hadTarget && (!!options.clean || !await exists(path.join(harmonyRoot, '.expo-harmony-state.json')));
    journal = { schemaVersion: 1, hashVersion: 2, phase: 'GENERATING', hadTarget, preserveBackup };
    const journalPath = path.join(workspace, 'journal.json');
    await writeJSON(journalPath, journal);
    const stage = path.join(workspace, 'stage');
    await mkdirSafe(stage, projectRoot);
    const reusableCandidateRoots = new Set<string>();
    let keepCurrentTree = false;
    let managedPatch: ManagedPatchPlan | undefined;
    const value = await options.generate(stage, { reuseClonedRoot(relativeRoot) {
      if (!relativeRoot || path.isAbsolute(relativeRoot) || relativeRoot.includes('\\')
        || relativeRoot.split('/').some(part => !part || part === '.' || part === '..')) {
        throw new Error(`Invalid cloned Harmony hash root: ${relativeRoot}`);
      }
      reusableCandidateRoots.add(relativeRoot);
    }, reuseCurrentTree() {
      if (!hadTarget || options.clean) throw new Error('Cannot reuse a missing or clean Harmony tree');
      keepCurrentTree = true;
    }, applyManagedPatch(patch) {
      if (!hadTarget || options.clean) throw new Error('Cannot patch a missing or clean Harmony tree');
      managedPatch = patch;
    } });
    await options.fault?.('after-generate');
    await options.validate?.(stage);
    await options.fault?.('after-validate');
    await assertDirectory(stage);
    if (keepCurrentTree) {
      return { value, harmonyRoot };
    }
    if (managedPatch) {
      if (reusableCandidateRoots.size) throw new Error('Managed Harmony patch cannot also replace cloned roots');
      await commitManagedPatch({ projectRoot, workspace, stage, journal, journalPath, patch: managedPatch, fault: options.fault });
      committed = true;
      await fs.promises.rm(hashCacheFile, { force: true });
      return { value, harmonyRoot };
    }
    if (hadTarget && await hashTreeIdentity(harmonyRoot) !== initialIdentity) {
      throw new Error('Harmony generation conflict: existing project changed during generation; retry after saving your edits');
    }
    const cachedFiles = hadTarget ? await readTreeHashCache(hashCacheFile) : undefined;
    const initialTree = hadTarget ? await hashTree(harmonyRoot, true, cachedFiles) : undefined;
    const initialHash = initialTree?.digest;
    const candidateTree = await hashTree(stage, true, initialTree?.files, reusableCandidateRoots);
    journal.candidateHash = candidateTree.digest;
    if (hadTarget && (await hashTree(harmonyRoot, true, initialTree!.files)).digest !== initialHash) {
      throw new Error('Harmony generation conflict: existing project changed during generation; retry after saving your edits');
    }
    if (hadTarget && !options.clean && initialHash === journal.candidateHash) {
      await writeTreeHashCache(hashCacheFile, initialTree!.files);
      return { value, harmonyRoot };
    }
    journal.phase = 'PREPARED';
    await writeJSON(journalPath, journal);
    const backup = backupPath(projectRoot, workspace, owner.token, preserveBackup);
    if (hadTarget) {
      await mkdirSafe(path.dirname(backup), projectRoot);
      await fs.promises.rename(harmonyRoot, backup);
      await syncDirectory(projectRoot);
      if ((await hashTree(backup, true, initialTree!.files)).digest !== initialHash) {
        throw new Error('Harmony generation conflict: existing project changed before commit');
      }
    }
    journal.phase = 'BACKED_UP';
    await writeJSON(journalPath, journal);
    await options.fault?.('after-backup');
    await fs.promises.rename(stage, harmonyRoot);
    await syncDirectory(projectRoot);
    journal.phase = 'INSTALLED';
    await writeJSON(journalPath, journal);
    await options.fault?.('after-install');
    if (hadTarget && (await hashTree(backup, true, initialTree!.files)).digest !== initialHash) {
      throw new Error('Harmony generation conflict: previous project changed during commit');
    }
    journal.phase = 'COMMITTED';
    await writeJSON(journalPath, journal);
    committed = true;
    await writeTreeHashCache(hashCacheFile, candidateTree.files);
    return { value, harmonyRoot, ...(preserveBackup ? { backupPath: backup } : {}) };
  } catch (error) {
    if (acquired && journal && !committed) {
      // Keep the original error only after recovery has restored a complete tree.
      try { await recoverWorkspace(projectRoot, transactionRoot, owner); }
      catch (recoveryError) {
        acquired = false;
        throw new Error(`Harmony generation recovery failed; transaction retained at ${workspace}: ${String(recoveryError)}; original error: ${String(error)}`);
      }
    }
    throw error;
  } finally {
    if (acquired) {
      await fs.promises.rm(workspace, { recursive: true, force: true });
      await releaseLock(lockFile, owner);
    } else if (!journal) {
      await fs.promises.rm(workspace, { recursive: true, force: true });
    }
  }
}
