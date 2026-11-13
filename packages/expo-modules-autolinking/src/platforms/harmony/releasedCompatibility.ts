import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import type { HarmonyHarConfig } from '../../types';

const policy: { artifacts: Array<{
  transform: string;
  compatibilityId: string;
  packageName: string;
  packageVersion: string;
  inputSHA256: string;
  outputSHA256: string;
  file: string;
}> } = require('../../../scripts/harmony/released-compatibility.json');

type CopyOptions = {
  inputHarPath: string;
  outputHarPath: string;
  corePackageRoot: string;
};

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

async function releasedRoot(corePackageRoot: string): Promise<string> {
  const core = await fs.promises.realpath(corePackageRoot);
  for (const relative of ['harmony', 'harmony/released-compatibility']) {
    const directory = await fs.promises.realpath(path.join(core, relative));
    const fromCore = path.relative(core, directory);
    if (!fromCore || fromCore.startsWith('..') || path.isAbsolute(fromCore)) {
      throw new Error('Released compatibility directory escapes its Core package');
    }
  }
  return fs.promises.realpath(path.join(core, 'harmony/released-compatibility'));
}

async function verifiedFile(root: string, relative: string, expected?: string): Promise<Buffer> {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) {
    throw new Error('Unsafe released compatibility artifact path');
  }
  const file = path.join(root, relative);
  const realRoot = await fs.promises.realpath(root);
  const realFile = await fs.promises.realpath(file);
  const fromRoot = path.relative(realRoot, realFile);
  if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) {
    throw new Error('Released compatibility artifact escapes its package');
  }
  if (!(await fs.promises.stat(realFile)).isFile()) {
    throw new Error(`Released compatibility artifact is not a file: ${relative}`);
  }
  const bytes = await fs.promises.readFile(realFile);
  if (expected && sha256(bytes) !== expected) {
    throw new Error(`Released compatibility SHA256 mismatch: ${relative}`);
  }
  return bytes;
}

async function assertDestinationParent(destination: string, core: string): Promise<void> {
  let ancestor = path.dirname(destination);
  const missing: string[] = [];
  let realAncestor: string;
  while (true) {
    try {
      realAncestor = await fs.promises.realpath(ancestor);
      break;
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
      missing.unshift(path.basename(ancestor));
      ancestor = path.dirname(ancestor);
    }
  }
  const parent = path.join(realAncestor!, ...missing);
  const relative = path.relative(core, parent);
  if ((!relative.startsWith('..') && !path.isAbsolute(relative)) || parent.split(path.sep).includes('node_modules')) {
    throw new Error('Compatibility output must be outside installed dependencies');
  }
}

async function replaceFile(destination: string, contents: Buffer): Promise<void> {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(temporary, contents, { flag: 'wx' });
    await fs.promises.rename(temporary, destination);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}

export async function copyReleasedRnohCompatibilityHarAsync(options: CopyOptions): Promise<string> {
  await copyReleasedHarmonyHarAsync({ ...options, transform: 'rnoh-core-v1-v4' });
  return options.outputHarPath;
}

// Transform metadata selects an immutable release artifact; it never executes a tool.
export async function copyReleasedHarmonyHarAsync({
  transform,
  inputHarPath,
  outputHarPath,
  corePackageRoot,
}: CopyOptions & {
  transform: NonNullable<HarmonyHarConfig['transform']> | 'rnoh-core-v1-v4';
}): Promise<void> {
  const expected = policy.artifacts.find((item) => item.transform === transform);
  if (!expected) throw new Error(`Unsupported released compatibility transform: ${transform}`);
  const input = await fs.promises.readFile(inputHarPath);
  if (sha256(input) !== expected.inputSHA256) {
    throw new Error(`Unsupported ${transform} input SHA256`);
  }
  let manifest: any;
  let root: string;
  try {
    root = await releasedRoot(corePackageRoot);
    manifest = JSON.parse((await verifiedFile(root, 'manifest.json')).toString('utf8'));
  } catch (error: any) {
    throw new Error(`Released compatibility manifest is missing or invalid: ${error.message}`);
  }
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.artifacts)) {
    throw new Error('Invalid released compatibility manifest schema');
  }
  const matches = manifest.artifacts.filter(
    (item: any) => item.transform === transform && item.inputSHA256 === expected.inputSHA256
  );
  if (matches.length !== 1) throw new Error(`Released compatibility artifact missing or duplicated: ${transform}`);
  const artifact = matches[0];
  for (const key of ['compatibilityId', 'outputSHA256', 'file', 'packageName', 'packageVersion'] as const) {
    if (artifact[key] !== expected[key]) throw new Error(`Released compatibility ${key} mismatch: ${transform}`);
  }
  const output = await verifiedFile(root!, artifact.file, expected.outputSHA256);
  if (!/^[a-f0-9]{64}$/.test(artifact.manifestSHA256)) throw new Error('Invalid compatibility manifest SHA256');
  const record = await verifiedFile(root!, `${artifact.file}.manifest.json`, artifact.manifestSHA256);
  const details = JSON.parse(record.toString('utf8'));
  if ((details.compatibilityId ?? details.profile) !== expected.compatibilityId ||
      details.inputSHA256 !== expected.inputSHA256 || details.outputSHA256 !== expected.outputSHA256) {
    throw new Error(`Released compatibility provenance mismatch: ${transform}`);
  }
  if (!Array.isArray(artifact.tools) || artifact.tools.length === 0) throw new Error('Missing compatibility tools provenance');
  for (const tool of artifact.tools) {
    if (!/^[a-f0-9]{64}$/.test(tool.sha256)) throw new Error('Invalid compatibility tool SHA256');
    await verifiedFile(root!, tool.file, tool.sha256);
  }
  const destination = path.resolve(outputHarPath);
  const core = await fs.promises.realpath(corePackageRoot);
  const relative = path.relative(core, destination);
  if ((!relative.startsWith('..') && !path.isAbsolute(relative)) ||
      destination.split(path.sep).includes('node_modules') ||
      destination === path.resolve(inputHarPath)) {
    throw new Error('Compatibility output must be outside installed dependencies');
  }
  await assertDestinationParent(destination, core);
  for (const file of [destination, `${destination}.manifest.json`]) {
    try {
      if ((await fs.promises.lstat(file)).isSymbolicLink()) throw new Error('Compatibility output must not be a symlink');
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  await replaceFile(destination, output);
  await replaceFile(`${destination}.manifest.json`, record);
}
