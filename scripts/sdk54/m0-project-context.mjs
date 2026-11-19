import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';
import { buildSourceInventory, readSourceTree, readSourceBlobs, prefetchSourceBlobs, serializeInventory } from './source-inventory.mjs';
import { selectWorkspaceSources } from './workspace-surface.mjs';
import { createWorkspaceResolver } from './workspace-export-graph.mjs';
import { parseFixedYarnLock } from './external-sources.mjs';
import { readDeclarationArchive, verifyDeclarationPackage } from './m0-archive.mjs';

const virtual='/__sdk54_project__/',hash=value=>createHash('sha256').update(value).digest('hex');
const code=file=>/\.[cm]?[jt]sx?$/.test(file);
const queuePath='outputs/sdk54/ai-e2e/20261022-m0-consolidated/remaining-source-batches.json';
const queueHash='8049ee3da9461ced82fba66893d7cffd79c2256b54dbd45e251ec093fbf150a7';
const fixtureTest='packages/@expo/cli/e2e/playwright/dev/04-server-error-boundaries.test.ts';
const fixtureApp='apps/router-e2e/__e2e__/04-server-error-boundaries/app/index.tsx';
const sections=['dependencies','optionalDependencies','peerDependencies','devDependencies'];
export const serializeProjectContext=value=>serializeInventory(value).replaceAll('/','\\/');

