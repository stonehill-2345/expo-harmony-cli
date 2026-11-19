import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { create as createTar } from 'tar';
import { indexSemanticSurface } from '../m0-consolidated.mjs';
import * as sourceContext from '../m0-source-context.mjs';
const { assertDeclarationEntry, verifyDeclarationPackage, createDeclarationContext, compareSemanticCandidates, planDeclarationArchives, readDeclarationArchive, loadPlannedDeclarationArchives }=sourceContext;

function archive(name,version,entries){const files=new Map(Object.entries({'package.json':JSON.stringify({name,version,types:'index.d.ts'}),...entries}));return {identity:{name,version,selector:`${name}@${version}`},files,archive:{sha256:createHash('sha256').update(name+version).digest('hex')}};}

function transitiveFixture(manifest={dependencies:{parent:'^1'}}){
 const fixed=(name,spec,version,dependencies={})=>({name,spec,version,selector:`${name}@${spec}`,dependencies,optionalDependencies:{},integrity:'sha512-'+Buffer.alloc(64,version.startsWith('1')?1:2).toString('base64'),resolved:`https://registry.yarnpkg.com/${name}/-/source-${version}.tgz#${(version.startsWith('1')?'a':'b').repeat(40)}`,source:{path:'yarn.lock',line:1}});
 const text=JSON.stringify({name:'wrapper',version:'1.0.0',types:'index.d.ts',...manifest},null,2)+'\n';
 const wrapper=archive('wrapper','1.0.0',{'package.json':text,'nested/inside.d.ts':'export { value } from "typed";','index.d.ts':'export * from "./nested/inside";'}),typed=archive('typed','1.0.3',{'index.d.ts':'export const value:1;'});
 const locks=[fixed('parent','^1','1.0.0',{typed:'~1'}),fixed('typed','~1','1.0.3')];typed.identity=locks[1];
 const from='__sdk54_external__/wrapper@1.0.0/nested/inside.d.ts';
 const make=(options={})=>createDeclarationContext({archives:[wrapper,typed],workspaceFiles:new Map(),packages:[],locks,sourceProvenance:true,transitiveSourceProvenance:true,...options});
 return {fixed,text,wrapper,typed,locks,from,make};
}

test('locked transitive archive sources are explicit and retain manifest lock chain and runtime boundary',()=>{
 const {text,wrapper,typed,from,make}=transitiveFixture(),context=make(),result=context.resolve('typed',from);
 assert.equal(result.status,'source');assert.equal(result.selection,'unique-locked-transitive-source');
 assert.deepEqual(result.identity,typed.identity);assert.equal(result.contextBoundary,'locked-transitive-source-not-installed');assert.equal(result.runtimeAcceptance,'NOT_VERIFIED');
 assert.deepEqual(result.selectionEvidence.manifest,{path:'__sdk54_external__/wrapper@1.0.0/package.json',sha256:createHash('sha256').update(text).digest('hex')});
 assert.deepEqual(result.selectionEvidence.candidates[0].identity,typed.identity);
 assert.deepEqual(result.selectionEvidence.candidates[0].chain.map(edge=>[edge.name,edge.spec]),[['parent','^1'],['typed','~1']]);
 assert.equal(result.selectionEvidence.candidates[0].chain[0].pointer,'/dependencies/parent');
 assert.equal(context.snapshot().transitiveSourceProvenance,'locked-v1');assert.equal(context.snapshot().runtimeAcceptance,'NOT_VERIFIED');
 assert.equal(make({transitiveSourceProvenance:false}).resolve('typed',from).status,'missing-declared-identity');
 assert.equal(make().resolve('typed','packages/unknown/index.ts').status,'missing-declared-identity');
 assert.equal(context.resolve('../index',from).selection,'archive-relative');
 assert.equal(context.resolve('wrapper',from).selection,'archive-self-reference');
 assert.equal(wrapper.files.get('package.json'),text);
});

test('locked transitive selection includes absent versions and rejects unrelated or altered archives',()=>{
 const {fixed,wrapper,typed,locks,from,make}=transitiveFixture({dependencies:{parent:'^1',other:'2'}});
 locks.push(fixed('other','2','2.0.0',{typed:'2'}),fixed('typed','2','2.0.0'));
 const ambiguous=make().resolve('typed',from);assert.equal(ambiguous.status,'ambiguous-transitive-source');assert.equal(ambiguous.selectionEvidence.candidates.length,2);
 assert.equal(ambiguous.contextBoundary,'locked-transitive-source-not-installed');assert.equal(ambiguous.runtimeAcceptance,'NOT_VERIFIED');
 for(const key of ['integrity','resolved']){
  const fixture=transitiveFixture();fixture.typed.identity={...fixture.typed.identity,[key]:'different'};
  const result=fixture.make().resolve('typed',fixture.from);assert.equal(result.status,'missing-exact-transitive-source');
 }
 const missing=make({archives:[wrapper]}).resolve('unrelated',from);assert.equal(missing.status,'missing-declared-identity');
 assert.equal(make({archives:[wrapper]}).resolve('typed',from).status,'ambiguous-transitive-source');
 assert.equal(typed.identity.version,'1.0.3');
});

test('short publisher development paths cannot conceal a second runtime transitive identity',()=>{
 const {fixed,wrapper,typed,locks,from,make}=transitiveFixture({dependencies:{parent:'^1',other:'2'},devDependencies:{developer:'1'}});
 locks[0].dependencies={middle:'1'};
 locks.push(fixed('middle','1','1.0.0',{typed:'~1'}),fixed('other','2','2.0.0',{typed:'2'}),fixed('developer','1','1.0.0',{typed:'~1'}),fixed('typed','2','2.0.0'));
 for(const archives of [[wrapper,typed],[wrapper]]){
  const result=make({archives}).resolve('typed',from);assert.equal(result.status,'ambiguous-transitive-source');assert.equal(result.selectionEvidence.candidates.length,2);
  assert.ok(result.selectionEvidence.candidates.every(candidate=>candidate.chain[0].pointer.startsWith('/dependencies/')));
 }
});

