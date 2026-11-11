import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyHandoff } from '../abc/c-verify-handoff.mjs';
test('rejects absent delivery and forged summary without raw runs', t => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'c-handoff-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 assert.equal(verifyHandoff(root).valid,false);
 fs.writeFileSync(path.join(root,'result.json'),JSON.stringify({role:'B',dirty:false,tasks:[{status:'PASS'}],stageClaims:{step3:true}}));
 const result=verifyHandoff(root);
 assert.equal(result.valid,false);
 assert.ok(result.errors.some(e=>/candidate|run/i.test(e)));
});
