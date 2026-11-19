import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isMain, json, options, writeJSON } from './a-common.mjs';

export function advanceResources(project, phase) {
  assert.equal(json(path.join(project,'a-project.json')).scenario,'resources','Not an A resource project');
  for(const relative of ['resource-state.json','fixtures/data.json'])assert.ok(fs.realpathSync(path.join(project,relative)).startsWith(fs.realpathSync(project)+path.sep),'Resource path escapes project');
  const stateFile=path.join(project,'resource-state.json'),state=json(stateFile);
  assert.equal(phase, {initial:'updated',updated:'removed'}[state.phase], 'Only initial → updated → removed is allowed');
  if(phase==='updated')fs.writeFileSync(path.join(project,'fixtures/data.json'),'{ "embedded": "updated" }\n');
  writeJSON(stateFile,{phase});
  return {phase,next:'Run candidate expo prebuild --platform harmony, build HAP, then install -r without uninstalling or clearing data. Capture identity and rawfiles.'};
}
if(isMain(import.meta.url)) {
  try {const args=options(['project','phase'],'a-resource-phase.mjs --project <prepared resources project> --phase updated|removed');if(args)console.log(JSON.stringify(advanceResources(path.resolve(args.project),args.phase)));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
