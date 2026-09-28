import { Asset } from 'expo-asset';
import { requireNativeModule } from 'expo-modules-core';
import { TurboModuleRegistry } from 'react-native';

function check(value, message) {
  if (!value) throw new Error(message);
}

// Call only after checkConstants succeeds. Each run needs a fresh server runId.
export async function checkAssets(serverOrigin, runId, embeddedModule) {
  const direct = TurboModuleRegistry.getEnforcing('ExpoAsset');
  const native = requireNativeModule('ExpoAsset');
  const oracle = TurboModuleRegistry.getEnforcing('LaneBAssetOracle');
  check(typeof native.downloadAsync === 'function', 'Core lost downloadAsync');
  const expected = 'lane-b-http-fixture-v1\n';
  const url = `${serverOrigin}/asset?run=${encodeURIComponent(runId)}`;
  const hash = '57da15c96e6521318434ca4b11b840cb';
  const count = async (uri) => {
    const response = await fetch(`${serverOrigin}/stats`);
    check(response.ok, 'server stats unavailable');
    const counts = await response.json();
    return counts[uri.slice(serverOrigin.length)] ?? 0;
  };
  const directUri = await direct.downloadAsync(url, hash, 'bin');
  check(oracle.readText(directUri) === expected, 'direct bytes');
  const beforeHit = await count(url);
  const coreUri = await native.downloadAsync(url, hash, 'bin');
  check(coreUri === directUri && oracle.readText(coreUri) === expected, 'Core bytes/cache');
  check(await count(url) === beforeHit, 'valid MD5 cache downloaded again');
  oracle.overwriteText(coreUri, 'corrupted-cache');
  check(oracle.readText(await native.downloadAsync(url, hash, 'bin')) === expected, 'MD5 repair');
  check(await count(url) === beforeHit + 1, 'MD5 repair request count');

  const asset = Asset.fromURI(`${serverOrigin}/nohash?run=${encodeURIComponent(runId)}`);
  check(!asset.downloaded && asset.localUri === null, 'initial state');
  const downloaded = await Promise.all([asset.downloadAsync(), asset.downloadAsync()]);
  check(downloaded.every((item) => item === asset), 'concurrent return identity');
  check(asset.downloaded && asset.localUri?.startsWith('file://'), 'downloaded state');
  check(oracle.readText(asset.localUri) === expected, 'official Asset bytes');
  check(Asset.fromURI(asset.uri) === asset, 'fromURI identity');
  check(Asset.fromModule(asset.uri) === asset, 'fromModule URL identity');
  check(await count(asset.uri) === 1, 'null-hash concurrent request count (use a fresh runId)');
  const unicode = Asset.fromURI(`${serverOrigin}/a%20b-%E8%B5%84%E6%BA%90?run=${encodeURIComponent(runId)}`);
  await unicode.downloadAsync();
  check(unicode.type === '' && oracle.readText(unicode.localUri) === expected, 'Unicode/space/no extension');

  const local = Asset.fromURI(asset.localUri);
  await local.downloadAsync();
  check(local.localUri === asset.localUri && oracle.readText(local.localUri) === expected, 'file URI');
  const embedded = Asset.fromModule(embeddedModule);
  await embedded.downloadAsync();
  check(embedded.downloaded && oracle.readText(embedded.localUri).includes('lane-b-svg-fixture'),
    'Metro embedded resource bytes');
  const loaded = await Asset.loadAsync([asset.uri, embeddedModule]);
  check(loaded.every((item) => item.downloaded && item.localUri?.startsWith('file://')), 'loadAsync');

  const failures = {};
  for (const [label, uri, pattern] of [
    ['http404', `${serverOrigin}/missing?run=${encodeURIComponent(runId)}`, /HTTP 404/],
    ['resourceMissing', `rawfile://missing-${runId}.txt`, /Unable to download asset/],
  ]) {
    const failedAsset = Asset.fromURI(uri);
    const results = await Promise.allSettled([failedAsset.downloadAsync(), failedAsset.downloadAsync()]);
    check(results.every((result) => result.status === 'rejected'), `${label} concurrent rejection`);
    const message = String(results[0].reason?.message ?? results[0].reason);
    check(pattern.test(message), `${label}: ${message}`);
    check(!failedAsset.downloaded && failedAsset.localUri === null, `${label} failure state`);
    failures[label] = message;
  }
  check(!oracle.listCache().some((name) => name.includes('.tmp-')), 'temporary file leak');
  return { localUri: asset.localUri, embeddedUri: embedded.localUri, failures };
}
