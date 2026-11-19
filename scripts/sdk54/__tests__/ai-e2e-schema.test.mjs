import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { validateCaseSet, validateResults, validateRunManifest } from '../ai-e2e/schema.mjs';

const hash = 'a'.repeat(64);

test('validates a complete run manifest and reports malformed fields without throwing', () => {
  const valid = {
    schemaVersion: 1,
    runId: '20261030-b02',
    stage: 'V-01',
    source: { revision: '1'.repeat(40), dirty: false },
    caseSet: { path: 'case-set.json', sha256: hash },
    candidate: { path: 'candidate.json', sha256: hash },
    repositoryRoot: '/tmp/sdk54-repository',
    consumerRoot: '/tmp/sdk54-consumer',
    tools: { node: '/usr/bin/node', npm: '/usr/bin/npm', pnpm: '/usr/bin/pnpm' },
  };
  assert.deepEqual(validateRunManifest(valid), []);

  const errors = validateRunManifest({ schemaVersion: 1, runId: '', source: {}, caseSet: {}, candidate: {} });
  assert.ok(errors.includes('runId must be a non-empty filesystem-safe string'));
  assert.ok(errors.includes('stage must be a non-empty string'));
  assert.ok(errors.includes('source.revision must be a 40 or 64 character lowercase hex revision'));
  assert.ok(errors.includes('repositoryRoot must be an absolute path'));
  assert.ok(errors.includes('tools.node must be an absolute path'));
});

test('validates unique case definitions and evidence requirements', () => {
  const valid = {
    schemaVersion: 1,
    registryVersion: '2026-11-11',
    registrySha256: hash,
    cases: [{ id: 'V01-ONE', required: true, requiresDevice: false, requiredEvidence: ['command-log'] }],
  };
  assert.deepEqual(validateCaseSet(valid), []);

  const errors = validateCaseSet({ ...valid, cases: [valid.cases[0], valid.cases[0]] });
  assert.ok(errors.includes('duplicate case id: V01-ONE'));
});

test('PASS requires identity timestamps and evidence while NOT_RUN may remain empty', () => {
  const validPass = {
    schemaVersion: 1,
    runId: '20261030-b02',
    results: [{
      caseId: 'V01-ONE', attemptId: 'attempt-1', runId: '20261030-b02',
      caseSetSha256: hash, candidateSha256: hash, status: 'PASS',
      startedAt: '2026-10-30T00:00:00.000Z', endedAt: '2026-10-30T00:00:01.000Z',
      timedOut: false, interrupted: false,
      evidence: [{ type: 'command-log', path: 'commands/one.log', sha256: hash }],
    }],
  };
  assert.deepEqual(validateResults(validPass), []);

  const invalidPass = structuredClone(validPass);
  invalidPass.results[0].evidence = [];
  assert.ok(validateResults(invalidPass).includes('results[0].evidence must be non-empty for PASS'));

  const notRun = structuredClone(validPass);
  Object.assign(notRun.results[0], { status: 'NOT_RUN', startedAt: null, endedAt: null, evidence: [] });
  assert.deepEqual(validateResults(notRun), []);
});

const ids = ['M4-A03-splash', 'M4-A03-system-ui', 'M4-A03-status-bar',
  'M4-A04-linking-router', 'M4-A05-browser', 'M4-A07-package-sync'];
const jsonSchema = JSON.parse(fs.readFileSync(new URL('../ai-e2e/schemas/run-manifest.schema.json', import.meta.url)));
function otherManifest() {
  const row = { bundle: 'dev.example.fixture', pid: 123, mode: 'release', bootIds: [1, 2],
    captureCwd: '/capture', hap: { path: 'fixture.hap', sha256: hash },
    capture: { path: 'captures/fixture.JSON', sha256: hash } };
  return { schemaVersion: 1, runId: 'multi', stage: 'V-02',
    source: { revision: '1'.repeat(40), dirty: false },
    caseSet: { path: 'cases.json', sha256: hash }, candidate: { path: 'candidate.json', sha256: hash },
    repositoryRoot: '/repo', consumerRoot: '/consumer', tools: { node: '/node', npm: '/npm', pnpm: '/pnpm' },
    device: { target: 'device-1', platformVersion: '6.0.0' },
    m4: { other: { caseCaptures: Object.fromEntries(ids.map(id => [id, structuredClone(row)])) } } };
}

test('accepts exactly six Other case capture references, including package-sync', () => {
  const value = otherManifest();
  assert.deepEqual(validateRunManifest(value), []);
  for (const id of ids) {
    const missing = structuredClone(value);
    delete missing.m4.other.caseCaptures[id];
    assert.ok(validateRunManifest(missing).some(e => e.includes('caseCaptures')), id);
  }
  value.m4.other.caseCaptures.extra = value.m4.other.caseCaptures[ids[0]];
  assert.ok(validateRunManifest(value).some(e => e.includes('caseCaptures')));
});

