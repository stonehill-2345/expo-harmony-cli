import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { args, save, sha256, html } from './c-evidence-lib.mjs';
import { RELEASE_PACKAGES } from '../release-catalog.mjs';
import { verifyCandidateManifest } from '../ai-e2e/evidence.mjs';

const base = 'f3892fade4e3f93c89420f2580a94f362bb23d2d';
const owned = [
  'scripts/sdk54/ai-e2e/report.mjs', 'scripts/sdk54/__tests__/ai-e2e-report.test.mjs',
  'scripts/sdk54/__tests__/abc-c-finalize.test.mjs',
  'scripts/sdk54/__tests__/abc-c-handoff.test.mjs', 'scripts/sdk54/__tests__/abc-c-portable.test.mjs',
  'scripts/sdk54/__tests__/abc-c-public-closure.test.mjs', 'scripts/sdk54/__tests__/abc-c-full-closure.test.mjs', 'scripts/sdk54/abc/c-record.py',
  'scripts/sdk54/__tests__/m0-export-source-bindings.test.mjs', 'scripts/sdk54/__tests__/m0-finite-declarations.test.mjs',
  'scripts/sdk54/m0-export-source-bindings.mjs', 'scripts/sdk54/m0-finite-declarations.mjs',
  'scripts/sdk54/abc/c-evidence-lib.mjs', 'scripts/sdk54/abc/c-input-audit.mjs',
  'scripts/sdk54/abc/c-public-closure.mjs', 'scripts/sdk54/abc/c-verify-handoff.mjs',
  'scripts/sdk54/abc/c-finalize.mjs', 'docs/releases/sdk54-abc-20261111/c-case-review.json',
  'docs/superpowers/plans/2026-11-11-sdk54-abc-c-closure.md',
];
const git = (...argv) => spawnSync('git', argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const readOptional = file => {
  try { return JSON.parse(fs.readFileSync(file)); } catch { return null; }
};
const commandName = command => (command?.argv??[]).join(' ');
const commandPassed = command => command?.exitCode===0 && command.signal==null && command.timedOut!==true;
const argumentValue = (argv, name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
};

export function verifyCommandRecord(root, command) {
  const errors=[], outputRoot=fs.realpathSync(root), argv=command?.argv??[];
  if(!commandPassed(command)) errors.push('Recorded command did not pass');
  for(const stream of ['stdout','stderr']) {
    const receipt=command?.[stream];
    if(!receipt||typeof receipt.path!=='string'||!receipt.path||path.isAbsolute(receipt.path)
      ||receipt.path.includes('\\')||receipt.path.split('/').includes('..')||!/^[a-f0-9]{64}$/.test(receipt.sha256??'')) {
      errors.push(`Recorded command ${stream} receipt is malformed`); continue;
    }
    const file=path.resolve(outputRoot,receipt.path), relative=path.relative(outputRoot,file);
    let stat;
    try { stat=fs.lstatSync(file); } catch { errors.push(`Recorded command ${stream} file is missing`); continue; }
    if(relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative)||!stat.isFile()||stat.isSymbolicLink()) {
      errors.push(`Recorded command ${stream} file is unsafe`); continue;
    }
    const realFile=fs.realpathSync(file), realRelative=path.relative(outputRoot,realFile);
    if(realRelative==='..'||realRelative.startsWith(`..${path.sep}`)||path.isAbsolute(realRelative)) {
      errors.push(`Recorded command ${stream} file escapes the output root`); continue;
    }
    if(sha256(fs.readFileSync(file))!==receipt.sha256) errors.push(`Recorded command ${stream} hash mismatch`);
  }
  if(!Array.isArray(argv)||argv[0]!=='node'||argv[1]!=='scripts/sdk54/abc/c-public-closure.mjs') {
    errors.push('Recorded candidate command executable is invalid');
  }
  const allowed=new Set(['--source-root','--reconstruction','--scope','--candidate','--mode','--output']), seen=new Set();
  for(let index=2;index<argv.length;index+=2) {
    const flag=argv[index], value=argv[index+1];
    if(!allowed.has(flag)||seen.has(flag)||typeof value!=='string'||!value) errors.push(`Recorded candidate command arguments are invalid: ${flag??'<missing>'}`);
    seen.add(flag);
  }
  for(const flag of allowed) if(!seen.has(flag)) errors.push(`Recorded candidate command argument is missing: ${flag}`);
  if(typeof command?.cwd!=='string'||path.resolve(command.cwd)!==path.resolve(argumentValue(argv,'--source-root')??'')) {
    errors.push('Recorded candidate command cwd differs from source root');
  }
  return errors;
}

