import assert from 'node:assert/strict';
import test from 'node:test';
import { indexAmbientModules, validateAmbientModules, reviewAmbientStars, readAmbientReviewInputs } from '../ambient-modules.mjs';
import { createHash } from 'node:crypto';

function fixture(extra = {}) {
  const files = new Map(Object.entries({
    'packages/a/package.json': '{"name":"a"}',
    'packages/a/types.d.ts': `declare module 'inner' { export const value: number; export default class Default {} export interface Props { count: number } } declare module 'outer' { export * from 'inner'; }`, ...extra,
  }));
  const packages = ['a', 'b'].filter(n => files.has(`packages/${n}/package.json`)).map(n => ({id:`PACKAGE:${n}`,name:n,sourcePath:`packages/${n}/package.json`}));
  return {files, packages};
}
const moduleFor=(r,name,owner='PACKAGE:a')=>r.modules.find(m=>m.name===name&&m.packageId===owner&&m.kind==='ambient');
const exportsFor=(r,m)=>r.exports.filter(e=>e.moduleId===m.id);

test('same-package ambient star resolves original declarations and excludes default',()=>{
 const r=indexAmbientModules(fixture()),m=moduleFor(r,'outer');
 assert.deepEqual(exportsFor(r,m).map(e=>e.name).sort(),['Props','value']);
 assert.ok(exportsFor(r,m).every(e=>e.symbolIds.length)); assert.equal(m.boundaries.length,0);
 assert.ok(r.symbols.every(s=>s.declarations.every(d=>d.path==='packages/a/types.d.ts')));
});
test('type-only star and named aliases preserve syntax and origin',()=>{
 const r=indexAmbientModules(fixture({'packages/a/extra.d.ts':`declare module 'typed' { export type * from 'inner'; } declare module 'named' { export { value as renamed } from 'inner'; }`}));
 assert.equal(r.edges.find(e=>e.moduleId===moduleFor(r,'typed').id).typeOnlySyntax,true);
 assert.equal(exportsFor(r,moduleFor(r,'named'))[0].name,'renamed');
 assert.ok(exportsFor(r,moduleFor(r,'named'))[0].symbolIds.every(id=>r.symbols.some(s=>s.id===id)));
});
test('same module names in other owners never merge implicitly',()=>{
 const r=indexAmbientModules(fixture({'packages/b/package.json':'{"name":"b"}','packages/b/types.d.ts':`declare module 'inner' { export const foreign: string; } declare module 'consumer' { export * from 'only-a'; }`,'packages/a/extra.d.ts':`declare module 'only-a' { export const local: boolean; }`}));
 assert.deepEqual(exportsFor(r,moduleFor(r,'inner','PACKAGE:b')).map(e=>e.name),['foreign']);
 assert.ok(moduleFor(r,'consumer','PACKAGE:b').boundaries.length);
});
test('augmentation wildcard shorthand and nested declarations retain explicit boundaries',()=>{
 const r=indexAmbientModules(fixture({'packages/a/augment.d.ts':`export {}; declare module 'inner' { export const augmented: number; }`,'packages/a/extra.d.ts':`declare module '*.svg' { const value: string; export default value; } declare module 'loose'; declare namespace Box { module 'nested' { const v: string } }`}));
 for(const name of ['inner','*.svg','loose','nested'])assert.ok(r.modules.some(m=>m.name===name&&m.kind!=='ambient'&&m.boundaries.length));
 assert.ok(!exportsFor(r,moduleFor(r,'inner')).some(e=>e.name==='augmented'));
});
test('ambient merging and overloads keep every source declaration',()=>{
 const r=indexAmbientModules(fixture({'packages/a/extra.d.ts':`declare module 'inner' { export function run(n: number): void; export function run(s: string): void; }`}));
 const e=exportsFor(r,moduleFor(r,'inner')).find(e=>e.name==='run');
 assert.equal(r.symbols.find(s=>s.id===e.symbolIds[0]).declarations.length,2);
 assert.equal(moduleFor(r,'inner').declarations.length,2);
});
test('cyclic stars stabilize and unresolved boundaries propagate',()=>{
 const r=indexAmbientModules(fixture({'packages/a/extra.d.ts':`declare module 'cycle-a' { export * from 'cycle-b'; export const a: 1; } declare module 'cycle-b' { export * from 'cycle-a'; export * from 'missing'; export const b: 2; }`}));
 for(const name of ['cycle-a','cycle-b']){assert.deepEqual(exportsFor(r,moduleFor(r,name)).map(e=>e.name).sort(),['a','b']);assert.ok(moduleFor(r,name).boundaries.length);}
});
test('star conflicts and unresolved named reexports cannot appear complete',()=>{
 const r=indexAmbientModules(fixture({'packages/a/extra.d.ts':`declare module 'left' { export const clash: string; } declare module 'right' { export const clash: number; } declare module 'conflict' { export * from 'left'; export * from 'right'; } declare module 'bad' { export { missing } from 'inner'; }`}));
 for(const name of ['conflict','bad'])assert.ok(moduleFor(r,name).boundaries.length,name);
});

