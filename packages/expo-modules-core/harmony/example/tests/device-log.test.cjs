const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const tool = path.resolve(__dirname, '../tools/check-device-log.cjs');
const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'core-log-test-')), 'device.log');
const group = (marker, n, passed = true) => marker + JSON.stringify(Array.from({ length: n }, (_, i) => ({ name: String(i), passed, detail: 'test parser input' })));
const baseline = group('EXPO_CORE_EXAMPLE_RESULTS=', 8);
const probe = group('EXPO_CORE_INTEROP_RESULTS=', 16);
const context = group('EXPO_CORE_CONTEXT_RESULTS=', 7);
const uuid = group('EXPO_CORE_UUID_RESULTS=', 9);
const boundary = group('EXPO_CORE_BOUNDARY_RESULTS=', 5);
const view = group('EXPO_CORE_VIEW_RESULTS=', 5);
for (const [name, text, status] of [
  ['requires both result groups', baseline, 1],
  ['rejects truncated device JSON', baseline + '\nEXPO_CORE_INTEROP_RESULTS=[', 1],
  ['rejects failed native test', baseline + '\n' + group('EXPO_CORE_INTEROP_RESULTS=', 16, false), 1],
  ['requires exact test count', baseline + '\n' + group('EXPO_CORE_INTEROP_RESULTS=', 15), 1],
  ['requires Core context results', baseline + '\n' + probe, 1],
  ['requires UUID results', baseline + '\n' + probe + '\n' + context, 1],
  ['accepts complete passing groups', baseline + '\n' + probe + '\n' + context + '\n' + uuid + '\n' + boundary + '\n' + view, 0],
]) {
  test(name, () => {
    fs.writeFileSync(log, text);
    assert.equal(spawnSync(process.execPath, [tool, log]).status, status);
  });
}

const full = [baseline, probe, context, uuid, boundary, view].join('\n');
const boot = (id) => 'EXPO_CORE_BOOT=' + JSON.stringify({ id, dev: true });
const request = 'EXPO_CORE_PUBLIC_RELOAD_REQUEST=1';
const late = 'EXPO_CORE_INTEROP_NATIVE_LATE_REJECTION destroyed=true';
const viewPending = 'EXPO_CORE_VIEW_PENDING_RELOAD=1';
const viewFinished = 'EXPO_CORE_VIEW_DELAYED_READ_FINISHED invalid=1 delay=1000';
const reloaded = [boot(1), full, request, viewPending, boot(2), full, late, viewFinished].join('\n');
for (const [name, text, status] of [
  ['reload request must belong to the preceding boot', reloaded.replace(request, 'EXPO_CORE_PUBLIC_RELOAD_REQUEST=999'), 1],
  ['reload requires complete groups in every captured boot', [boot(1), full, request, boot(2), 'EXPO_CORE_PUBLIC_RELOAD_REQUEST=2', viewPending, boot(3), full, late, viewFinished].join('\n'), 1],
  ['reload requires the public request marker', [boot(1), full, boot(2), full, late].join('\n'), 1],
  ['reload requires a new boot', [boot(1), full, request, late].join('\n'), 1],
  ['reload cannot reuse pre-reload result groups', [boot(1), full, full, request, boot(2), late].join('\n'), 1],
  ['reload requires actual late native completion', reloaded.replace(late, ''), 1],
  ['reload requires pending view work', reloaded.replace(viewPending, ''), 1],
  ['reload requires completion of invalidated view work', reloaded.replace(viewFinished, ''), 1],
  ['reload rejects public API errors', reloaded + '\nEXPO_CORE_PUBLIC_RELOAD_ERROR=failure', 1],
  ['reload accepts new runtime and complete regression groups', reloaded, 0],
]) {
  test(name, () => {
    fs.writeFileSync(log, text);
    assert.equal(spawnSync(process.execPath, [tool, log, '--reload']).status, status);
  });
}