export function createProjectSourceContext({files,packages,entries=[...files.keys()].map(path=>({path,type:'blob',mode:'100644'})),configArchives=[],locks=[],sourceProvenance=false}){
 const tree=new Map(entries.map(e=>[e.path,e])),configs=new Map(),records=new Map();
 const configFiles=new Map(files),archiveInputs=new Map(),selectionManifests=new Map(),units=[];
 for(const loaded of configArchives){
  const manifest=verifyDeclarationPackage(loaded),identity=locks.find(l=>l.selector===loaded.identity.selector);
  if(!identity||serializeInventory(identity)!==serializeInventory(loaded.identity))continue;
  const directory='__sdk54_config__/'+identity.name.replaceAll('/','+')+'@'+identity.version;
  if(units.some(u=>u.directory===directory))throw new Error(`Duplicate config archive ${directory}`);
  units.push({directory,manifest,identity});
  for(const [file,text]of loaded.files)if(file.endsWith('.json')){
   if(file.startsWith('/')||file.includes('\\')||file.split('/').some(p=>['','.','..'].includes(p)))throw new Error('Unsafe config archive file');
   const target=directory+'/'+file;if(configFiles.has(target)||tree.has(target))throw new Error(`Config archive collision ${target}`);
   configFiles.set(target,String(text));archiveInputs.set(target,{identity,archive:loaded.archive});
  }
 }
 const manifests=[...configFiles.keys()].filter(p=>p==='package.json'||p.endsWith('/package.json')).sort((a,b)=>b.length-a.length);
 const workspace=createWorkspaceResolver({files,packages});
 const roots=packages.map(p=>({...p,directory:path.posix.dirname(p.sourcePath)})).sort((a,b)=>b.directory.length-a.directory.length);
 const directories=new Set(),children=new Map();
 const child=(directory,kind,name)=>{if(!children.has(directory))children.set(directory,{files:new Set(),directories:new Set()});children.get(directory)[kind].add(name);};
 for(const file of new Set([...tree.keys(),...archiveInputs.keys()])){child(path.posix.dirname(file),'files',path.posix.basename(file));let dir=path.posix.dirname(file);while(dir!=='.'){directories.add(dir);child(path.posix.dirname(dir),'directories',path.posix.basename(dir));dir=path.posix.dirname(dir);}}
 const valid=file=>tree.get(file)?.type==='blob'&&tree.get(file)?.mode!=='120000';
 const validConfig=file=>archiveInputs.has(file)||valid(file);
 const provenanceCache=new Map();
 const decode=(file,onSelection=null)=>{
  if(!file.startsWith(virtual))return null;
  const logical=path.posix.normalize(file.slice(virtual.length));if(logical.startsWith('../')||logical.includes('\\'))return null;
  if(tree.has(logical)||archiveInputs.has(logical))return logical;
  const marker='/node_modules/',index=logical.lastIndexOf(marker);
  if(index<0)return logical;
  const request=logical.slice(index+marker.length),pkg=roots.find(p=>request===p.name||request.startsWith(p.name+'/'));
  if(pkg)return pkg.directory+request.slice(pkg.name.length);
  const parent=logical.slice(0,index),manifestPath=manifests.find(p=>p==='package.json'||parent===path.posix.dirname(p)||parent.startsWith(path.posix.dirname(p)+'/'));
  if(!manifestPath||!validConfig(manifestPath))return null;
  const manifest=JSON.parse(String(configFiles.get(manifestPath)));
  let candidates=units.filter(u=>(request===u.identity.name||request.startsWith(u.identity.name+'/'))&&sections.some(s=>u.identity.selector===u.identity.name+'@'+manifest[s]?.[u.identity.name]));
  let selection=null;
  const name=request.startsWith('@')?request.split('/').slice(0,2).join('/'):request.split('/')[0];
  if(sourceProvenance&&!candidates.length&&!sections.some(s=>manifest[s]?.[name]!==undefined)){
   const key=manifestPath+'\0'+name;
   if(!provenanceCache.has(key))provenanceCache.set(key,findDependencyProvenance({name,manifestPath,files:configFiles,packages,locks}));
   const proofs=provenanceCache.get(key);
   if(proofs.length===1){
    const proof=proofs[0];candidates=units.filter(u=>u.identity.name===name&&u.identity.version===proof.identity.version&&u.identity.integrity===proof.identity.integrity);
    if(candidates.length===1)selection={selection:'unique-transitive-config-source',consumerManifest:manifestPath,identity:proof.identity,chain:proof.chain,runtimeAcceptance:'NOT_VERIFIED',contextBoundary:'transitive-config-source-not-installed'};
   }
  }
  if(candidates.length!==1)return null;
  const unit=candidates[0],target=unit.directory+request.slice(unit.identity.name.length);
  if(!selectionManifests.has(target))selectionManifests.set(target,new Set());selectionManifests.get(target).add(manifestPath);
  if(selection)onSelection?.(selection);
  return target;
 };
 const configFor=from=>{
  let directory=path.posix.dirname(from),file=null;
  while(directory!=='.'){const candidate=directory+'/tsconfig.json';if(tree.has(candidate)){file=candidate;break;}directory=path.posix.dirname(directory);}
  if(!file&&tree.has('tsconfig.json'))file='tsconfig.json';
  if(!file)return null;if(configs.has(file))return configs.get(file);
  const inputs=new Set([file]),errors=[],configSelections=new Map();
  const host={useCaseSensitiveFileNames:true,readDirectory:(root,extensions,excludes,includes,depth)=>ts.matchFiles(root,extensions,excludes,includes,true,virtual,depth,absolute=>{const p=decode(absolute),items=children.get(p);return {files:[...(items?.files??[])].filter(name=>validConfig(p+'/'+name)),directories:[...(items?.directories??[])]};},absolute=>absolute),fileExists:absolute=>{const p=decode(absolute);return Boolean(p&&validConfig(p)&&(files.has(p)||configFiles.has(p)));},
   readFile:absolute=>{const p=decode(absolute,selection=>{configSelections.set(selection.consumerManifest+'\0'+selection.identity.name,selection);for(const step of selection.chain)if(configFiles.has(step.path))inputs.add(step.path);});if(p&&validConfig(p)&&(files.has(p)||configFiles.has(p))){inputs.add(p);for(const manifest of selectionManifests.get(p)??[])inputs.add(manifest);return String(files.get(p)??configFiles.get(p));}return undefined;},
   directoryExists:absolute=>{if(absolute.startsWith(virtual)&&(/\/node_modules$/.test(absolute)||/\/node_modules\/@[^/]+$/.test(absolute)))return true;const p=decode(absolute.replace(/\/$/,''));return p!==null&&(directories.has(p)||p==='.'||roots.some(r=>p===r.directory));},
   realpath:absolute=>{const p=decode(absolute);return p?virtual+p:absolute;},
   getCurrentDirectory:()=>virtual,onUnRecoverableConfigFileDiagnostic:d=>errors.push(d)};
  const parsed=valid(file)&&files.has(file)?ts.getParsedCommandLineOfConfigFile(virtual+file,{},host):null;
  errors.push(...(parsed?.errors??[]));
  if(parsed?.options.paths&&Object.values(parsed.options.paths).some(targets=>!Array.isArray(targets)||!targets.every(t=>typeof t==='string')))errors.push({code:'INVALID_PATHS',messageText:'Config paths must contain arrays of string targets'});
  const value={path:file,options:parsed?.options??{},fileNames:(parsed?.fileNames??[]).sort(),inputs:[...inputs].sort().map(path=>({path,sha256:hash(String(files.get(path)??configFiles.get(path))),...(archiveInputs.get(path)??{})})),
   errors:errors.filter(d=>![18002,18003].includes(d.code)).map(d=>({code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}))};
  if(!parsed&&!value.errors.length)value.errors.push({code:'MISSING_CONFIG',message:'Fixed config content unavailable or unsafe'});
  if(configSelections.size)value.sourceProvenance=[...configSelections.values()].sort((a,b)=>a.consumerManifest.localeCompare(b.consumerManifest)||a.identity.name.localeCompare(b.identity.name));
  configs.set(file,value);return value;
 };
 const lookup=value=>{
  if(value.startsWith('../')||value.startsWith('/')||value.includes('\\'))return {status:'invalid-project-target'};
  const stem=value.replace(/(?:\.d)?\.[cm]?[jt]sx?$/,'');
  const candidates=[value,...['.ts','.tsx','.mts','.cts','.d.ts','.js','.jsx','.mjs','.cjs','.json'].map(ext=>stem+ext)];
  for(const candidate of candidates)if(tree.has(candidate))return !valid(candidate)?{status:'unsafe-project-target',path:candidate}:{status:code(candidate)||candidate.endsWith('.json')?'source':'source-resource',path:candidate,blob:tree.get(candidate).oid};
  const manifest=value+'/package.json';
  if(tree.has(manifest)){
   if(!valid(manifest)||!files.has(manifest))return {status:'unsafe-project-target',path:manifest};
   const logical=absolute=>absolute.startsWith(virtual)?path.posix.normalize(absolute.slice(virtual.length)):null;
   const host={fileExists:absolute=>{const p=logical(absolute);return Boolean(p&&valid(p));},readFile:absolute=>files.get(logical(absolute)),directoryExists:absolute=>directories.has(logical(absolute)),realpath:absolute=>absolute,getCurrentDirectory:()=>virtual};
   const result=ts.resolveModuleName('./'+path.posix.basename(value),virtual+path.posix.dirname(value)+'/__consumer__.ts',{moduleResolution:ts.ModuleResolutionKind.Node10},host).resolvedModule;
   const target=result&&logical(result.resolvedFileName);
   if(target&&valid(target))return {status:'source',path:target,blob:tree.get(target).oid,directoryManifest:{path:manifest,sha256:hash(String(files.get(manifest)))},directoryPolicy:'TypeScript directory package resolution; runtime not verified'};
  }
  for(const name of ['index.ts','index.tsx','index.d.ts','index.js']){const candidate=value+'/'+name;if(tree.has(candidate))return !valid(candidate)?{status:'unsafe-project-target',path:candidate}:{status:'source',path:candidate,blob:tree.get(candidate).oid};}
  const platforms=['native','ios','android','web','server'].flatMap(p=>['.ts','.tsx','.js','.jsx'].flatMap(ext=>[`${stem}.${p}${ext}`,`${value}/index.${p}${ext}`])).filter(p=>tree.has(p));
  return platforms.length?{status:'project-platform-boundary',candidates:platforms.sort().map(path=>({path,blob:tree.get(path).oid,unsafe:!valid(path)}))}:{status:'unresolved'};
 };
 const remember=(request,from,result)=>{if(result.status!=='unresolved')records.set(from+'\0'+request,{request,from,...result});return result;};
 const emitEntry=(request,from)=>{
  const base=workspace(request,from);if(base.kind!=='workspace'||base.status==='source'||base.status==='not-exported'||base.status==='invalid-subpath'||base.status==='alias-boundary')return null;
  const pkg=roots.find(p=>p.id===base.packageId),config=pkg&&configFor(pkg.sourcePath);
  if(!config||config.errors.length||!config.options.outDir?.startsWith(virtual))return null;
  const sourceFiles=config.fileNames.filter(file=>/\.(?:[cm]?tsx?|jsx?)$/.test(file)&&!file.endsWith('.d.ts'));
  if(!sourceFiles.length||sourceFiles.some(file=>!files.has(decode(file))))return null;
  if(!config.emitRoot){
   const options={...config.options,noResolve:true,noLib:true,noEmit:true};
   const program=ts.createProgram(sourceFiles,options,{getSourceFile:file=>{const p=decode(file);return p&&files.has(p)?ts.createSourceFile(file,String(files.get(p)),ts.ScriptTarget.Latest,true):undefined;},getDefaultLibFileName:()=>'',writeFile(){},getCurrentDirectory:()=>virtual,getDirectories:()=>[],fileExists:file=>files.has(decode(file)),readFile:file=>files.get(decode(file)),getCanonicalFileName:file=>file,useCaseSensitiveFileNames:()=>true,getNewLine:()=>'\n'});
   config.emitRoot=program.getCommonSourceDirectory();config.emitRootPolicy=config.options.rootDir?'explicit-root-dir':config.options.composite?'composite-config-directory':'inferred-from-fixed-config-inputs';
  }
  const targets=(base.alternatives??[]).flatMap(candidate=>{
   if(typeof candidate.request!=='string')return [];
   const absolute=path.posix.normalize(path.posix.join(virtual+pkg.directory,candidate.request)),output=config.options.outDir.replace(/\/$/,'')+'/';
   if(!absolute.startsWith(output))return [];
   const target=decode(path.posix.join(config.emitRoot,absolute.slice(output.length))),found=target!==null?lookup(target):{status:'unresolved'};
   return found.status==='source'?[found]:[];
  });
  const unique=[...new Map(targets.map(t=>[t.path,t])).values()];if(unique.length!==1)return null;
  return {...unique[0],kind:'workspace',packageId:pkg.id,selection:'fixed-tsconfig-emit-source',config:{path:config.path,inputs:config.inputs},emitRoot:config.emitRoot.slice(virtual.length),emitRootPolicy:config.emitRootPolicy,emitInputs:sourceFiles.map(file=>({path:decode(file),sha256:hash(String(files.get(decode(file))))})),manifest:base.manifest,requestedSpecs:base.requestedSpecs,versionCompatibility:'NOT_VERIFIED',runtimeAcceptance:'NOT_VERIFIED',contextBoundary:'tsconfig-emit-source-projection-not-build-verified'};
 };
 return {lookup,resolve(request,from){
  if(request.startsWith('/')||request.includes('\\')||request.split('/').some(p=>p==='..')&&!request.startsWith('.'))return remember(request,from,{status:'invalid-project-request'});
  if(request.startsWith('.')){
   const projected=workspace(request,from);
   if(projected.status==='source'){
    const unsafe=[projected.path,...(projected.sourceWrappers??[]).map(w=>w.path)].some(p=>!valid(p));
    const result=unsafe?{status:'unsafe-project-target',path:projected.path}:!code(projected.path)&&!projected.path.endsWith('.json')?{status:'source-resource',path:projected.path,blob:tree.get(projected.path).oid}:projected;
    return remember(request,from,{...result,selection:'fixed-workspace-source-projection',runtimeAcceptance:'NOT_VERIFIED'});
   }
   return remember(request,from,{...lookup(path.posix.normalize(path.posix.join(path.posix.dirname(from),request))),selection:'fixed-tree-relative',runtimeAcceptance:'NOT_VERIFIED'});
  }
  const config=configFor(from);if(!config)return {status:'unresolved'};
  const origin={path:config.path,inputs:config.inputs,...(config.sourceProvenance?{sourceProvenance:config.sourceProvenance}:{})};
  if(config.errors.length)return remember(request,from,{status:'project-config-boundary',config:origin,errors:config.errors});
  const options=config.options,patterns=Object.keys(options.paths??{}).filter(pattern=>{
   if(!pattern.includes('*'))return pattern===request;
   const [head,tail]=pattern.split('*');return request.startsWith(head)&&request.endsWith(tail)&&request.length>=head.length+tail.length;
  }).sort((a,b)=>Number(b===request)-Number(a===request)||b.indexOf('*')-a.indexOf('*')||b.length-a.length||a.localeCompare(b));
  if(patterns.length){
   const pattern=patterns[0],[head,tail]=pattern.split('*'),wildcard=tail===undefined?'':request.slice(head.length,tail.length?-tail.length:undefined);
   const base=options.baseUrl??options.pathsBasePath,alternatives=(options.paths[pattern]??[]).map(target=>{
    const absolute=path.posix.normalize(path.posix.join(base,target.replace('*',wildcard)));
    const logical=decode(absolute);return logical!==null?lookup(logical):{status:'invalid-project-target'};
   });
   const result=alternatives.find(r=>r.status==='source'||r.status==='source-resource')??alternatives.find(r=>r.status!=='unresolved');
   return remember(request,from,{...(result??{status:'project-alias-boundary'}),selection:'fixed-tsconfig-paths',pattern,config:origin,alternatives,runtimeAcceptance:'NOT_VERIFIED',contextBoundary:'tsconfig-source-projection-not-runtime-verified'});
  }
  if(options.baseUrl?.startsWith(virtual)){const logical=decode(path.posix.normalize(path.posix.join(options.baseUrl,request))),result=logical!==null?lookup(logical):{status:'invalid-project-target'};if(result.status!=='unresolved')return remember(request,from,{...result,selection:'fixed-tsconfig-base-url',config:origin,runtimeAcceptance:'NOT_VERIFIED',contextBoundary:'tsconfig-source-projection-not-runtime-verified'});}
  const emitted=emitEntry(request,from);return emitted?remember(request,from,emitted):{status:'unresolved'};
 },snapshot(){return {compilerVersion:ts.version,configs:[...configs.values()].sort((a,b)=>a.path.localeCompare(b.path)),resolutions:[...records.values()].sort((a,b)=>a.from.localeCompare(b.from)||a.request.localeCompare(b.request)),runtimeAcceptance:'NOT_VERIFIED',projectTypecheckAcceptance:'NOT_VERIFIED',policy:'fixed tree and TypeScript config parser; config inheritance is source provenance, not an installed runtime resolver'};}};
}

