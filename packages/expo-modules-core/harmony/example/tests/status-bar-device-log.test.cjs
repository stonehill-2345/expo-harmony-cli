const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const root=process.env.EXPO_STATUS_BAR_EVIDENCE_ROOT||path.resolve(__dirname,'../../../../../docs/harmony-sdk54/evidence/2026-09-20-status-bar-v1');const checker=path.resolve(__dirname,'../status-bar/check-log.cjs');
const run=(input,args=[])=>spawnSync(process.execPath,[checker,...args],{input,encoding:'utf8'});
test('reload evidence requires exactly four real StatusBar boots',()=>{
 for(const mode of ['debug','release']){
  const original=fs.readFileSync(path.join(root,mode,'reload3-after-timeout.log'),'utf8');assert.equal(run(original,['--reload']).status,0);
  const segments=original.split('I0_STATUS_BAR=').filter(Boolean);const bootIds=[];for(const segment of segments){try{const row=JSON.parse(segment.split('\n')[0]);if(row.kind==='snapshot'&&row.label==='component-dark')bootIds.push(row.boot)}catch{}}
  const removed=original.split('\n').filter(line=>!line.includes(`"boot":${bootIds.at(-1)}`)).join('\n');const result=run(removed,['--reload']);assert.equal(result.status,1);assert.match(result.stderr,/four StatusBar boots/);
 }
});
test('checker rejects an old Runtime snapshot after a new boot',()=>{
 const original=fs.readFileSync(path.join(root,'debug/reload3-after-timeout.log'),'utf8');const old=original.split('\n').find(line=>line.includes('I0_STATUS_BAR=')&&line.includes('"label":"component-dark"'));const result=run(original+'\n'+old);assert.equal(result.status,1);assert.match(result.stderr,/Old Runtime/);
});