test('requires capture references rather than old inline commands and requires device identity', () => {
  const value = otherManifest();
  delete value.m4.other.caseCaptures[ids[0]].capture;
  assert.ok(validateRunManifest(value).some(e => e.includes('.capture')));
  const noDevice = otherManifest();
  delete noDevice.device;
  assert.ok(validateRunManifest(noDevice).some(e => e.includes('device')));
  const legacy = otherManifest();
  legacy.m4.other.captures = legacy.m4.other.caseCaptures;
  delete legacy.m4.other.caseCaptures;
  assert.ok(validateRunManifest(legacy).some(e => e.includes('captures')));
});

test('runtime and JSON schema reject unsafe relative references and relative capture directories', () => {
  const reference = jsonSchema.$defs.reference.properties.path;
  for (const name of ['capture.json', 'captures/raw.JSON', 'nested/raw-capture']) {
    assert.ok(new RegExp(reference.pattern).test(name), name);
    const value = otherManifest();
    value.m4.other.caseCaptures[ids[0]].capture.path = name;
    assert.deepEqual(validateRunManifest(value), []);
  }
  for (const name of ['/absolute', '../escape', 'a/../escape', './capture', 'a//capture',
    'a/./capture', 'a\\capture', 'capture/', '', 'capture\0']) {
    const value = otherManifest();
    value.m4.other.caseCaptures[ids[0]].capture.path = name;
    assert.ok(validateRunManifest(value).some(e => e.includes('.capture.path')), JSON.stringify(name));
    assert.equal(new RegExp(reference.pattern).test(name), false, JSON.stringify(name));
  }
  const cwd = jsonSchema.$defs.otherCapture.properties.captureCwd;
  for (const invalid of ['relative', '', 42, {}, []]) {
    const value = otherManifest();
    value.m4.other.caseCaptures[ids[0]].captureCwd = invalid;
    assert.ok(validateRunManifest(value).some(e => e.includes('identity')));
  }
  assert.equal(cwd.type, 'string');
  assert.equal(new RegExp(cwd.pattern).test('relative'), false);
  assert.equal(new RegExp(cwd.pattern).test('/capture'), true);
});

test('runtime reports invalid source, tools and device field types without throwing', () => {
  for (const [group, field, invalid] of [
    ['source', 'revision', 123], ['source', 'dirty', 'false'],
    ['tools', 'node', 123], ['tools', 'npm', {}], ['tools', 'pnpm', []],
    ['device', 'target', 123], ['device', 'platformVersion', {}],
  ]) {
    const value = otherManifest();
    value[group][field] = invalid;
    assert.ok(validateRunManifest(value).length, `${group}.${field}`);
    assert.ok(jsonSchema.properties[group].properties?.[field]?.type, `${group}.${field} JSON type`);
  }
  for (const group of ['source', 'tools', 'device']) {
    for (const invalid of [null, [], 42]) {
      const value = otherManifest();
      value[group] = invalid;
      assert.ok(validateRunManifest(value).length, group);
    }
  }
});

for (const container of ['m4', 'other']) {
  test(`rejects present non-object ${container} while accepting optional absence`, () => {
    for (const invalid of [null, [], 42, 'invalid', false]) {
      const value = otherManifest();
      if (container === 'm4') value.m4 = invalid;
      else value.m4.other = invalid;
      const label = container === 'm4' ? 'm4' : 'm4.other';
      assert.ok(validateRunManifest(value).includes(`${label} must be an object`), JSON.stringify(invalid));
    }
    const absent = otherManifest();
    if (container === 'm4') delete absent.m4;
    else delete absent.m4.other;
    assert.deepEqual(validateRunManifest(absent), []);
    const empty = otherManifest();
    if (container === 'm4') empty.m4 = {};
    else empty.m4.other = {};
    assert.deepEqual(validateRunManifest(empty), []);
  });
}

test('bootIds preserve app marker string or integer identities in runtime and JSON schema', () => {
  for (const invalid of [[''], ['uuid\0suffix'], [0], [-1], [1.5], [Number.MAX_SAFE_INTEGER + 1],
    [], [1, 1], ['uuid', 'uuid'], [null], [true], '1', null]) {
    const value = otherManifest();
    value.m4.other.caseCaptures[ids[0]].bootIds = invalid;
    assert.ok(validateRunManifest(value).some(error => error.includes('identity')), JSON.stringify(invalid));
  }
  const valid = otherManifest();
  for (const bootIds of [[1, Number.MAX_SAFE_INTEGER], ['550e8400-e29b-41d4-a716-446655440000'], [1, '1']]) {
    valid.m4.other.caseCaptures['M4-A04-linking-router'].bootIds = bootIds;
    assert.deepEqual(validateRunManifest(valid), [], JSON.stringify(bootIds));
  }
  assert.deepEqual(jsonSchema.$defs.otherCapture.properties.bootIds, {
    type: 'array', minItems: 1, uniqueItems: true,
    items: { anyOf: [
      { type: 'string', minLength: 1, pattern: '^[^\\u0000]+$' },
      { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    ] },
  });
});
