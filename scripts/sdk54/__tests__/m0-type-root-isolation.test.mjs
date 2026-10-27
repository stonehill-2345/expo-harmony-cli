import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createDeclarationContext } from '../m0-source-context.mjs';
import { createProjectSourceContext } from '../m0-project-context.mjs';
import { semanticTypeReferences } from '../m0-consolidated.mjs';
const implementation=await import('../m0-type-root-isolation.mjs').catch(()=>({}));
const hash=text=>createHash('sha256').update(text).digest('hex');

function fixture(){
 const files=new Map(),packages=[],uses=[],resolutions=[];
 for(const [name,property] of [['a','left'],['b','right']]){
  const base=`packages/${name}`,text='import { Value } from "typed"; export const value: Value = {} as Value;';
  files.set(base+'/package.json',JSON.stringify({name}));packages.push({id:'PKG:'+name,name,sourcePath:base+'/package.json'});
  files.set(base+'/index.ts',text);files.set(base+'/tsconfig.json',JSON.stringify({extends:'./base.json'}));
  files.set(base+'/base.json',JSON.stringify({compilerOptions:{strict:true,typeRoots:['./types'],types:['custom']}}));
  files.set(base+'/types/custom/index.d.ts','/// <reference path="./nested.d.ts" />\ninterface Shared { inherited: number }\ndeclare module "typed" { export interface Value extends Shared { '+property+': string; child: Nested } }');
  files.set(base+'/types/custom/nested.d.ts','interface Nested { active:boolean }');
  files.set(base+'/types/unused/index.d.ts','declare const unwanted:number;');
  const source={path:base+'/index.ts',start:text.indexOf('Value ='),end:text.indexOf('Value =')+5};
  uses.push({id:'USE:'+name,source,resolutionKey:base+'/index.ts\0typed',request:'typed',evidenceKind:'bound-import-symbol-use'});
 }
 const declarationContext=createDeclarationContext({archives:[],workspaceFiles:files,packages,sourceProvenance:true,declaredTypes:true});
 const project=createProjectSourceContext({files,packages});
 for(const use of uses){const from=use.source.path;project.resolve('typed',from);const evidence=declarationContext.resolveTypeRootContext('typed',from);resolutions.push({id:'RESOLUTION:'+from,key:use.resolutionKey,from,request:'typed',observations:[{observer:'fixture',resolution:{status:'unresolved',typeRootContext:evidence}}]});}
 return {files,projectContext:project.snapshot(),surface:{source:{revision:'fixture'},inputs:[...files].map(([path,text])=>({path,sha256:hash(text)})),resolutions,uses}};
}

function sourceFixture({explicit=true,version='22.0.0',spec='^22',archives=null}={}){
 const input=fixture(),packages=['a','b'].map(name=>({id:'PKG:'+name,name,sourcePath:`packages/${name}/package.json`}));
 for(const name of ['a','b'])input.files.set(`packages/${name}/package.json`,JSON.stringify({name,dependencies:{'@types/node':spec,helper:'^1'}}));
 const root='packages/a/types/custom/index.d.ts',text=(explicit?'/// <reference types="node" />\n':'')+'declare module "typed" { export interface Value extends Buffer { stat:import("node:fs").Stats; dependency:import("helper").Helper; left:string } }';
 input.files.set(root,text);
 input.files.set('packages/a/index.ts',input.files.get('packages/a/index.ts')+' export type NodeStat=import("node:fs").Stats;');
 const declaration=input.surface.resolutions[0].observations[0].resolution.typeRootContext.declarations[0];
 Object.assign(declaration,{sha256:hash(text),start:text.indexOf('declare module'),end:text.length});
 const archive=(name,version,selector,source)=>({identity:{name,version,selector},archive:{sha256:'fixture'},files:new Map([['package.json',JSON.stringify({name,version,types:'index.d.ts'})],['index.d.ts',source]])});
 const loaded=archives??[archive('@types/node',version,'@types/node@'+spec,'interface Buffer { nodeVersion'+version.split('.')[0]+':number } declare module "node:fs" { export interface Stats { size:number } }'),archive('helper','1.0.0','helper@^1','export interface Helper { helperProperty:boolean }')];
 const sourceContext=createDeclarationContext({archives:loaded,workspaceFiles:input.files,packages,sourceProvenance:true,declaredTypes:true,transitiveSourceProvenance:true});
 for(const [file,text]of sourceContext.files)input.files.set(file,text);
 input.surface.packages=packages;input.surface.inputs=[...input.files].map(([path,text])=>({path,sha256:hash(text)}));
 return {...input,sourceContext,policy:'consumer-v2'};
}

