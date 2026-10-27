import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runDependencyBaseline } from './reproduce-dependency-baseline.mjs';
import { verifyTestEntryMatrix } from './test-entry-matrix.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evidenceDirectory = 'outputs/sdk54/ai-e2e/20261022-m0-validation-baseline';
const hash = (content) => createHash('sha256').update(content).digest('hex');
const read = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file));

export async function verifyValidationBaseline() {
  verifyTestEntryMatrix(json('docs/releases/sdk54-workspace-test-matrix.json'));
  assert.deepEqual(json(`${evidenceDirectory}/dependency-baseline.json`), await runDependencyBaseline(), 'Dependency baseline differs from current source');
  const definitionFile = 'docs/releases/sdk54-test-execution-definition.json';
  const definition = json(definitionFile);
  const summary = json('docs/releases/sdk54-m0-test-execution-results.json');
  assert.equal(summary.definitionSha256, hash(read(definitionFile)));
  assert.deepEqual(summary.results.map((entry) => entry.id).sort(), definition.entries.map((entry) => entry.id).sort(), 'Missing/duplicate execution result');
  for (const result of summary.results) {
    assert.ok(result.run.startsWith(`${evidenceDirectory}/`) && !result.run.includes('..'), 'Invalid execution evidence path');
    assert.equal(hash(read(result.run)), result.runSha256, 'Execution record hash mismatch');
    const run = json(result.run);
    const actual = run.results.find((entry) => entry.id === result.id);
    assert.ok(actual, `Missing raw result: ${result.id}`);
    assert.equal(result.status, actual.status);
    const expected = definition.entries.find((entry) => entry.id === result.id);
    assert.deepEqual(actual.command, expected.command, 'Command differs from execution definition');
    assert.equal(actual.cwd, expected.cwd);
    if (actual.status === 'NOT_RUN') assert.equal(expected.execute, false);
    else {
      assert.equal(actual.execute, true);
      assert.equal(result.status, actual.exitCode === 0 && !actual.error ? 'PASS' : 'FAIL');
      assert.ok(actual.log === `${result.id}.log`);
      assert.equal(hash(read(path.posix.join(path.posix.dirname(result.run), actual.log))), actual.logSha256, 'Execution log hash mismatch');
    }
    if (actual.status !== 'PASS') assert.ok(result.reason, 'Missing failure/NOT_RUN explanation');
  }
  const readme = read('packages/expo-modules-core/harmony/README.md').toString();
  assert.ok(!readme.includes('docs/harmony-sdk54/team/progress-a.md'));
  assert.ok(!readme.includes('expo-harmony-template'));
  for (const match of readme.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^https?:/.test(match[1])) continue;
    const target = path.resolve(root, 'packages/expo-modules-core/harmony', match[1].split('#')[0]);
    assert.ok(fs.existsSync(target), `Missing Core README target: ${match[1]}`);
  }
  return { status: 'PASS', productFixed: false, stageClosable: false,
    executionCounts: Object.fromEntries(['PASS', 'FAIL', 'NOT_RUN'].map((status) => [status, summary.results.filter((entry) => entry.status === status).length])) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await verifyValidationBaseline(), null, 2));
}
