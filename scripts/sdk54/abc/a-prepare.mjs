import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { create as createTar } from 'tar';
import { startCandidateRegistry } from '../candidate-registry.mjs';
import { createReleaseManifest } from '../release-catalog.mjs';
import { verifyRelease } from '../verify-npm-release.mjs';
import { assertExternalConsumerWorkspace } from '../creation-workspace.mjs';
import { isMain, json, repository, scenario, sha256, writeJSON } from './a-common.mjs';

export function validateCandidate(directory) {
  const candidate=json(path.join(directory,'candidate.json')),release=json(path.join(directory,'release.json'));
  assert.deepEqual(candidate.failures,[],'Candidate has failures');assert.deepEqual(release.failures,[],'Release has failures');
  const expected=createReleaseManifest().packages;
  assert.equal(candidate.packages?.length,expected.length,'Incomplete candidate');
  assert.equal(release.packages?.length,expected.length,'Incomplete release');
  assert.equal(new Set(candidate.packages.map(p=>p.name)).size,expected.length,'Duplicate candidate');
  assert.equal(new Set(release.packages.map(p=>p.name)).size,expected.length,'Duplicate release package');
  const packages=expected.map(descriptor=>{
    const item=candidate.packages.find(p=>p.name===descriptor.publishName);
    assert.ok(item,`Missing ${descriptor.publishName}`);assert.equal(item.version,descriptor.publishVersion,'Candidate version mismatch');
    assert.ok(typeof item.file==='string' && path.basename(item.file)===item.file && item.file.endsWith('.tgz'),'Unsafe archive filename');
    const archive=fs.realpathSync(path.join(directory,item.file));
    assert.ok(archive.startsWith(fs.realpathSync(directory)+path.sep),'Archive escapes candidate');
    const bytes=fs.readFileSync(archive);assert.equal(bytes.length,item.bytes,'Archive size mismatch');assert.equal(sha256(bytes),item.sha256,'Archive hash mismatch');
    const released=release.packages.find(p=>p.name===item.name);
    assert.ok(released,'Missing release identity');assert.equal(released.version,item.version,'Release version mismatch');assert.equal(released.file,item.file,'Release filename mismatch');
    const integrity='sha512-'+createHash('sha512').update(bytes).digest('base64');assert.equal(integrity,released.integrity,'Release integrity mismatch');
    return {...item,integrity,archive};
  });
  return {packages,scope:candidate.scope==='LOCAL'?'LOCAL':'B_CANDIDATE_UNREVIEWED',manifestSha256:sha256(fs.readFileSync(path.join(directory,'candidate.json')))};
}

async function runInstall(pm, project, output, registry) {
  const argv=pm==='npm'?['install','--strict-peer-deps','--no-audit','--no-fund']:['install','--strict-peer-dependencies'];
  argv.push('--registry',registry);
  const stdout=fs.openSync(path.join(output,'install.stdout.log'),'wx'),stderr=fs.openSync(path.join(output,'install.stderr.log'),'wx');
  const startedAt=new Date().toISOString();
  const result=await new Promise(resolve=>{
    const child=spawn(pm,argv,{cwd:project,stdio:['ignore',stdout,stderr],detached:true,env:{...process.env,CI:'1',NODE_PATH:'',npm_config_registry:registry,npm_config_cache:path.join(output,'npm-cache'),npm_config_replace_registry_host:'never',npm_config_fetch_retries:'1',npm_config_fetch_timeout:'120000'}});
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;try{process.kill(-child.pid,'SIGKILL');}catch{}},900000);
    child.once('error',error=>{clearTimeout(timer);resolve({exitCode:null,error:error.message,timedOut});});
    child.once('exit',(exitCode,signal)=>{clearTimeout(timer);resolve({exitCode,signal,timedOut});});
  });
  fs.closeSync(stdout);fs.closeSync(stderr);
  writeJSON(path.join(output,'install-command.json'),{argv:[pm,...argv],cwd:project,startedAt,endedAt:new Date().toISOString(),...result});
  assert.equal(result.exitCode,0,'Candidate installation failed; inspect install logs');assert.equal(result.timedOut,false);
}

