import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { indexSemanticSurface, loadCompilerLibraries, semanticTypeReferences } from './m0-consolidated.mjs';
import { serializeInventory } from './source-inventory.mjs';

const projectPrefix='/__sdk54_project__/',semanticPrefix='/__sdk54_semantic__/';
const hash=text=>createHash('sha256').update(String(text)).digest('hex');
const ordered=values=>[...values].sort((a,b)=>a.localeCompare(b));
const canonical=serializeInventory;
const safePath=file=>typeof file==='string'&&file&&!file.startsWith('/')&&!file.includes('\\')&&!file.includes('\0')&&!file.split('/').some(part=>['','.','..'].includes(part));

function virtualHost(files,decode){
 const directories=new Map();
 for(const file of files.keys())for(let child=file,parent=path.posix.dirname(child);parent!=='.';child=parent,parent=path.posix.dirname(child)){
  if(!directories.has(parent))directories.set(parent,new Set());directories.get(parent).add(path.posix.basename(child));
 }
 return {fileExists:absolute=>files.has(decode(absolute)),readFile:absolute=>{const text=files.get(decode(absolute));return text===undefined?undefined:String(text);},
  directoryExists:absolute=>{const file=decode(absolute);return file===''||file==='.'||directories.has(file);},
  getDirectories:absolute=>{const file=decode(absolute);return ordered(directories.get(file)??[]).filter(name=>directories.has(file+'/'+name));},
  getCurrentDirectory:()=>projectPrefix,useCaseSensitiveFileNames:true,realpath:absolute=>{const file=decode(absolute);return file===null?absolute:projectPrefix+file;}};
}

function verifyConfig(config,files,inputs,packages){
 if(!config||!safePath(config.path)||config.errors?.length)throw new Error(`Invalid consumer config ${config?.path}`);
 if(!Array.isArray(config.inputs)||!config.inputs.some(input=>input.path===config.path))throw new Error(`Missing config provenance ${config.path}`);
 const configInputs=new Map();
 for(const input of config.inputs){
  if(configInputs.has(input.path))throw new Error(`Duplicate config input ${input.path}`);
  if(!files.has(input.path)||hash(files.get(input.path))!==input.sha256||inputs.get(input.path)!==input.sha256)throw new Error(`Config input hash/provenance mismatch ${input.path}`);
  configInputs.set(input.path,input);
 }
 const roots=packages.map(row=>({name:row.name,directory:path.posix.dirname(row.sourcePath)}));
 const archives=[...configInputs.values()].filter(row=>row.identity).map(row=>({name:row.identity.name,directory:'__sdk54_config__/'+row.identity.name.replaceAll('/','+')+'@'+row.identity.version}));
 const decode=absolute=>{
  if(!absolute.startsWith(projectPrefix))return null;
  const file=absolute.slice(projectPrefix.length).replace(/\/$/,'');if(file===''||file==='.')return file;
  if(!safePath(file))return null;if(files.has(file))return file;
  const marker='/node_modules/',index=file.lastIndexOf(marker);if(index<0)return file;
  const request=file.slice(index+marker.length),matches=[...roots,...archives].filter(row=>request===row.name||request.startsWith(row.name+'/'));
  const candidates=[...new Set(matches.map(row=>row.directory+request.slice(row.name.length)))];
  return candidates.length===1?candidates[0]:null;
 };
 const host=virtualHost(files,decode),read=new Set(),errors=[];
 const directoryExists=host.directoryExists;
 host.directoryExists=absolute=>absolute.startsWith(projectPrefix)&&(/\/node_modules\/?$/.test(absolute)||/\/node_modules\/@[^/]+\/?$/.test(absolute))||directoryExists(absolute);
 const readFile=host.readFile;host.readFile=absolute=>{const file=decode(absolute),text=readFile(absolute);if(text!==undefined)read.add(file);return text;};
 host.onUnRecoverableConfigFileDiagnostic=diagnostic=>errors.push(diagnostic);
 host.readDirectory=(root,extensions,excludes,includes,depth)=>ts.matchFiles(root,extensions,excludes,includes,true,projectPrefix,depth,absolute=>{
  const file=decode(absolute),prefix=file&&file!=='.'?file+'/':'',entries={files:[],directories:[]};
  for(const candidate of files.keys())if(candidate.startsWith(prefix)){const tail=candidate.slice(prefix.length),slash=tail.indexOf('/');if(slash<0)entries.files.push(tail);else entries.directories.push(tail.slice(0,slash));}
  entries.directories=ordered(new Set(entries.directories));return entries;
 },absolute=>absolute);
 const parsed=ts.getParsedCommandLineOfConfigFile(projectPrefix+config.path,{},host);
 errors.push(...(parsed?.errors??[]));
 if(!parsed||errors.some(row=>![18002,18003].includes(row.code)))throw new Error(`Consumer config cannot be reconstructed ${config.path}`);
 if([...read].some(file=>!configInputs.has(file)))throw new Error(`Consumer config inheritance provenance mismatch ${config.path}`);
 if(canonical(parsed.options)!==canonical(config.options))throw new Error(`Consumer config options mismatch ${config.path}`);
 return parsed.options;
}