function candidateCoverageErrors(root, publicOutput, coverage, commandRows) {
  const errors=[];
  if(!coverage||coverage.valid!==true) return errors;
  if(!Array.isArray(coverage.errors)||coverage.errors.length) errors.push('Candidate coverage must contain an empty errors array');
  const packages=Array.isArray(coverage.packages)?coverage.packages:[];
  const byInstall=new Map(packages.map(row=>[row?.installName,row]));
  if(packages.length!==RELEASE_PACKAGES.length||byInstall.size!==packages.length) errors.push('Candidate coverage package set differs from the release catalog');
  for(const descriptor of RELEASE_PACKAGES) {
    const row=byInstall.get(descriptor.installName);
    if(!row||row.name!==descriptor.publishName||row.version!==descriptor.publishVersion) {
      errors.push(`Candidate coverage package identity mismatch: ${descriptor.installName}`);
    }
  }
  const candidate=coverage.candidate;
  if(!candidate||typeof candidate.path!=='string'||!/^[a-f0-9]{64}$/.test(candidate.sha256??'')) {
    errors.push('Candidate coverage identity is missing or malformed');
    return errors;
  }
  const candidateFile=path.resolve(candidate.path);
  try { errors.push(...verifyCandidateManifest(candidateFile)); }
  catch(error) { errors.push(`Candidate manifest replay failed: ${error.message}`); }
  const output=path.resolve(root,publicOutput);
  const replay=(Array.isArray(commandRows)?commandRows:[]).find(command=>{
    const argv=command?.argv??[], script=argv.find(value=>typeof value==='string'&&value.endsWith('scripts/sdk54/abc/c-public-closure.mjs'));
    return Boolean(script)&&argumentValue(argv,'--mode')==='candidate'
      && path.resolve(argumentValue(argv,'--candidate')??'')===candidateFile
      && path.resolve(argumentValue(argv,'--output')??'')===output&&commandPassed(command);
  });
  if(!replay) errors.push('Successful candidate-mode public closure command is missing');
  else errors.push(...verifyCommandRecord(root,replay));
  return errors;
}

