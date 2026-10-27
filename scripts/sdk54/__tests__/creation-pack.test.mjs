import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { extract } from 'tar';
import { buildAndPackCreator, validateCreatorBuild } from '../build-create.mjs';

const rootDir = path.resolve(import.meta.dirname, '../../..');

test('creator runtime validation rejects missing entry, dynamic chunk, and extraction resource', () => {
  const packageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-create-resource-'));
  const build = path.join(packageDir, 'build');
  fs.mkdirSync(build);
  try {
    assert.throws(() => validateCreatorBuild({ packageDir }), /index\.js/);
    fs.writeFileSync(path.join(build, 'index.js'), 'require.e(123);');
    assert.throws(() => validateCreatorBuild({ packageDir }), /123\.index\.js/);
    fs.writeFileSync(path.join(build, '123.index.js'), 'module.exports = {};');
    assert.throws(() => validateCreatorBuild({ packageDir }), /gitignore/);
  } finally { fs.rmSync(packageDir, { recursive: true, force: true }); }
});

test('creator candidate builds twice, packs deterministically, and starts outside workspace', { timeout: 60000 }, async (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-create-pack-test-'));
  try {
    const first = await buildAndPackCreator({ rootDir, outputDir: path.join(temporary, 'a') });
    const second = await buildAndPackCreator({ rootDir, outputDir: path.join(temporary, 'b') });
    assert.equal(first.sha256, second.sha256);
    assert.equal(first.integrity, second.integrity);
    t.diagnostic(JSON.stringify({ firstSha256: first.sha256, secondSha256: second.sha256, twoFreshBuilds: true }));
    const consumer = path.join(temporary, 'consumer');
    fs.mkdirSync(consumer);
    await extract({ file: path.join(temporary, 'a', first.file), cwd: consumer });
    const packageDir = path.join(consumer, 'package');
    const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
    assert.equal(manifest.private, false);
    assert.equal(manifest.devDependencies, undefined);
    assert.deepEqual(manifest.scripts, {});
    assert.equal(fs.existsSync(path.join(packageDir, 'node_modules')), false);
    assert.match(fs.readFileSync(path.join(packageDir, 'LICENSE'), 'utf8'), /BSD 3-Clause License/);
    assert.match(fs.readFileSync(path.join(packageDir, 'UPSTREAM_LICENSE'), 'utf8'), /The MIT License/);
    assert.ok(fs.statSync(path.join(packageDir, 'build/THIRD_PARTY_LICENSES.txt')).size > 1000);
    for (const [arg, expected] of [['--help', /@expo-oh\/expo-template-default@54\.0\.64/], ['--version', /^3\.5\.12\s*$/]]) {
      const run = spawnSync(process.execPath, [path.join(packageDir, 'build/index.js'), arg], {
        cwd: consumer, env: { ...process.env, NODE_PATH: '', EXPO_NO_TELEMETRY: '1' }, encoding: 'utf8', timeout: 10000,
      });
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, expected);
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
