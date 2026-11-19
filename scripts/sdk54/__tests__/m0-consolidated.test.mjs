import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { indexSemanticSurface, validateConsolidated, loadCompilerLibraries, buildClosureStatus, validateConsolidatedSet } from '../m0-consolidated.mjs';
const libraries=loadCompilerLibraries();
function fixture(text,extra={}){return {files:new Map(Object.entries({'packages/a/package.json':'{"name":"a"}','packages/a/index.ts':text,...extra})),packages:[{id:'PKG:a',name:'a',sourcePath:'packages/a/package.json'}],libraries,inferredCandidates:[]};}
const binding=(r,name)=>r.exports.find(e=>e.name===name);
const type=(r,id)=>r.types.find(t=>t.id===id);

test('consumer projection uses exact USE ranges and isolated type namespaces without changing default output',()=>{
 const text='import { Value } from "typed"; export const first: Value = {name:"ok"};';
 const input=fixture(text,{'packages/a/types/custom/index.d.ts':'declare module "typed" { export interface Value { name:string } }','packages/b/index.ts':'export const unrelated = 1;'});
 const start=text.lastIndexOf('Value'),source={path:'packages/a/index.ts',start,end:start+5};
 const projection={rootPaths:['packages/a/index.ts'],ambientRootPaths:['packages/a/types/custom/index.d.ts'],compilerOptions:{types:[]},contextId:'consumer/a',referenceCandidates:[{id:'USE:a',source},{id:'USE:b',source},{id:'USE:bad',source:{...source,end:start+4}}]};
 const original=indexSemanticSurface(input),graph=indexSemanticSurface({...input,exportRoots:false,consumerProjection:projection});
 assert.deepEqual(indexSemanticSurface({...input,consumerProjection:null}),original);
 assert.equal(Object.hasOwn(original,'references'),false);
 assert.deepEqual(graph.modules.map(row=>row.source.path),['packages/a/index.ts']);
 assert.equal(graph.references.length,3);
 assert.equal(graph.references[0].typeId,graph.references[1].typeId);
 assert.equal(graph.references[0].symbolDeclarations[0].path,'packages/a/types/custom/index.d.ts');
 assert.equal(graph.references[2].status,'RANGE_UNMATCHED');
 assert.ok(graph.types.every(row=>row.id.startsWith('TYPE:consumer~1a:')));
 assert.ok(graph.types.some(row=>row.properties.some(property=>property.name==='name')));
});

test('consumer USE type encoding enforces budgets and keeps missing program inputs explicit',()=>{
 const text='export const value={child:{enabled:true}};',start=text.indexOf('value');
 const input=fixture(text,{'packages/b/index.ts':'export const other=1;'}),reference={id:'USE:root',source:{path:'packages/a/index.ts',start,end:start+5}};
 const consumerProjection={rootPaths:['packages/a/index.ts'],ambientRootPaths:[],compilerOptions:{types:[]},contextId:'budget',referenceCandidates:[reference]};
 assert.throws(()=>indexSemanticSurface({...input,exportRoots:false,consumerProjection,maxTypes:1}),/budget exceeded/);
 const missing={id:'USE:missing',source:{path:'packages/b/index.ts',start:13,end:18}};
 const graph=indexSemanticSurface({...input,exportRoots:false,consumerProjection:{...consumerProjection,referenceCandidates:[missing]}});
 assert.equal(graph.references[0].status,'SOURCE_UNAVAILABLE');assert.equal(graph.references[0].typeId,null);
 assert.throws(()=>indexSemanticSurface({...input,consumerProjection:{...consumerProjection,referenceCandidates:[reference,reference]}}),/Duplicate consumer reference/);
});

