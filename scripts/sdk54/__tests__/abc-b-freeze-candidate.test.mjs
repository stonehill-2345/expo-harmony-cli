import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { create } from 'tar';

import { RELEASE_PACKAGES } from '../release-catalog.mjs';
import { freezeCandidate } from '../abc/b-freeze-candidate.mjs';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sha512 = (bytes) => `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}`;

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-abc-b-freeze-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, 'source');
  const directory = path.join(root, 'candidate');
  const output = path.join(root, 'frozen');
  fs.mkdirSync(sourceRoot);
  fs.mkdirSync(directory);
  execFileSync('git', ['init', '-q'], { cwd: sourceRoot });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: sourceRoot });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: sourceRoot });

  const packages = [];
  for (const descriptor of RELEASE_PACKAGES) {
    const packageRoot = path.join(root, 'package');
    fs.rmSync(packageRoot, { recursive: true, force: true });
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({
      name: descriptor.publishName,
      version: descriptor.publishVersion,
      dependencies: {},
    }));
    if (descriptor.installName === 'expo-font') {
      for (const relative of [
        'plugin/src/withFontsHarmony.ts',
        'plugin/build/withFontsHarmony.js',
        'plugin/build/withFontsHarmony.d.ts',
      ]) {
        const file = path.join(packageRoot, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, relative);
      }
      const sourcePlugin = path.join(sourceRoot, descriptor.relativePath, 'plugin/src/withFontsHarmony.ts');
      fs.mkdirSync(path.dirname(sourcePlugin), { recursive: true });
      fs.writeFileSync(sourcePlugin, 'plugin/src/withFontsHarmony.ts');
    }
    const file = `${descriptor.publishName.replace('@', '').replace('/', '-')}-${descriptor.publishVersion}.tgz`;
    await create({ cwd: packageRoot, file: path.join(directory, file), gzip: true, prefix: 'package/' }, fs.readdirSync(packageRoot));
    const bytes = fs.readFileSync(path.join(directory, file));
    packages.push({
      installName: descriptor.installName,
      name: descriptor.publishName,
      version: descriptor.publishVersion,
      file,
      integrity: sha512(bytes),
    });
  }
  const cliRoot = path.join(root, 'cli');
  fs.mkdirSync(cliRoot);
  fs.writeFileSync(path.join(cliRoot, 'package.json'), JSON.stringify({ name: 'expo-harmony-cli', version: '1.6.0' }));
  const cliFile = 'expo-harmony-cli-1.6.0.tgz';
  await create({ cwd: cliRoot, file: path.join(directory, cliFile), gzip: true, prefix: 'package/' }, fs.readdirSync(cliRoot));
  fs.writeFileSync(path.join(directory, 'release.json'), JSON.stringify({
    release: 'sdk54-expo-oh-harmony.1', packages, failures: [],
    expoImageUpstreamSha256: 'e17879a4cc6cebdf50efadf3170956b2601363f1525f0426b10859a6154178bb',
  }));
  fs.writeFileSync(path.join(sourceRoot, 'README.md'), 'source');
  execFileSync('git', ['add', '.'], { cwd: sourceRoot });
  execFileSync('git', ['commit', '-qm', 'base'], { cwd: sourceRoot });
  return { sourceRoot, directory, output, cliFile };
}

test('freezes sixteen runtime packages and an independent CLI with auditable identities', async (t) => {
  const { sourceRoot, directory, output, cliFile } = await fixture(t);
  const result = await freezeCandidate({ directory, sourceRoot, output });
  assert.equal(result.runtimePackages.length, 16);
  assert.equal(result.cli.file, cliFile);
  assert.equal(result.source.dirty, false);
  assert.deepEqual(result.failures, []);
  assert.ok(result.runtimePackages.every((entry) => entry.members.length > 0));
  assert.deepEqual(result.runtimePackages.find(({ installName }) => installName === 'expo-font').pluginAudit, {
    sources: ['plugin/src/withFontsHarmony.ts'],
    missingBuild: [],
  });
  const candidate = JSON.parse(fs.readFileSync(path.join(output, 'candidate.json'), 'utf8'));
  assert.equal(candidate.packages.length, 16);
  assert.deepEqual(candidate.failures, []);
  for (const entry of candidate.packages) {
    const bytes = fs.readFileSync(path.join(output, entry.file));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(sha256(bytes), entry.sha256);
  }
});

test('fails closed on an existing output or stale plugin build declarations', async (t) => {
  const first = await fixture(t);
  fs.mkdirSync(first.output);
  await assert.rejects(() => freezeCandidate(first), /output already exists/);

  const second = await fixture(t);
  const release = JSON.parse(fs.readFileSync(path.join(second.directory, 'release.json')));
  const font = release.packages.find(({ installName }) => installName === 'expo-font');
  const broken = fs.readFileSync(path.join(second.directory, font.file));
  font.integrity = sha512(broken);
  fs.writeFileSync(path.join(second.directory, 'release.json'), JSON.stringify(release));
  fs.rmSync(path.join(second.sourceRoot, 'packages/expo-font/plugin/src/withFontsHarmony.ts'));
  const extra = path.join(second.sourceRoot, 'packages/expo-font/plugin/src/missing.ts');
  fs.mkdirSync(path.dirname(extra), { recursive: true });
  fs.writeFileSync(extra, 'missing');
  execFileSync('git', ['add', '.'], { cwd: second.sourceRoot });
  execFileSync('git', ['commit', '-qm', 'stale plugin source'], { cwd: second.sourceRoot });
  await assert.rejects(() => freezeCandidate(second), /missing plugin build outputs/);
  assert.equal(fs.existsSync(second.output), false);
});

test('fails closed before freezing a dirty source tree', async (t) => {
  const dirty = await fixture(t);
  fs.appendFileSync(path.join(dirty.sourceRoot, 'README.md'), '\ndirty\n');
  await assert.rejects(() => freezeCandidate(dirty), /source must be clean before candidate freeze/);
  assert.equal(fs.existsSync(dirty.output), false);
});
