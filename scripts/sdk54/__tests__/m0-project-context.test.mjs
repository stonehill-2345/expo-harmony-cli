import assert from 'node:assert/strict';
import test from 'node:test';
import { indexSemanticSurface } from '../m0-consolidated.mjs';
import { createProjectSourceContext, findDependencyProvenance, auditProjectSourceQueue, validateProjectContext } from '../m0-project-context.mjs';

const packages=[{id:'PKG:a',name:'a',sourcePath:'apps/a/package.json'}];
const files=new Map([
 ['apps/a/package.json','{"name":"a"}'],
 ['apps/a/tsconfig.json','{ // JSONC\n "compilerOptions":{"paths":{"@/*":["./*"]}} }'],
 ['apps/a/index.ts','import { title } from "@/local"; export const value = title;'],
 ['apps/a/local.ts','export const title: string = "local";'],
]);

test('transitive config source requires a unique dependency identity and records every declaring input',()=>{
 const identity={name:'config',version:'1.0.0',selector:'config@^1'};
 const configArchive={identity,archive:{sha256:'fixed'},files:new Map([['package.json','{"name":"config","version":"1.0.0"}'],['tsconfig.json','{"compilerOptions":{"strict":true}}']])};
 const input=new Map([...files,['apps/a/package.json','{"name":"a","devDependencies":{"tool":"*"}}'],['packages/tool/package.json','{"name":"tool","dependencies":{"config":"^1"}}'],['apps/a/tsconfig.json','{"extends":"config/tsconfig.json","compilerOptions":{"paths":{"@/*":["./*"]}}}']]);
 const pkgs=[...packages,{id:'PKG:tool',name:'tool',sourcePath:'packages/tool/package.json'}];
 const make=(sourceProvenance,locks=[identity])=>createProjectSourceContext({files:input,packages:pkgs,configArchives:[configArchive],locks,sourceProvenance});
 const r=make(true).resolve('@/local','apps/a/index.ts');assert.equal(r.path,'apps/a/local.ts');
 assert.ok(r.config.inputs.some(i=>i.path==='packages/tool/package.json'));
 assert.equal(r.config.sourceProvenance[0].selection,'unique-transitive-config-source');
 assert.equal(r.config.sourceProvenance[0].runtimeAcceptance,'NOT_VERIFIED');
 assert.equal(r.config.sourceProvenance[0].chain.length,2);
 assert.equal(make(false).resolve('@/local','apps/a/index.ts').status,'project-config-boundary');
 input.set('apps/a/package.json','{"name":"a","dependencies":{"config":"^2"},"devDependencies":{"tool":"*"}}');
 assert.equal(make(true).resolve('@/local','apps/a/index.ts').status,'project-config-boundary');
});

test('transitive config ambiguity includes reachable identities whose archives are absent',()=>{
 const one={name:'config',version:'1.0.0',selector:'config@^1'},two={name:'config',version:'2.0.0',selector:'config@^2'};
 const input=new Map([...files,['apps/a/package.json','{"name":"a","dependencies":{"one":"*","two":"*"}}'],['packages/one/package.json','{"name":"one","dependencies":{"config":"^1"}}'],['packages/two/package.json','{"name":"two","dependencies":{"config":"^2"}}'],['apps/a/tsconfig.json','{"extends":"config/tsconfig.json"}']]);
 const context=createProjectSourceContext({files:input,packages:[...packages,...['one','two'].map(name=>({name,sourcePath:`packages/${name}/package.json`}))],locks:[one,two],configArchives:[{identity:one,archive:{sha256:'fixed'},files:new Map([['package.json','{"name":"config","version":"1.0.0"}'],['tsconfig.json','{}']])}],sourceProvenance:true});
 assert.equal(context.resolve('@/local','apps/a/index.ts').status,'project-config-boundary');
});

