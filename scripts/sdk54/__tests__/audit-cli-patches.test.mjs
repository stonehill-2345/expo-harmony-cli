import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { SDK54_CLI_PATCH_PACKAGES } from '../catalog.mjs';
import { auditCliPatches } from '../audit-cli-patches.mjs';

const sha256 = filePath => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
const licensePath = name => `licenses/${name.replaceAll('/', '__')}/LICENSE`;

function patchTarget(descriptor) {
  if (descriptor.name === '@expo/cli') return 'build/bin/cli';
  if (descriptor.name === '@expo/metro-config') return 'build/withHarmony.js';
  if (descriptor.name === 'expo-modules-autolinking') return 'build/platforms/harmony/index.js';
  if (descriptor.name === '@react-native-ohos/react-native-screens') return 'lib/commonjs/components/ScreenStackItem.js';
  return 'package.json';
}

function hunkText(descriptor, target) {
  const file = `node_modules/${descriptor.name}/${target}`;
  return [
    `diff --git a/${file} b/${file}`,
    'index 1111111..2222222 100644',
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1 +1 @@',
    '-old',
    '+harmony',
    '',
  ].join('\n');
}

function patchText(descriptor, target = patchTarget(descriptor), { includeManifest = true } = {}) {
  const targets = [target];
  if (includeManifest && target !== 'package.json') targets.push('package.json');
  return targets.map(candidate => hunkText(descriptor, candidate)).join('');
}

function createFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-cli-patch-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const patchDir = path.join(root, 'patches');
  const manifestPath = path.join(patchDir, 'manifest.json');
  fs.mkdirSync(patchDir, { recursive: true });

  const patches = SDK54_CLI_PATCH_PACKAGES.map((descriptor) => {
    const filePath = path.join(patchDir, descriptor.patchFile);
    fs.writeFileSync(filePath, patchText(descriptor));
    const license = licensePath(descriptor.name);
    fs.mkdirSync(path.dirname(path.join(patchDir, license)), { recursive: true });
    fs.writeFileSync(path.join(patchDir, license), fs.readFileSync(path.resolve(descriptor.name === '@react-native-ohos/react-native-screens' ? 'scripts/sdk54/licenses/react-native-ohos-screens-ISC' : 'scripts/sdk54/licenses/expo-LICENSE'), 'utf8'));
    return {
      name: descriptor.name,
      version: descriptor.version,
      file: descriptor.patchFile,
      sha256: sha256(filePath),
      licenses: [license],
    };
  });
  const manifest = { schemaVersion: 1, patchSet: 'sdk54-mvp-1', patches };
  const writeManifest = () => fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const rewritePatch = (name, text, { updateHash = true } = {}) => {
    const entry = manifest.patches.find(candidate => candidate.name === name);
    fs.writeFileSync(path.join(patchDir, entry.file), text);
    if (updateHash) entry.sha256 = sha256(path.join(patchDir, entry.file));
    writeManifest();
  };
  writeManifest();
  return { patchDir, manifestPath, manifest, rewritePatch, writeManifest };
}

function audit(fixture) {
  return auditCliPatches({
    patchDir: fixture.patchDir,
    manifestPath: fixture.manifestPath,
    expectedPackages: SDK54_CLI_PATCH_PACKAGES,
  });
}

function assertFailure(report, ...fragments) {
  assert.equal(report.ok, false, JSON.stringify(report, null, 2));
  assert.ok(
    report.failures.some(failure => fragments.every(fragment => failure.includes(fragment))),
    `${fragments.join(' + ')}: ${JSON.stringify(report, null, 2)}`,
  );
}

test('accepts an exact, checksummed, licensed 14-package patch set', (t) => {
  const fixture = createFixture(t);
  assert.deepEqual(audit(fixture), {
    ok: true,
    packages: SDK54_CLI_PATCH_PACKAGES.map(descriptor => descriptor.name),
    failures: [],
  });
});