test('consumer-v2 loads explicit fixed declarations with inherited globals and builtin module types',()=>{
 const input=sourceFixture(),result=implementation.buildTypeRootIsolation(input),context=result.contexts[0];
 assert.equal(result.policy,'consumer-v2');
 const value=context.graph.types.find(row=>row.id===context.references[0].typeId);
 assert.ok(value.properties.some(row=>row.name==='nodeVersion22'));
 const stat=context.graph.types.find(row=>row.id===value.properties.find(row=>row.name==='stat').typeId);
 assert.ok(stat.properties.some(row=>row.name==='size'));
 const dependency=context.graph.types.find(row=>row.id===value.properties.find(row=>row.name==='dependency').typeId);
 assert.ok(dependency.properties.some(row=>row.name==='helperProperty'));
 assert.ok(context.programInputs.some(row=>row.path.includes('@types+node@22.0.0/index.d.ts')));
 assert.ok(!context.diagnostics.some(row=>[2307,2688].includes(row.code)));
 assert.deepEqual(context.sourceResolutions,context.graph.consumerProjection.sourceResolutions);
 const source=context.sourceResolutions.find(row=>row.kind==='type-directive'&&row.request==='node');
 assert.equal(source.result.status,'source');assert.equal(source.input.sha256,hash(input.files.get(source.selectedPath)));
 assert.ok(context.sourceResolutions.some(row=>row.request==='node:fs'&&row.result.status==='node-global-context'&&row.selectedPath===null));
 assert.ok(context.boundaries.includes('consumer-declaration-source-not-installed'));
 assert.deepEqual(implementation.buildTypeRootIsolation(input),result);
 const ids=new Set(context.graph.types.map(row=>row.id));assert.ok(context.graph.types.every(row=>semanticTypeReferences(row).every(id=>ids.has(id))));
});

test('consumer-v2 does not add Node automatic roots and isolates consumer programs',()=>{
 const input=sourceFixture({explicit:false}),context=implementation.buildTypeRootIsolation(input).contexts[0];
 assert.ok(!context.programInputs.some(row=>row.path.includes('@types+node')));
 assert.ok(context.diagnostics.some(row=>row.code===2307&&row.message.includes('node:fs')));
 const explicit=implementation.buildTypeRootIsolation(sourceFixture());
 assert.ok(!explicit.contexts[1].programInputs.some(row=>row.path.includes('@types+node')));
 const older=implementation.buildTypeRootIsolation(sourceFixture({version:'20.0.0',spec:'^20'})).contexts[0];
 const value=older.graph.types.find(row=>row.id===older.references[0].typeId);
 assert.ok(value.properties.some(row=>row.name==='nodeVersion20'));assert.ok(!value.properties.some(row=>row.name==='nodeVersion22'));
});

test('consumer-v2 preserves missing and ambiguous declaration identities as native loading diagnostics',()=>{
 for(const status of ['missing-exact-archive','ambiguous-archive']){
  const input=sourceFixture(),original=input.sourceContext;
  input.sourceContext={resolve:original.resolve,resolveTypeReference:()=>({status}),snapshot:original.snapshot};
  const context=implementation.buildTypeRootIsolation(input).contexts[0];
  assert.ok(context.diagnostics.some(row=>row.code===2688&&row.origin==='program-file-processing'));
  assert.ok(context.sourceResolutions.some(row=>row.kind==='type-directive'&&row.result.status===status&&row.selectedPath===null));
  assert.ok(!context.programInputs.some(row=>row.path.includes('@types+node')));
 }
});

