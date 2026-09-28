const fs=require('node:fs');const assert=require('node:assert/strict');const args=process.argv.slice(2);const file=args.find(arg=>!arg.startsWith('--'));const reload=args.includes('--reload');const log=file?fs.readFileSync(file,'utf8'):fs.readFileSync(0,'utf8');
const colorMatches=(actual,expected)=>String(actual).replace('#','').toLowerCase().endsWith(expected.replace('#','').toLowerCase());
try{
 const rows=log.split('\n').filter(l=>l.includes('I0_STATUS_BAR=')).map(l=>JSON.parse(l.slice(l.indexOf('I0_STATUS_BAR=')+'I0_STATUS_BAR='.length)));
 assert.ok(!rows.some(r=>r.kind==='failure'),'StatusBar failure');let active;const seenBoots=new Set();
 for(const row of rows){if(row.kind==='snapshot'&&row.label==='component-dark'){if(seenBoots.has(row.boot)&&row.boot!==active)throw new Error('Old Runtime StatusBar callback after new boot');active=row.boot;seenBoots.add(row.boot)}assert.equal(row.boot,active,'Old Runtime StatusBar callback after new boot')}
 const boots=rows.filter(r=>r.kind==='snapshot'&&r.label==='component-dark').map(r=>r.boot);if(reload)assert.equal(boots.length,4,'Expected exactly four StatusBar boots');else assert.ok(boots.length>=1,'Missing StatusBar boot');assert.equal(new Set(boots).size,boots.length,'Boot reused');
 for(const boot of boots){const group=rows.filter(r=>r.boot===boot);const snap=label=>{const r=group.find(x=>x.kind==='snapshot'&&x.label===label);assert.ok(r,'Missing '+label);return r};
  const dark=snap('component-dark');assert.ok(colorMatches(dark.statusBarColor,'112233'));assert.equal(dark.isStatusBarLightIcon,false);assert.equal(dark.isLayoutFullScreen,true);
  const light=snap('stack-light');assert.ok(colorMatches(light.statusBarColor,'223344'));assert.equal(light.isStatusBarLightIcon,true);assert.equal(light.isLayoutFullScreen,true);
  const restore=snap('stack-restore-dark');assert.ok(colorMatches(restore.statusBarColor,'112233'));assert.equal(restore.isStatusBarLightIcon,false);
  const translucent=snap('imperative-light-translucent');assert.ok(colorMatches(translucent.statusBarColor,'445566'));assert.equal(translucent.isStatusBarLightIcon,true);assert.equal(translucent.isLayoutFullScreen,true);
  const hidden=snap('imperative-hidden');assert.equal(hidden.visibleTopHeight,0);assert.ok(hidden.fullTopHeight>0);
  const auto=snap('component-auto');assert.ok(colorMatches(auto.statusBarColor,'334455'));assert.equal(auto.isLayoutFullScreen,true);assert.equal(auto.isStatusBarLightIcon,auto.colorScheme==='dark');
  const inverted=snap('component-inverted');assert.ok(colorMatches(inverted.statusBarColor,'556677'));assert.equal(inverted.isStatusBarLightIcon,inverted.colorScheme!=='dark');
  assert.ok(group.some(r=>r.kind==='network-indicator-noop-boundary'));assert.ok(group.some(r=>r.kind==='public-pass'));
 }
 assert.ok(!/I0_STALE_ASSET_|EXPO_CORE_STALE_|I0_MODULE_FAIL=/.test(log),'Stale/I0 failure');console.log(`STATUS_BAR_PUBLIC_EVIDENCE=PASS boots=${boots.length}`);
}catch(error){console.error(String(error));process.exitCode=1}
