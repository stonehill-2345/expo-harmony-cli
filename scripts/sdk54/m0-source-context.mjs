import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { loadPlannedDeclarationArchives,verifyDeclarationPackage } from './m0-archive.mjs';
export { assertDeclarationEntry,verifyDeclarationPackage,readDeclarationArchive,loadPlannedDeclarationArchives } from './m0-archive.mjs';
import { parseFixedYarnLock } from './external-sources.mjs';
import { buildSourceInventory,readSourceTree,readSourceBlobs } from './source-inventory.mjs';
import { buildConsolidated,validateConsolidated,validateConsolidatedSet,serializeConsolidated,summarizeConsolidated } from './m0-consolidated.mjs';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';
import { createProjectSourceContext,loadProjectSourceInputs,findDependencyProvenance } from './m0-project-context.mjs';
import { readSemanticArtifact,writeSemanticArtifact } from './m0-semantic-artifact.mjs';

const prefix='__sdk54_external__/',hash=value=>createHash('sha256').update(value).digest('hex');
const cohort=['react-native@0.81.5','@types/react@~19.1.10','@types/node@^22.14.0','@expo/metro@~54.2.0','csstype@^3.0.2','undici-types@~6.21.0','@react-native/virtualized-lists@0.81.5'];
const sourceQueue={path:'outputs/sdk54/ai-e2e/20261022-m0-consolidated/remaining-source-batches.json',sha256:'8049ee3da9461ced82fba66893d7cffd79c2256b54dbd45e251ec093fbf150a7'};
const require=createRequire(new URL('../../apps/cli/package.json',import.meta.url)),semver=require('semver');

export function planDeclarationArchives({selectors=cohort,locks,queue=null,baselineHash}){
  const bySelector=new Map(locks.map(l=>[l.selector,l])),identities=new Map(),blockers=[];
  const add=identity=>{
    const actual=bySelector.get(identity.selector);
    if(!actual||serializeConsolidated(actual)!==serializeConsolidated(identity))throw new Error(`Source queue lock identity mismatch ${identity.selector}`);
    const url=new URL(actual.resolved),supported=/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(actual.integrity??'')&&Buffer.from(actual.integrity.slice(7),'base64').length===64&&/^#[a-f0-9]{40}$/.test(url.hash);
    if(!supported){blockers.push({selector:actual.selector,status:'UNSUPPORTED_INTEGRITY'});return;}
    if(url.protocol!=='https:'||!['registry.yarnpkg.com','registry.npmjs.org'].includes(url.hostname)||url.username||url.password||url.port||!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(actual.name)||!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?(?:\+[a-z0-9.-]+)?$/i.test(actual.version)){
      blockers.push({selector:actual.selector,status:'UNSUPPORTED_SOURCE'});return;
    }
    const key=actual.name+'@'+actual.version,prior=identities.get(key);
    if(prior){if(prior.identity.integrity!==actual.integrity||new URL(prior.identity.resolved).hash!==url.hash)throw new Error(`Conflicting fixed archive identity ${key}`);if(!prior.selectors.includes(actual.selector))prior.selectors.push(actual.selector);return;}
    identities.set(key,{identity:actual,selectors:[actual.selector],filename:actual.name.replaceAll('/','-').replace(/^@/,'')+'-'+actual.version+'.tgz',downloadUrl:'https://registry.npmjs.org'+url.pathname});
  };
  for(const selector of selectors){const identity=bySelector.get(selector);if(!identity?.integrity||!identity.resolved)throw new Error(`Missing fixed archive identity ${selector}`);add(identity);}
  if(queue){
    if(queue.graphSha256!==baselineHash)throw new Error('Source queue baseline mismatch');
    const groups=new Set();for(const group of queue.groups){if(!group.id||groups.has(group.id))throw new Error('Duplicate source queue group');groups.add(group.id);
      if(!group.exactLockCandidates.length)blockers.push({groupId:group.id,status:'NO_EXACT_LOCK'});
      for(const identity of group.exactLockCandidates)add(identity);
    }
  }
  return {archives:[...identities.values()].map(a=>({...a,selectors:a.selectors.sort()})).sort((a,b)=>a.filename.localeCompare(b.filename)),blockers};
}