function selectTypeRoots({options,files,from}){
 const decode=absolute=>absolute?.startsWith(projectPrefix)&&safePath(absolute.slice(projectPrefix.length).replace(/\/$/,''))?absolute.slice(projectPrefix.length).replace(/\/$/,''):null;
 const host=virtualHost(files,decode),roots=options.typeRoots??[];
 if(roots.some(root=>decode(root)===null))throw new Error('Unsafe consumer type root outside fixed inputs');
 const selected=[];
 for(const name of ts.getAutomaticTypeDirectiveNames(options,host)){
  const result=ts.resolveTypeReferenceDirective(name,projectPrefix+from,options,host).resolvedTypeReferenceDirective,target=result?decode(result.resolvedFileName):null;
  if(!target)continue;
  const root=roots.map(decode).find(root=>target.startsWith(root+'/'));
  if(root===undefined||!files.has(target))continue;
  const relative=target.slice(root.length+1),packageName=relative.split('/')[0];
  if(!packageName||!/\.d\.[cm]?ts$/.test(target))continue;
  selected.push({name,path:target,sha256:hash(files.get(target)),packageRoot:root+'/'+packageName});
 }
 return selected.sort((a,b)=>a.name.localeCompare(b.name)||a.path.localeCompare(b.path));
}

function ambientDeclarations(selected,files){
 const visited=new Set(),declarations=[];
 const visit=(file,packageRoot)=>{
  if(visited.has(file)||!file.startsWith(packageRoot+'/')||!files.has(file)||!/\.d\.[cm]?ts$/.test(file))return;
  visited.add(file);const text=String(files.get(file)),source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  if(source.parseDiagnostics.length)throw new Error(`Invalid authorized ambient declaration ${file}`);
  for(const statement of source.statements)if(!ts.isExternalModule(source)&&ts.isModuleDeclaration(statement)&&ts.isStringLiteral(statement.name)&&!statement.name.text.includes('*'))declarations.push({path:file,sha256:hash(text),start:statement.getStart(source),end:statement.end,request:statement.name.text});
  for(const reference of source.referencedFiles)visit(path.posix.normalize(path.posix.join(path.posix.dirname(file),reference.fileName)),packageRoot);
 };
 for(const root of selected)visit(root.path,root.packageRoot);
 return declarations;
}

