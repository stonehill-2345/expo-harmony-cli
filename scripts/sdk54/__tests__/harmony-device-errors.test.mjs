import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadM1Source } from '../m1-test-support.mjs';

const device = loadM1Source('packages/@expo/cli/src/harmony/device.ts');
const missingTarget = '[Fail]Not match target founded, check connect-key please\r\n';
const longTarget = "Sizeo of of parament '-t' 38 is too long\n";

async function withHdc(responses, run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harmony-device-errors-'));
  const hdc = path.join(root, 'hdc');
  await fs.writeFile(path.join(root, 'responses.json'), JSON.stringify(responses));
  await fs.writeFile(path.join(root, 'calls.jsonl'), '');
  await fs.writeFile(hdc, `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const log = path.join(__dirname, 'calls.jsonl');
const calls = fs.readFileSync(log, 'utf8').trim().split('\\n').filter(Boolean).length;
fs.appendFileSync(log, JSON.stringify(process.argv.slice(2)) + '\\n');
const responses = JSON.parse(fs.readFileSync(path.join(__dirname, 'responses.json'), 'utf8'));
const result = responses[calls] || {};
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exit(0);
`, { mode: 0o755 });
  try {
    await run(hdc, async () => (await fs.readFile(path.join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

const operations = [
  ['reverse', hdc => device.reverseHarmonyPortAsync(hdc, 'm2-no-device', 8081)],
  ['install', hdc => device.installHarmonyAppAsync(hdc, 'm2-no-device', '/tmp/app.hap')],
  ['launch', hdc => device.launchHarmonyAppAsync(hdc, 'm2-no-device', 'com.example.m2')],
];

for (const [name, run] of operations) {
  test(`${name} rejects an HDC stdout failure with exit code zero`, async () => {
    await withHdc([{ stdout: missingTarget }], async hdc => {
      await assert.rejects(run(hdc), error => {
        assert.equal(error.code, 'HARMONY_DEVICE');
        assert.ok(error.message.includes(missingTarget.trim()));
        return true;
      });
    });
  });
}

test('launch rejects an HDC stderr failure with exit code zero', async () => {
  await withHdc([{ stderr: missingTarget }], async hdc => {
    await assert.rejects(device.launchHarmonyAppAsync(hdc, 'm2-no-device', 'com.example.m2'), /Not match target founded/);
  });
});

test('launch rejects the real untagged HDC oversized argument diagnostic', async () => {
  await withHdc([{ stdout: longTarget }], async hdc => {
    await assert.rejects(device.launchHarmonyAppAsync(hdc, 'sdk54-m2-acceptance-unavailable-target', 'com.example.m2'), /38 is too long/);
  });
});

test('launch rejects fatal HDC diagnostics with exit code zero', async () => {
  await withHdc([{ stderr: '[F][2026-10-27 23:01:31] Send isDead channelId:4112870011\n' }], async hdc => {
    await assert.rejects(device.launchHarmonyAppAsync(hdc, 'm2-no-device', 'com.example.m2'), /Send isDead/);
  });
});

test('explicit missing device is checked against connected targets', async () => {
  await withHdc([{ stdout: '127.0.0.1:5555\n' }], async (hdc, calls) => {
    await assert.rejects(device.resolveHarmonyDeviceAsync(hdc, 'm2-no-device'), /m2-no-device.*not.*connected/i);
    assert.deepEqual(await calls(), [['list', 'targets']]);
  });
});

test('explicit connected device is selected from multiple targets', async () => {
  await withHdc([{ stdout: '127.0.0.1:5555\n127.0.0.1:5556\n' }], async (hdc, calls) => {
    assert.equal(await device.resolveHarmonyDeviceAsync(hdc, '127.0.0.1:5556'), '127.0.0.1:5556');
    assert.deepEqual(await calls(), [['list', 'targets']]);
  });
});

test('discovery rejects an HDC failure without treating it as a device or restarting', async () => {
  await withHdc([{ stdout: missingTarget }], async (hdc, calls) => {
    await assert.rejects(device.resolveHarmonyDeviceAsync(hdc), /Not match target founded/);
    assert.deepEqual(await calls(), [['list', 'targets']]);
  });
});

test('healthy discovery selects one target', async () => {
  await withHdc([{ stdout: '127.0.0.1:5555\n' }], async (hdc, calls) => {
    assert.equal(await device.resolveHarmonyDeviceAsync(hdc), '127.0.0.1:5555');
    assert.deepEqual(await calls(), [['list', 'targets']]);
  });
});

test('server connection failure still restarts once and retries discovery', async () => {
  await withHdc([{ stdout: 'Connect server failed\n' }, {}, { stdout: '127.0.0.1:5555\n' }], async (hdc, calls) => {
    assert.equal(await device.resolveHarmonyDeviceAsync(hdc), '127.0.0.1:5555');
    assert.deepEqual(await calls(), [['list', 'targets'], ['start', '-r'], ['list', 'targets']]);
  });
});

test('successful HDC command output is accepted', async () => {
  await withHdc([{ stdout: 'OK\n' }, { stdout: '[Success] install finish\n' }, { stdout: 'start ability successfully.\n' }], async hdc => {
    for (const [, run] of operations) await run(hdc);
  });
});