export function planDeclaredTypeArchives({archives,workspaceFiles,packages,locks}){
  const bySelector=new Map(),roots=[],edges=[],blockers=[],selected=new Set();
  for(const identity of locks){if(bySelector.has(identity.selector))throw new Error(`Duplicate lock selector ${identity.selector}`);bySelector.set(identity.selector,identity);}
  const visit=selector=>{
    if(selected.has(selector))return;selected.add(selector);
    const identity=bySelector.get(selector);
    if(!identity){blockers.push({selector,status:'NO_EXACT_LOCK'});return;}
    for(const section of ['dependencies','optionalDependencies'])for(const [name,spec]of Object.entries(identity[section]??{})){
      const target=`${name}@${spec}`;edges.push({from:selector,section,selector:target});visit(target);
    }
  };
  const manifests=[...packages.map(p=>({path:p.sourcePath,text:String(workspaceFiles.get(p.sourcePath))})),
    ...archives.map(a=>({path:prefix+a.identity.name.replaceAll('/','+')+'@'+a.identity.version+'/package.json',text:a.files.get('package.json')}))];
  for(const {path:manifestPath,text}of manifests){
    const manifest=JSON.parse(text);
    for(const section of ['dependencies','optionalDependencies','peerDependencies','devDependencies'])for(const [name,spec]of Object.entries(manifest[section]??{})){
      if(!name.startsWith('@types/')||typeof spec!=='string')continue;
      const selector=`${name}@${spec}`;
      roots.push({manifest:{path:manifestPath,sha256:hash(text)},section,name,spec,selector});visit(selector);
    }
  }
  const plan=planDeclarationArchives({selectors:[...selected].filter(s=>bySelector.has(s)).sort(),locks});
  return {...plan,roots:roots.sort((a,b)=>a.manifest.path.localeCompare(b.manifest.path)||a.selector.localeCompare(b.selector)||a.section.localeCompare(b.section)),
    edges:edges.sort((a,b)=>a.from.localeCompare(b.from)||a.selector.localeCompare(b.selector)||a.section.localeCompare(b.section)),blockers:[...blockers,...plan.blockers]};
}

export function additionalDeclarationArchives(base,additional,directory){
  const existing=new Map(base.map(a=>[a.identity.name+'@'+a.identity.version,a]));
  return additional.filter(a=>{
    const prior=existing.get(a.identity.name+'@'+a.identity.version);
    if(!prior)return true;
    if(prior.identity.integrity!==a.identity.integrity||new URL(prior.identity.resolved).hash!==new URL(a.identity.resolved).hash)throw new Error(`Conflicting fixed archive identity ${a.identity.name}@${a.identity.version}`);
    return false;
  }).map(a=>({...a,file:path.join(directory,a.filename)}));
}