test('transitive sources preserve direct and peer priority and exclude publisher development paths',()=>{
 for(const declaration of [{dependencies:{parent:'^1',typed:'^9'}},{dependencies:{parent:'^1'},peerDependencies:{typed:'^9'}},{dependencies:{parent:'^1'},devDependencies:{typed:'^9'}}]){
  const {from,make}=transitiveFixture(declaration),result=make().resolve('typed',from);
  assert.notEqual(result.status,'source');assert.notEqual(result.selection,'unique-locked-transitive-source');
 }
 const {from,make}=transitiveFixture({devDependencies:{parent:'^1'}});
 assert.equal(make().resolve('typed',from).status,'missing-declared-identity');
 const fixture=transitiveFixture();fixture.wrapper.files.set('package.json',JSON.stringify({name:'wrapper',version:'1.0.0',dependencies:{absent:'^1'}}));
 assert.equal(fixture.make().resolve('typed',fixture.from).status,'missing-declared-identity');
 assert.throws(()=>fixture.make({sourceProvenance:false}),/Transitive sources require source-provenance/);
});

test('transitive type directives and missing declarations retain their own source boundary',()=>{
 const {wrapper,typed,locks,from,make}=transitiveFixture();typed.files.delete('index.d.ts');
 const result=make().resolve('typed',from);assert.equal(result.status,'unresolved-declaration-entry');assert.equal(result.contextBoundary,'locked-transitive-source-not-installed');
 const identity={...locks[1],name:'@types/custom',selector:'@types/custom@~1'},types=archive('@types/custom','1.0.3',{'index.d.ts':'declare const value:1;'});
 types.identity=identity;locks[0].dependencies={'@types/custom':'~1'};
 const context=make({archives:[wrapper,types],locks:[locks[0],identity]}),reference=context.resolveTypeReference('custom',from);
 assert.equal(reference.status,'source');assert.equal(reference.selection,'unique-locked-transitive-source');assert.equal(reference.contextBoundary,'locked-transitive-source-not-installed');
 assert.ok(context.snapshot().resolutions.some(r=>r.referenceKind==='type-directive'&&r.selectionEvidence));
});

test('transitive CLI sources require the explicit locked policy project scope and provenance',()=>{
 const args=['--source','fixed-git','--archives','verified','--output','graph.json.gz'],enabled=[...args,'--scope','project-sources','--context-selection','source-provenance','--transitive-sources','locked-v1'];
 assert.equal(sourceContext.parseSourceContextArgs(args)['--transitive-sources'],undefined);
 assert.equal(sourceContext.parseSourceContextArgs(enabled)['--transitive-sources'],'locked-v1');
 for(const value of ['true','locked','latest'])assert.throws(()=>sourceContext.parseSourceContextArgs([...enabled.slice(0,-1),value]),/Invalid transitive/);
 assert.throws(()=>sourceContext.parseSourceContextArgs([...args,'--transitive-sources','locked-v1']),/Transitive sources require/);
 assert.throws(()=>sourceContext.buildSourceContext({sourceDir:'absent',archiveDirectory:'absent',transitiveSourceProvenance:true}),/Transitive sources require/);
});

test('explicit typeRoots link exact ambient declaration evidence without loading a global root',()=>{
 const text='interface Shared { value:string }\ndeclare module "typed" { export interface Value extends Shared {} }\ndeclare module "typed/sub" { export const value:1; }\n';
 const files=new Map([['packages/a/package.json','{"name":"a","dependencies":{"typed":"1.0.0"}}'],['packages/a/tsconfig.json','{"compilerOptions":{"typeRoots":["../shared-types"]}}'],['packages/shared-types/custom/index.d.ts',text],['packages/b/package.json','{"name":"b","dependencies":{"typed":"1.0.0"}}']]);
 const pkgs=[...packages,{id:'PKG:b',name:'b',sourcePath:'packages/b/package.json'}];
 const make=(options={})=>createDeclarationContext({archives:[archive('typed','1.0.0',{})],workspaceFiles:files,packages:pkgs,sourceProvenance:true,declaredTypes:true,...options});
 const context=make(),resolved=context.resolve('typed','packages/a/index.ts'),evidence=resolved.typeRootContext;
 assert.equal(resolved.status,'unresolved-declaration-entry');assert.equal(evidence.status,'project-type-root-context');
 assert.equal(evidence.contextBoundary,'project-type-root-context-not-isolated');assert.equal(evidence.runtimeAcceptance,'NOT_VERIFIED');
 assert.equal(evidence.config.path,'packages/a/tsconfig.json');assert.equal(evidence.config.inputs[0].sha256,createHash('sha256').update(files.get('packages/a/tsconfig.json')).digest('hex'));
 const declaration=evidence.declarations[0];assert.equal(declaration.path,'packages/shared-types/custom/index.d.ts');assert.equal(declaration.sha256,createHash('sha256').update(text).digest('hex'));
 assert.equal(text.slice(declaration.start,declaration.end),'declare module "typed" { export interface Value extends Shared {} }');
 assert.equal(context.resolveTypeRootContext('typed/sub','packages/a/index.ts').declarations.length,1);
 assert.equal(context.resolveTypeRootContext('typed/other','packages/a/index.ts'),null);
 assert.equal(context.resolve('typed','packages/b/index.ts').typeRootContext,undefined);
 assert.deepEqual(context.rootFiles,[]);assert.equal(context.files.has(declaration.path),false);
 assert.equal(make({declaredTypes:false}).resolve('typed','packages/a/index.ts').typeRootContext,undefined);
 assert.equal(make({sourceProvenance:false}).resolve('typed','packages/a/index.ts').typeRootContext,undefined);
 assert.ok(context.snapshot().resolutions.some(r=>r.typeRootContext?.declarations[0].sha256===declaration.sha256));
});