export function findDependencyProvenance({name,manifestPath,files,packages,locks,rootSections=sections}){
 const bySelector=new Map(locks.map(l=>[l.selector,l])),byName=new Map(packages.map(p=>[p.name,p.sourcePath])),seen=new Set(),queue=[],matches=new Map();
 const addManifest=(file,chain=[],manifestSections=sections)=>{const manifest=JSON.parse(String(files.get(file)));for(const section of manifestSections)for(const [dependency,spec]of Object.entries(manifest[section]??{}))queue.push({name:dependency,spec,chain:[...chain,{path:file,pointer:`/${section}/${dependency.replaceAll('~','~0').replaceAll('/','~1')}`,name:dependency,spec}]});};
 addManifest(manifestPath,[],rootSections);
 for(let i=0;i<queue.length;i++){
  const item=queue[i],selector=`${item.name}@${item.spec}`,lock=bySelector.get(selector);
  if(item.name===name&&lock){const id=lock.name+'@'+lock.version+':'+lock.integrity;if(!matches.has(id))matches.set(id,{identity:lock,chain:item.chain});}
  if(seen.has(selector))continue;seen.add(selector);
  if(lock)for(const section of ['dependencies','optionalDependencies'])for(const [dependency,spec]of Object.entries(lock[section]??{}))queue.push({name:dependency,spec,chain:[...item.chain,{...lock.source,selector:lock.selector,section,name:dependency,spec}]});
  else if(byName.has(item.name)&&!String(item.spec).startsWith('npm:'))addManifest(byName.get(item.name),item.chain);
 }
 return [...matches.values()].sort((a,b)=>a.identity.selector.localeCompare(b.identity.selector));
}

