import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceClosure, expandRelativeSourceEvidence, relativeSourceTargets } from '../abc/c-public-closure.mjs';

const source = `export interface Demo { value: string }\nexport const demo: Demo = { value: 'x' };\n`;
const fixture = ({ missingMemberSource = false, missingExport = false } = {}) => ({
  scope: { schemaVersion: 1, complete: false, rows: [
    { id: 'M', kind: 'public-member-candidate', scope: 'M4_REQUIRED', acceptance: 'NOT_RUN', acceptanceId: 'M4-A01',
      ownerTypeId: 'T', membershipId: 'MEM:M', reachability: 'PUBLIC_REACHABLE', capabilityIds: [],
      declarations: missingMemberSource ? [] : [{ id: 'D', path: 'demo.ts', start: 24, end: 37, sourceStatus: 'HASH_VERIFIED', sha256: 'ignored' }] },
    { id: 'E', kind: 'public-export', scope: 'SOURCE_CONTEXT', acceptance: 'NOT_RUN', name: missingExport ? 'absent' : 'demo',
      source: { path: 'demo.ts' } },
  ] },
  surface: {
    types: [{ id: 'T', kind: 'object', display: 'Demo', declarationIds: missingMemberSource ? [] : ['D'], memberIds: ['M'] }],
    members: [{ id: 'M', ownerTypeId: 'T', declarationIds: missingMemberSource ? [] : ['D'] }],
    typeEdges: [], exports: [{ id: 'E', typeId: missingMemberSource ? null : 'T', declarationIds: ['D'] }],
    declarations: [{ id: 'D', path: 'demo.ts', start: 24, end: 37, sourceStatus: 'HASH_VERIFIED', sha256: 'ignored' }],
  },
  files: [{ path: 'demo.ts', content: source }],
});

test('runs finite, derived and export builders while retaining unavailable historical relations as blockers', () => {
  const result = buildSourceClosure(fixture());
  assert.equal(result.finite.format, 'sdk54-finite-source-declarations-v1');
  assert.equal(result.derived.format, 'sdk54-derived-source-provenance-v1');
  assert.equal(result.exportBindings.format, 'sdk54-export-source-bindings-v1');
  assert.ok(result.blockers.some(row => row.code === 'MISSING_CAPABILITY_RELATIONS_INPUT'));
  assert.ok(result.blockers.some(row => row.code === 'MISSING_FULL_MEMBERSHIP_INPUT'));
  assert.equal(result.finalClosure, null);
  assert.equal(result.stageClosable, false);
});

test('rejects a member without finite or derived source evidence', () => {
  const result = buildSourceClosure(fixture({ missingMemberSource: true }));
  assert.ok(result.blockers.some(row => row.code === 'MISSING_SOURCE_EVIDENCE' && row.recordId === 'M'));
});

test('retains an unresolved export binding as a blocker', () => {
  const result = buildSourceClosure(fixture({ missingExport: true }));
  assert.ok(result.blockers.some(row => row.code === 'MISSING_EXPORT_SOURCE_BINDING' && row.recordId === 'E'));
});

test('retains an unresolved finite binding without dropping derived evidence', () => {
  const input = fixture();
  input.scope.rows[0].declarations[0] = { ...input.scope.rows[0].declarations[0], start: 40, end: 41 };
  const result = buildSourceClosure(input);
  assert.ok(result.blockers.some(row => row.code === 'FINITE_DECLARATION_BLOCKER' && row.recordId === 'M'));
  assert.ok(result.derived.records.some(row => row.recordId === 'M'));
});

test('discovers existing relative import and reexport targets with declaration and platform suffixes', () => {
  const available = new Set([
    'packages/router/ui.d.ts',
    'packages/router/build/ui.d.ts',
    'packages/router/build/Tabs.tsx',
    'packages/router/build/Tabs.web.tsx',
    'packages/router/build/internal/index.ts',
    'packages/router/build/types/index.d.ts',
    'packages/router/build/styles.css',
    'packages/router/unrelated.ts',
  ]);
  assert.deepEqual(relativeSourceTargets('packages/router/ui.d.ts', "export * from './build/ui'; export * from 'external';", available), [
    'packages/router/build/ui.d.ts',
  ]);
  assert.deepEqual(relativeSourceTargets('packages/router/build/ui.d.ts', "import './internal'; import './styles.css'; export * from './types'; export { Tabs } from './Tabs'; require('external');", available), [
    'packages/router/build/Tabs.tsx',
    'packages/router/build/Tabs.web.tsx',
    'packages/router/build/internal/index.ts',
    'packages/router/build/types/index.d.ts',
  ]);
});

test('does not parse non-code source receipts as TypeScript dependencies', () => {
  assert.deepEqual(relativeSourceTargets('packages/router/package.json', '{"main":"./build/index.js"}', new Set()), []);
});

test('records recursively loaded fixed sources with a replayable hash and transitive role', () => {
  const contents = new Map([['packages/router/ui.ts', {
    path: 'packages/router/ui.ts', content: "export * from './build/ui';", sha256: 'direct', origin: 'fixed-expo-git',
  }]]);
  const entries = new Map([
    ['packages/router/ui.ts', { path: 'packages/router/ui.ts', oid: 'direct-blob' }],
    ['packages/router/build/ui.ts', { path: 'packages/router/build/ui.ts', oid: 'transitive-blob' }],
  ]);
  const receipts = expandRelativeSourceEvidence({
    contents,
    entries,
    readBlobs: selected => new Map(selected.map(entry => [entry.path, Buffer.from('export const ui = true;')])),
  });
  assert.equal(contents.has('packages/router/build/ui.ts'), true);
  assert.deepEqual(receipts, [{
    path: 'packages/router/build/ui.ts',
    sha256: 'befef08f757556e0fc623ef4863edfeb7843e8103ace3da835283178eb1a19c8',
    bytes: 23,
    origin: 'fixed-expo-git',
    blob: 'transitive-blob',
    role: 'TRANSITIVE_EXPORT_SOURCE',
  }]);
});

test('records relative assets without treating them as TypeScript sources', () => {
  const contents = new Map([['packages/router/styles.ts', {
    path: 'packages/router/styles.ts', content: "import styles from './styles.css'; export default styles;", sha256: 'direct', origin: 'fixed-expo-git',
  }]]);
  const entries = new Map([
    ['packages/router/styles.ts', { path: 'packages/router/styles.ts', oid: 'source-blob' }],
    ['packages/router/styles.css', { path: 'packages/router/styles.css', oid: 'asset-blob' }],
  ]);
  const assetRelations = [];
  const receipts = expandRelativeSourceEvidence({
    contents,
    entries,
    assetRelations,
    readBlobs: selected => new Map(selected.map(entry => [entry.path, Buffer.from('.root {}')])),
  });
  assert.equal(receipts[0].role, 'TRANSITIVE_ASSET_SOURCE');
  assert.deepEqual(assetRelations, [{
    from: 'packages/router/styles.ts', request: './styles.css', path: 'packages/router/styles.css',
    sha256: '77127206b3c436e67278056e007942a0d30dcd615c21579fe089693e14392c1c',
  }]);
});
