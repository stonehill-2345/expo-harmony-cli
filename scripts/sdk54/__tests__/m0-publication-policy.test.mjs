import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import test from 'node:test';
import { projectPublicationFiles } from '../m0-publication-policy.mjs';

function fixture(manifest = {}, names = [], policies = {}) {
  const root = 'packages/demo';
  const files = new Map([[`${root}/package.json`, JSON.stringify({ name: 'demo', version: '1.0.0', ...manifest })], ...Object.entries(policies).map(([name, text]) => [`${root}/${name}`, text])]);
  const paths = [...new Set([...files.keys(), ...names.map(name => `${root}/${name}`)])];
  return { packages: [{ id: 'PKG:demo', name: 'demo', sourcePath: `${root}/package.json` }], treeEntries: paths.map(path => ({ path, mode: '100644', type: 'blob' })), files };
}

async function project(input) {
  assert.equal(typeof projectPublicationFiles, 'function', 'publication projection must be implemented');
  return projectPublicationFiles(input);
}

const relativeFiles = row => row.files.map(file => file.replace(/^packages\/demo\//, ''));

test('applies npm files and required main, bin, readme and license rules to fixed tree filenames', async () => {
  const input = fixture({ files: ['dist'], main: 'main.js', bin: { demo: 'cli.js' } }, ['dist/index.js', 'main.js', 'cli.js', 'README.md', 'LICENSE', 'src/raw.ts', 'node_modules/x/index.js', 'package-lock.json']);
  const [row] = await project(input);
  assert.deepEqual(relativeFiles(row), ['LICENSE', 'README.md', 'cli.js', 'dist/index.js', 'main.js', 'package.json']);
  assert.equal(row.packageId, 'PKG:demo');
  assert.equal(row.acceptance, 'SOURCE_TREE_PROJECTION_ONLY');
  assert.deepEqual(row.boundaries, []);
});

test('does not invent absent build outputs or execute lifecycle scripts', async () => {
  const input = fixture({ files: ['build'], main: 'build/index.js', scripts: { prepare: 'exit 99' } }, ['src/index.ts']);
  const [row] = await project(input);
  assert.deepEqual(relativeFiles(row), ['package.json']);
});

test('honors npmignore precedence over gitignore and nested ignore negation', async () => {
  const input = fixture({}, ['kept.js', 'git-only.js', 'drop.js', 'nested/keep.js', 'nested/drop.js'], { '.npmignore': 'drop.js\n', '.gitignore': 'git-only.js\n', 'nested/.npmignore': '*.js\n!keep.js\n' });
  const [row] = await project(input);
  assert.deepEqual(relativeFiles(row), ['git-only.js', 'kept.js', 'nested/keep.js', 'package.json']);
});

test('uses root and nested gitignore fallback when npmignore is absent', async () => {
  const input = fixture({}, ['keep.js', 'root-drop.js', 'nested/keep.js', 'nested/drop.js'], { '.gitignore': 'root-drop.js\n', 'nested/.gitignore': 'drop.js\n' });
  const [row] = await project(input);
  assert.deepEqual(relativeFiles(row), ['keep.js', 'nested/keep.js', 'package.json']);
});

test('files whitelist overrides root ignore while nested ignore still applies', async () => {
  const input = fixture({ files: ['dist'] }, ['dist/keep.js', 'dist/drop.js', 'outside.js'], { '.npmignore': 'dist\n', 'dist/.npmignore': 'drop.js\n' });
  const [row] = await project(input);
  assert.deepEqual(relativeFiles(row), ['dist/keep.js', 'package.json']);
});

test('independent package packing ignores ancestor policies and unrelated tree files', async () => {
  const input = fixture({}, ['keep.js']);
  input.files.set('.gitignore', '**/keep.js\n');
  input.files.set('packages/.npmignore', '**/*.js\n');
  input.treeEntries.push(...['.gitignore', 'packages/.npmignore', 'elsewhere/unrelated.js'].map(path => ({ path, mode: '100644', type: 'blob' })));
  const [row] = await project(input);
  assert.deepEqual(relativeFiles(row), ['keep.js', 'package.json']);
  assert.deepEqual(row.policyInputs.map(input => input.path), ['packages/demo/package.json']);
});

test('excludes symlinks and submodules and explicitly records bundle boundaries', async () => {
  const input = fixture({ bundledDependencies: ['installed-only'] }, ['normal.js', 'linked.js']);
  input.treeEntries.find(entry => entry.path.endsWith('/linked.js')).mode = '120000';
  input.treeEntries.push({ path: 'packages/demo/vendor', type: 'commit', mode: '160000' });
  const [row] = await project(input);
  assert.deepEqual(relativeFiles(row), ['normal.js', 'package.json']);
  assert.ok(row.boundaries.some(boundary => boundary.kind === 'SYMLINK_NOT_FOLLOWED' && boundary.path.endsWith('/linked.js')));
  assert.ok(row.boundaries.some(boundary => boundary.kind === 'NON_BLOB_TREE_ENTRY' && boundary.path.endsWith('/vendor')));
  assert.ok(row.boundaries.some(boundary => boundary.kind === 'BUNDLED_DEPENDENCIES_NOT_PROJECTED'));
});

test('missing ignore text retains a boundary rather than projecting with an empty rule', async () => {
  const input = fixture({}, ['keep.js', '.npmignore']);
  const [row] = await project(input);
  assert.deepEqual(row.files, []);
  assert.ok(row.boundaries.some(boundary => boundary.kind === 'POLICY_TEXT_UNAVAILABLE' && boundary.path === 'packages/demo/.npmignore'));
});

test('missing and invalid manifest contents remain explicit boundaries', async () => {
  const missing = fixture({}, ['keep.js']);
  missing.files.delete('packages/demo/package.json');
  const [missingRow] = await project(missing);
  assert.deepEqual(missingRow.files, []);
  assert.ok(missingRow.boundaries.some(boundary => boundary.kind === 'POLICY_TEXT_UNAVAILABLE'));
  const invalid = fixture();
  invalid.files.set('packages/demo/package.json', '{');
  const [invalidRow] = await project(invalid);
  assert.deepEqual(invalidRow.files, []);
  assert.ok(invalidRow.boundaries.some(boundary => boundary.kind === 'MANIFEST_INVALID'));
});

test('hashes original policy bytes and sorts output independently of input ordering', async () => {
  const input = fixture({}, ['z.js', 'a.js'], { '.npmignore': '# \u6ce8\u91ca\r\nignored.js\r\n', 'nested/.gitignore': '\ufeffdrop.js\n' });
  const [first] = await project(input);
  const [second] = await project({ packages: [...input.packages].reverse(), treeEntries: [...input.treeEntries].reverse(), files: new Map([...input.files].reverse()) });
  assert.deepEqual(first, second);
  assert.deepEqual(first.policyInputs, [...input.files].sort(([a], [b]) => a < b ? -1 : 1).map(([path, text]) => ({ path, sha256: createHash('sha256').update(text).digest('hex') })));
});

test('cleans temporary mirrors after success and after filesystem failure', async context => {
  const directories = [];
  const mkdtemp = fs.mkdtemp;
  context.mock.method(fs, 'mkdtemp', async (...args) => {
    const directory = await mkdtemp(...args);
    directories.push(directory);
    return directory;
  });
  await project(fixture({}, ['a.js']));
  const invalid = fixture({}, ['conflict', 'conflict/child.js']);
  await assert.rejects(project(invalid), /EEXIST|ENOTDIR/);
  assert.equal(directories.length, 2);
  for (const directory of directories) await assert.rejects(fs.stat(directory), { code: 'ENOENT' });
});

test('rejects tree paths that could escape the temporary mirror', async () => {
  const input = fixture();
  input.treeEntries.push({ path: 'packages/demo/../../outside.js', type: 'blob', mode: '100644' });
  await assert.rejects(project(input), /Unsafe.*path/);
});

test('normalizes string bin and boolean bundle aliases without requiring installed dependencies', async () => {
  const input = fixture({ files: [], bin: 'cli.js', bundledDependencies: true, dependencies: { external: '*' } }, ['cli.js', 'src.js']);
  const [row] = await project(input);
  assert.deepEqual(relativeFiles(row), ['cli.js', 'package.json']);
  assert.ok(row.boundaries.some(boundary => boundary.kind === 'BUNDLED_DEPENDENCIES_NOT_PROJECTED'));
});

test('rejects an out-of-tree manifest even when text was supplied', async () => {
  const input = fixture({}, ['source.js']);
  input.treeEntries = input.treeEntries.filter(entry => !entry.path.endsWith('/package.json'));
  const [row] = await project(input);
  assert.deepEqual(row.files, []);
  assert.ok(row.boundaries.some(boundary => boundary.kind === 'MANIFEST_NOT_IN_TREE'));
});

test('records malformed publication policy fields without crashing npm-packlist', async () => {
  const [row] = await project(fixture({ files: [1] }));
  assert.deepEqual(row.files, []);
  assert.ok(row.boundaries.some(boundary => boundary.kind === 'MANIFEST_INVALID'));
});
