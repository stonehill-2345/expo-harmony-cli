import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as api from '../m0-public-surface.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const file = 'packages/demo/index.ts';
  const text = "import type { Value } from 'external';\nexport interface Public { readonly value?: Value; next: Public; }\n";
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const declaration = node => ({ path: file, origin: 'fixed-source', start: node.getStart(source), end: node.end, kind: ts.SyntaxKind[node.kind] });
  const iface = source.statements[1], field = iface.members[0];
  const base = { arguments: [], constituents: [], properties: [], calls: [], constructs: [], indexes: [], boundaries: [], declarations: [] };
  const graph = {
    schemaVersion: 1, source: { revision: 'fixed-revision', tree: 'fixed-tree' }, compilerVersion: ts.version,
    inputs: [{ path: file, sha256: hash(text) }], externalContext: { files: [], resolutions: [] },
    packages: [{ id: 'PKG:demo', name: 'demo', sourcePath: 'packages/demo/package.json' }],
    modules: [{ id: `MODULE:${file}`, source: { path: file, sha256: hash(text) }, boundaries: [], dependencies: [{ sourcePath: file, request: 'external', resolution: { status: 'source', path: 'external.d.ts' } }] }],
    exports: [{ id: 'EXPORT:Public', name: 'Public', moduleId: `MODULE:${file}`, typeId: 'T:1', instanceTypeId: 'T:2', declarations: [declaration(iface)], boundaries: [] }],
    types: [
      { ...base, id: 'T:1', kind: 'object', display: 'Public', declarations: [declaration(iface)], properties: [{ name: 'value', optional: true, readonlySyntax: true, typeId: 'T:2', declarations: [declaration(field)] }, { name: 'next', optional: false, readonlySyntax: false, typeId: 'T:1', declarations: [] }], calls: [{ source: declaration(iface), parameters: [{ name: 'arg', optional: false, rest: true, typeId: 'T:2', source: declaration(field) }], typeParameters: ['T:3'], returnTypeId: 'T:1' }], constructs: [{ source: null, parameters: [], typeParameters: [], returnTypeId: 'T:2' }], indexes: [{ keyTypeId: 'T:3', typeId: 'T:2', readonly: true, source: declaration(field) }] },
      { ...base, id: 'T:2', kind: 'declaration-instantiation-boundary', display: 'Value', sourceFamilyRepresentativeTypeId: 'T:3', boundaries: ['declaration-instantiation-detail-budget'] },
      { ...base, id: 'T:3', kind: 'conditional', display: 'Conditional', checkTypeId: 'T:1', extendsTypeId: 'T:2', trueTypeId: 'T:1', falseTypeId: 'T:2', objectTypeId: 'T:1', indexTypeId: 'T:2', constraintTypeId: 'T:2', defaultTypeId: 'T:1', genericDefinitionTypeId: 'T:1', baseConstraintTypeId: 'T:2', arguments: ['T:2'], constituents: ['T:1'], aliasTypeArguments: ['T:2'], operationSource: declaration(field) },
    ], inferences: [{ id: 'INFER:1', source: declaration(field), typeId: 'T:2', status: 'EVALUATED' }],
    plugins: [{ id: 'PLUGIN:1', source: declaration(iface), typeId: 'T:1', optionsTypeId: 'T:2', optionsTypeIds: ['T:2'], status: 'EVALUATED' }],
  };
  return { graph, files: new Map([[file, text]]), entryLedger: { packages: graph.packages, entries: [{ id: 'ENTRY:1', packageId: 'PKG:demo', kind: 'main', target: { path: file, moduleId: `MODULE:${file}`, status: 'source' } }], candidateDispositions: [{ id: 'CANDIDATE:1', moduleId: `MODULE:${file}`, status: 'ENTRY_LINKED' }], boundaries: [] }, publication: [] };
}
function build(input = fixture()) {
  assert.equal(typeof api.buildPublicSurface, 'function', 'public surface implementation required');
  return api.buildPublicSurface(input);
}