test('rejects missing files, missing packages, duplicate packages, stale patches, and wrong versions', async (t) => {
  await t.test('missing patch file', (t) => {
    const fixture = createFixture(t);
    const entry = fixture.manifest.patches[0];
    fs.rmSync(path.join(fixture.patchDir, entry.file));
    assertFailure(audit(fixture), entry.file, 'missing');
  });

  await t.test('missing expected package', (t) => {
    const fixture = createFixture(t);
    const [removed] = fixture.manifest.patches.splice(5, 1);
    fixture.writeManifest();
    assertFailure(audit(fixture), removed.name, 'missing manifest package');
  });

  await t.test('duplicate package', (t) => {
    const fixture = createFixture(t);
    fixture.manifest.patches.push({ ...fixture.manifest.patches[0] });
    fixture.writeManifest();
    assertFailure(audit(fixture), fixture.manifest.patches[0].name, 'duplicate');
  });

  await t.test('stale unmanifested patch', (t) => {
    const fixture = createFixture(t);
    const stale = 'expo-image+3.0.11.patch';
    fs.writeFileSync(path.join(fixture.patchDir, stale), 'old early patch\n');
    assertFailure(audit(fixture), stale, 'not declared');
  });

  await t.test('wrong package version', (t) => {
    const fixture = createFixture(t);
    fixture.manifest.patches[0].version = '0.0.0';
    fixture.writeManifest();
    assertFailure(audit(fixture), fixture.manifest.patches[0].name, 'version');
  });

  await t.test('unstable manifest order', (t) => {
    const fixture = createFixture(t);
    fixture.manifest.patches.reverse();
    fixture.writeManifest();
    assertFailure(audit(fixture), 'stable order');
  });
});

test('rejects checksum drift and missing LICENSE references', async (t) => {
  await t.test('sha256 mismatch', (t) => {
    const fixture = createFixture(t);
    const entry = fixture.manifest.patches[0];
    fs.appendFileSync(path.join(fixture.patchDir, entry.file), '+changed\n');
    assertFailure(audit(fixture), entry.file, 'sha256');
  });

  await t.test('missing license', (t) => {
    const fixture = createFixture(t);
    const entry = fixture.manifest.patches[0];
    fs.rmSync(path.join(fixture.patchDir, entry.licenses[0]));
    assertFailure(audit(fixture), entry.file, 'LICENSE');
  });

  await t.test('empty or project-owned license text', (t) => {
    const fixture = createFixture(t);
    const entry = fixture.manifest.patches[0];
    fs.writeFileSync(path.join(fixture.patchDir, entry.licenses[0]), 'Copyright Example\n' + 'not upstream '.repeat(30));
    assertFailure(audit(fixture), entry.file, 'upstream license');
  });
});

test('rejects source-only patches and missing critical runtime hunks', async (t) => {
  await t.test('source-only patch', (t) => {
    const fixture = createFixture(t);
    const descriptor = SDK54_CLI_PATCH_PACKAGES.find(candidate => candidate.name === 'expo-asset');
    fixture.rewritePatch(descriptor.name, patchText(descriptor, 'src/index.ts', { includeManifest: false }));
    assertFailure(audit(fixture), descriptor.patchFile, 'runtime hunk');
  });

  for (const [name, target] of [
    ['@expo/cli', 'build/bin/cli'],
    ['@expo/metro-config', 'build/withHarmony.js'],
    ['expo-modules-autolinking', 'build/platforms/harmony/'],
  ]) {
    await t.test(`${name} requires ${target}`, (t) => {
      const fixture = createFixture(t);
      const descriptor = SDK54_CLI_PATCH_PACKAGES.find(candidate => candidate.name === name);
      fixture.rewritePatch(name, patchText(descriptor, 'build/other.js'));
      assertFailure(audit(fixture), descriptor.patchFile, target);
    });
  }
});

test('rejects patch and license symlinks that escape the patch directory', (t) => {
  const fixture = createFixture(t);
  const entry = fixture.manifest.patches[0];
  const outside = path.join(path.dirname(fixture.patchDir), 'outside.patch');
  fs.writeFileSync(outside, fs.readFileSync(path.join(fixture.patchDir, entry.file)));
  fs.rmSync(path.join(fixture.patchDir, entry.file));
  fs.symlinkSync(outside, path.join(fixture.patchDir, entry.file));
  entry.sha256 = sha256(outside); fixture.writeManifest();
  assertFailure(audit(fixture), entry.file, 'path');
});

