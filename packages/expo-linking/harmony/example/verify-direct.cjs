// Operates only the dedicated Lane B fixture. Install its HAP before running.
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const [hdc, target] = process.argv.slice(2);
if (!hdc || !target) throw new Error('Usage: verify-direct.cjs HDC TARGET [--release]');
const bundle = 'dev.expo.laneb.linkingfixture';
const release = process.argv.includes('--release');
const shell = (...args) => {
  const output = execFileSync(hdc, ['-t', target, 'shell', ...args], { encoding: 'utf8', timeout: 15000 }).trim();
  if (/^\[Fail\]|^error:/im.test(output)) throw new Error(output);
  return output;
};
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));
let pid;
function records() {
  return shell('hilog', '-x', '-P', pid, '-e', 'LANE_B_LINKING').split('\n').flatMap((line) => {
    const start = line.indexOf('LANE_B_LINKING {');
    return start < 0 ? [] : [JSON.parse(line.slice(start + 'LANE_B_LINKING '.length))];
  });
}
async function until(predicate) {
  for (let i = 0; i < 25; i++) {
    const rows = records();
    if (predicate(rows)) return rows;
    await pause();
  }
  throw new Error('Timed out; records=' + JSON.stringify(records()));
}
const start = (uri) => shell('aa', 'start', '-b', bundle, '-a', 'EntryAbility', ...(uri ? ['-U', uri] : []));
async function cold(uri) {
  shell('aa', 'force-stop', bundle);
  start(uri);
  for (let i = 0; i < 10; i++) {
    pid = shell('pidof', bundle);
    if (/^\d+$/.test(pid)) break;
    await pause();
  }
  assert.match(pid, /^\d+$/);
  const rows = await until((rows) => rows.some((row) => row.kind === 'initial'));
  assert.equal(rows.find((row) => row.kind === 'ready').latest, uri ?? null);
  assert.equal(rows.find((row) => row.kind === 'ready').dev, !release);
  assert.equal(rows.find((row) => row.kind === 'initial').url, uri ?? null);
  console.log(JSON.stringify({ phase: 'cold', pid, rows }));
}
async function warm(path, expected, secondary) {
  const url = 'laneblinking://fixture/' + path;
  start(url);
  const rows = await until((rows) => rows.filter((row) => row.kind === 'event').length >= expected);
  const last = rows.filter((row) => row.kind === 'event')[expected - 1];
  assert.equal(last.url, url);
  assert.equal(last.latest, url);
  assert.equal(last.removed, 0);
  if (secondary !== undefined) assert.equal(last.secondary, secondary);
  console.log(JSON.stringify({ phase: path, pid, event: last }));
}
async function run() {
  assert.equal(shell('pidof', 'com.expo.harmonycoretest'), '', 'A test app is running');
  await cold();
  await cold('laneblinking://fixture/cold?query=%E8%B5%84%E6%BA%90%20space');
  await warm('warm', 1, 1);
  await warm('warm', 2, 2);
  await warm('remove-secondary', 3, 3);
  await warm('after-remove', 4, 3);
  start();
  await pause();
  assert.equal(records().filter((row) => row.kind === 'event').length, 4);
  if (!release) {
    await warm('reload', 5, 3);
    const reloaded = await until((rows) => rows.filter((row) => row.kind === 'ready').length === 2);
    assert.equal(reloaded.filter((row) => row.kind === 'ready').at(-1).latest, 'laneblinking://fixture/reload');
    assert.equal(shell('pidof', bundle), pid, 'Reload must stay in the same process');
    await warm('after-reload', 6, 1);
    assert.equal(records().filter((row) => row.kind === 'event').at(-1).received, 1);
    await warm('probe', 7, 2);
  } else {
    await warm('probe', 5, 3);
  }
  const rows = await until((rows) => rows.some((row) => row.kind === 'openURL-error') &&
    rows.some((row) => row.kind === 'event' && row.url.endsWith('/self-open')));
  assert.equal(rows.find((row) => row.kind === 'canOpenURL' && row.url.startsWith('laneblinking:')).result, true);
  assert.equal(rows.find((row) => row.kind === 'canOpenURL' && row.url.startsWith('lanebmissing:')).result, false);
  assert.ok(rows.some((row) => row.kind === 'openURL' && row.url.endsWith('/self-open')));
  assert.ok(rows.some((row) => row.kind === 'openURL-error' && row.url.startsWith('lanebmissing:')));
  for (const event of rows.filter((row) => row.kind === 'event')) {
    assert.ok(rows.some((row) => row.kind === 'rn-event' && row.url === event.url));
  }
  assert.equal(rows.filter((row) => row.kind === 'event').length, release ? 6 : 8);
  console.log(JSON.stringify({ phase: 'complete', pid, rows: records() }));
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