test('duplicate ambient values and incompatible merged properties preserve diagnostics',()=>{
 const r=indexAmbientModules(fixture({'packages/a/extra.d.ts':`declare module 'duplicate' { export const v: string; export const v: number; } declare module 'merged' { export interface P { a: string } export interface P { a: number } }`}));
 for(const name of ['duplicate','merged'])assert.ok(moduleFor(r,name).boundaries.length,name);
});
test('relative exports and export-equals remain review boundaries',()=>{
 const r=indexAmbientModules(fixture({'packages/a/extra.d.ts':`declare module 'relative' { export * from './local'; } declare module 'equals' { const f: () => void; export = f; }`,'packages/a/local.d.ts':'export const local: string;'}));
 for(const name of ['relative','equals'])assert.ok(moduleFor(r,name).boundaries.length,name);
});
test('review maps source positions and matches target declarations within owner',()=>{
 const input=fixture(),r=indexAmbientModules(input);
 const old={reviews:[{id:'review-1',kind:'external-star',source:{path:'packages/a/types.d.ts',start:input.files.get('packages/a/types.d.ts').indexOf('export *'),line:1}}]};
 const reviews=reviewAmbientStars(r,old);
 assert.equal(reviews.length,1);assert.equal(reviews[0].status,'EXPANDED_AMBIENT_DECLARATION');assert.ok(reviews[0].namedExports.length);
});
test('reconstruction rejects missing or duplicate sources exports edges symbols and fake closure',()=>{
 const input=fixture(),r=indexAmbientModules(input);assert.deepEqual(indexAmbientModules(input),r);
 for(const mutate of [a=>a.modules.pop(),a=>a.exports.pop(),a=>a.edges.pop(),a=>a.symbols.pop(),a=>a.inputs.pop(),a=>a.exports.push(a.exports[0]),a=>a.publicSurfaceComplete=true]){
  const actual=structuredClone(r);mutate(actual);assert.equal(validateAmbientModules(actual,r).valid,false);
 }
});

test('frozen review input uses actual string gap details and rejects identity drift or missing requests',()=>{
 const syntaxBytes=Buffer.from(JSON.stringify({nonInferredGaps:[{id:'g',details:'inner'}]}));
 const previousBytes=Buffer.from(JSON.stringify({previous:{sha256:createHash('sha256').update(syntaxBytes).digest('hex')},reviews:[{id:'r',kind:'external-star',previousGapId:'g'}]}));
 const expectedHash=createHash('sha256').update(previousBytes).digest('hex');
 assert.equal(readAmbientReviewInputs({previousBytes,syntaxBytes,expectedHash}).reviews[0].request,'inner');
 assert.throws(()=>readAmbientReviewInputs({previousBytes,syntaxBytes,expectedHash:'wrong'}),/identity/);
 assert.throws(()=>readAmbientReviewInputs({previousBytes,syntaxBytes:Buffer.from('{"nonInferredGaps":[]}'),expectedHash}),/identity/);
});
