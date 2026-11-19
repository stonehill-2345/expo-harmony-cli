import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isMain, json, options, readRef, repository, sha256, writeJSON } from './a-common.mjs';
import { registryPath, reviewPath, resourceCases, runnerMapping } from './a-export-contract.mjs';

// Resolve existing ancestors too: a future capture may sit below an existing symlink.
function physical(file) {
  if(fs.existsSync(file))return fs.realpathSync(file);
  const parent=path.dirname(file);
  assert.notEqual(parent,file,'Missing filesystem root');
  return path.join(physical(parent),path.basename(file));
}
function within(root,file) {const rel=path.relative(physical(root),physical(file));return rel===''||(!rel.split(path.sep).includes('..')&&!path.isAbsolute(rel));}

export function bindRunner({contractFile,commandFile,consumerRoot,runDirectory,output}) {
  assert.ok(contractFile&&commandFile&&consumerRoot&&runDirectory&&output,'All binding paths are required');
  assert.ok(!fs.existsSync(output),`output exists: ${output}`);
  const root=path.dirname(path.resolve(contractFile)),contract=json(contractFile),input=json(commandFile);
  assert.equal(contract.schemaVersion,1);assert.equal(contract.role,'A');
  assert.ok(Array.isArray(contract.files)&&contract.files.length,'Missing hashed bundle files');
  const files=new Map();
  for(const ref of contract.files){assert.ok(!files.has(ref.path),'Duplicate bundle file');files.set(ref.path,readRef(root,ref));}
  const bundledJSON=file=>{assert.ok(files.has(file),`Missing bundle file: ${file}`);return JSON.parse(files.get(file));};
  const registry=bundledJSON(registryPath),review=bundledJSON(reviewPath);
  assert.deepEqual(registry,json(path.join(repository,registryPath)),'Stale B registry; export again');
  assert.deepEqual(review,json(path.join(repository,reviewPath)),'Stale C review; export again');
  assert.deepEqual(contract.cases,[...bundledJSON('docs/releases/sdk54-abc-20261111/a-sheet-contract.json').cases,...resourceCases()],'Semantic contract changed; export again');
  const mapping=runnerMapping(contract.cases,registry,review);
  assert.deepEqual(contract.runnerCases,mapping,'A runner mapping changed');
  for(const source of contract.sources)if(!contract.blockers?.includes(`A source bytes unavailable: ${source.id}`)) {
    assert.ok(files.has(source.path),`Missing source bytes: ${source.id}`);
    assert.equal(sha256(files.get(source.path)),source.sha256,`Source hash mismatch: ${source.id}`);
  }
  assert.equal(input.schemaVersion,1);assert.equal(input.stage,'V-02');
  assert.ok(Array.isArray(input.cases),'Missing command cases');
  const commands=new Map();
  for(const row of input.cases){assert.ok(!commands.has(row.id),`Duplicate command: ${row.id}`);assert.ok(mapping.some(c=>c.id===row.id),`Unknown command: ${row.id}`);commands.set(row.id,row);}
  const cases=mapping.map(row=>{
    const supplied=commands.get(row.id);assert.ok(supplied,`Missing command: ${row.id}`);
    assert.deepEqual(supplied.semanticCaseIds,row.semanticCaseIds,`Semantic coverage differs: ${row.id}`);
    const c=supplied.command;
    assert.ok(c&&Array.isArray(c.argv)&&c.argv.length&&c.argv.every(x=>typeof x==='string'&&x.length),'Missing non-empty argv');
    assert.ok(!Object.hasOwn(c,'shell'),'Shell commands are not supported');
    assert.ok(typeof c.cwd==='string','Explicit command cwd is required');
    const cwd=path.resolve(consumerRoot,c.cwd);
    assert.ok(within(consumerRoot,cwd)||within(runDirectory,cwd),'Command cwd escapes allowed roots');
    assert.ok(Number.isSafeInteger(c.timeoutMs)&&c.timeoutMs>0,'Positive command timeoutMs is required');
    assert.ok(Array.isArray(c.evidence),'Explicit command evidence is required');
    for(const ref of c.evidence){
      assert.ok(typeof ref.type==='string'&&ref.type.length,'Evidence type is required');
      assert.ok(typeof ref.path==='string'&&ref.path.length&&!path.isAbsolute(ref.path)&&!ref.path.split(/[\\/]/).includes('..'),'Evidence path escapes run directory');
      assert.ok(within(runDirectory,path.resolve(runDirectory,ref.path)),'Evidence symlink escapes run directory');
    }
    for(const type of row.requiredEvidence.filter(type=>type!=='command-log'))assert.ok(c.evidence.some(ref=>ref.type===type),`Missing required evidence: ${row.id}/${type}`);
    return {...row,command:{argv:c.argv,cwd,timeoutMs:c.timeoutMs,evidence:c.evidence}};
  });
  const result={schemaVersion:1,role:'A',stage:'V-02',status:'BOUND_NOT_EXECUTED',cases,
    semanticContract:{path:'semantic/a-contract.json',sha256:sha256(fs.readFileSync(contractFile))},
    commandInputSha256:sha256(fs.readFileSync(commandFile)),stageClaims:{step3:false,M4:false,M5:false,V:false,M6:false}};
  fs.mkdirSync(output,{recursive:true});
  try {
    for(const [relative,bytes] of files){const file=path.join(output,'semantic',relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});}
    fs.copyFileSync(contractFile,path.join(output,'semantic/a-contract.json'));
    fs.writeFileSync(path.join(output,'c-case-review.json'),files.get(reviewPath),{flag:'wx'});
    writeJSON(path.join(output,'a-contract.json'),result);
  }catch(error){fs.rmSync(output,{recursive:true,force:true});throw error;}
  return result;
}
if(isMain(import.meta.url)) {
  try {
    const args=options(['contract','commands','consumer-root','run-dir','output'],'a-bind-runner.mjs --contract <semantic a-contract.json> --commands <B commands.json> --consumer-root <external consumers> --run-dir <planned B run> --output <new directory>');
    if(args){const result=bindRunner({contractFile:args.contract,commandFile:args.commands,consumerRoot:args['consumer-root'],runDirectory:args['run-dir'],output:args.output});console.log(JSON.stringify({status:result.status,cases:result.cases.length}));}
  }catch(error){console.error(error.message);process.exitCode=1;}
}
