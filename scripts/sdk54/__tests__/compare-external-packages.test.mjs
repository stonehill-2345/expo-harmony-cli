import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import test from 'node:test';
import { compareExternalPackages } from '../compare-external-packages.mjs';
test('reports identical public archives without leaking local paths', async () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'external-compare-')); const approved=path.join(root,'approved'); fs.mkdirSync(approved); fs.writeFileSync(path.join(approved,'pkg-1.0.0.tgz'),'same');
 const report=await compareExternalPackages({approvedDir:approved, descriptors:[{name:'pkg',version:'1.0.0',file:'pkg-1.0.0.tgz'}], npmClient:async (_n,_v,out)=>{const f=path.join(out,'pkg-1.0.0.tgz');fs.writeFileSync(f,'same');return f;}});
 assert.equal(report.packages[0].decision,'public-identical'); assert.doesNotMatch(JSON.stringify(report),new RegExp(root)); fs.rmSync(root,{recursive:true,force:true});
});
test('fails closed for unavailable or different archives', async () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'external-compare-')); fs.mkdirSync(path.join(root,'approved')); fs.writeFileSync(path.join(root,'approved/pkg-1.0.0.tgz'),'approved');
 const different=await compareExternalPackages({approvedDir:path.join(root,'approved'),descriptors:[{name:'pkg',version:'1.0.0',file:'pkg-1.0.0.tgz'}],npmClient:async(_n,_v,out)=>{const f=path.join(out,'pkg.tgz');fs.writeFileSync(f,'different');return f;}}); assert.equal(different.packages[0].decision,'fail-closed');
 const missing=await compareExternalPackages({approvedDir:path.join(root,'approved'),descriptors:[{name:'pkg',version:'1.0.0',file:'pkg-1.0.0.tgz'}],npmClient:async()=>{throw new Error('404');}}); assert.equal(missing.packages[0].publicAvailable,false); fs.rmSync(root,{recursive:true,force:true});
});
