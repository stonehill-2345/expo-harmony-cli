import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeScreenshot, verifyCandidateManifest, verifyDeviceAssertion, verifyM4DeviceAssertion, verifySuccessfulCommand } from './evidence.mjs';
import { validateCaseSet, validateResults, validateRunManifest } from './schema.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const STATUSES = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN']);
const REGISTRY_FILE = fileURLToPath(new URL('./cases/registry.json', import.meta.url));

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function resolveRunFile(runDirectory, relativePath, label, errors) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) {
    errors.push(`${label} path must be a non-empty relative path`);
    return null;
  }
  const absolute = path.resolve(runDirectory, relativePath);
  const relation = path.relative(runDirectory, absolute);
  if (relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    errors.push(`${label} path escapes the run directory: ${relativePath}`);
    return null;
  }
  if (!fs.existsSync(absolute)) {
    errors.push(`${label} is missing: ${relativePath}`);
    return null;
  }
  const real = fs.realpathSync(absolute);
  const realRelation = path.relative(runDirectory, real);
  if (realRelation === '..' || realRelation.startsWith(`..${path.sep}`) || path.isAbsolute(realRelation)) {
    errors.push(`${label} resolves outside the run directory: ${relativePath}`);
    return null;
  }
  return absolute;
}

function verifyReferencedFile(runDirectory, reference, label, errors) {
  if (!reference || !SHA256.test(reference.sha256 ?? '')) {
    errors.push(`${label} must declare a SHA-256 hash`);
    return null;
  }
  const file = resolveRunFile(runDirectory, reference.path, label, errors);
  if (!file) return null;
  const bytes = fs.readFileSync(file);
  const actual = sha256(bytes);
  if (actual !== reference.sha256) errors.push(`${label} hash mismatch: ${reference.path}`);
  return { file, bytes, actual };
}

function verifyEvidence(runDirectory, result, manifest, errors) {
  if (!Array.isArray(result.evidence) || result.evidence.length === 0) {
    if (result.status === 'PASS') errors.push(`PASS result has no evidence: ${result.caseId}/${result.attemptId}`);
    return new Set();
  }
  const types = new Set();
  for (const evidence of result.evidence) {
    const label = `Evidence ${result.caseId}/${result.attemptId}`;
    if (typeof evidence?.type !== 'string' || !evidence.type) {
      errors.push(`${label} has no type`);
      continue;
    }
    types.add(evidence.type);
    const verified = verifyReferencedFile(runDirectory, evidence, label, errors);
    if (!verified) continue;
    if (evidence.type === 'screenshot') {
      try { decodeScreenshot(verified.bytes); }
      catch (error) { errors.push(`${error.message}: ${evidence.path}`); }
    }
    if (evidence.type === 'device-assertion') {
      let kind = null;
      try { kind = JSON.parse(verified.bytes).kind; } catch { /* verifier below reports malformed JSON */ }
      const verifier = kind === 'm4-device-assertion' ? verifyM4DeviceAssertion : verifyDeviceAssertion;
      verifier(verified.bytes, manifest,
        (reference, label) => verifyReferencedFile(runDirectory, reference, label, errors), errors);
    }
  }
  return types;
}

function verifyResultIdentity(result, manifest, errors) {
  const id = `${result.caseId ?? '<missing>'}/${result.attemptId ?? '<missing>'}`;
  if (result.runId !== manifest.runId) errors.push(`Result run ID mismatch: ${id}`);
  if (result.caseSetSha256 !== manifest.caseSet?.sha256) errors.push(`Result case-set hash mismatch: ${id}`);
  if (result.candidateSha256 !== manifest.candidate?.sha256) errors.push(`Result candidate hash mismatch: ${id}`);
  if (!STATUSES.has(result.status)) errors.push(`Invalid result status: ${id}`);
  if (result.status === 'PASS' && result.timedOut === true) errors.push(`Result cannot be PASS after timeout: ${id}`);
  if (result.status === 'PASS' && result.interrupted === true) errors.push(`Result cannot be PASS after interruption: ${id}`);
  if (result.status === 'PASS' && (!result.startedAt || !result.endedAt)) errors.push(`PASS result has incomplete timestamps: ${id}`);
}

function verifyCaseSetAgainstRegistry(caseSet, manifest, errors) {
  const registryBytes = fs.readFileSync(REGISTRY_FILE);
  const registry = JSON.parse(registryBytes);
  if (registry.schemaVersion !== 1) errors.push('Unsupported case registry schemaVersion');
  if (caseSet.registryVersion !== registry.registryVersion) errors.push('Case-set registry version mismatch');
  if (caseSet.registrySha256 !== sha256(registryBytes)) errors.push('Case-set registry hash mismatch');
  const expected = new Map((registry.stages?.[manifest.stage] ?? []).map((item) => [item.id, item]));
  if (expected.size === 0) errors.push(`No registered cases for stage: ${manifest.stage ?? '<missing>'}`);
  const actual = new Map((caseSet.cases ?? []).map((item) => [item.id, item]));
  for (const [id, definition] of expected) {
    const candidate = actual.get(id);
    if (!candidate) {
      errors.push(`Registry-required case is missing: ${id}`);
      continue;
    }
    if (candidate.required !== definition.required) errors.push(`Case required flag differs from registry: ${id}`);
    if (candidate.requiresDevice !== definition.requiresDevice) errors.push(`Case device requirement differs from registry: ${id}`);
    if (JSON.stringify(candidate.requiredEvidence ?? []) !== JSON.stringify(definition.requiredEvidence ?? [])) {
      errors.push(`Case evidence requirements differ from registry: ${id}`);
    }
  }
  for (const id of actual.keys()) {
    if (!expected.has(id)) errors.push(`Case is not registered for stage ${manifest.stage}: ${id}`);
  }
}

