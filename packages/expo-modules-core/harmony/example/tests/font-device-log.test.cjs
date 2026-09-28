const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const root=process.env.EXPO_FONT_EVIDENCE_ROOT||path.resolve(__dirname,'../../../../../docs/harmony-sdk54/evidence/2026-09-20-font-v1');const checker=path.resolve(__dirname,'../font/check-log.cjs');
const run=input=>spawnSync(process.execPath,[checker],{input,encoding:'utf8'});
test('Font checker accepts real D/R reload evidence and rejects missing visual/public records',()=>{
  for(const mode of ['debug','release']){
    const original=fs.readFileSync(path.join(root,mode,'reload3-after-timeout.log'),'utf8');assert.equal(run(original).status,0);
    const broken=original.split('\n').filter(line=>!line.includes('"kind":"material-layout"')).join('\n');const result=run(broken);assert.equal(result.status,1);assert.match(result.stderr,/material-layout/);
  }
});
test('Font checker rejects an old Runtime callback after a new boot',()=>{
  const original=fs.readFileSync(path.join(root,'debug/reload3-after-timeout.log'),'utf8');const old=original.split('\n').find(line=>line.includes('I0_FONT=')&&line.includes('"kind":"public-pass"'));assert.ok(old);const result=run(original+'\n'+old);assert.equal(result.status,1);assert.match(result.stderr,/Old Runtime/);
});
