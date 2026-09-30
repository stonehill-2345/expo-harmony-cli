const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const tool = path.resolve(__dirname, '../tools/verify-install.cjs');
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// Test only the archive/Node resolution verifier; these are not native mocks or
// replacements for device API tests.
function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-verifier-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'artifacts'));
  const manifest = { packages: {} };
  for (const name of ['expo-modules-core', '@expo/metro-config', ...(options.linking ? ['expo-linking'] : []), ...(options.font ? ['expo-font'] : []), ...(options.statusBar ? ['expo-status-bar'] : [])]) {
    const source = path.join(root, 'source', name, 'package');
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js' }));
    fs.writeFileSync(path.join(source, 'index.js'), 'module.exports = {};\n');
    fs.writeFileSync(path.join(source, '.gitignore'), 'local-cache/\n');
    const archive = name.replace('@', '').replace('/', '-') + '.tgz';
    const file = path.join(root, 'artifacts', archive);
    execFileSync('tar', ['-czf', file, '-C', path.dirname(source), 'package']);
    manifest.packages[name] = { archive, sha256: digest(file) };
    fs.cpSync(source, path.join(root, 'node_modules', name), { recursive: true });
  }
  for (const name of ['expo', 'expo-asset', 'expo-constants']) {
    const folder = path.join(root, 'node_modules', name);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name }));
  }
  fs.writeFileSync(path.join(root, 'source-manifest.json'), JSON.stringify(manifest));
  return root;
}
function verify(root) { return spawnSync(process.execPath, [tool, root], { encoding: 'utf8' }); }

test('accepts matching packages consumed from the verified Core', t => {
  const result = verify(fixture(t));
  assert.equal(result.status, 0, result.stderr);
});

test('rejects extra installed source that can shadow an archived platform module', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'node_modules/expo-modules-core/index.harmony.js'), 'module.exports = "unexpected";');
  assert.equal(verify(root).status, 1);
});

test('rejects consumers sharing the same unverified nested Core', t => {
  const root = fixture(t);
  const wrong = path.join(root, 'unverified-core');
  fs.mkdirSync(wrong);
  fs.writeFileSync(path.join(wrong, 'package.json'), JSON.stringify({ name: 'expo-modules-core', main: 'index.js' }));
  fs.writeFileSync(path.join(wrong, 'index.js'), 'module.exports = "not the verified archive";');
  for (const name of ['expo', 'expo-asset', 'expo-constants']) {
    const folder = path.join(root, 'node_modules', name, 'node_modules');
    fs.mkdirSync(folder);
    fs.symlinkSync(wrong, path.join(folder, 'expo-modules-core'), 'dir');
  }
  assert.equal(verify(root).status, 1);
});

test('rejects modified or missing installed source', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'node_modules/expo-modules-core/index.js'), 'changed');
  assert.equal(verify(root).status, 1);
  fs.unlinkSync(path.join(root, 'node_modules/expo-modules-core/index.js'));
  assert.equal(verify(root).status, 1);
});

test('accepts npm gitignore rename only when it matches the original bytes', t => {
  const root = fixture(t);
  const ignore = path.join(root, 'node_modules/expo-modules-core/.npmignore');
  fs.writeFileSync(ignore, 'local-cache/\n');
  assert.equal(verify(root).status, 0);
  fs.writeFileSync(ignore, 'unexpected content');
  assert.equal(verify(root).status, 1);
});

test('Linking must consume the verified Core, not an unverified nested copy', t => {
  const root = fixture(t, { linking: true });
  const nested = path.join(root, 'node_modules/expo-linking/node_modules/expo-modules-core');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, 'package.json'), JSON.stringify({ name: 'expo-modules-core', main: 'index.js' }));
  fs.writeFileSync(path.join(nested, 'index.js'), 'module.exports = {};');
  assert.equal(verify(root).status, 1);
});

test('Font must consume the verified Core, not an unverified nested copy', t => {
  const root = fixture(t, { font: true });
  const nested = path.join(root, 'node_modules/expo-font/node_modules/expo-modules-core');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, 'package.json'), JSON.stringify({ name: 'expo-modules-core', main: 'index.js' }));
  fs.writeFileSync(path.join(nested, 'index.js'), 'module.exports = {};');
  assert.equal(verify(root).status, 1);
});

test('StatusBar must consume the verified React Native package context without nested Core drift', t => {
  const root = fixture(t, { statusBar: true });
  const nested = path.join(root, 'node_modules/expo-status-bar/node_modules/expo-modules-core');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, 'package.json'), JSON.stringify({ name: 'expo-modules-core', main: 'index.js' }));
  fs.writeFileSync(path.join(nested, 'index.js'), 'module.exports = {};');
  assert.equal(verify(root).status, 1);
});
