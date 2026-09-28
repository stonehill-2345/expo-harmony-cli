// Verify actual installed versions and peers before using a candidate native host.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const root = fs.realpathSync(process.argv[2]);
const appRequire = createRequire(path.join(root, 'package.json'));
const semver = appRequire('semver');
const versions = require('../router/navigation-dependencies.json');
const result = { versions: {}, peers: [], nativeArchives: {} };
for (const [name, expected] of Object.entries(versions)) {
  const file = appRequire.resolve(name + '/package.json');
  const pkg = JSON.parse(fs.readFileSync(file));
  assert.equal(pkg.version, expected, name);
  result.versions[name] = pkg.version;
  const fromPackage = createRequire(file);
  for (const [peer, range] of Object.entries(pkg.peerDependencies || {})) {
    let installed;
    try { installed = fromPackage(peer + '/package.json').version; }
    catch (error) {
      if (error.code === 'MODULE_NOT_FOUND' && pkg.peerDependenciesMeta?.[peer]?.optional) continue;
      throw error;
    }
    assert.ok(semver.satisfies(installed, range), `${name}: ${peer}@${installed} does not satisfy ${range}`);
    result.peers.push({ consumer: name, peer, range, installed });
  }
}
for (const [name, har] of [
  ['@react-native-ohos/react-native-screens', 'screens.har'],
  ['@react-native-ohos/react-native-safe-area-context', 'safe_area.har'],
  ['@react-native-ohos/react-native-gesture-handler', 'gesture_handler.har'],
  ['@react-native-ohos/react-native-worklets', 'worklets.har'],
  ['@react-native-ohos/react-native-reanimated', 'reanimated.har'],
]) {
  const file = path.join(path.dirname(appRequire.resolve(name + '/package.json')), 'harmony', har);
  result.nativeArchives[name] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
assert.equal(appRequire('./package.json').main, 'expo-router/entry');
console.log(JSON.stringify(result, null, 2));
