import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { isMain, json, sha256, writeJSON } from './a-common.mjs';

const sheetPath='docs/releases/sdk54-abc-20261111/a-sheet-contract.json';
export const reviewPath='docs/releases/sdk54-abc-20261111/c-case-review.json';
export const registryPath='scripts/sdk54/ai-e2e/cases/registry.json';
const resourceSources=[
  ['resource-fixture','packages/expo-font/harmony/example/ResourceLifecycleApp.tsx'],
  ['resource-phase','scripts/sdk54/abc/a-resource-phase.mjs'],
  ['device-assertions','scripts/sdk54/abc/a-verify-device.mjs'],
  ['font-pixel-oracle','scripts/sdk54/abc/a-check-font.py'],
];

export function runnerMapping(cases, registry, review) {
  const semantic={
    'SHEET-CONTRACT':cases.filter(c=>/^S|^N0[23]$/.test(c.caseId)).map(c=>c.caseId),
    'DRAWER-GESTURE':['N01'], 'ORIENTATION':['S14'],
  };
  for(const family of ['FONT','ASSET'])for(const [phase,id] of Object.entries({LOAD:'R01',RELOAD:'R01',UPDATE:'R02',REMOVE:'R03'}))semantic[`${family}-${phase}`]=[id];
  for(const name of ['ADD','CHANGE','RENAME','REMOVE','ROLLBACK','OWNERSHIP'])semantic[`RESOURCE-${name}`]=[];
  semantic['CORE-M4']=[];semantic['OTHER-M4']=[];
  const definitions=registry.stages['V-02'];
  assert.equal(definitions.length,Object.keys(semantic).length,'Registry coverage changed; review A mapping');
  assert.deepEqual(review.stages['V-02'],definitions.map(({id,requiredEvidence})=>({id,requiredEvidence})),'C review differs from registry');
  const rows=definitions.map(row=>{
    const ids=semantic[row.id.replace(/^V02-/,'')];assert.ok(ids,`Unknown registry case: ${row.id}`);
    return {...row,semanticCaseIds:ids,
      captures:ids.flatMap(id=>{
        const c=cases.find(c=>c.caseId===id);assert.ok(c,`Missing semantic case: ${id}`);
        const captures=/-(FONT|ASSET)-LOAD$/.test(row.id)?['initial']: /-(FONT|ASSET)-RELOAD$/.test(row.id)?['reload']:c.captures;
        return captures.map(capture=>({caseId:id,capture}));
      }),
      executionScope:row.id==='V02-SHEET-CONTRACT'?'完整 Sheet；附加 N02 前后台、N03 原主页/Native Tabs 回归':ids.length?'采集后运行完整 resources/navigation 断言；不是单场景 verifier':row.id.includes('RESOURCE-')?'B 资源事务命令':'原 M4 完整覆盖命令；本契约的 23 场景不能替代',
      supplementalRequirements:row.id==='V02-FONT-UPDATE'?['R02 更新 Asset JSON，字体保持加载；FONT-UPDATE 仍需字体字节变化的独立采集和断言']:row.id==='V02-ORIENTATION'?['S14 验证应用请求横竖屏；还需 C 要求的物理旋转与系统方向证据']:[],
    };
  });
  assert.deepEqual([...new Set(rows.flatMap(row=>row.semanticCaseIds))].sort(),cases.map(c=>c.caseId).sort(),'Missing semantic coverage');
  return rows;
}

export function resourceCases() {
  return [
    {caseId:'R01',title:'首次加载与同进程 reload',props:{phase:['initial','reload']},captures:['initial','reload'],actions:['首次安装并加载 Font/Asset','写入持久 marker，再 reload（不重启进程）'],expected:'字体像素与 Asset 内容正确；reload 保持同 PID/HAP、同 URI 和 marker，boot identity 改变'},
    {caseId:'R02',title:'同 URI 内容更新',props:{phase:'updated'},captures:['updated'],actions:['a-resource-phase --phase updated','重新 prebuild/build，install -r；不卸载、不清缓存'],expected:'相同 URI 读取更新后的字节；字体继续正确加载，marker 保留，HAP rawfiles 与生成状态一致'},
    {caseId:'R03',title:'撤销插件并移除资源',props:{phase:'removed'},captures:['removed'],actions:['a-resource-phase --phase removed','重新 prebuild/build，install -r；不卸载、不清缓存'],expected:'字体不再加载；Asset 读取拒绝；HAP rawfiles、资源 manifest 与生成状态均无已移除资源'},
  ].map(c=>({...c,requirement:'M4_REQUIRED',deferredToM7:false,deviceStatus:'NOT_RUN',sourceIds:resourceSources.map(([id])=>id),hostTest:'scripts/sdk54/__tests__/abc-a-device.test.mjs + scripts/sdk54/__tests__/abc-a-prepare.test.mjs'}));
}

