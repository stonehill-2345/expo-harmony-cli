import assert from 'node:assert/strict';
import test from 'node:test';

import {
  colorNumberToHex,
  resolveBackgroundColor,
} from '../src/main/ets/SystemUIColor.ts';

test('React Native signed and unsigned ARGB colors become lowercase RGB hex', () => {
  assert.equal(colorNumberToHex(-65536), '#ff0000');
  assert.equal(colorNumberToHex(0xff336699), '#336699');
  assert.equal(colorNumberToHex(0), '#000000');
});

test('invalid native color numbers are rejected', () => {
  assert.throws(() => colorNumberToHex(Number.NaN), /finite integer/);
  assert.throws(() => colorNumberToHex(1.5), /finite integer/);
  assert.throws(() => colorNumberToHex(0x100000000), /32-bit/);
  assert.throws(() => colorNumberToHex(-0x80000001), /32-bit/);
});

test('null resets to the real configuration color mode', () => {
  assert.equal(resolveBackgroundColor(null, 0), '#000000');
  assert.equal(resolveBackgroundColor(null, 1), '#ffffff');
  assert.equal(resolveBackgroundColor(null, undefined), '#ffffff');
  assert.equal(resolveBackgroundColor(-16711936, 0), '#00ff00');
});