test('consumer source context resolves actual module types once across diagnostic companion programs',()=>{
 const text='import { Base } from "external"; export const value:Base={} as Base;',external='__sdk54_external__/external@1/index.d.ts';
 const input=fixture(text,{[external]:'export interface Base { inherited:boolean }'}),start=text.indexOf('Base={}'),calls=[];
 const sourceContext={resolve(request,from){calls.push({request,from});return {status:'source',path:external,contextBoundary:'locked-transitive-source-not-installed'};},resolveTypeReference(){return {status:'unresolved'};},snapshot(){return {files:[{path:external,sha256:createHash('sha256').update(input.files.get(external)).digest('hex')}]};}};
 const consumerProjection={rootPaths:['packages/a/index.ts'],ambientRootPaths:[],compilerOptions:{types:[]},contextId:'source-context',referenceCandidates:[{id:'USE:base',source:{path:'packages/a/index.ts',start,end:start+4}}],sourceContext};
 const graph=indexSemanticSurface({...input,exportRoots:false,consumerProjection});
 assert.ok(type(graph,graph.references[0].typeId).properties.some(row=>row.name==='inherited'));
 assert.equal(graph.references[0].symbolDeclarations[0].path,external);
 assert.equal(calls.length,1);assert.equal(graph.consumerProjection.sourceResolutions.length,1);
 assert.equal(graph.consumerProjection.sourceResolutions[0].input.path,external);
 assert.throws(()=>indexSemanticSurface({...input,exportRoots:false,consumerProjection,maxTypes:1}),/budget exceeded/);
 calls.length=0;
 const fixed=indexSemanticSurface({...input,exportRoots:false,consumerProjection:{...consumerProjection,resolutions:new Map([['packages/a/index.ts\0external',external]])}});
 assert.equal(calls.length,0);assert.ok(type(fixed,fixed.references[0].typeId).properties.some(row=>row.name==='inherited'));
});

test('consumer explicit type directives override types opt out without automatically loading unrelated Node roots',()=>{
 const external='__sdk54_external__/@types+node@22/index.d.ts';
 for(const explicit of [false,true]){
  const text=(explicit?'/// <reference types="node" />\n':'')+'export const value:Buffer={} as Buffer;',input=fixture(text,{[external]:'interface Buffer { nodeProperty:number }'}),start=text.indexOf('value:');
  const sourceContext={resolve:()=>({status:'unresolved'}),resolveTypeReference:()=>({status:'source',path:external}),snapshot:()=>({files:[{path:external,sha256:createHash('sha256').update(input.files.get(external)).digest('hex')}]})};
  const graph=indexSemanticSurface({...input,exportRoots:false,consumerProjection:{rootPaths:['packages/a/index.ts'],ambientRootPaths:[],compilerOptions:{types:[]},contextId:'opt-out',referenceCandidates:[{id:'USE:value',source:{path:'packages/a/index.ts',start,end:start+5}}],sourceContext}});
  assert.equal(graph.consumerProjection.programInputs.some(row=>row.path===external),explicit);
  assert.equal(type(graph,graph.references[0].typeId).properties.some(row=>row.name==='nodeProperty'),explicit);
  assert.equal(graph.consumerProjection.diagnostics.some(row=>row.message.includes('Buffer')),!explicit,JSON.stringify(graph.consumerProjection.diagnostics));
 }
});

test('consumer archive relative modules cannot bypass resolver package boundaries through native lookup',()=>{
 const archive='__sdk54_external__/first@1/index.d.ts',outside='__sdk54_external__/other@1/index.d.ts';
 const text='import { Value } from "first"; export const value:Value={} as Value;',input=fixture(text,{[archive]:'import { Outside } from "../other@1/index"; export interface Value { child:Outside }',[outside]:'export interface Outside { leaked:true }'}),start=text.indexOf('Value={}');
 const sourceContext={resolve:(request)=>request==='first'?{status:'source',path:archive}:{status:'invalid-request'},resolveTypeReference:()=>({status:'unresolved'}),snapshot:()=>({files:[archive,outside].map(path=>({path,sha256:createHash('sha256').update(input.files.get(path)).digest('hex')}))})};
 const graph=indexSemanticSurface({...input,exportRoots:false,consumerProjection:{rootPaths:['packages/a/index.ts'],ambientRootPaths:[],compilerOptions:{types:[]},contextId:'archive-boundary',referenceCandidates:[{id:'USE:value',source:{path:'packages/a/index.ts',start,end:start+5}}],sourceContext}});
 assert.ok(!graph.consumerProjection.programInputs.some(row=>row.path===outside));
 assert.ok(graph.consumerProjection.sourceResolutions.some(row=>row.request==='../other@1/index'&&row.result.status==='invalid-request'&&row.selectedPath===null));
});

