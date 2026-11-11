import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyRunReport } from '../ai-e2e/report.mjs';
import { verifyCandidateManifest } from '../ai-e2e/evidence.mjs';
import { args, read, save, safeFile, sha256, newOutput, html } from './c-evidence-lib.mjs';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);

function existingHostTest(sourceRoot, reference) {
 const files=reference.split(/\s+\+\s+/).filter(Boolean);
 return files.length>0 && files.every(relative=>{
  const absolute=path.resolve(sourceRoot,relative);
  if(!relative.includes('*')) return fs.existsSync(absolute) && fs.statSync(absolute).isFile();
  const directory=path.dirname(absolute), pattern=new RegExp(`^${path.basename(relative).replace(/[.+?^${}()|[\]\\]/g,'\\$&').replaceAll('*','.*')}$`);
  return fs.existsSync(directory) && fs.readdirSync(directory).some(name=>pattern.test(name));
 });
}

function resolveContractSource(source, sourceRoot, evidenceRoot, devEcoSdkRoot) {
 if(source.path) {
  const expanded=source.path.replace('<DEVECO_SDK_HOME>',devEcoSdkRoot??'<DEVECO_SDK_HOME>');
  if(expanded.includes('<DEVECO_SDK_HOME>')) return null;
  return path.isAbsolute(expanded)?expanded:path.resolve(sourceRoot,expanded);
 }
 if(source.evidencePath) return path.resolve(evidenceRoot,source.evidencePath);
 return null;
}

