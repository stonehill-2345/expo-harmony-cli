import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const policyPath = fileURLToPath(new URL('../../packages/expo-modules-autolinking/scripts/harmony/released-compatibility.json', import.meta.url));
export const RELEASED_COMPATIBILITY_POLICY = JSON.parse(fs.readFileSync(policyPath));
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inside = (root, file) => { const relative = path.relative(root, file); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); };

export function verifyReleasedCompatibility(corePackageRoot) {
  const core = fs.realpathSync(corePackageRoot);
  for (const relative of ['harmony', 'harmony/released-compatibility']) {
    const directory = fs.realpathSync(path.join(core, relative));
    if (directory === core || !inside(core, directory)) throw new Error('Released compatibility directory escapes its Core package');
  }
  const root = fs.realpathSync(path.join(core, 'harmony/released-compatibility'));
  const read = (relative, hash) => {
    if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Unsafe compatibility artifact path');
    const file = fs.realpathSync(path.join(root, relative));
    if (!inside(root, file) || !fs.statSync(file).isFile()) throw new Error('Compatibility artifact escapes package');
    if (hash && digest(file) !== hash) throw new Error(`Compatibility SHA256 mismatch: ${relative}`);
    return fs.readFileSync(file);
  };
  const manifest = JSON.parse(read('manifest.json'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.artifacts) || manifest.artifacts.length !== RELEASED_COMPATIBILITY_POLICY.artifacts.length) throw new Error('Incomplete released compatibility bundle');
  for (const expected of RELEASED_COMPATIBILITY_POLICY.artifacts) {
    const matches = manifest.artifacts.filter(item => item.transform === expected.transform);
    if (matches.length !== 1) throw new Error(`Missing or duplicate compatibility artifact: ${expected.transform}`);
    const artifact = matches[0];
    for (const [key, value] of Object.entries(expected)) if (artifact[key] !== value) throw new Error(`Compatibility ${key} mismatch`);
    read(artifact.file, expected.outputSHA256);
    if (!/^[a-f0-9]{64}$/.test(artifact.manifestSHA256)) throw new Error('Invalid compatibility manifest SHA256');
    const record = JSON.parse(read(`${artifact.file}.manifest.json`, artifact.manifestSHA256));
    if ((record.compatibilityId ?? record.profile) !== expected.compatibilityId || record.inputSHA256 !== expected.inputSHA256 || record.outputSHA256 !== expected.outputSHA256) throw new Error('Compatibility provenance mismatch');
    if (!Array.isArray(artifact.tools) || artifact.tools.length === 0) throw new Error('Missing compatibility tool provenance');
    for (const tool of artifact.tools) {
      if (!/^[a-f0-9]{64}$/.test(tool.sha256)) throw new Error('Invalid compatibility tool SHA256');
      read(tool.file, tool.sha256);
    }
  }
  return manifest;
}

// This API is exclusively used on disposable release package staging directories.
export async function prepareReleasedCompatibility({ rootDir, corePackageRoot, rnohHarPath, screensHarPath, workletsHarPath, pythonExecutable = process.env.EXPO_HARMONY_RELEASE_PYTHON ?? 'python3' }) {
  rootDir = fs.realpathSync(rootDir);
  corePackageRoot = fs.realpathSync(corePackageRoot);
  if (inside(path.join(rootDir, 'packages/expo-modules-core'), corePackageRoot)) throw new Error('Compatibility builds require release staging, never source Core');
  const harmonyRoot = path.join(corePackageRoot, 'harmony');
  if (fs.existsSync(harmonyRoot) && !inside(corePackageRoot, fs.realpathSync(harmonyRoot))) throw new Error('Released compatibility directory escapes its Core package');
  const inputs = [rnohHarPath, screensHarPath, workletsHarPath];
  for (const [index, item] of RELEASED_COMPATIBILITY_POLICY.artifacts.entries()) {
    if (!inputs[index] || digest(inputs[index]) !== item.inputSHA256) throw new Error(`Unsupported ${item.transform} input SHA256`);
  }
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-release-compat-'));
  const bundle = path.join(stage, 'released-compatibility');
  fs.mkdirSync(bundle);
  try {
    const artifacts = [];
    for (const [index, item] of RELEASED_COMPATIBILITY_POLICY.artifacts.entries()) {
      const toolDirectory = path.join(bundle, 'tools', item.transform);
      fs.mkdirSync(toolDirectory, { recursive: true });
      const rnoh = item.transform === 'rnoh-core-v1-v4';
      const source = path.join(rootDir, rnoh ? 'packages/expo-modules-core/harmony/rnoh-compat' : 'packages/expo-modules-autolinking/scripts/harmony');
      const names = rnoh ? fs.readdirSync(source).filter(name => /\.(py|json|patch)$/.test(name)).sort() : [item.transform.startsWith('screens') ? 'prepare-screens.py' : 'prepare-worklets.py'];
      const tools = names.map(name => {
        const target = path.join(toolDirectory, name);
        fs.copyFileSync(path.join(source, name), target);
        return { file: path.relative(bundle, target).split(path.sep).join('/'), sha256: digest(target) };
      });
      const script = path.join(toolDirectory, rnoh ? 'prepare_har.py' : names[0]);
      const output = path.join(bundle, item.file);
      execFileSync(pythonExecutable, [script, '--input-har', path.resolve(inputs[index]), '--output-har', output, ...(rnoh ? ['--profile', 'core-v1-v4'] : [])], { stdio: 'pipe', maxBuffer: 4 * 1024 * 1024 });
      if (digest(output) !== item.outputSHA256) throw new Error(`Released ${item.transform} output SHA256 mismatch`);
      const recordFile = `${output}.manifest.json`;
      const record = JSON.parse(fs.readFileSync(recordFile));
      if ((record.compatibilityId ?? record.profile) !== item.compatibilityId || record.inputSHA256 !== item.inputSHA256 || record.outputSHA256 !== item.outputSHA256) throw new Error(`Released ${item.transform} provenance mismatch`);
      // Python's local absolute paths are not part of the distributable contract.
      delete record.inputHAR;
      delete record.outputHAR;
      fs.writeFileSync(recordFile, JSON.stringify(record, null, 2) + '\n');
      artifacts.push({ ...item, manifestSHA256: digest(recordFile), tools });
    }
    for (const [index, item] of RELEASED_COMPATIBILITY_POLICY.artifacts.entries()) {
      if (digest(inputs[index]) !== item.inputSHA256) throw new Error('Compatibility source changed during release preparation');
    }
    const manifest = { schemaVersion: 1, artifacts };
    fs.writeFileSync(path.join(bundle, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    const destination = path.join(corePackageRoot, 'harmony/released-compatibility');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.rmSync(destination, { recursive: true, force: true });
    fs.cpSync(bundle, destination, { recursive: true });
    verifyReleasedCompatibility(corePackageRoot);
    return manifest;
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}