export function exportContract({sourceRoot, evidenceRoot, output}) {
  assert.ok(sourceRoot&&output,'sourceRoot and output are required');
  assert.ok(!fs.existsSync(output),`output exists: ${output}`);
  const root=fs.realpathSync(sourceRoot), sheet=json(path.join(root,sheetPath)), files=new Map(), blockers=[];
  function collect(relative, expected, inputRoot=root, destination=relative) {
    const file=path.resolve(inputRoot,relative), base=fs.realpathSync(inputRoot);
    assert.ok(!path.isAbsolute(relative)&&!relative.split(/[\\/]/).includes('..'),'Unsafe source path');
    assert.ok(fs.realpathSync(file).startsWith(base+path.sep),'Source symlink escapes root');
    const bytes=fs.readFileSync(file), hash=sha256(bytes);
    if(expected)assert.equal(hash,expected,`SHA256 mismatch: ${relative}`);
    files.set(destination,{path:destination,sha256:hash,bytes:bytes.length,data:bytes});
    return {path:destination,sha256:hash};
  }
  function tree(relative) {
    const file=path.join(root,relative), stat=fs.lstatSync(file);
    assert.ok(!stat.isSymbolicLink(),`Symlink in fixtures: ${relative}`);
    if(stat.isDirectory())for(const name of fs.readdirSync(file).sort())tree(`${relative}/${name}`);
    else collect(relative);
  }
  const sources=sheet.sources.map(source=>{
    if(!source.evidencePath){collect(source.path,source.sha256);return source;}
    const local=source.evidencePath;
    if(evidenceRoot&&fs.existsSync(path.resolve(evidenceRoot,local)))collect(local,source.sha256,evidenceRoot,local);
    else blockers.push(`A source bytes unavailable: ${source.id}`);
    return {...source,originalPath:source.path,path:local};
  });
  for(const [id,file] of resourceSources)sources.push({id,...collect(file)});
  const cases=[...sheet.cases,...resourceCases()];
  for(const c of cases)for(const ref of c.hostTest.split(/\s+\+\s+/)) {
    if(ref.includes('*')) {
      const pattern=new RegExp('^'+path.basename(ref).replaceAll('.','\\.').replaceAll('*','.*')+'$');
      const matches=fs.readdirSync(path.join(root,path.dirname(ref))).filter(name=>pattern.test(name));
      assert.ok(matches.length,`Missing host test: ${ref}`);
      for(const name of matches)collect(`${path.dirname(ref)}/${name}`);
    } else collect(ref);
  }
  for(const relative of [sheetPath,reviewPath,registryPath,'scripts/sdk54/abc/a-common.mjs','scripts/sdk54/abc/a-prepare.mjs','scripts/sdk54/abc/a-export-contract.mjs','scripts/sdk54/abc/a-bind-runner.mjs',
    'packages/expo-font/harmony/example/fixtures','packages/expo-asset/harmony/example/native','packages/expo-modules-core/harmony/example/router/step3-app',
    'packages/expo-modules-core/harmony/example/router/RouterProbe.tsx','packages/expo-modules-core/harmony/example/router/SheetCases.ts',
    'packages/expo-modules-core/harmony/example/host/harmony/AppScope/resources/base/media/app_icon.png'])tree(relative);
  const contract={...sheet,sources,cases,runnerCases:runnerMapping(cases,json(path.join(root,registryPath)),json(path.join(root,reviewPath))),
    files:[...files.values()].map(({data,...ref})=>ref),blockers,stageClaims:{step3:false,M4:false,M5:false,V:false,M6:false},
    bundleScope:'Review snapshot; execute commands in a fresh checkout with installed dependencies. No device acceptance or executable B commands.'};
  fs.mkdirSync(output,{recursive:true});
  try {
    for(const [relative,{data}] of files){const file=path.join(output,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data,{flag:'wx'});}
    writeJSON(path.join(output,'a-contract.json'),contract);
  } catch(error){fs.rmSync(output,{recursive:true,force:true});throw error;}
  return contract;
}

if(isMain(import.meta.url)) {
  try {
    const {values}=parseArgs({options:{'source-root':{type:'string'},'evidence-root':{type:'string'},output:{type:'string'},help:{type:'boolean'}}});
    if(values.help)console.log('a-export-contract.mjs --source-root <checkout> [--evidence-root <pinned source snapshots>] --output <new directory>');
    else {const result=exportContract({sourceRoot:values['source-root'],evidenceRoot:values['evidence-root'],output:values.output});console.log(JSON.stringify({cases:result.cases.length,runnerCases:result.runnerCases.length,blockers:result.blockers}));}
  }catch(error){console.error(error.message);process.exitCode=1;}
}
