import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { repository, json, sha256, writeJSON } from '../abc/a-common.mjs';
import { exportContract } from '../abc/a-export-contract.mjs';
import { bindRunner } from '../abc/a-bind-runner.mjs';
import { prepareRun } from '../abc/b-prepare-run.mjs';
import { verifyAContract } from '../abc/c-verify-handoff.mjs';

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'abc-a-contract-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const output=path.join(root,'handoff');
  const contract=exportContract({sourceRoot:repository,output});
  const consumerRoot=path.join(root,'consumers');fs.mkdirSync(consumerRoot);
  const runDirectory=path.join(root,'run');
  // These definitions are synthetic structural fixtures, never device acceptance.
  const commands={schemaVersion:1,stage:'V-02',cases:contract.runnerCases.map(row=>({
    id:row.id,semanticCaseIds:row.semanticCaseIds,
    command:{argv:[process.execPath,path.join(repository,'scripts/sdk54/abc/a-verify-device.mjs'),'--scenario','navigation','--run-dir',runDirectory],cwd:'.',timeoutMs:30000,
      evidence:row.requiredEvidence.filter(type=>type!=='command-log').map(type=>({type,path:`captures/${row.id}/${type}.json`}))},
  }))};
  const commandFile=path.join(root,'commands.json');writeJSON(commandFile,commands);
  return {root,output,contract,consumerRoot,runDirectory,commands,commandFile};
}
function bind(input, output=path.join(input.root,'bound')) {
  return bindRunner({contractFile:path.join(input.output,'a-contract.json'),commandFile:input.commandFile,consumerRoot:input.consumerRoot,runDirectory:input.runDirectory,output});
}

test('exports all real A semantics and hashed fixtures; C can review a relocated bundle without accepting devices',t=>{
  const f=fixture(t), moved=path.join(f.root,'moved');fs.renameSync(f.output,moved);
  const contract=json(path.join(moved,'a-contract.json'));
  assert.equal(contract.cases.length,23);
  const expected=[...json(path.join(repository,'docs/releases/sdk54-abc-20261111/a-sheet-contract.json')).cases.map(x=>x.caseId),'R01','R02','R03'].sort();
  assert.deepEqual(contract.cases.map(x=>x.caseId).sort(),expected);
  assert.deepEqual([...new Set(contract.runnerCases.flatMap(x=>x.semanticCaseIds))].sort(),expected);
  assert.equal(contract.runnerCases.length,19);
  assert.ok(contract.runnerCases.every(x=>!Object.hasOwn(x,'command')));
  for(const ref of contract.files)assert.equal(sha256(fs.readFileSync(path.join(moved,ref.path))),ref.sha256);
  const review=verifyAContract(path.join(moved,'a-contract.json'));
  assert.equal(review.valid,true,review.errors.join('; '));assert.equal(review.acceptanceReady,false);
  assert.equal(review.cases.length,23);assert.ok(review.blockers.some(x=>x.includes('NOT_RUN')));
  assert.ok(!JSON.stringify(contract).includes(repository));
  assert.equal(contract.stageClaims.step3,false);
  assert.ok(contract.files.some(ref=>ref.path==='scripts/sdk54/abc/a-check-font.py'),'Portable snapshot must include the pixel oracle invoked by the device verifier');
});

test('does not omit background/Native Tabs or reset original navigation captures',t=>{
  const {contract}=fixture(t), sheet=json(path.join(repository,'docs/releases/sdk54-abc-20261111/a-sheet-contract.json'));
  for(const c of sheet.cases)assert.deepEqual(contract.cases.find(x=>x.caseId===c.caseId).captures,c.captures);
  assert.ok(contract.runnerCases.find(x=>x.id==='V02-SHEET-CONTRACT').semanticCaseIds.includes('N02'));
  assert.ok(contract.runnerCases.find(x=>x.id==='V02-SHEET-CONTRACT').semanticCaseIds.includes('N03'));
  assert.deepEqual(contract.cases.find(x=>x.caseId==='R01').captures,['initial','reload']);
  assert.match(contract.cases.find(x=>x.caseId==='R02').expected,/同.*URI|same URI/);
  assert.match(contract.cases.find(x=>x.caseId==='R03').expected,/拒绝|reject/);
});

test('rejects reuse, incorrect source hashes instead of overwriting output',t=>{
  const f=fixture(t);assert.throws(()=>exportContract({sourceRoot:repository,output:f.output}),/exists/);
  const sources=path.join(f.root,'sources');fs.mkdirSync(sources);
  fs.writeFileSync(path.join(sources,'screens-types'),'wrong pinned bytes');
  assert.throws(()=>exportContract({sourceRoot:repository,evidenceRoot:f.root,output:path.join(f.root,'bad')}),/SHA256|hash/);
  assert.equal(fs.existsSync(path.join(f.root,'bad')),false);
});

