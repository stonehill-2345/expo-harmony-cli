import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { baselineScenarios, validateBaselineResults } from './current-baseline.mjs';
import { validateSdk52Replay } from './sdk52-install-replay.mjs';
import { serializeInventory } from './source-inventory.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const currentDirectory = 'outputs/sdk54/ai-e2e/20261022-m0-current-baseline';
const replayDirectory = 'outputs/sdk54/ai-e2e/20261022-m0-sdk52-install';

export function portableAuditEvidence(file, root = process.cwd()) {
  const relative = path.relative(path.resolve(root), path.resolve(root, file));
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw new Error(`Evidence outside repository: ${file}`);
  return relative.split(path.sep).join('/');
}

export function summarizeM0Baseline({ current, replay, followup, checks }) {
  const errors = [], observations = [];
  const collect = (scenarios, definitions, label) => {
    if (JSON.stringify(scenarios.map(s => s.id).sort()) !== JSON.stringify(definitions.map(d => d.id).sort())) errors.push(`${label}: incomplete scenario matrix`);
    const totals = { PASS: 0, FAIL: 0, NOT_RUN: 0 };
    for (const scenario of scenarios) {
      const expected = definitions.find(d => d.id === scenario.id);
      if (!expected || JSON.stringify(scenario.steps.map(s => s.id.replace(`${scenario.id}-`, ''))) !== JSON.stringify(expected.steps)) errors.push(`${label}: incomplete steps ${scenario.id}`);
      for (const step of scenario.steps) {
        if (!Object.hasOwn(totals, step.status)) errors.push(`Invalid status ${step.id}`); else totals[step.status]++;
        if (step.status === 'NOT_RUN' && !step.reason) errors.push(`Missing prerequisite ${scenario.id}/${step.id}`);
        observations.push({ id: `${label}/${scenario.id}/${step.id}`, status: step.status, reason: step.reason ?? null });
      }
    }
    return totals;
  };
  const currentStatuses = collect(current.scenarios, baselineScenarios.map(s => ({ id: s.id, steps: ['create', 'identify', s.sdk === '52' ? 'scan' : 'doctor', 'prebuild', 'native-device'] })), 'current');
  const replayStatuses = collect(replay.scenarios, ['npm', 'pnpm'].map(p => ({ id: `sdk52-${p}`, steps: ['install', 'identity', 'prebuild', 'repeat-prebuild', 'repeat-consistency', 'release-bundle', 'native-device'] })), 'sdk52-install');
  const requiredChecks = ['currentEvidence', 'replayEvidence', 'followupEvidence', 'archivedEvidence', 'minimalReproductions', 'devicePreflight', 'sameCandidate'];
  for (const key of requiredChecks) if (checks[key] !== true) errors.push(`Evidence check failed: ${key}`);
  if (followup.execution?.status !== 'FAIL' || followup.execution?.exitCode !== 1 || followup.artifact !== null) errors.push('Expected observed Release failure changed; new audit definition required');
  return { schemaVersion: 1, taskId: 'M0-04', acceptanceId: 'M0-A03', investigationAccepted: !errors.length,
    basis: 'M0-A03 requires real command/results/environment/identity records and preserves existing failures; product repair/runtime acceptance remains separate.',
    currentStatuses, replayStatuses, releaseFollowup: { status: followup.execution?.status, exitCode: followup.execution?.exitCode },
    checks, observations, errors, productAllPassed: false, nativeDeviceAccepted: false, stageClosable: false };
}

export function buildM0BaselineAudit() {
  const currentFile = path.join(currentDirectory, 'attempt-a/results.json'), replayFile = path.join(replayDirectory, 'attempt-a/results.json');
  const current = json(currentFile), replay = json(replayFile), followup = json(path.join(replayDirectory, 'release-followup/results.json'));
  const checks = { currentEvidence: validateBaselineResults(current, path.dirname(currentFile)).valid,
    replayEvidence: validateSdk52Replay(replay, path.dirname(replayFile)).valid,
    sameCandidate: current.candidate.sha256 === replay.candidate.sha256 && followup.candidateSha256 === current.candidate.sha256,
    followupEvidence: false, archivedEvidence: false, minimalReproductions: false, devicePreflight: false };
  const evidence = [];
  const verify = (file, expected) => {
    const data = fs.readFileSync(file), sha256 = hash(data);
    if (expected && sha256 !== expected) throw new Error(`Evidence hash mismatch ${file}`);
    evidence.push({ path: portableAuditEvidence(file), sha256 }); return data;
  };
  // Verify immutable output archives, not the old snapshot's references to the evolving working tree.
  for (const directory of [currentDirectory, replayDirectory]) {
    const indexFile = path.join(directory, 'evidence-index.json'); verify(indexFile);
    for (const record of json(indexFile).files) verify(record.path, record.sha256);
  }
  checks.archivedEvidence = true;
  verify(followup.reference.path, followup.reference.sha256);
  verify(path.join(replayDirectory, 'release-followup', followup.execution.log), followup.execution.logSha256);
  checks.followupEvidence = followup.reference.sha256 === hash(fs.readFileSync(replayFile)) && followup.nativeBeforeSha256 === replay.scenarios.find(s => s.packageManager === 'pnpm').nativeFirst.sha256;
  checks.minimalReproductions = ['peer', 'router'].every(name => {
    const record = json(path.join(replayDirectory, `${name}-reproduction.json`));
    verify(path.join(replayDirectory, `${name}-reproduction.json`));
    return record.exit === 1 && record.status === 'FAIL' && record.productFixed === false;
  });
  const targets = replay.setup.find(s => s.id === 'hdc-targets');
  checks.devicePreflight = targets.status === 'PASS' && verify(path.join(replayDirectory, 'attempt-a', targets.log), targets.logSha256).toString('utf8').trim() === '[Empty]';
  return { ...summarizeM0Baseline({ current, replay, followup, checks }), candidateSha256: current.candidate.sha256,
    evidence: [...new Map(evidence.map(record => [record.path, record])).values()].sort((a, b) => a.path.localeCompare(b.path)) };
}

export function validateM0BaselineAudit(actual, expected) {
  return { valid: serializeInventory(actual) === serializeInventory(expected), errors: serializeInventory(actual) === serializeInventory(expected) ? [] : ['Baseline audit differs from verified original evidence'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || !['--output', '--check'].includes(args[0])) throw new Error('Usage: --output|--check <json>');
    const expected = buildM0BaselineAudit();
    if (args[0] === '--check') { const checked = validateM0BaselineAudit(json(args[1]), expected); console.log(JSON.stringify(checked)); if (!checked.valid) process.exitCode = 1; }
    else { fs.writeFileSync(args[1], serializeInventory(expected)); console.log(JSON.stringify({ investigationAccepted: expected.investigationAccepted, errors: expected.errors, currentStatuses: expected.currentStatuses, replayStatuses: expected.replayStatuses, productAllPassed: false, stageClosable: false })); if (!expected.investigationAccepted) process.exitCode = 2; }
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
