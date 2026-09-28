const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('prepare-native-check accepts the official RNOH JSON5 manifest shape', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-browser-prepare-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const donor = path.join(root, 'react_native_openharmony');
  const output = path.join(root, 'output');
  fs.mkdirSync(donor);
  fs.writeFileSync(
    path.join(donor, 'oh-package.json5'),
    "{\n  license: 'MIT',\n  name: '@rnoh/react-native-openharmony',\n  version: '0.82.30',\n}\n",
  );

  const stdout = execFileSync(
    process.execPath,
    [path.join(__dirname, 'prepare-native-check.cjs'), output, donor],
    {
      encoding: 'utf8',
      env: { ...process.env, EXPO_HARMONY_TOOLING_ROOT: process.env.EXPO_HARMONY_TOOLING_ROOT },
    },
  );
  assert.equal(path.resolve(stdout.trim()), output);
  assert.equal(fs.existsSync(path.join(output, 'browser/src/main/ets/ExpoModulesLifecycle.ets')), true);
});
