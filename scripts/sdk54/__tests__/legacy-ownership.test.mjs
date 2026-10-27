import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createOwnershipInventory, discoverOwnershipFiles, indexModuleReferences, validateOwnershipInventory } from '../legacy-ownership.mjs';

test('OWN-01/07 edge: discover new scoped files, reject symlinks, exclude generated outputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-ownership-'));
  try {
    execFileSync('git', ['init', '--quiet', root]);
    const write = (file) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), 'fixture'); };
    for (const file of ['apps/cli/src/a.ts', 'apps/cli/dist/a.js', 'apps/cli/README.md', 'packages/elsewhere/a.ts']) write(file);
    assert.deepEqual(discoverOwnershipFiles(root), ['apps/cli/src/a.ts']);
    write('scripts/sdk54/new.mjs');
    assert.deepEqual(discoverOwnershipFiles(root), ['apps/cli/src/a.ts', 'scripts/sdk54/new.mjs']);
    fs.symlinkSync('a.ts', path.join(root, 'apps/cli/src/link.ts'));
    assert.throws(() => discoverOwnershipFiles(root), /regular file/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('OWN-02: AST separates runtime/type/literal/dynamic references without treating comments as calls', () => {
  const files = new Map([
    ['apps/cli/src/index.ts', `// require('./not-real')\nimport { shared } from './shared';\nexport type { Shape } from './types';\nconst lazy = import('./lazy.js');\nconst other = require(path.join(base, 'dynamic.js'));\n`],
    ['apps/cli/src/shared.ts', 'export const shared = 1;'],
    ['apps/cli/src/types.ts', 'export type Shape = {};'],
    ['apps/cli/src/lazy.ts', 'export default 1;'],
  ]);
  const refs = indexModuleReferences(files);
  assert.equal(refs.length, 4);
  assert.equal(refs.find((entry) => entry.request === './shared').target, 'apps/cli/src/shared.ts');
  assert.equal(refs.find((entry) => entry.request === './types').typeOnly, true);
  assert.equal(refs.find((entry) => entry.request === './lazy.js').resolution, 'source-projection');
  const dynamic = refs.find((entry) => entry.kind === 'require' && entry.request === null);
  assert.equal(dynamic.resolution, 'UNRESOLVED_DYNAMIC');
  assert.match(dynamic.expression, /path.join/);
});

test('OWN-01 edge: deleted tracked files leave the current graph while missing imports remain errors', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-ownership-deleted-'));
  try {
    execFileSync('git', ['init', '--quiet', root]);
    const file = path.join(root, 'apps/cli/src/removed.ts');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'export const removed = true;');
    execFileSync('git', ['add', 'apps/cli/src/removed.ts'], { cwd: root });
    fs.unlinkSync(file);
    assert.deepEqual(discoverOwnershipFiles(root), []);
    const references = indexModuleReferences(new Map([['apps/cli/src/caller.ts', "import './removed';"]]), root);
    assert.equal(references[0].resolution, 'MISSING_RELATIVE');
  } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
});

test('OWN-01/03/04/05/06: current file decisions preserve SDK52 and record release transfer dependencies', () => {
  const inventory = createOwnershipInventory();
  const find = (file) => inventory.files.find((entry) => entry.path === file);
  for (const file of ['apps/cli/src/sdk54/npm-spec.ts', 'apps/cli/src/sdk54/create-options.ts',
    'apps/cli/src/scanner/compat-patch.ts', 'apps/cli/src/lifecycle/managed-state.ts']) {
    assert.equal(find(file).decision.category, 'KEEP_SDK52', file);
  }
  assert.ok(find('apps/cli/src/sdk54/npm-spec.ts').incoming.some((entry) => entry.source === 'apps/cli/src/version-matrix.ts'));
  for (const name of ['create', 'create-release', 'template-contract', 'default-image-substitution']) {
    assert.equal(find(`apps/cli/src/sdk54/${name}.ts`), undefined, `M0A-04 removed ${name}`);
  }
  assert.equal(find('scripts/sdk54/generate-external-screens-patch.mjs').decision.category, 'TRANSFER_SDK54');
  assert.ok(find('scripts/sdk54/generate-external-screens-patch.mjs').incoming.some((entry) => entry.source === 'scripts/sdk54/prepare-npm-release.mjs'));
  assert.ok(find('apps/cli/src/sdk54/release-runtime.ts').incoming.some((entry) => entry.source === 'scripts/sdk54/test-release-install.mjs' && entry.kind === 'reviewed-generated-projection'));
  for (const file of inventory.files) {
    assert.equal(file.readyToDelete, false);
    assert.ok(file.regressions.length, file.path);
    assert.ok(file.decision.target.path, file.path);
    assert.ok(file.decision.sdk52Impact, file.path);
  }
  assert.ok(inventory.files.some((entry) => entry.path.startsWith('apps/cli/content/patches/sdk-52/') && entry.decision.category === 'KEEP_SDK52'));
  assert.ok(inventory.references.some((entry) => entry.kind === 'package-files-source-projection'));
  assert.ok(inventory.references.some((entry) => entry.kind === 'command-glob-text' && entry.target.endsWith('/legacy-ownership.test.mjs')));
  assert.equal(inventory.buildInputs.compilerOptions.outDir, 'dist');
  assert.ok(inventory.commands.some((entry) => entry.source === '.github/workflows/ci.yml' && entry.command === 'pnpm check'));
  assert.equal(inventory.cleanupExecuted, false);
  for (const entry of inventory.references.filter((value) => value.resolution === 'UNRESOLVED_DYNAMIC')) assert.ok(entry.review?.conclusion, entry.expression);
});

test('OWN-02 edge: named type exports and import types remain type dependencies', () => {
  const files = new Map([
    ['apps/cli/src/index.ts', "export { type Shape } from './types';\ntype T = import('./types').Shape;\n"],
    ['apps/cli/src/types.ts', 'export type Shape = {};'],
  ]);
  const refs = indexModuleReferences(files);
  assert.equal(refs.length, 2);
  assert.ok(refs.every((entry) => entry.typeOnly && entry.target === 'apps/cli/src/types.ts'));
});

test('OWN-07: deterministic inventory rejects omitted, duplicate, changed and falsely deletable records', () => {
  const expected = createOwnershipInventory();
  assert.deepEqual(createOwnershipInventory(), expected);
  assert.equal(validateOwnershipInventory(expected, expected).valid, true);
  const corruptions = [
    (copy) => copy.files.pop(),
    (copy) => copy.files.push(copy.files[0]),
    (copy) => copy.files.push({ ...copy.files[0], id: 'FILE:invented', path: 'invented' }),
    (copy) => { copy.files[0].sha256 = '0'.repeat(64); },
    (copy) => { copy.files[0].regressions = []; },
    (copy) => { copy.files[0].decision.target = null; },
    (copy) => { copy.files[0].decision.category = 'REMOVE_SDK54'; },
    (copy) => { copy.files[0].readyToDelete = true; },
    (copy) => { copy.references.pop(); },
  ];
  for (const corrupt of corruptions) {
    const copy = structuredClone(expected);
    corrupt(copy);
    assert.equal(validateOwnershipInventory(copy, expected).valid, false);
  }
});