function reviewTemplateReference(request,from,text,entries){
 const root=['packages/expo-module-template-local/','packages/expo-module-template/'].find(root=>from.startsWith(root));
 if(!root||!request.startsWith('.'))return null;
 const project=value=>value.replace(/<%[-=]\s*project\.([A-Za-z_]\w*)\s*%>/g,(token,name)=>`Template_${name}`.padEnd(token.length,'_'));
 const raw=ts.preProcessFile(text,true,true).importedFiles.map(i=>i.fileName).find(raw=>project(raw)===request&&raw!==request);
 if(!raw)return null;
 const parameters=[...new Set([...raw.matchAll(/<%[-=]\s*(project\.[A-Za-z_]\w*)\s*%>/g)].map(m=>m[1]))].sort();
 const canonical=value=>value.replace(/(?:<|\{)%[-=]\s*(project\.[A-Za-z_]\w*)\s*%(?:>|\})/g,(_,name)=>'PARAM_'+name);
 const target=path.posix.normalize(path.posix.join(path.posix.dirname(from),canonical(raw)));
 if(!target.startsWith(root))return null;
 const sourceCandidates=entries.filter(e=>e.type==='blob'&&e.mode!=='120000'&&[target+'.ts',target+'.tsx',target+'.web.ts',target+'.web.tsx'].includes(canonical(e.path))).map(e=>({path:e.path,blob:e.oid}));
 if(!sourceCandidates.length)return null;
 return {status:'template-reference',rawRequest:raw,parameters,sourceCandidates,runtimeAcceptance:'NOT_VERIFIED',instantiationAcceptance:'NOT_VERIFIED',policy:'fixed template parameter/file correspondence only; no generated project or platform selection'};
}