test('typeRoots context respects inherited relative roots types opt out and safe exact modules',()=>{
 const base=new Map([['packages/a/package.json','{"name":"a"}'],['packages/a/tsconfig.json','{"extends":"../shared-config/base.json"}'],['packages/shared-config/base.json','{"compilerOptions":{"typeRoots":["../shared-types"]}}'],['packages/shared-types/custom/index.d.ts','/// <reference path="./nested.d.ts" />\ndeclare module "typed*" { export const wildcard:1; }'],['packages/shared-types/custom/nested.d.ts','declare module "typed" { export const value:1; }'],['packages/shared-types/augment/index.d.ts','export {}; declare module "typed" { export const leaked:1; }'],['outside/index.d.ts','declare module "typed" { export const leaked:1; }']]);
 const resolve=files=>createDeclarationContext({archives:[],workspaceFiles:files,packages,sourceProvenance:true,declaredTypes:true}).resolveTypeRootContext('typed','packages/a/index.ts');
 const result=resolve(base);assert.equal(result.declarations.length,1);assert.equal(result.declarations[0].path,'packages/shared-types/custom/nested.d.ts');
 assert.equal(result.config.inputs.length,2);
 for(const compilerOptions of [{typeRoots:[]},{typeRoots:['../shared-types'],types:[]},{typeRoots:['../shared-types'],types:['other']},{typeRoots:['/host/types']},{typeRoots:['../../../../host']}]){
  const files=new Map([...base,['packages/a/tsconfig.json',JSON.stringify({compilerOptions})]]);assert.equal(resolve(files),null);
 }
 const scoped=new Map([...base,['packages/a/tsconfig.json','{"compilerOptions":{"typeRoots":["../shared-types"],"types":["custom"]}}']]);assert.equal(resolve(scoped).declarations.length,1);
});

test('external module typeRoots still follow safe references without accepting augmentations',()=>{
 const files=new Map([['packages/a/package.json','{"name":"a"}'],['packages/a/tsconfig.json','{"compilerOptions":{"typeRoots":["../shared-types"],"types":["custom"]}}'],
  ['packages/shared-types/custom/index.d.ts','/// <reference path="./ambient.d.ts" />\nexport {}; declare module "typed" { export const augmentation:1; }'],
  ['packages/shared-types/custom/ambient.d.ts','declare module "typed" { export interface Value { value:string } }']]);
 const context=createDeclarationContext({archives:[],workspaceFiles:files,packages,sourceProvenance:true,declaredTypes:true});
 const evidence=context.resolveTypeRootContext('typed','packages/a/index.ts');
 assert.equal(evidence?.declarations.length,1);
 assert.equal(evidence.declarations[0].path,'packages/shared-types/custom/ambient.d.ts');
 assert.deepEqual(context.rootFiles,[]);
});

test('declared type archive plan follows fixed selectors and preserves original manifest provenance',()=>{
 const identity=(name,spec,dependencies={})=>({name,selector:`${name}@${spec}`,version:'1.0.0',dependencies,optionalDependencies:{},integrity:'sha512-'+Buffer.alloc(64,1).toString('base64'),resolved:`https://registry.yarnpkg.com/${name}/-/types-1.0.0.tgz#${'a'.repeat(40)}`});
 const a=identity('@types/typed','^1',{'@types/child':'*','helper':'^1'}),child=identity('@types/child','*'),helper=identity('helper','^1');
 const text='{\n "name":"a", "devDependencies":{"@types/typed":"^1","@types/missing":"^2"}\n}';
 const result=sourceContext.planDeclaredTypeArchives({archives:[],workspaceFiles:new Map([['packages/a/package.json',text]]),packages,locks:[a,child,helper]});
 assert.deepEqual(result.archives.map(a=>a.identity.name).sort(),['@types/child','@types/typed','helper']);
 assert.equal(result.roots.find(r=>r.name==='@types/typed').manifest.sha256,createHash('sha256').update(text).digest('hex'));
 assert.ok(result.edges.some(e=>e.from===a.selector&&e.selector===child.selector));
 assert.ok(result.blockers.some(b=>b.selector==='@types/missing@^2'&&b.status==='NO_EXACT_LOCK'));
 assert.throws(()=>sourceContext.planDeclaredTypeArchives({archives:[],workspaceFiles:new Map([['packages/a/package.json',text]]),packages,locks:[a,{...a,version:'2.0.0'}]}),/Duplicate.*selector/);
});

test('explicit declared types map runtime requests to separately declared exact type identities',()=>{
 const text='{\n"name":"a","dependencies":{"typed":"1.0.0"},"devDependencies":{"@types/typed":"1.0.0"}\n}';
 const input=new Map([['packages/a/package.json',text]]),runtime=archive('typed','1.0.0',{}),types=archive('@types/typed','1.0.0',{'index.d.ts':'export interface Value { title:string }','sub.d.ts':'export const sub:1;'});
 const make=declaredTypes=>createDeclarationContext({archives:[runtime,types],workspaceFiles:input,packages,declaredTypes,sourceProvenance:true});
 assert.equal(make(false).resolve('typed','packages/a/index.ts').status,'unresolved-declaration-entry');
 const context=make(true),r=context.resolve('typed','packages/a/index.ts');
 assert.equal(r.status,'source');assert.equal(r.identity.name,'@types/typed');assert.equal(r.runtimeIdentity.name,'typed');
 assert.equal(r.projection,'declared-runtime-to-types');assert.equal(r.runtimeAcceptance,'NOT_VERIFIED');
 assert.equal(r.declarationEvidence.manifest.sha256,createHash('sha256').update(text).digest('hex'));
 assert.equal(r.contextBoundary,'declared-types-not-project-verified');
 assert.ok(context.resolve('typed/sub','packages/a/index.ts').path.endsWith('/sub.d.ts'));
 assert.ok(context.snapshot().declaredTypes);
});

test('declared types prefer native declarations and reject undeclared or wrong exact identities',()=>{
 const runtime=archive('typed','1.0.0',{'index.d.ts':'export const native:1;'}),types=archive('@types/typed','1.0.0',{'index.d.ts':'export const fallback:2;'});
 const input=spec=>new Map([['packages/a/package.json',JSON.stringify({name:'a',dependencies:{typed:'1.0.0'},devDependencies:spec?{'@types/typed':spec}:{}})]]);
 const make=(spec,archives)=>createDeclarationContext({archives,workspaceFiles:input(spec),packages,declaredTypes:true});
 assert.equal(make('1.0.0',[runtime,types]).resolve('typed','packages/a/index.ts').identity.name,'typed');
 assert.notEqual(make(null,[types]).resolve('typed','packages/a/index.ts').status,'source');
 assert.notEqual(make('2.0.0',[types]).resolve('typed','packages/a/index.ts').status,'source');
 const scoped=archive('@types/scope__typed','1.0.0',{'index.d.ts':'export const value:1;'});
 const context=createDeclarationContext({archives:[scoped],workspaceFiles:new Map([['packages/a/package.json','{"name":"a","devDependencies":{"@types/scope__typed":"1.0.0"}}']]),packages,declaredTypes:true});
 assert.equal(context.resolve('@scope/typed','packages/a/index.ts').identity.name,'@types/scope__typed');
 assert.notEqual(context.resolve('@scope/typed/../../escape','packages/a/index.ts').status,'source');
});

