const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const checker = path.resolve(__dirname, '../../../expo-modules-core/harmony/example/font/check-log.cjs');
const rows = [
  { kind: 'top-level' }, ...['static-pass','file-pass','remote-pass','unmounted-hook-finished','material-layout'].map(kind => ({ kind })),
  { kind: 'font-utils-pass', uri: 'file:///cache/image.png', width: 24, height: 24, scale: 2 },
  { kind: 'public-pass', fonts: ['material','HookMaterial','MaterialFileAlias','MaterialRemoteAlias','UnmountedHookMaterial'] },
  ...['MissingFont','EmptyFont','CorruptFont',''].map(family => ({ kind: 'expected-rejection', family })),
  { kind: 'hook', family: 'HookMaterial', loaded: true },
  { kind: 'hook-unmount', family: 'UnmountedHookMaterial' },
];
const run = input => spawnSync(process.execPath, [checker], { encoding: 'utf8',
  env: { ...process.env, EXPO_FONT_LEGACY_V1_EVIDENCE: '' },
  input: input.map(row => 'I0_FONT=' + JSON.stringify({ boot: 1, ...row })).join('\n') });
test('current checker requires renderer evidence and rejects the old unsupported marker', () => {
  assert.equal(run(rows).status, 0);
  assert.equal(run(rows.map(row => row.kind === 'font-utils-pass' ? { kind: 'font-utils-unsupported' } : row)).status, 1);
});
test('current checker rejects malformed image metadata', () => {
  for (const patch of [{ uri: 'http://fixture/a.png' }, { width: 0 }, { scale: -1 }, { height: '24' }]) {
    assert.equal(run(rows.map(row => row.kind === 'font-utils-pass' ? { ...row, ...patch } : row)).status, 1);
  }
});