test('consumer-v2 keeps fixed missing-lock and ambiguous archive failures without borrowing another loaded identity',()=>{
 const archive=(version,selector)=>({identity:{name:'@types/node',version,selector},archive:{sha256:'fixture'},files:new Map([['package.json',JSON.stringify({name:'@types/node',version,types:'index.d.ts'})],['index.d.ts','interface Buffer { exactVersion'+version.split('.')[0]+':number } declare module "node:fs" { export interface Stats { size:number } }']])});
 for(const archives of [[archive('22.0.0','@types/node@^22')],[archive('22.0.0','@types/node@^99'),archive('20.0.0','@types/node@^99')]]){
  const input=sourceFixture({spec:'^99',archives}),context=implementation.buildTypeRootIsolation(input).contexts[0];
  assert.ok(context.diagnostics.some(row=>row.code===2688));
  assert.ok(!context.programInputs.some(row=>row.path.includes('@types+node')));
  assert.ok(context.sourceResolutions.some(row=>row.kind==='type-directive'&&row.request==='node'&&row.result.status==='unresolved'));
 }
 const bad='__sdk54_external__/helper@1.0.0/index.d.ts';
 const helper={identity:{name:'helper',version:'1.0.0',selector:'helper@^1'},archive:{sha256:'fixture'},files:new Map([['package.json',JSON.stringify({name:'helper',version:'1.0.0',types:'index.d.ts',dependencies:{'@types/node':'^99'}})],['index.d.ts','/// <reference types="node" />\nexport interface Helper { helperProperty:boolean }']])};
 const input=sourceFixture({archives:[archive('22.0.0','@types/node@^22'),helper]});
 const context=implementation.buildTypeRootIsolation(input).contexts[0];
 assert.ok(context.programInputs.some(row=>row.path.includes('@types+node')));
 assert.ok(context.diagnostics.some(row=>row.code===2688&&row.source?.path===bad));
 assert.ok(context.sourceResolutions.some(row=>row.from===bad&&row.kind==='type-directive'&&row.request==='node'&&row.result.status==='unresolved'));
});

test('consumer-v2 rejects missing resolver interfaces and unsafe or forged declaration source provenance',()=>{
 assert.throws(()=>implementation.buildTypeRootIsolation({...fixture(),policy:'consumer-v2'}),/source.context|resolver/i);
 assert.throws(()=>implementation.buildTypeRootIsolation({...fixture(),policy:'unknown'}),/policy/i);
 for(const bad of ['../escape.d.ts','/outside.d.ts','not-in-inputs.d.ts','bad-hash']){
  const input=sourceFixture(),original=input.sourceContext,target=[...original.files.keys()].find(row=>row.endsWith('/index.d.ts'));
  input.sourceContext={resolve:original.resolve,resolveTypeReference:()=>({status:'source',path:bad==='bad-hash'?target:bad}),snapshot:()=>({...original.snapshot(),files:original.snapshot().files.map(row=>bad==='bad-hash'&&row.path===target?{...row,sha256:'0'.repeat(64)}:row)})};
  assert.throws(()=>implementation.buildTypeRootIsolation(input),/provenance|hash|unsafe|fixed/i);
 }
});

test('consumer-v1 ignores source context and preserves the original serialized result',()=>{
 const input=fixture(),before=JSON.stringify(implementation.buildTypeRootIsolation(input));
 const sourceContext={resolve(){throw new Error('v1 must not resolve');},resolveTypeReference(){throw new Error('v1 must not resolve');},snapshot(){throw new Error('v1 must not snapshot');}};
 assert.equal(JSON.stringify(implementation.buildTypeRootIsolation({...input,policy:'consumer-v1',sourceContext})),before);
});

