import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { isMain, repository, writeJSON } from './a-common.mjs';

export function completeCommands({ base, consumer, runDirectory, coreDeviceEvidence, otherDeviceEvidence, output }) {
  if (fs.existsSync(output)) throw new Error(`output exists: ${output}`);
  const value = JSON.parse(fs.readFileSync(base, 'utf8'));
  if (value.schemaVersion !== 1 || value.stage !== 'V-02' || !Array.isArray(value.cases)) throw new Error('invalid V-02 command input');
  const ids = new Set(value.cases.map(row => row.id));
  for (const id of ['V02-CORE-M4', 'V02-OTHER-M4']) if (ids.has(id)) throw new Error(`command already exists: ${id}`);
  const script = path.join(repository, 'scripts/sdk54/abc/b-run-m4.mjs');
  const add = (id, scope, evidence) => ({ id, semanticCaseIds: [], command: { argv: [process.execPath, script, '--scope', scope,
    '--consumer', path.resolve(consumer), '--device-evidence', path.resolve(evidence), '--output', path.resolve(runDirectory, `captures/${scope}-m4`)],
    cwd: path.resolve(runDirectory), timeoutMs: 600_000,
    evidence: [{ type: 'device-assertion', path: `captures/${scope}-m4/device-assertion.json` }] } });
  const result = { schemaVersion: 1, stage: 'V-02', status: 'COMPLETE_NOT_EXECUTED', omittedCases: [],
    cases: [...value.cases, add('V02-CORE-M4', 'core', coreDeviceEvidence), add('V02-OTHER-M4', 'other', otherDeviceEvidence)] };
  if (result.cases.length !== 19 || new Set(result.cases.map(row => row.id)).size !== 19) throw new Error('V-02 must contain 19 unique commands');
  const expected = JSON.parse(fs.readFileSync(new URL('../ai-e2e/cases/registry.json', import.meta.url), 'utf8'))
    .stages['V-02'].map(row => row.id).sort();
  if (JSON.stringify(result.cases.map(row => row.id).sort()) !== JSON.stringify(expected)) {
    throw new Error('commands must match the registered V-02 case set');
  }
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  writeJSON(output, result);
  return result;
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { base: { type: 'string' }, consumer: { type: 'string' }, 'run-dir': { type: 'string' },
    'core-device-evidence': { type: 'string' }, 'other-device-evidence': { type: 'string' }, output: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) console.log('b-complete-v02-commands.mjs --base <17-case json> --consumer <root> --run-dir <planned run> --core-device-evidence <json> --other-device-evidence <json> --output <new json>');
  else {
    try { const result = completeCommands({ base: values.base, consumer: values.consumer, runDirectory: values['run-dir'],
      coreDeviceEvidence: values['core-device-evidence'], otherDeviceEvidence: values['other-device-evidence'], output: values.output });
      console.log(JSON.stringify({ cases: result.cases.length, status: result.status })); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