test('consumer verifies resolver authorization and every external triple slash closure input',()=>{
 const consumer='packages/a/index.ts',root='__sdk54_external__/@types+node@22/index.d.ts',child='__sdk54_external__/@types+node@22/globals.d.ts',workspace='packages/unrelated/forged.d.ts';
 for(const defect of ['bad-child-hash','missing-child','workspace-callback']){
  const input=fixture('/// <reference types="node" />\nexport type Value=Buffer;',{[root]:'/// <reference path="./globals.d.ts" />',[child]:'interface Buffer { verified:boolean }',[workspace]:'interface Buffer { forged:boolean }'});
  const sourceContext={resolve:()=>({status:'unresolved'}),resolveTypeReference:()=>({status:'source',path:defect==='workspace-callback'?workspace:root}),snapshot:()=>({files:[...input.files].filter(([file])=>file.startsWith('__sdk54_external__/')&&!(defect==='missing-child'&&file===child)).map(([path,text])=>({path,sha256:defect==='bad-child-hash'&&path===child?'0'.repeat(64):createHash('sha256').update(text).digest('hex')}))})};
  assert.throws(()=>indexSemanticSurface({...input,exportRoots:false,consumerProjection:{rootPaths:[consumer],ambientRootPaths:[],compilerOptions:{types:[]},contextId:'closure-integrity',referenceCandidates:[],sourceContext}}),/hash|provenance|snapshot/i);
 }
});

test('consumer external path references cannot cross archive identities or load unrelated workspace files',()=>{
 const root='__sdk54_external__/first@1/index.d.ts';
 for(const [outside,reference]of [['__sdk54_external__/other@1/index.d.ts','../other@1/index.d.ts'],['packages/unrelated/forged.d.ts','../../packages/unrelated/forged.d.ts']]){
  const input=fixture('/// <reference types="first" />\nexport type Value=Leaked;',{[root]:`/// <reference path="${reference}" />`,[outside]:'interface Leaked { crossedIdentity:boolean }'});
  const sourceContext={resolve:()=>({status:'unresolved'}),resolveTypeReference:()=>({status:'source',path:root}),snapshot:()=>({files:[...input.files].filter(([file])=>file.startsWith('__sdk54_external__/')).map(([path,text])=>({path,sha256:createHash('sha256').update(text).digest('hex')}))})};
  assert.throws(()=>indexSemanticSurface({...input,exportRoots:false,consumerProjection:{rootPaths:['packages/a/index.ts'],ambientRootPaths:[],compilerOptions:{types:[]},contextId:'path-boundary',referenceCandidates:[],sourceContext}}),/boundary|unsafe|provenance|archive/i);
 }
});

test('large artifact comparisons preserve JSON omission semantics and reject extra top-level content',()=>{
 const expected={inputs:[],packages:[],modules:[],exports:[],types:[],inferences:[],plugins:[],externalContext:{mode:'fixed',optional:undefined},stageClosable:false};
 const actual=JSON.parse(JSON.stringify(expected));assert.equal(validateConsolidated(actual,expected).valid,true);
 assert.equal(validateConsolidated({...actual,unexpected:true},expected).valid,false);
 assert.equal(validateConsolidated({...actual,externalContext:{mode:'wrong'}},expected).valid,false);
});

test('inferred objects and function returns expand nested properties and signatures',()=>{
 const r=indexSemanticSurface(fixture('export const value = { nested: { enabled: true } }; export function build(count: number) { return { count }; }'));
 const t=type(r,binding(r,'value').typeId),nested=type(r,t.properties.find(p=>p.name==='nested').typeId);
 assert.ok(nested.properties.some(p=>p.name==='enabled'));
 const fn=type(r,binding(r,'build').typeId);assert.equal(fn.calls.length,1);assert.equal(fn.calls[0].parameters[0].name,'count');
 assert.ok(type(r,fn.calls[0].returnTypeId).properties.some(p=>p.name==='count'));
});
test('inherited public properties optional and readonly syntax survive private exclusion',()=>{
 const r=indexSemanticSurface(fixture('interface Base { readonly base: string } export class Child implements Base { readonly base="x"; optional?: number; private hidden=1; protected internal=2; }'));
 const t=type(r,binding(r,'Child').instanceTypeId);assert.ok(t.properties.find(p=>p.name==='base').readonlySyntax);
 assert.equal(t.properties.find(p=>p.name==='optional').optional,true);assert.ok(!t.properties.some(p=>['hidden','internal'].includes(p.name)));
});
test('arrays tuples unions intersections and standard-library identities are structured',()=>{
 const r=indexSemanticSurface(fixture('export type Pair = readonly [name: string, count?: number]; export type Choice = {a: 1} | {b: 2}; export type Both = {a: 1} & {b: 2}; export const names: string[] = []; export function later(): Promise<{ok: boolean}> { throw 0 }'));
 assert.equal(type(r,binding(r,'Pair').typeId).kind,'tuple');assert.equal(type(r,binding(r,'Pair').typeId).readonlyTuple,true);
 assert.equal(type(r,binding(r,'Choice').typeId).kind,'union');assert.equal(type(r,binding(r,'Both').typeId).kind,'intersection');
 assert.equal(type(r,binding(r,'names').typeId).kind,'array');assert.ok(r.compilerLibraries.files.length>50);
 assert.ok(r.types.some(t=>t.kind==='compiler-library-reference'&&t.arguments.length));
});
test('generic constraints defaults callbacks and overloads are retained',()=>{
 const r=indexSemanticSurface(fixture('export interface Box<T extends {id: string} = {id: string}> { item: T; callback(value: T): T } export function run(x: string): string; export function run(x: number): number; export function run(x: unknown): unknown { return x }'));
 assert.equal(type(r,binding(r,'run').typeId).calls.length,2);
 assert.ok(r.types.some(t=>t.kind==='type-parameter'&&t.constraintTypeId));
 assert.ok(type(r,binding(r,'Box').typeId).properties.some(p=>p.name==='callback'));
});
test('recursive object types converge without dropping the cycle',()=>{
 const r=indexSemanticSurface(fixture('export interface Node { next: Node; name: string }'));
 const t=type(r,binding(r,'Node').typeId);assert.equal(t.properties.find(p=>p.name==='next').typeId,t.id);assert.ok(r.types.length<20);
});
test('missing external dependencies error types and inferred any never imply closure',()=>{
 const r=indexSemanticSurface(fixture('import { value } from "missing"; export const broken = value; export const loose: any = 1;'));
 assert.ok(r.modules[0].boundaries.length);assert.ok(r.types.some(t=>t.boundaries.includes('compiler-error-type')));
 assert.equal(r.publicSurfaceComplete,false);assert.equal(r.stageClosable,false);
});