test('project paths from fixed JSONC config resolve actual source before external lookup',()=>{
 const graph=indexSemanticSurface({files,packages,projectContext:true});
 const exported=graph.exports.find(e=>e.moduleId==='MODULE:apps/a/index.ts'&&e.name==='value');
 assert.equal(graph.types.find(t=>t.id===exported.typeId).display,'string');
 const dependency=graph.modules.find(m=>m.id==='MODULE:apps/a/index.ts').dependencies.find(d=>d.request==='@/local');
 assert.equal(dependency.resolution.selection,'fixed-tsconfig-paths');
 assert.equal(dependency.resolution.config.path,'apps/a/tsconfig.json');
 assert.equal(graph.stageClosable,false);
});

test('inherited paths retain the defining config directory and package config provenance',()=>{
 const input=new Map([...files,
  ['packages/config/package.json','{"name":"config"}'],
  ['packages/config/base.json','{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}'],
  ['packages/config/src/local.ts','export const title: number = 1;'],
  ['apps/a/tsconfig.json','{"extends":"config/base.json"}'],
 ]);
 const context=createProjectSourceContext({files:input,packages:[...packages,{name:'config',sourcePath:'packages/config/package.json'}]});
 const result=context.resolve('@/local','apps/a/index.ts');
 assert.equal(result.path,'packages/config/src/local.ts');
 assert.ok(result.config.inputs.some(i=>i.path==='packages/config/base.json'));
});

test('exact path mapping wins over wildcards and invalid configs do not borrow host files',()=>{
 const input=new Map([...files,['apps/a/tsconfig.json','{"compilerOptions":{"paths":{"@/*":["./wrong/*"],"@/local":["./local"]}}}']]);
 assert.equal(createProjectSourceContext({files:input,packages}).resolve('@/local','apps/a/index.ts').path,'apps/a/local.ts');
 for(const config of ['{"extends":"../../../etc/tsconfig.json"}','{"extends":"./missing.json"}','{"extends":"./tsconfig.json"}','{"compilerOptions":{"paths":{"@/*":true}}}']){
  const context=createProjectSourceContext({files:new Map([...input,['apps/a/tsconfig.json',config]]),packages});
  assert.equal(context.resolve('@/local','apps/a/index.ts').status,'project-config-boundary');
 }
});

test('resource identity, platform ambiguity and symlinks never masquerade as executable source',()=>{
 const input=new Map([...files,['apps/a/image.png','not loaded as a TS module'],['apps/a/local.native.ts','export const title=1'],['apps/a/link.ts','']]);
 input.delete('apps/a/local.ts');
 const entries=[...input.keys()].map(path=>({path,oid:'fixed-'+path,type:'blob',mode:path.endsWith('/link.ts')?'120000':'100644'}));
 const context=createProjectSourceContext({files:input,entries,packages});
 assert.equal(context.resolve('./image.png','apps/a/index.ts').status,'source-resource');
 assert.equal(context.resolve('@/local','apps/a/index.ts').status,'project-platform-boundary');
 assert.equal(context.resolve('./link','apps/a/index.ts').status,'unsafe-project-target');
 for(const request of ['/etc/passwd','../../../etc/passwd','x/../local','x\\local'])assert.notEqual(context.resolve(request,'apps/a/index.ts').status,'source');
});

test('dependency provenance follows exact nested edges and preserves multiple reachable versions',()=>{
 const input=new Map([...files,['apps/a/package.json','{"name":"a","dependencies":{"parent":"^1","second":"1"}}']]);
 const lock=(name,spec,version,dependencies={})=>({name,selector:`${name}@${spec}`,version,dependencies,optionalDependencies:{},source:{path:'yarn.lock',line:1}});
 const locks=[lock('parent','^1','1.1.0',{typed:'~1'}),lock('second','1','1.0.0',{typed:'2'}),lock('typed','~1','1.0.3'),lock('typed','2','2.0.0'),lock('typed','unused','9.0.0')];
 const found=findDependencyProvenance({name:'typed',manifestPath:'apps/a/package.json',files:input,packages,locks});
 assert.deepEqual(found.map(r=>r.identity.version).sort(),['1.0.3','2.0.0']);
 assert.ok(found.every(r=>r.chain.length===2&&r.chain[0].path==='apps/a/package.json'));
 assert.deepEqual(findDependencyProvenance({name:'unrelated',manifestPath:'apps/a/package.json',files:input,packages,locks}),[]);
});