export function evaluateFinalEvidence(root, publicOutput='public-source') {
  const errors=[];
  const audit=readOptional(path.join(root,'input-audit/c-input-audit.json'));
  const closure=readOptional(path.join(root,publicOutput,'public-closure.json'));
  const coverage=readOptional(path.join(root,publicOutput,'candidate-coverage.json'));
  const blockerFile=readOptional(path.join(root,publicOutput,'blockers.json'));
  const handoff=readOptional(path.join(root,'handoff/handoff-verification.json'));
  const commands=readOptional(path.join(root,'commands.json'));
  const commandRows=Array.isArray(commands)?commands:[];
  const latestCommands=new Map(commandRows.map(command=>[commandName(command),command]));
  if(!Array.isArray(commands)) errors.push('commands.json is missing or invalid');
  for(const command of latestCommands.values()) if(!commandPassed(command)) errors.push(`Command failed: ${commandName(command)||'<empty argv>'}`);
  const check=[...latestCommands.values()].find(command=>/^(?:corepack )?pnpm check$/.test(commandName(command)));
  const negative=[...latestCommands.values()].find(command=>commandName(command).includes('node --test')&&commandName(command).includes('abc-c-')&&commandPassed(command));
  if(!check) errors.push('Required pnpm check command is missing');
  if(!negative) errors.push('Required C negative test command is missing');

  const c31Blockers=[];
  if(!audit) c31Blockers.push('input audit evidence is missing');
  else if(audit.valid!==true) c31Blockers.push('input audit is invalid');
  const c32Blockers=[];
  if(!closure) c32Blockers.push('public closure evidence is missing');
  else {
    if(closure.mode!=='candidate') c32Blockers.push('candidate public closure has not run');
    if(closure.relationClosed!==true) c32Blockers.push('public relations are not closed');
    if(closure.stageClosable!==true) c32Blockers.push('public closure is not stage closable');
    if(!coverage) c32Blockers.push('candidate coverage evidence is missing');
    else if(coverage.valid!==true) c32Blockers.push(...(Array.isArray(coverage.errors)&&coverage.errors.length?coverage.errors:['candidate coverage is invalid']));
    else c32Blockers.push(...candidateCoverageErrors(root,publicOutput,coverage,commandRows));
    for(const blocker of Array.isArray(blockerFile)?blockerFile:(closure.blockers??[])) c32Blockers.push(typeof blocker==='string'?blocker:JSON.stringify(blocker));
  }
  const c33Blockers=[];
  if(!handoff) c33Blockers.push('handoff verification is missing');
  else {
    if(handoff.valid!==true) c33Blockers.push(...(handoff.errors??['handoff verification failed']));
    if(handoff.independentlyExecutedByC!==true) c33Blockers.push('candidate was not independently executed by C');
  }
  const tasks=[
    {id:'C-31',status:c31Blockers.length?'FAIL':'PASS',evidence:['input-audit/c-input-audit.json'],blockers:c31Blockers},
    {id:'C-32',status:!closure?'BLOCKED':c32Blockers.length?'FAIL':'PASS',evidence:[`${publicOutput}/public-closure.json`,`${publicOutput}/candidate-coverage.json`,`${publicOutput}/scope-review.json`,`${publicOutput}/finite-declarations.json`,`${publicOutput}/derived-source-provenance.json`,`${publicOutput}/export-source-bindings.json`,`${publicOutput}/plugin-contracts.json`],blockers:c32Blockers},
    {id:'C-33',status:c33Blockers.length?'BLOCKED':'PASS',evidence:['handoff/handoff-verification.json','c-case-review.json'],blockers:c33Blockers},
  ];
  const requiredCommandsPass=Boolean(check&&negative&&commandPassed(check)&&commandPassed(negative));
  const priorPass=tasks.every(task=>task.status==='PASS');
  const recommendClose=priorPass&&requiredCommandsPass;
  const commandBlockers=errors.filter(error=>/command|pnpm check|negative test/i.test(error));
  tasks.push({id:'C-34',status:recommendClose?'PASS':(!commands||!closure||!handoff?'BLOCKED':'FAIL'),evidence:['commands.json'],blockers:[...commandBlockers,...(!priorPass?['C-31～C-33 are not all PASS']:[])]});
  return {tasks,recommendClose,errors};
}

export function buildRequests(handoff, commands) {
  const requests=[];
  if(!handoff?.aContract) requests.push({id:'C-REQ-A-CONTRACT',from:'C',to:'A',blockedTaskId:'C-33',files:['a-sheet-contract.json'],reproduction:'C verification did not receive an A contract',expected:'exact Sheet/resource/Drawer semantic assertions and source hashes',requiredEvidence:['contract hash','source hashes']});
  else if(!handoff.aContract.valid) requests.push({id:'C-REQ-A-CONTRACT',from:'C',to:'A',blockedTaskId:'C-33',files:['a-sheet-contract.json'],reproduction:handoff.aContract.errors?.join('; ')||'A contract validation failed',expected:'a structurally valid contract with exact source hashes',requiredEvidence:['corrected contract','source bytes']});
  else if(!handoff.aContract.acceptanceReady) requests.push({id:'C-REQ-A-DEVICE',from:'C',to:'A',blockedTaskId:'C-33',files:['A device evidence'],reproduction:handoff.aContract.blockers?.join('; ')||'A device cases are not complete',expected:'execute every M4 required semantic assertion without deferral',requiredEvidence:['raw device commands','semantic assertions','screenshots']});
  if(!handoff?.candidateSha256) requests.push({id:'C-REQ-B-CANDIDATE',from:'C',to:'B',blockedTaskId:'C-32-candidate/C-33',files:['b-candidate.json','candidate.json','release.json','15 tgz','CLI tgz','case-set','portable runner run'],reproduction:'No verified B frozen candidate identity is present',expected:'one clean-source frozen candidate and complete required case set',requiredEvidence:['raw command logs','candidate hashes','run manifests','device evidence']});
  const failedInstall=(Array.isArray(commands)?commands:[]).find(command=>/^(?:corepack )?pnpm install(?: |$)/.test(commandName(command))&&!commandPassed(command));
  if(failedInstall) requests.push({id:'C-REQ-INSTALL',from:'C',to:'B',blockedTaskId:'C-34-check',files:['dependency/install ownership'],reproduction:`${commandName(failedInstall)} exited ${failedInstall.exitCode}`,expected:'authorized shared dependency/candidate setup that installs without changing acceptance',requiredEvidence:['fresh install log']});
  return requests;
}