test('nested error types propagate to inference readiness through the complete type graph',()=>{
 const text='import { missing } from "missing"; export const value = { child: missing };';
 const input=fixture(text);input.inferredCandidates=[{id:'GAP:value',source:{path:'packages/a/index.ts',start:text.indexOf('value ='),line:1}}];
 const r=indexSemanticSurface(input);assert.equal(r.inferences[0].status,'EVALUATED_WITH_BOUNDARY');assert.equal(type(r,r.inferences[0].typeId).hasTransitiveBoundary,true);
});

test('ConfigPlugin candidates map actual options including nested properties in one batch',()=>{
 const text='type ConfigPlugin<P=void> = (config: object, props: P) => object; export const withExample: ConfigPlugin<{nested:{enabled:boolean}}> = (config) => config;';
 const input=fixture(text);input.pluginCandidates=[{id:'PLUGIN:example',name:'withExample',source:{path:'packages/a/index.ts',start:text.indexOf('withExample:'),line:1}}];
 const r=indexSemanticSurface(input);assert.equal(r.plugins.length,1);const options=type(r,r.plugins[0].optionsTypeId);assert.ok(options.properties.some(p=>p.name==='nested'));assert.equal(r.plugins[0].status,'EVALUATED');
});
test('ambient files are excluded from global roots while same-package source remains indexed',()=>{
 const r=indexSemanticSurface(fixture('export const value=1;',{'packages/a/global.d.ts':'declare module "phantom" { export const fake: number }'}));
 assert.ok(r.excludedAmbientFiles.includes('packages/a/global.d.ts'));assert.ok(!r.exports.some(e=>e.name==='fake'));
});

