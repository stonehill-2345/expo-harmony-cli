import assert from 'node:assert/strict';
import test from 'node:test';
import * as recipes from '../m0-build-recipes.mjs';

const taskfile = `
export async function bin(task, opts) {
  await task.source(opts.src || 'bin/*').swc('cli', { stripExtension: true, dev: opts.dev }).target('build/bin', { mode: '0755' });
}
export async function build(task, opts) { await task.parallel(['cli', 'bin', 'metroRequire'], opts); }
export default async function(task) {
  const opts = { dev: true };
  await task.clear('build');
  await task.start('build', opts);
}
export async function release(task) { await task.clear('build').start('build'); }
`;
const plugin = String.raw`
const path = require('path');
module.exports = function(task) {
  task.plugin('swc', {}, function* (file, environment, { stripExtension } = {}) {
    if (file.base.endsWith('.d.ts')) return;
    const ext = path.extname(file.base);
    if (ext) {
      const extRegex = new RegExp(ext.replace('.', '\\.') + '$', 'i');
      file.base = file.base.replace(extRegex, stripExtension ? '' : '.js');
    }
  });
};
`;

function fixture({ task = taskfile, swc = plugin, script = 'taskr', prepare = 'taskr release', name = 'arbitrary-package' } = {}) {
  const root = 'packages/tool';
  const pkg = { id: 'PKG:' + name, name, sourcePath: root + '/package.json' };
  const manifest = { name, main: 'build/bin/cli', bin: { cli: 'build/bin/cli' }, scripts: { build: script, prepare }, taskr: { requires: './taskfile-swc.js' } };
  const files = new Map([
    [pkg.sourcePath, JSON.stringify(manifest)],
    [root + '/taskfile.js', task], [root + '/taskfile-swc.js', swc],
    [root + '/bin/cli.ts', 'export {};'], [root + '/bin/another.ts', 'export {};'],
    [root + '/bin/types.d.ts', 'declare const x: string;'], [root + '/bin/sub/hidden.ts', 'export {};'],
    [root + '/src/cli.ts', 'export {};'],
  ]);
  const treeEntries = [...files].map(([path]) => ({ path, type: 'blob', mode: '100644' }));
  return { packages: [pkg], treeEntries, files };
}
const extract = options => recipes.extractTaskrBuildRecipes(options);

test('extracts extensionless taskr outputs only from the evidenced bin glob', () => {
  const result = extract(fixture());
  assert.deepEqual(result.boundaries, []);
  assert.deepEqual(result.mappings.map(row => [row.sourcePath, row.outputPath]), [
    ['packages/tool/bin/another.ts', 'packages/tool/build/bin/another'],
    ['packages/tool/bin/cli.ts', 'packages/tool/build/bin/cli'],
  ]);
  assert.equal(result.mappings[0].recipe, 'taskr-swc-bin');
  assert.equal(result.mappings[0].buildAcceptance, 'NOT_VERIFIED');
  assert.equal(result.mappings[0].runtimeAcceptance, 'NOT_VERIFIED');
  assert.equal(result.mappings[0].sources.length, 4);
  assert(result.mappings[0].sources.every(row => /^[a-f\d]{64}$/.test(row.sha256)));
});

test('does not depend on a package name', () => {
  assert.equal(extract(fixture({ name: '@other/tool' })).mappings.length, 2);
});

test('accepts the fixed manifest single-plugin array and rejects additional plugins', () => {
  const input = fixture();
  const manifest = JSON.parse(input.files.get('packages/tool/package.json'));
  manifest.taskr.requires = ['./taskfile-swc.js'];
  input.files.set('packages/tool/package.json', JSON.stringify(manifest));
  assert.equal(extract(input).mappings.length, 2);
  manifest.taskr.requires.push('./unknown-plugin.js');
  input.files.set('packages/tool/package.json', JSON.stringify(manifest));
  assert.equal(extract(input).mappings.length, 0);
});

for (const [name, change] of [
  ['missing release path', value => ({ ...value, prepare: 'echo release' })],
  ['shell-composed build', value => ({ ...value, script: 'taskr && echo done' })],
  ['bin absent from parallel build', value => ({ ...value, task: taskfile.replace("'cli', 'bin', 'metroRequire'", "'cli', 'metroRequire'") })],
  ['unproven source override', value => ({ ...value, task: taskfile.replace('{ dev: true }', "{ dev: true, src: 'other/*' }") })],
  ['stripExtension false', value => ({ ...value, task: taskfile.replace('stripExtension: true', 'stripExtension: false') })],
  ['different target', value => ({ ...value, task: taskfile.replace(".target('build/bin'", ".target('generated/bin'") })],
  ['plugin not deleting extension', value => ({ ...value, swc: plugin.replace("stripExtension ? '' : '.js'", "stripExtension ? '.js' : ''") })],
  ['extra plugin filename mutation', value => ({ ...value, swc: plugin.replace('const ext =', "file.base = 'elsewhere'; const ext =") })],
  ['plugin path helper mutation', value => ({ ...value, swc: plugin.replace('module.exports =', "path.extname = () => '.js'; module.exports =") })],
  ['unknown plugin initialization', value => ({ ...value, swc: plugin.replace("  task.plugin", "  mutateFilenameHelper(); task.plugin") })],
  ['broken extension regular expression', value => ({ ...value, swc: plugin.replace("+ '$'", "+ '^'") })],
  ['unreachable release build', value => ({ ...value, task: taskfile.replace(".start('build');", ".start('other');") })],
]) {
  test('keeps boundary for ' + name, () => {
    const result = extract(fixture(change({})));
    assert.equal(result.mappings.length, 0);
    assert(result.boundaries.some(row => row.kind === 'taskr-build-recipe-unverified'));
  });
}

test('missing fixed plugin bytes and unsafe tree sources cannot become mappings', () => {
  const input = fixture();
  input.files.delete('packages/tool/taskfile-swc.js');
  assert.equal(extract(input).mappings.length, 0);
  const other = fixture();
  other.treeEntries.find(row => row.path === 'packages/tool/bin/cli.ts').mode = '120000';
  assert.deepEqual(extract(other).mappings.map(row => row.sourcePath), ['packages/tool/bin/another.ts']);
});

test('does not read or execute source text as JavaScript', () => {
  const input = fixture({ task: taskfile + '\nglobalThis.__sdk54RecipeExecuted = true;' });
  extract(input);
  assert.equal(globalThis.__sdk54RecipeExecuted, undefined);
});

test('does not guess dotfile glob coverage or overwrite colliding stripped outputs', () => {
  const input = fixture();
  for (const file of ['packages/tool/bin/.hidden.ts', 'packages/tool/bin/cli.js']) {
    input.files.set(file, 'export {};');
    input.treeEntries.push({ path: file, type: 'blob', mode: '100644' });
  }
  assert.deepEqual(extract(input).mappings.map(row => row.sourcePath), ['packages/tool/bin/another.ts']);
  assert(extract(input).boundaries.some(row => row.kind === 'taskr-output-collision'));
});
