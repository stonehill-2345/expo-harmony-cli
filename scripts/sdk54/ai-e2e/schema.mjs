import path from 'node:path';

const SHA256 = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const SAFE_ID = /^[A-Za-z0-9_.-]+$/;
const STATUSES = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN']);

const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const absolutePath = value => typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0');
const relativePath = value => typeof value === 'string' && value.length > 0 && !path.isAbsolute(value)
  && !value.includes('\\') && !value.includes('\0')
  && !value.split('/').some(part => ['', '.', '..'].includes(part));

function validateReference(value, name, errors) {
  if (!object(value)) {
    errors.push(`${name} must be an object`);
    return;
  }
  if (!relativePath(value.path)) errors.push(`${name}.path must be a safe relative path`);
  if (!SHA256.test(value.sha256 ?? '')) errors.push(`${name}.sha256 must be a lowercase SHA-256`);
}

export const OTHER_CAPTURE_CASES = Object.freeze(['M4-A03-splash', 'M4-A03-system-ui', 'M4-A03-status-bar',
  'M4-A04-linking-router', 'M4-A05-browser', 'M4-A07-package-sync']);

export function validateOtherCaptureIdentities(cases) {
  const errors = [];
  if (!object(cases) || JSON.stringify(Object.keys(cases).sort()) !== JSON.stringify([...OTHER_CAPTURE_CASES].sort())) {
    return ['m4.other.caseCaptures must contain exactly the six capture case IDs'];
  }
  for (const [id, row] of Object.entries(cases)) {
    const name = `m4.other.caseCaptures.${id}`;
    if (!object(row)) { errors.push(`${name} must be an object`); continue; }
    if (typeof row.bundle !== 'string' || !SAFE_ID.test(row.bundle) || !Number.isSafeInteger(row.pid) || row.pid <= 0
      || !['debug', 'release'].includes(row.mode) || !absolutePath(row.captureCwd)
      || !Array.isArray(row.bootIds) || !row.bootIds.length
      || row.bootIds.some(v => !(typeof v === 'string' && v.length > 0 && !v.includes('\0')
        || Number.isSafeInteger(v) && v > 0))
      || new Set(row.bootIds).size !== row.bootIds.length) errors.push(`${name} has invalid capture identity`);
    validateReference(row.hap, `${name}.hap`, errors);
    validateReference(row.capture, `${name}.capture`, errors);
  }
  return errors;
}

export function validateRunManifest(value) {
  const errors = [];
  if (!object(value)) return ['run manifest must be an object'];
  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!SAFE_ID.test(value.runId ?? '')) errors.push('runId must be a non-empty filesystem-safe string');
  if (typeof value.stage !== 'string' || !value.stage) errors.push('stage must be a non-empty string');
  if (!object(value.source)) errors.push('source must be an object');
  if (typeof value.source?.revision !== 'string' || !REVISION.test(value.source.revision)) errors.push('source.revision must be a 40 or 64 character lowercase hex revision');
  if (typeof value.source?.dirty !== 'boolean') errors.push('source.dirty must be boolean');
  validateReference(value.caseSet, 'caseSet', errors);
  validateReference(value.candidate, 'candidate', errors);
  if (!absolutePath(value.repositoryRoot)) errors.push('repositoryRoot must be an absolute path');
  if (!absolutePath(value.consumerRoot)) errors.push('consumerRoot must be an absolute path');
  if (!object(value.tools)) errors.push('tools must be an object');
  for (const tool of ['node', 'npm', 'pnpm']) {
    if (!absolutePath(value.tools?.[tool])) errors.push(`tools.${tool} must be an absolute path`);
  }
  if (value.device !== undefined && (!object(value.device)
    || typeof value.device.target !== 'string' || !value.device.target
    || typeof value.device.platformVersion !== 'string' || !value.device.platformVersion)) {
    errors.push('device must contain non-empty target and platformVersion');
  }
  if (value.m4 !== undefined && !object(value.m4)) errors.push('m4 must be an object');
  if (value.m4?.other !== undefined && !object(value.m4.other)) errors.push('m4.other must be an object');
  if (value.m4?.other?.captures !== undefined) {
    errors.push('m4.other.captures is unsupported; use m4.other.caseCaptures');
  }
  if (value.m4?.other?.caseCaptures !== undefined) {
    errors.push(...validateOtherCaptureIdentities(value.m4.other.caseCaptures));
    if (!value.device?.target || !value.device?.platformVersion) errors.push('Other captures require device identity');
  }
  if (value.caseCommands !== undefined && !object(value.caseCommands)) errors.push('caseCommands must be an object');
  return errors;
}