test('dependency provenance filters root sections before traversal and candidate deduplication',()=>{
 const input=new Map([['apps/a/package.json','{"name":"a","dependencies":{"runtime":"1","second":"1"},"devDependencies":{"developer":"1"}}']]);
 const lock=(name,spec,version,dependencies={})=>({name,selector:`${name}@${spec}`,version,dependencies,source:{path:'yarn.lock',line:1}});
 const locks=[lock('runtime','1','1.0.0',{middle:'1'}),lock('middle','1','1.0.0',{typed:'1'}),lock('second','1','1.0.0',{typed:'2'}),lock('developer','1','1.0.0',{typed:'1'}),lock('typed','1','1.0.0'),lock('typed','2','2.0.0')];
 const options={name:'typed',manifestPath:'apps/a/package.json',files:input,packages,locks};
 const all=findDependencyProvenance(options),runtime=findDependencyProvenance({...options,rootSections:['dependencies','optionalDependencies']});
 assert.equal(all.length,2);assert.ok(all.some(candidate=>candidate.chain[0].pointer==='/devDependencies/developer'));
 assert.deepEqual(runtime.map(candidate=>candidate.identity.version),['1.0.0','2.0.0']);
 assert.ok(runtime.every(candidate=>candidate.chain[0].pointer.startsWith('/dependencies/')));
 assert.deepEqual(findDependencyProvenance({...options,rootSections:[]}),[]);
});

test('queue audit retains nested manifests, missing identities and all consumers for bidirectional checks',()=>{
 const input=new Map([...files,['package.json','{"name":"root"}'],['apps/a/nested/package.json','{"name":"nested","dependencies":{"typed":"1"}}'],['apps/a/nested/index.ts','import "typed";']]);
 const queue={groups:[{id:'SOURCE:typed',name:'typed',kind:'external',exactLockCandidates:[],consumers:[{sourcePath:'apps/a/nested/index.ts',request:'typed'}]},{id:'SOURCE:alias',name:'@/local',kind:'external',exactLockCandidates:[],consumers:[{sourcePath:'apps/a/index.ts',request:'@/local'}]}]};
 const result=auditProjectSourceQueue({queue,files:input,entries:[...input.keys()].map(path=>({path,type:'blob',mode:'100644'})),packages,locks:[]});
 assert.equal(result.groups[0].consumers[0].manifestPath,'apps/a/nested/package.json');
 assert.equal(result.groups[0].consumers[0].status,'BLOCKED_CONSUMER_IDENTITY');
 assert.equal(result.groups[1].consumers[0].status,'LOCAL_SOURCE_PROVENANCE');
 assert.equal(validateProjectContext(result,result).valid,true);
 for(const mutate of [a=>a.groups.pop(),a=>a.groups[0].consumers.push(a.groups[0].consumers[0]),a=>a.groups[1].consumers[0].source.sha256='fake',a=>a.stageClosable=true]){const a=structuredClone(result);mutate(a);assert.equal(validateProjectContext(a,result).valid,false);}
});

test('default semantic projection remains unchanged until project context is enabled',()=>{
 const graph=indexSemanticSurface({files,packages});
 const exported=graph.exports.find(e=>e.moduleId==='MODULE:apps/a/index.ts'&&e.name==='value');
 assert.equal(graph.types.find(t=>t.id===exported.typeId).display,'any');
 assert.equal(graph.projectContext,undefined);
});

