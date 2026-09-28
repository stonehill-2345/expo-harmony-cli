import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCacheFilePath,
  getEmbeddedRawFilePath,
  normalizeFileUri,
  toFileUri,
} from '../src/main/ets/AssetCache.ts';

test('createCacheFilePath stays inside the application cache directory', () => {
  assert.equal(
    createCacheFilePath('/data/storage/el2/base/cache', '0123456789abcdef0123456789abcdef', 'png'),
    '/data/storage/el2/base/cache/ExponentAsset-0123456789abcdef0123456789abcdef.png'
  );
});

test('createCacheFilePath preserves the official no-extension shape', () => {
  assert.equal(
    createCacheFilePath('/data/storage/el2/base/cache/', '0123456789abcdef0123456789abcdef', ''),
    '/data/storage/el2/base/cache/ExponentAsset-0123456789abcdef0123456789abcdef.'
  );
});

test('createCacheFilePath rejects cache-key and extension traversal', () => {
  assert.throws(
    () => createCacheFilePath('/data/storage/el2/base/cache', '../escape', 'png'),
    /Invalid asset cache key/
  );
  assert.throws(
    () => createCacheFilePath('/data/storage/el2/base/cache', '0123456789abcdef0123456789abcdef', '../txt'),
    /Invalid asset type/
  );
});

test('toFileUri encodes spaces and Unicode without changing the file bytes path', () => {
  assert.equal(toFileUri('/data/storage/el2/base/cache/a b-资源.png'), 'file:///data/storage/el2/base/cache/a%20b-%E8%B5%84%E6%BA%90.png');
});

test('normalizeFileUri standardizes local paths without touching file bytes', () => {
  assert.equal(
    normalizeFileUri('file:///data/storage/el2/base/files/a%20b-%E8%B5%84%E6%BA%90.png'),
    'file:///data/storage/el2/base/files/a%20b-%E8%B5%84%E6%BA%90.png'
  );
});

test('getEmbeddedRawFilePath maps RNOH assets and explicit rawfiles', () => {
  assert.equal(getEmbeddedRawFilePath('asset://images/a%20b.png', 'assets/'), 'assets/images/a b.png');
  assert.equal(getEmbeddedRawFilePath('rawfile://fixtures/value.bin', 'assets/'), 'fixtures/value.bin');
  assert.equal(getEmbeddedRawFilePath('fonts/icon.ttf', 'assets/'), 'assets/fonts/icon.ttf');
});

test('getEmbeddedRawFilePath rejects absolute and traversal resource paths', () => {
  assert.throws(() => getEmbeddedRawFilePath('asset://../secret.txt', 'assets/'), /Invalid embedded asset path/);
  assert.throws(() => getEmbeddedRawFilePath('rawfile:///absolute.txt', 'assets/'), /Invalid embedded asset path/);
});