test('explicit Node self-reference probe records a distinct observer without replacing observations', () => {
  const input = fixture(), file = '__sdk54_external__/@types+node@22.14.0/buffer.d.ts';
  const text = "import { Value } from 'external'; export interface NodePublic { value: Value; }";
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true), node = sf.statements[1];
  input.files.set(file, text);
  input.graph.exports[0].declarations = [{ path: file, start: node.getStart(sf), end: node.end }];
  const baseline = build(input);
  assert.ok(baseline.uses.some(row => row.resolutionStatus === 'NOT_OBSERVED'));
  const calls = [];
  const options = { ...input, referenceResolution: 'node-self', nodeSelfReferenceResolver: (request, from) => {
    calls.push({ request, from });
    return { status: 'node-global-context', declarations: [{ path: file, start: 0 }], contextBoundary: 'node-global-context-not-project-verified' };
  } };
  const result = build(options), use = result.uses.find(row => row.resolutionKey === `${file}\0external`);
  assert.equal(use.resolutionStatus, 'node-global-context');
  const resolution = result.resolutions.find(row => row.id === use.resolutionId);
  assert.equal(resolution.observations[0].observer, 'lexical-reference-source-probe');
  assert.equal(resolution.observations[0].resolution.declarations[0].sha256, hash(text));
  assert.equal(result.stageClosable, false);
  assert.deepEqual(result.uses.map(row => row.id), baseline.uses.map(row => row.id));
  input.graph.externalContext.resolutions.push({ from: file, request: 'external', status: 'missing-exact-archive' });
  calls.length = 0;
  const observed = build(options);
  assert.equal(calls.length, 0);
  assert.equal(observed.uses.find(row => row.id === use.id).resolutionStatus, 'missing-exact-archive');
  assert.throws(() => build({ ...input, referenceResolution: 'guess' }), /reference resolution/i);
  assert.throws(() => build({ ...input, referenceResolution: 'node-self' }), /resolver/i);
  const noNode = build({ ...fixture(), referenceResolution: 'node-self', nodeSelfReferenceResolver: () => { throw new Error('must not probe workspace'); } });
  assert.equal(noNode.uses[0].resolutionStatus, 'source');
});

test('Node self probe rejects promotion to project source and missing declaration bytes', () => {
  const input = fixture(), file = '__sdk54_external__/@types+node@22.14.0/buffer.d.ts';
  const text = "export type NodePublic = import('buffer').Buffer;";
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true), node = sf.statements[0];
  input.files.set(file, text); input.graph.exports[0].declarations = [{ path: file, start: node.getStart(sf), end: node.end }];
  const options = { ...input, referenceResolution: 'node-self' };
  assert.equal(build({ ...options, nodeSelfReferenceResolver: () => ({ status: 'source', path: file }) }).uses[0].resolutionStatus, 'NOT_OBSERVED');
  assert.throws(() => build({ ...options, nodeSelfReferenceResolver: () => ({ status: 'node-global-context', declarations: [{ path: 'missing.d.ts', start: 0 }] }) }), /probe declaration/i);
});

test('template reference projection is explicit and preserves raw declaration hashes', () => {
  const input = fixture(), file = 'packages/template/src/template.ts';
  const text = "import { Value } from 'external';\nexport type <%- project.name %> = Value;\n";
  const projected = text.replace(/<%[-=]\s*project\.([A-Za-z_]\w*)\s*%>/g, (raw, name) => `Template_${name}`.padEnd(raw.length, '_'));
  const sf = ts.createSourceFile(file, projected, ts.ScriptTarget.Latest, true), node = sf.statements[1];
  const location = { path: file, start: node.getStart(sf), end: node.end, origin: 'fixed-source' };
  input.files.set(file, text);
  input.graph.exports[0].declarations = [location];
  const baseline = build(input), result = build({ ...input, templateProjection: true });
  assert.equal(baseline.templateProjections, undefined);
  const id = result.exports[0].declarationIds[0], declaration = result.declarations.find(row => row.id === id);
  assert.equal(declaration.referenceScanStatus, 'SCANNED');
  assert.equal(declaration.sha256, hash(text));
  assert.equal(declaration.sliceSha256, hash(text.slice(location.start, location.end)));
  assert.equal(result.templateProjections.length, 1);
  assert.equal(result.templateProjections[0].rawSha256, hash(text));
  assert.equal(result.templateProjections[0].projectedSha256, hash(projected));
  assert.ok(result.uses.some(row => row.declarationId === id && row.request === 'external'));
  assert.equal(api.validatePublicSurface({ ...result, templateProjections: [] }, result).valid, false);
});

test('normalizes entry, export, instance, every semantic edge and recursive members without path expansion', () => {
  const result = build();
  assert.equal(result.types.length, 3);
  assert.equal(result.members.length, 6);
  assert.deepEqual(result.exports[0].entryIds, ['ENTRY:1']);
  assert.equal(result.exports[0].instanceTypeId, 'T:2');
  assert.ok(result.types.every(row => row.reachability === 'ENTRY_REACHABLE'));
  assert.ok(result.typeEdges.some(row => row.fromTypeId === row.toTypeId));
  for (const relation of ['sourceFamilyRepresentativeTypeId', 'checkTypeId', 'extendsTypeId', 'trueTypeId', 'falseTypeId', 'objectTypeId', 'indexTypeId', 'constraintTypeId', 'defaultTypeId', 'genericDefinitionTypeId', 'baseConstraintTypeId', 'aliasTypeArguments/0', 'calls/0/parameters/0/typeId', 'constructs/0/returnTypeId', 'indexes/0/keyTypeId']) assert.ok(result.typeEdges.some(row => row.relation === relation), relation);
  const property = result.members.find(row => row.kind === 'property' && row.name === 'value');
  assert.equal(property.optional, true);
  assert.equal(property.readonlySyntax, true);
  assert.equal(property.declarationIds.length, 1);
  assert.ok(result.types.find(row => row.id === 'T:2').boundaries.includes('declaration-instantiation-detail-budget'));
  assert.equal(result.stageClosable, false);
  assert.equal(result.publicSurfaceComplete, false);
});

