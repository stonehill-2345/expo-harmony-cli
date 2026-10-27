import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { gzipSync, gunzipSync } from 'node:zlib';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const write=(dir,name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n');

export async function acceptConsolidated({sourceDir,outputDir}){
  const dir=path.resolve(outputDir);fs.mkdirSync(dir,{recursive:true});
  const run=(name,command)=>new Promise(resolve=>{
    const log=`${name}.log`,stream=fs.createWriteStream(path.join(dir,log)),child=spawn(command[0],command.slice(1),{cwd:repository});
    let error=null;child.stdout.pipe(stream);child.stderr.pipe(stream);child.on('error',e=>{error=String(e);});
    child.on('close',(exit,signal)=>stream.end(()=>resolve({name,command,exit,signal,error,log})));
  });
  const main=path.join(dir,'semantic-surface.json.gz'),repeat=path.join(dir,'semantic-repeat.json.gz'),base=[process.execPath,'scripts/sdk54/m0-consolidated.mjs','--source',sourceDir];
  const generation=[];
  if(!fs.existsSync(main))generation.push(await run('generate',[...base,'--output',main,'--summary','docs/releases/sdk54-m0-consolidated-summary.json']));
  generation.push(await run('repeat',[...base,'--output',repeat]));write(dir,'generation-results.json',generation);
  if(generation.some(r=>r.exit!==0||r.error))throw new Error('Source generation failed; see logs');
  const files=[main,repeat].map(file=>({path:file,sha256:sha(fs.readFileSync(file))}));
  const identical=files[0].sha256===files[1].sha256;write(dir,'repeat-verification.json',{identical,files});if(!identical)throw new Error('Source repeat differs');
  const original=JSON.parse(gunzipSync(fs.readFileSync(main))),cases=[
    ['missing-property',a=>a.types.find(t=>t.properties.length).properties.pop()],
    ['missing-call',a=>a.types.find(t=>t.calls.length).calls.pop()],
    ['missing-return',a=>delete a.types.find(t=>t.calls.length).calls[0].returnTypeId],
    ['missing-parameter',a=>a.types.find(t=>t.calls.some(s=>s.parameters.length)).calls.find(s=>s.parameters.length).parameters.pop()],
    ['missing-type',a=>a.types.pop()],['missing-export',a=>a.exports.pop()],['missing-input',a=>a.inputs.pop()],
    ['missing-inference',a=>a.inferences.pop()],['missing-plugin',a=>a.plugins.pop()],
    ['fake-plugin',a=>a.plugins.find(p=>p.status==='EVALUATED_WITH_BOUNDARY').status='EVALUATED'],
    ['dangling-reference',a=>a.exports[0].typeId='TYPE:absent'],['duplicate-type',a=>a.types.push(a.types[0])],
    ['fake-closure',a=>{a.publicSurfaceComplete=true;a.closure.stageClosable=true;}],
    ['fake-boundary-propagation',a=>a.types.find(t=>t.hasTransitiveBoundary).hasTransitiveBoundary=false],
    ['wrong-library-hash',a=>a.compilerLibraries.files[0].sha256='0'.repeat(64)],['missing-module',a=>a.modules.pop()]
  ];
  const variants=[];
  for(const [id,mutate] of cases){const a=structuredClone(original);mutate(a);const file=path.join(dir,`negative-${id}.json.gz`);fs.writeFileSync(file,gzipSync(JSON.stringify(a)));variants.push({id,path:file});}
  const set=path.join(dir,'validation-paths.json');write(dir,'validation-paths.json',[main,...variants.map(v=>v.path)]);
  const batch=await run('cli-validation-set',[...base,'--check-set',set]);write(dir,'validation-process.json',batch);
  if(batch.exit!==1||batch.error)throw new Error('CLI validation-set did not reject invalid input as expected');
  const raw=JSON.parse(fs.readFileSync(path.join(dir,batch.log))),positive=raw.results[0];
  if(!positive.valid||raw.results.length!==variants.length+1)throw new Error('Positive check or validation set coverage failed');
  const negatives=variants.map((v,i)=>({...v,valid:raw.results[i+1].valid,failures:raw.results[i+1].failures}));
  write(dir,'negative-results.json',negatives);if(negatives.some(r=>r.valid||!r.failures.length))throw new Error('A negative was not rejected');
  const historical=JSON.parse(fs.readFileSync(path.join(repository,'outputs/sdk54/ai-e2e/20261022-m0-ambient-modules/regression-checks.json')));
  const jobs=[...historical.map(r=>({name:r.name,command:r.command,kind:'history'})),
    {name:'tools',command:['pnpm','test:sdk54-tools'],kind:'test'},{name:'cli',command:['pnpm','test'],kind:'test'},{name:'types',command:['pnpm','type-check'],kind:'test'}];
  const results=[];
  for(let i=0;i<jobs.length;i+=4){const batch=await Promise.allSettled(jobs.slice(i,i+4).map(async j=>({...j,...await run(j.name,j.command)})));for(const r of batch)results.push(r.status==='fulfilled'?r.value:{exit:null,error:String(r.reason)});}
  write(dir,'regression-checks.json',results.filter(r=>r.kind==='history'));
  for(const name of ['tools','cli','types']){const r=results.find(r=>r.name===name),text=fs.readFileSync(path.join(dir,r.log),'utf8');const match=name==='tools'?/# tests (\d+)/.exec(text):name==='cli'?/Tests\s+(\d+) passed/.exec(text):null;write(dir,`${name}-result.json`,{...r,tests:match?Number(match[1]):null});}
  if(results.some(r=>r.exit!==0||r.error))throw new Error('Regression failed; original logs retained');
  const result={status:'PASS_ANALYSIS_ACCEPTANCE',stageClosable:false,repeatIdentical:true,positiveValid:true,rejectedVariants:negatives.length,historicalChecks:historical.length,
    tools:JSON.parse(fs.readFileSync(path.join(dir,'tools-result.json'))).tests,cli:JSON.parse(fs.readFileSync(path.join(dir,'cli-result.json'))).tests,
    meaning:'analysis tool contract passed; stage blockers remain authoritative'};write(dir,'acceptance-result.json',result);console.log(JSON.stringify(result,null,2));return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(!['--source','--output'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Invalid args');options[args[i]]=args[i+1];}
    if(!options['--source']||!options['--output'])throw new Error('Usage: --source <fixed-git> --output <evidence-directory>');
    await acceptConsolidated({sourceDir:path.resolve(options['--source']),outputDir:path.resolve(options['--output'])});
  }catch(error){console.error(error.stack);process.exitCode=1;}
}
