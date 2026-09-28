import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import path from 'node:path';
const root = process.env.EXPO_FONT_FIXTURE_ROOT;
assert.ok(root, 'EXPO_FONT_FIXTURE_ROOT required');
test('serves exact MaterialIcons bytes and negative fixtures', async t => {
  const child = spawn(process.execPath, [path.resolve(import.meta.dirname, 'server.mjs'), root]);
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr.on('data', data => { stderr += String(data); });
    child.stdout.on('data', data => String(data).includes('FONT_HTTP_READY') && resolve());
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Font server exited ${code}: ${stderr}`)));
  });
  const requireApp = (await import('node:module')).createRequire(path.join(root, 'package.json'));
  const fs = await import('node:fs');
  const expected = fs.readFileSync(path.join(path.dirname(requireApp.resolve('@expo/vector-icons/package.json')), 'build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf'));
  const response = await fetch('http://127.0.0.1:18081/MaterialIcons.ttf');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
  assert.equal((await fetch('http://127.0.0.1:18081/empty.ttf')).headers.get('content-type'), 'font/ttf');
  assert.equal((await fetch('http://127.0.0.1:18081/corrupt.ttf')).status, 200);
});