test('keeps fixed target and conditional source projection entry links distinct', () => {
  const input = fixture(), moduleId = 'MODULE:projected.ts';
  input.entryLedger.entries[0].target.projectionCandidates = [{ path: 'projected.ts', moduleId, config: 'tsconfig.json' }];
  input.graph.modules.push({ id: moduleId, source: { path: 'projected.ts' }, boundaries: [], dependencies: [] });
  input.graph.exports.push({ ...input.graph.exports[0], id: 'EXPORT:projected', moduleId, declarations: [] });
  input.entryLedger.candidateDispositions.push({ id: 'CANDIDATE:projected', moduleId, status: 'SOURCE_PROJECTION_CANDIDATE' });
  const result = build(input);
  const fixed = result.exports.find(row => row.id === 'EXPORT:Public'), projected = result.exports.find(row => row.id === 'EXPORT:projected');
  assert.deepEqual(fixed.entryIds, ['ENTRY:1']);
  assert.deepEqual(projected.entryIds, ['ENTRY:1']);
  assert.equal(fixed.entryLinks[0].kind, 'FIXED_ENTRY_TARGET');
  assert.equal(projected.entryLinks[0].kind, 'CONDITIONAL_SOURCE_PROJECTION');
  assert.equal(projected.entryLinks[0].runtimeAcceptance, 'NOT_VERIFIED');
});

test('bundle recipe source roots remain conditional source links', () => {
  const input = fixture();
  input.entryLedger.entries[0].target.method = 'fixed-ncc-entry-recipe';
  const result = build(input);
  assert.equal(result.exports[0].entryLinks[0].kind, 'CONDITIONAL_SOURCE_PROJECTION');
  assert.equal(result.exports[0].entryLinks[0].runtimeAcceptance, 'NOT_VERIFIED');
});

test('deduplicates exact declaration origins and binds only actual uses to their resolution', () => {
  const input = fixture(), result = build(input);
  assert.equal(result.declarations.length, 2);
  const property = result.members.find(row => row.kind === 'property' && row.name === 'value');
  const source = result.declarations.find(row => row.id === property.declarationIds[0]);
  assert.equal(source.sha256, hash(input.files.get(source.path)));
  assert.equal(source.sliceSha256, hash(input.files.get(source.path).slice(source.start, source.end)));
  assert.equal(source.referenceScanStatus, 'SCANNED');
  assert.equal(source.useIds.length, 1);
  const use = result.uses.find(row => row.id === source.useIds[0]);
  assert.equal(use.request, 'external');
  assert.equal(use.resolutionStatus, 'source');
  assert.ok(result.resolutions.some(row => row.id === use.resolutionId));
  assert.equal(result.fileDependencies.length, 1);
  assert.equal(result.fileDependencies[0].precision, 'FILE_CONTEXT_ONLY');
});

test('recovers plugin AST ranges from exact line/column without collapsing same-file declarations', () => {
  const input = fixture(), file = 'plugins.ts';
  const text = "import * as NS from 'external';\nconst first = NS.first;\nconst second = NS.second;\n";
  input.files.set(file, text);
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  input.graph.plugins = sf.statements.slice(1).map((statement, index) => {
    const node = statement.declarationList.declarations[0], position = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return { id: `PLUGIN:${index}`, typeId: 'T:1', optionsTypeId: 'T:2', optionsTypeIds: ['T:2'], source: { path: file, line: position.line + 1, column: position.character + 1 } };
  });
  const result = build(input), ids = result.plugins.flatMap(row => row.declarationIds);
  assert.equal(new Set(ids).size, 2);
  for (const id of ids) {
    const declaration = result.declarations.find(row => row.id === id);
    assert.equal(declaration.rangeOrigin, 'EXACT_AST_LINE_COLUMN');
    assert.equal(declaration.referenceScanStatus, 'SCANNED');
    assert.equal(declaration.useIds.length, 1);
    assert.ok(text.slice(declaration.start, declaration.end).startsWith('first') || text.slice(declaration.start, declaration.end).startsWith('second'));
  }
});

