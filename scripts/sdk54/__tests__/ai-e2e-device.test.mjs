import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { jpeg } from './ai-e2e-fixtures.mjs';
import { collectDeviceEvidence, resolveDevice, startTestApp, stopTestApp } from '../ai-e2e/device.mjs';

function fakeHdc(t, targets = ['device-1', 'device-2'], screenshot = jpeg) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-ai-e2e-device-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = path.join(root, 'calls.jsonl');
  const hdc = path.join(root, 'hdc');
  fs.writeFileSync(calls, '');
  fs.writeFileSync(hdc, `#!${process.execPath}
const fs=require('fs');
const path=require('path');
const args=process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');
if(args.join(' ')==='list targets'){process.stdout.write(${JSON.stringify(targets.join('\n') + '\n')});process.exit(0)}
const command=args.slice(2);
if(command[0]==='shell'&&command[1]==='pidof'){process.stdout.write('4321\\n');process.exit(0)}
if(command[0]==='shell'&&command[1]==='hilog'){process.stdout.write('DEVICE_ASSERTION_PASS\\n');process.exit(0)}
if(command[0]==='shell'&&command[1]==='snapshot_display'){process.stdout.write('snapshot ok\\n');process.exit(0)}
if(command[0]==='file'&&command[1]==='recv'){
  fs.mkdirSync(path.dirname(command[3]),{recursive:true});
  fs.writeFileSync(command[3],Buffer.from(${JSON.stringify(screenshot.toString("base64"))},"base64"));
  process.exit(0);
}
if(command[0]==='shell'&&command[1]==='rm'){process.exit(0)}
if(command[0]==='shell'&&command[1]==='aa'&&command[2]==='force-stop'){process.exit(0)}
if(command[0]==='shell'&&command[1]==='aa'&&command[2]==='start'){process.exit(0)}
process.stderr.write('[Fail] unexpected '+JSON.stringify(args));
process.exit(0);
`, { mode: 0o755 });
  return {
    hdc,
    outputDirectory: path.join(root, 'output'),
    calls: () => fs.readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)),
  };
}

test('requires an explicit connected target when multiple devices exist', async (t) => {
  const fixture = fakeHdc(t);
  await assert.rejects(resolveDevice({ ...fixture, hdcPath: fixture.hdc, requested: undefined }), /multiple Harmony targets/);
  await assert.rejects(resolveDevice({ ...fixture, hdcPath: fixture.hdc, requested: 'missing' }), /not connected/);
  assert.equal(await resolveDevice({ ...fixture, hdcPath: fixture.hdc, requested: 'device-2' }), 'device-2');
});

test('collects PID-scoped logs and a non-empty screenshot from only the selected target', async (t) => {
  const fixture = fakeHdc(t, ['device-2']);
  const relativeOutput = path.relative(process.cwd(), fixture.outputDirectory);
  const result = await collectDeviceEvidence({
    ...fixture,
    hdcPath: fixture.hdc,
    outputDirectory: relativeOutput,
    requested: 'device-2',
    bundleName: 'dev.example.test',
    screenshotName: 'first-screen',
  });

  assert.equal(result.target, 'device-2');
  assert.equal(result.pid, '4321');
  const receipt = JSON.parse(fs.readFileSync(path.join(fixture.outputDirectory, result.evidence[0].path)));
  assert.equal(receipt.kind, 'device-preflight');
  assert.equal(receipt.target, 'device-2');
  assert.equal(receipt.pidCommand.exitCode, 0);
  assert.equal(receipt.logCommand.exitCode, 0);
  assert.deepEqual(result.evidence.map(({ type }) => type), ['device-assertion', 'screenshot']);
  assert.ok(result.evidence.every(({ path: file }) => fs.existsSync(path.join(fixture.outputDirectory, file))));
  assert.deepEqual(fixture.calls(), [
    ['list', 'targets'],
    ['-t', 'device-2', 'shell', 'pidof', 'dev.example.test'],
    ['-t', 'device-2', 'shell', 'hilog', '-x', '-P', '4321'],
    ['-t', 'device-2', 'shell', 'snapshot_display', '-f', '/data/local/tmp/sdk54-first-screen.jpeg'],
    ['-t', 'device-2', 'file', 'recv', '/data/local/tmp/sdk54-first-screen.jpeg', path.join(fixture.outputDirectory, 'device/first-screen.jpeg')],
    ['-t', 'device-2', 'shell', 'rm', '-f', '/data/local/tmp/sdk54-first-screen.jpeg'],
  ]);
});

test('stops only the requested test bundle on the selected target', async (t) => {
  const fixture = fakeHdc(t, ['device-2']);
  await stopTestApp({ ...fixture, hdcPath: fixture.hdc, target: 'device-2', bundleName: 'dev.example.test' });
  assert.deepEqual(fixture.calls(), [
    ['-t', 'device-2', 'shell', 'aa', 'force-stop', 'dev.example.test'],
  ]);
});

test('starts only the requested ability and test bundle on the selected target', async (t) => {
  const fixture = fakeHdc(t, ['device-2']);
  await startTestApp({
    ...fixture,
    hdcPath: fixture.hdc,
    target: 'device-2',
    bundleName: 'dev.example.test',
    abilityName: 'EntryAbility',
  });
  assert.deepEqual(fixture.calls(), [
    ['-t', 'device-2', 'shell', 'aa', 'start', '-a', 'EntryAbility', '-b', 'dev.example.test'],
  ]);
});

test('rejects a truncated device screenshot and still cleans its remote file', async t => {
  const fixture = fakeHdc(t, ['device-2'], Buffer.from([255, 216, 255, 217]));
  await assert.rejects(collectDeviceEvidence({ hdcPath: fixture.hdc, requested: 'device-2',
    bundleName: 'dev.example.test', screenshotName: 'invalid', outputDirectory: fixture.outputDirectory }), /Screenshot/);
  assert.deepEqual(fixture.calls().at(-1), ['-t', 'device-2', 'shell', 'rm', '-f', '/data/local/tmp/sdk54-invalid.jpeg']);
});