export function createDeclarationContext({archives,workspaceFiles,packages,locks=[],sourceProvenance=false,declaredTypes=false,projectSources=null,transitiveSourceProvenance=false}){
  if(transitiveSourceProvenance&&!sourceProvenance)throw new Error('Transitive sources require source-provenance selection');
  const files=new Map(),resolutions=new Map(),units=archives.map(loaded=>{
    const manifest=verifyDeclarationPackage(loaded),directory=prefix+loaded.identity.name.replaceAll('/','+')+'@'+loaded.identity.version+'/';
    for(const [file,text]of loaded.files){const target=directory+file;if(files.has(target))throw new Error(`Duplicate declaration input ${target}`);files.set(target,text);}
    return {...loaded,manifest,directory};
  });
  const owners=packages.map(p=>({...p,directory:path.posix.dirname(p.sourcePath),manifest:JSON.parse(String(workspaceFiles.get(p.sourcePath)))})).sort((a,b)=>b.directory.length-a.directory.length);
  const ownerOf=from=>units.find(u=>from.startsWith(u.directory))??owners.find(o=>from.startsWith(o.directory+'/'));
  const projectTypes=declaredTypes&&sourceProvenance?createProjectSourceContext({files:workspaceFiles,packages,locks,sourceProvenance,
    ...(projectSources?{entries:projectSources.entries,configArchives:projectSources.configArchives}:{})}):null;
  const typeRootCache=new Map(),projectPrefix='/__sdk54_project__/';
  const resolveTypeRootContext=(request,from)=>{
    if(!projectTypes||from.startsWith(prefix)||!owners.some(o=>from.startsWith(o.directory+'/'))||request.startsWith('.')||request.startsWith('/')||request.includes('\\')||request.split('/').includes('..'))return null;
    let directory=path.posix.dirname(from),configPath=null;
    while(directory!=='.'){if(workspaceFiles.has(directory+'/tsconfig.json')){configPath=directory+'/tsconfig.json';break;}directory=path.posix.dirname(directory);}
    if(!configPath&&workspaceFiles.has('tsconfig.json'))configPath='tsconfig.json';
    if(!configPath)return null;
    const key=configPath+'\0'+request;if(typeRootCache.has(key))return typeRootCache.get(key);
    projectTypes.resolve(request,from);
    const config=projectTypes.snapshot().configs.find(c=>c.path===configPath);
    if(!config||config.errors.length||!config.options.typeRoots?.length){typeRootCache.set(key,null);return null;}
    const decode=file=>file.startsWith(projectPrefix)&&!file.slice(projectPrefix.length).startsWith('../')?file.slice(projectPrefix.length):null;
    const roots=config.options.typeRoots.filter(root=>decode(root)!==null),directories=new Map();
    for(const file of workspaceFiles.keys()){let child=file;for(let parent=path.posix.dirname(child);parent!=='.';parent=path.posix.dirname(child)){
      if(!directories.has(parent))directories.set(parent,new Set());directories.get(parent).add(path.posix.basename(child));child=parent;
    }}
    const host={fileExists:file=>workspaceFiles.has(decode(file)),readFile:file=>{const text=workspaceFiles.get(decode(file));return text===undefined?undefined:String(text);},
      directoryExists:file=>directories.has(decode(file)),getDirectories:file=>[...(directories.get(decode(file))??[])].filter(name=>directories.has(decode(file)+'/'+name)),getCurrentDirectory:()=>projectPrefix};
    const options={...config.options,typeRoots:roots},declarations=[],visited=new Set();
    const visit=(file,packageRoot)=>{
      if(visited.has(file)||!file.startsWith(packageRoot+'/')||!workspaceFiles.has(file)||!/\.d\.[cm]?ts$/.test(file))return;visited.add(file);
      const text=String(workspaceFiles.get(file)),source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
      if(source.parseDiagnostics.length)return;
      for(const statement of source.statements)if(!ts.isExternalModule(source)&&ts.isModuleDeclaration(statement)&&ts.isStringLiteral(statement.name)&&statement.name.text===request&&!request.includes('*')){
        declarations.push({path:file,sha256:hash(text),start:statement.getStart(source),end:statement.end});
      }
      for(const reference of source.referencedFiles)visit(path.posix.normalize(path.posix.join(path.posix.dirname(file),reference.fileName)),packageRoot);
    };
    for(const name of ts.getAutomaticTypeDirectiveNames(options,host)){
      const result=ts.resolveTypeReferenceDirective(name,projectPrefix+from,options,host).resolvedTypeReferenceDirective,target=result?decode(result.resolvedFileName):null;
      const root=target?roots.map(decode).find(root=>target.startsWith(root+'/'+name+'/')):null;
      if(root!=null)visit(target,root+'/'+name);
    }
    const result=declarations.length?{status:'project-type-root-context',config:{path:config.path,inputs:config.inputs},
      declarations:declarations.sort((a,b)=>a.path.localeCompare(b.path)||a.start-b.start),contextBoundary:'project-type-root-context-not-isolated',runtimeAcceptance:'NOT_VERIFIED',
      policy:'Exact ambient declarations under consumer-configured typeRoots; evidence only, not loaded into the shared semantic program'}:null;
    typeRootCache.set(key,result);return result;
  };
  const transitiveCache=new Map(),transitiveBoundary='locked-transitive-source-not-installed';
  const transitiveSource=(name,owner)=>{
    const key=owner.directory+'\0'+name;if(transitiveCache.has(key))return transitiveCache.get(key);
    const manifestPath=owner.directory+'package.json';
    // Publisher development dependencies cannot establish a runtime declaration source.
    const candidates=findDependencyProvenance({name,manifestPath,files,packages:[],locks,rootSections:['dependencies','optionalDependencies']});
    if(!candidates.length){transitiveCache.set(key,null);return null;}
    const matches=identity=>units.filter(unit=>['name','version','integrity','resolved'].every(field=>typeof identity[field]==='string'&&unit.identity[field]===identity[field]));
    const selectionEvidence={manifest:{path:manifestPath,sha256:hash(files.get(manifestPath))},consumerArchive:{identity:owner.identity,sha256:owner.archive.sha256},
      candidates:candidates.map(candidate=>({...candidate,archives:matches(candidate.identity).map(unit=>({identity:unit.identity,sha256:unit.archive.sha256}))})),
      policy:'unique fixed transitive dependency source; installed identity not inferred'};
    const available=candidates.length===1?matches(candidates[0].identity):[];
    const result={...(candidates.length>1?{status:'ambiguous-transitive-source'}:available.length===1?{unit:available[0],selection:'unique-locked-transitive-source'}:{status:available.length?'ambiguous-transitive-source':'missing-exact-transitive-source'}),
      specs:[],selectionEvidence,contextBoundary:transitiveBoundary};
    transitiveCache.set(key,result);return result;
  };
  const named=(name,from)=>{
    const owner=ownerOf(from);
    if(owner?.directory.startsWith(prefix)&&owner.identity.name===name)return {unit:owner,selection:'archive-self-reference',specs:[]};
    const declared=['dependencies','optionalDependencies','peerDependencies','devDependencies'].flatMap(section=>typeof owner?.manifest[section]?.[name]==='string'?[{section,name,spec:owner.manifest[section][name]}]:[]);
    const runtime=declared.filter(d=>d.section!=='devDependencies'),active=sourceProvenance&&runtime.length?runtime:declared;
    const direct=active.filter(d=>['dependencies','optionalDependencies'].includes(d.section));
    const identityDeclarations=sourceProvenance&&direct.length?direct:active;
    const specs=[...new Set(identityDeclarations.map(d=>d.spec))];
    const candidates=units.filter(u=>u.identity.name===name&&specs.some(spec=>u.identity.selector===`${name}@${spec}`||locks.some(l=>l.selector===`${name}@${spec}`&&l.integrity===u.identity.integrity&&l.version===u.identity.version)));
    if(candidates.length===1)return {unit:candidates[0],selection:'consumer-exact-selector',specs};
    if(candidates.length>1)return {status:'ambiguous-archive',specs};
    if(sourceProvenance&&active.length&&active.every(d=>d.section==='peerDependencies')){
      const manifestPath=owner.sourcePath??owner.directory+'package.json';
      const evidence={manifest:{path:manifestPath,sha256:hash(String(owner.sourcePath?workspaceFiles.get(manifestPath):files.get(manifestPath)))},declarations:active,
        policy:'unique verified peer-compatible declaration source; installed identity not inferred',candidates:[]};
      if(!active.every(d=>semver.validRange(d.spec)))return {status:'invalid-peer-source-range',specs,selectionEvidence:evidence};
      const compatible=units.filter(u=>u.identity.name===name&&active.every(d=>semver.valid(u.identity.version)&&semver.satisfies(u.identity.version,d.spec)));
      evidence.candidates=compatible.map(u=>({name:u.identity.name,version:u.identity.version,selector:u.identity.selector,sha256:u.archive.sha256})).sort((a,b)=>a.version.localeCompare(b.version));
      if(compatible.length===1)return {unit:compatible[0],selection:'unique-peer-source-projection',specs,selectionEvidence:evidence};
      return {status:compatible.length?'ambiguous-peer-source':'missing-compatible-peer-source',specs,selectionEvidence:evidence};
    }
    if(transitiveSourceProvenance&&!declared.length&&owner?.directory.startsWith(prefix)){
      const selected=transitiveSource(name,owner);if(selected)return selected;
    }
    // React's runtime package and DefinitelyTyped declaration package are deliberately separate identities.
    if(name==='@types/react'&&units.filter(u=>u.identity.name===name).length===1&&!specs.length)return {unit:units.find(u=>u.identity.name===name),selection:'shared-react-declaration-context',specs};
    return {status:specs.length?'missing-exact-archive':'missing-declared-identity',specs};
  };
  const rootFiles=units.filter(u=>u.identity.name==='@types/node').map(u=>u.directory+'index.d.ts').filter(f=>files.has(f));
  // Only declarations reachable through the verified Node root can establish a builtin identity.
  const nodeModules=new Map(),visited=new Set();
  const visitNode=file=>{
    if(visited.has(file)||!files.has(file))return;visited.add(file);
    const source=ts.createSourceFile(file,files.get(file),ts.ScriptTarget.Latest,true);
    for(const statement of source.statements)if(ts.isModuleDeclaration(statement)&&ts.isStringLiteral(statement.name)&&!statement.name.text.includes('*')){
      const request=statement.name.text;if(!nodeModules.has(request))nodeModules.set(request,[]);nodeModules.get(request).push({path:file,start:statement.getStart(source)});
    }
    const unit=units.find(u=>file.startsWith(u.directory));
    for(const ref of source.referencedFiles){const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),ref.fileName));if(unit&&target.startsWith(unit.directory))visitNode(target);}
  };
  rootFiles.forEach(visitNode);
  const remember=(request,from,value)=>{const typeRootContext=value.status==='source'?null:resolveTypeRootContext(request,from);
    const result=typeRootContext?{...value,typeRootContext}:value;resolutions.set(from+'\0'+request,{request,from,...result});return result;};
  const resolve=(request,from)=>{
    if(request.includes('\\')||request.startsWith('/')||!request.startsWith('.')&&request.split('/').some(s=>s==='..'))return remember(request,from,{status:'invalid-request'});
    if(nodeModules.has(request))return remember(request,from,{status:'node-global-context',declarations:nodeModules.get(request),contextBoundary:'node-global-context-not-project-verified'});
    if(request.startsWith('node:'))return remember(request,from,{status:rootFiles.length?'missing-node-ambient-declaration':'missing-exact-archive',kind:'external',name:'@types/node'});
    const relative=request.startsWith('.'),fromUnit=units.find(u=>from.startsWith(u.directory));
    if(relative&&!fromUnit)return {status:'unresolved'};
    if(relative){const target=path.posix.normalize(path.posix.join(path.posix.dirname(from),request));if(target!==fromUnit.directory.slice(0,-1)&&!target.startsWith(fromUnit.directory))return remember(request,from,{status:'invalid-request'});}
    const logicalName=relative?null:request.startsWith('@')?request.split('/').slice(0,2).join('/'):request.split('/')[0];
    const name=logicalName==='react'?'@types/react':logicalName;
    const selected=relative?{unit:fromUnit,selection:'archive-relative'}:named(name,from);
    const fallback=result=>{
      if(!declaredTypes||relative||logicalName==='react'||logicalName.startsWith('@types/'))return remember(request,from,result);
      if(selected.unit&&Object.hasOwn(selected.unit.manifest,'exports')){
        const marker='/node_modules/'+logicalName+'/',manifestPath=marker+'package.json';
        // Probe the export map with synthetic targets so absence of JS bytes cannot masquerade as an export denial.
        const exportHost={fileExists:file=>file.includes(marker)&&(!file.endsWith('/package.json')||file.endsWith(manifestPath)),
          readFile:file=>file.endsWith(manifestPath)?selected.unit.files.get('package.json'):undefined,directoryExists:()=>true,getCurrentDirectory:()=>'/__sdk54_export_probe__',realpath:file=>file};
        const allowed=ts.resolveModuleName(request,'/__sdk54_export_probe__/consumer.ts',{moduleResolution:ts.ModuleResolutionKind.NodeNext,module:ts.ModuleKind.NodeNext},exportHost,undefined,undefined,ts.ModuleKind.CommonJS).resolvedModule;
        if(!allowed)return remember(request,from,{...result,declarationFallbackBoundary:'runtime-exports-denied'});
      }
      const typeName='@types/'+(logicalName.startsWith('@')?logicalName.slice(1).replace('/','__'):logicalName),owner=ownerOf(from);
      const declarations=['dependencies','optionalDependencies','peerDependencies','devDependencies'].flatMap(section=>typeof owner?.manifest[section]?.[typeName]==='string'?[{section,name:typeName,spec:owner.manifest[section][typeName]}]:[]);
      if(!declarations.length)return remember(request,from,result);
      const projection=resolve(typeName+request.slice(logicalName.length),from);
      const manifestPath=owner.sourcePath??owner.directory+'package.json';
      const declarationEvidence={manifest:{path:manifestPath,sha256:hash(String(owner.sourcePath?workspaceFiles.get(manifestPath):files.get(manifestPath)))},declarations,
        request:typeName+request.slice(logicalName.length),resolution:projection};
      if(projection.status!=='source')return remember(request,from,{...result,declarationEvidence});
      return remember(request,from,{...projection,projection:'declared-runtime-to-types',runtimeIdentity:selected.unit?.identity??null,runtimeResolution:result,
        declarationEvidence,contextBoundary:'declared-types-not-project-verified',runtimeAcceptance:'NOT_VERIFIED'});
    };
    if(!selected.unit)return fallback({status:selected.status,kind:'external',name,requestedSpecs:selected.specs,...(selected.selectionEvidence?{selectionEvidence:selected.selectionEvidence}:{}),
      ...(selected.contextBoundary?{contextBoundary:selected.contextBoundary,runtimeAcceptance:'NOT_VERIFIED'}:{})});
    const unit=selected.unit;
    const decode=file=>{
      const direct=file.replace(/^\//,'');if(files.has(direct))return direct;
      const marker='/node_modules/'+logicalName;
      const index=!relative?file.lastIndexOf(marker):-1;
      if(index<0||!['/',''].includes(file.slice(index+marker.length,index+marker.length+1)))return null;
      const candidate=unit.directory+file.slice(index+marker.length).replace(/^\//,'');return files.has(candidate)?candidate:null;
    };
    const virtualHost={fileExists:file=>Boolean(decode(file)),readFile:file=>{const actual=decode(file);return actual?files.get(actual):undefined;},directoryExists:()=>true,getCurrentDirectory:()=>'/__sdk54_decl_resolver__',realpath:file=>file};
    const containing=relative?'/'+from:'/__sdk54_decl_resolver__/consumer.ts';
    const result=ts.resolveModuleName(request,containing,{moduleResolution:ts.ModuleResolutionKind.NodeNext,module:ts.ModuleKind.NodeNext,target:ts.ScriptTarget.Latest},virtualHost,undefined,undefined,ts.ModuleKind.CommonJS).resolvedModule;
    const target=result?decode(result.resolvedFileName):null;
    if(!target||!/\.d\.[cm]?ts$/.test(target))return fallback({status:'unresolved-declaration-entry',kind:'external',name,identity:unit.identity,selection:selected.selection,
      ...(selected.selectionEvidence?{selectionEvidence:selected.selectionEvidence,contextBoundary:selected.contextBoundary??'peer-source-projection-not-installed',runtimeAcceptance:'NOT_VERIFIED'}:{})});
    return remember(request,from,{status:'source',kind:'verified-external',path:target,identity:unit.identity,selection:selected.selection,
      projection:logicalName==='react'?'react-runtime-to-declaration':'published-declaration',runtimeAcceptance:'NOT_VERIFIED',
      ...(selected.selectionEvidence?{selectionEvidence:selected.selectionEvidence}:{}),
      contextBoundary:selected.contextBoundary??(selected.selection==='unique-peer-source-projection'?'peer-source-projection-not-installed':selected.selection==='shared-react-declaration-context'?'shared-react-declaration-context-not-project-verified':undefined),
      policy:'TypeScript NodeNext CJS declaration projection; not project/platform/runtime resolver acceptance'});
  };
  return {files,rootFiles,resolve,resolveTypeRootContext,resolveTypeReference(name,from=''){
    const nameOfPackage=name.startsWith('@')?'@types/'+name.slice(1).replace('/','__'):'@types/'+name;
    const selected=named(nameOfPackage,from),unit=selected.unit;
    const retain=result=>selected.selectionEvidence?remember('type-reference:'+name,from,{...result,referenceKind:'type-directive',selection:selected.selection??null,
      selectionEvidence:selected.selectionEvidence,contextBoundary:selected.contextBoundary??'peer-source-projection-not-installed',runtimeAcceptance:'NOT_VERIFIED'}):result;
    if(!unit)return retain({status:'unresolved'});
    const file=unit.directory+(unit.manifest.types??'index.d.ts');return retain(files.has(file)?{status:'source',path:file,identity:unit.identity,selection:selected.selection}:{status:'unresolved'});
  },snapshot(){return {compilerVersion:ts.version,files:[...files].sort(([a],[b])=>a.localeCompare(b)).map(([file,text])=>({path:file,sha256:hash(text)})),
    archives:units.map(u=>({identity:u.identity,archive:u.archive})),rootFiles,resolutions:[...resolutions.values()].sort((a,b)=>a.from.localeCompare(b.from)||a.request.localeCompare(b.request)),
    ...(sourceProvenance?{sourceProvenance:true,semverVersion:require('semver/package.json').version}:{}),...(declaredTypes?{declaredTypes:true}:{}),...(transitiveSourceProvenance?{transitiveSourceProvenance:'locked-v1'}:{}),runtimeAcceptance:'NOT_VERIFIED',projectContextsAcceptance:'NOT_VERIFIED',policy:'verified declaration archives only; raw manifests preserved; source projection is not a publication or installation result'};}};
}

export function compareSemanticCandidates(before,after){
  return Object.fromEntries(['inferences','plugins'].map(field=>{
    const expected=new Map(before[field].map(r=>[r.id,r])),actual=new Map(after[field].map(r=>[r.id,r]));if(actual.size!==after[field].length)throw new Error(`Duplicate ${field} candidate`);
    const rows=[];for(const [id,old]of expected){const row=actual.get(id);if(!row)throw new Error(`Missing ${field} candidate ${id}`);rows.push({id,source:row.source,before:old.status,after:row.status});actual.delete(id);}if(actual.size)throw new Error(`Unexpected ${field} candidates`);return [field,rows];
  }));
}

export function buildSourceContext({sourceDir,archiveDirectory,scope='core',planOnly=false,configArchiveDirectory=null,structuralTypeOperations=false,sourceProvenance=false,declaredTypesDirectory=null,additionalSelectors=[],transitiveSourceProvenance=false}){
  if(transitiveSourceProvenance&&(scope!=='project-sources'||!sourceProvenance))throw new Error('Transitive sources require project-sources scope and source-provenance selection');
  if(!Array.isArray(additionalSelectors)||additionalSelectors.some(s=>typeof s!=='string'||!s.trim())||new Set(additionalSelectors).size!==additionalSelectors.length)throw new Error('Invalid additional selectors; expected unique nonempty strings');
  if(additionalSelectors.length&&(scope!=='project-sources'||!sourceProvenance))throw new Error('Additional selectors require project-sources scope and source-provenance selection');
  if(!['core','exact-sources','project-sources'].includes(scope))throw new Error(`Invalid source context scope ${scope}`);
  if(declaredTypesDirectory&&(scope!=='project-sources'||!sourceProvenance))throw new Error('Declared types require project-sources scope and source-provenance selection');
  if(configArchiveDirectory&&scope!=='project-sources')throw new Error('Config archives require project-sources scope');
  const exact=scope!=='core';
  const inventory=buildSourceInventory({sourceDir}),{entries}=readSourceTree(sourceDir,SDK54_EXPO_COMMIT),paths=['yarn.lock',...inventory.packages.map(p=>p.sourcePath),...inventory.templates.map(p=>p.sourcePath)];
  const selected=entries.filter(e=>paths.includes(e.path)),workspaceFiles=readSourceBlobs(sourceDir,selected),locks=parseFixedYarnLock(workspaceFiles.get('yarn.lock').toString());
  const baselinePath='docs/releases/sdk54-m0-consolidated-summary.json',baselineSummaryBytes=fs.readFileSync(baselinePath),baselineSummary=JSON.parse(baselineSummaryBytes),bytes=fs.readFileSync(baselineSummary.artifact.path);
  if(hash(bytes)!==baselineSummary.artifact.sha256)throw new Error('Baseline semantic artifact integrity mismatch');
  const queuePath=sourceQueue.path,queueBytes=exact?fs.readFileSync(queuePath):null;
  if(queueBytes&&hash(queueBytes)!==sourceQueue.sha256)throw new Error('Frozen source queue integrity mismatch');
  const archivePlan=planDeclarationArchives({selectors:[...new Set([...cohort,...additionalSelectors])],locks,queue:queueBytes?JSON.parse(queueBytes):null,baselineHash:hash(bytes)});
  if(additionalSelectors.length)archivePlan.additionalSelectors=[...additionalSelectors];
  if(queueBytes)archivePlan.queue={path:queuePath,sha256:hash(queueBytes)};
  const planned=archivePlan.archives.map(a=>({...a,file:path.join(archiveDirectory,a.filename)}));
  if(planOnly&&!declaredTypesDirectory)return {source:inventory.source,scope,...archivePlan,archives:planned};
  const {loaded,availability}=loadPlannedDeclarationArchives(planned);
  if(!loaded.length)throw new Error('No verified declaration archives available');
  const projectSources=scope==='project-sources'?loadProjectSourceInputs({sourceDir,configArchiveDirectory,sourceProvenance}):null;
  if(declaredTypesDirectory){
    const declaredPlan=planDeclaredTypeArchives({archives:loaded,workspaceFiles:projectSources.files,packages:[...inventory.packages,...inventory.templates],locks});
    const additional=additionalDeclarationArchives(planned,declaredPlan.archives,declaredTypesDirectory);
    archivePlan.declaredTypes={...declaredPlan,archives:additional};
    if(planOnly)return {source:inventory.source,scope,...archivePlan,archives:planned};
    const extra=loadPlannedDeclarationArchives(additional);loaded.push(...extra.loaded);availability.push(...extra.availability);
  }
  const context=createDeclarationContext({archives:loaded,workspaceFiles:projectSources?.files??workspaceFiles,packages:[...inventory.packages,...inventory.templates],locks,sourceProvenance,declaredTypes:Boolean(declaredTypesDirectory),projectSources,transitiveSourceProvenance});
  const graph=buildConsolidated({sourceDir,externalContext:context,projectSources,maxTypes:250000,symbolicGenerics:exact,declarationInstanceLimit:exact?16:Infinity,structuralTypeOperations});
  graph.externalContext.availability=availability;
  if(exact)graph.externalContext.archivePlan=archivePlan;
  graph.externalContext.fixedInputs=selected.map(e=>({path:e.path,blob:e.oid,sha256:hash(workspaceFiles.get(e.path))}));
  const baseline=JSON.parse(gunzipSync(bytes));graph.previous={path:baselinePath,sha256:hash(baselineSummaryBytes),artifact:baselineSummary.artifact};
  graph.comparison=compareSemanticCandidates(baseline,graph);
  graph.closure.blockers.push({id:'external-context-project-acceptance',count:1,records:[],reason:'声明投影不是各包tsconfig/平台/运行与发行解析验收'});
  const missing=availability.filter(a=>a.status==='MISSING_ARCHIVE');if(missing.length)graph.closure.blockers.push({id:'missing-planned-declaration-archives',count:missing.length,records:missing.map(a=>a.identity.selector),reason:'固定归档缺失，不能以宿主安装包或未核验内容冒充'});
  const rejected=availability.filter(a=>a.status==='REJECTED_ARCHIVE');if(rejected.length)graph.closure.blockers.push({id:'rejected-declaration-archives',count:rejected.length,records:rejected.map(a=>({selector:a.identity.selector,reason:a.reason})),reason:'已核字节的归档未通过结构约束，不接入语义上下文'});
  if(exact&&archivePlan.blockers.length)graph.closure.blockers.push({id:'source-queue-identity-boundaries',count:archivePlan.blockers.length,records:archivePlan.blockers,reason:'来源队列中的缺锁、原始完整性或不支持来源仍未关闭'});
  if(archivePlan.declaredTypes?.blockers.length)graph.closure.blockers.push({id:'declared-type-identity-boundaries',count:archivePlan.declaredTypes.blockers.length,records:archivePlan.declaredTypes.blockers,reason:'显式声明依赖缺固定锁或完整性，不推断发布者开发环境身份'});
  return graph;
}

export function summarizeSourceContext(graph,artifact){const base=summarizeConsolidated(graph,artifact);return {...base,
  archiveAvailability:graph.externalContext.availability.map(a=>({name:a.identity.name,version:a.identity.version,status:a.status,sha256:a.sha256})),
  externalDeclarationFiles:graph.externalContext.files.length,externalResolutions:graph.externalContext.resolutions.reduce((o,r)=>(o[r.status]=(o[r.status]??0)+1,o),{}),
  candidateChanges:Object.fromEntries(['inferences','plugins'].map(field=>[field,graph.comparison[field].reduce((o,r)=>{const k=r.before+' -> '+r.after;o[k]=(o[k]??0)+1;return o;},{})]))};}

export function parseSourceContextArgs(args){
  const options={};for(let i=0;i<args.length;i+=2){if(!['--source','--archives','--output','--check','--check-set','--summary','--scope','--plan','--config-archives','--type-operations','--context-selection','--declared-types','--additional-selectors','--transitive-sources'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Invalid args');options[args[i]]=args[i+1];}
  options['--type-operations']??='legacy';
  if(!['legacy','structural'].includes(options['--type-operations']))throw new Error('Invalid type operations mode; expected legacy or structural');
  options['--context-selection']??='exact';
  if(!['exact','source-provenance'].includes(options['--context-selection']))throw new Error('Invalid context selection; expected exact or source-provenance');
  if(options['--transitive-sources']){
    if(options['--transitive-sources']!=='locked-v1')throw new Error('Invalid transitive sources policy; expected locked-v1');
    if(options['--scope']!=='project-sources'||options['--context-selection']!=='source-provenance')throw new Error('Transitive sources require project-sources scope and source-provenance selection');
  }
  if(options['--declared-types']&&(options['--scope']!=='project-sources'||options['--context-selection']!=='source-provenance'))throw new Error('Declared types require project-sources scope and source-provenance selection');
  if(options['--additional-selectors']){
    if(options['--scope']!=='project-sources'||options['--context-selection']!=='source-provenance')throw new Error('Additional selectors require project-sources scope and source-provenance selection');
    const bytes=fs.readFileSync(options['--additional-selectors']);options.additionalSelectors=JSON.parse(bytes);options.additionalSelectorInput={path:options['--additional-selectors'],sha256:hash(bytes)};
  }
  if(!options['--source']||!options['--archives']||['--output','--check','--check-set','--plan'].filter(k=>options[k]).length!==1||options['--summary']&&!options['--output'])throw new Error('Usage: --source <git> --archives <dir> --output|--check <json.gz> | --check-set <paths.json> | --plan <json> [--scope core|exact-sources|project-sources] [--summary <json>] [--config-archives <dir>] [--type-operations legacy|structural] [--context-selection exact|source-provenance] [--declared-types <dir>] [--additional-selectors <json>] [--transitive-sources locked-v1]');
  return options;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{const options=parseSourceContextArgs(process.argv.slice(2));
    const result=buildSourceContext({sourceDir:options['--source'],archiveDirectory:options['--archives'],scope:options['--scope']??'core',planOnly:Boolean(options['--plan']),configArchiveDirectory:options['--config-archives'],structuralTypeOperations:options['--type-operations']==='structural',sourceProvenance:options['--context-selection']==='source-provenance',declaredTypesDirectory:options['--declared-types'],additionalSelectors:options.additionalSelectors,transitiveSourceProvenance:options['--transitive-sources']==='locked-v1'});
    if(options.additionalSelectorInput)(result.externalContext?.archivePlan??result).additionalSelectorInput=options.additionalSelectorInput;
    const read=readSemanticArtifact;
    if(options['--plan']){fs.writeFileSync(options['--plan'],serializeConsolidated(result));console.log(JSON.stringify({archives:result.archives.length,blockers:result.blockers.length}));}
    else if(options['--check-set']){const paths=JSON.parse(fs.readFileSync(options['--check-set'])),checked=validateConsolidatedSet(paths.map(file=>({path:file})),result,document=>read(document.path));console.log(JSON.stringify(checked));if(!checked.valid)process.exitCode=1;}
    else if(options['--check']){const checked=validateConsolidated(read(options['--check']),result);console.log(JSON.stringify(checked));if(!checked.valid)process.exitCode=1;}
    else{const file=options['--output'];writeSemanticArtifact(file,result,{sharded:Boolean(options['--declared-types'])});const summary=summarizeSourceContext(result,{path:file,sha256:hash(fs.readFileSync(file))});if(options['--summary'])fs.writeFileSync(options['--summary'],serializeConsolidated(summary));console.log(JSON.stringify(summary));}
  }catch(error){console.error(error.stack);process.exitCode=1;}
}
