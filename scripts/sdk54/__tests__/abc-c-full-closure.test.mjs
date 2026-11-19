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

function relationFixture() {
  const hash='a'.repeat(64), source={revision:'fixed',tree:'tree'};
  const declaration={id:'D',path:'packages/demo/index.ts',sha256:hash,start:0,end:20,sourceStatus:'HASH_VERIFIED'};
  const surface={source,packages:[{id:'PKG:demo',name:'demo',sourcePath:'packages/demo/package.json',manifestSha256:hash,dependencies:{}}],
    entries:[{id:'ENTRY:demo',packageId:'PKG:demo',target:{moduleId:'MOD'},source:{path:'packages/demo/index.ts',sha256:hash}}],
    modules:[{id:'MOD',packageId:'PKG:demo'}],exports:[{id:'EX',moduleId:'MOD',entryIds:['ENTRY:demo'],typeId:'NEW-TYPE',declarationIds:['D']}],
    types:[{id:'NEW-TYPE',declarationIds:['D'],memberIds:['NEW-MEMBER']}],members:[{id:'NEW-MEMBER',ownerTypeId:'NEW-TYPE',declarationIds:['D']}],
    declarations:[declaration],typeEdges:[],plugins:[],candidateDispositions:[],boundaries:[]};
  const cap='CAPABILITY:PKG%3Ademo:REQUIRED:ordinary';
  return {surface,scope:{rows:[{id:'NEW-MEMBER',kind:'public-member-candidate',membershipId:'A-M4-REACHABILITY:NEW-MEMBER',scope:'M4_REQUIRED',declarations:[declaration]}]},
    relations:{seedFacts:{source,records:[{id:'SEED:demo',name:'demo',sourceId:'PKG:demo',existingPreassignment:{batch:'M7.1'}}]},
      sharedReview:{schemaVersion:1,source,packages:[]},
      review:{source,decisions:[{id:cap,ownerPackageId:'PKG:demo',oldScope:{state:'REQUIRED',scopeId:null},finalMilestoneIds:['M7.1'],sourceRefs:[{path:'packages/demo/package.json',sha256:hash}],scope:{state:'REQUIRED',uses:[{use:'ordinary',state:'REQUIRED',deferId:null,batch:'M7.1'}]}}],seedDecisions:[{id:'SEED:demo',originalRecordSha256:'866cd400a277482bfe81ca42e60915c938e206c464e1593b29253757c6b002e5',reviewedCapabilityIds:[cap]}]},
      sourceFiles:[{path:'packages/demo/package.json',sha256:hash,capabilityIds:[cap]}],semanticFiles:[]}};
}

test('rebuilds memberships in the supplied graph namespace rather than joining historical type ordinals',async()=>{
  const {buildCapabilityRelations}=await import('../abc/c-public-closure.mjs');
  assert.equal(typeof buildCapabilityRelations,'function');
  const f=relationFixture();f.relations.review.source={...f.surface.source,sourceDir:'/historical/root'};
  const result=buildCapabilityRelations(f);
  assert.equal(result.capabilityMap.memberships.length,5);
  assert.equal(result.memberReview[0].recordId,'NEW-MEMBER');
  assert.equal(result.memberReview[0].originalMembershipId,'A-M4-REACHABILITY:NEW-MEMBER');
  assert.equal(result.memberReview[0].membershipId,'CAPABILITY-MEMBERSHIP:members:NEW-MEMBER');
  assert.deepEqual(result.memberReview[0].capabilityIds,['CAPABILITY:PKG%3Ademo:REQUIRED:ordinary']);
  assert.equal(result.scopeRelations.capabilities[0].scope.uses[0].state,'REQUIRED');
  assert.deepEqual(result.blockers,[]);
  assert.equal(result.harmonySupportAccepted,false);
});

test('rejects missing capability uses, dropped review identities and forged source receipts',async()=>{
  const {buildCapabilityRelations}=await import('../abc/c-public-closure.mjs');
  assert.equal(typeof buildCapabilityRelations,'function');
  for(const mutate of [f=>{f.relations.review.source={...f.relations.review.source,tree:'wrong-tree'};},f=>f.relations.review.decisions[0].scope.uses=[],f=>f.relations.review.decisions=[],f=>f.relations.review.decisions[0].sourceRefs[0].sha256='b'.repeat(64)]){
    const f=relationFixture();mutate(f);assert.throws(()=>buildCapabilityRelations(f));
  }
});

test('does not accept a same-ID member from another declaration or a missing member',async()=>{
  const {buildCapabilityRelations}=await import('../abc/c-public-closure.mjs');
  assert.equal(typeof buildCapabilityRelations,'function');
  for(const mutate of [f=>f.scope.rows[0].declarations=[{...f.scope.rows[0].declarations[0],sha256:'b'.repeat(64)}],f=>f.scope.rows[0].id='ABSENT']){
    const f=relationFixture();mutate(f);const result=buildCapabilityRelations(f);
    assert.equal(result.blockers.length,1);assert.equal(result.memberReview[0].status,'BLOCKED');
  }
});

test('supplied relation inputs remove only missing-input blockers and preserve runtime non-acceptance',async()=>{
  const f=relationFixture();
  // Full graph declarations and scope declaration locations share exact bytes.
  f.surface.declarations[0].start=24;f.surface.declarations[0].end=37;
  const result=buildSourceClosure({...f,files:[{path:'packages/demo/index.ts',content:source}]});
  assert.ok(result.scopeRelations,'supplied capability/use decisions must be consumed');
  assert.ok(result.capabilityMap.memberships.some(r=>r.recordId==='NEW-MEMBER'));
  assert.equal(result.blockers.some(r=>/^MISSING_(?:CAPABILITY_RELATIONS|FULL_MEMBERSHIP)_INPUT$/.test(r.code)),false);
  assert.equal(result.stageClosable,false);assert.equal(result.harmonySupportAccepted,false);
});

test('final relation closure covers the entire regenerated membership set without granting runtime acceptance',async()=>{
  const {completeSourceRelations}=await import('../abc/c-public-closure.mjs');
  assert.equal(typeof completeSourceRelations,'function');
  const f=relationFixture();f.surface.declarations[0].start=24;f.surface.declarations[0].end=37;
  const rebuilt=buildSourceClosure({...f,files:[{path:'packages/demo/index.ts',content:source}]});
  const result=completeSourceRelations({rebuilt,surface:f.surface,publicDispositions:{entries:[{id:'ENTRY:demo',disposition:'PUBLIC_ENTRY'}],exports:[{id:'EX',typeId:'NEW-TYPE',disposition:'PUBLIC_MODULE_EXPORT'}],candidateDispositions:[]},plugins:{plugins:[]}});
  assert.equal(result.summary.memberships,5);assert.equal(result.blockers.length,0);
  assert.equal(result.stageClosable,false);assert.equal(result.harmonySupportAccepted,false);
});

test('binds declaration-free exports outside the M4 scope using the existing source rules',()=>{
  const f=fixture();
  const result=buildSourceClosure({...f,files:[...f.files,{path:'outside.ts',content:'export default function <%- project.viewName %>() {}'}],
    supplementalExports:[{id:'OUTSIDE',path:'outside.ts',name:'default'}]});
  assert.ok(result.exportBindings.bindings.some(r=>r.id==='OUTSIDE'));
});

test('relative template imports retain raw filename identities after syntax projection',()=>{
  const raw='packages/template/{%- project.viewName %}.tsx';
  assert.deepEqual(relativeSourceTargets('packages/template/index.ts',
    "export { default } from './<%- project.viewName %>';",new Set([raw])),[raw]);
});