test('inference candidates inside excluded ambient contexts do not query unbound compiler nodes',()=>{
 const text='declare module "x" { export class Derived extends Missing {} }';
 const input=fixture('export const value=1;',{'packages/a/global.d.ts':text});input.inferredCandidates=[{id:'GAP:excluded',source:{path:'packages/a/global.d.ts',start:text.indexOf('export class'),line:1}}];
 const r=indexSemanticSurface(input);assert.equal(r.inferences[0].status,'EXCLUDED_CONTEXT');assert.equal(r.inferences[0].typeId,null);
});
test('all prior inference candidates map to evaluated declarations or explicit missing-node blockers',()=>{
 const input=fixture('export const value = {x: 1};');input.inferredCandidates=[{id:'GAP:value',source:{path:'packages/a/index.ts',start:13,line:1}},{id:'GAP:absent',source:{path:'packages/a/missing.ts',start:0,line:1}}];
 const r=indexSemanticSurface(input);assert.equal(r.inferences.length,2);assert.ok(r.inferences.find(x=>x.id==='GAP:value').typeId);assert.equal(r.inferences.find(x=>x.id==='GAP:absent').status,'MISSING_DECLARATION');
});
test('normal generation is deterministic and deletion of properties signatures roots inputs and type references rejects',()=>{
 const input=fixture('export const value={a:1}; export function f(n:number){return n}'),r=indexSemanticSurface(input);assert.deepEqual(indexSemanticSurface(input),r);
 for(const mutate of [a=>a.types.find(t=>t.properties.length).properties.pop(),a=>a.types.find(t=>t.calls.length).calls.pop(),a=>a.exports.pop(),a=>a.inputs.pop(),a=>a.types.pop(),a=>a.exports[0].typeId='absent',a=>a.types.push(a.types[0]),a=>a.publicSurfaceComplete=true]){const a=structuredClone(r);mutate(a);assert.equal(validateConsolidated(a,r).valid,false);}
});
test('analysis budgets fail explicitly instead of returning a falsely complete type graph',()=>{
 assert.throws(()=>indexSemanticSurface({...fixture('export const value={a:{b:1}};'),maxTypes:1}),/budget/);
});

test('dangling type relationships are diagnosed explicitly at their owning record',()=>{
 const r=indexSemanticSurface(fixture('export const value={a:1};')),bad=structuredClone(r);bad.exports[0].typeId='TYPE:absent';
 const checked=validateConsolidated(bad,r);assert.ok(checked.failures.some(f=>f.includes('Dangling type reference TYPE:absent')));
});
test('closure status retains every unresolved prerequisite and cannot accept source-only supplements',()=>{
 const result=buildClosureStatus({types:[{boundaries:['compiler-error-type']}],modules:[{boundaries:['external']}],inferences:[{status:'MISSING_DECLARATION'}],supplements:[{id:'plugins',complete:false},{id:'external',complete:false}]});
 assert.equal(result.stageClosable,false);assert.equal(result.units['M0-02'],'INCOMPLETE');assert.equal(result.units['M0-03'],'INCOMPLETE');assert.ok(result.blockers.length>=5);
});

test('batch CLI validation shares one rebuilt expectation and rejects mixed invalid snapshots',()=>{
 const r=indexSemanticSurface(fixture('export const value={a:1};')),bad=structuredClone(r);bad.types.pop();
 const result=validateConsolidatedSet([{path:'good',actual:r},{path:'bad',actual:bad}],r);
 assert.equal(result.valid,false);assert.deepEqual(result.results.map(r=>r.valid),[true,false]);
 assert.equal(validateConsolidatedSet([{path:'same',actual:r},{path:'same',actual:r}],r).valid,false);
});

test('batch validation loads each large document on demand and still rejects duplicate paths',()=>{
 const expected=indexSemanticSurface(fixture('export const value=1;')),loaded=[];
 const result=validateConsolidatedSet([{path:'good'},{path:'bad'},{path:'good'}],expected,document=>{loaded.push(document.path);const actual=structuredClone(expected);if(document.path==='bad')actual.exports.pop();return actual;});
 assert.deepEqual(loaded,['good','bad','good']);assert.deepEqual(result.results.map(r=>r.valid),[true,false,false]);
});

test('structural generic mode retains conditional branches and indexed access dependencies',()=>{
 const input=fixture(`export type Select<T extends { kind: string } = { kind: 'default' }> = T extends { kind: 'x' } ? { yes: T } : { no: number };
   export type Lookup<T, K extends keyof T> = T[K];`);
 const graph=indexSemanticSurface({...input,structuralTypeOperations:true});
 const conditional=type(graph,binding(graph,'Select').typeId);
 assert.equal(conditional.kind,'conditional');
 assert.equal(type(graph,conditional.checkTypeId).kind,'type-parameter');
 assert.ok(type(graph,conditional.extendsTypeId).properties.some(p=>p.name==='kind'));
 assert.ok(type(graph,conditional.trueTypeId).properties.some(p=>p.name==='yes'));
 assert.ok(type(graph,conditional.falseTypeId).properties.some(p=>p.name==='no'));
 assert.equal(conditional.distributive,true);
 assert.equal(conditional.operationSource.path,'packages/a/index.ts');
 assert.ok(conditional.boundaries.includes('generic-operation-not-instantiated'));
 const indexed=type(graph,binding(graph,'Lookup').typeId);
 assert.equal(indexed.kind,'indexed-access');
 assert.equal(type(graph,indexed.objectTypeId).kind,'type-parameter');
 assert.equal(type(graph,indexed.indexTypeId).kind,'type-parameter');
 const keyConstraint=type(graph,type(graph,indexed.indexTypeId).constraintTypeId);
 assert.equal(keyConstraint.kind,'keyof');
 assert.equal(keyConstraint.objectTypeId,indexed.objectTypeId);
 const constrained=type(graph,conditional.checkTypeId);
 assert.ok(constrained.constraintTypeId);assert.ok(constrained.defaultTypeId);
 assert.equal(validateConsolidated(graph,graph).valid,true);
 for(const key of ['checkTypeId','extendsTypeId','trueTypeId','falseTypeId']){
  const bad=structuredClone(graph);type(bad,conditional.id)[key]='TYPE:absent';
  assert.ok(validateConsolidated(bad,graph).failures.some(f=>f.includes('Dangling type reference TYPE:absent')));
 }
});

