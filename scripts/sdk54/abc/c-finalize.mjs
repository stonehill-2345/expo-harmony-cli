import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { args, save, sha256, html } from './c-evidence-lib.mjs';

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

export function evaluateFinalEvidence(root, publicOutput='public-source') {
  const errors=[];
  const audit=readOptional(path.join(root,'input-audit/c-input-audit.json'));
  const closure=readOptional(path.join(root,publicOutput,'public-closure.json'));
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
    {id:'C-32',status:closure?'FAIL':'BLOCKED',evidence:[`${publicOutput}/public-closure.json`,`${publicOutput}/scope-review.json`,`${publicOutput}/finite-declarations.json`,`${publicOutput}/derived-source-provenance.json`,`${publicOutput}/export-source-bindings.json`,`${publicOutput}/plugin-contracts.json`],blockers:c32Blockers},
    {id:'C-33',status:c33Blockers.length?'BLOCKED':'PASS',evidence:['handoff/handoff-verification.json','c-case-review.json'],blockers:c33Blockers},
  ];
  const requiredCommandsPass=Boolean(check&&negative&&commandPassed(check)&&commandPassed(negative));
  const priorPass=tasks.every(task=>task.status==='PASS');
  const recommendClose=priorPass&&requiredCommandsPass;
  const commandBlockers=errors.filter(error=>/command|pnpm check|negative test/i.test(error));
  tasks.push({id:'C-34',status:recommendClose?'PASS':(!commands||!closure||!handoff?'BLOCKED':'FAIL'),evidence:['commands.json','c-acceptance.json'],blockers:[...commandBlockers,...(!priorPass?['C-31～C-33 are not all PASS']:[])]});
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
  const result={schemaVersion:1,role:'C',runId:path.basename(root),baseRevision:base,sourceRevision:revision,dirty,candidate:null,tasks:evaluation.tasks,stageClaims:{step3:false,M4:false,M5:false,V:false,M6:false}};
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