export function auditProjectSourceQueue({queue,files,entries,packages,locks,configArchives=[],sourceProvenance=false}){
 const context=createProjectSourceContext({files,entries,packages,locks,configArchives,sourceProvenance}),workspace=createWorkspaceResolver({files,packages}),manifests=[...files.keys()].filter(p=>p==='package.json'||p.endsWith('/package.json')).sort((a,b)=>b.length-a.length),cache=new Map();
 const roots=packages.map(p=>({...p,directory:path.posix.dirname(p.sourcePath)})).sort((a,b)=>b.directory.length-a.directory.length);
 const provenanceFor=(manifestPath,name)=>{
  const key=manifestPath+'\0'+name,rootKey='package.json\0'+name;
  for(const [id,file]of [[key,manifestPath],[rootKey,'package.json']])if(!cache.has(id))cache.set(id,findDependencyProvenance({name,manifestPath:file,files,packages,locks}));
  return {consumerManifest:manifestPath,lockProvenance:cache.get(key),rootToolingCandidates:cache.get(rootKey),runtimeAcceptance:'NOT_VERIFIED',policy:'exact dependency edges only; a reachable transitive identity does not establish the installed hoisted import target'};
 };
 const groups=queue.groups.filter(g=>!g.exactLockCandidates.length).map(group=>({id:group.id,name:group.name,kind:group.kind,consumers:group.consumers.map(consumer=>{
  const from=consumer.sourcePath,text=String(files.get(from)),owner=roots.find(p=>from.startsWith(p.directory+'/'));
  if(!files.has(from))throw new Error(`Missing queue consumer ${from}`);
  const manifestPath=manifests.find(p=>p==='package.json'||from.startsWith(path.posix.dirname(p)+'/'));
  const source={path:from,sha256:hash(text)},local=context.resolve(consumer.request,from),base=workspace(consumer.request,from);
  let resolution=local.status!=='unresolved'?local:base,status;
  if(resolution.status==='source')status='LOCAL_SOURCE_PROVENANCE';
  else if(resolution.status==='source-resource')status='RESOURCE_PROVENANCE_ONLY';
  else if(resolution.status==='project-platform-boundary'||resolution.status==='platform-dependent')status='BLOCKED_PLATFORM_SELECTION';
  else if(resolution.status==='project-config-boundary')status='BLOCKED_PROJECT_CONFIG';
  else if(resolution.status==='project-alias-boundary')status='BLOCKED_LOCAL_ALIAS_TARGET';
  else if(group.kind==='relative'){
   const template=reviewTemplateReference(consumer.request,from,text,entries);
   status=template?'UNINSTANTIATED_TEMPLATE_REFERENCE':'BLOCKED_RELATIVE_TARGET';if(template)resolution=template;
  }
  else if(group.kind==='workspace'){
   status='BLOCKED_WORKSPACE_ENTRY';
   const target=packages.find(p=>p.name===group.name),directory=target&&path.posix.dirname(target.sourcePath);
   resolution={...resolution,sourceCandidates:directory?entries.filter(e=>e.path.startsWith(directory+'/src/')&&code(e.path)).map(e=>({path:e.path,blob:e.oid})):[],policy:'source candidates do not repair an absent declared entry or establish a build mapping'};
  }
  else if(consumer.request==='completely-missing'&&from==='apps/router-e2e/__e2e__/04-server-error-boundaries/components/bundler-error-actions.tsx'&&files.has(fixtureTest)&&files.has(fixtureApp)&&String(files.get(fixtureTest)).includes('catches server action bundling errors in master boundary')&&String(files.get(fixtureTest)).includes('Syntax Error')&&String(files.get(fixtureTest)).includes('button-bundler-error')&&String(files.get(fixtureApp)).includes('../components/bundler-error-actions')&&String(files.get(fixtureApp)).includes('button-bundler-error')){
   status='EXPECTED_FAILURE_FIXTURE';resolution={status:'intentionally-unresolved',test:{path:fixtureTest,sha256:hash(String(files.get(fixtureTest)))},app:{path:fixtureApp,sha256:hash(String(files.get(fixtureApp)))},runtimeAcceptance:'EXPECTED_FAILURE_ONLY',execution:'NOT_RUN'};
  }else if(group.name==='Template_slug______'&&text.includes("'<%- project.slug %>'")){
   status='UNINSTANTIATED_TEMPLATE_PARAMETER';resolution={status:'template-parameter',parameter:'project.slug',runtimeAcceptance:'NOT_VERIFIED'};
  }else{
   const proof=provenanceFor(manifestPath,group.name);
   status=proof.lockProvenance.length?'LOCK_PROVENANCE_RUNTIME_UNVERIFIED':'BLOCKED_CONSUMER_IDENTITY';
   resolution={...resolution,...proof};
  }
  if(status==='BLOCKED_PROJECT_CONFIG'&&group.kind==='external')resolution={...resolution,...provenanceFor(manifestPath,group.name)};
  return {...consumer,source,owner:owner?.id??null,manifestPath,status,resolution,typeAcceptance:'NOT_VERIFIED',batch:owner?.id?.startsWith('TEMPLATE:')?'M0A/M7':'M7',scope:'保留原清单范围；来源审阅不等于公开API或Harmony支持'};
 })}));
 const rows=groups.flatMap(g=>g.consumers);
 return {schemaVersion:1,groups,summary:Object.fromEntries([...new Set(rows.map(r=>r.status))].sort().map(s=>[s,rows.filter(r=>r.status===s).length])),projectContext:context.snapshot(),publicSurfaceComplete:false,stageClosable:false};
}