export function verifyAContract(input, options={}) {
 const errors=[], blockers=[], receipts=[];
 try {
  const resolved=path.resolve(input), contractFile=fs.statSync(resolved).isDirectory()
   ? safeFile(fs.realpathSync(resolved),fs.existsSync(path.join(resolved,'a-sheet-contract.json'))?'a-sheet-contract.json':'a-contract.json')
   : fs.realpathSync(resolved);
  const root=path.dirname(contractFile), sourceRoot=path.resolve(options.sourceRoot??root), evidenceRoot=path.resolve(options.evidenceRoot??root);
  const contract=read(contractFile);
  if(contract.schemaVersion!==1) throw Error('A contract requires schemaVersion 1');
  if(Array.isArray(contract.cases) && contract.cases.length) {
   if(contract.role!=='A') throw Error('A sheet contract requires role A');
   if(!Array.isArray(contract.sources) || !contract.sources.length) throw Error('A sheet contract requires non-empty sources');
   const sources=new Map();
   for(const source of contract.sources) {
    if(typeof source?.id!=='string'||!source.id||sources.has(source.id)) throw Error(`Duplicate or missing A source ID: ${source?.id}`);
    if(!/^[a-f0-9]{64}$/.test(source.sha256??'')) throw Error(`A source lacks SHA-256: ${source.id}`);
    sources.set(source.id,source);
    const file=resolveContractSource(source,sourceRoot,evidenceRoot,options.devEcoSdkRoot);
    if(!file || !fs.existsSync(file)) { blockers.push(`A source bytes unavailable: ${source.id}`); continue; }
    const actual=sha256(fs.readFileSync(file));
    if(actual!==source.sha256) throw Error(`A source hash mismatch: ${source.id}`);
    receipts.push({sourceId:source.id,path:file,sha256:actual});
   }
   const ids=new Set();
   for(const scenario of contract.cases) {
    const id=scenario?.caseId;
    if(typeof id!=='string'||!id||ids.has(id)) throw Error(`Duplicate or missing A case ID: ${id}`);
    ids.add(id);
    if(!own(scenario,'props')||typeof scenario.expected!=='string'||!scenario.expected) throw Error(`A case lacks props/expected: ${id}`);
    if(!Array.isArray(scenario.sourceIds)||!scenario.sourceIds.length) throw Error(`A case lacks sourceIds: ${id}`);
    for(const sourceId of scenario.sourceIds) if(!sources.has(sourceId)) throw Error(`A case references unknown source: ${id}/${sourceId}`);
    if(typeof scenario.hostTest!=='string'||!existingHostTest(sourceRoot,scenario.hostTest)) throw Error(`A host test is missing: ${id}/${scenario.hostTest}`);
    if(scenario.requirement==='M4_REQUIRED'&&scenario.deferredToM7!==false) throw Error(`M4 case is improperly deferred: ${id}`);
    if(scenario.deviceStatus!=='PASS') blockers.push(`A device case ${id} is ${scenario.deviceStatus??'MISSING'}`);
   }
   if(contract.reviewStatus!=='APPROVED') blockers.push(`A contract reviewStatus is ${contract.reviewStatus??'MISSING'}`);
   return {schemaVersion:1,valid:true,acceptanceReady:blockers.length===0,cases:[...ids],receipts,blockers,errors};
  }
  if(!Array.isArray(contract.scenarios) || !contract.scenarios.length) throw Error('A contract requires non-empty scenarios or cases');
  const ids=new Set();
  for(const scenario of contract.scenarios) {
   if(typeof scenario?.id!=='string' || !scenario.id || ids.has(scenario.id)) throw Error(`Duplicate or missing A scenario ID: ${scenario?.id}`);
   ids.add(scenario.id);
   if(!own(scenario,'input') || !own(scenario,'expected')) throw Error(`A scenario lacks input/expected: ${scenario.id}`);
   if(!Array.isArray(scenario.fixtureFiles) || !Array.isArray(scenario.assertionFiles) || !scenario.assertionFiles.length) throw Error(`A scenario lacks fixture/assertion references: ${scenario.id}`);
   for(const [kind, references] of [['fixture',scenario.fixtureFiles],['assertion',scenario.assertionFiles]]) for(const reference of references) {
    if(!/^[a-f0-9]{64}$/.test(reference?.sha256??'')) throw Error(`A ${kind} reference lacks SHA-256: ${scenario.id}`);
    const file=safeFile(root,reference.path), actual=sha256(fs.readFileSync(file));
    if(actual!==reference.sha256) throw Error(`A ${kind} hash mismatch: ${scenario.id}/${reference.path}`);
    receipts.push({scenarioId:scenario.id,kind,path:reference.path,sha256:actual});
   }
  }
  if(!Array.isArray(contract.nativeCapabilityBoundaries) || !contract.nativeCapabilityBoundaries.length
    || contract.nativeCapabilityBoundaries.some(row=>typeof row?.id!=='string'||!row.id||typeof row.status!=='string'||!row.status)) throw Error('A contract requires native capability boundaries');
  return {schemaVersion:1,valid:true,acceptanceReady:true,scenarios:[...ids],cases:[...ids],receipts,blockers,errors};
 } catch(error) { errors.push(error.message); return {schemaVersion:1,valid:false,acceptanceReady:false,scenarios:[],cases:[],receipts,blockers,errors}; }
}

export function reviewRequiredCoverage(cases) {
 const ids=(Array.isArray(cases)?cases:[]).filter(row=>row?.required).map(row=>row.id).filter(id=>typeof id==='string');
 const families=[['resource lifecycle',/RESOURCE|ASSET|FONT/i],['Sheet',/SHEET/i],['Drawer',/DRAWER/i],
  ['orientation',/ORIENTATION|ROTAT/i],['CLI/M4',/(?:^|[-_])(CLI|M4)(?:[-_]|$)/i]];
 const missing=families.filter(([,pattern])=>!ids.some(id=>pattern.test(id))).map(([name])=>name);
 return {valid:missing.length===0,requiredCaseIds:ids.sort(),missing};
}

