import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';

const inputs=process.env.SDK54_INPUTS;
test('pinned Harmony Screens public helper preserves dev errors, production fallback and last/fit mappings',{skip:!inputs&&'Set SDK54_INPUTS to the verified portable input set'},()=>{
  const filename='inputs/screens-4.9.0-upstream.tgz',archive=path.join(inputs,filename);
  const entry=JSON.parse(fs.readFileSync('docs/releases/sdk54-abc-20261111/inputs.json')).files.find(f=>f.path===filename);
  assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),entry.sha256);
  const source=execFileSync('tar',['-xOf',archive,'package/src/components/helpers/sheet.tsx'],{encoding:'utf8'});
  for(const dev of [false,true]){
    const context={exports:{},__DEV__:dev,require:()=>({Platform:{OS:'harmony'}})};
    vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
    const api=context.exports;
    assert.deepEqual(Array.from(api.resolveSheetAllowedDetents('fitToContents')),[-1]);
    assert.equal(api.resolveSheetInitialDetentIndex('last',2),2);assert.equal(api.resolveSheetLargestUndimmedDetent('last',2),2);
    for(const invalid of [NaN,-2,.5,3]){
      if(dev){assert.throws(()=>api.resolveSheetInitialDetentIndex(invalid,2));assert.throws(()=>api.resolveSheetLargestUndimmedDetent(invalid,2));}
      else {assert.equal(api.resolveSheetInitialDetentIndex(invalid,2),0);assert.equal(api.resolveSheetLargestUndimmedDetent(invalid,2),-1);}
    }
  }
});

test('both transformers reproduce the released hash and reject unknown/overwriting input',{skip:!inputs&&'Set SDK54_INPUTS to the verified portable input set'},async t=>{
  const os=await import('node:os');const root=fs.mkdtempSync(path.join(os.tmpdir(),'abc-a-har-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const archive=path.join(inputs,'inputs/screens-4.9.0-upstream.tgz');
  assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'e7ff0e51db375e69a1b15340c5edd7bbfc005dbedb53a6957605e50f63fa948c');
  const input=path.join(root,'input.har');fs.writeFileSync(input,execFileSync('tar',['-xOf',archive,'package/harmony/screens.har']));
  const scripts=['packages/expo-modules-autolinking/scripts/harmony/prepare-screens.py','packages/expo-modules-core/harmony/example/router/prepare-screens.py'];
  const outputs=scripts.map((script,i)=>{const out=path.join(root,`${i}.har`);execFileSync('python3',[script,'--input-har',input,'--output-har',out]);return fs.readFileSync(out);});
  assert.deepEqual(outputs[0],outputs[1]);
  const policy=JSON.parse(fs.readFileSync('packages/expo-modules-autolinking/scripts/harmony/released-compatibility.json')).artifacts.find(p=>p.transform==='screens-content-wrapper-v1');
  assert.equal(createHash('sha256').update(outputs[0]).digest('hex'),policy.outputSHA256);
  fs.writeFileSync(path.join(root,'unknown.har'),'unknown');
  assert.throws(()=>execFileSync('python3',[scripts[0],'--input-har',path.join(root,'unknown.har'),'--output-har',path.join(root,'bad.har')],{stdio:'pipe'}));assert.equal(fs.existsSync(path.join(root,'bad.har')),false);
  fs.writeFileSync(path.join(root,'conflict.har'),'keep');
  assert.throws(()=>execFileSync('python3',[scripts[0],'--input-har',input,'--output-har',path.join(root,'conflict.har')],{stdio:'pipe'}));assert.equal(fs.readFileSync(path.join(root,'conflict.har'),'utf8'),'keep');
});
