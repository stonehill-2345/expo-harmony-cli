import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeFontFileUri, validateFontRequest } from '../src/main/ets/FontFile.ts';

test('normalizes an absolute file URI with spaces and Unicode', () => {
  assert.equal(normalizeFontFileUri('file:///data/cache/a%20b-%E8%B5%84%E6%BA%90.ttf'), '/data/cache/a b-资源.ttf');
});

test('rejects unsupported, relative and malformed font URIs', () => {
  for (const uri of ['https://fixture/font.ttf', 'asset://font.ttf', 'file:relative.ttf', '/data/font.ttf', 'file:///bad%ZZ.ttf']) {
    assert.throws(() => normalizeFontFileUri(uri), /absolute file URI|Invalid font file URI/);
  }
});

test('validates non-empty font family and returns the native path', () => {
  assert.deepEqual(validateFontRequest('Material Icons', 'file:///data/cache/material.ttf'), {
    family: 'Material Icons', path: '/data/cache/material.ttf',
  });
  assert.throws(() => validateFontRequest('', 'file:///data/cache/material.ttf'), /Font family/);
  assert.throws(() => validateFontRequest('   ', 'file:///data/cache/material.ttf'), /Font family/);
});

function validSfnt() {
  const bytes = new Uint8Array(32);
  bytes.set([0x00, 0x01, 0x00, 0x00, 0x00, 0x01], 0);
  bytes.set([0x68,0x65,0x61,0x64], 12); // head
  bytes.set([0,0,0,28, 0,0,0,4], 20);
  return bytes;
}

test('accepts a structurally bounded sfnt and rejects corrupt table directories', async () => {
  const { validateSfntFont } = await import('../src/main/ets/FontFile.ts');
  assert.doesNotThrow(() => validateSfntFont(validSfnt()));
  assert.throws(() => validateSfntFont(new Uint8Array([1,2,3])), /valid TTF\/OTF/);
  const outOfBounds = validSfnt();
  outOfBounds.set([0,0,1,0], 24);
  assert.throws(() => validateSfntFont(outOfBounds), /table exceeds/);
  const collection = validSfnt(); collection.set([0x74,0x74,0x63,0x66],0);
  assert.throws(() => validateSfntFont(collection), /collection/);
});
