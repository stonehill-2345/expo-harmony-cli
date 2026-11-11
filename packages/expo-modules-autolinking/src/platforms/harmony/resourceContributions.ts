import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

export type HarmonyResourceContribution = {
  owner: string;
  packageName: string;
  packageVersion: string;
  target: string;
  sha256: string;
} & ({ source: string; contents?: never } | { contents: string; source?: never });

const RAW_FILES = 'entry/src/main/resources/rawfile/';

function relative(value: string): void {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || /[\\\x00-\x1f]/.test(value)
    || value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Harmony resource requires a normalized relative path: ${value}`);
  }
}

async function regularFile(root: string, name: string): Promise<boolean> {
  let current = root;
  for (const part of ['', ...name.split('/')]) {
    current = path.join(current, part);
    let stat: fs.Stats;
    try { stat = await fs.promises.lstat(current); }
    catch (error: any) { if (error.code === 'ENOENT') return false; throw error; }
    if (stat.isSymbolicLink()) throw new Error(`Harmony resource rejects symbolic links: ${current}`);
    if (current === path.join(root, name) ? !stat.isFile() : !stat.isDirectory()) {
      throw new Error(`Invalid Harmony resource path: ${current}`);
    }
  }
  return true;
}

export async function stageHarmonyResourcesAsync({ projectRoot, stageRoot, currentRoot, resources = [], clean = false }: {
  projectRoot: string;
  stageRoot: string;
  currentRoot: string;
  resources?: HarmonyResourceContribution[];
  clean?: boolean;
}): Promise<Record<string, string>> {
  if (!Array.isArray(resources)) throw new Error('Harmony resources must be an array');
  const root = await fs.promises.realpath(projectRoot);
  const stateFile = '.expo-harmony-state.json';
  const previous = !clean && await regularFile(currentRoot, stateFile)
    ? JSON.parse(await fs.promises.readFile(path.join(currentRoot, stateFile), 'utf8')) : undefined;
  const planned = new Map<string, { resource: HarmonyResourceContribution; bytes: Buffer }>();
  for (const resource of resources) {
    if (!resource || typeof resource.owner !== 'string' || !/^[a-z][a-z0-9-]*$/.test(resource.owner)
      || typeof resource.packageName !== 'string' || !resource.packageName
      || typeof resource.packageVersion !== 'string' || !resource.packageVersion
      || typeof resource.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(resource.sha256)) {
      throw new Error('Invalid Harmony resource owner, package identity or SHA-256');
    }
    relative(resource.target);
    const output = `${RAW_FILES}${resource.owner}/${resource.target}`;
    if (planned.has(output)) throw new Error(`Harmony resource collision: ${output}`);
    const hasSource = Object.prototype.hasOwnProperty.call(resource, 'source');
    const hasContents = Object.prototype.hasOwnProperty.call(resource, 'contents');
    if (hasSource === hasContents) throw new Error(`Harmony resource must provide source or contents: ${output}`);
    let bytes: Buffer;
    if (hasSource) {
      relative(resource.source!);
      if (!await regularFile(root, resource.source!)) throw new Error(`Harmony resource source is missing: ${resource.source}`);
      const input = await fs.promises.open(path.join(root, resource.source!), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try { bytes = await input.readFile(); } finally { await input.close(); }
    } else {
      if (typeof resource.contents !== 'string') throw new Error(`Invalid Harmony resource contents: ${output}`);
      bytes = Buffer.from(resource.contents);
    }
    if (!bytes.length || createHash('sha256').update(bytes).digest('hex') !== resource.sha256) {
      throw new Error(`Harmony resource content hash mismatch or empty input: ${output}`);
    }
    if (!clean && await regularFile(currentRoot, output) && previous?.files?.[output]?.owner !== resource.owner) {
      throw new Error(`Harmony resource conflicts with an unowned file or another owner: ${output}`);
    }
    planned.set(output, { resource, bytes });
  }
  const owners: Record<string, string> = Object.create(null);
  const records = [];
  for (const [output, { resource, bytes }] of [...planned].sort(([a], [b]) => a.localeCompare(b))) {
    const destination = path.join(stageRoot, output);
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await fs.promises.writeFile(destination, bytes, { flag: 'wx' });
    owners[output] = resource.owner;
    records.push({ owner: resource.owner, packageName: resource.packageName, packageVersion: resource.packageVersion,
      ...(resource.source ? { source: resource.source } : {}), target: output, sha256: resource.sha256 });
  }
  await fs.promises.writeFile(path.join(stageRoot, '.expo-harmony-resources.json'), JSON.stringify({ schemaVersion: 1, resources: records }, null, 2) + '\n', { flag: 'wx' });
  return owners;
}