test('consumer builder binds conflicting ambient modules in fresh config programs and retains complete declarations',()=>{
 assert.equal(typeof implementation.buildTypeRootIsolation,'function');
 const input=fixture(),result=implementation.buildTypeRootIsolation(input);
 assert.equal(result.policy,'consumer-v1');assert.equal(result.contexts.length,2);assert.equal(result.summary.bindingVerified,2);
 for(const [index,name] of ['a','b'].entries()){
  const context=result.contexts[index],reference=context.references[0],root=context.graph.types.find(row=>row.id===reference.typeId);
  assert.equal(reference.status,'BINDING_VERIFIED');assert.deepEqual(reference.source,input.surface.uses[index].source);
  assert.ok(reference.symbolDeclarations.some(row=>row.path===`packages/${name}/types/custom/index.d.ts`));
  assert.ok(root.properties.some(row=>row.name===(name==='a'?'left':'right')));assert.ok(!root.properties.some(row=>row.name===(name==='a'?'right':'left')));
  assert.ok(root.properties.some(row=>row.name==='inherited'));assert.ok(context.programInputs.some(row=>row.path.endsWith('/nested.d.ts')));
  assert.ok(!context.programInputs.some(row=>row.path.includes(`/packages/${name==='a'?'b':'a'}/`)));
  assert.ok(!context.programInputs.some(row=>row.path.endsWith('/unused/index.d.ts')));
  const ids=new Set(context.graph.types.map(row=>row.id));assert.ok(context.graph.types.every(row=>semanticTypeReferences(row).every(id=>ids.has(id))));
 }
 assert.deepEqual(implementation.buildTypeRootIsolation(input),result);
});

test('consumer builder rejects forged input hashes provenance declarations config and duplicate USE ids',()=>{
 assert.equal(typeof implementation.buildTypeRootIsolation,'function');
 for(const mutate of [input=>input.surface.inputs[0].sha256='0'.repeat(64),input=>input.surface.inputs=[],input=>input.surface.resolutions[0].observations[0].resolution.typeRootContext.declarations[0].sha256='0'.repeat(64),input=>input.surface.resolutions[0].observations[0].resolution.typeRootContext.declarations[0].start++,input=>input.projectContext.configs[0].options.types=[],input=>input.surface.uses.push(input.surface.uses[0])]){
  const input=fixture();mutate(input);assert.throws(()=>implementation.buildTypeRootIsolation(input),/hash|provenance|declaration|config|Duplicate/i);
 }
});

test('consumer builder rejects type root evidence disabled by types opt out',()=>{
 assert.equal(typeof implementation.buildTypeRootIsolation,'function');
 const input=fixture(),config='packages/a/base.json';input.files.set(config,JSON.stringify({compilerOptions:{typeRoots:['./types'],types:[]}}));
 for(const row of input.surface.inputs)if(row.path===config)row.sha256=hash(input.files.get(config));
 const project=createProjectSourceContext({files:input.files,packages:[]});project.resolve('typed','packages/a/index.ts');
 input.projectContext.configs[0]=project.snapshot().configs[0];
 input.surface.resolutions[0].observations[0].resolution.typeRootContext.config.inputs=input.projectContext.configs[0].inputs;
 assert.throws(()=>implementation.buildTypeRootIsolation(input),/authoriz|type.root|declaration/i);
});

test('consumer exact symbol targets cover namespaces import types shorthand and export aliases',()=>{
 const input=fixture(),file='packages/a/index.ts';
 const text='import { value, Value } from "typed"; import * as typed from "typed"; import Alias = typed.Inner; export { value }; export const object={ value }; export type A=typed.Value; export type B=import("typed").Value; export type C=typeof Alias; export const bad:number="wrong";';
 const declaration='interface Shared { inherited:number } declare module "typed" { export interface Value extends Shared { left:string } export const value:any; export namespace Inner { export const nested:boolean } }';
 input.files.set(file,text);input.files.set('packages/a/types/custom/index.d.ts',declaration);
 for(const row of input.surface.inputs)if(input.files.has(row.path))row.sha256=hash(input.files.get(row.path));
 const evidence=input.surface.resolutions[0].observations[0].resolution.typeRootContext;
 const start=declaration.indexOf('declare module');evidence.declarations=[{path:'packages/a/types/custom/index.d.ts',sha256:hash(declaration),start,end:declaration.length}];
 const positions=[['export',text.indexOf('value };')],['shorthand',text.indexOf('value };',text.indexOf('object='))],['namespace',text.indexOf('typed.Value')],['member',text.indexOf('typed.Value')+6],['import-type',text.indexOf('"typed").Value')],['alias',text.indexOf('Alias;',text.indexOf('type C='))]];
 input.surface.uses=input.surface.uses.filter(row=>row.id!=='USE:a');
 for(const [name,start] of positions){const size=name==='import-type'?7:name==='namespace'?5:name==='alias'?5:5;input.surface.uses.push({id:'USE:'+name,request:'typed',resolutionKey:file+'\0typed',source:{path:file,start,end:start+size}});}
 input.surface.uses.push({...input.surface.uses.find(row=>row.id==='USE:member'),id:'USE:duplicate-position'});
 const result=implementation.buildTypeRootIsolation(input),context=result.contexts[0];
 assert.equal(context.references.length,7);assert.ok(context.references.every(row=>row.status==='BINDING_VERIFIED'),JSON.stringify(context.references));
 const any=context.references.find(row=>row.id==='USE:shorthand');assert.ok(any.boundaries.includes('unconstrained-any'));
 assert.ok(context.diagnostics.some(row=>row.code===2322));assert.ok(context.boundaries.includes('isolated-program-diagnostic'));
 assert.equal(context.references.find(row=>row.id==='USE:member').typeId,context.references.find(row=>row.id==='USE:duplicate-position').typeId);
});

