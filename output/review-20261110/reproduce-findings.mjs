import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { evaluateA07Entry, buildA07EntryAudit } from '../../scripts/sdk54/a-m7-entry-gate.mjs';
import { readStageProgress } from '../../scripts/sdk54/stage-progress.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');
const sha = data => createHash('sha256').update(data).digest('hex');
const results = [];
const unit = (name, closed) => ({ closed, acceptedUnits: closed ? [name + '-01'] : [],
  pendingUnits: closed ? [] : [name + '-01'], totalUnits: 1, percent: closed ? 100 : 0 });
const a06Contract = JSON.parse(fs.readFileSync(path.join(root, 'docs/releases/2026-11-02-sdk54-a06-expo-image-contract.json')));
const entry = evaluateA07Entry({
  stageProgress: { schemaVersion: 1, stages: {
    M4: unit('M4', false), M5: unit('M5', false), V: unit('V', false), M6: unit('M6', true),
  } }, a06Contract, releaseManifest: {
    release: 'review-fixture', packages: [{ installName: 'expo-image', upstreamVersion: '3.0.11' }],
  },
});
assert.equal(entry.integrationReady, true);
assert.equal(entry.blockers.length, 3);
results.push({ id: 'gate-upstream', actual: entry.decision, blockers: entry.blockers, expected: 'BLOCKED' });

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-review-'));
try {
  const inputs = ['docs/releases/2026-11-02-sdk54-a06-expo-image-contract.json',
    'docs/releases/sdk54-stage-progress-definition.json', 'scripts/sdk54/catalog.mjs',
    'scripts/sdk54/release-catalog.mjs', 'apps/cli/content/patches/sdk-54/manifest.json'];
  for (const file of inputs) {
    fs.mkdirSync(path.dirname(path.join(temporary, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(temporary, file));
  }
  const definitionFile = path.join(temporary, inputs[1]);
  const definition = JSON.parse(fs.readFileSync(definitionFile));
  fs.writeFileSync(path.join(temporary, 'synthetic-evidence.txt'), 'review fixture only\n');
  const evidence = [{ path: 'synthetic-evidence.txt', sha256: sha('review fixture only\n') }];
  const acceptance = { schemaVersion: 1, definitionSha256: sha(fs.readFileSync(definitionFile)),
    units: Object.values(definition.stages).flat().map(id => ({ id, status: 'PASS', evidence })),
    closures: Object.keys(definition.stages).map(stage => ({ stage, status: 'PASS', evidence })),
  };
  fs.writeFileSync(path.join(temporary, 'docs/releases/sdk54-stage-acceptance.json'), JSON.stringify(acceptance));
  const frozen = readStageProgress(temporary);
  frozen.stages.M6.closed = false;
  fs.writeFileSync(path.join(temporary, 'docs/releases/sdk54-stage-progress.json'), JSON.stringify(frozen));
  const audit = buildA07EntryAudit(temporary);
  assert.equal(audit.gate.implementationReady, true);
  assert.ok(!audit.gate.blockers.some(row => row.id === 'STAGE_EVIDENCE_INVALID'));
  results.push({ id: 'gate-frozen-mismatch', actual: audit.gate.decision,
    blockers: audit.gate.blockers, expected: 'BLOCKED with STAGE_EVIDENCE_INVALID',
    fixture: 'Hash-valid synthetic stage receipts; frozen M6.closed=false conflicts with calculated M6.closed=true' });
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }

const source = fs.readFileSync(path.join(root, 'packages/@expo/metro-config/src/withHarmony.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
} }).outputText;
let customCalls = 0;
const consumer = '/Users/zhansh/project/sdk54-ab-a-consumers/20261030-core-v2-npm';
const consumerRequire = createRequire(path.join(consumer, 'package.json'));
const exports = {};
const runRequire = name => name === 'resolve-from' ? consumerRequire(name) : require(name);
runRequire.resolve = require.resolve;
vm.runInNewContext(compiled, { exports, require: runRequire });
const config = exports.withHarmony({ resolver: { platforms: ['ios', 'android'],
  resolveRequest: (_ctx, name) => { customCalls++; return { type: 'sourceFile', filePath: '/custom/' + name + '.js' }; },
}, serializer: {} }, consumer);
const context = { originModulePath: consumer + '/App.tsx', nodeModulesPaths: [consumer + '/node_modules'],
  resolveRequest: (_ctx, name) => ({ type: 'sourceFile', filePath: '/default/' + name + '.js' }),
};
const harmony = config.resolver.resolveRequest(context, 'my-business-alias', 'harmony');
const harmonyCustomCalls = customCalls;
const ios = config.resolver.resolveRequest(context, 'my-business-alias', 'ios');
assert.equal(harmonyCustomCalls, 0);
assert.equal(customCalls, 1);
results.push({ id: 'metro-custom-resolver', harmony, ios, harmonyCustomCalls, expected: 'custom resolver participates on Harmony' });

const transactionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-review-transaction-'));
try {
  const a = path.join(transactionRoot, 'a.json'), b = path.join(transactionRoot, 'b.json');
  fs.writeFileSync(a, 'original-a'); fs.writeFileSync(b, 'original-b');
  let backupRemovals = 0;
  const injectedFs = { ...fs, rmSync(file, options) {
    if (file.endsWith('.bak') && ++backupRemovals === 2) {
      throw Object.assign(new Error('Injected backup cleanup I/O failure'), { code: 'EIO' });
    }
    return fs.rmSync(file, options);
  } };
  const source = fs.readFileSync(path.join(root, 'apps/cli/src/sdk54/file-transaction.ts'), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS } }).outputText;
  const transactionExports = {};
  vm.runInNewContext(output, { exports: transactionExports, process, require: name => {
    if (name === 'node:fs') return injectedFs;
    if (name === '../utils/atomic-rename') return { renameAtomic: fs.renameSync };
    return require(name);
  } });
  assert.throws(() => transactionExports.commitTextFileTransaction([
    { path: a, contents: 'new-a' }, { path: b, contents: 'new-b' },
  ]), /cleanup I\/O failure/);
  assert.equal(fs.existsSync(a), false);
  assert.equal(fs.readFileSync(b, 'utf8'), 'original-b');
  results.push({ id: 'transaction-data-loss', fault: 'I/O failure deleting second backup after first was removed',
    actual: { aExists: fs.existsSync(a), b: fs.readFileSync(b, 'utf8'), remainingFiles: fs.readdirSync(transactionRoot) },
    expected: 'Keep both committed files after commit, or restore both originals before commit; never lose a.json' });
} finally { fs.rmSync(transactionRoot, { recursive: true, force: true }); }
fs.writeFileSync(path.join(import.meta.dirname, 'reproduced-findings.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