test('rejects absolute paths, credentials, private registries, private IPv4, archives, caches, and binary patches', async (t) => {
  await t.test('allows textual artifact references without embedding artifact payload paths', (t) => {
    const fixture = createFixture(t);
    const descriptor = SDK54_CLI_PATCH_PACKAGES.find(candidate => candidate.name === 'expo-asset');
    fixture.rewritePatch(descriptor.name, `${patchText(descriptor)}+const names = ['entry.har', 'entry.hap', 'release.tgz', 'build-cache/output'];\n`);
    assert.equal(audit(fixture).ok, true, JSON.stringify(audit(fixture), null, 2));
  });

  await t.test('allows public registry artifact URLs outside the manifest', (t) => {
    const fixture = createFixture(t);
    const descriptor = SDK54_CLI_PATCH_PACKAGES.find(candidate => candidate.name === 'expo-asset');
    fixture.rewritePatch(descriptor.name, `${patchText(descriptor)}+// resolved=https://registry.npmmirror.com/pkg/-/pkg-1.0.0.tgz\n`);
    const report = audit(fixture);
    assert.equal(report.ok, true, JSON.stringify(report, null, 2));
  });

  const cases = [
    ['Users path', descriptor => `${patchText(descriptor)}+const value = "/Users/example/secret";\n`, '/Users/'],
    ['private tmp path', descriptor => `${patchText(descriptor)}+const value = "/private/tmp/output";\n`, '/private/tmp'],
    ['registry token', descriptor => `${patchText(descriptor)}+// _authToken=super-secret\n`, 'credential'],
    ['private registry', descriptor => `${patchText(descriptor)}+// registry=https://npm.corp.example/npm/\n`, 'private registry'],
    ['private IPv4', descriptor => `${patchText(descriptor)}+// endpoint=http://192.168.1.8:8080\n`, 'private IPv4'],
    ['TGZ payload', descriptor => `${patchText(descriptor)}${hunkText(descriptor, 'harmony/payload/release.tgz')}`, '.tgz'],
    ['HAP payload', descriptor => `${patchText(descriptor)}${hunkText(descriptor, 'harmony/payload/entry.hap')}`, '.hap'],
    ['HAR payload', descriptor => `${patchText(descriptor)}${hunkText(descriptor, 'harmony/payload/library.har')}`, '.har'],
    ['build cache', descriptor => `${patchText(descriptor)}${hunkText(descriptor, 'harmony/build-cache/output.txt')}`, 'cache'],
    ['tsbuildinfo cache', descriptor => `${patchText(descriptor)}${hunkText(descriptor, 'plugin/tsconfig.tsbuildinfo')}`, 'cache'],
    ['Git binary patch', descriptor => `${patchText(descriptor)}GIT binary patch\nliteral 3\nabc\n`, 'binary patch'],
  ];

  for (const [label, createText, rule] of cases) {
    await t.test(label, (t) => {
      const fixture = createFixture(t);
      const descriptor = SDK54_CLI_PATCH_PACKAGES.find(candidate => candidate.name === 'expo-asset');
      fixture.rewritePatch(descriptor.name, createText(descriptor));
      assertFailure(audit(fixture), descriptor.patchFile, rule);
    });
  }
});


test('rejects non-runtime rebuild noise and packaged Harmony fixtures', async (t) => {
  for (const [label, target] of [
    ['unrelated CLI rebuild output', 'build/src/api/endpoint.js'],
    ['Harmony example', 'harmony/example/host/package-lock.json'],
    ['Harmony tests', 'harmony/tests/RuntimeTest.cpp'],
    ['Android Maven artifact', 'local-maven-repo/group/artifact.pom'],
  ]) {
    await t.test(label, (t) => {
      const fixture = createFixture(t);
      const descriptor = SDK54_CLI_PATCH_PACKAGES.find(candidate => candidate.name === (target.startsWith('build/') ? '@expo/cli' : 'expo-asset'));
      fixture.rewritePatch(descriptor.name, `${patchText(descriptor)}${hunkText(descriptor, target)}`);
      assertFailure(audit(fixture), descriptor.patchFile, 'non-runtime patch target');
    });
  }
});