test('consumer projection exposes exact range failures',()=>{
 const input=fixture(),use=input.surface.uses[0];
 input.surface.uses.push({...use,id:'USE:bad-range',source:{...use.source,end:use.source.end-1}});
 const context=implementation.buildTypeRootIsolation(input).contexts[0];
 assert.equal(context.references.find(row=>row.id==='USE:bad-range').status,'RANGE_UNMATCHED');
 assert.ok(context.references.find(row=>row.id==='USE:bad-range').boundaries.includes('exact-reference-range-unmatched'));
});

test('consumer automatic type selection accepts explicit d.mts and d.cts package entries',()=>{
 for(const extension of ['mts','cts']){
  const input=fixture(),root='packages/a/types/custom/',old=root+'index.d.ts',target=root+'index.d.'+extension;
  input.files.set(target,input.files.get(old));input.files.delete(old);input.files.set(root+'package.json',JSON.stringify({types:'index.d.'+extension}));
  input.surface.inputs=input.surface.inputs.filter(row=>row.path!==old);
  for(const file of [target,root+'package.json'])input.surface.inputs.push({path:file,sha256:hash(input.files.get(file))});
  input.surface.resolutions[0].observations[0].resolution.typeRootContext.declarations[0].path=target;
  const result=implementation.buildTypeRootIsolation(input),context=result.contexts[0];
  assert.equal(context.selectedTypeRoots[0].path,target);assert.equal(context.references[0].status,'BINDING_VERIFIED');
 }
});

test('consumer preserves explicit triple slash types references under authorized roots',()=>{
 const input=fixture(),root='packages/a/types/custom/index.d.ts';
 const text='/// <reference types="sibling" />\ndeclare module "typed" { export interface Value extends Sibling { left:string } }';
 input.files.set(root,text);input.files.set('packages/a/types/sibling/index.d.ts','interface Sibling { inheritedFromSibling: number }');
 for(const row of input.surface.inputs)if(row.path===root)row.sha256=hash(text);
 input.surface.inputs.push({path:'packages/a/types/sibling/index.d.ts',sha256:hash(input.files.get('packages/a/types/sibling/index.d.ts'))});
 const declaration=input.surface.resolutions[0].observations[0].resolution.typeRootContext.declarations[0];declaration.sha256=hash(text);declaration.start=text.indexOf('declare module');declaration.end=text.length;
 const context=implementation.buildTypeRootIsolation(input).contexts[0],type=context.graph.types.find(row=>row.id===context.references[0].typeId);
 assert.ok(context.programInputs.some(row=>row.path==='packages/a/types/sibling/index.d.ts'));
 assert.ok(type.properties.some(row=>row.name==='inheritedFromSibling'));
 assert.ok(!context.diagnostics.some(row=>row.code===2688));
});