test('structural generic mode propagates missing source from both conditional branches',()=>{
 const graph=indexSemanticSurface({...fixture('export type Select<T> = T extends string ? MissingYes : MissingNo;'),structuralTypeOperations:true});
 const conditional=type(graph,binding(graph,'Select').typeId);
 assert.equal(conditional.kind,'conditional');
 assert.ok(type(graph,conditional.trueTypeId).boundaries.includes('compiler-error-type'));
 assert.ok(type(graph,conditional.falseTypeId).boundaries.includes('compiler-error-type'));
 assert.equal(conditional.hasTransitiveBoundary,true);
 assert.equal(graph.stageClosable,false);
});

test('options-only semantic indexing omits unrelated export roots but retains candidate callbacks and recursion',()=>{
 const text=`type ConfigPlugin<P> = (config: object, props: P) => object;
 interface Node { next: Node; label: string }
 interface Callback { (value: Node): Promise<Node>; (value: string): string; enabled?: boolean }
 export const unrelated: { mustNotBeARoot: Missing } = 0 as any;
 export const withExample: ConfigPlugin<{ callback: Callback }> = c => c;`;
 const input=fixture(text);input.pluginCandidates=[{id:'PLUGIN:example',name:'withExample',source:{path:'packages/a/index.ts',start:text.indexOf('withExample:')}}];
 const graph=indexSemanticSurface({...input,exportRoots:false,structuralTypeOperations:true});
 assert.deepEqual(graph.exports,[]);
 const options=type(graph,graph.plugins[0].optionsTypeId),callback=type(graph,options.properties.find(p=>p.name==='callback').typeId);
 assert.equal(callback.calls.length,2);assert.ok(callback.properties.some(p=>p.name==='enabled'));
 const node=type(graph,callback.calls[0].parameters[0].typeId);
 assert.equal(node.properties.find(p=>p.name==='next').typeId,node.id);
 assert.ok(!graph.types.some(t=>t.properties.some(p=>p.name==='mustNotBeARoot')));
 assert.equal(graph.exportRootsPolicy,'plugin-candidates-only');
});

test('structural generic mode retains tuple elements separately from alias type arguments',()=>{
 const text=`type ConfigPlugin<P> = (config: object, props: P) => object;
 type StaticPlugin<T = any> = [string | ConfigPlugin<T>, T];
 export const withExample: ConfigPlugin<StaticPlugin<number>[]> = c => c;`;
 const input=fixture(text);input.pluginCandidates=[{id:'PLUGIN:tuple',name:'withExample',source:{path:'packages/a/index.ts',start:text.indexOf('withExample:')}}];
 const graph=indexSemanticSurface({...input,structuralTypeOperations:true,exportRoots:false});
 const array=type(graph,graph.plugins[0].optionsTypeId),tuple=type(graph,array.arguments[0]);
 assert.equal(tuple.kind,'tuple');assert.equal(tuple.arguments.length,2);
 assert.equal(tuple.aliasTypeArguments.length,1);
 const first=type(graph,tuple.arguments[0]);assert.equal(first.kind,'union');
 const callback=first.constituents.map(id=>type(graph,id)).find(t=>t.calls.length);
 assert.equal(callback.calls.length,1);
 assert.equal(callback.calls[0].parameters[1].typeId,tuple.aliasTypeArguments[0]);
 assert.equal(tuple.arguments[1],tuple.aliasTypeArguments[0]);
 const bad=structuredClone(graph);type(bad,tuple.id).aliasTypeArguments=['TYPE:absent'];
 assert.ok(validateConsolidated(bad,graph).failures.some(f=>f.includes('Dangling type reference TYPE:absent')));
});