// Recompute raw runner evidence; a B summary is never accepted as a run.
export function verifyHandoff(directory) {
 const errors=[], runs=[], caseDefinitions=[], root=fs.realpathSync(directory);
 let result, candidateHash;
 const candidateDeliveries=[];
 const discover=dir=>{
  const names=new Set(fs.readdirSync(dir,{withFileTypes:true}).filter(entry=>entry.isFile()).map(entry=>entry.name));
  if(names.has('candidate.json')&&names.has('b-candidate.json')&&names.has('release.json')) candidateDeliveries.push(dir);
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) if(entry.isDirectory()) discover(path.join(dir,entry.name));
 };
 try {
  discover(root);
  if(!candidateDeliveries.length) throw Error('Missing B frozen candidate directory');
  const identities=new Set();
  for(const delivery of candidateDeliveries) {
   const candidate=safeFile(delivery,'candidate.json'), hash=sha256(fs.readFileSync(candidate));
   const bCandidate=read(safeFile(delivery,'b-candidate.json'));
   safeFile(delivery,'release.json');
   if(bCandidate.source?.dirty!==false||!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(bCandidate.source?.revision??'')) throw Error('B source must have a clean fixed revision');
   errors.push(...verifyCandidateManifest(candidate));
   identities.add(hash);
   result??={sourceRevision:bCandidate.source.revision};
  }
  if(identities.size!==1) throw Error('Multiple B candidate identities');
  candidateHash=[...identities][0];
  if(fs.existsSync(path.join(root,'result.json'))) {
   const coordination=read(safeFile(root,'result.json'));
   if(coordination.role!=='B'||coordination.dirty!==false||coordination.sourceRevision!==result.sourceRevision) throw Error('B coordination result disagrees with frozen candidate');
  }
 } catch(e) {errors.push('Handoff candidate/source: '+e.message);}
 const visit=dir=>{
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
   const file=path.join(dir,entry.name);
   if(entry.isSymbolicLink()) {errors.push('Symlink in handoff: '+path.relative(root,file));continue;}
   if(entry.isDirectory()) visit(file);
   else if(entry.name==='run-manifest.json') {
    try {
     const manifest=read(file);
     const caseSet=read(safeFile(dir,manifest.caseSet?.path));
     caseDefinitions.push(...(Array.isArray(caseSet.cases)?caseSet.cases:[]));
     if(manifest.source?.dirty!==false || manifest.source?.revision!==result?.sourceRevision) errors.push('Run source drift: '+path.relative(root,dir));
     if(!candidateHash || manifest.candidate?.sha256!==candidateHash) errors.push('Run candidate drift: '+path.relative(root,dir));
     let report;
     try { report=verifyRunReport(dir); }
     catch(error) { report={valid:false,errors:[error.message]}; }
     errors.push(...report.errors.map(e=>path.relative(root,dir)+': '+e));
     runs.push({path:path.relative(root,dir),prepared:true,...report,independentlyExecutedByC:false});
    }catch(e){errors.push('Invalid raw run: '+e.message);}
   }
  }
 };
 visit(root);
 if(!runs.length) errors.push('Missing raw run manifests; zero commands cannot prove acceptance');
 const coverage=reviewRequiredCoverage(caseDefinitions);
 if(!coverage.valid) errors.push(`Required full case-set coverage missing: ${coverage.missing.join(', ')}; preflight cannot close stages`);
 return {schemaVersion:1,valid:errors.length===0,candidateSha256:candidateHash??null,runs,caseSetCoverage:coverage,errors,independentlyExecutedByC:false,stageClosable:false};
}
export function main(argv) {
 const a=args(argv,['handoff','a-contract','source-root','evidence-root','deveco-sdk-root','output']);
 if(!a.handoff || !a.output) throw Error('Usage: --handoff <B directory> [--a-contract file --source-root directory] --output <new directory>');
 const output=newOutput(a.output), result=verifyHandoff(a.handoff);
 if(a['a-contract']) {
  result.aContract=verifyAContract(a['a-contract'],{sourceRoot:a['source-root'],evidenceRoot:a['evidence-root'],devEcoSdkRoot:a['deveco-sdk-root']});
  if(!result.aContract.valid) { result.valid=false; result.errors.push(...result.aContract.errors.map(error=>`A contract: ${error}`)); }
 }
 save(path.join(output,'handoff-verification.json'),result);
 fs.writeFileSync(path.join(output,'report.html'),html('C 独立交接材料核验',result),{flag:'wx'});
 return result.valid?0:1;
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) process.exitCode=main(process.argv.slice(2));
