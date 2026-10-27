import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { enumeratePublicEntries } from '../m0-public-entries.mjs';

function fixture(manifest = {}, additions = {}, configs = []) {
  const files = new Map(Object.entries({
    'packages/a/package.json': JSON.stringify({ name: 'a', ...manifest }),
    'packages/a/src/index.ts': 'export const value = 1;',
    ...additions,
  }));
  return { files, packages: [{ id: 'PKG:a', name: 'a', sourcePath: 'packages/a/package.json' }],
    treeEntries: [...files.keys()].map(path => ({ path, type: 'blob', mode: '100644' })),
    modules: [...files.keys()].filter(path => /\.[cm]?[jt]sx?$/.test(path)).map(path => ({ id: `MODULE:${path}`, source: { path } })),
    projectContext: { configs } };
}

const project = (extra = {}) => ({ path: 'packages/a/tsconfig.json', errors: [], inputs: [],
  options: { outDir: '/__sdk54_project__/packages/a/build', declaration: true },
  emitRoot: '/__sdk54_project__/packages/a/src/',
  fileNames: ['/__sdk54_project__/packages/a/src/index.ts'], ...extra });
const entry = (result, request, condition) => result.entries.find(row => row.request === request && (condition === undefined || row.condition === condition));

function nodeResolutions(exports, requests, targets, conditions = [], baseDirectory = '') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-pattern-node-'));
  try {
    const workingDirectory = path.join(directory, baseDirectory);
    const packageRoot = path.join(workingDirectory, 'node_modules/a');
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'a', exports }));
    for (const target of targets) {
      const file = path.join(packageRoot, target);
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, '');
    }
    const child = spawnSync(process.execPath, [...conditions.map(value => '--conditions=' + value), '-e',
      'const requests = JSON.parse(process.argv[1]); console.log(JSON.stringify(requests.map(request => { try { return { request, path: require.resolve(request) }; } catch (error) { return { request, code: error.code }; } })));', JSON.stringify(requests)],
    { cwd: workingDirectory, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout).map(row => row.path ? { ...row, path: path.relative(fs.realpathSync(packageRoot), row.path).split(path.sep).join('/') } : row);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('fixed-v1 adds finite coverage and bidirectional children without changing default bytes or family identity', () => {
  const input = fixture({ exports: { './feature/*': './build/*.js' } }, {}, [project()]);
  input.treeEntries.find(row => row.path.endsWith('/index.ts')).oid = 'fixed-source-blob';
  const baseline = JSON.stringify(enumeratePublicEntries(input));
  assert.equal(JSON.stringify(enumeratePublicEntries({ ...input, patternCoverage: false })), baseline);
  const result = enumeratePublicEntries({ ...input, patternCoverage: true });
  assert.deepEqual(result, enumeratePublicEntries({ ...input, patternCoverage: true, files: new Map([...input.files].reverse()),
    treeEntries: [...input.treeEntries].reverse(), modules: [...input.modules].reverse() }));
  const family = entry(result, 'a/feature/*'), child = entry(result, 'a/feature/index');
  assert.equal(family.id, entry(JSON.parse(baseline), 'a/feature/*').id);
  assert.equal(family.target.reason, 'unexpanded-export-pattern');
  assert.deepEqual(family.patternCoverage, { policy: 'fixed-v1', requestDomain: 'FINITE_FIXED_SOURCE_PROJECTION',
    candidates: [{ targetPath: 'packages/a/build/index.js', wildcard: 'index', request: 'a/feature/index', selectedExportKey: './feature/*', disposition: 'INCLUDED',
      projectionCandidates: [{ path: 'packages/a/src/index.ts', config: 'packages/a/tsconfig.json', emitRoot: 'packages/a/src' }] }], childEntryIds: [child.id] });
  assert.deepEqual(child.patternOrigin, { familyEntryId: family.id, wildcard: 'index' });
  assert.equal(result.publicSurfaceComplete, false); assert.equal(result.stageClosable, false);
});

test('fixed-v1 records exact and longest pattern exclusions and retains null disabled domains', () => {
  const exports = { './x/*': './out/*.js', './x/blocked': null, './x/private/*': null, './x/specific*': './other/*.js' };
  const input = fixture({ exports }, Object.fromEntries(['ok', 'blocked', 'private/secret', 'specificThing'].map(name => [`packages/a/out/${name}.js`, ''])));
  const result = enumeratePublicEntries({ ...input, patternCoverage: true });
  const candidates = entry(result, 'a/x/*').patternCoverage.candidates;
  assert.deepEqual(candidates.map(row => [row.wildcard, row.selectedExportKey, row.disposition]), [
    ['blocked', './x/blocked', 'SHADOWED'], ['ok', './x/*', 'INCLUDED'], ['private/secret', './x/private/*', 'SHADOWED'], ['specificThing', './x/specific*', 'SHADOWED'],
  ]);
  const disabled = entry(result, 'a/x/private/*');
  assert.equal(disabled.patternCoverage.requestDomain, 'DISABLED');
  assert.deepEqual(disabled.patternCoverage.childEntryIds, []);
  const actual = nodeResolutions(exports, candidates.map(row => row.request), ['out/ok.js', 'out/blocked.js', 'out/private/secret.js', 'other/Thing.js']);
  assert.deepEqual(actual.map(row => row.path ?? row.code), ['ERR_PACKAGE_PATH_NOT_EXPORTED', 'out/ok.js', 'ERR_PACKAGE_PATH_NOT_EXPORTED', 'other/Thing.js']);
});

test('fixed-v1 rejects empty captures, forbidden segments, URL separators and URL decoded target mismatches against Node', () => {
  const exports = { './x/*': './out/*.js' };
  const names = ['', '.', '..', 'NODE_MODULES/item', '%6eode_modules/item', '%2e', '%2E%2e/item', 'a%2fb', 'a%5cb', 'a\\b', 'a%20b', 'a?query', 'a#fragment', 'valid/nested'];
  const input = fixture({ exports }, Object.fromEntries(names.map(name => [`packages/a/out/${name}.js`, ''])));
  const result = enumeratePublicEntries({ ...input, patternCoverage: true });
  const candidates = entry(result, 'a/x/*').patternCoverage.candidates;
  assert.equal(candidates.length, names.length);
  assert.deepEqual(candidates.filter(row => row.disposition === 'INCLUDED').map(row => row.wildcard), ['valid/nested']);
  assert.ok(candidates.filter(row => row.disposition !== 'INCLUDED').every(row => row.reason));
  assert.equal(entry(result, 'a/x/'), undefined);
  const actual = nodeResolutions(exports, ['a/x/', 'a/x/NODE_MODULES/item', 'a/x/%6eode_modules/item', 'a/x/%2e', 'a/x/%2E%2e/item', 'a/x/a%2fb', 'a/x/a%5cb', 'a/x/a%20b', 'a/x/a?query', 'a/x/a#fragment', 'a/x/valid/nested'], ['out/a%20b.js', 'out/a?query.js', 'out/a#fragment.js', 'out/valid/nested.js']);
  assert.ok(actual.slice(0, -1).every(row => row.code));
  assert.equal(actual.at(-1).path, 'out/valid/nested.js');
});

test('fixed-v1 conditions share discovered requests but retain each branch target, null and family link', () => {
  const exports = { './x/*': { custom: './one/*.js', default: './two/*.js', disabled: null } };
  const input = fixture({ exports }, { 'packages/a/one/a.js': '', 'packages/a/two/b.js': '' });
  const result = enumeratePublicEntries({ ...input, patternCoverage: true });
  for (const condition of ['/custom', '/default', '/disabled']) {
    const family = entry(result, 'a/x/*', condition);
    const children = result.entries.filter(row => row.patternOrigin?.familyEntryId === family.id);
    assert.deepEqual(children.map(row => row.request).sort(), ['a/x/a', 'a/x/b']);
    assert.deepEqual(family.patternCoverage.childEntryIds, children.map(row => row.id).sort());
  }
  assert.equal(entry(result, 'a/x/a', '/disabled').target.status, 'DISABLED');
  assert.equal(entry(result, 'a/x/b', '/custom').target.status, 'BLOCKED');
  assert.deepEqual(nodeResolutions(exports, ['a/x/a', 'a/x/b'], ['one/a.js', 'two/b.js']).map(row => row.path ?? row.code), ['MODULE_NOT_FOUND', 'two/b.js']);
  assert.deepEqual(nodeResolutions(exports, ['a/x/a', 'a/x/b'], ['one/a.js', 'two/b.js'], ['custom']).map(row => row.path ?? row.code), ['one/a.js', 'MODULE_NOT_FOUND']);
});

test('fixed-v1 retains unsafe tree and ambiguous emits, repeated capture equality and infinite constant domains', () => {
  const input = fixture({ exports: { './x/*': './out/*.js', './repeat/*': './repeat/*/same-*.js', './infinite/*': './src/index.ts', './unsafe/*': '../outside/*.js' } }, {
    'packages/a/out/link.js': '', 'packages/a/repeat/a/same-a.js': '', 'packages/a/repeat/a/same-b.js': '', 'packages/outside/escape.js': '',
    'packages/a/extra/index.ts': 'export const extra = 1;',
  }, [project({ options: { outDir: '/__sdk54_project__/packages/a/out' } }), project({ path: 'packages/a/extra/tsconfig.json', options: { outDir: '/__sdk54_project__/packages/a/out' }, emitRoot: '/__sdk54_project__/packages/a/extra', fileNames: ['/__sdk54_project__/packages/a/extra/index.ts'] })]);
  input.treeEntries.find(row => row.path.endsWith('/link.js')).mode = '120000';
  const result = enumeratePublicEntries({ ...input, patternCoverage: true });
  const candidates = entry(result, 'a/x/*').patternCoverage.candidates;
  assert.equal(candidates.find(row => row.wildcard === 'link').disposition, 'UNSAFE_TARGET');
  assert.equal(candidates.find(row => row.wildcard === 'link').source.mode, '120000');
  assert.equal(candidates.find(row => row.wildcard === 'index').disposition, 'BLOCKED_TARGET');
  assert.equal(candidates.find(row => row.wildcard === 'index').projectionCandidates.length, 2);
  assert.equal(entry(result, 'a/x/link').target.reason, 'unsafe-target');
  assert.equal(entry(result, 'a/x/index').target.reason, 'ambiguous-project-emit-mapping');
  assert.deepEqual(entry(result, 'a/repeat/*').patternCoverage.candidates.map(row => row.wildcard), ['a']);
  assert.equal(entry(result, 'a/infinite/*').patternCoverage.requestDomain, 'INFINITE_CONSTANT_TARGET');
  assert.deepEqual(entry(result, 'a/infinite/*').patternCoverage.childEntryIds, []);
  assert.equal(entry(result, 'a/unsafe/*').patternCoverage.candidates[0].disposition, 'UNSAFE_TARGET');
  assert.equal(entry(result, 'a/unsafe/escape'), undefined);
  assert.equal(nodeResolutions({ './repeat/*': './repeat/*/same-*.js' }, ['a/repeat/a'], ['repeat/a/same-a.js'])[0].path, 'repeat/a/same-a.js');
});

test('fixed-v1 resolves URL encoded literal target segments for every branch reached through the condition union', () => {
  const exports = { './x/*': { types: './types%20/*.d.ts', default: './runtime/*.js' } };
  const result = enumeratePublicEntries({ ...fixture({ exports }, { 'packages/a/types%20/a.d.ts': '', 'packages/a/runtime/a.js': '', 'packages/a/types /b.d.ts': '' }), patternCoverage: true });
  assert.equal(entry(result, 'a/x/a', '/types').target.status, 'BLOCKED');
  assert.equal(entry(result, 'a/x/b', '/types').target.path, 'packages/a/types /b.d.ts');
  const family = entry(result, 'a/x/*', '/types');
  assert.deepEqual(family.patternCoverage.candidates.map(row => [row.wildcard, row.disposition]), [['b', 'INCLUDED'], ['a', 'INVALID_REQUEST']]);
  assert.deepEqual(nodeResolutions({ './x/*': './types%20/*.d.ts' }, ['a/x/a', 'a/x/b'], ['types%20/a.d.ts', 'types /b.d.ts']).map(row => row.path ?? row.code), ['MODULE_NOT_FOUND', 'types /b.d.ts']);
});

test('fixed-v1 repeated target captures preserve equality when a repeated star is followed by digits', () => {
  const exports = { './x/*': './repeat/*/same-*1.js' };
  const result = enumeratePublicEntries({ ...fixture({ exports }, { 'packages/a/repeat/a/same-a1.js': '', 'packages/a/repeat/a/same-b1.js': '' }), patternCoverage: true });
  assert.deepEqual(entry(result, 'a/x/*').patternCoverage.candidates.map(row => row.wildcard), ['a']);
  assert.equal(nodeResolutions(exports, ['a/x/a'], ['repeat/a/same-a1.js'])[0].path, 'repeat/a/same-a1.js');
});

test('fixed-v1 exact and constant targets use Node URL paths instead of raw encoded or fragment filenames', () => {
  for (const name of ['a%20b', 'a?query', 'a#fragment']) {
    const exports = { './exact': `./out/${name}.js`, './constant/*': `./out/${name}.js` };
    const result = enumeratePublicEntries({ ...fixture({ exports }, { [`packages/a/out/${name}.js`]: '' }), patternCoverage: true });
    assert.equal(entry(result, 'a/exact').target.status, 'BLOCKED', name);
    assert.equal(entry(result, 'a/constant/*').target.status, 'BLOCKED', name);
    assert.ok(nodeResolutions(exports, ['a/exact', 'a/constant/anything'], [`out/${name}.js`]).every(row => row.code), name);
  }
});

test('fixed-v1 URL decoded literal stars do not become wildcard placeholders', () => {
  const exports = { './x/*': './out/%2a/*.js' };
  const result = enumeratePublicEntries({ ...fixture({ exports }, { 'packages/a/out/*/a.js': '' }), patternCoverage: true });
  assert.deepEqual(entry(result, 'a/x/*').patternCoverage.candidates.map(row => row.wildcard), ['a']);
  assert.equal(entry(result, 'a/x/a').target.path, 'packages/a/out/*/a.js');
  assert.equal(nodeResolutions(exports, ['a/x/a'], ['out/*/a.js'])[0].path, 'out/*/a.js');
});

test('fixed-v1 substitution markers cannot collide with URL decoded static target text', () => {
  const exports = { './x/*': './%5f%5fSDK54_FIXED_CAPTURE%5f%5f/*.js' };
  assert.equal(nodeResolutions(exports, ['a/x/a'], ['__SDK54_FIXED_CAPTURE__/a.js'])[0].path, '__SDK54_FIXED_CAPTURE__/a.js');
  const result = enumeratePublicEntries({ ...fixture({ exports }, { 'packages/a/__SDK54_FIXED_CAPTURE__/a.js': '' }), patternCoverage: true });
  assert.deepEqual(entry(result, 'a/x/*').patternCoverage.candidates.map(row => row.wildcard), ['a']);
  assert.equal(entry(result, 'a/x/a').target.path, 'packages/a/__SDK54_FIXED_CAPTURE__/a.js');
});

test('fixed-v1 preserves filesystem package directories in URL bases and avoids substitution marker collisions', () => {
  const exports = { './x/*': './out/*.js' };
  const directories = ['__SDK54_FIXED_CAPTURE__', '%5f%5fSDK54_FIXED_CAPTURE%5f%5f', '@SDK54_FIXED_CAPTURE!', '%40SDK54_FIXED_CAPTURE%21', 'a%20b', 'a#fragment', 'a?query'];
  const actual = directories.map(name => {
    assert.equal(nodeResolutions(exports, ['a/x/a'], ['out/a.js'], [], name)[0].path, 'out/a.js');
    const directory = 'packages/' + name;
    const input = fixture({ exports }, { 'packages/a/out/a.js': '' });
    const move = file => file.replace(/^packages\/a(?=\/)/, directory);
    input.packages[0].sourcePath = move(input.packages[0].sourcePath);
    input.files = new Map([...input.files].map(([file, value]) => [move(file), value]));
    input.treeEntries = input.treeEntries.map(row => ({ ...row, path: move(row.path) }));
    input.modules = input.modules.map(row => ({ ...row, source: { ...row.source, path: move(row.source.path) } }));
    const result = enumeratePublicEntries({ ...input, patternCoverage: true });
    return { name, wildcards: entry(result, 'a/x/*').patternCoverage.candidates.map(row => row.wildcard), childPath: entry(result, 'a/x/a')?.target.path };
  });
  assert.deepEqual(actual, directories.map(name => ({ name, wildcards: ['a'], childPath: 'packages/' + name + '/out/a.js' })));
});

test('fixed-v1 substitution markers do not create overlapping matches across static and capture boundaries', () => {
  const cases = [
    { target: './__SDK54_FIXED_CAPTURE_*_/a.js', file: '__SDK54_FIXED_CAPTURE_b_/a.js', wildcard: 'b' },
    { target: './@SDK54_FIXED_CAPTURE!/*.js', file: '@SDK54_FIXED_CAPTURE!/a.js', wildcard: 'a' },
    { target: './%40SDK54_FIXED_CAPTURE%21/*.js', file: '@SDK54_FIXED_CAPTURE!/a.js', wildcard: 'a' },
  ];
  const actual = cases.map(({ target, file, wildcard }) => {
    const exports = { './x/*': target };
    assert.equal(nodeResolutions(exports, ['a/x/' + wildcard], [file])[0].path, file);
    const result = enumeratePublicEntries({ ...fixture({ exports }, { ['packages/a/' + file]: '' }), patternCoverage: true });
    return { wildcards: entry(result, 'a/x/*').patternCoverage.candidates.map(row => row.wildcard), childPath: entry(result, 'a/x/' + wildcard)?.target.path };
  });
  assert.deepEqual(actual, cases.map(({ file, wildcard }) => ({ wildcards: [wildcard], childPath: 'packages/a/' + file })));
});

test('types directory entries resolve fixed declarations without giving runtime entries a declaration fallback', () => {
  const input = fixture({ types: 'build', main: 'build' }, { 'packages/a/build/index.d.ts': 'export declare const fixed: true;' });
  const result = enumeratePublicEntries(input);
  assert.equal(entry(result, 'a', '/types').target.path, 'packages/a/build/index.d.ts');
  assert.equal(entry(result, 'a', '/types').target.method, 'fixed-tree');
  assert.equal(entry(result, 'a', '/main').target.status, 'BLOCKED');
  const typesOnly = enumeratePublicEntries(fixture({ typings: 'build' }, {}, [project()]));
  assert.equal(entry(typesOnly, 'a', '/typings').target.path, 'packages/a/src/index.ts');
  const missing = enumeratePublicEntries(fixture({ types: 'build' }, { 'packages/a/build/index.js': 'exports.fixed = true;' }));
  assert.equal(entry(missing, 'a', '/types').target.status, 'BLOCKED');
});

test('fixed directory declarations outrank alternative projected declaration filenames', () => {
  const result = enumeratePublicEntries(fixture({ types: 'build' }, {
    'packages/a/build/index.d.ts': 'export declare const fixed: true;',
    'packages/a/src/build.ts': 'export const projected = true;',
  }, [project({ options: { declarationDir: '/__sdk54_project__/packages/a', declaration: true, emitDeclarationOnly: true },
    fileNames: ['/__sdk54_project__/packages/a/src/build.ts'] })]));
  const target = entry(result, 'a').target;
  assert.equal(target.path, 'packages/a/build/index.d.ts');
  assert.ok(target.projectionCandidates.some(row => row.path === 'packages/a/src/build.ts' && row.requestedPath === 'packages/a/build.d.ts'));
  assert.equal(target.resolutionBoundary, 'projected-declaration-path-precedence-unverified');
});

test('NCC command option tokens cannot masquerade as positional source or output paths', () => {
  for (const [command, extra] of [
    ['ncc build --help.ts -o build/', { 'packages/a/--help.ts': 'export const invalid = true;' }],
    ['ncc build ./src/index.ts -o --help/', {}],
  ]) {
    const result = enumeratePublicEntries(fixture({ main: command.includes('-o --help/') ? '--help/index.js' : 'build/index.js', scripts: { build: command } }, extra));
    assert.equal(entry(result, 'a').target.status, 'BLOCKED');
  }
});

test('static ncc build recipes map only the bundle entry and retain an explicit unbuilt boundary', () => {
  const result = enumeratePublicEntries(fixture({ main: 'build/index.js', scripts: { build: 'ncc build ./src/index.ts -o build/' } }));
  const target = entry(result, 'a').target;
  assert.equal(target.path, 'packages/a/src/index.ts');
  assert.equal(target.method, 'fixed-ncc-entry-recipe');
  assert.equal(target.recipe.source.pointer, '/scripts/build');
  assert.equal(target.recipe.command, 'ncc build ./src/index.ts -o build/');
  assert.equal(target.recipe.bundlingAcceptance, 'NOT_VERIFIED');
  assert.ok(result.boundaries.some(row => row.kind === 'bundle-build-not-verified'));
  for (const command of ['ncc build ./src/index.ts -o build/ && echo changed', 'ncc build $ENTRY -o build/', 'ncc build ../other.ts -o build/', 'ncc build ./src/index.ts -o build/ --unknown']) {
    assert.equal(entry(enumeratePublicEntries(fixture({ main: 'build/index.js', scripts: { build: command } })), 'a').target.status, 'BLOCKED', command);
  }
  const deep = enumeratePublicEntries(fixture({ main: 'build/other.js', scripts: { build: 'ncc build ./src/index.ts -o build/' } }, { 'packages/a/src/other.ts': 'export const other = true;' }));
  assert.equal(entry(deep, 'a').target.status, 'BLOCKED');
  const fixed = enumeratePublicEntries(fixture({ main: 'build/index.js', scripts: { build: 'ncc build ./src/index.ts -o build/' } }, { 'packages/a/build/index.js': 'export const built = true;' }));
  assert.equal(entry(fixed, 'a').target.path, 'packages/a/build/index.js');
  assert.equal(entry(fixed, 'a').target.projectionCandidates[0].path, 'packages/a/src/index.ts');
});

test('verified taskr recipes feed both main and bin with source evidence and an unbuilt boundary', () => {
  const taskfile = `export async function bin(task, opts) { await task.source(opts.src || 'bin/*').swc('cli', { stripExtension: true, dev: opts.dev }).target('build/bin', { mode: '0755' }); }
export async function build(task, opts) { await task.parallel(['cli', 'bin', 'metroRequire'], opts); }
export async function release(task) { await task.clear('build').start('build'); }
export default async function(task) { const opts = { dev: true }; await task.clear('build'); await task.start('build', opts); }`;
  const plugin = String.raw`const path = require('path');
module.exports = function(task) { task.plugin('swc', {}, function* (file, environment, { stripExtension } = {}) {
  if (file.base.endsWith('.d.ts')) return;
  const ext = path.extname(file.base);
  if (ext) { const extRegex = new RegExp(ext.replace('.', '\\.') + '$', 'i'); file.base = file.base.replace(extRegex, stripExtension ? '' : '.js'); }
}); };`;
  const result = enumeratePublicEntries(fixture({ main: 'build/bin/cli', bin: { a: 'build/bin/cli' },
    scripts: { build: 'taskr', prepare: 'taskr release' }, taskr: { requires: ['./taskfile-swc.js'] } }, {
    'packages/a/taskfile.js': taskfile, 'packages/a/taskfile-swc.js': plugin, 'packages/a/bin/cli.ts': 'export const cli = 1;',
  }));
  for (const row of result.entries.filter(row => ['default', 'bin'].includes(row.kind))) {
    assert.equal(row.target.path, 'packages/a/bin/cli.ts');
    assert.equal(row.target.method, 'fixed-taskr-entry-recipe');
    assert.equal(row.target.recipe.sources.length, 4);
    assert.equal(row.target.recipe.buildAcceptance, 'NOT_VERIFIED');
    assert.ok(result.boundaries.some(boundary => boundary.entryId === row.id && boundary.kind === 'taskr-build-not-verified'));
  }
});

test('conditional exports preserve each condition and the actual emit mapping', () => {
  const input = fixture({ exports: { '.': { types: './build/index.d.ts', 'react-server': './src/server.ts', default: './build/index.js' } } },
    { 'packages/a/src/server.ts': 'export const server = true;' }, [project()]);
  const result = enumeratePublicEntries(input);
  assert.equal(entry(result, 'a', '/types').target.moduleId, 'MODULE:packages/a/src/index.ts');
  assert.equal(entry(result, 'a', '/react-server').target.path, 'packages/a/src/server.ts');
  assert.equal(entry(result, 'a', '/default').target.method, 'fixed-project-emit');
  assert.equal(result.publicSurfaceComplete, false);
  assert.ok(result.boundaries.some(row => row.kind === 'publication-scope-unverified'));
});

test('exports encapsulation and a missing root never create an implicit public root', () => {
  const result = enumeratePublicEntries(fixture({ exports: { './uuid': './src/uuid.ts' } }, {
    'packages/a/src/uuid.ts': 'export const uuid = 1;',
    'packages/a/src/secret.ts': 'export const secret = 2;',
  }));
  assert.equal(entry(result, 'a'), undefined);
  assert.equal(entry(result, 'a/uuid').target.path, 'packages/a/src/uuid.ts');
  assert.equal(result.candidateDispositions.find(row => row.source.path.endsWith('/secret.ts')).disposition, 'EXPORTS_ENCAPSULATED');
  assert.ok(result.boundaries.some(row => row.kind === 'exports-root-not-declared'));
});

test('patterns honor exact and most specific null exclusions without leaking test modules', () => {
  const input = fixture({ exports: { './build/*': './build/*.js', './build/*.js': './build/*.js', './build/private/*': null, './build/index': null,
    './build/special': './src/special/index.ts' } }, {
    'packages/a/src/foo.ts': 'export const foo = 1;',
    'packages/a/src/private/secret.ts': 'export const secret = 1;',
    'packages/a/src/__rsc_tests__/bad.ts': 'export const bad = 1;',
    'packages/a/src/special/index.ts': 'export const special = 1;',
  }, [project({ fileNames: ['index.ts', 'foo.ts', 'private/secret.ts', 'special/index.ts'].map(p => '/__sdk54_project__/packages/a/src/' + p) })]);
  const result = enumeratePublicEntries(input);
  assert.equal(entry(result, 'a/build/foo').target.path, 'packages/a/src/foo.ts');
  assert.equal(entry(result, 'a/build/foo.js').exportKey, './build/*.js');
  assert.equal(entry(result, 'a/build/foo.js').target.path, 'packages/a/src/foo.ts');
  assert.equal(entry(result, 'a/build/index').target.status, 'DISABLED');
  assert.equal(entry(result, 'a/build/special').target.path, 'packages/a/src/special/index.ts');
  assert.ok(!result.entries.some(row => row.target.path?.includes('/private/')));
  assert.ok(!result.entries.some(row => row.target.path?.includes('/__rsc_tests__/')));
});

test('fixed wildcard targets are infinite request families instead of invented finite paths', () => {
  const result = enumeratePublicEntries(fixture({ exports: { './runtime/*': './src/runtime/index.ts' } }, {
    'packages/a/src/runtime/index.ts': 'export const runtime = 1;',
  }));
  const family = entry(result, 'a/runtime/*');
  assert.equal(family.kind, 'export-pattern');
  assert.equal(family.target.path, 'packages/a/src/runtime/index.ts');
  assert.equal(family.patternFamily, true);
  assert.ok(result.boundaries.some(row => row.kind === 'infinite-export-pattern-family' && row.entryId === family.id));
});

test('unmapped build paths and declaration-only JS remain explicit boundaries', () => {
  const unmapped = enumeratePublicEntries(fixture({ main: 'build/index.js' }));
  assert.equal(entry(unmapped, 'a').target.status, 'BLOCKED');
  assert.ok(unmapped.boundaries.some(row => row.kind === 'missing-project-emit-mapping'));
  const onlyTypes = enumeratePublicEntries(fixture({ exports: { '.': { types: './build/index.d.ts', default: './build/index.js' } } }, {},
    [project({ options: { outDir: '/__sdk54_project__/packages/a/build', declaration: true, emitDeclarationOnly: true } })]));
  assert.equal(entry(onlyTypes, 'a', '/types').target.path, 'packages/a/src/index.ts');
  assert.equal(entry(onlyTypes, 'a', '/default').target.status, 'BLOCKED');
});

test('nested project outputs map plugins and cli sources without flattening the directories', () => {
  const input = fixture({ main: 'cli/build/index.js' }, {
    'packages/a/cli/src/index.ts': 'export const command = 1;',
    'packages/a/app.plugin.js': "module.exports = require('./plugin/build/withA');",
    'packages/a/plugin/src/withA.ts': 'export default function withA() {}',
  }, [project({ path: 'packages/a/cli/tsconfig.json', emitRoot: '/__sdk54_project__/packages/a/cli/src/',
    options: { outDir: '/__sdk54_project__/packages/a/cli/build', declaration: true }, fileNames: ['/__sdk54_project__/packages/a/cli/src/index.ts'] }),
  project({ path: 'packages/a/plugin/tsconfig.json', emitRoot: '/__sdk54_project__/packages/a/plugin/src/',
    options: { outDir: '/__sdk54_project__/packages/a/plugin/build', declaration: true }, fileNames: ['/__sdk54_project__/packages/a/plugin/src/withA.ts'] })]);
  const result = enumeratePublicEntries(input);
  assert.equal(entry(result, 'a').target.path, 'packages/a/cli/src/index.ts');
  const plugin = result.entries.find(row => row.kind === 'app-plugin');
  assert.equal(plugin.target.path, 'packages/a/plugin/src/withA.ts');
  assert.equal(plugin.target.sourceWrappers[0].path, 'packages/a/app.plugin.js');
  assert.ok(result.boundaries.some(row => row.kind === 'runtime-wrapper-equivalence-unverified' && row.entryId === plugin.id));
});

test('extensionless bins are retained even without semantic modules and do not become fabricated JS modules', () => {
  const result = enumeratePublicEntries(fixture({ bin: { a: 'bin/cli', tools: 'bin/tools' } }, {
    'packages/a/bin/cli': '#!/usr/bin/env node\nconsole.log(1);',
    'packages/a/bin/tools': '#!/bin/sh\nexit 0',
  }));
  const bins = result.entries.filter(row => row.kind === 'bin');
  assert.equal(bins.length, 2);
  assert.equal(bins.find(row => row.request === 'a').target.path, 'packages/a/bin/cli');
  assert.equal(bins.find(row => row.request === 'a').target.moduleId, null);
  assert.ok(result.boundaries.some(row => row.kind === 'target-has-no-semantic-module'));
});

test('source wrappers, legacy and sdk52 modules remain candidates when source publication is unknown', () => {
  const result = enumeratePublicEntries(fixture({ main: 'src/index.ts', files: ['build', '!src'] }, {
    'packages/a/legacy.ts': "export * from './src/legacy';",
    'packages/a/src/legacy/index.ts': 'export const old = 1;',
    'packages/a/src/plugins/sdk52/Compat.ts': 'export const compat = 1;',
    'packages/a/src/__tests__/bad.ts': 'export const bad = 1;',
  }));
  for (const suffix of ['/legacy.ts', '/legacy/index.ts', '/sdk52/Compat.ts']) {
    const candidate = result.candidateDispositions.find(row => row.source.path.endsWith(suffix));
    assert.equal(candidate.disposition, 'IMPLICIT_DEEP_IMPORT_CANDIDATE');
    assert.equal(candidate.publicationAcceptance, 'NOT_VERIFIED');
  }
  assert.equal(result.candidateDispositions.find(row => row.source.path.endsWith('/bad.ts')).disposition, 'TEST_OR_TOOLING_CANDIDATE');
});

test('private applications, templates and internal packages remain represented including test application sources', () => {
  const input = fixture({ main: 'src/index.ts', private: true });
  input.packages.push({ id: 'PKG:test-suite', name: 'test-suite', sourcePath: 'apps/test-suite/package.json' },
    { id: 'TEMPLATE:blank', name: 'blank', sourcePath: 'templates/blank/package.json' });
  for (const [p, text] of [['apps/test-suite/package.json', '{"name":"test-suite","private":true,"main":"index.js"}'],
    ['apps/test-suite/index.js', "require('./tests/case');"], ['apps/test-suite/tests/case.ts', 'export const caseValue=1;'],
    ['templates/blank/package.json', '{"name":"blank","main":"index.ts"}'], ['templates/blank/index.ts', 'export const templateValue=1;']]) {
    input.files.set(p, text); input.treeEntries.push({ path: p, type: 'blob', mode: '100644' });
    if (/\.[jt]s$/.test(p)) input.modules.push({ id: `MODULE:${p}`, source: { path: p } });
  }
  const result = enumeratePublicEntries(input);
  assert.equal(result.packages.length, 3);
  assert.equal(entry(result, 'test-suite').target.path, 'apps/test-suite/index.js');
  assert.equal(entry(result, 'blank').target.path, 'templates/blank/index.ts');
  assert.equal(result.candidateDispositions.find(row => row.source.path.endsWith('/tests/case.ts')).disposition, 'APPLICATION_SOURCE_CANDIDATE');
});

test('unsafe exports, symlink targets, missing manifests and duplicate identities fail closed', () => {
  const input = fixture({ exports: { '.': '../escape.ts', './link': './src/link.ts' } }, { 'packages/a/src/link.ts': 'x' });
  input.treeEntries.find(row => row.path.endsWith('/link.ts')).mode = '120000';
  const result = enumeratePublicEntries(input);
  assert.equal(entry(result, 'a').target.status, 'BLOCKED');
  assert.equal(entry(result, 'a/link').target.status, 'BLOCKED');
  assert.ok(result.boundaries.some(row => row.kind === 'invalid-export-target'));
  const duplicate = fixture(); duplicate.packages.push(duplicate.packages[0]);
  assert.throws(() => enumeratePublicEntries(duplicate), /Duplicate package/);
  const missing = fixture(); missing.files.delete('packages/a/package.json');
  assert.throws(() => enumeratePublicEntries(missing), /Missing.*manifest/);
});

test('entry and disposition IDs are stable across iteration order and source inputs are not mutated', () => {
  const input = fixture({ exports: { '.': './src/index.ts', './again': ['./missing.js', './src/index.ts'] } });
  const before = structuredClone(input), first = enumeratePublicEntries(input);
  const second = enumeratePublicEntries({ ...input, files: new Map([...input.files].reverse()), treeEntries: [...input.treeEntries].reverse(), modules: [...input.modules].reverse() });
  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.equal(new Set(first.entries.map(row => row.id)).size, first.entries.length);
  assert.equal(first.entries.filter(row => row.request === 'a/again').length, 2);
});

test('common-source-directory uses all fixed config inputs instead of replacing build with src', () => {
  const result = enumeratePublicEntries(fixture({ main: 'build/src/index.js' }, {
    'packages/a/bin/tool.ts': 'export const tool = 1;',
  }, [project({ emitRoot: undefined, fileNames: ['/__sdk54_project__/packages/a/src/index.ts', '/__sdk54_project__/packages/a/bin/tool.ts'] })]));
  assert.equal(entry(result, 'a').target.path, 'packages/a/src/index.ts');
  assert.equal(entry(result, 'a').target.emitRoot, 'packages/a');
});

test('config errors and wrapper cycles cannot provide a completed source entry', () => {
  const invalid = enumeratePublicEntries(fixture({ main: 'build/index.js' }, {}, [project({ errors: [{ code: 6053, message: 'missing base' }] })]));
  assert.equal(entry(invalid, 'a').target.status, 'BLOCKED');
  assert.ok(invalid.boundaries.some(row => row.kind === 'project-config-errors'));
  const cycle = enumeratePublicEntries(fixture({ main: 'loop.js' }, {
    'packages/a/loop.js': "module.exports = require('./loop');",
  }));
  assert.equal(entry(cycle, 'a').target.status, 'BLOCKED');
  assert.ok(cycle.boundaries.some(row => row.kind === 'wrapper-cycle'));
});

test('nontrivial CommonJS is retained as a module rather than mistaken for pure forwarding', () => {
  const result = enumeratePublicEntries(fixture({ main: 'forward.js' }, {
    'packages/a/forward.js': "module.exports = require('./src/index'); module.exports.extra = 1;",
  }));
  assert.equal(entry(result, 'a').target.path, 'packages/a/forward.js');
  assert.equal(entry(result, 'a').target.sourceWrappers, undefined);
  assert.ok(result.boundaries.some(row => row.kind === 'commonjs-runtime-semantics-unverified'));
});

test('duplicate semantic IDs and invalid mixed export maps cannot masquerade as valid entries', () => {
  const duplicate = fixture({}, { 'packages/a/src/other.ts': 'export const other = 1;' });
  duplicate.modules[1].id = duplicate.modules[0].id;
  assert.throws(() => enumeratePublicEntries(duplicate), /Duplicate module/);
  const invalid = enumeratePublicEntries(fixture({ exports: { '.': './src/index.ts', default: './src/index.ts' } }));
  assert.ok(invalid.boundaries.some(row => row.kind === 'invalid-export-map'));
  assert.ok(!invalid.entries.some(row => row.request === 'aefault'));
});

test('platform variants retain a selection boundary while application test sources remain candidates', () => {
  const result = enumeratePublicEntries(fixture({ main: 'src/index.ts' }, {
    'packages/a/src/index.native.ts': 'export const native = 1;',
    'packages/a/src/index.web.ts': 'export const web = 1;',
  }));
  const selection = result.boundaries.find(row => row.kind === 'platform-selection-unverified' && row.entryId === entry(result, 'a').id);
  assert.ok(selection);
  assert.deepEqual(selection.details.map(row => row.path), ['packages/a/src/index.native.ts', 'packages/a/src/index.web.ts']);
});

test('explicit test fixtures, resource exports and configured test outputs are retained with source roles', () => {
  const input = fixture({ exports: { './fixtures/*': './build/fixtures/*.js', './example': './src/__tests__/example.ts', './data': './assets/data.json' } }, {
    'packages/a/src/fixtures/example.ts': 'export const example = 1;',
    'packages/a/src/__tests__/example.ts': 'export const testExample = 1;',
    'packages/a/assets/data.json': '{"name":"fixture"}',
  }, [project({ fileNames: ['/__sdk54_project__/packages/a/src/index.ts', '/__sdk54_project__/packages/a/src/fixtures/example.ts'] })]);
  input.packages[0].batch = 'M7.2'; input.packages[0].scope = { state: '本轮必评' };
  const result = enumeratePublicEntries(input);
  assert.equal(entry(result, 'a/fixtures/example').target.path, 'packages/a/src/fixtures/example.ts');
  assert.equal(entry(result, 'a/example').target.path, 'packages/a/src/__tests__/example.ts');
  assert.equal(entry(result, 'a/data').target.path, 'packages/a/assets/data.json');
  assert.equal(entry(result, 'a/data').target.status, 'RESOURCE');
  assert.ok(result.boundaries.some(row => row.kind === 'test-or-tooling-entry-target' && row.entryId === entry(result, 'a/example').id));
  assert.deepEqual(result.packages[0].scope, { state: '本轮必评' });
  assert.equal(result.packages[0].batch, 'M7.2');
});

test('extensionless emitted JSX is mapped while heuristic build-bin substitutions remain blocked', () => {
  const jsx = fixture({ main: 'build/index' }, { 'packages/a/src/Screen.tsx': 'export const Screen = <div />;' },
    [project({ options: { outDir: '/__sdk54_project__/packages/a/build', jsx: 3, declaration: true },
      fileNames: ['/__sdk54_project__/packages/a/src/index.ts', '/__sdk54_project__/packages/a/src/Screen.tsx'] })]);
  const manifest = JSON.parse(jsx.files.get('packages/a/package.json')); manifest.main = 'build/Screen';
  jsx.files.set('packages/a/package.json', JSON.stringify(manifest));
  assert.equal(entry(enumeratePublicEntries(jsx), 'a').target.path, 'packages/a/src/Screen.tsx');
  const heuristic = enumeratePublicEntries(fixture({ bin: { a: 'build/bin/cli' } }, { 'packages/a/bin/cli.ts': 'export const cli = 1;' }));
  assert.equal(heuristic.entries.find(row => row.kind === 'bin').target.status, 'BLOCKED');
  assert.ok(heuristic.boundaries.some(row => row.kind === 'missing-project-emit-mapping'));
});

test('condition insertion and array fallback order survive deterministic entry sorting', () => {
  const result = enumeratePublicEntries(fixture({ exports: { '.': { default: './src/index.ts', types: ['./missing.d.ts', './src/index.ts'], 'react-native': null } } }));
  assert.deepEqual(entry(result, 'a', '/default').conditionOrder, [0]);
  assert.deepEqual(entry(result, 'a', '/types/0').conditionOrder, [1, 0]);
  assert.deepEqual(entry(result, 'a', '/types/1').conditionOrder, [1, 1]);
  assert.equal(entry(result, 'a', '/react-native').target.status, 'DISABLED');
  assert.deepEqual(entry(result, 'a', '/react-native').conditionOrder, [2]);
});

test('tracked build targets take precedence over source projections and retain the conflict', () => {
  const input = fixture({ exports: { '.': './build/index.js' } }, {
    'packages/a/build/index.js': 'export const builtOnly = 1;',
  }, [project()]);
  const result = enumeratePublicEntries(input), exposed = entry(result, 'a');
  assert.equal(exposed.target.path, 'packages/a/build/index.js');
  assert.equal(exposed.target.moduleId, 'MODULE:packages/a/build/index.js');
  assert.equal(exposed.target.method, 'fixed-tree');
  assert.equal(exposed.target.projectionCandidates[0].path, 'packages/a/src/index.ts');
  assert.ok(result.candidateDispositions.find(row => row.moduleId === 'MODULE:packages/a/build/index.js').entryIds.includes(exposed.id));
  assert.ok(result.boundaries.some(row => row.kind === 'source-build-projection-equivalence-unverified' && row.entryId === exposed.id));
});

test('declarationDir governs declaration projections independently of the JavaScript outDir', () => {
  const input = fixture({ exports: { '.': { types: './types/index.d.ts', default: './build/index.js' }, './wrong-types': './build/index.d.ts' } }, {},
    [project({ options: { outDir: '/__sdk54_project__/packages/a/build', declarationDir: '/__sdk54_project__/packages/a/types', declaration: true } })]);
  const result = enumeratePublicEntries(input);
  assert.equal(entry(result, 'a', '/types').target.path, 'packages/a/src/index.ts');
  assert.equal(entry(result, 'a', '/default').target.path, 'packages/a/src/index.ts');
  assert.equal(entry(result, 'a/wrong-types').target.status, 'BLOCKED');
  const onlyDeclarations = fixture({ types: 'types/index.d.ts', main: 'build/index.js' }, {},
    [project({ options: { declarationDir: '/__sdk54_project__/packages/a/types', declaration: true, emitDeclarationOnly: true } })]);
  const declarations = enumeratePublicEntries(onlyDeclarations);
  assert.equal(entry(declarations, 'a', '/types').target.path, 'packages/a/src/index.ts');
  assert.equal(entry(declarations, 'a', '/main').target.status, 'BLOCKED');
});
