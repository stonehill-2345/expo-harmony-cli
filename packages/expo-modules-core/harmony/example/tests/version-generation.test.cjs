const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

// Configure only: the real native compilation is covered by the HAP builds.
function configure(version) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-core-version-'));
  const source = path.resolve(__dirname, '../../..');
  const core = path.join(root, 'core');
  fs.cpSync(source, core, { recursive: true, filter: (p) => path.basename(p) !== 'node_modules' });
  const pkg = JSON.parse(fs.readFileSync(path.join(core, 'package.json')));
  pkg.version = version;
  fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify(pkg));
  fs.writeFileSync(path.join(root, 'CMakeLists.txt'), `
cmake_minimum_required(VERSION 3.16)
project(core_version_configure LANGUAGES CXX)
add_library(rnoh INTERFACE)
add_library(jsi INTERFACE)
add_subdirectory(core/harmony/src/main/cpp core-native)
`);
  const result = spawnSync(process.env.EXPO_HARMONY_CMAKE || 'cmake', ['-S', root, '-B', path.join(root, 'build')], { encoding: 'utf8' });
  return { root, result, header: path.join(root, 'build/core-native/ExpoModulesCoreVersion.h') };
}

test('native version follows package metadata, including prerelease components', () => {
  const { result, header } = configure('13.27.41-test');
  assert.equal(result.status, 0, String(result.error || result.stderr));
  const text = fs.readFileSync(header, 'utf8');
  assert.match(text, /#define EXPO_CORE_VERSION "13\.27\.41-test"/);
  assert.match(text, /#define EXPO_CORE_VERSION_MAJOR 13\b/);
  assert.match(text, /#define EXPO_CORE_VERSION_MINOR 27\b/);
  assert.match(text, /#define EXPO_CORE_VERSION_PATCH 41\b/);
});

test('invalid package version fails native configuration', () => {
  const { result } = configure('invalid');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid Expo Modules Core package version/);
});