export function validateCaseSet(value) {
  const errors = [];
  if (!object(value)) return ['case set must be an object'];
  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (typeof value.registryVersion !== 'string' || !value.registryVersion) errors.push('registryVersion must be non-empty');
  if (!SHA256.test(value.registrySha256 ?? '')) errors.push('registrySha256 must be a lowercase SHA-256');
  if (!Array.isArray(value.cases)) return [...errors, 'cases must be an array'];
  const ids = new Set();
  value.cases.forEach((item, index) => {
    if (!object(item)) {
      errors.push(`cases[${index}] must be an object`);
      return;
    }
    if (!SAFE_ID.test(item.id ?? '')) errors.push(`cases[${index}].id must be filesystem-safe`);
    else if (ids.has(item.id)) errors.push(`duplicate case id: ${item.id}`);
    else ids.add(item.id);
    if (typeof item.required !== 'boolean') errors.push(`cases[${index}].required must be boolean`);
    if (typeof item.requiresDevice !== 'boolean') errors.push(`cases[${index}].requiresDevice must be boolean`);
    if (!Array.isArray(item.requiredEvidence) || item.requiredEvidence.some((type) => typeof type !== 'string' || !type)) {
      errors.push(`cases[${index}].requiredEvidence must be a string array`);
    }
  });
  return errors;
}

export function validateResults(value) {
  const errors = [];
  if (!object(value)) return ['results document must be an object'];
  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!SAFE_ID.test(value.runId ?? '')) errors.push('runId must be a non-empty filesystem-safe string');
  if (!Array.isArray(value.results)) return [...errors, 'results must be an array'];
  value.results.forEach((result, index) => {
    const prefix = `results[${index}]`;
    if (!object(result)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    for (const field of ['caseId', 'attemptId', 'runId']) {
      if (!SAFE_ID.test(result[field] ?? '')) errors.push(`${prefix}.${field} must be filesystem-safe`);
    }
    if (!SHA256.test(result.caseSetSha256 ?? '')) errors.push(`${prefix}.caseSetSha256 must be a lowercase SHA-256`);
    if (!SHA256.test(result.candidateSha256 ?? '')) errors.push(`${prefix}.candidateSha256 must be a lowercase SHA-256`);
    if (!STATUSES.has(result.status)) errors.push(`${prefix}.status must be PASS, FAIL, BLOCKED or NOT_RUN`);
    if (typeof result.timedOut !== 'boolean') errors.push(`${prefix}.timedOut must be boolean`);
    if (typeof result.interrupted !== 'boolean') errors.push(`${prefix}.interrupted must be boolean`);
    if (!Array.isArray(result.evidence)) errors.push(`${prefix}.evidence must be an array`);
    else result.evidence.forEach((evidence, evidenceIndex) => {
      const evidencePrefix = `${prefix}.evidence[${evidenceIndex}]`;
      if (!object(evidence)) errors.push(`${evidencePrefix} must be an object`);
      else {
        if (typeof evidence.type !== 'string' || !evidence.type) errors.push(`${evidencePrefix}.type must be non-empty`);
        if (!relativePath(evidence.path)) errors.push(`${evidencePrefix}.path must be a safe relative path`);
        if (!SHA256.test(evidence.sha256 ?? '')) errors.push(`${evidencePrefix}.sha256 must be a lowercase SHA-256`);
      }
    });
    if (result.status === 'PASS') {
      if (!result.startedAt || !result.endedAt) errors.push(`${prefix} must contain timestamps for PASS`);
      if (!Array.isArray(result.evidence) || result.evidence.length === 0) errors.push(`${prefix}.evidence must be non-empty for PASS`);
    }
  });
  return errors;
}
