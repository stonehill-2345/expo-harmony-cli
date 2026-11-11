import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { verifyAContract, verifyHandoff, reviewRequiredCoverage } from '../abc/c-verify-handoff.mjs';
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