test('consumer reports missing explicit type directives even when skipLibCheck hides compiler diagnostics',()=>{
 const input=fixture(),root='packages/a/types/custom/index.d.ts';
 const text='/// <reference types="missing-dependency" />\ndeclare module "typed" { export interface Value extends MissingBase { left:string } }';
 input.files.set(root,text);for(const row of input.surface.inputs)if(row.path===root)row.sha256=hash(text);
 const declaration=input.surface.resolutions[0].observations[0].resolution.typeRootContext.declarations[0];declaration.sha256=hash(text);declaration.start=text.indexOf('declare module');declaration.end=text.length;
 const context=implementation.buildTypeRootIsolation(input).contexts[0];
 assert.equal(context.references[0].status,'BINDING_VERIFIED');
 assert.ok(context.diagnostics.some(row=>row.code===2688&&row.source?.path===root));
 assert.ok(context.boundaries.includes('isolated-program-diagnostic'));
 assert.ok(context.references[0].boundaries.includes('unresolved-explicit-type-directive'));
});

for(const [directive,code] of [['types="missing-dependency"',2688],['path="./missing-base.d.ts"',6053],['lib="nonexistent-sdk54-lib"',2726]]){
 test('consumer retains native loading diagnostics under skipLibCheck for '+directive,()=>{
  const input=fixture(),root='packages/a/types/custom/index.d.ts';
  const text=`/// <reference ${directive} />\ndeclare module "typed" { export interface Value { left:string } }`;
  input.files.set(root,text);for(const row of input.surface.inputs)if(row.path===root)row.sha256=hash(text);
  const declaration=input.surface.resolutions[0].observations[0].resolution.typeRootContext.declarations[0];declaration.sha256=hash(text);declaration.start=text.indexOf('declare module');declaration.end=text.length;
  const context=implementation.buildTypeRootIsolation(input).contexts[0],diagnostic=context.diagnostics.find(row=>row.code===code&&row.source?.path===root);
  assert.ok(diagnostic,`Missing native ${code} for ${directive}`);assert.equal(diagnostic.origin,'program-file-processing');
  assert.equal(context.references[0].status,'BINDING_VERIFIED');
  assert.ok(context.references[0].boundaries.includes('unresolved-declaration-input'));
  assert.ok(context.boundaries.includes('isolated-program-diagnostic'));
 });
}

test('consumer reconstructs workspace package config extending a scoped config archive',()=>{
 const input=fixture(),identity={name:'@tsconfig/base',version:'1.0.0',selector:'@tsconfig/base@^1'};
 const archive={identity,archive:{sha256:'fixture-archive'},files:new Map([['package.json',JSON.stringify({name:identity.name,version:identity.version})],['tsconfig.json','{"compilerOptions":{"strict":true,"target":"es2022"}}']])};
 input.files.set('packages/a/tsconfig.json','{"extends":"@fixture/config/tsconfig.json","compilerOptions":{"typeRoots":["./types"],"types":["custom"]}}');
 input.files.set('packages/config/package.json','{"name":"@fixture/config","devDependencies":{"@tsconfig/base":"^1"}}');
 input.files.set('packages/config/tsconfig.json','{"extends":"@tsconfig/base/tsconfig.json"}');
 const packages=[{id:'PKG:a',name:'a',sourcePath:'packages/a/package.json'},{id:'PKG:b',name:'b',sourcePath:'packages/b/package.json'},{id:'PKG:config',name:'@fixture/config',sourcePath:'packages/config/package.json'}];
 const project=createProjectSourceContext({files:input.files,packages,configArchives:[archive],locks:[identity]});project.resolve('typed','packages/a/index.ts');
 const config=project.snapshot().configs[0];assert.deepEqual(config.errors,[]);
 for(const [file,text] of archive.files)input.files.set('__sdk54_config__/@tsconfig+base@1.0.0/'+file,text);
 input.projectContext.configs[0]=config;input.surface.resolutions[0].observations[0].resolution.typeRootContext.config={path:config.path,inputs:config.inputs};
 input.surface.packages=packages;input.surface.inputs=[...input.files].map(([path,text])=>({path,sha256:hash(text)}));
 const context=implementation.buildTypeRootIsolation(input).contexts[0];assert.equal(context.references[0].status,'BINDING_VERIFIED');
 assert.ok(context.config.inputs.some(row=>row.path.startsWith('__sdk54_config__/')));
});
