import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { args, save, sha256, html } from './c-evidence-lib.mjs';

const base = 'f3892fade4e3f93c89420f2580a94f362bb23d2d';
const owned = [
  'scripts/sdk54/ai-e2e/report.mjs', 'scripts/sdk54/__tests__/ai-e2e-report.test.mjs',
  'scripts/sdk54/__tests__/abc-c-handoff.test.mjs', 'scripts/sdk54/__tests__/abc-c-portable.test.mjs',
  'scripts/sdk54/__tests__/abc-c-public-closure.test.mjs', 'scripts/sdk54/__tests__/abc-c-full-closure.test.mjs', 'scripts/sdk54/abc/c-record.py',
  'scripts/sdk54/abc/c-evidence-lib.mjs', 'scripts/sdk54/abc/c-input-audit.mjs',
  'scripts/sdk54/abc/c-public-closure.mjs', 'scripts/sdk54/abc/c-verify-handoff.mjs',
  'scripts/sdk54/abc/c-finalize.mjs', 'docs/releases/sdk54-abc-20261111/c-case-review.json',
  'docs/superpowers/plans/2026-11-11-sdk54-abc-c-closure.md',
];
const git = (...argv) => spawnSync('git', argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
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
  const acceptance={schemaVersion:1, role:'C', independentlyExecuted:['input byte audit','fixed Git identity','7,732-row source relation replay','verifier negative tests'],
    materialOnlyReviewed:['supplement step3 observations'], stages:{
      step3:{status:'FAIL',reason:'scope-reviewed.json is explicitly incomplete; A contract and B unified candidate are absent'},
      M4:{status:'BLOCKED',reason:'2,872 required relations found, but candidate/device matrix is absent'},
      M5V:{status:'BLOCKED',reason:'no B portable-runner handoff or independent C run'},
      performance:{status:'NOT_RUN',reason:'no device target and no same-machine candidate runs'},
      defaultExpoImage:{status:'BLOCKED',reason:'existing default/ExpoImage blocker retained'},
      M6:{status:'BLOCKED',reason:'earlier gates remain open'}}, recommendClose:false};
  save(path.join(root,'c-acceptance.json'),acceptance);
  const requests=[
    {id:'C-REQ-A-CONTRACT',from:'C',to:'A',blockedTaskId:'C-33',files:['a-contract.json'],reproduction:'C handoff inbox contains no A delivery',expected:'exact Sheet/resource/Drawer semantic assertions and fixture hashes',requiredEvidence:['contract hash','assertion file hashes']},
    {id:'C-REQ-B-CANDIDATE',from:'C',to:'B',blockedTaskId:'C-32-candidate/C-33',files:['b-candidate.json','candidate.json','release.json','15 tgz','CLI tgz','case-set','portable runner run'],reproduction:'C handoff inbox is empty',expected:'one clean-source frozen candidate and complete required case set',requiredEvidence:['raw command logs','candidate hashes','run manifests','device evidence']},
    {id:'C-REQ-INSTALL',from:'C',to:'B',blockedTaskId:'C-34-check',files:['dependency/install ownership'],reproduction:'corepack pnpm install --frozen-lockfile fails in expo-status-bar prepare because react/react-native types are absent',expected:'authorized shared dependency/candidate setup that installs without changing acceptance',requiredEvidence:['fresh install log']}
  ];
  save(path.join(root,'requests.json'),requests);
  const result={schemaVersion:1,role:'C',runId:path.basename(root),baseRevision:base,sourceRevision:revision,dirty:true,candidate:null,tasks:[
    {id:'C-31',status:'PASS',evidence:['input-audit/c-input-audit.json'],blockers:[]},
    {id:'C-32',status:'FAIL',evidence:[`${publicOutput}/public-closure.json`,`${publicOutput}/scope-review.json`,`${publicOutput}/finite-declarations.json`,`${publicOutput}/derived-source-provenance.json`,`${publicOutput}/export-source-bindings.json`,`${publicOutput}/plugin-contracts.json`],blockers:['reviewed public scope remains complete=false','historical capability/membership inputs absent','B candidate absent']},
    {id:'C-33',status:'BLOCKED',evidence:['device-targets.stdout','c-case-review.json'],blockers:['A contract absent','B candidate/case-set/runner absent','device target list empty']},
    {id:'C-34',status:'PASS',evidence:['negative tests','c-acceptance.json'],blockers:['final closure recommendation remains false']}
  ],stageClaims:{step3:false,M4:false,M5:false,V:false,M6:false}};
  save(path.join(root,'result.json'),result);
  const changes=owned.filter(file=>fs.existsSync(file)).map(file=>({path:file,bytes:fs.statSync(file).size,sha256:sha256(fs.readFileSync(file))}));
  const trackedPatch=git('diff','--binary','--',...owned).stdout;
  let patch=trackedPatch;
  for(const file of owned.filter(file=>git('ls-files','--error-unmatch',file).status!==0)) patch+=git('diff','--binary','--no-index','/dev/null',file).stdout;
  fs.writeFileSync(path.join(root,'changes.patch'),patch);
  save(path.join(root,'changes.json'),{schemaVersion:1,baseRevision:base,sourceRevision:revision,dirty:true,files:changes,patch:{path:'changes.patch',sha256:sha256(patch)}});
  const replay=`# C replay\n\n\`\`\`sh\nexport SDK54_ROLE=C\nexport SDK54_REPO="$(git rev-parse --show-toplevel)"\nexport SDK54_INPUTS=/absolute/path/sdk54-abc-inputs\nexport SDK54_OUT=/new/absolute/output\nmkdir "$SDK54_OUT"\ntar -xzf "$SDK54_INPUTS/source-evidence-bundle.tar.gz" -C "$SDK54_OUT"\nnode --test scripts/sdk54/__tests__/a-m4-evidence.test.mjs scripts/sdk54/__tests__/a-source-evidence.test.mjs scripts/sdk54/__tests__/m4-scope-inventory.test.mjs\nnode --test scripts/sdk54/__tests__/m0-finite-declarations.test.mjs scripts/sdk54/__tests__/m0-derived-source-provenance.test.mjs scripts/sdk54/__tests__/m0-export-source-bindings.test.mjs scripts/sdk54/__tests__/m0-final-public-closure.test.mjs scripts/sdk54/__tests__/m0-final-scope-relations.test.mjs\nnode --test scripts/sdk54/__tests__/ai-e2e-*.test.mjs scripts/sdk54/__tests__/abc-c-*.test.mjs\nnode scripts/sdk54/abc/c-input-audit.mjs --inputs "$SDK54_INPUTS" --reconstruction "$SDK54_OUT/source-evidence" --manifest docs/releases/sdk54-abc-20261111/inputs.json --output "$SDK54_OUT/input-audit"\nnode scripts/sdk54/abc/c-public-closure.mjs --source-root "$SDK54_REPO" --reconstruction "$SDK54_OUT/source-evidence" --scope "$SDK54_INPUTS/public-scope/scope-reviewed.json" --mode source --output "$SDK54_OUT/public-source"\n# Candidate mode additionally requires --candidate /frozen/candidate.json.\n\`\`\`\n`;
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