export function buildTypeRootIsolation({surface,files,projectContext,policy='consumer-v1',sourceContext=null}){
 if(!['consumer-v1','consumer-v2'].includes(policy))throw new Error(`Unsupported consumer isolation policy ${policy}`);
 if(policy==='consumer-v2'&&(!sourceContext||['resolve','resolveTypeReference','snapshot'].some(name=>typeof sourceContext[name]!=='function')))throw new Error('Consumer-v2 source context resolver required');
 if(!(files instanceof Map))throw new Error('Fixed consumer source files required');
 const inputs=new Map();
 for(const input of surface.inputs??[]){
  if(!safePath(input.path)||inputs.has(input.path))throw new Error(`Duplicate or invalid input provenance ${input.path}`);
  if(!files.has(input.path)||hash(files.get(input.path))!==input.sha256)throw new Error(`Consumer input hash mismatch ${input.path}`);
  inputs.set(input.path,input.sha256);
 }
 for(const file of files.keys())if(!safePath(file)||!inputs.has(file))throw new Error(`Missing fixed source provenance ${file}`);
 const useIds=new Set();for(const use of surface.uses??[]){if(!use.id||useIds.has(use.id))throw new Error(`Duplicate USE identity ${use.id}`);useIds.add(use.id);}
 const configs=new Map();for(const config of projectContext?.configs??[]){if(configs.has(config.path))throw new Error(`Duplicate config identity ${config.path}`);configs.set(config.path,config);}
 const groups=new Map(),resolutions=new Map();
 for(const row of surface.resolutions??[]){
  if(resolutions.has(row.key))throw new Error(`Duplicate resolution identity ${row.key}`);resolutions.set(row.key,row);
  for(const observation of row.observations??[]){
   const evidence=observation.resolution?.typeRootContext;if(!evidence)continue;
   const config=configs.get(evidence.config?.path);
   if(!config||canonical(evidence.config.inputs)!==canonical(config.inputs))throw new Error(`Type root config provenance mismatch ${evidence.config?.path}`);
   if(row.key!==row.from+'\0'+row.request||!files.has(row.from))throw new Error(`Invalid consumer resolution provenance ${row.key}`);
   let directory=path.posix.dirname(row.from),nearest=null;
   while(directory!=='.'){if(files.has(directory+'/tsconfig.json')){nearest=directory+'/tsconfig.json';break;}directory=path.posix.dirname(directory);}
   if(!nearest&&files.has('tsconfig.json'))nearest='tsconfig.json';
   if(nearest!==config.path)throw new Error(`Consumer config selection mismatch ${row.from}`);
   const groupKey=canonical({path:config.path,inputs:config.inputs,options:config.options});
   if(!groups.has(groupKey))groups.set(groupKey,{config,evidence:[],resolutions:new Map()});
   const group=groups.get(groupKey);group.resolutions.set(row.key,row);group.evidence.push({row,evidence});
  }
 }
 const sourceResolutions=new Map();
 for(const row of resolutions.values()){
  const targets=new Set((row.observations??[]).map(row=>row.resolution).filter(row=>row?.status==='source').map(row=>row.path));
  if(targets.size===1){const [target]=targets;if(!inputs.has(target)||!files.has(target))throw new Error(`Missing source resolution provenance ${target}`);sourceResolutions.set(row.key,target);}
 }
 const libraries=loadCompilerLibraries(),contexts=[];
 for(const [groupKey,group] of [...groups].sort((a,b)=>a[1].config.path.localeCompare(b[1].config.path))){
  const options=verifyConfig(group.config,files,inputs,surface.packages??[]),consumerPaths=ordered(new Set([...group.resolutions.values()].map(row=>row.from)));
  const selected=selectTypeRoots({options,files,from:consumerPaths[0]}),authorized=ambientDeclarations(selected,files);
  for(const {row,evidence} of group.evidence){
   if(evidence.status!=='project-type-root-context'||!evidence.declarations?.length)throw new Error(`Invalid type root declaration evidence ${row.key}`);
   for(const declaration of evidence.declarations)if(!authorized.some(allowed=>allowed.request===row.request&&canonical({path:allowed.path,sha256:allowed.sha256,start:allowed.start,end:allowed.end})===canonical(declaration)))throw new Error(`Unauthorized type root declaration/hash ${row.key}`);
  }
  const id='CONSUMER-TYPE-CONTEXT:'+hash(groupKey),candidates=(surface.uses??[]).filter(use=>group.resolutions.has(use.resolutionKey));
  for(const use of candidates)if(use.source?.path!==group.resolutions.get(use.resolutionKey).from)throw new Error(`USE source provenance mismatch ${use.id}`);
  const compilerOptions={...options,typeRoots:(options.typeRoots??[]).map(root=>root.replace(projectPrefix,semanticPrefix))};for(const key of ['baseUrl','pathsBasePath','rootDir','outDir','declarationDir','configFilePath'])if(typeof compilerOptions[key]==='string')compilerOptions[key]=compilerOptions[key].replace(projectPrefix,semanticPrefix);
  const graph=indexSemanticSurface({files,packages:surface.packages??[],libraries,exportRoots:false,symbolicGenerics:true,structuralTypeOperations:true,declarationInstanceLimit:8,maxTypes:30000,consumerProjection:{rootPaths:consumerPaths,ambientRootPaths:selected.map(row=>row.path),compilerOptions,contextId:id,referenceCandidates:candidates,resolutions:sourceResolutions,...(policy==='consumer-v2'?{sourceContext}:{})}});
  const byUse=new Map(candidates.map(use=>[use.id,use]));
  for(const reference of graph.references){
   const use=byUse.get(reference.id),targetDeclarations=reference.symbolDeclarations;
   const verified=targetDeclarations.length&&targetDeclarations.every(declaration=>authorized.some(allowed=>allowed.request===use.request&&allowed.path===declaration.path&&allowed.start<=declaration.start&&allowed.end>=declaration.end));
   reference.status=verified?'BINDING_VERIFIED':reference.status==='SYMBOL_EVALUATED'?'SYMBOL_OUTSIDE_AUTHORIZED_MODULE':reference.status;
   if(!verified&&!reference.boundaries.includes('symbol-outside-authorized-ambient-module'))reference.boundaries.push('symbol-outside-authorized-ambient-module');
   const type=graph.types.find(row=>row.id===reference.typeId);if(type?.hasTransitiveBoundary)reference.boundaries.push('context-type-has-boundary');
   if(graph.consumerProjection.diagnostics.some(row=>row.origin==='program-file-processing'))reference.boundaries.push('unresolved-declaration-input');
   if(graph.consumerProjection.diagnostics.some(row=>row.origin==='program-file-processing'&&row.code===2688))reference.boundaries.push('unresolved-explicit-type-directive');
   reference.boundaries=ordered(new Set(reference.boundaries));
  }
  const typeIds=new Set(graph.types.map(row=>row.id));
  if(graph.types.some(row=>semanticTypeReferences(row).some(id=>!typeIds.has(id))))throw new Error(`Dangling consumer type reference ${id}`);
  const diagnostics=graph.consumerProjection.diagnostics,boundaries=ordered(new Set([...graph.references.flatMap(row=>row.boundaries),...(diagnostics.length?['isolated-program-diagnostic']:[])]));
  if(policy==='consumer-v2'){
   for(const row of graph.consumerProjection.sourceResolutions){
    if(row.result?.contextBoundary)boundaries.push(row.result.contextBoundary);
    if(row.result?.status==='source'&&!['fixed-source-map','fixed-relative-source','configured-type-root'].includes(row.result.selection))boundaries.push('consumer-declaration-source-not-installed');
   }
  }
  contexts.push({id,config:{path:group.config.path,inputs:group.config.inputs,options:group.config.options},consumerPaths,resolutionKeys:ordered(group.resolutions.keys()),selectedTypeRoots:selected,ambientRootPaths:selected.map(row=>row.path),programInputs:graph.consumerProjection.programInputs,graph,references:graph.references,diagnostics,boundaries:ordered(new Set(boundaries)),...(policy==='consumer-v2'?{sourceResolutions:graph.consumerProjection.sourceResolutions}:{})});
 }
 const references=contexts.flatMap(row=>row.references),statuses=ordered(new Set(references.map(row=>row.status)));
 return {policy,source:{compilerVersion:ts.version,meaning:'fresh consumer checker using verified fixed inputs; shared graph and runtime acceptance unchanged'},contexts,
  summary:{contexts:contexts.length,resolutions:[...groups.values()].reduce((count,group)=>count+group.resolutions.size,0),uses:references.length,bindingVerified:references.filter(row=>row.status==='BINDING_VERIFIED').length,byStatus:Object.fromEntries(statuses.map(status=>[status,references.filter(row=>row.status===status).length]))},
  boundaries:ordered(new Set(['shared-semantic-type-status-unchanged','runtime-acceptance-not-verified',...contexts.flatMap(row=>row.boundaries)]))};
}
