import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const sha256 = (content) => createHash('sha256').update(content).digest('hex');

function verifyEvidence(entry, root) {
  assert.equal(entry.status, 'PASS', `${entry.id ?? entry.stage}: only PASS acceptance counts`);
  assert.ok(Array.isArray(entry.evidence) && entry.evidence.length, 'Missing acceptance evidence');
  const seen = new Set();
  for (const evidence of entry.evidence) {
    assert.ok(typeof evidence.path === 'string' && !path.isAbsolute(evidence.path), 'Evidence must be repository-relative');
    const absolute = path.resolve(root, evidence.path);
    assert.ok(absolute.startsWith(`${path.resolve(root)}${path.sep}`), 'Evidence outside repository');
    assert.ok(!seen.has(evidence.path), 'Duplicate evidence');
    seen.add(evidence.path);
    assert.equal(sha256(fs.readFileSync(absolute)), evidence.sha256, `Evidence hash mismatch: ${evidence.path}`);
  }
}

export function calculateStageProgress(definition, acceptance, root = repository) {
  assert.equal(definition.schemaVersion, 1);
  assert.equal(definition.formula, 'floor(100 * acceptedUnits / totalUnits)');
  assert.ok(Array.isArray(acceptance.units) && Array.isArray(acceptance.closures));
  const ids = Object.values(definition.stages).flat();
  assert.equal(new Set(ids).size, ids.length, 'Duplicate definition unit');
  for (const units of Object.values(definition.stages)) assert.ok(units.length, 'Empty stage denominator');
  const accepted = new Set();
  for (const entry of acceptance.units) {
    assert.ok(ids.includes(entry.id), `Unknown unit: ${entry.id}`);
    assert.ok(!accepted.has(entry.id), `Duplicate accepted unit: ${entry.id}`);
    verifyEvidence(entry, root);
    accepted.add(entry.id);
  }
  const closed = new Set();
  for (const entry of acceptance.closures) {
    assert.ok(Object.hasOwn(definition.stages, entry.stage), `Unknown closure stage: ${entry.stage}`);
    assert.ok(!closed.has(entry.stage), 'Duplicate closure stage');
    assert.ok(definition.stages[entry.stage].every((id) => accepted.has(id)), 'Cannot close incomplete stage');
    verifyEvidence(entry, root);
    closed.add(entry.stage);
  }
  return Object.fromEntries(Object.entries(definition.stages).map(([stage, units]) => {
    const complete = units.filter((id) => accepted.has(id));
    return [stage, { closed: closed.has(stage), acceptedUnits: complete, pendingUnits: units.filter((id) => !accepted.has(id)),
      totalUnits: units.length, percent: Math.floor(100 * complete.length / units.length) }];
  }));
}

export function readStageProgress(root = repository) {
  const definitionFile = path.join(root, 'docs/releases/sdk54-stage-progress-definition.json');
  const acceptance = JSON.parse(fs.readFileSync(path.join(root, 'docs/releases/sdk54-stage-acceptance.json'), 'utf8'));
  assert.equal(acceptance.definitionSha256, sha256(fs.readFileSync(definitionFile)), 'Progress definition hash mismatch');
  return { schemaVersion: 1, definitionSha256: acceptance.definitionSha256,
    stages: calculateStageProgress(JSON.parse(fs.readFileSync(definitionFile, 'utf8')), acceptance, root) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || !['--output', '--check'].includes(args[0])) throw new Error('Usage: --output|--check <json>');
  const result = readStageProgress();
  if (args[0] === '--check') {
    assert.deepEqual(JSON.parse(fs.readFileSync(args[1], 'utf8')), result, 'Stage progress differs');
    console.log('PASS: frozen stage progress and acceptance evidence hashes match');
  } else fs.writeFileSync(args[1], `${JSON.stringify(result, null, 2)}\n`);
}
