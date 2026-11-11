import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyRunReport } from '../ai-e2e/report.mjs';
import { verifyCandidateManifest } from '../ai-e2e/evidence.mjs';
import { args, read, save, safeFile, sha256, newOutput, html } from './c-evidence-lib.mjs';

// Recompute raw runner evidence; a B summary is never accepted as a run.
export function verifyHandoff(directory) {
 const errors=[], runs=[], root=fs.realpathSync(directory);
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
 // Current V01 registry is only preflight, never the full M4/M5/V matrix.
 const registry=read(new URL('../ai-e2e/cases/registry.json',import.meta.url));
 const ids=Object.values(registry.stages).flat().filter(r=>r.required).map(r=>r.id);
 if(!ids.some(id=>/SHEET/i.test(id)) || !ids.some(id=>/DRAWER/i.test(id)) || !ids.some(id=>/RESOURCE|ASSET/i.test(id))) errors.push('Required full registry coverage missing (Sheet, Drawer, resource lifecycle); preflight cannot close stages');
 return {schemaVersion:1,valid:errors.length===0,candidateSha256:candidateHash??null,runs,errors,independentlyExecutedByC:false,stageClosable:false};
}
export function main(argv) {
 const a=args(argv,['handoff','output']);
 if(!a.handoff || !a.output) throw Error('Usage: --handoff <B directory> --output <new directory>');
 const output=newOutput(a.output), result=verifyHandoff(a.handoff);
 save(path.join(output,'handoff-verification.json'),result);
 fs.writeFileSync(path.join(output,'report.html'),html('C 独立交接材料核验',result),{flag:'wx'});
 return result.valid?0:1;
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) process.exitCode=main(process.argv.slice(2));