export function resolveCandidateIdentity(root, publicOutput='public-source') {
  const coverage=readOptional(path.join(root,publicOutput,'candidate-coverage.json'));
  if(!coverage) return {candidate:null,errors:['Candidate coverage evidence is missing']};
  if(coverage.valid!==true) return {candidate:null,errors:['Candidate coverage is invalid',...(Array.isArray(coverage.errors)?coverage.errors:[])]};
  const handoff=readOptional(path.join(root,'handoff/handoff-verification.json'));
  const candidate=coverage.candidate, errors=[];
  if(!candidate || typeof candidate.path!=='string' || !candidate.path || !/^[a-f0-9]{64}$/.test(candidate.sha256??'')) {
    errors.push('Candidate identity is missing or malformed');
    return {candidate:null,errors};
  }
  const file=path.resolve(candidate.path);
  let stat;
  try { stat=fs.lstatSync(file); } catch { errors.push(`Candidate path is missing: ${candidate.path}`); }
  if(stat && (!stat.isFile() || stat.isSymbolicLink())) errors.push(`Candidate path is not a regular file: ${candidate.path}`);
  if(stat?.isFile() && sha256(fs.readFileSync(file))!==candidate.sha256) errors.push('Candidate file hash differs from candidate coverage');
  if(coverage.candidateSha256!==candidate.sha256) errors.push('Candidate coverage identity is inconsistent');
  if(handoff?.candidateSha256!==candidate.sha256) errors.push('Handoff candidate identity differs from candidate coverage');
  if(!errors.length) errors.push(...candidateCoverageErrors(root,publicOutput,coverage,readOptional(path.join(root,'commands.json'))));
  return {candidate:errors.length?null:{path:file,sha256:candidate.sha256},errors};
}

export function verifyEvidenceReferences(root, tasks) {
  const errors=[], receipts=[], outputRoot=fs.realpathSync(root);
  for(const task of Array.isArray(tasks)?tasks:[]) for(const reference of Array.isArray(task?.evidence)?task.evidence:[]) {
    if(typeof reference!=='string'||!reference) { errors.push(`Evidence reference is invalid: ${task?.id??'<unknown>'}`); continue; }
    if(path.isAbsolute(reference)) { errors.push(`Evidence reference escapes output root: ${task.id}/${reference}`); continue; }
    const file=path.resolve(outputRoot,reference), relative=path.relative(outputRoot,file);
    if(relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative)) {
      errors.push(`Evidence reference escapes output root: ${task.id}/${reference}`);
      continue;
    }
    let stat;
    try { stat=fs.lstatSync(file); } catch { errors.push(`Evidence file is missing: ${task.id}/${reference}`); continue; }
    if(!stat.isFile()||stat.isSymbolicLink()) { errors.push(`Evidence reference is not a regular file: ${task.id}/${reference}`); continue; }
    const realFile=fs.realpathSync(file), realRelative=path.relative(outputRoot,realFile);
    if(realRelative==='..'||realRelative.startsWith(`..${path.sep}`)||path.isAbsolute(realRelative)) {
      errors.push(`Evidence reference escapes output root through a symlink: ${task.id}/${reference}`);
      continue;
    }
    receipts.push({taskId:task.id,path:relative.split(path.sep).join('/'),bytes:stat.size,sha256:sha256(fs.readFileSync(file))});
  }
  return {valid:errors.length===0,receipts,errors};
}
const walk = root => {
  const rows=[];
  for (const entry of fs.readdirSync(root,{withFileTypes:true})) {
    const file=path.join(root,entry.name);
    if (entry.isDirectory()) rows.push(...walk(file)); else if (entry.isFile()) rows.push(file);
  }
  return rows;
};

