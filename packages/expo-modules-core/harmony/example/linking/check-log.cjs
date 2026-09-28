const fs = require('node:fs');
const assert = require('node:assert/strict');
const log = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : fs.readFileSync(0, 'utf8');
try {
  const rows = log.split('\n').filter(line => line.includes('I0_LINKING='))
    .map(line => JSON.parse(line.slice(line.indexOf('I0_LINKING=') + 'I0_LINKING='.length)));
  assert.ok(!rows.some(row => ['failure','removed-callback'].includes(row.kind)), 'Linking failure');
  let activeBoot;
  for (const row of rows) {
    if (row.kind === 'top-level') activeBoot = row.boot;
    assert.equal(row.boot, activeBoot, 'Old Runtime event after a new boot');
  }
  const boots = rows.filter(row => row.kind === 'top-level');
  assert.equal(boots.length, 4, 'Expected cold URI and three reload boots');
  assert.equal(new Set(boots.map(row => row.boot)).size, 4, 'Boot reused');
  for (let i=0;i<boots.length;i++) {
    const boot = boots[i]; const group = rows.filter(row=>row.boot===boot.boot);
    assert.ok(group.some(row=>row.kind==='ready' && row.latest===boot.latest), 'Missing ready/latest');
    assert.ok(group.some(row=>row.kind==='hook' && row.url===boot.latest), 'Missing public hook initial URL');
    assert.ok(group.some(row=>row.kind==='initial' && row.url===boots[0].latest), 'RN initial URL changed on reload');
    if(i>0) assert.equal(boot.latest, i===1?'lane-b-fixture://fixture/all-removed':`lane-b-fixture://fixture/after-reload-${i-1}`, 'Ability latest lost on reload');
    const events=group.filter(row=>row.kind==='event');
    for(let j=0;j<events.length;j++) {
      const event=events[j]; assert.equal(event.received,j+1,'Event sequence/old listener duplication');
      assert.equal(event.raw,j+1,'Direct and Core event mismatch');assert.equal(event.removed,0,'Removed listener called');
      assert.equal(event.latest,event.url,'Public latest mismatch');
      assert.ok(group.some(row=>row.kind==='rn-event' && row.url===event.url),'RN event missing');
    }
    if(i===0) {
      assert.equal(events.length,11,'Cold boot event count');
      assert.equal(events[0].url,events[1].url,'Duplicate Want not tested');
      assert.ok(events.slice(3).every(row=>row.secondary===3),'Removed secondary kept receiving');
      assert.ok(group.some(row=>row.kind==='hook-unmount'),'Missing unmount');
      assert.ok(!group.some(row=>row.kind==='hook' && row.url?.endsWith('/after-unmount')),'Unmounted hook received event');
      assert.ok(group.some(row=>row.kind==='hook' && row.url?.endsWith('/after-remount') && row.generation===2),'Missing remounted hook');
      for(const kind of ['config-pass','probe-pass','open-rejected','all-removed']) assert.ok(group.some(row=>row.kind===kind),'Missing '+kind);
      assert.ok(group.some(row=>row.kind==='open-pass' && row.result===true),'Public openURL success missing');
    }
  }
  assert.ok(!/I0_STALE_ASSET_|EXPO_CORE_STALE_|I0_MODULE_FAIL=/.test(log),'Stale or module failure');
  console.log('LINKING_PUBLIC_RELOAD_EVIDENCE=PASS boots=4');
} catch(error) { console.error(String(error));process.exitCode=1; }
