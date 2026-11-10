import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createReleaseManifest } from './release-catalog.mjs';
import { readStageProgress } from './stage-progress.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const receipt = (root, file) => ({ path: file, sha256: sha256(fs.readFileSync(path.join(root, file))) });

const REQUIRED_STAGES = ['M4', 'M5', 'V', 'M6'];

function closed(stage) {
  return stage.closed === true && stage.percent === 100 && stage.pendingUnits.length === 0
    && stage.acceptedUnits.length === stage.totalUnits;
}

export function evaluateA07Entry({ stageProgress, stageEvidenceValid = true, stageEvidenceError = null, a06Contract, releaseManifest }) {
  assert.equal(stageProgress.schemaVersion, 1, 'Unsupported stage progress schema');
  for (const name of REQUIRED_STAGES) {
    const stage = stageProgress.stages?.[name];
    assert.ok(stage && Array.isArray(stage.acceptedUnits) && Array.isArray(stage.pendingUnits), `Missing ${name} stage status`);
    assert.equal(stage.acceptedUnits.length + stage.pendingUnits.length, stage.totalUnits, `Invalid ${name} denominator`);
  }
  assert.equal(a06Contract.format, 'sdk54-a06-expo-image-contract-v1', 'Wrong A-06 contract');
  assert.equal(a06Contract.task, 'A-06', 'Wrong A-06 task');
  assert.equal(a06Contract.version, '3.0.11', 'Wrong expo-image version');
  const a06Ready = a06Contract.preparationStatus === 'PASS'
    && a06Contract.implementationStatus === 'NOT_STARTED'
    && a06Contract.stageClosable === false;
  const stages = Object.fromEntries(REQUIRED_STAGES.map(name => [name, {
    closed: closed(stageProgress.stages[name]),
    percent: stageProgress.stages[name].percent,
    acceptedUnits: stageProgress.stages[name].acceptedUnits,
    pendingUnits: stageProgress.stages[name].pendingUnits,
  }]));
  const expoImage = releaseManifest.packages.find(item => item.installName === 'expo-image') ?? null;
  if (expoImage) assert.equal(expoImage.upstreamVersion, '3.0.11', 'Release catalog has the wrong expo-image version');
  const implementationReady = a06Ready && stageEvidenceValid && stages.M6.closed;
  const integrationReady = implementationReady && Boolean(expoImage);
  const blockers = [];
  if (!a06Ready) blockers.push({ id: 'A06_PREPARATION_INVALID', owner: 'A' });
  if (!stageEvidenceValid) blockers.push({ id: 'STAGE_EVIDENCE_INVALID', owner: 'B/A', detail: stageEvidenceError });
  for (const name of ['M4', 'M5', 'V']) if (!stages[name].closed) blockers.push({ id: `${name}_NOT_CLOSED`, owner: name === 'M4' ? 'A/B' : 'B/A' });
  if (!stages.M6.closed) blockers.push({ id: 'M6_NOT_CLOSED', owner: 'B/A' });
  if (!expoImage) blockers.push({ id: 'EXPO_IMAGE_RELEASE_IDENTITY_MISSING', owner: 'B/A' });
  return {
    a06Ready, stages,
    release: {
      release: releaseManifest.release,
      packageCount: releaseManifest.packages.length,
      expoImage,
    },
    implementationReady,
    integrationReady,
    decision: integrationReady ? 'READY_FOR_FORMAL_INTEGRATION' : implementationReady ? 'READY_FOR_PACKAGE_IMPLEMENTATION' : 'BLOCKED',
    blockers,
  };
}

export function buildA07EntryAudit(root = repository) {
  const a06File = 'docs/releases/2026-11-02-sdk54-a06-expo-image-contract.json';
  const frozen = read(path.join(root, 'docs/releases/sdk54-stage-progress.json'));
  let calculated = null, stageEvidenceError = null;
  try {
    calculated = readStageProgress(root);
    assert.deepEqual(frozen, calculated, 'Frozen stage progress differs from checked acceptance evidence');
  } catch (error) {
    stageEvidenceError = error.message.replaceAll(`${path.resolve(root)}${path.sep}`, '<repo>/');
  }
  const gate = evaluateA07Entry({
    stageProgress: calculated ?? frozen,
    stageEvidenceValid: Boolean(calculated),
    stageEvidenceError,
    a06Contract: read(path.join(root, a06File)),
    releaseManifest: createReleaseManifest(),
  });
  return {
    format: 'sdk54-a07-entry-gate-v1',
    task: 'A-07-entry',
    gate,
    inputs: [
      a06File,
      'docs/releases/sdk54-stage-progress-definition.json',
      'docs/releases/sdk54-stage-acceptance.json',
      'docs/releases/sdk54-stage-progress.json',
      'scripts/sdk54/catalog.mjs',
      'scripts/sdk54/release-catalog.mjs',
      'apps/cli/content/patches/sdk-54/manifest.json',
    ].map(file => receipt(root, file)),
    handoffRequirements: [
      'B updates only checked acceptance evidence; M4, M5, V and M6 cannot be closed by editing percentages',
      'M6 must reach a checked closure before A starts formal M7.4 package implementation',
      'The release mechanism must represent expo-image@3.0.11 before formal combined-candidate integration',
      'Candidate TGZ, installed files, HAP and device evidence must share one freshness identity',
      'GI remains a separate device decision after this entry gate passes',
    ],
  };
}

export function main(args) {
  assert.ok(args.length === 2 && ['--output', '--check'].includes(args[0]), 'Usage: --output|--check <json>');
  const result = buildA07EntryAudit();
  const bytes = JSON.stringify(result, null, 2) + '\n';
  if (args[0] === '--check') assert.equal(sha256(fs.readFileSync(args[1])), sha256(bytes), `A-07 entry audit differs: ${args[1]}`);
  else fs.writeFileSync(args[1], bytes);
  console.log(JSON.stringify({ decision: result.gate.decision, implementationReady: result.gate.implementationReady,
    integrationReady: result.gate.integrationReady, blockers: result.gate.blockers.map(row => row.id) }));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2));
