import { createHash } from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import JSON5 from 'json5';
import path from 'path';
import { promisify } from 'util';

const STATE_FILE = '.expo-harmony-state.json';
const ABSENT = Symbol('absent');
const execFileAsync = promisify(execFile);
const PRESERVED_CACHE_ROOTS = ['.hvigor', 'entry/.cxx', 'entry/build', 'oh_modules'];
type JsonValue = any;
type FileState = { sha256: string; owner: string; json?: JsonValue };
type GenerationState = { schemaVersion: 1; files: Record<string, FileState> };

async function clonePreservedTree(source: string, target: string): Promise<void> {
  try {
    await execFileAsync('/bin/cp', ['-c', '-p', '-R', source, target]);
  } catch (error: any) {
    if (error?.code !== 'EXDEV' && !/Cross-device link/i.test(String(error?.stderr ?? error))) throw error;
    await fs.promises.rm(target, { recursive: true, force: true });
    await execFileAsync('/bin/cp', ['-p', '-R', source, target]);
  }
}

function ordered(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])]));
  }
  return value;
}

function serialize(value: JsonValue): string {
  return JSON.stringify(ordered(value), null, 2) + '\n';
}

function equal(a: JsonValue, b: JsonValue): boolean {
  if (a === ABSENT || b === ABSENT) return a === b;
  return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
}

function isObject(value: JsonValue): boolean {
  return value !== ABSENT && value !== null && typeof value === 'object' && !Array.isArray(value);
}

function conflict(location: string): never {
  throw new Error(`Harmony generation conflict at ${location}; preserve your changes or restore the previous generated value before regenerating`);
}

function arrayKey(value: JsonValue): string {
  return isObject(value) && typeof value.name === 'string'
    ? `name:${value.name}`
    : `value:${JSON.stringify(ordered(value))}`;
}

function keyed(values: JsonValue[], location: string): Map<string, JsonValue> {
  const items = new Map<string, JsonValue>();
  for (const value of values) {
    const key = arrayKey(value);
    if (items.has(key)) throw new Error(`Duplicate Harmony JSON array key at ${location}: ${key}`);
    items.set(key, value);
  }
  return items;
}

// Recurse through objects and keyed arrays so ownership stops at generated fields/items.
function mergeJson(previous: JsonValue, current: JsonValue, desired: JsonValue, location: string): JsonValue {
  if (equal(current, previous) || equal(current, desired)) return desired;
  if (isObject(current) && (isObject(previous) || previous === ABSENT) && (isObject(desired) || desired === ABSENT)) {
    const result: Record<string, JsonValue> = Object.create(null);
    for (const key of [...new Set([...Object.keys(previous === ABSENT ? {} : previous), ...Object.keys(current), ...Object.keys(desired === ABSENT ? {} : desired)])].sort()) {
      const get = (value: JsonValue) => value !== ABSENT && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : ABSENT;
      const merged = mergeJson(get(previous), get(current), get(desired), `${location}.${key}`);
      if (merged !== ABSENT) result[key] = merged;
    }
    return Object.keys(result).length || desired !== ABSENT ? result : ABSENT;
  }
  if (Array.isArray(current) && (Array.isArray(previous) || previous === ABSENT) && (Array.isArray(desired) || desired === ABSENT)) {
    const before = keyed(previous === ABSENT ? [] : previous, location);
    const present = keyed(current, location);
    const after = keyed(desired === ABSENT ? [] : desired, location);
    const result: JsonValue[] = [];
    const keys = [...new Set([...after.keys(), ...present.keys(), ...before.keys()])];
    for (const key of keys) {
      const merged = mergeJson(before.has(key) ? before.get(key) : ABSENT, present.has(key) ? present.get(key) : ABSENT, after.has(key) ? after.get(key) : ABSENT, `${location}[${key}]`);
      if (merged !== ABSENT) result.push(merged);
    }
    return result.length || desired !== ABSENT ? result : ABSENT;
  }
  if (equal(previous, desired)) return current;
  return conflict(location);
}