test('B requires an explicit complete command binding; absent commands never become placeholder PASS',t=>{
  const f=fixture(t);f.commands.cases.pop();writeJSON(f.commandFile,f.commands);
  assert.throws(()=>bind(f),/missing|coverage/i);assert.equal(fs.existsSync(path.join(f.root,'bound')),false);
});
for(const fault of ['duplicate','unknown','semantic omission','missing command','shell','cwd escape','evidence escape','missing evidence','changed fixture','changed semantics','stale review','cwd symlink','evidence symlink'])test(`binding rejects ${fault}`,t=>{
  const f=fixture(t);
  if(fault==='duplicate')f.commands.cases.push(f.commands.cases[0]);
  if(fault==='unknown')f.commands.cases[0].id='V02-UNKNOWN';
  if(fault==='semantic omission')f.commands.cases.find(x=>x.id==='V02-SHEET-CONTRACT').semanticCaseIds=['S01'];
  if(fault==='shell')f.commands.cases[0].command.shell=true;
  if(fault==='missing command')delete f.commands.cases[0].command;
  if(fault==='cwd escape')f.commands.cases[0].command.cwd='..';
  const device=f.commands.cases.find(x=>x.command?.evidence.length);
  if(fault==='evidence escape')device.command.evidence[0].path='../outside';
  if(fault==='missing evidence')device.command.evidence=[];
  if(fault==='changed fixture')fs.appendFileSync(path.join(f.output,f.contract.files[0].path),'tampered');
  if(fault==='changed semantics'){f.contract.cases.pop();writeJSON(path.join(f.output,'a-contract.json'),f.contract);}
  if(fault==='stale review'){
    const ref=f.contract.files.find(x=>x.path.endsWith('/c-case-review.json'));
    const file=path.join(f.output,ref.path),review=json(file);review.stages['V-02'].pop();writeJSON(file,review);
    ref.sha256=sha256(fs.readFileSync(file));writeJSON(path.join(f.output,'a-contract.json'),f.contract);
  }
  if(fault==='cwd symlink'){fs.symlinkSync(f.root,path.join(f.consumerRoot,'escape'));f.commands.cases[0].command.cwd='escape';}
  if(fault==='evidence symlink'){fs.mkdirSync(f.runDirectory);fs.symlinkSync(f.root,path.join(f.runDirectory,'escape'));device.command.evidence[0].path='escape/future.json';}
  writeJSON(f.commandFile,f.commands);assert.throws(()=>bind(f));assert.equal(fs.existsSync(path.join(f.root,'bound')),false);
});

test('binding refuses output reuse and preserves the original C review bytes',t=>{
  const f=fixture(t);bind(f);assert.throws(()=>bind(f),/exists/);
  assert.deepEqual(fs.readFileSync(path.join(f.root,'bound/c-case-review.json')),fs.readFileSync(path.join(repository,'docs/releases/sdk54-abc-20261111/c-case-review.json')));
});

test('actual B prepareRun accepts the generated V-02 projection with the checked-in C review',async t=>{
  const f=fixture(t);bind(f);
  const candidate=path.join(f.root,'candidate');fs.mkdirSync(candidate);
  // Minimal synthetic candidate for B input interoperability only.
  fs.writeFileSync(path.join(candidate,'fixture.tgz'),'synthetic');
  writeJSON(path.join(candidate,'candidate.json'),{packages:[{name:'synthetic',version:'0',file:'fixture.tgz',bytes:9,sha256:sha256(Buffer.from('synthetic'))}],failures:[]});
  const input={candidate,aContract:path.join(f.root,'bound/a-contract.json'),caseReview:path.join(f.root,'bound/c-case-review.json'),consumerRoot:f.consumerRoot,output:f.runDirectory,repositoryRoot:f.root,stage:'V-02',target:'synthetic-device',platformVersion:'synthetic',sourceRevision:'a'.repeat(40),sourceDirty:false};
  const result=await prepareRun(input);
  assert.equal(result.caseSet.cases.length,19);
  assert.deepEqual(Object.keys(result.manifest.caseCommands),f.contract.runnerCases.map(x=>x.id));
  assert.equal(result.manifest.caseCommands['V02-SHEET-CONTRACT'].argv[1],f.commands.cases[0].command.argv[1]);
  // Missing real captures remain a failure even after structural preparation succeeds.
  const command=result.manifest.caseCommands['V02-SHEET-CONTRACT'];
  const executed=spawnSync(command.argv[0],command.argv.slice(1),{cwd:command.cwd,encoding:'utf8'});
  assert.notEqual(executed.status,0);assert.match(executed.stderr,/a-device-evidence.json/);
  await assert.rejects(()=>prepareRun({...input,output:path.join(f.root,'dirty-run'),sourceDirty:true}),/source must be clean/);
});

test('export CLI help works outside the repository',()=>{
  const p=spawnSync(process.execPath,[path.join(repository,'scripts/sdk54/abc/a-export-contract.mjs'),'--help'],{cwd:os.tmpdir(),encoding:'utf8'});
  assert.equal(p.status,0);assert.match(p.stdout,/--source-root/);
});
