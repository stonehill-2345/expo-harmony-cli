import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { repository } from '../abc/a-common.mjs';
import { completeOtherLog } from './abc-other-log-fixtures.mjs';

const checker = path.join(repository, 'scripts/sdk54/abc/check-other-log.cjs');

const run = (log, mode = 'release', extra = []) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-other-log-')), 'device.log');
  fs.writeFileSync(file, log);
  const result = spawnSync(process.execPath, [checker, file, mode, ...extra], { encoding: 'utf8' });
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
  return result;
};

test('accepts a complete aligned Other log in release mode', () => {
  const result = run(completeOtherLog(), 'release', ['--reload']);
  assert.equal(result.status, 0, result.stderr);
  for (const name of ['M4-A03-splash', 'M4-A03-status-bar', 'M4-A03-system-ui', 'M4-A05-browser', 'M4-A04-linking-router', 'M4-A07-package-sync']) {
    assert.match(result.stdout, new RegExp(`${name}=PASS`), result.stdout + result.stderr);
  }
  assert.match(result.stdout, /OTHER_RELEASE_RESULT=PASS/);
});

test('accepts the auto splash scenario without held markers', () => {
  const result = run(completeOtherLog({ splashScenario: 'auto' }), 'release');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /M4-A03-splash=PASS/);
});

test('rejects a user splash that skips hide-request', () => {
  const log = completeOtherLog().split('\n').filter(row => !row.includes('"kind":"hide-request"')).join('\n');
  const result = run(log, 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /hide-request/);
});

test('rejects a status bar stage with the wrong color', () => {
  const log = completeOtherLog().replace('"statusBarColor":"#ff445566"', '"statusBarColor":"#ff0000ff"');
  const result = run(log, 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /imperative-shown color mismatch/);
});

test('rejects a hidden status phase that still shows the top bar', () => {
  const log = completeOtherLog().replace('"name":"component-hidden","bars":{"visibleTopHeight":0', '"name":"component-hidden","bars":{"visibleTopHeight":136');
  const result = run(log, 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /component-hidden must hide the top bar/);
});

test('rejects a missing status bar phase', () => {
  const log = completeOtherLog().split('\n').filter(row => !row.includes('"name":"stack-restore"')).join('\n');
  const result = run(log, 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing status phase: stack-restore/);
});

test('rejects a concurrent SystemUI stage that reports the wrong winner', () => {
  const log = completeOtherLog().replace('"name":"concurrent","color":"#336699"', '"name":"concurrent","color":"#112233"');
  const result = run(log, 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /concurrent color mismatch/);
});

test('rejects SystemUI stages that run out of order', () => {
  const rows = completeOtherLog().split('\n');
  const solid = rows.findIndex(row => row.includes('"name":"solid"'));
  const persist = rows.findIndex(row => row.includes('"name":"persist"'));
  [rows[solid], rows[persist]] = [rows[persist], rows[solid]];
  const result = run(rows.join('\n'), 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /out of order/);
});

test('rejects a SystemUI run without the background to active transition', () => {
  const log = completeOtherLog().split('\n').filter(row => !row.includes('"state":"background"')).join('\n');
  const result = run(log, 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing background -> active transition/);
});

// Real-capture regression: outputs/v1.7.0/B/20261114-02-capture (C-170-02).
// The fixture README requires the post-reload runtime to restore the persisted
// color before any further setter, so a causal restore-only boot is correct.
test('accepts a causal restore-only boot after the fixture reload request', () => {
  const result = run(completeOtherLog({ systemUiReloadReplay: true }), 'release', ['--reload']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /M4-A03-system-ui=PASS/);
});

test('rejects a SystemUI reload request before its complete setter sequence', () => {
  const rows = completeOtherLog({ systemUiReloadReplay: true }).split('\n');
  const reloadAt = rows.findIndex(row => row.includes('A04_SYSTEM_UI') && row.includes('"kind":"reload-request"'));
  const [reload] = rows.splice(reloadAt, 1);
  const bootAt = rows.findIndex(row => row.includes('A04_SYSTEM_UI') && row.includes('"kind":"boot"'));
  rows.splice(bootAt + 1, 0, reload);
  const result = run(rows.join('\n'), 'release', ['--reload']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Reload requested before the full SystemUI stage sequence/);
});

test('rejects a partial setter sequence after a causal SystemUI restore', () => {
  const rows = completeOtherLog({ systemUiReloadReplay: true }).split('\n');
  const restoreAt = rows.findIndex(row => row.includes('A04_SYSTEM_UI') && row.includes('"boot":1793345001000') && row.includes('"name":"restore"'));
  rows.splice(restoreAt + 1, 0, rows[restoreAt].replace('"name":"restore"', '"name":"solid"').replace('"color":"#336699"', '"color":"#b42318"'));
  const result = run(rows.join('\n'), 'release', ['--reload']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Restore-only SystemUI boot contains setter stages/);
});

test('rejects a restore boot whose color drifts from the persisted stage', () => {
  const log = completeOtherLog({ systemUiReloadReplay: true }).split('\n')
    .map(row => row.includes('"boot":1793345001000') && row.includes('"name":"restore"')
      ? row.replace('"color":"#336699"', '"color":"#ffffff"')
      : row)
    .join('\n');
  const result = run(log, 'release', ['--reload']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Restore color drifted from the persisted stage/);
});