export function loadProjectSourceInputs({sourceDir,prefetch=false,configArchiveDirectory=null,sourceProvenance=false}){
 const inventory=buildSourceInventory({sourceDir}),{tree,entries}=readSourceTree(sourceDir,SDK54_EXPO_COMMIT),packages=[...inventory.packages,...inventory.templates];
 const selected=selectWorkspaceSources(entries,inventory),paths=new Set(selected.map(e=>e.path));
 for(const e of entries)if(e.path==='package.json'||e.path==='yarn.lock'||e.path.endsWith('/package.json')||/(?:^|\/)(?:tsconfig[^/]*\.json|babel\.config\.[cm]?js)$/.test(e.path)||e.path===fixtureTest)paths.add(e.path);
 const files=new Map(),loaded=new Map();
 const read=items=>{if(items.some(e=>e.mode==='120000'||e.type!=='blob'))throw new Error('Unsafe project input');if(prefetch)try{prefetchSourceBlobs(sourceDir,items);}catch(error){throw new Error(`Project source prefetch failed for ${items.map(e=>e.path).join(', ')}: ${error.message}`);}for(let i=0;i<items.length;i+=100)for(const [file,bytes]of readSourceBlobs(sourceDir,items.slice(i,i+100)))files.set(file,bytes.toString());for(const e of items)loaded.set(e.path,e);};
 read(entries.filter(e=>paths.has(e.path)));
 const locks=parseFixedYarnLock(String(files.get('yarn.lock'))),configArchives=[];
 if(configArchiveDirectory){
  for(const [selector,version]of [['@tsconfig/node18@^18.2.2','18.2.2'],['@tsconfig/node20@^20.1.2','20.1.2']]){
   const identity=locks.find(l=>l.selector===selector);if(!identity||identity.version!==version)throw new Error(`Missing fixed config identity ${selector}`);
   configArchives.push(readDeclarationArchive(path.join(configArchiveDirectory,identity.name.replaceAll('/','-').replace(/^@/,'')+'-'+version+'.tgz'),identity,{includeConfigJson:true}));
  }
 }
 const context=createProjectSourceContext({files,entries,packages,configArchives,locks,sourceProvenance}),pending=[...files.keys()].filter(file=>file!==fixtureTest&&code(file)),visited=new Set();
 for(let begin=0;begin<pending.length;){
  const end=pending.length,additional=new Map();
  for(let i=begin;i<end;i++){
   const from=pending[i];if(visited.has(from))continue;visited.add(from);
   const source=ts.preProcessFile(String(files.get(from)),true,true);
   for(const imported of source.importedFiles){const r=context.resolve(imported.fileName,from);if(r.status==='source'&&!files.has(r.path)){const e=entries.find(e=>e.path===r.path);if(e)additional.set(e.path,e);}}
  }
  const items=[...additional.values()];if(items.length){read(items);pending.push(...items.filter(e=>code(e.path)).map(e=>e.path));}begin=end;
 }
 return {inventory,source:{revision:SDK54_EXPO_COMMIT,tree},files,packages,entries,configArchives,locks,...(sourceProvenance?{sourceProvenance:true}:{}),selected:[...loaded.values()].filter(e=>e.path!==fixtureTest).sort((a,b)=>a.path.localeCompare(b.path)),evidenceInputs:[...loaded.values()].sort((a,b)=>a.path.localeCompare(b.path)),additionalCode:[...loaded.values()].filter(e=>e.path!==fixtureTest&&code(e.path)&&!selected.some(s=>s.path===e.path)).map(e=>e.path).sort()};
}