test('declared types cannot bypass an explicitly disabled runtime export',()=>{
 const runtime=archive('typed','1.0.0',{'package.json':'{"name":"typed","version":"1.0.0","exports":{".":"./index.js","./blocked":null,"./allowed":"./allowed.js"}}'});
 const types=archive('@types/typed','1.0.0',{'index.d.ts':'export const value:1;','blocked.d.ts':'export const secret:1;','allowed.d.ts':'export const allowed:1;'});
 const input=new Map([['packages/a/package.json','{"name":"a","dependencies":{"typed":"1.0.0"},"devDependencies":{"@types/typed":"1.0.0"}}']]);
 const context=createDeclarationContext({archives:[runtime,types],workspaceFiles:input,packages,declaredTypes:true});
 assert.notEqual(context.resolve('typed/blocked','packages/a/index.ts').status,'source');
 assert.notEqual(context.resolve('typed/unlisted','packages/a/index.ts').status,'source');
 assert.equal(context.resolve('typed/allowed','packages/a/index.ts').status,'source');
});

test('CLI declared type archives are opt in and require full project source provenance',()=>{
 const args=['--source','fixed','--archives','base','--output','graph.gz'];
 assert.equal(sourceContext.parseSourceContextArgs(args)['--declared-types'],undefined);
 const extended=[...args,'--scope','project-sources','--context-selection','source-provenance','--declared-types','additional'];
 assert.equal(sourceContext.parseSourceContextArgs(extended)['--declared-types'],'additional');
 assert.throws(()=>sourceContext.parseSourceContextArgs([...args,'--declared-types','additional']),/declared types.*project-sources/i);
});

test('additional selectors reject invalid identity inputs and unsupported scopes before source access',()=>{
 const options={sourceDir:'must-not-read-additional-selectors',archiveDirectory:'unused',scope:'project-sources',sourceProvenance:true};
 for(const additionalSelectors of [null,{},'typed@1',[''],[' '],['typed@1','typed@1'],[{}],[1]]){
  assert.throws(()=>sourceContext.buildSourceContext({...options,additionalSelectors}),/Invalid additional selectors/);
 }
 for(const overrides of [{scope:'core'},{scope:'exact-sources'},{sourceProvenance:false}]){
  assert.throws(()=>sourceContext.buildSourceContext({...options,...overrides,additionalSelectors:['typed@1']}),/Additional selectors require project-sources.*source-provenance/);
 }
});

