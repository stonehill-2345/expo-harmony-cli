const fs = require('node:fs');
const assert = require('node:assert/strict');
const log = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : fs.readFileSync(0, 'utf8');
try {
  const rows = log.split('\n').filter(line => line.includes('I0_FONT='))
    .map(line => JSON.parse(line.slice(line.indexOf('I0_FONT=') + 'I0_FONT='.length)));
  assert.ok(!rows.some(row => row.kind === 'failure'), 'Font failure marker');
  const boots = rows.filter(row => row.kind === 'top-level');
  assert.ok(boots.length >= 1, 'Missing Font top-level');
  assert.equal(new Set(boots.map(row => row.boot)).size, boots.length, 'Font boot reused');
  let active;
  for (const row of rows) {
    if (row.kind === 'top-level') active = row.boot;
    assert.equal(row.boot, active, 'Old Runtime Font callback after new boot');
  }
  for (const boot of boots) {
    const group=rows.filter(row=>row.boot===boot.boot);
    for (const kind of ['static-pass','file-pass','remote-pass','font-utils-unsupported','unmounted-hook-finished','public-pass','material-layout']) assert.ok(group.some(row=>row.kind===kind),`Missing ${kind}`);
    const publicPass=group.find(row=>row.kind==='public-pass');
    for(const family of ['material','HookMaterial','MaterialFileAlias','MaterialRemoteAlias','UnmountedHookMaterial']) assert.ok(publicPass.fonts.includes(family),`Missing ${family}`);
    for(const family of ['MissingFont','EmptyFont','CorruptFont','']) assert.ok(group.some(row=>row.kind==='expected-rejection'&&row.family===family),`Missing rejection ${family}`);
    assert.ok(group.some(row=>row.kind==='hook'&&row.family==='HookMaterial'&&row.loaded===true),'Normal hook not loaded');
    assert.ok(group.some(row=>row.kind==='hook-unmount'&&row.family==='UnmountedHookMaterial'),'Slow hook did not unmount');
    const cleanup=group.findIndex(row=>row.kind==='hook-unmount'&&row.family==='UnmountedHookMaterial');
    assert.ok(!group.slice(cleanup+1).some(row=>row.kind==='hook'&&row.family==='UnmountedHookMaterial'&&row.loaded===true),'Unmounted hook updated after completion');
  }
  assert.ok(!/I0_STALE_ASSET_|EXPO_CORE_STALE_|I0_MODULE_FAIL=/.test(log),'Stale/core module failure');
  console.log(`FONT_PUBLIC_EVIDENCE=PASS boots=${boots.length}`);
} catch(error) { console.error(String(error));process.exitCode=1; }
