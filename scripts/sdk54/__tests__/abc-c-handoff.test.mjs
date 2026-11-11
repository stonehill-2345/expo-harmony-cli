import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, verifyAContract, verifyHandoff, reviewRequiredCoverage } from '../abc/c-verify-handoff.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const writeJson=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,`${JSON.stringify(value,null,2)}\n`);};
test('rejects absent delivery and forged summary without raw runs', t => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'c-handoff-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 assert.equal(verifyHandoff(root).valid,false);
 fs.writeFileSync(path.join(root,'result.json'),JSON.stringify({role:'B',dirty:false,tasks:[{status:'PASS'}],stageClaims:{step3:true}}));
 const result=verifyHandoff(root);
 assert.equal(result.valid,false);
 assert.ok(result.errors.some(e=>/candidate|run/i.test(e)));
});

test('rejects changed A assertion bytes and accepts exact contract references', t => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'c-a-contract-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const assertion=Buffer.from('{"expected":true}\n');
 fs.mkdirSync(path.join(root,'assertions')); fs.writeFileSync(path.join(root,'assertions/sheet.json'),assertion);
 const sha256=crypto.createHash('sha256').update(assertion).digest('hex');
 fs.writeFileSync(path.join(root,'a-contract.json'),JSON.stringify({schemaVersion:1,
  scenarios:[{id:'A-SHEET-01',input:{initialIndex:0},expected:{index:0},fixtureFiles:[],assertionFiles:[{path:'assertions/sheet.json',sha256}]}],
  nativeCapabilityBoundaries:[{id:'SHEET_NATIVE',status:'SUPPORTED'}]}));
 assert.equal(verifyAContract(root).valid,true);
 fs.writeFileSync(path.join(root,'assertions/sheet.json'),'changed');
 assert.equal(verifyAContract(root).valid,false);
});

test('preflight-only case sets cannot satisfy the required scenario families', () => {
 const review=reviewRequiredCoverage([{id:'V01-DEVICE-PREFLIGHT',required:true}]);
 assert.equal(review.valid,false);
 assert.deepEqual(review.missing,['resource lifecycle','Sheet','Drawer','orientation','CLI/M4']);
});

test('accepts the pulled A sheet contract schema while retaining device NOT_RUN as a blocker', () => {
 const contract=path.join(repo,'docs/releases/sdk54-abc-20261111/a-sheet-contract.json');
 const review=verifyAContract(contract,{sourceRoot:repo,devEcoSdkRoot:'/Applications/DevEco-Studio.app/Contents/sdk'});
 assert.equal(review.valid,true);
 assert.equal(review.cases.length,20);
 assert.equal(review.acceptanceReady,false);
 assert.ok(review.blockers.some(blocker=>/NOT_RUN/.test(blocker)));
 assert.ok(review.receipts.some(receipt=>receipt.sourceId==='harmony-transformer'));
});

test('discovers B frozen candidate and prepared run in their actual subdirectories', (t) => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'c-b-layout-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const candidateRoot=path.join(root,'candidate');
 const runRoot=path.join(root,'run');
 fs.mkdirSync(candidateRoot,{recursive:true});
 fs.mkdirSync(runRoot,{recursive:true});
 const archive=Buffer.from('candidate archive');
 fs.writeFileSync(path.join(candidateRoot,'fixture.tgz'),archive);
 writeJson(path.join(candidateRoot,'candidate.json'),{schemaVersion:1,packages:[{name:'fixture',version:'1.0.0',file:'fixture.tgz',bytes:archive.length,sha256:crypto.createHash('sha256').update(archive).digest('hex')}],failures:[]});
 writeJson(path.join(candidateRoot,'b-candidate.json'),{schemaVersion:1,source:{revision:'a'.repeat(40),dirty:false},runtimePackages:[],failures:[]});
 writeJson(path.join(candidateRoot,'release.json'),{release:'fixture',packages:[],failures:[]});
 fs.cpSync(candidateRoot,path.join(runRoot,'candidate'),{recursive:true});
 const candidateHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(runRoot,'candidate/candidate.json'))).digest('hex');
 writeJson(path.join(runRoot,'case-set.json'),{schemaVersion:1,cases:[]});
 writeJson(path.join(runRoot,'run-manifest.json'),{schemaVersion:1,source:{revision:'a'.repeat(40),dirty:false},candidate:{path:'candidate/candidate.json',sha256:candidateHash},caseSet:{path:'case-set.json',sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(runRoot,'case-set.json'))).digest('hex')}});
 const result=verifyHandoff(root);
 assert.equal(result.candidateSha256,candidateHash);
 assert.ok(result.runs.some(run=>run.path==='run'));
 assert.equal(result.errors.some(error=>/Handoff candidate\/source/.test(error)),false);
});

test('checked-in C review mirrors every B registry stage and evidence contract', () => {
 const registry=JSON.parse(fs.readFileSync(path.join(repo,'scripts/sdk54/ai-e2e/cases/registry.json')));
 const review=JSON.parse(fs.readFileSync(path.join(repo,'docs/releases/sdk54-abc-20261111/c-case-review.json')));
 for(const [stage,definitions] of Object.entries(registry.stages)) {
  assert.deepEqual(review.stages?.[stage],definitions.map(({id,requiredEvidence})=>({id,requiredEvidence})));
 }
});

test('CLI forwards the explicit source and DevEco SDK roots to A contract verification', (t) => {
 const handoff=fs.mkdtempSync(path.join(os.tmpdir(),'c-cli-handoff-'));
 const output=`${handoff}-output`;
 t.after(()=>{fs.rmSync(handoff,{recursive:true,force:true});fs.rmSync(output,{recursive:true,force:true});});
 const exitCode=main(['--handoff',handoff,'--a-contract',path.join(repo,'docs/releases/sdk54-abc-20261111/a-sheet-contract.json'),'--source-root',repo,'--deveco-sdk-root','/Applications/DevEco-Studio.app/Contents/sdk','--output',output]);
 assert.equal(exitCode,1);
 const verification=JSON.parse(fs.readFileSync(path.join(output,'handoff-verification.json')));
 assert.equal(verification.aContract.valid,true);
 assert.equal(verification.aContract.cases.length,20);
});
