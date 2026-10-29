import fs from 'fs';
import path from 'path';
import { createHash, randomBytes } from 'crypto';

export type HarmonyGenerationFaultPoint =
  | 'after-generate' | 'after-validate' | 'after-backup' | 'after-install';

interface Owner { schemaVersion: 1; pid: number; token: string }
interface Journal {
  schemaVersion: 1;
  hashVersion?: 2;
  phase: 'GENERATING' | 'PREPARED' | 'BACKED_UP' | 'INSTALLED' | 'COMMITTED';
  hadTarget: boolean;
  preserveBackup: boolean;
  candidateHash?: string;
}

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

async function hashTree(root: string, includeModes = true): Promise<string> {
  const hash = createHash('sha256');
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
        const mode = includeModes ? (await fs.promises.lstat(absolute)).mode & 0o7777 : undefined;
        const digest = createHash('sha256');
        for await (const chunk of fs.createReadStream(absolute)) digest.update(chunk);
        return { mode, digest: digest.digest() };
      }));
      // Settle all readers before recovery can remove or rename this tree.
      for (const result of results) if (result.status === 'rejected') throw result.reason;
      for (const [index, entry] of batch.entries()) {
        const relative = path.posix.join(prefix, entry.name);
        const result = results[index] as PromiseFulfilledResult<{ link?: string; mode?: number; digest?: Buffer }>;
        hash.update(JSON.stringify([relative, entry.isDirectory() ? 'dir' : entry.isSymbolicLink() ? 'link' : 'file']));
        if (entry.isSymbolicLink()) hash.update(result.value.link!);
        else if (entry.isDirectory()) await visit(path.join(directory, entry.name), relative);
        else {
          if (includeModes) hash.update(JSON.stringify(result.value.mode));
          hash.update(result.value.digest!);
        }
      }
    }
  }
  await visit(root, '');
  return hash.digest('hex');
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
  if (journal.schemaVersion !== 1 || (journal.hashVersion !== undefined && journal.hashVersion !== 2) || !['GENERATING', 'PREPARED', 'BACKED_UP', 'INSTALLED', 'COMMITTED'].includes(journal.phase)
    || typeof journal.hadTarget !== 'boolean' || typeof journal.preserveBackup !== 'boolean') {
    throw new Error(`Invalid Harmony recovery journal: ${journalPath}`);
  }
  const target = path.join(projectRoot, 'harmony');
  const backup = backupPath(projectRoot, workspace, owner.token, journal.preserveBackup);
  await mkdirSafe(path.dirname(backup), projectRoot);
  if (journal.phase !== 'COMMITTED') {
    const hasBackup = await exists(backup);
    if (hasBackup || !journal.hadTarget) {
      if (await exists(target)) {
        await assertDirectory(target);
        if (!journal.candidateHash || await hashTree(target, journal.hashVersion === 2) !== journal.candidateHash) {
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
  generate: (stageRoot: string) => Promise<T>;
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
    const initialHash = hadTarget ? await hashTree(harmonyRoot) : undefined;
    if (options.prepareOnly && hadTarget) throw new Error(`Harmony native project already exists at "${harmonyRoot}"`);
    const preserveBackup = hadTarget && (!!options.clean || !await exists(path.join(harmonyRoot, '.expo-harmony-state.json')));
    journal = { schemaVersion: 1, hashVersion: 2, phase: 'GENERATING', hadTarget, preserveBackup };
    const journalPath = path.join(workspace, 'journal.json');
    await writeJSON(journalPath, journal);
    const stage = path.join(workspace, 'stage');
    await mkdirSafe(stage, projectRoot);
    const value = await options.generate(stage);
    await options.fault?.('after-generate');
    await options.validate?.(stage);
    await options.fault?.('after-validate');
    await assertDirectory(stage);
    journal.candidateHash = await hashTree(stage);
    if (hadTarget && await hashTree(harmonyRoot) !== initialHash) {
      throw new Error('Harmony generation conflict: existing project changed during generation; retry after saving your edits');
    }
    if (hadTarget && !options.clean && initialHash === journal.candidateHash) {
      return { value, harmonyRoot };
    }
    journal.phase = 'PREPARED';
    await writeJSON(journalPath, journal);
    const backup = backupPath(projectRoot, workspace, owner.token, preserveBackup);
    if (hadTarget) {
      await mkdirSafe(path.dirname(backup), projectRoot);
      await fs.promises.rename(harmonyRoot, backup);
      await syncDirectory(projectRoot);
      if (await hashTree(backup) !== initialHash) {
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
    if (hadTarget && await hashTree(backup) !== initialHash) {
      throw new Error('Harmony generation conflict: previous project changed during commit');
    }
    journal.phase = 'COMMITTED';
    await writeJSON(journalPath, journal);
    committed = true;
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