export function buildProjectContextAudit({sourceDir,prefetch=false,configArchiveDirectory=null,sourceProvenance=false}){
 const input=loadProjectSourceInputs({sourceDir,prefetch,configArchiveDirectory,sourceProvenance}),queueBytes=fs.readFileSync(queuePath);
 if(hash(queueBytes)!==queueHash)throw new Error('Frozen source queue integrity mismatch');
 const result=auditProjectSourceQueue({...input,queue:JSON.parse(queueBytes),locks:parseFixedYarnLock(input.files.get('yarn.lock').toString())});
 result.source=input.source;result.queue={path:queuePath,sha256:hash(queueBytes)};result.additionalCode=input.additionalCode;
 result.inputs=input.evidenceInputs.map(e=>({path:e.path,blob:e.oid,sha256:hash(String(input.files.get(e.path)))}));
 return result;
}

export function validateProjectContext(actual,expected){
 const failures=[];
 const rows=value=>(value?.groups??[]).flatMap(g=>g.consumers.map(c=>({id:g.id+'#'+c.sourcePath+'#'+c.request,...c})));
 const actualRows=new Map();for(const row of rows(actual)){if(actualRows.has(row.id))failures.push(`Duplicate ${row.id}`);actualRows.set(row.id,row);}
 for(const row of rows(expected)){const found=actualRows.get(row.id);if(!found||serializeInventory(found)!==serializeInventory(row))failures.push(`${found?'Changed':'Missing'} ${row.id} at ${row.source.path}`);actualRows.delete(row.id);}
 for(const id of actualRows.keys())failures.push(`Unexpected ${id}`);
 if(serializeInventory(actual)!==serializeInventory(expected))failures.push('Project source audit differs from fixed source reconstruction');
 return {valid:!failures.length,failures};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{
  const options={},args=process.argv.slice(2);for(let i=0;i<args.length;i++){const arg=args[i];if(['--prefetch','--source-provenance'].includes(arg)){if(options[arg])throw new Error('Duplicate flag');options[arg]=true;continue;}if(!['--source','--output','--check','--check-set','--config-archives'].includes(arg)||!args[i+1]||options[arg])throw new Error('Invalid args');options[arg]=args[++i];}
  if(!options['--source']||['--output','--check','--check-set'].filter(k=>options[k]).length!==1)throw new Error('Usage: --source <git> --output|--check <json> | --check-set <paths.json> [--prefetch] [--config-archives <dir>] [--source-provenance]');
  const expected=buildProjectContextAudit({sourceDir:options['--source'],prefetch:options['--prefetch'],configArchiveDirectory:options['--config-archives'],sourceProvenance:Boolean(options['--source-provenance'])});
  if(options['--check-set']){const paths=JSON.parse(fs.readFileSync(options['--check-set']));if(!Array.isArray(paths)||!paths.length||new Set(paths).size!==paths.length)throw new Error('Invalid validation paths');const results=paths.map(path=>({path,...validateProjectContext(JSON.parse(fs.readFileSync(path)),expected)})),valid=results.every(r=>r.valid);console.log(JSON.stringify({valid,results}));if(!valid)process.exitCode=1;}
  else if(options['--check']){const result=validateProjectContext(JSON.parse(fs.readFileSync(options['--check'])),expected);console.log(JSON.stringify(result));if(!result.valid)process.exitCode=1;}
  else{fs.writeFileSync(options['--output'],serializeProjectContext(expected));console.log(JSON.stringify({groups:expected.groups.length,consumers:expected.groups.reduce((n,g)=>n+g.consumers.length,0),additionalCode:expected.additionalCode.length,summary:expected.summary,stageClosable:false}));}
 }catch(error){console.error(error.stack);process.exitCode=1;}
}