export function verifyRunReport(runDirectory) {
  const errors = [];
  const root = fs.realpathSync(runDirectory);
  const manifestFile = path.join(root, 'run-manifest.json');
  const resultsFile = path.join(root, 'results.json');
  const manifest = readJson(manifestFile);
  const resultsDocument = readJson(resultsFile);

  errors.push(...validateRunManifest(manifest), ...validateResults(resultsDocument));
  if (manifest.source?.dirty !== false) errors.push('Run source must be clean');
  if (!/^[a-f0-9]{40}$/.test(manifest.source?.revision ?? '')) errors.push('Run source revision must be a Git commit');

  const caseSetFile = verifyReferencedFile(root, manifest.caseSet, 'Case set', errors)?.file;
  const candidate = verifyReferencedFile(root, manifest.candidate, 'Candidate manifest', errors);
  if (candidate) errors.push(...verifyCandidateManifest(candidate.file));
  const caseSet = caseSetFile ? readJson(caseSetFile) : { cases: [] };
  errors.push(...validateCaseSet(caseSet));
  verifyCaseSetAgainstRegistry(caseSet, manifest, errors);

  const definitions = new Map();
  for (const definition of Array.isArray(caseSet.cases) ? caseSet.cases : []) {
    if (typeof definition?.id !== 'string' || !definition.id) {
      errors.push('Case definition has no ID');
      continue;
    }
    if (definitions.has(definition.id)) errors.push(`Duplicate case definition: ${definition.id}`);
    definitions.set(definition.id, definition);
  }

  if (resultsDocument.runId !== manifest.runId) errors.push('Results document run ID mismatch');
  const resultsByCase = new Map();
  const attempts = new Set();
  for (const result of Array.isArray(resultsDocument.results) ? resultsDocument.results : []) {
    const key = `${result.caseId ?? '<missing>'}/${result.attemptId ?? '<missing>'}`;
    if (attempts.has(key)) errors.push(`Duplicate result: ${key}`);
    attempts.add(key);
    const definition = definitions.get(result.caseId);
    if (!definition) errors.push(`Unexpected case result: ${result.caseId ?? '<missing>'}`);
    verifyResultIdentity(result, manifest, errors);
    const evidenceTypes = verifyEvidence(root, result, manifest, errors);
    if (result.status === 'PASS') {
      verifySuccessfulCommand(result.command, `Case command ${key}`,
        (reference, label) => verifyReferencedFile(root, reference, label, errors), errors);
      if (result.command?.id !== result.caseId) errors.push(`Case command ID mismatch: ${key}`);
      for (const log of [result.command?.stdout, result.command?.stderr]) {
        if (!log || !Array.isArray(result.evidence)
          || !result.evidence.some(e => e?.type === 'command-log' && e.path === log.path && e.sha256 === log.sha256)) {
          errors.push(`Case command log missing from evidence: ${key}`);
        }
      }
    }
    if (result.status === 'PASS' && definition) {
      if (definition.requiresDevice && (!manifest.device?.target || !manifest.device?.platformVersion)) {
        errors.push(`Case requires a device: ${result.caseId}`);
      }
      for (const type of definition.requiredEvidence ?? []) {
        if (!evidenceTypes.has(type)) errors.push(`Missing required evidence ${type}: ${result.caseId}/${result.attemptId}`);
      }
    }
    const entries = resultsByCase.get(result.caseId) ?? [];
    entries.push(result);
    resultsByCase.set(result.caseId, entries);
  }

  const missingCases = [];
  for (const definition of definitions.values()) {
    if (!definition.required) continue;
    const caseResults = resultsByCase.get(definition.id) ?? [];
    if (caseResults.length === 0) {
      missingCases.push(definition.id);
      errors.push(`Missing required case: ${definition.id}`);
      continue;
    }
    if (caseResults.some((result) => result.status !== 'PASS')) {
      errors.push(`Required case has unresolved non-PASS attempt: ${definition.id}`);
    }
  }

  return {
    schemaVersion: 1,
    runId: manifest.runId ?? null,
    stage: manifest.stage ?? null,
    expectedCases: [...definitions.values()].filter(({ required }) => required).map(({ id }) => id).sort(),
    actualCases: [...resultsByCase.keys()].filter(Boolean).sort(),
    missingCases: missingCases.sort(),
    errors,
    canClose: errors.length === 0,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--run-dir') {
    throw new Error('Usage: report.mjs --run-dir /absolute/path/to/run-directory');
  }
  const report = verifyRunReport(args[1]);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.canClose) process.exitCode = 1;
}
