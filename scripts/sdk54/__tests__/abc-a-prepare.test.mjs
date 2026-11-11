import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createReleaseManifest } from '../release-catalog.mjs';

const command=path.resolve('scripts/sdk54/abc/a-prepare.mjs');
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'abc-a-prepare-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const packages=createReleaseManifest().packages.map((p,i)=>{
    const bytes=Buffer.from(`synthetic archive ${i}`),file=`${i}.tgz`;fs.writeFileSync(path.join(root,file),bytes);
    return {name:p.publishName,version:p.publishVersion,file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),integrity:'sha512-'+createHash('sha512').update(bytes).digest('base64')};
  });
  fs.writeFileSync(path.join(root,'candidate.json'),JSON.stringify({packages,failures:[]}));
  fs.writeFileSync(path.join(root,'release.json'),JSON.stringify({packages,failures:[]}));
  return root;
}
test('validates every frozen archive and release identity without altering files',async t=>{
  const {validateCandidate}=await import('../abc/a-prepare.mjs'); const root=fixture(t);
  const before=fs.readdirSync(root).map(f=>[f,fs.readFileSync(path.join(root,f))]);
  assert.equal(validateCandidate(root).packages.length,15);
  for(const [file,bytes] of before) assert.deepEqual(fs.readFileSync(path.join(root,file)),bytes);
});
for(const fault of ['hash','release','duplicate','empty','path']) test(`rejects candidate ${fault}`,async t=>{
  const {validateCandidate}=await import('../abc/a-prepare.mjs'); const root=fixture(t);const file=path.join(root,'candidate.json'),value=JSON.parse(fs.readFileSync(file));
  if(fault==='hash')fs.appendFileSync(path.join(root,'0.tgz'),'tampered');
  if(fault==='release')value.packages[0].version='0.0.0';
  if(fault==='duplicate')value.packages[1]=value.packages[0];
  if(fault==='empty')value.packages=[];
  if(fault==='path')value.packages[0].file='../escape.tgz';
  fs.writeFileSync(file,JSON.stringify(value));assert.throws(()=>validateCandidate(root));
});
test('CLI refuses missing candidate and preserves existing project/output',t=>{
  const root=fixture(t),project=path.join(root,'project'),output=path.join(root,'out');fs.mkdirSync(project);fs.writeFileSync(path.join(project,'keep'),'keep');
  const result=spawnSync(process.execPath,[command,'--scenario','navigation','--candidate',root,'--project',project,'--output',output],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/already exists/);assert.equal(fs.readFileSync(path.join(project,'keep'),'utf8'),'keep');assert.equal(fs.existsSync(output),false);
});
test('CLI help is callable from another working directory',()=>{assert.match(execFileSync(process.execPath,[command,'--help'],{cwd:os.tmpdir(),encoding:'utf8'}),/--candidate/);});

test('resource phase changes bytes at the same URI then disables plugins without touching dependencies',async t=>{
  const {advanceResources}=await import('../abc/a-resource-phase.mjs');const root=fixture(t);fs.mkdirSync(path.join(root,'fixtures'));
  fs.writeFileSync(path.join(root,'a-project.json'),JSON.stringify({scenario:'resources'}));fs.writeFileSync(path.join(root,'resource-state.json'),JSON.stringify({phase:'initial'}));fs.writeFileSync(path.join(root,'fixtures/data.json'),'initial');
  advanceResources(root,'updated');assert.equal(fs.readFileSync(path.join(root,'fixtures/data.json'),'utf8'),'{ "embedded": "updated" }\n');
  advanceResources(root,'removed');assert.equal(JSON.parse(fs.readFileSync(path.join(root,'resource-state.json'))).phase,'removed');
  assert.throws(()=>advanceResources(root,'updated'));
});

test('both scenarios include required icon/config and preserve original navigation pages',async t=>{
  const {writeScenarioFixtures}=await import('../abc/a-prepare.mjs');const root=fixture(t);
  for(const kind of ['resources','navigation']){
    const project=path.join(root,kind);fs.mkdirSync(project);
    if(kind==='resources'){
      const fonts=path.join(project,'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts');fs.mkdirSync(fonts,{recursive:true});fs.copyFileSync('packages/expo-font/harmony/example/fixtures/a-oracle-test.ttf',path.join(fonts,'MaterialIcons.ttf'));
    }
    writeScenarioFixtures(project,kind);assert.ok(fs.statSync(path.join(project,'icon.png')).size>0);
    if(kind==='navigation'){
      assert.equal(JSON.parse(fs.readFileSync(path.join(project,'app.json'))).expo.icon,'./icon.png');
      for(const file of ['(tabs)/index.tsx','(tabs)/_layout.tsx','details/[id].tsx','drawer/index.tsx','sheet-cases.tsx'])assert.deepEqual(fs.readFileSync(path.join(project,'app',file)),fs.readFileSync(path.join('packages/expo-modules-core/harmony/example/router/step3-app',file)));
    }else{
      const {createRequire}=await import('node:module');const config=createRequire(path.join(project,'package.json'))('./app.config.js');assert.equal(config.expo.icon,'./icon.png');assert.deepEqual(config.expo.plugins.map(p=>p[0]),['expo-font','expo-asset']);
    }
  }
});

test('resource oracle package uses the native staging convention and real source files',async t=>{
  const {oraclePackage}=await import('../abc/a-prepare.mjs');const root=fixture(t);const pkg=await oraclePackage(root);
  const members=execFileSync('tar',['-tzf',pkg.archive],{encoding:'utf8'});
  assert.match(members,/package\/harmony\/src\/main\/ets\/LaneBAssetOraclePackage.ets/);
  assert.match(members,/package\/harmony\/src\/main\/cpp\/CMakeLists.txt/);
  const module=JSON.parse(execFileSync('tar',['-xOf',pkg.archive,'package/expo-module.config.json'],{encoding:'utf8'}));
  assert.equal(module.harmony.cpp.cmakePath,'harmony/src/main/cpp');
  assert.match(execFileSync('tar',['-xOf',pkg.archive,'package/harmony/index.ets'],{encoding:'utf8'}),/\.\/src\/main\/ets\/LaneBAssetOraclePackage/);
  assert.deepEqual(execFileSync('tar',['-xOf',pkg.archive,'package/harmony/src/main/ets/LaneBAssetOraclePackage.ets']),fs.readFileSync('packages/expo-asset/harmony/example/native/ets/LaneBAssetOraclePackage.ets'));
});