test('retains all outside-entry candidates and sources missing from the scan as explicit boundaries', () => {
  const input = fixture();
  input.entryLedger.entries = [];
  input.graph.types[0].declarations.push({ path: 'missing.d.ts', origin: 'verified-external-declaration', start: 0, end: 5 });
  const result = build(input);
  assert.equal(result.exports.length, 1);
  assert.equal(result.inferences.length, 1);
  assert.equal(result.plugins.length, 1);
  assert.ok(result.types.every(row => row.reachability === 'CONSERVATIVE_CANDIDATE'));
  assert.equal(result.declarations.find(row => row.path === 'missing.d.ts').referenceScanStatus, 'SOURCE_UNAVAILABLE');
  assert.equal(result.candidateDispositions.length, 1);
});

test('rejects input hash drift, duplicate type identities and dangling type references', () => {
  const drift = fixture(); drift.files.set([...drift.files.keys()][0], 'changed');
  assert.throws(() => build(drift), /input.*hash|hash.*input/i);
  const duplicate = fixture(); duplicate.graph.types.push(duplicate.graph.types[0]);
  assert.throws(() => build(duplicate), /duplicate/i);
  const dangling = fixture(); dangling.graph.types[0].properties[0].typeId = 'ABSENT';
  assert.throws(() => build(dangling), /dangling/i);
});

test('rejects dangling type and instance roots even outside all known entry modules', () => {
  for (const key of ['typeId', 'instanceTypeId']) {
    const input = fixture(); input.entryLedger.entries = [];
    input.graph.exports[0][key] = 'ABSENT';
    assert.throws(() => build(input), /dangling/i, key);
  }
});

test('rebuild comparison rejects deleted field, entry, reference, false closure and added records', () => {
  const expected = build();
  for (const [name, mutate] of [
    ['member', x => x.members.shift()], ['entry', x => x.entries.shift()], ['use', x => x.uses.shift()],
    ['edge', x => x.typeEdges.shift()], ['source', x => x.declarations[0].sliceSha256 = 'wrong'],
    ['close', x => x.stageClosable = true], ['extra', x => x.types.push({ id: 'unexpected' })],
    ['duplicate', x => x.exports.push(x.exports[0])], ['candidate', x => x.candidateDispositions.shift()],
  ]) {
    const actual = structuredClone(expected); mutate(actual);
    assert.equal(api.validatePublicSurface(actual, expected).valid, false, name);
  }
  assert.equal(api.validatePublicSurface(expected, expected).valid, true);
});

test('missing real public fields report their fixed declaration source', () => {
  const expected = build(), actual = structuredClone(expected);
  actual.members = actual.members.filter(row => row.kind !== 'property' || row.name !== 'value');
  const result = api.validatePublicSurface(actual, expected);
  assert.ok(result.failures.some(message => /Missing members:.*packages\/demo\/index\.ts/.test(message)), result.failures.join('\n'));
});

test('canonical records remain stable when unordered input tables are reversed', () => {
  const input = fixture(), first = build(input);
  for (const key of ['inputs', 'packages', 'modules', 'exports', 'types', 'inferences', 'plugins']) input.graph[key].reverse();
  input.files = new Map([...input.files].reverse());
  assert.deepEqual(build(input), first);
});

test('two reconstructions and their source inputs do not share mutable records', () => {
  const input = fixture(), expected = build(input), actual = build(input);
  actual.entries[0].target.status = 'FORGED';
  actual.types[0].boundaries.push('FORGED');
  assert.equal(api.validatePublicSurface(actual, expected).valid, false);
  assert.equal(expected.entries[0].target.status, 'source');
  assert.equal(input.entryLedger.entries[0].target.status, 'source');
  assert.ok(!input.graph.types[0].boundaries.includes('FORGED'));
});

test('artifact shards round trip and reject modified bytes, paths and omissions', () => {
  const result = build(), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-public-test-'));
  try {
    const file = path.join(directory, 'surface.json');
    api.writePublicSurface(file, result, { recordsPerShard: 2 });
    assert.deepEqual(api.readPublicSurface(file), result);
    const index = JSON.parse(fs.readFileSync(file));
    const shard = index.tables.members.shards[0];
    const target = path.join(file + '.parts', shard.path), original = fs.readFileSync(target);
    fs.appendFileSync(target, 'corrupt');
    assert.throws(() => api.readPublicSurface(file), /integrity/i);
    fs.writeFileSync(target, original);
    index.tables.members.shards.shift();
    fs.writeFileSync(file, JSON.stringify(index));
    assert.throws(() => api.readPublicSurface(file), /count|integrity/i);
    shard.path = '../escape.json.gz'; index.tables.members.shards.unshift(shard);
    fs.writeFileSync(file, JSON.stringify(index));
    assert.throws(() => api.readPublicSurface(file), /path/i);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