test('project relative lookup preserves existing build-to-source and CommonJS forwarding projections',()=>{
 const input=new Map([...files,
  ['apps/a/index.ts','import { title } from "./build/local"; export const value=title;'],
  ['apps/a/src/local.ts','export const title: string="source";'],
  ['apps/a/build/local.d.ts','export const title: number;'],
  ['apps/a/wrapper.js','module.exports = require("./build/local");'],
 ]);
 const context=createProjectSourceContext({files:input,packages});
 assert.equal(context.resolve('./build/local','apps/a/index.ts').path,'apps/a/src/local.ts');
 const wrapper=context.resolve('./wrapper','apps/a/index.ts');
 assert.equal(wrapper.path,'apps/a/src/local.ts');
 assert.equal(wrapper.sourceWrappers[0].path,'apps/a/wrapper.js');
 const graph=indexSemanticSurface({files:input,packages,projectContext:true});
 const value=graph.exports.find(e=>e.moduleId==='MODULE:apps/a/index.ts'&&e.name==='value');
 assert.equal(graph.types.find(t=>t.id===value.typeId).display,'string');
});

test('intentional bundler failure requires its linked app and error expectation, and never means runtime support',()=>{
 const source='apps/router-e2e/__e2e__/04-server-error-boundaries/components/bundler-error-actions.tsx',app='apps/router-e2e/__e2e__/04-server-error-boundaries/app/index.tsx',testPath='packages/@expo/cli/e2e/playwright/dev/04-server-error-boundaries.test.ts';
 const input=new Map([['package.json','{"name":"root"}'],['apps/router-e2e/package.json','{"name":"router-e2e"}'],[source,'import "completely-missing"; export function actionThrowsBundlerErrorAsync() {}'],[app,'import {actionThrowsBundlerErrorAsync} from "../components/bundler-error-actions"; const id="button-bundler-error";'],[testPath,'test("catches server action bundling errors in master boundary",()=>{expect("button-bundler-error");expect("Syntax Error");});']]);
 const queue={groups:[{id:'SOURCE:missing',name:'completely-missing',kind:'external',exactLockCandidates:[],consumers:[{sourcePath:source,request:'completely-missing'}]}]};
 const audit=()=>auditProjectSourceQueue({queue,files:input,entries:[...input.keys()].map(path=>({path,type:'blob',mode:'100644'})),packages:[{id:'PKG:router',name:'router-e2e',sourcePath:'apps/router-e2e/package.json'}],locks:[]});
 const row=audit().groups[0].consumers[0];assert.equal(row.status,'EXPECTED_FAILURE_FIXTURE');assert.equal(row.resolution.execution,'NOT_RUN');
 input.delete(app);assert.equal(audit().groups[0].consumers[0].status,'BLOCKED_CONSUMER_IDENTITY');
});

test('workspace entry source projection follows TypeScript emit root instead of assuming src layout',()=>{
 const input=new Map([...files,
  ['packages/speech/package.json','{"name":"speech","main":"build/Speech.js","types":"build/Speech.d.ts"}'],
  ['packages/speech/tsconfig.json','{"compilerOptions":{"outDir":"./build"},"include":["./src"]}'],
  ['packages/speech/src/Speech/Speech.ts','export function speak(): string { return "speech"; }'],
  ['packages/speech/src/Speech/Types.ts','export interface Options { voice: string }'],
  ['apps/a/index.ts','import {speak} from "speech"; export const value=speak();'],
 ]);
 const pkgs=[...packages,{id:'PKG:speech',name:'speech',sourcePath:'packages/speech/package.json'}],context=createProjectSourceContext({files:input,packages:pkgs});
 const result=context.resolve('speech','apps/a/index.ts');
 assert.equal(result.path,'packages/speech/src/Speech/Speech.ts');
 assert.equal(result.selection,'fixed-tsconfig-emit-source');
 assert.equal(result.runtimeAcceptance,'NOT_VERIFIED');
 assert.equal(result.emitRootPolicy,'inferred-from-fixed-config-inputs');
 const graph=indexSemanticSurface({files:input,packages:pkgs,projectContext:true});
 const exported=graph.exports.find(e=>e.moduleId==='MODULE:apps/a/index.ts'&&e.name==='value');
 assert.equal(graph.types.find(t=>t.id===exported.typeId).display,'string');
 input.set('packages/speech/tsconfig.json','{"compilerOptions":{"outDir":"./build","rootDir":"./src"},"include":["./src"]}');
 assert.notEqual(createProjectSourceContext({files:input,packages:pkgs}).resolve('speech','apps/a/index.ts').status,'source');
});