test('CLI additional selectors retain original file provenance and reject malformed input for checks',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sdk54-additional-selectors-')),file=path.join(dir,'selectors.json');
 const text='[\n "typed@1.0.0"\n]\n',args=['--source','fixed','--archives','base','--check','graph.gz','--scope','project-sources','--context-selection','source-provenance'];
 try{
  fs.writeFileSync(file,text);
  const parsed=sourceContext.parseSourceContextArgs([...args,'--additional-selectors',file]);
  assert.deepEqual(parsed.additionalSelectors,['typed@1.0.0']);assert.deepEqual(parsed.additionalSelectorInput,{path:file,sha256:createHash('sha256').update(text).digest('hex')});
  assert.equal(sourceContext.parseSourceContextArgs(args).additionalSelectors,undefined);
  assert.throws(()=>sourceContext.parseSourceContextArgs(['--source','fixed','--archives','base','--plan','plan.json','--additional-selectors',file]),/Additional selectors require project-sources.*source-provenance/);
  for(const content of ['{','{}','["typed@1","typed@1"]','[""]']){
   fs.writeFileSync(file,content);
   const result=spawnSync(process.execPath,['scripts/sdk54/m0-source-context.mjs',...args,'--additional-selectors',file],{encoding:'utf8'});
   assert.equal(result.status,1);assert.match(result.stderr,/SyntaxError|Invalid additional selectors/);assert.doesNotMatch(result.stderr,/Source revision|Git rev-parse/);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('additional archive merge rejects same version with conflicting fixed bytes',()=>{
 const a={identity:{name:'typed',version:'1.0.0',integrity:'sha512-fixed',resolved:'https://registry.npmjs.org/typed.tgz#'+'a'.repeat(40)},filename:'typed.tgz'};
 assert.deepEqual(sourceContext.additionalDeclarationArchives([a],[a],'extra'),[]);
 for(const identity of [{...a.identity,integrity:'sha512-other'},{...a.identity,resolved:'https://registry.npmjs.org/typed.tgz#'+'b'.repeat(40)}]){
  assert.throws(()=>sourceContext.additionalDeclarationArchives([a],[{...a,identity}],'extra'),/Conflicting.*identity/);
 }
 const b={...a,identity:{...a.identity,version:'2.0.0'},filename:'typed-2.tgz'};
 assert.equal(sourceContext.additionalDeclarationArchives([a],[b],'extra')[0].file,'extra/typed-2.tgz');
});

test('published declarations use peer source candidates without imposing publisher dev versions',()=>{
 const peer=archive('typed','2.1.0',{'index.d.ts':'export interface Value { title: string }'});
 const publisher=archive('publisher','1.0.0',{'package.json':'{"name":"publisher","version":"1.0.0","types":"index.d.ts","peerDependencies":{"typed":"^2"},"devDependencies":{"typed":"1.0.0"}}','index.d.ts':'export { Value } from "typed";'});
 const input=new Map([['packages/a/package.json','{"name":"a","dependencies":{"publisher":"1.0.0"}}']]);
 const make=sourceProvenance=>createDeclarationContext({archives:[publisher,peer],workspaceFiles:input,packages,sourceProvenance});
 const context=make(true),root=context.resolve('publisher','packages/a/index.ts'),r=context.resolve('typed',root.path);
 assert.equal(r.status,'source');assert.equal(r.identity.version,'2.1.0');assert.equal(r.selection,'unique-peer-source-projection');
 assert.equal(r.contextBoundary,'peer-source-projection-not-installed');assert.equal(r.runtimeAcceptance,'NOT_VERIFIED');
 assert.deepEqual(r.selectionEvidence.candidates.map(c=>c.version),['2.1.0']);
 assert.equal(r.selectionEvidence.declarations[0].section,'peerDependencies');
 assert.equal(make(false).resolve('typed',root.path).status,'missing-exact-archive');
});

test('peer source projection rejects ambiguity invalid ranges and undeclared imports',()=>{
 const input=new Map([['packages/a/package.json','{"name":"a","peerDependencies":{"typed":"^2"}}']]);
 const a=archive('typed','2.1.0',{'index.d.ts':'export const value:1;'}),b=archive('typed','2.2.0',{'index.d.ts':'export const value:2;'});
 const resolve=(files,archives)=>createDeclarationContext({archives,workspaceFiles:files,packages,sourceProvenance:true}).resolve('typed','packages/a/index.ts');
 const ambiguous=resolve(input,[a,b]);assert.equal(ambiguous.status,'ambiguous-peer-source');assert.equal(ambiguous.selectionEvidence.candidates.length,2);
 for(const spec of ['file:../typed','npm:other@2','^3']){const r=resolve(new Map([['packages/a/package.json',JSON.stringify({name:'a',peerDependencies:{typed:spec}})]]),[a]);assert.notEqual(r.status,'source');}
 assert.notEqual(resolve(new Map([['packages/a/package.json','{"name":"a"}']]),[a]).status,'source');
});

test('direct exact dependency never borrows a compatible peer or publisher development archive',()=>{
 const input=new Map([['packages/a/package.json','{"name":"a","dependencies":{"typed":"^1"},"peerDependencies":{"typed":"*"},"devDependencies":{"typed":"2.1.0"}}']]);
 const a=archive('typed','2.1.0',{'index.d.ts':'export const value:1;'});
 const r=createDeclarationContext({archives:[a],workspaceFiles:input,packages,sourceProvenance:true}).resolve('typed','packages/a/index.ts');
 assert.equal(r.status,'missing-exact-archive');
});

test('peer selection provenance hashes the original manifest bytes including formatting',()=>{
 const text='{\n  "name": "a", "peerDependencies": {"typed": "^2"}\n}\n';
 const input=new Map([['packages/a/package.json',text]]),a=archive('typed','2.1.0',{'index.d.ts':'export const value:1;'});
 const r=createDeclarationContext({archives:[a],workspaceFiles:input,packages,sourceProvenance:true}).resolve('typed','packages/a/index.ts');
 assert.equal(r.selectionEvidence.manifest.sha256,createHash('sha256').update(text).digest('hex'));
});

test('a selected peer without a declaration entry retains its candidate evidence and boundary',()=>{
 const input=new Map([['packages/a/package.json','{"name":"a","peerDependencies":{"typed":"^2"}}']]);
 const a=archive('typed','2.1.0',{});
 const r=createDeclarationContext({archives:[a],workspaceFiles:input,packages,sourceProvenance:true}).resolve('typed','packages/a/index.ts');
 assert.equal(r.status,'unresolved-declaration-entry');assert.equal(r.selection,'unique-peer-source-projection');
 assert.equal(r.contextBoundary,'peer-source-projection-not-installed');assert.equal(r.runtimeAcceptance,'NOT_VERIFIED');
 assert.equal(r.selectionEvidence.candidates[0].version,'2.1.0');
});

test('peer type directives preserve and snapshot the same selection evidence as imports',()=>{
 const input=new Map([['packages/a/package.json','{"name":"a","peerDependencies":{"@types/custom":"^2"}}']]);
 const a=archive('@types/custom','2.1.0',{'index.d.ts':'declare const value:1;'});
 const context=createDeclarationContext({archives:[a],workspaceFiles:input,packages,sourceProvenance:true});
 const r=context.resolveTypeReference('custom','packages/a/index.ts');
 assert.equal(r.status,'source');assert.equal(r.contextBoundary,'peer-source-projection-not-installed');
 assert.equal(r.selectionEvidence.candidates[0].version,'2.1.0');
 assert.ok(context.snapshot().resolutions.some(r=>r.referenceKind==='type-directive'&&r.selectionEvidence));
});

test('source CLI context selection is explicit and rejects unknown policies',()=>{
 const args=['--source','fixed-git','--archives','verified','--output','graph.json.gz'];
 assert.equal(sourceContext.parseSourceContextArgs(args)['--context-selection'],'exact');
 assert.equal(sourceContext.parseSourceContextArgs([...args,'--context-selection','source-provenance'])['--context-selection'],'source-provenance');
 assert.throws(()=>sourceContext.parseSourceContextArgs([...args,'--context-selection','highest']),/Invalid/);
});
const workspaceFiles=new Map([['packages/a/package.json','{"name":"a","dependencies":{"typed":"1.0.0"}}'],['packages/a/index.ts','import { make } from "typed"; export const value = make();']]);
const packages=[{id:'PKG:a',name:'a',sourcePath:'packages/a/package.json'}];

test('source CLI type operations default to legacy and accept only explicit structural mode',()=>{
 const args=['--source','fixed-git','--archives','verified-archives','--output','graph.json.gz'];
 const legacy=sourceContext.parseSourceContextArgs(args);
 assert.equal(legacy['--type-operations'],'legacy');
 const structural=sourceContext.parseSourceContextArgs([...args,'--type-operations','structural']);
 assert.equal(structural['--type-operations'],'structural');
 assert.equal(structural['--output'],'graph.json.gz');
 assert.equal(sourceContext.parseSourceContextArgs([...args,'--type-operations','legacy'])['--type-operations'],'legacy');
});

test('source CLI rejects invalid, repeated and missing type operation values before source access',()=>{
 const args=['--source','fixed-git','--archives','verified-archives','--output','graph.json.gz'];
 for(const value of ['true','false','STRUCTURAL',''])assert.throws(()=>sourceContext.parseSourceContextArgs([...args,'--type-operations',value]),/Invalid/);
 assert.throws(()=>sourceContext.parseSourceContextArgs([...args,'--type-operations']),/Invalid/);
 assert.throws(()=>sourceContext.parseSourceContextArgs([...args,'--type-operations','structural','--type-operations','legacy']),/Invalid/);
 assert.throws(()=>sourceContext.parseSourceContextArgs([...args,'--typo','structural']),/Invalid/);
});

test('archive paths support actual package/types roots and reject links traversal and duplicates',()=>{
 for(const root of ['package','react','node']){const seen=new Set();assertDeclarationEntry({path:`${root}/index.d.ts`,type:'File',size:10},seen,root);assert.throws(()=>assertDeclarationEntry({path:`${root}/../bad`,type:'File',size:1},seen,root),/Unsafe/);}
 for(const entry of [{path:'/abs',type:'File',size:1},{path:'package/x',type:'SymbolicLink',size:0},{path:'package/x',type:'File',size:100000000}])assert.throws(()=>assertDeclarationEntry(entry,new Set(),'package'),/Unsafe|limit/);
 const seen=new Set();assertDeclarationEntry({path:'package/a',type:'File',size:1},seen,'package');assert.throws(()=>assertDeclarationEntry({path:'package/a',type:'File',size:1},seen,'package'),/Duplicate/);
});
test('archive package identity is exact and manifest content is not rewritten',()=>{
 const a=archive('typed','1.0.0',{'index.d.ts':'export const value: string;'});assert.equal(verifyDeclarationPackage(a).name,'typed');
 a.files.set('package.json','{"name":"other","version":"1.0.0"}');assert.throws(()=>verifyDeclarationPackage(a),/identity/);
});
test('declared package and relative declaration source resolve without host dependencies',()=>{
 const a=archive('typed','1.0.0',{'index.d.ts':'export { make } from "./sub";','sub.d.ts':'export function make(): { nested: { enabled: boolean } };'});
 const context=createDeclarationContext({archives:[a],workspaceFiles,packages});const r=context.resolve('typed','packages/a/index.ts');assert.equal(r.status,'source');assert.ok(r.path.endsWith('/index.d.ts'));
 assert.ok(context.resolve('./sub',r.path).path.endsWith('/sub.d.ts'));assert.notEqual(context.resolve('missing','packages/a/index.ts').status,'source');
 const result=indexSemanticSurface({files:workspaceFiles,packages,externalContext:context});const root=result.exports.find(e=>e.name==='value'),type=result.types.find(t=>t.id===root.typeId);assert.ok(type.properties.some(p=>p.name==='nested'));
 assert.ok(result.types.some(t=>t.declarations.some(d=>d.origin==='verified-external-declaration')));
});
test('different exact versions select by consumer manifest, no highest-version shortcut',()=>{
 const a=archive('typed','1.0.0',{'index.d.ts':'export const value: 1;'}),b=archive('typed','2.0.0',{'index.d.ts':'export const value: 2;'});
 const files=new Map([...workspaceFiles,['packages/b/package.json','{"name":"b","dependencies":{"typed":"2.0.0"}}']]),pkgs=[...packages,{id:'PKG:b',name:'b',sourcePath:'packages/b/package.json'}];
 const context=createDeclarationContext({archives:[a,b],workspaceFiles:files,packages:pkgs});
 assert.equal(context.resolve('typed','packages/a/index.ts').identity.version,'1.0.0');assert.equal(context.resolve('typed','packages/b/index.ts').identity.version,'2.0.0');
 assert.notEqual(context.resolve('typed','packages/unknown/index.ts').status,'source');
});
test('React declaration projection preserves @types identity and does not claim runtime equivalence',()=>{
 const types=archive('@types/react','19.1.10',{'index.d.ts':'export interface Props { title: string }'});
 const files=new Map([['packages/a/package.json','{"name":"a","devDependencies":{"@types/react":"~19.1.10"},"dependencies":{"react":"19.1.0"}}']]);
 types.identity.selector='@types/react@~19.1.10';const context=createDeclarationContext({archives:[types],workspaceFiles:files,packages});
 const r=context.resolve('react','packages/a/index.ts');assert.equal(r.identity.name,'@types/react');assert.equal(r.projection,'react-runtime-to-declaration');assert.equal(r.runtimeAcceptance,'NOT_VERIFIED');
 assert.equal(JSON.parse(types.files.get('package.json')).name,'@types/react');
});
test('typesVersions uses compiler version and exports restrictions do not fall back to arbitrary files',()=>{
 const a=archive('typed','1.0.0',{'package.json':'{"name":"typed","version":"1.0.0","types":"index.d.ts","typesVersions":{"<=5.6":{"* ":["old/*"]}}}', 'index.d.ts':'export const current: 1;','old/index.d.ts':'export const old:1;'});
 const c=createDeclarationContext({archives:[a],workspaceFiles,packages});assert.ok(c.resolve('typed','packages/a/index.ts').path.endsWith('/index.d.ts'));assert.notEqual(c.resolve('typed/../../escape','packages/a/index.ts').status,'source');
});

test('safe parent-relative paths resolve but escape and explicitly blocked exports do not',()=>{
 const a=archive('typed','1.0.0',{'package.json':'{"name":"typed","version":"1.0.0","types":"index.d.ts","exports":{".":"./index.js","./blocked":null}}','index.d.ts':'export const value:1;','base.d.ts':'export const base:1;','nested/inside.d.ts':'export * from "../base";','blocked.d.ts':'export const secret:1;'});
 const context=createDeclarationContext({archives:[a],workspaceFiles,packages}),root=context.resolve('typed','packages/a/index.ts').path;
 const inside=root.replace('index.d.ts','nested/inside.d.ts');assert.ok(context.resolve('../base',inside).path?.endsWith('/base.d.ts'));
 assert.notEqual(context.resolve('../../../escape',inside).status,'source');assert.notEqual(context.resolve('typed/blocked','packages/a/index.ts').status,'source');
 const v=archive('typed','1.0.0',{'package.json':'{"name":"typed","version":"1.0.0","types":"index.d.ts","typesVersions":{">=5.9":{"*":["new/*"]}}}','index.d.ts':'export const old:1;','new/index.d.ts':'export const current:1;'});
 assert.ok(createDeclarationContext({archives:[v],workspaceFiles,packages}).resolve('typed','packages/a/index.ts').path.endsWith('/new/index.d.ts'));
});
test('candidate comparison uses stable candidate IDs and preserves changed or excluded states',()=>{
 const before={inferences:[{id:'a',status:'EVALUATED_WITH_BOUNDARY'},{id:'b',status:'EXCLUDED_CONTEXT'}],plugins:[{id:'p',status:'EVALUATED'}]};
 const after={inferences:[{id:'a',status:'EVALUATED'},{id:'b',status:'EXCLUDED_CONTEXT'}],plugins:[{id:'p',status:'EVALUATED_WITH_BOUNDARY'}]};
 const r=compareSemanticCandidates(before,after);assert.equal(r.inferences.length,2);assert.equal(r.inferences[0].after,'EVALUATED');assert.equal(r.plugins[0].after,'EVALUATED_WITH_BOUNDARY');
 assert.throws(()=>compareSemanticCandidates(before,{inferences:[],plugins:[]}),/Missing/);
});

test('external type-reference hook preserves original relative ambient references',()=>{
 const ambient='declare module "local-ambient" { export class Child extends Missing {} }';
 const files=new Map([...workspaceFiles,['packages/a/index.ts','/// <reference types="./ambient" />\nexport const value = 1;'],['packages/a/ambient.d.ts',ambient]]);
 const inferredCandidates=[{id:'GAP:ambient-child',source:{path:'packages/a/ambient.d.ts',start:ambient.indexOf('export class'),line:1}}];
 const before=indexSemanticSurface({files,packages,inferredCandidates});assert.notEqual(before.inferences[0].status,'EXCLUDED_CONTEXT');
 const context=createDeclarationContext({archives:[],workspaceFiles:files,packages});
 const after=indexSemanticSurface({files,packages,inferredCandidates,externalContext:context});assert.equal(after.inferences[0].status,before.inferences[0].status);
});

test('Node builtins require the verified Node global root and remain missing when it is absent',()=>{
 const empty=createDeclarationContext({archives:[],workspaceFiles,packages});assert.equal(empty.resolve('node:fs','packages/a/index.ts').status,'missing-exact-archive');
 const a=archive('@types/node','22.14.0',{'index.d.ts':'declare module "node:fs" { export function readFileSync(path: string): string; }'});
 const context=createDeclarationContext({archives:[a],workspaceFiles,packages});assert.equal(context.rootFiles.length,1);
 const files=new Map([...workspaceFiles,['packages/a/index.ts','import {readFileSync} from "node:fs"; export const value = readFileSync("x");']]);
 const r=indexSemanticSurface({files,packages,externalContext:context}),value=r.exports.find(e=>e.name==='value');assert.equal(r.types.find(t=>t.id===value.typeId).display,'string');
});

test('Node ambient identities cover bare builtins and reject invented node prefixes',()=>{
 const node=archive('@types/node','22.14.0',{'index.d.ts':'declare module "fs" { export const version: 22; } declare module "node:fs" { export * from "fs"; }'});
 const context=createDeclarationContext({archives:[node],workspaceFiles,packages});
 assert.equal(context.resolve('fs','packages/a/index.ts').status,'node-global-context');
 assert.equal(context.resolve('node:fs','packages/a/index.ts').status,'node-global-context');
 assert.notEqual(context.resolve('node:invented','packages/a/index.ts').status,'node-global-context');
 assert.notEqual(context.resolve('fs/promises','packages/a/index.ts').status,'node-global-context');
});

test('verified archives resolve self references without declaring a dependency on themselves',()=>{
 const a=archive('typed','1.0.0',{'index.d.ts':'export const root:1;','nested.d.ts':'export { root } from "typed";'});
 const context=createDeclarationContext({archives:[a],workspaceFiles,packages}),root=context.resolve('typed','packages/a/index.ts').path;
 const self=context.resolve('typed',root.replace('index.d.ts','nested.d.ts'));
 assert.equal(self.status,'source');assert.equal(self.identity.version,'1.0.0');assert.equal(self.selection,'archive-self-reference');
});

test('type references select consumer exact lock identity and never the first available version',()=>{
 const a=archive('@types/custom','1.0.0',{'index.d.ts':'declare const old:1;'}),b=archive('@types/custom','2.0.0',{'index.d.ts':'declare const current:2;'});
 const files=new Map([['packages/a/package.json','{"name":"a","devDependencies":{"@types/custom":"2.0.0"}}']]);
 const context=createDeclarationContext({archives:[a,b],workspaceFiles:files,packages});
 assert.equal(context.resolveTypeReference('custom','packages/a/index.ts').identity.version,'2.0.0');
 assert.notEqual(context.resolveTypeReference('custom','packages/missing/index.ts').status,'source');
});

test('source queue plans all exact identities, merges aliases and retains unsupported integrity blockers',()=>{
 const lock=(selector,name,version,integrity='sha512-'+Buffer.alloc(64,1).toString('base64'))=>({selector,name,version,integrity,resolved:`https://registry.yarnpkg.com/${name}/-/x.tgz#${'a'.repeat(40)}`});
 const a=lock('typed@^1','typed','1.0.0'),alias={...a,selector:'typed@~1.0'},old=lock('old@1','old','1','sha1-legacy');
 const locks=[a,alias,old],queue={graphSha256:'fixed',groups:[{id:'g',name:'typed',exactLockCandidates:[a,alias]},{id:'old',name:'old',exactLockCandidates:[old]},{id:'missing',name:'missing',exactLockCandidates:[]}]};
 const plan=planDeclarationArchives({selectors:[],locks,queue,baselineHash:'fixed'});
 assert.equal(plan.archives.length,1);assert.deepEqual(plan.archives[0].selectors,['typed@^1','typed@~1.0']);
 assert.equal(plan.blockers.length,2);assert.ok(plan.blockers.some(b=>b.status==='UNSUPPORTED_INTEGRITY'));assert.ok(plan.blockers.some(b=>b.status==='NO_EXACT_LOCK'));
 assert.throws(()=>planDeclarationArchives({selectors:[],locks,queue,baselineHash:'wrong'}),/baseline/);
 const changed=structuredClone(queue);changed.groups[0].exactLockCandidates[0].version='2.0.0';assert.throws(()=>planDeclarationArchives({selectors:[],locks,queue:changed,baselineHash:'fixed'}),/lock identity/);
});

function packedFixture(root,duplicate=false,name='ejs',version='3.1.10'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sdk54-declaration-'));
 fs.mkdirSync(path.join(dir,root));fs.writeFileSync(path.join(dir,root,'package.json'),JSON.stringify({name,version,types:'index.d.ts'}));fs.writeFileSync(path.join(dir,root,'index.d.ts'),'export const value:1;');
 const file=path.join(dir,'archive.tgz');createTar({cwd:dir,file,gzip:true,sync:true},[root+'/package.json',root+'/index.d.ts',...(duplicate?[root+'/index.d.ts']:[])]);
 const bytes=fs.readFileSync(file),identity={name,version,selector:`${name}@${version}`,integrity:'sha512-'+createHash('sha512').update(bytes).digest('base64'),resolved:`https://registry.npmjs.org/${name}/-/archive.tgz#`+createHash('sha1').update(bytes).digest('hex')};
 return {dir,file,identity};
}

test('DefinitelyTyped legacy roots require the locked package name and exact major minor version',()=>{
 for(const [root,name,version,accepted]of [['mime v1.3','@types/mime','1.3.2',true],['mime v1.2','@types/mime','1.3.2',false],['other v1.3','@types/mime','1.3.2',false],['mime v1.3','mime','1.3.2',false]]){
  const a=packedFixture(root,false,name,version);try{
   if(accepted)assert.equal(readDeclarationArchive(a.file,a.identity).archive.root,root);
   else assert.throws(()=>readDeclarationArchive(a.file,a.identity),/Unsafe archive root/);
  }finally{fs.rmSync(a.dir,{recursive:true,force:true});}
 }
 const duplicate=packedFixture('mime v1.3',true,'@types/mime','1.3.2');try{assert.throws(()=>readDeclarationArchive(duplicate.file,duplicate.identity),/Duplicate/);}finally{fs.rmSync(duplicate.dir,{recursive:true,force:true});}
});

test('versioned archive roots are validated against the exact package identity',()=>{
 const a=packedFixture('ejs-v3.1.10');try{assert.equal(readDeclarationArchive(a.file,a.identity).archive.root,'ejs-v3.1.10');}finally{fs.rmSync(a.dir,{recursive:true,force:true});}
 const b=packedFixture('unrelated-v3.1.10');try{assert.throws(()=>readDeclarationArchive(b.file,b.identity),/Unsafe archive root/);}finally{fs.rmSync(b.dir,{recursive:true,force:true});}
});

test('structural archive rejection remains an explicit blocker while bad integrity aborts the batch',()=>{
 const a=packedFixture('package',true);try{
   const result=loadPlannedDeclarationArchives([a]);assert.equal(result.loaded.length,0);assert.equal(result.availability[0].status,'REJECTED_ARCHIVE');assert.match(result.availability[0].reason,/Duplicate/);
   const bytes=fs.readFileSync(a.file);bytes[20]^=1;fs.writeFileSync(a.file,bytes);assert.throws(()=>loadPlannedDeclarationArchives([a]),/integrity/);
 }finally{fs.rmSync(a.dir,{recursive:true,force:true});}
});

test('config JSON archive loading is explicit and preserves declaration-only defaults',()=>{
 const a=packedFixture('package');try{
  fs.writeFileSync(path.join(a.dir,'package','tsconfig.json'),'{"compilerOptions":{"strict":true}}');
  createTar({cwd:a.dir,file:a.file,gzip:true,sync:true},['package/package.json','package/index.d.ts','package/tsconfig.json']);
  const bytes=fs.readFileSync(a.file);a.identity.integrity='sha512-'+createHash('sha512').update(bytes).digest('base64');a.identity.resolved='https://registry.npmjs.org/ejs/-/ejs-3.1.10.tgz#'+createHash('sha1').update(bytes).digest('hex');
  assert.equal(readDeclarationArchive(a.file,a.identity).files.has('tsconfig.json'),false);
  assert.equal(readDeclarationArchive(a.file,a.identity,{includeConfigJson:true}).files.get('tsconfig.json'),'{"compilerOptions":{"strict":true}}');
 }finally{fs.rmSync(a.dir,{recursive:true,force:true});}
});

test('recursive external generic applications preserve definitions and arguments in a finite graph',()=>{
 const a=archive('typed','1.0.0',{'index.d.ts':'export interface Tree<T> { value: T; left: Tree<[T,1]>; right: Tree<[T,2]>; } export const tree: Tree<string>;'});
 const files=new Map([...workspaceFiles,['packages/a/index.ts','import {tree} from "typed"; export const value=tree;']]);
 const context=createDeclarationContext({archives:[a],workspaceFiles:files,packages});
 const graph=indexSemanticSurface({files,packages,externalContext:context,symbolicGenerics:true,maxTypes:200});
 const exported=graph.exports.find(e=>e.name==='value'),application=graph.types.find(t=>t.id===exported.typeId);
 assert.equal(application.kind,'generic-application');assert.ok(application.genericDefinitionTypeId);assert.equal(application.arguments.length,1);
 const definition=graph.types.find(t=>t.id===application.genericDefinitionTypeId);assert.ok(definition.properties.some(p=>p.name==='left'));assert.ok(definition.properties.some(p=>p.name==='right'));
 assert.ok(graph.types.filter(t=>t.kind==='generic-application').every(t=>t.genericDefinitionTypeId&&t.declarations.some(d=>d.origin==='verified-external-declaration')));
 assert.ok(graph.types.length<100);assert.equal(graph.stageClosable,false);
});

test('generic source and library aliases keep the same finite definition relationship',()=>{
 const text='export interface Tree<T> { left: Tree<[T,1]>; right: Tree<[T,2]>; } export const value = null as unknown as Tree<string>; export type Output<T extends (...args:any[])=>any> = ReturnType<T>;';
 const files=new Map([...workspaceFiles,['packages/a/index.ts',text]]);
 const graph=indexSemanticSurface({files,packages,symbolicGenerics:true,maxTypes:200});
 assert.ok(graph.types.some(t=>t.kind==='generic-application'&&t.genericDefinitionTypeId));assert.ok(graph.types.length<100);
});

test('declaration instance budgets retain explicit sourced boundaries and representative references',()=>{
 const files=new Map([...workspaceFiles,['packages/a/index.ts','interface Item<T> { value: T } export type Items = [Item<1>,Item<2>,Item<3>,Item<4>];']]);
 const graph=indexSemanticSurface({files,packages,declarationInstanceLimit:2,maxTypes:100});
 const bounded=graph.types.filter(t=>t.kind==='declaration-instantiation-boundary');assert.ok(bounded.length);
 for(const t of bounded){assert.ok(t.declarations.length);assert.ok(t.sourceFamilyRepresentativeTypeId);assert.ok(t.hasTransitiveBoundary);assert.ok(t.boundaries.includes('declaration-instantiation-detail-budget'));}
 assert.equal(graph.publicSurfaceComplete,false);assert.equal(graph.stageClosable,false);
});
