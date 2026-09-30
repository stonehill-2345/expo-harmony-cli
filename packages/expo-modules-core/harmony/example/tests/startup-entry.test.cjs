const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = process.env.EXPO_HARMONY_EXAMPLE_ROOT;
assert.ok(root, 'EXPO_HARMONY_EXAMPLE_ROOT must point to the installed standalone Core example');
const bundler = path.resolve(__dirname, '../bundle.cjs');
const output = path.join(root, 'harmony/entry/src/main/resources/rawfile/bundle.harmony.js');

function build(args) {
  execFileSync(process.execPath, [bundler, root, ...args], {
    cwd: root, env: process.env, timeout: 120000, stdio: 'pipe', maxBuffer: 8 * 1024 * 1024,
  });
  return fs.readFileSync(output, 'utf8');
}

test('--expo selects the real public Expo startup fixture', () => {
  assert.ok(fs.existsSync(path.join(root, 'expo-entry.ts')), 'Copy the SDK expo-entry.ts fixture into the example first');
  const bundle = build(['--expo']);
  assert.ok(bundle.includes('EXPO_STANDARD_STARTUP_REGISTERED'), 'Bundler ignored the standard Expo entry selection');
});

test('default entry remains the independent 8/8 Core regression fixture', () => {
  const bundle = build([]);
  assert.ok(bundle.includes('EXPO_CORE_EXAMPLE_RESULTS='));
  assert.ok(!bundle.includes('EXPO_STANDARD_STARTUP_REGISTERED'));
});
