import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyRunReport } from '../ai-e2e/report.mjs';
import { verifyCandidateManifest } from '../ai-e2e/evidence.mjs';
import { args, read, save, safeFile, sha256, newOutput, html } from './c-evidence-lib.mjs';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);

export function verifyAContract(directory) {
 const errors=[], receipts=[];
 try {
  const root=fs.realpathSync(directory), contract=read(safeFile(root,'a-contract.json'));
  if(contract.schemaVersion!==1 || !Array.isArray(contract.scenarios) || !contract.scenarios.length) throw Error('A contract requires non-empty scenarios');
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
  return {schemaVersion:1,valid:true,scenarios:[...ids],receipts,errors};
 } catch(error) { errors.push(error.message); return {schemaVersion:1,valid:false,scenarios:[],receipts,errors}; }
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
 try {
  result=read(safeFile(root,'result.json'));
  if(result.role!=='B' || result.dirty!==false || !/^[a-f0-9]{40}$/.test(result.sourceRevision??'')) throw Error('B source must have a clean fixed revision');
  const candidate=safeFile(root,result.candidate?.path);
  candidateHash=sha256(fs.readFileSync(candidate));
  if(candidateHash!==result.candidate.sha256) throw Error('Candidate drift');
  errors.push(...verifyCandidateManifest(candidate));
  for(const name of ['b-candidate.json','release.json']) safeFile(root,name);
 } catch(e) {errors.push('Handoff candidate/source: '+e.message);}
 const visit=dir=>{
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
   const file=path.join(dir,entry.name);
   if(entry.isSymbolicLink()) {errors.push('Symlink in handoff: '+path.relative(root,file));continue;}
   if(entry.isDirectory()) visit(file);
   else if(entry.name==='run-manifest.json') {
    try {
     const manifest=read(file), report=verifyRunReport(dir);
     const caseSet=read(safeFile(dir,manifest.caseSet?.path));
     caseDefinitions.push(...(Array.isArray(caseSet.cases)?caseSet.cases:[]));
     if(manifest.source?.dirty!==false || manifest.source?.revision!==result?.sourceRevision) errors.push('Run source drift: '+path.relative(root,dir));
     if(!candidateHash || manifest.candidate?.sha256!==candidateHash) errors.push('Run candidate drift: '+path.relative(root,dir));
     errors.push(...report.errors.map(e=>path.relative(root,dir)+': '+e));
     runs.push({path:path.relative(root,dir),...report,independentlyExecutedByC:false});
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
 const a=args(argv,['handoff','a-contract','output']);
 if(!a.handoff || !a.output) throw Error('Usage: --handoff <B directory> --output <new directory>');
 const output=newOutput(a.output), result=verifyHandoff(a.handoff);
 if(a['a-contract']) {
  result.aContract=verifyAContract(a['a-contract']);
  if(!result.aContract.valid) { result.valid=false; result.errors.push(...result.aContract.errors.map(error=>`A contract: ${error}`)); }
 }
 save(path.join(output,'handoff-verification.json'),result);
 fs.writeFileSync(path.join(output,'report.html'),html('C 独立交接材料核验',result),{flag:'wx'});
 return result.valid?0:1;
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) process.exitCode=main(process.argv.slice(2));