export async function oraclePackage(output) {
  const stage=path.join(output,'oracle-package');fs.mkdirSync(stage);
  fs.cpSync(path.join(repository,'packages/expo-asset/harmony/example/native'),path.join(stage,'harmony/src/main'),{recursive:true});
  const name='@expo-harmony/a-resource-oracle',version='0.0.1';
  writeJSON(path.join(stage,'package.json'),{name,version,main:'index.js'});
  fs.writeFileSync(path.join(stage,'index.js'),'module.exports = {};\n');
  fs.writeFileSync(path.join(stage,'harmony/index.ets'),"export { LaneBAssetOraclePackage } from './src/main/ets/LaneBAssetOraclePackage';\n");
  writeJSON(path.join(stage,'expo-module.config.json'),{platforms:['harmony'],harmony:{kind:'turbo-module',cpp:{packageClass:'lane_b::asset_oracle::LaneBAssetOraclePackage',header:'LaneBAssetOraclePackage.h',cmakeTarget:'lane_b_asset_oracle',cmakePath:'harmony/src/main/cpp'},ets:{packageClass:'LaneBAssetOraclePackage',importPath:name+'/harmony',entrypoint:'harmony/index.ets'}}});
  const archive=path.join(output,'a-resource-oracle.tgz');
  await createTar({gzip:true,file:archive,cwd:stage,prefix:'package',portable:true},fs.readdirSync(stage));
  return {name,version,archive,integrity:'sha512-'+createHash('sha512').update(fs.readFileSync(archive)).digest('base64')};
}

export function writeScenarioFixtures(project,kind) {
  scenario(kind);
  fs.copyFileSync(path.join(repository,'packages/expo-modules-core/harmony/example/host/harmony/AppScope/resources/base/media/app_icon.png'),path.join(project,'icon.png'));
  if(kind==='navigation'){
    const source=path.join(repository,'packages/expo-modules-core/harmony/example/router');
    fs.cpSync(path.join(source,'step3-app'),path.join(project,'app'),{recursive:true});
    for(const file of ['RouterProbe.tsx','SheetCases.ts'])fs.copyFileSync(path.join(source,file),path.join(project,file));
    fs.writeFileSync(path.join(project,'app.json'),JSON.stringify({expo:{name:'A navigation',slug:'a-navigation',scheme:'abcrouter',icon:'./icon.png',plugins:['expo-router'],harmony:{bundleName:'dev.expo.harmony.abc.navigation'}}},null,2)+'\n');
  }else{
    fs.mkdirSync(path.join(project,'fixtures'));
    fs.copyFileSync(path.join(project,'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf'),path.join(project,'fixtures/EmbeddedIcons.ttf'));
    fs.writeFileSync(path.join(project,'fixtures/data.json'),'{ "embedded": "initial" }\n');
    fs.copyFileSync(path.join(repository,'packages/expo-font/harmony/example/ResourceLifecycleApp.tsx'),path.join(project,'App.tsx'));
    fs.writeFileSync(path.join(project,'index.js'),"import { registerRootComponent } from 'expo'; import App from './App'; registerRootComponent(App);\n");
    writeJSON(path.join(project,'resource-state.json'),{phase:'initial'});
    fs.writeFileSync(path.join(project,'app.config.js'),`const {phase}=require('./resource-state.json');\nmodule.exports={expo:{name:'A resources',slug:'a-resources',icon:'./icon.png',harmony:{bundleName:'dev.expo.harmony.abc.resources'},plugins:phase==='removed'?[]:[['expo-font',{fonts:['./fixtures/EmbeddedIcons.ttf']}],['expo-asset',{assets:['./fixtures/data.json']}]]}};\n`);
  }
}

