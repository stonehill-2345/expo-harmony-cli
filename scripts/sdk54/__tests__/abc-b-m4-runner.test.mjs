import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validateM4DeviceEvidence } from '../abc/b-run-m4.mjs';
import { completeCommands } from '../abc/b-complete-v02-commands.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../ai-e2e/cases/registry.json', import.meta.url))).stages['V-02'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function device(root, scope, ids) {
  const evidence = Buffer.from('device evidence'); fs.writeFileSync(path.join(root, 'evidence.txt'), evidence);
  const value = { schemaVersion: 1, scope, candidateSha256: 'a'.repeat(64), target: '127.0.0.1:5555', systemVersion: '6.0.0.112',
    bundle: 'dev.expo.m4', pid: 42, hapSha256: 'b'.repeat(64), runManifest: { candidateSha256: 'a'.repeat(64), target: '127.0.0.1:5555', bundle: 'dev.expo.m4', pid: 42, hapSha256: 'b'.repeat(64) }, cases: Object.fromEntries(ids.map(id => [id,
      { status: 'PASS', semantic: { oracle: 'fixture-oracle', result: 'PASS' }, evidence: [{ path: 'evidence.txt', sha256: sha(evidence) }] }])) };
  const file = path.join(root, `${scope}.json`); fs.writeFileSync(file, JSON.stringify(value)); return file;
}

test('validates complete Core and Other device evidence and rejects omissions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm4-device-'));
  const coreIds = ['M4-A06-error','M4-A06-async','M4-A06-events','M4-A06-resources','M4-A06-view','M4-A06-reload','M4-A06-runtime-isolation'];
  const otherIds = ['M4-A03-splash','M4-A03-system-ui','M4-A03-status-bar','M4-A04-linking-router','M4-A05-browser','M4-A07-package-sync'];
  assert.equal(validateM4DeviceEvidence(device(root, 'core', coreIds), 'core').status, 'PASS');
  assert.equal(validateM4DeviceEvidence(device(root, 'other', otherIds), 'other').status, 'PASS');
  const broken = device(root, 'core-broken', coreIds.slice(1));
  assert.throws(() => validateM4DeviceEvidence(broken, 'core'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('rejects M4 identity fields that disagree with run-manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm4-identity-'));
  const ids = ['M4-A06-error','M4-A06-async','M4-A06-events','M4-A06-resources','M4-A06-view','M4-A06-reload','M4-A06-runtime-isolation'];
  const file = device(root, 'core', ids);
  const forged = JSON.parse(fs.readFileSync(file, 'utf8'));
  forged.runManifest.pid = 99;
  fs.writeFileSync(file, JSON.stringify(forged));
  assert.throws(() => validateM4DeviceEvidence(file, 'core'), /run-manifest|identity/i);
  fs.rmSync(root, { recursive: true, force: true });
});

test('rejects self-reported PASS without semantic oracle evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm4-semantic-'));
  const ids = ['M4-A06-error','M4-A06-async','M4-A06-events','M4-A06-resources','M4-A06-view','M4-A06-reload','M4-A06-runtime-isolation'];
  const file = device(root, 'core', ids);
  const forged = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete forged.cases[ids[0]].semantic;
  fs.writeFileSync(file, JSON.stringify(forged));
  assert.throws(() => validateM4DeviceEvidence(file, 'core'), /semantic|oracle/i);
  fs.rmSync(root, { recursive: true, force: true });
});

test('adds real Core and Other commands to the complete V-02 case set', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm4-commands-'));
  const base = path.join(root, 'base.json'), output = path.join(root, 'commands.json'), run = path.join(root, 'run'), consumer = path.join(root, 'consumer');
  fs.mkdirSync(run); fs.mkdirSync(consumer);
  const cases = registry.filter(row => !['V02-CORE-M4','V02-OTHER-M4'].includes(row.id)).map(row => ({ id: row.id, semanticCaseIds: [], command: { argv: ['node','x'], cwd: '.', timeoutMs: 1, evidence: [] } }));
  fs.writeFileSync(base, JSON.stringify({ schemaVersion: 1, stage: 'V-02', cases }));
  const result = completeCommands({ base, consumer, runDirectory: run, coreDeviceEvidence: path.join(root, 'core.json'),
    otherDeviceEvidence: path.join(root, 'other.json'), output });
  assert.equal(result.cases.length, 19); assert.equal(result.omittedCases.length, 0);
  assert.deepEqual(result.cases.map(row=>row.id).sort(),registry.map(row=>row.id).sort());
  const forged = structuredClone(cases); forged[0].id = 'V02-INVENTED';
  fs.writeFileSync(base, JSON.stringify({schemaVersion:1,stage:'V-02',cases:forged}));
  assert.throws(()=>completeCommands({base,consumer,runDirectory:run,coreDeviceEvidence:path.join(root,'core.json'),
    otherDeviceEvidence:path.join(root,'other.json'),output:path.join(root,'forged.json')}),/registered V-02 case set/);
  assert.equal(fs.existsSync(path.join(root,'forged.json')),false);
  for (const id of ['V02-CORE-M4','V02-OTHER-M4']) {
    const row = result.cases.find(item => item.id === id);
    assert.match(row.command.argv[1], /b-run-m4\.mjs$/); assert.ok(row.command.argv.includes('--device-evidence'));
    assert.equal(row.command.evidence[0].type, 'device-assertion');
  }
  fs.rmSync(root, { recursive: true, force: true });
});