test('rejects an orphan restore-only boot without a causal reload request', () => {
  const log = completeOtherLog({ systemUiReloadReplay: true }).split('\n')
    .filter(row => !row.includes('"kind":"reload-request"') || !row.includes('A04_SYSTEM_UI'))
    .join('\n');
  const result = run(log, 'release', ['--reload']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing SystemUI stage: solid/);
});

test('rejects an incomplete boot that requests the public reload', () => {
  const log = completeOtherLog({ systemUiStages: false }) + '\n'
    + 'A04_SYSTEM_UI=' + JSON.stringify({ boot: 1793345000000, dev: false, kind: 'reload-request' });
  const result = run(log, 'release', ['--reload']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Reload requested before the full SystemUI stage sequence/);
});

test('rejects a browser baseline missing one check', () => {
  const log = completeOtherLog().replace('"custom-tabs",', '');
  const result = run(log, 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /baseline checks mismatch/);
});

test('rejects a browser rejection with the wrong error code', () => {
  const log = completeOtherLog().replace('ERR_WEB_BROWSER_LOAD_FAILED', 'ERR_WEB_BROWSER_NOT_OPEN');
  const result = run(log, 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /load-failure code mismatch/);
});

test('rejects a browser request that never settles', () => {
  const log = completeOtherLog().split('\n').filter(row => !row.includes('"kind":"result","name":"manual-open"')).join('\n');
  const result = run(log, 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /manual-open/);
});

test('rejects a concurrent open that does not lock the second session', () => {
  const log = completeOtherLog().replace('"second":{"type":"locked"}', '"second":{"type":"open"}');
  const result = run(log, 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /locked/);
});

test('rejects an auth success without the real callback url', () => {
  const log = completeOtherLog().replace('"type":"success","url":"lanebbrowser://callback?code=123&state=device"', '"type":"success","url":"https://evil.example/cb"');
  const result = run(log, 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /auth-success.*url/);
});

test('rejects a programmatic dismiss whose pending session resolves differently', () => {
  const log = completeOtherLog().replace('"opened":{"type":"dismiss"}', '"opened":{"type":"cancel"}');
  const result = run(log, 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /programmatic dismiss/i);
});

test('rejects a browser baseline that runs after user requests', () => {
  const rows = completeOtherLog().split('\n');
  const baseline = rows.findIndex(row => row.includes('"kind":"baseline-pass"'));
  const firstRequest = rows.findIndex(row => row.includes('"kind":"request"'));
  [rows[baseline], rows[firstRequest]] = [rows[firstRequest], rows[baseline]];
  const result = run(rows.join('\n'), 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /baseline-pass/);
});

test('rejects status bar phases recorded before the splash is hidden', () => {
  const rows = completeOtherLog().split('\n');
  const hidden = rows.findIndex(row => row.includes('"kind":"hidden"'));
  const firstStage = rows.findIndex(row => row.includes('"name":"stack-light"'));
  [rows[hidden], rows[firstStage]] = [rows[firstStage], rows[hidden]];
  const result = run(rows.join('\n'), 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /stack-light/);
});

test('rejects a log without the router probe', () => {
  const log = completeOtherLog().split('\n').filter(row => !row.includes('A_ROUTER_PROBE')).join('\n');
  const result = run(log, 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing A_ROUTER_PROBE/);
});

test('rejects package sync when the core boot marker is absent', () => {
  const log = completeOtherLog().split('\n').filter(row => !row.includes('EXPO_CORE_BOOT=')).join('\n');
  const result = run(log, 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing EXPO_CORE_BOOT/);
});

test('rejects any fixture failure marker', () => {
  const log = completeOtherLog() + '\n' + 'A04_SYSTEM_UI=' + JSON.stringify({ boot: 1793345000000, dev: false, kind: 'failure', error: 'stage failed' });
  const result = run(log, 'release');
  assert.notEqual(result.status, 0);
});

test('rejects debug markers when the manifest mode is release', () => {
  const log = completeOtherLog().replaceAll('"dev":false', '"dev":true');
  const result = run(log, 'release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /dev flag differs/);
});

test('rejects a splash reload that reuses the same boot', () => {
  const log = completeOtherLog().split('\n').filter(row => !row.includes('1793344009000')).join('\n');
  const result = run(log, 'release', ['--reload']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No new splash boot after reload/);
});

test('rejects status phases stitched across different boots', () => {
  const rows = completeOtherLog().split('\n');
  const moved = [];
  const kept = rows.filter(row => {
    if (row.includes('"kind":"stage"') && /"name":"(?:shown|imperative-hidden|imperative-shown)"/.test(row)) {
      moved.push(row.replace('1793344000000', '1793344009000'));
      return false;
    }
    return true;
  });
  const result = run([...kept, ...moved].join('\n'), 'release', ['--reload']);
  assert.notEqual(result.status, 0, 'different boot fragments must not satisfy a complete status sequence');
  assert.match(result.stderr, /Missing status phase/);
});

test('rejects browser baseline without interaction scenarios', () => {
  const result = run(completeOtherLog({ browserCases: false }), 'release', ['--reload']);
  assert.notEqual(result.status, 0, 'baseline-only logs do not prove browser interactions');
  assert.match(result.stderr, /Missing browser request/);
});

test('accepts browser result objects emitted by the real fixture', () => {
  const log = completeOtherLog()
    .replaceAll('"second":"locked"', '"second":{"type":"locked"}')
    .replaceAll('"dismissed":"dismiss"', '"dismissed":{"type":"dismiss"}')
    .replaceAll('"opened":"dismiss"', '"opened":{"type":"dismiss"}');
  const result = run(log, 'release', ['--reload']);
  assert.equal(result.status, 0, result.stderr);
});