function assertRelative(file: string): void {
  if (!file || file === STATE_FILE || path.isAbsolute(file) || file.includes('\\') || file.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Harmony generation state requires a normalized relative path: ${file}`);
  }
}

type FileContent = { path?: string; contents?: Buffer; digest?: string; stat?: fs.Stats };
type ManagedFingerprint =
  | { kind: 'absent' }
  | { kind: 'file'; sha256: string; mode: number };
export type HarmonyManagedPatch = {
  writes: string[];
  deletes: string[];
  entries: Record<string, { before: ManagedFingerprint; after: ManagedFingerprint }>;
};

// Inventory only: build outputs and unknown user files must never accumulate in memory.
async function readTree(root: string, links?: Map<string, string>): Promise<Map<string, FileContent>> {
  const files = new Map<string, FileContent>();
  if (!fs.existsSync(root)) return files;
  async function visit(directory: string): Promise<void> {
    const stat = await fs.promises.lstat(directory);
    if (stat.isSymbolicLink()) throw new Error(`Harmony generation rejects symbolic links: ${directory}`);
    if (!stat.isDirectory()) throw new Error(`Harmony generation root must be a directory: ${directory}`);
    for (const entry of (await fs.promises.readdir(directory)).sort()) {
      const absolute = path.join(directory, entry);
      const info = await fs.promises.lstat(absolute);
      if (info.isSymbolicLink()) {
        if (!links) throw new Error(`Harmony generation rejects symbolic links: ${absolute}`);
        links.set(path.relative(root, absolute).split(path.sep).join('/'), await fs.promises.readlink(absolute));
      } else if (info.isDirectory()) await visit(absolute);
      else if (info.isFile()) {
        const relative = path.relative(root, absolute).split(path.sep).join('/');
        files.set(relative, { path: absolute, stat: info });
      }
      else throw new Error(`Unsupported Harmony generation file: ${absolute}`);
    }
  }
  await visit(root);
  return files;
}

async function contents(file: FileContent): Promise<Buffer> {
  return file.contents ??= await fs.promises.readFile(file.path!);
}

function generated(value: JsonValue): FileContent {
  return { contents: Buffer.from(serialize(value)) };
}

async function hash(file: FileContent): Promise<string> {
  if (file.digest) return file.digest;
  const digest = createHash('sha256');
  if (file.contents) digest.update(file.contents);
  else for await (const chunk of fs.createReadStream(file.path!)) digest.update(chunk);
  return file.digest = digest.digest('hex');
}

function readState(contents: Buffer | undefined): GenerationState | undefined {
  if (!contents) return undefined;
  const state = JSON5.parse(contents.toString('utf8'));
  if (state?.schemaVersion !== 1 || !isObject(state.files)) throw new Error('Unsupported Harmony generation state schema');
  for (const [file, value] of Object.entries(state.files) as [string, FileState][]) {
    assertRelative(file);
    if (!value || !/^[a-f0-9]{64}$/.test(value.sha256) || typeof value.owner !== 'string' || !value.owner) {
      throw new Error(`Invalid Harmony generation state for relative path: ${file}`);
    }
  }
  return state;
}

async function mergeManagedFiles(
  desired: Map<string, FileContent>,
  current: Map<string, FileContent>,
  previous: GenerationState | undefined,
  state: GenerationState,
  clean: boolean
): Promise<Map<string, FileContent>> {
  const result = new Map<string, FileContent>();
  for (const file of [...new Set([...desired.keys(), ...current.keys(), ...Object.keys(previous?.files ?? {})])].sort()) {
    const after = desired.get(file);
    const present = clean ? undefined : current.get(file);
    const before = !clean && previous && Object.prototype.hasOwnProperty.call(previous.files, file) ? previous.files[file] : undefined;
    if (clean || !present) {
      if (!clean && before && after && before.sha256 !== await hash(after)) conflict(file);
      if (after && (clean || !before)) result.set(file, after);
      continue;
    }
    if (!before) {
      if (!after) result.set(file, present);
      else if (!previous) {
        // Legacy projects have no proof of ownership. Keep overlapping user values.
        if (state.files[file].json !== undefined) {
          const existing = JSON5.parse((await contents(present)).toString('utf8'));
          const legacyMerge = (generated: JsonValue, user: JsonValue): JsonValue => {
            if (isObject(generated) && isObject(user)) {
              const value = Object.assign(Object.create(null), generated);
              for (const key of Object.keys(user)) value[key] = Object.prototype.hasOwnProperty.call(generated, key) ? legacyMerge(generated[key], user[key]) : user[key];
              return value;
            }
            return user;
          };
          result.set(file, generated(legacyMerge(state.files[file].json, existing)));
        } else result.set(file, present);
      } else if (await hash(present) === await hash(after)) result.set(file, after);
      else if (state.files[file].json !== undefined) result.set(file, generated(mergeJson(ABSENT, JSON5.parse((await contents(present)).toString('utf8')), state.files[file].json, file)));
      else conflict(file);
      continue;
    }
    if (before.json !== undefined) {
      const merged = mergeJson(before.json, JSON5.parse((await contents(present)).toString('utf8')), after ? state.files[file].json : ABSENT, file);
      if (merged !== ABSENT) result.set(file, generated(merged));
    } else if (await hash(present) === before.sha256) {
      if (after) result.set(file, after);
    } else if (after && before.sha256 === await hash(after)) result.set(file, present);
    else if (after && await hash(present) === await hash(after)) result.set(file, after);
    else conflict(file);
  }
  return result;
}

async function readManagedFiles(root: string, files: string[]): Promise<Map<string, FileContent>> {
  const result = new Map<string, FileContent>();
  for (const file of [...new Set(files)].sort()) {
    assertRelative(file);
    let current = root;
    const parts = file.split('/');
    for (let index = 0; index < parts.length; index++) {
      current = path.join(current, parts[index]);
      let stat: fs.Stats;
      try { stat = await fs.promises.lstat(current); }
      catch (error: any) { if (error.code === 'ENOENT') break; throw error; }
      if (stat.isSymbolicLink()) throw new Error(`Harmony generation rejects symbolic links at managed paths: ${current}`);
      if (index < parts.length - 1) {
        if (!stat.isDirectory()) break;
      } else if (stat.isFile()) result.set(file, { path: current, stat });
      else if (!stat.isDirectory()) throw new Error(`Unsupported Harmony generation file: ${current}`);
    }
  }
  return result;
}

async function fingerprint(content: FileContent | undefined): Promise<ManagedFingerprint> {
  return content
    ? { kind: 'file', sha256: await hash(content), mode: content.stat?.mode ? content.stat.mode & 0o7777 : 0o644 }
    : { kind: 'absent' };
}

async function prepareManagedPatch({
  stageRoot,
  staged,
  desired,
  currentRoot,
  previous,
  state,
  stateContent,
}: {
  stageRoot: string;
  staged: Map<string, FileContent>;
  desired: Map<string, FileContent>;
  currentRoot: string;
  previous: GenerationState;
  state: GenerationState;
  stateContent: FileContent;
}): Promise<HarmonyManagedPatch> {
  const managed = [...new Set([...desired.keys(), ...Object.keys(previous.files)])];
  const current = await readManagedFiles(currentRoot, managed);
  const result = await mergeManagedFiles(desired, current, previous, state, false);
  const writes: string[] = [];
  const deletes: string[] = [];
  const entries: HarmonyManagedPatch['entries'] = Object.create(null);

  for (const file of managed.sort()) {
    const present = current.get(file);
    const content = result.get(file);
    if (!content) {
      if (present) {
        deletes.push(file);
        entries[file] = { before: await fingerprint(present), after: { kind: 'absent' } };
      }
      continue;
    }
    if (content === present || (present && await hash(present) === await hash(content))) continue;
    const target = path.join(stageRoot, file);
    const original = staged.get(file);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    if (content !== original && (!original || await hash(original) !== await hash(content))) {
      if (content.contents) await fs.promises.writeFile(target, content.contents);
      else await fs.promises.copyFile(content.path!, target, fs.constants.COPYFILE_FICLONE);
    }
    const mode = present?.stat ? present.stat.mode & 0o7777 : (await fs.promises.stat(target)).mode & 0o7777;
    await fs.promises.chmod(target, mode);
    const prepared = { path: target, stat: await fs.promises.stat(target) };
    writes.push(file);
    entries[file] = { before: await fingerprint(present), after: await fingerprint(prepared) };
  }

  const statePath = path.join(currentRoot, STATE_FILE);
  let currentState: FileContent | undefined;
  try {
    const stat = await fs.promises.lstat(statePath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Harmony generation state must be a regular file');
    currentState = { path: statePath, stat };
  } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
  const nextStatePath = path.join(stageRoot, STATE_FILE);
  await fs.promises.writeFile(nextStatePath, await contents(stateContent), {
    mode: currentState?.stat ? currentState.stat.mode & 0o7777 : undefined,
  });
  const nextState = { path: nextStatePath, stat: await fs.promises.stat(nextStatePath) };
  if (!currentState || await hash(currentState) !== await hash(nextState)) {
    writes.push(STATE_FILE);
    entries[STATE_FILE] = { before: await fingerprint(currentState), after: await fingerprint(nextState) };
  }
  return { writes, deletes, entries };
}

export async function mergeHarmonyGenerationStateAsync({
  stageRoot,
  currentRoot,
  clean = false,
  owners = {},
  detectUnchanged = false,
}: {
  stageRoot: string;
  currentRoot?: string;
  clean?: boolean;
  owners?: Record<string, string>;
  detectUnchanged?: boolean;
}): Promise<{ clonedRoots: string[]; unchanged: boolean; managedPatch?: HarmonyManagedPatch }> {
  const desired = await readTree(stageRoot);
  const staged = new Map(desired);
  desired.delete(STATE_FILE);
  const state: GenerationState = { schemaVersion: 1, files: Object.create(null) };

  for (const file of [...desired.keys()].sort()) {
    assertRelative(file);
    const content = desired.get(file)!;
    const json = /\.json5?$/.test(file) && !file.startsWith('entry/src/main/resources/rawfile/') ? JSON5.parse((await contents(content)).toString('utf8')) : undefined;
    const canonical = json === undefined ? content : generated(json);
    desired.set(file, canonical);
    const owner = Object.prototype.hasOwnProperty.call(owners, file) ? owners[file] : 'expo-harmony';
    state.files[file] = { sha256: await hash(canonical), owner, ...(json === undefined ? {} : { json: ordered(json) }) };
  }

  if (detectUnchanged && !clean && currentRoot) {
    const statePath = path.join(currentRoot, STATE_FILE);
    try {
      const stateStat = await fs.promises.lstat(statePath);
      if (stateStat.isSymbolicLink()) throw new Error('Harmony generation state must not be a symbolic link');
      if (stateStat.isFile()) {
        const previous = readState(await fs.promises.readFile(statePath));
        if (previous && equal(previous, state)) {
          for (const file of Object.keys(state.files)) {
            let current = currentRoot;
            for (const part of file.split('/')) {
              current = path.join(current, part);
              let stat: fs.Stats;
              try { stat = await fs.promises.lstat(current); }
              catch (error: any) { if (error.code === 'ENOENT') break; throw error; }
              if (stat.isSymbolicLink()) {
                throw new Error(`Harmony generation rejects symbolic links at managed paths: ${current}`);
              }
              if (!stat.isDirectory() && current !== path.join(currentRoot, file)) break;
            }
          }
          return { clonedRoots: [], unchanged: true };
        }
        if (previous) {
          const stateContent = generated(state);
          return {
            clonedRoots: [],
            unchanged: false,
            managedPatch: await prepareManagedPatch({
              stageRoot,
              staged,
              desired,
              currentRoot,
              previous,
              state,
              stateContent,
            }),
          };
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  const links = new Map<string, string>();
  const current = currentRoot ? await readTree(currentRoot, links) : new Map<string, FileContent>();
  if (links.has(STATE_FILE)) throw new Error('Harmony generation state must not be a symbolic link');
  const previousFile = current.get(STATE_FILE);
  const previous = readState(previousFile ? await contents(previousFile) : undefined);
  current.delete(STATE_FILE);

  for (const link of links.keys()) {
    assertRelative(link);
    if (!clean && [...desired.keys(), ...Object.keys(previous?.files ?? {})].some((file) => file === link || file.startsWith(`${link}/`) || link.startsWith(`${file}/`))) {
      throw new Error(`Harmony generation rejects symbolic links at managed paths: ${link}`);
    }
  }

  const result = await mergeManagedFiles(desired, current, previous, state, clean);

  // Node's utimes uses Date/microsecond precision and invalidates Ninja's nanosecond deps log.
  // Clone only known generated caches with metadata; they remain inside all hashes and conflict checks.
  const clonedCacheRoots = new Set<string>();
  const cacheCloneRoot = path.join(stageRoot, `.expo-harmony-cache-clone-${process.pid}`);
  const isClonedCachePath = (file: string): boolean => {
    for (const root of clonedCacheRoots) {
      if (file === root || file.startsWith(`${root}/`)) return true;
    }
    return false;
  };
  try {
    if (process.platform === 'darwin' && !clean && currentRoot) {
      for (const root of PRESERVED_CACHE_ROOTS) {
        const source = path.join(currentRoot, root);
        if (!fs.existsSync(source)) continue;
        const temporary = path.join(cacheCloneRoot, root);
        await fs.promises.mkdir(path.dirname(temporary), { recursive: true });
        await clonePreservedTree(source, temporary);
        clonedCacheRoots.add(root);
      }
      for (const root of clonedCacheRoots) {
        const target = path.join(stageRoot, root);
        await fs.promises.rm(target, { recursive: true, force: true });
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.rename(path.join(cacheCloneRoot, root), target);
      }
      await fs.promises.rm(cacheCloneRoot, { recursive: true, force: true });
      for (const file of current.keys()) {
        if (isClonedCachePath(file) && !result.has(file)) {
          await fs.promises.rm(path.join(stageRoot, file), { force: true });
        }
      }
    }
    for (const file of staged.keys()) {
      if (!result.has(file)) await fs.promises.rm(path.join(stageRoot, file), { force: true });
    }
    for (const [file, content] of result) {
      await fs.promises.mkdir(path.dirname(path.join(stageRoot, file)), { recursive: true });
      const target = path.join(stageRoot, file);
      const present = !clean ? current.get(file) : undefined;
      const original = staged.get(file);
      const mode = present?.stat ? present.stat.mode & 0o7777 : undefined;
      // Compare bytes, never size/mtime. A descriptor's digest lives only in this merge.
      const unchanged = present && (present === content || await hash(present) === await hash(content));
      const cacheCloned = unchanged && isClonedCachePath(file);
      const mustWrite = !cacheCloned
        && original !== content
        && (!original || await hash(original) !== await hash(content));
      if (mustWrite) {
        if (content.contents) await fs.promises.writeFile(target, content.contents, { mode });
        else {
          // FICLONE falls back to an independent copy when cloning is unsupported.
          // Never use hard links: stage mutations must not reach the current tree.
          await fs.promises.copyFile(content.path!, target, fs.constants.COPYFILE_FICLONE);
        }
      }
      if (!cacheCloned) {
        // writeFile's mode applies only to new files and is masked by umask.
        if (mode !== undefined) await fs.promises.chmod(target, mode);
        if (unchanged && present?.stat) await fs.promises.utimes(target, present.stat.atime, present.stat.mtime);
      }
    }
    await fs.promises.writeFile(path.join(stageRoot, STATE_FILE), serialize(state));
    if (!clean) {
      for (const [file, target] of links) {
        if (isClonedCachePath(file)) continue;
        await fs.promises.mkdir(path.dirname(path.join(stageRoot, file)), { recursive: true });
        await fs.promises.symlink(target, path.join(stageRoot, file));
      }
    }
  } catch (error) {
    await fs.promises.rm(cacheCloneRoot, { recursive: true, force: true });
    throw error;
  }
  return { clonedRoots: [...clonedCacheRoots], unchanged: false };
}