test('missing project config preserves independent exact dependency provenance',()=>{
 const input=new Map([...files,['package.json','{"name":"root"}'],['apps/a/package.json','{"name":"a","dependencies":{"typed":"1"}}'],['apps/a/tsconfig.json','{"extends":"./missing.json"}']]);
 const queue={groups:[{id:'SOURCE:typed',name:'typed',kind:'external',exactLockCandidates:[],consumers:[{sourcePath:'apps/a/index.ts',request:'typed'}]}]},locks=[{name:'typed',selector:'typed@1',version:'1.0.0',dependencies:{},optionalDependencies:{},source:{path:'yarn.lock',line:1}}];
 const result=auditProjectSourceQueue({queue,files:input,entries:[...input.keys()].map(path=>({path,type:'blob',mode:'100644'})),packages,locks}).groups[0].consumers[0];
 assert.equal(result.status,'BLOCKED_PROJECT_CONFIG');
 assert.equal(result.resolution.lockProvenance[0].identity.selector,'typed@1');
 assert.equal(result.resolution.runtimeAcceptance,'NOT_VERIFIED');
});

test('missing project config retains separately verified declaration projection with an explicit context boundary',()=>{
 const input=new Map([...files,['apps/a/tsconfig.json','{"extends":"./missing.json"}'],['apps/a/index.ts','import {value} from "typed"; export const output=value;']]);
 const externalContext={files:new Map([['external/index.d.ts','export const value: string;']]),rootFiles:[],resolve:request=>request==='typed'?{status:'source',path:'external/index.d.ts',selection:'verified-test-declaration'}:{status:'unresolved'},resolveTypeReference:()=>({status:'unresolved'}),snapshot:()=>({runtimeAcceptance:'NOT_VERIFIED'})};
 const graph=indexSemanticSurface({files:input,packages,externalContext,projectContext:true});
 const exported=graph.exports.find(e=>e.moduleId==='MODULE:apps/a/index.ts'&&e.name==='output');
 assert.equal(graph.types.find(t=>t.id===exported.typeId).display,'string');
 const module=graph.modules.find(m=>m.id==='MODULE:apps/a/index.ts'),resolution=module.dependencies.find(d=>d.request==='typed').resolution;
 assert.equal(resolution.projectConfig.path,'apps/a/tsconfig.json');
 assert.ok(module.boundaries.includes('project-config-not-verified'));
 assert.equal(graph.projectContext.resolutions.find(r=>r.request==='typed').status,'project-config-boundary');
});

test('project baseUrl resolves sources without borrowing another workspace config',()=>{
 const input=new Map([...files,
  ['apps/a/tsconfig.json','{"compilerOptions":{"baseUrl":"."}}'],
  ['apps/a/index.ts','import { title } from "local"; export const value = title;'],
  ['apps/b/package.json','{"name":"b"}'],
  ['apps/b/index.ts','import { title } from "local"; export const value = title;'],
 ]);
 const graph=indexSemanticSurface({files:input,packages:[...packages,{id:'PKG:b',name:'b',sourcePath:'apps/b/package.json'}],projectContext:true});
 const value=file=>{const e=graph.exports.find(e=>e.moduleId===`MODULE:${file}`&&e.name==='value');return graph.types.find(t=>t.id===e.typeId).display;};
 assert.equal(value('apps/a/index.ts'),'string');
 assert.equal(value('apps/b/index.ts'),'any');
});

