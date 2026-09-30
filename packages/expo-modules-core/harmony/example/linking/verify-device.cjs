// Operates only the A integration fixture, using real Wants and the public reload button.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const [hdc, target, mode, output] = process.argv.slice(2);
if (!hdc || !target || !['debug', 'release'].includes(mode) || !output) throw new Error('Usage: HDC TARGET debug|release NEW_OUTPUT_DIR');
if (fs.existsSync(output)) throw new Error('Refusing to overwrite evidence');
fs.mkdirSync(output, { recursive: true });
const app = 'dev.expo.harmony.i0';
const prefix = 'lane-b-fixture://fixture/';
const quote = s => "'" + String(s).replaceAll("'", "'\\''") + "'";
const command = (...args) => execFileSync(hdc, ['-t', target, ...args], { encoding: 'utf8', timeout: 20000, maxBuffer: 32 * 1024 * 1024 }).trim();
const shell = (...args) => command('shell', args.map(quote).join(' '));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let pid, boot, latest, log = '';
let seenLines = new Set();
const collectedLines = [];
const read = () => {
  const snapshot = shell('hilog', '-x', '-P', pid);
  // hilog is a bounded ring. Preserve observed raw lines across polls instead
  // of treating evicted old records as lost events or missing earlier boots.
  for (const line of snapshot.split('\n')) {
    if (!seenLines.has(line)) { seenLines.add(line); collectedLines.push(line); }
  }
  log = collectedLines.join('\n');
  const rows = log.split('\n').filter(line => line.includes('I0_LINKING='))
    .map(line => JSON.parse(line.slice(line.indexOf('I0_LINKING=') + 'I0_LINKING='.length)));
  assert.ok(!rows.some(row => ['failure', 'removed-callback'].includes(row.kind)), JSON.stringify(rows.filter(row => ['failure', 'removed-callback'].includes(row.kind))));
  assert.ok(!/I0_MODULE_FAIL=|I0_STALE_ASSET_|EXPO_CORE_STALE_|EXPO_CORE_PUBLIC_RELOAD_ERROR=/.test(log), 'I0 failure/stale callback');
  return rows;
};
async function until(predicate) {
  for (let i = 0; i < 60; i++) { const rows = read(); if (predicate(rows)) return rows; await pause(500); }
  throw new Error('Timeout: ' + JSON.stringify(read().slice(-15)));
}
const start = uri => shell('aa', 'start', '-b', app, '-a', 'EntryAbility', ...(uri ? ['-U', uri] : []));
const save = phase => { read(); fs.writeFileSync(path.join(output, phase + '.log'), log); console.log(JSON.stringify({ phase, pid, boot })); };
function checkI0(phase, reload = false) {
  save(phase);
  execFileSync(process.execPath, [path.resolve(__dirname, '../tools/check-i0-log.cjs'), path.join(output, phase + '.log'), mode,
    ...(reload ? ['--reload'] : [])], { stdio: 'pipe' });
}
async function coreComplete() {
  await until(() => {
    const segment = log.slice(log.lastIndexOf('EXPO_CORE_BOOT='));
    return segment.includes('I0_ASSET_PASS=');
  });
}
async function cold(uri, phase) {
  shell('aa', 'force-stop', app);
  seenLines = new Set(); collectedLines.length = 0; log = '';
  start(uri);
  for (let i = 0; i < 20; i++) { pid = shell('pidof', app); if (/^\d+$/.test(pid)) break; await pause(500); }
  assert.match(pid, /^\d+$/);
  const rows = await until(rows => rows.some(r => r.kind === 'initial') && rows.some(r => r.kind === 'hook'));
  boot = rows.find(r => r.kind === 'top-level').boot; latest = uri ?? null;
  for (const kind of ['top-level','ready']) assert.equal(rows.find(r => r.kind === kind).latest, latest);
  assert.equal(rows.find(r => r.kind === 'initial').url, latest);
  assert.equal(rows.find(r => r.kind === 'hook').url, latest);
  assert.equal(rows.find(r => r.kind === 'top-level').dev, mode === 'debug');
  await coreComplete(); checkI0(phase);
}
async function warm(suffix, count, secondary, hook = true) {
  const url = prefix + suffix; start(url); latest = url;
  const rows = await until(rows => rows.some(r => r.boot === boot && r.kind === 'event' && r.received === count) &&
    rows.some(r => r.boot === boot && r.kind === 'rn-event' && r.url === url) &&
    (!hook || rows.some(r => r.boot === boot && r.kind === 'hook' && r.url === url)));
  const event = rows.find(r => r.boot === boot && r.kind === 'event' && r.received === count);
  assert.equal(event.url, url); assert.equal(event.latest, url); assert.equal(event.raw, count);
  assert.equal(event.secondary, secondary); assert.equal(event.removed, 0);
  await pause(300);
  if (suffix !== 'probe') {
    assert.equal(read().filter(r => r.boot === boot && r.kind === 'event').length, count);
    assert.equal(read().filter(r => r.boot === boot && r.kind === 'rn-event' && r.url).length, count);
  }
  save(`${count}-${suffix.split('?')[0]}`);
}
async function publicReload(round) {
  await coreComplete();
  const previous = boot;
  let acknowledged = false;
  for (let attempt = 1; attempt <= 3 && !acknowledged; attempt++) {
    const remote = '/data/local/tmp/i0-linking-layout.json';
    shell('uitest', 'dumpLayout', '-p', remote);
    const local = path.join(output, `layout-${round}-${attempt}.json`); command('file', 'recv', remote, local);
    let bounds;
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      const a = node.attributes;
      if (a?.type === 'Button' && a.text === 'Reload through Expo public API' && a.visible === 'true') bounds = a.bounds;
      for (const value of Object.values(node)) walk(value);
    }
    walk(JSON.parse(fs.readFileSync(local))); assert.ok(bounds, 'Public reload button not visible');
    const [x1,y1,x2,y2] = bounds.match(/\d+/g).map(Number);
    const before = log.split('EXPO_CORE_PUBLIC_RELOAD_REQUEST=').length;
    const response = shell('uitest', 'uiInput', 'click', String(Math.round((x1+x2)/2)), String(Math.round((y1+y2)/2)));
    console.log(JSON.stringify({ phase: 'reload-click', round, attempt, bounds, response }));
    for (let poll = 0; poll < 6; poll++) {
      await pause(500); read();
      if (log.split('EXPO_CORE_PUBLIC_RELOAD_REQUEST=').length > before) { acknowledged = true; break; }
    }
  }
  assert.ok(acknowledged, 'UI input did not invoke public reload; no runtime outcome inferred');
  const rows = await until(rows => rows.some(r => r.kind === 'ready' && r.boot !== previous && r.boot > previous));
  const next = rows.filter(r => r.kind === 'top-level').at(-1); boot = next.boot;
  assert.equal(next.latest, latest, 'Ability URL lost on RN reload');
  await coreComplete();
  await until(() => {
    const tail = log.slice(log.lastIndexOf('EXPO_CORE_PUBLIC_RELOAD_REQUEST='));
    return tail.includes('EXPO_CORE_INTEROP_NATIVE_LATE_REJECTION destroyed=true') &&
      tail.includes('EXPO_CORE_VIEW_DELAYED_READ_FINISHED invalid=1 delay=1000');
  });
  assert.equal(shell('pidof', app), pid);
  checkI0(`reload${round}`, true);
  await warm(`after-reload-${round}`, 1, 1);
  assert.ok(!read().some(r => r.boot === previous && r.kind === 'event' && r.url === latest), 'Old Runtime received new Want');
}
async function run() {
  await cold(undefined, 'cold-null');
  await cold(prefix + 'cold?q=%E8%B5%84%E6%BA%90%20space#frag%20x', 'cold-uri');
  await warm('warm?q=%E8%B5%84#fragment',1,1);
  await warm('warm?q=%E8%B5%84#fragment',2,2);
  await warm('remove-secondary',3,3); await warm('after-remove',4,3);
  await warm('unmount-hook',5,3,false); await until(rows => rows.some(r => r.kind === 'hook-unmount'));
  const hooks = read().filter(r => r.kind === 'hook').length;
  await warm('after-unmount',6,3,false); assert.equal(read().filter(r => r.kind === 'hook').length,hooks);
  await warm('remount-hook',7,3); await warm('after-remount',8,3);
  start(); await pause(1000); assert.equal(read().filter(r => r.kind === 'event').length,8); save('empty-want');
  await warm('probe',9,3);
  await until(rows => rows.some(r => r.kind === 'probe-pass') && rows.some(r => r.kind === 'event' && r.url.endsWith('/self-open')));
  assert.ok(read().some(r => r.kind === 'open-pass' && r.result === true));
  assert.ok(read().some(r => r.kind === 'open-rejected' && r.url.startsWith('i0missing:')));save('public-api');
  await warm('remove-all',11,3,false); await until(rows => rows.some(r => r.kind === 'all-removed'));
  start(prefix+'all-removed');latest=prefix+'all-removed';await pause(1000);
  assert.equal(read().filter(r=>r.kind==='event').length,11);save('all-removed');
  for (let round=1;round<=3;round++) await publicReload(round);
  await pause(35000);checkI0('reload3-after-timeout',true);
  shell('uitest','uiInput','keyEvent','Home');await pause(1000);start();await pause(4000);
  await coreComplete();checkI0('foreground',true);
  // Actual public settings invocation, recorded separately from core link/event pass.
  start(prefix+'settings');await until(rows=>rows.some(r=>r.boot===boot && ['settings-resolved','settings-rejected'].includes(r.kind)));
  save('settings');fs.writeFileSync(path.join(output,'settings-ability-dump.txt'),shell('aa','dump','-a'));
  start();await pause(2000);save('final');
  console.log('LINKING_PUBLIC_DEVICE_PASS=' + mode);
}
run().catch(error => { if (log) fs.writeFileSync(path.join(output,'failure.log'),log); console.error(error); process.exitCode=1; });