export async function prepare({scenario:kind,candidate,project,output,pm='npm'}) {
  scenario(kind);assert.ok(['npm','pnpm'].includes(pm),'Invalid package manager');
  for(const dir of [project,output])assert.equal(fs.existsSync(dir),false,`Directory already exists: ${dir}`);
  assertExternalConsumerWorkspace(project,repository);
  for(const [a,b] of [[project,output],[output,project],[output,candidate],[project,candidate]])assert.ok(a!==b&&!b.startsWith(a+path.sep)&&!a.startsWith(b+path.sep),'Overlapping paths');
  const validated=validateCandidate(candidate);
  assert.deepEqual(await verifyRelease(candidate,repository),[],'Release verification failed');
  // This is the B-owned package plan; A does not invent a parallel dependency graph.
  const require=createRequire(import.meta.url);
  const {buildReleasePackageJson}=require('../../../apps/cli/dist/sdk54/release-manifest.js');
  const manifest=buildReleasePackageJson({name:`a-${kind}`,version:'0.0.0',private:true,main:kind==='navigation'?'expo-router/entry':'index.js'},'default',createReleaseManifest());
  if(kind==='navigation')manifest.dependencies['@react-navigation/drawer']='7.5.0';
  fs.mkdirSync(output,{recursive:true});fs.mkdirSync(project,{recursive:true});
  const packages=[...validated.packages];
  if(kind==='resources'){const oracle=await oraclePackage(output);packages.push(oracle);manifest.dependencies[oracle.name]=oracle.version;}
  writeJSON(path.join(project,'package.json'),manifest);
  const identity={schemaVersion:1,scenario:kind,candidateSha256:validated.manifestSha256,scope:'PREPARED_NOT_ACCEPTED',candidateScope:validated.scope,pm,fixturePackages:packages.slice(validated.packages.length).map(p=>({name:p.name,version:p.version,sha256:sha256(fs.readFileSync(p.archive)),integrity:p.integrity}))};
  writeJSON(path.join(project,'a-project.json'),identity);
  const registry=await startCandidateRegistry(packages);
  try{await runInstall(pm,project,output,registry.registry);}finally{await registry.close();}
  const installed=[];
  for(const item of createReleaseManifest().packages){
    const file=path.join(project,'node_modules',item.installName,'package.json');
    // Some packages are transitive-only. Resolve them using the same project boundary.
    const resolved=fs.existsSync(file)?file:createRequire(path.join(project,'package.json')).resolve(`${item.installName}/package.json`);
    assert.ok(fs.realpathSync(resolved).startsWith(fs.realpathSync(project)+path.sep),'Dependency resolved outside the consumer');
    const actual=json(resolved);assert.equal(actual.name,item.publishName,`Official/local mix: ${item.installName}`);assert.equal(actual.version,item.publishVersion);
    installed.push({installName:item.installName,name:actual.name,version:actual.version,manifestSha256:sha256(fs.readFileSync(resolved))});
  }
  const graph=JSON.parse(execFileSync('npm',['query','*'],{cwd:project,encoding:'utf8',maxBuffer:32*1024*1024}));
  writeJSON(path.join(output,'dependency-graph.json'),graph);
  const official=new Set(createReleaseManifest().packages.map(p=>p.installName));
  for(const node of graph)assert.ok(!official.has(node.name),`Unexpected official product package: ${node.name}@${node.version}`);
  writeScenarioFixtures(project,kind);
  writeJSON(path.join(output,'prepare.json'),{...identity,installed,project,candidate,fixtureScope:'Independent A fixture; default/ExpoImage and formal matrix remain open',next:['npx --no-install expo prebuild --platform harmony','Use B runner to build, install, capture and verify; no installed dependency edits']});
  return identity;
}

if(isMain(import.meta.url)) {
  try{
    const {values}=parseArgs({options:{scenario:{type:'string'},candidate:{type:'string'},project:{type:'string'},output:{type:'string'},pm:{type:'string',default:'npm'},help:{type:'boolean'}}});
    if(values.help)console.log('a-prepare.mjs --scenario resources|navigation --candidate <B candidate directory> --project <new external directory> --output <new evidence directory> [--pm npm|pnpm]\nRequires Node 22, installed workspace tools and built apps/cli/dist. Uses the B package plan and read-only candidate registry. Does not build, launch, publish or claim acceptance.');
    else{for(const key of ['scenario','candidate','project','output'])assert.ok(values[key],`--${key} is required`);console.log(JSON.stringify(await prepare({...values,candidate:path.resolve(values.candidate),project:path.resolve(values.project),output:path.resolve(values.output)}),null,2));}
  }catch(error){console.error(error.stack);process.exitCode=1;}
}