export function main(argv) {
  const a=args(argv,['output','public-output']); if(!a.output) throw Error('Usage: --output <existing run directory> [--public-output relative-directory]');
  const root=path.resolve(a.output), revision=git('rev-parse','HEAD').stdout.trim();
  const publicOutput=a['public-output']??'public-source';
  fs.copyFileSync('docs/releases/sdk54-abc-20261111/c-case-review.json',path.join(root,'c-case-review.json'),fs.constants.COPYFILE_EXCL);
  const evaluation=evaluateFinalEvidence(root,publicOutput);
  const candidateIdentity=resolveCandidateIdentity(root,publicOutput);
  const evidenceReview=verifyEvidenceReferences(root,evaluation.tasks);
  if(candidateIdentity.errors.length||!evidenceReview.valid) {
    const integrityErrors=[...candidateIdentity.errors,...evidenceReview.errors];
    evaluation.errors.push(...integrityErrors);
    evaluation.recommendClose=false;
    const c34=evaluation.tasks.find(task=>task.id==='C-34');
    if(c34) {
      if(c34.status==='PASS') c34.status='FAIL';
      c34.blockers.push(...integrityErrors);
    }
  }
  const acceptance={schemaVersion:1, role:'C', independentlyExecuted:['input byte audit','fixed Git identity','7,732-row source relation replay','verifier negative tests'],
    materialOnlyReviewed:['supplement step3 observations'], stages:{
      step3:{status:'FAIL',reason:'scope-reviewed.json is explicitly incomplete; A device semantics and B unified candidate remain unverified'},
      M4:{status:'BLOCKED',reason:'2,872 required relations found, but candidate/device matrix is absent'},
      M5V:{status:'BLOCKED',reason:'no B portable-runner handoff or independent C run'},
      performance:{status:'NOT_RUN',reason:'no device target and no same-machine candidate runs'},
      defaultExpoImage:{status:'BLOCKED',reason:'existing default/ExpoImage blocker retained'},
      M6:{status:'BLOCKED',reason:'earlier gates remain open'}}, recommendClose:evaluation.recommendClose,errors:evaluation.errors};
  save(path.join(root,'c-acceptance.json'),acceptance);
  const handoff=readOptional(path.join(root,'handoff/handoff-verification.json'));
  const commands=readOptional(path.join(root,'commands.json'));
  const requests=buildRequests(handoff,commands);
  save(path.join(root,'requests.json'),requests);
  const dirty=Boolean(git('status','--porcelain=v1','--untracked-files=all').stdout.trim());
  const result={schemaVersion:1,role:'C',runId:path.basename(root),baseRevision:base,sourceRevision:revision,dirty,
    candidate:candidateIdentity.candidate,evidenceReceipts:evidenceReview.receipts,tasks:evaluation.tasks,
    stageClaims:{step3:false,M4:false,M5:false,V:false,M6:false}};
  save(path.join(root,'result.json'),result);
  const changes=owned.filter(file=>fs.existsSync(file)).map(file=>({path:file,bytes:fs.statSync(file).size,sha256:sha256(fs.readFileSync(file))}));
  const trackedPatch=git('diff','--binary','--',...owned).stdout;
  let patch=trackedPatch;
  for(const file of owned.filter(file=>git('ls-files','--error-unmatch',file).status!==0)) patch+=git('diff','--binary','--no-index','/dev/null',file).stdout;
  fs.writeFileSync(path.join(root,'changes.patch'),patch);
  save(path.join(root,'changes.json'),{schemaVersion:1,baseRevision:base,sourceRevision:revision,dirty:true,files:changes,patch:{path:'changes.patch',sha256:sha256(patch)}});
  const replay=`# C replay\n\n每条命令均通过 \`c-record.py\` 包装以保存退出码与 stdout/stderr；下面省略重复包装便于阅读。公开面与 handoff 当前预期非零，必须保留原始失败。\n\n\`\`\`sh\nexport SDK54_ROLE=C\nexport SDK54_REPO="$(git rev-parse --show-toplevel)"\nexport SDK54_INPUTS=/absolute/path/sdk54-abc-inputs\nexport SDK54_HANDOFF="$SDK54_REPO/outputs/sdk54-abc-inbox"\nexport SDK54_OUT="$SDK54_REPO/outputs/sdk54-abc/new-C-run"\nmkdir "$SDK54_OUT" "$SDK54_OUT/source-input" "$SDK54_OUT/verified-inputs"\nrsync -a --exclude=.DS_Store "$SDK54_INPUTS/" "$SDK54_OUT/verified-inputs/"\npython3 docs/releases/sdk54-abc-20261111/verify-inputs.py "$SDK54_OUT/verified-inputs"\ntar -xzf "$SDK54_OUT/verified-inputs/source-evidence-bundle.tar.gz" -C "$SDK54_OUT/source-input"\nnode --test scripts/sdk54/__tests__/a-m4-evidence.test.mjs scripts/sdk54/__tests__/a-source-evidence.test.mjs scripts/sdk54/__tests__/m4-scope-inventory.test.mjs\nnode --test scripts/sdk54/__tests__/m0-finite-declarations.test.mjs scripts/sdk54/__tests__/m0-derived-source-provenance.test.mjs scripts/sdk54/__tests__/m0-export-source-bindings.test.mjs scripts/sdk54/__tests__/m0-final-public-closure.test.mjs scripts/sdk54/__tests__/m0-final-scope-relations.test.mjs\nnode --test scripts/sdk54/__tests__/ai-e2e-*.test.mjs scripts/sdk54/__tests__/abc-c-*.test.mjs\nnode --test scripts/sdk54/__tests__/abc-a-*.test.mjs scripts/sdk54/__tests__/abc-b-*.test.mjs\nnode scripts/sdk54/abc/c-input-audit.mjs --inputs "$SDK54_OUT/verified-inputs" --reconstruction "$SDK54_OUT/source-input/source-evidence" --manifest docs/releases/sdk54-abc-20261111/inputs.json --output "$SDK54_OUT/input-audit"\nnode scripts/sdk54/abc/c-public-closure.mjs --source-root "$SDK54_REPO" --reconstruction "$SDK54_OUT/source-input/source-evidence" --scope "$SDK54_OUT/verified-inputs/public-scope/scope-reviewed.json" --mode source --output "$SDK54_OUT/public-source"\nnode scripts/sdk54/abc/c-verify-handoff.mjs --handoff "$SDK54_HANDOFF" --a-contract docs/releases/sdk54-abc-20261111/a-sheet-contract.json --source-root "$SDK54_REPO" --deveco-sdk-root /Applications/DevEco-Studio.app/Contents/sdk --output "$SDK54_OUT/handoff"\ncorepack pnpm check\nnode scripts/sdk54/abc/c-finalize.mjs --output "$SDK54_OUT" --public-output public-source\n# Candidate 到达后必须使用新输出目录，并追加 c-public-closure --mode candidate --candidate /frozen/candidate.json。\n\`\`\`\n`;
  fs.writeFileSync(path.join(root,'replay.md'),replay);
  const report={result,acceptance,requests,changes,links:['input-audit/report.html',`${publicOutput}/report.html`],edgeCases:[
    'wrong hashes, path traversal, symlink escape and output reuse are rejected',
    'duplicate public IDs, missing M4 assertions and incomplete M7 transfer are rejected',
    'dirty/non-commit source, empty candidate, zero commands, timeout, interruption and damaged images are rejected',
    'source closure never implies Harmony runtime acceptance']};
  fs.writeFileSync(path.join(root,'report.html'),html('SDK54 ABC C-31～C-34 独立验收报告',report),{flag:'wx'});
  const excluded=new Set(['artifacts.json']);
  const artifacts=walk(root).filter(file=>!excluded.has(path.basename(file))).map(file=>({path:path.relative(root,file),bytes:fs.statSync(file).size,sha256:sha256(fs.readFileSync(file))}));
  save(path.join(root,'artifacts.json'),artifacts);
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) main(process.argv.slice(2));