test('external config inheritance uses the declaring manifest exact lock and records archive provenance',()=>{
 const identity={name:'@tsconfig/node18',version:'18.2.2',selector:'@tsconfig/node18@^18.2.2',integrity:'fixed-integrity'};
 const configArchive={identity,archive:{sha256:'fixed-archive'},files:new Map([
  ['package.json',JSON.stringify({name:identity.name,version:identity.version})],
  ['tsconfig.json','{"compilerOptions":{"strict":true,"target":"es2022"}}'],
 ])};
 const input=new Map([...files,
  ['apps/a/package.json','{"name":"a","devDependencies":{"@tsconfig/node18":"^18.2.2"}}'],
  ['apps/a/tsconfig.json','{"extends":"@tsconfig/node18/tsconfig.json","compilerOptions":{"paths":{"@/*":["./*"]}}}'],
 ]);
 const make=(archives=[configArchive],locks=[identity])=>createProjectSourceContext({files:input,packages,configArchives:archives,locks});
 const result=make().resolve('@/local','apps/a/index.ts');
 assert.equal(result.path,'apps/a/local.ts');
 const inherited=result.config.inputs.find(i=>i.identity?.name===identity.name&&i.path.endsWith('/tsconfig.json'));
 assert.equal(inherited.archive.sha256,'fixed-archive');
 assert.ok(result.config.inputs.some(i=>i.path==='apps/a/package.json'));
 assert.equal(make().snapshot().projectTypecheckAcceptance,'NOT_VERIFIED');
 assert.equal(make([]).resolve('@/local','apps/a/index.ts').status,'project-config-boundary');
 assert.equal(make([configArchive],[{...identity,version:'18.3.0'}]).resolve('@/local','apps/a/index.ts').status,'project-config-boundary');
 input.set('apps/a/package.json','{"name":"a"}');
 assert.equal(make().resolve('@/local','apps/a/index.ts').status,'project-config-boundary');
});

test('directory aliases honor fixed package types/main before index and retain package provenance',()=>{
 const input=new Map([...files,
  ['apps/a/tsconfig.json','{"compilerOptions":{"paths":{"benchmarking":["../benchmarking"]}}}'],
  ['apps/benchmarking/package.json','{"name":"benchmarking","main":"src/index.ts"}'],
  ['apps/benchmarking/src/index.ts','export const title: number=1;'],
  ['apps/benchmarking/index.ts','export const title: string="wrong";'],
 ]);
 const entries=[...input.keys()].map(path=>({path,oid:'fixed-'+path,type:'blob',mode:'100644'}));
 const result=createProjectSourceContext({files:input,entries,packages}).resolve('benchmarking','apps/a/index.ts');
 assert.equal(result.path,'apps/benchmarking/src/index.ts');
 assert.equal(result.directoryManifest.path,'apps/benchmarking/package.json');
 input.set('apps/benchmarking/package.json','{"name":"benchmarking","main":"src/missing.ts"}');
 assert.equal(createProjectSourceContext({files:input,entries,packages}).resolve('benchmarking','apps/a/index.ts').path,'apps/benchmarking/index.ts');
});

test('template queue references bind raw parameters to fixed filenames without claiming instantiated source',()=>{
 const from='packages/expo-module-template-local/index.ts',target='packages/expo-module-template-local/src/{%- project.moduleName %}.ts';
 const input=new Map([['package.json','{"name":"root"}'],['packages/expo-module-template-local/package.json','{"name":"template"}'],[from,"export {default} from './src/<%- project.moduleName %>';"],[target,'export default {};']]);
 const queue={groups:[{id:'SOURCE:relative',kind:'relative',name:'.',exactLockCandidates:[],consumers:[{sourcePath:from,request:'./src/Template_moduleName______'}]}]};
 const audit=()=>auditProjectSourceQueue({queue,files:input,entries:[...input.keys()].map(path=>({path,oid:'fixed-'+path,type:'blob',mode:'100644'})),packages:[{id:'PKG:template',name:'template',sourcePath:'packages/expo-module-template-local/package.json'}],locks:[]});
 const row=audit().groups[0].consumers[0];
 assert.equal(row.status,'UNINSTANTIATED_TEMPLATE_REFERENCE');
 assert.deepEqual(row.resolution.parameters,['project.moduleName']);
 assert.equal(row.resolution.sourceCandidates[0].path,target);
 assert.equal(row.resolution.runtimeAcceptance,'NOT_VERIFIED');
 input.set(from,"export {default} from './src/plain';");
 assert.equal(audit().groups[0].consumers[0].status,'BLOCKED_RELATIVE_TARGET');
});
