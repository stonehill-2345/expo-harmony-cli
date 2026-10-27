import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';
import { buildSourceInventory, readSourceTree, readSourceBlobs, serializeInventory } from './source-inventory.mjs';
import { selectWorkspaceSources } from './workspace-surface.mjs';
import { createWorkspaceResolver } from './workspace-export-graph.mjs';
import { createProjectSourceContext } from './m0-project-context.mjs';
import { projectTemplateSource } from './m0-template-projection.mjs';

const virtual='/__sdk54_semantic__/',compilerRoot='/__sdk54_compiler__/';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const code=file=>/\.[cm]?[jt]sx?$/.test(file);
const key=value=>String(value).replaceAll('~','~0').replaceAll('/','~1');
export const serializeConsolidated=value=>serializeInventory(value).replaceAll('/','\\/');

export const semanticTypeReferences=t=>[...t.arguments,...t.constituents,...t.properties.map(p=>p.typeId),
  ...[...t.calls,...t.constructs].flatMap(s=>[s.returnTypeId,...s.typeParameters,...s.parameters.map(p=>p.typeId)]),
  ...(t.indexes??[]).flatMap(i=>[i.keyTypeId,i.typeId]),t.constraintTypeId,t.defaultTypeId,t.genericDefinitionTypeId,
  t.sourceFamilyRepresentativeTypeId,t.checkTypeId,t.extendsTypeId,t.trueTypeId,t.falseTypeId,t.objectTypeId,t.indexTypeId,t.baseConstraintTypeId,
  ...(t.aliasTypeArguments??[])].filter(Boolean);

export function loadCompilerLibraries(){
  const folder=path.dirname(ts.getDefaultLibFilePath({target:ts.ScriptTarget.Latest}));
  return new Map(fs.readdirSync(folder).filter(name=>/^lib(?:\..+)?\.d\.ts$/.test(name)).sort().map(name=>[name,fs.readFileSync(path.join(folder,name),'utf8')]));
}

export function indexSemanticSurface({files,packages,libraries=loadCompilerLibraries(),inferredCandidates=[],pluginCandidates=[],maxTypes=150000,externalContext=null,projectContext=null,symbolicGenerics=false,declarationInstanceLimit=Infinity,structuralTypeOperations=false,exportRoots=true,consumerProjection=null}){
  if(declarationInstanceLimit!==Infinity&&(!Number.isInteger(declarationInstanceLimit)||declarationInstanceLimit<1))throw new Error('Invalid declaration instance limit');
  const sources=new Map(),excludedAmbientFiles=[],projections=[],resolve=createWorkspaceResolver({files,packages});
  const project=projectContext===true?createProjectSourceContext({files,packages}):projectContext;
  const allFiles=new Map([...files,...(externalContext?.files??[])]);
  for(const [file,text] of [...allFiles].sort(([a],[b])=>a.localeCompare(b))){
    if(!code(file)&&!file.endsWith('.json'))continue;
    const original=String(text),{text:projected}=projectTemplateSource({path:file,text:original});
    if(projected!==original)projections.push(file);
    const source=ts.createSourceFile(virtual+file,projected,ts.ScriptTarget.Latest,true,file.endsWith('.json')?ts.ScriptKind.JSON:undefined);sources.set(source.fileName,source);
    if(!ts.isExternalModule(source)&&source.statements.some(n=>ts.isModuleDeclaration(n)&&ts.isStringLiteral(n.name)))excludedAmbientFiles.push(file);
  }
  for(const [name,text] of libraries)sources.set(compilerRoot+name,ts.createSourceFile(compilerRoot+name,String(text),ts.ScriptTarget.Latest,true));
  const loc=node=>{const sf=node.getSourceFile(),start=node.getStart(sf),position=sf.getLineAndCharacterOfPosition(start);return {path:sf.fileName.startsWith(compilerRoot)?sf.fileName.slice(compilerRoot.length):sf.fileName.slice(virtual.length),origin:sf.fileName.startsWith(compilerRoot)?'compiler-library':externalContext?.files.has(sf.fileName.slice(virtual.length))?'verified-external-declaration':'fixed-source',line:position.line+1,column:position.character+1,start,end:node.end,kind:ts.SyntaxKind[node.kind]};};
  const roots=consumerProjection?[...new Set(consumerProjection.rootPaths)].sort().map(file=>virtual+file):[...sources.keys()].filter(file=>file.startsWith(virtual)&&files.has(file.slice(virtual.length))&&code(file)&&!excludedAmbientFiles.includes(file.slice(virtual.length)));
  if(consumerProjection){
    if(!consumerProjection.contextId)throw new Error('Missing consumer context identity');
    for(const file of [...roots,...consumerProjection.ambientRootPaths.map(file=>virtual+file)])if(!sources.has(file))throw new Error(`Missing consumer projection input ${file}`);
    const ids=new Set();for(const candidate of consumerProjection.referenceCandidates){if(!candidate.id||ids.has(candidate.id))throw new Error(`Duplicate consumer reference identity ${candidate.id}`);ids.add(candidate.id);}
  }
  const consumerSources=consumerProjection?.sourceContext,consumerSourceRecords=new Map(),consumerResolutionCache=new Map();
  if(consumerSources&&['resolve','resolveTypeReference','snapshot'].some(name=>typeof consumerSources[name]!=='function'))throw new Error('Invalid consumer source context resolver');
  const consumerSourceInputs=new Map((consumerSources?.snapshot().files??[]).map(row=>[row.path,row.sha256]));
  const checkedConsumerSource=(file,external=false)=>{
    if(typeof file!=='string'||!file||file.startsWith('/')||file.includes('\\')||file.includes('\0')||file.split('/').some(part=>['','.','..'].includes(part))||!files.has(file)||!sources.has(virtual+file))throw new Error(`Unsafe or missing fixed consumer source provenance ${file}`);
    const sha256=hash(String(files.get(file)));
    if(external&&consumerSourceInputs.get(file)!==sha256)throw new Error(`Consumer source input hash/provenance mismatch ${file}`);
    return {path:file,sha256};
  };
  const resolveConsumer=(kind,request,from,attempt)=>{
    const identity=kind+'\0'+from+'\0'+request;
    if(consumerResolutionCache.has(identity))return consumerResolutionCache.get(identity);
    const {result,resolved,external=false}=attempt(),selectedPath=resolved?.resolvedFileName?.startsWith(virtual)?resolved.resolvedFileName.slice(virtual.length):null;
    const input=selectedPath?checkedConsumerSource(selectedPath,external):null;
    consumerSourceRecords.set(identity,{kind,request,from,result,selectedPath,input});
    consumerResolutionCache.set(identity,resolved);return resolved;
  };
  const resolutionRecords=new Map();
  const host={getSourceFile:file=>sources.get(file),getDefaultLibFileName:()=>compilerRoot+'lib.esnext.full.d.ts',getDefaultLibLocation:()=>compilerRoot,
    writeFile(){},getCurrentDirectory:()=>virtual,getDirectories:()=>[],fileExists:file=>sources.has(file),readFile:file=>sources.get(file)?.text,
    getCanonicalFileName:file=>file,useCaseSensitiveFileNames:()=>true,getNewLine:()=>'\n',
    resolveModuleNames:(requests,containing)=>requests.map(request=>{
      if(!containing.startsWith(virtual))return undefined;
      if(consumerProjection){
        const from=containing.slice(virtual.length),selected=consumerProjection.resolutions?.get(from+'\0'+request);
        if(consumerSources)return resolveConsumer('module',request,from,()=>{
          if(selected){checkedConsumerSource(selected);return {result:{status:'source',path:selected,selection:'fixed-source-map'},resolved:{resolvedFileName:virtual+selected,extension:ts.extensionFromPath(selected)}};}
          // Archive-relative imports must retain the resolver's package boundary checks.
          const native=request.startsWith('.')&&!from.startsWith('__sdk54_external__/')?ts.resolveModuleName(request,containing,options,host).resolvedModule:undefined;
          if(native)return {result:{status:'source',path:native.resolvedFileName.slice(virtual.length),selection:'fixed-relative-source'},resolved:native};
          const result=consumerSources.resolve(request,from);
          if(result.status!=='source')return {result};
          checkedConsumerSource(result.path,true);
          return {result,resolved:{resolvedFileName:virtual+result.path,extension:ts.extensionFromPath(result.path)},external:true};
        });
        if(selected&&sources.has(virtual+selected))return {resolvedFileName:virtual+selected,extension:selected.endsWith('.d.ts')?ts.Extension.Dts:selected.endsWith('.tsx')?ts.Extension.Tsx:selected.endsWith('.json')?ts.Extension.Json:/\.[cm]?js$/.test(selected)?ts.Extension.Js:ts.Extension.Ts};
        return request.startsWith('.')?ts.resolveModuleName(request,containing,options,host).resolvedModule:undefined;
      }
      const from=containing.slice(virtual.length),local=project&&!externalContext?.files.has(from)?project.resolve(request,from):null;
      const missingConfig=local?.status==='project-config-boundary';
      let resolution=local&&local.status!=='unresolved'&&!missingConfig?local:resolve(request,from);
      if(externalContext&&resolution.status!=='source'&&(!project||(!local||local.status==='unresolved'||missingConfig)&&resolution.kind!=='workspace')){const external=externalContext.resolve(request,from);if(external.status==='source'||external.status!=='unresolved')resolution=external;}
      if(missingConfig)resolution={...resolution,projectConfig:local.config,projectConfigErrors:local.errors,projectContextBoundary:'project-config-not-verified'};
      resolutionRecords.set(from+'\0'+request,{request,sourcePath:from,resolution});
      if(resolution.status!=='source'||!sources.has(virtual+resolution.path))return undefined;
      const extension=resolution.path.endsWith('.d.ts')?ts.Extension.Dts:resolution.path.endsWith('.tsx')?ts.Extension.Tsx:resolution.path.endsWith('.jsx')?ts.Extension.Jsx:resolution.path.endsWith('.json')?ts.Extension.Json:/\.[cm]?js$/.test(resolution.path)?ts.Extension.Js:ts.Extension.Ts;
      return {resolvedFileName:virtual+resolution.path,extension};
    })};
  if(externalContext)host.resolveTypeReferenceDirectives=(requests,containing)=>requests.map(request=>{const name=typeof request==='string'?request:request.fileName,result=externalContext.resolveTypeReference(name,containing?.startsWith(virtual)?containing.slice(virtual.length):containing);return result.status==='source'?{resolvedFileName:virtual+result.path,primary:true}:ts.resolveTypeReferenceDirective(name,containing,{target:ts.ScriptTarget.Latest,module:ts.ModuleKind.CommonJS,types:[]},host).resolvedTypeReferenceDirective;});
  const options={noEmit:true,types:[],strict:true,allowJs:true,checkJs:false,skipLibCheck:true,target:ts.ScriptTarget.Latest,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.Preserve,resolveJsonModule:true,...(consumerProjection?.compilerOptions??{})};
  if(consumerProjection){
    // Automatic type entry selection is already verified by the consumer builder.
    options.types=[];options.noEmit=true;
    const directories=new Set();for(const file of sources.keys())for(let dir=path.posix.dirname(file);dir!=='/';dir=path.posix.dirname(dir))directories.add(dir);
    host.directoryExists=file=>directories.has(path.posix.normalize(file));
    host.getDirectories=file=>[...directories].filter(dir=>path.posix.dirname(dir)===path.posix.normalize(file)).sort();
    if(consumerSources)host.resolveTypeReferenceDirectives=(requests,containing)=>requests.map(request=>{
      const name=typeof request==='string'?request:request.fileName,from=containing?.startsWith(virtual)?containing.slice(virtual.length):null;
      if(from===null)return undefined;
      return resolveConsumer('type-directive',name,from,()=>{
        const native=ts.resolveTypeReferenceDirective(name,containing,options,host).resolvedTypeReferenceDirective;
        if(native)return {result:{status:'source',path:native.resolvedFileName.slice(virtual.length),selection:'configured-type-root'},resolved:native};
        const result=consumerSources.resolveTypeReference(name,from);
        if(result.status!=='source')return {result};
        checkedConsumerSource(result.path,true);
        return {result,resolved:{resolvedFileName:virtual+result.path,primary:true},external:true};
      });
    });
  }
  const program=ts.createProgram([...roots,...(consumerProjection?consumerProjection.ambientRootPaths:externalContext?.rootFiles??[]).map(p=>virtual+p)],options,host),checker=program.getTypeChecker();
  const verifyConsumerProgram=current=>{
    if(!consumerSources)return;
    // Native path references load additional files without invoking the source resolver.
    for(const source of current.getSourceFiles())if(source.fileName.startsWith(virtual+'__sdk54_external__/')){
      const file=source.fileName.slice(virtual.length),archiveRoot=file.split('/').slice(0,2).join('/')+'/';
      checkedConsumerSource(file,true);
      for(const reference of source.referencedFiles){
        const request=reference.fileName,target=path.posix.normalize(path.posix.join(path.posix.dirname(file),request));
        if(request.startsWith('/')||request.includes('\\')||request.includes('\0')||!target.startsWith(archiveRoot))throw new Error(`Unsafe consumer archive path reference boundary ${file}: ${request}`);
      }
    }
  };
  verifyConsumerProgram(program);
  const types=[],queue=[],typeIds=new Map(),exports=[],modules=[],inferences=[],plugins=[],references=[];
  const namespace=consumerProjection?key(consumerProjection.contextId)+':':'';
  const ensure=(type,depth=0)=>{
    if(!type)return null;if(typeIds.has(type))return typeIds.get(type);
    if(types.length>=maxTypes){
      const repeated=new Map();for(const r of types){const source=r.declarations[0];if(source){const key=source.path+':'+source.start;repeated.set(key,(repeated.get(key)??0)+1);}}
      const largest=[...repeated].sort((a,b)=>b[1]-a[1]).slice(0,5);
      throw new Error(`Semantic type budget exceeded (${maxTypes}); no complete artifact emitted; repeated declarations: ${JSON.stringify(largest)}`);
    }
    const id=`TYPE:${namespace}${String(types.length+1).padStart(7,'0')}`;
    typeIds.set(type,id);const record={id,kind:'pending',display:checker.typeToString(type,undefined,ts.TypeFormatFlags.NoTruncation),properties:[],calls:[],constructs:[],arguments:[],constituents:[],boundaries:[],declarations:[]};
    types.push(record);queue.push({type,record,depth});return id;
  };
  const unwrap=symbol=>symbol?.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(symbol):symbol;
  const rootFiles=[...roots].sort();
  for(const absolute of rootFiles){
    const source=sources.get(absolute),file=absolute.slice(virtual.length),moduleId=`MODULE:${namespace}${file}`,symbol=checker.getSymbolAtLocation(source)??source.symbol;
    const boundaries=[];
    if(source.parseDiagnostics.length)boundaries.push('parse-diagnostics');if(projections.includes(file))boundaries.push('uninstantiated-template');
    const visit=node=>{
      if(ts.isBinaryExpression(node)&&ts.isPropertyAccessExpression(node.left)&&/^(?:module\.exports|exports\.)/.test(node.left.getText(source)))boundaries.push('commonjs-source-projection');
      ts.forEachChild(node,visit);
    };visit(source);
    modules.push({id:moduleId,source:{path:file,sha256:hash(String(files.get(file)))},boundaries:[...new Set(boundaries)],diagnostics:[],dependencies:[]});
    for(const binding of (exportRoots&&symbol?checker.getExportsOfModule(symbol):[]).sort((a,b)=>a.getName().localeCompare(b.getName()))){
      const target=unwrap(binding),declaration=target?.valueDeclaration??target?.declarations?.[0],origin=(target?.declarations??[]).map(loc);
      const type=target?(target.flags&ts.SymbolFlags.Value?checker.getTypeOfSymbolAtLocation(target,declaration??source):checker.getDeclaredTypeOfSymbol(target)):null;
      const instance=target?.flags&ts.SymbolFlags.Class?checker.getDeclaredTypeOfSymbol(target):null;
      exports.push({id:`SEMANTIC-EXPORT:${namespace}${file}#${key(binding.getName())}`,moduleId,name:binding.getName(),typeId:ensure(type),instanceTypeId:ensure(instance),declarations:origin,
        typeOnlySyntax:binding.declarations?.some(d=>ts.isExportSpecifier(d)&&(d.isTypeOnly||d.parent.parent.isTypeOnly))??false,boundaries:origin.length?[]:['missing-symbol-origin']});
    }
  }
  if(consumerProjection){
    const ranges=new Map();
    for(const candidate of consumerProjection.referenceCandidates){
      const source=program.getSourceFile(virtual+candidate.source?.path);
      if(source&&!ranges.has(source.fileName)){
        const index=new Map();const visit=node=>{index.set(node.getStart(source)+':'+node.end,node);ts.forEachChild(node,visit);};visit(source);ranges.set(source.fileName,index);
      }
      const node=source?ranges.get(source.fileName).get(candidate.source.start+':'+candidate.source.end):null;
      if(!node){references.push({id:candidate.id,source:candidate.source,typeId:null,symbolDeclarations:[],status:source?'RANGE_UNMATCHED':'SOURCE_UNAVAILABLE',boundaries:[source?'exact-reference-range-unmatched':'consumer-source-unavailable']});continue;}
      let symbol=checker.getSymbolAtLocation(node),typeNode=node;
      if(ts.isShorthandPropertyAssignment(node.parent)&&node.parent.name===node)symbol=checker.getShorthandAssignmentValueSymbol(node.parent);
      if(ts.isExportSpecifier(node.parent)&&!node.parent.parent.parent.moduleSpecifier)symbol=checker.getExportSpecifierLocalTargetSymbol(node.parent);
      if(ts.isStringLiteralLike(node)&&ts.isLiteralTypeNode(node.parent)&&ts.isImportTypeNode(node.parent.parent)){
        typeNode=node.parent.parent;symbol=checker.getSymbolAtLocation(typeNode.qualifier??node);
      }
      symbol=unwrap(symbol);
      const declarations=(symbol?.declarations??[]).map(loc),type=checker.getTypeAtLocation(typeNode),boundaries=[];
      if(!declarations.length)boundaries.push('missing-symbol-origin');
      if(type.flags&ts.TypeFlags.Any)boundaries.push(type.intrinsicName==='error'?'compiler-error-type':'unconstrained-any');
      references.push({id:candidate.id,source:candidate.source,typeId:ensure(type),symbolDeclarations:declarations,status:declarations.length?'SYMBOL_EVALUATED':'UNRESOLVED_SYMBOL',boundaries});
    }
  }
  // Match the original candidates by exact syntax position, not a guessed declaration name.
  const nodeMaps=new Map();
  const candidateNode=candidate=>{
    const source=sources.get(virtual+candidate.source.path);let node=null;
    if(source){if(!nodeMaps.has(source)){const map=new Map();const walk=n=>{if(ts.isVariableDeclaration(n)||ts.isFunctionDeclaration(n)||ts.isClassDeclaration(n))map.set(n.getStart(source),n);ts.forEachChild(n,walk);};walk(source);nodeMaps.set(source,map);}const start=candidate.source.start??source.getPositionOfLineAndCharacter(candidate.source.line-1,candidate.source.column-1);node=nodeMaps.get(source).get(start);}
    return {node,source};
  };
  for(const candidate of inferredCandidates){
    const {node,source}=candidateNode(candidate);
    const excluded=node&&!program.getSourceFile(source.fileName);
    const typeId=node&&!excluded?ensure(checker.getTypeAtLocation(node)):null;
    inferences.push({id:candidate.id,source:candidate.source,typeId,status:excluded?'EXCLUDED_CONTEXT':typeId?'EVALUATED':'MISSING_DECLARATION',meaning:'compiler result in isolated source projection; not unconditional type completeness'});
  }
  for(const candidate of pluginCandidates){
    const {node,source}=candidateNode(candidate),active=node&&program.getSourceFile(source.fileName),pluginType=active?checker.getTypeAtLocation(node):null;
    const signatures=pluginType?checker.getSignaturesOfType(pluginType,ts.SignatureKind.Call):[],options=signatures.map(s=>s.getParameters()[1]).filter(Boolean);
    const optionsTypeIds=options.map(p=>ensure(checker.getTypeOfSymbolAtLocation(p,p.valueDeclaration??p.declarations?.[0]??node)));
    plugins.push({id:candidate.id,name:candidate.name,source:candidate.source,typeId:ensure(pluginType),optionsTypeId:optionsTypeIds[0]??null,optionsTypeIds,
      status:!node?'MISSING_DECLARATION':!active?'EXCLUDED_CONTEXT':!signatures.length?'MISSING_CALL_SIGNATURE':'EVALUATED',
      meaning:'declared ConfigPlugin candidate and compiler props type; not all runtime consumers/defaults or schema correspondence acceptance'});
  }
  const syntaxReadonly=node=>ts.canHaveModifiers(node)&&(ts.getModifiers(node)??[]).some(m=>m.kind===ts.SyntaxKind.ReadonlyKeyword);
  const hidden=symbol=>(symbol.declarations??[]).some(d=>d.name&&ts.isPrivateIdentifier(d.name)||ts.canHaveModifiers(d)&&(ts.getModifiers(d)??[]).some(m=>[ts.SyntaxKind.PrivateKeyword,ts.SyntaxKind.ProtectedKeyword].includes(m.kind)));
  const signature=(sig,depth)=>({source:sig.declaration?loc(sig.declaration):null,
    parameters:sig.getParameters().map(p=>{const d=p.valueDeclaration??p.declarations?.[0]??sig.declaration;return {name:p.getName(),optional:Boolean(p.flags&ts.SymbolFlags.Optional)||Boolean(d?.questionToken||d?.initializer),rest:Boolean(d?.dotDotDotToken),source:d?loc(d):null,typeId:ensure(checker.getTypeOfSymbolAtLocation(p,d),depth+1)};}),
    typeParameters:(sig.typeParameters??[]).map(t=>ensure(t,depth+1)),returnTypeId:ensure(checker.getReturnTypeOfSignature(sig),depth+1)});
  const declarationInstances=new Map();
  for(let i=0;i<queue.length;i++){
    const {type,record:r,depth}=queue[i],flags=type.flags;
    const symbol=type.aliasSymbol??type.symbol;r.declarations=(symbol?.declarations??[]).map(loc);
    if(depth>128){r.kind='analysis-boundary';r.boundaries.push('analysis-depth-limit');continue;}
    if(declarationInstanceLimit!==Infinity&&r.declarations.length){
      const identity=r.declarations.map(d=>d.origin+':'+d.path+':'+d.start).join('|'),family=declarationInstances.get(identity)??{count:0,representative:r.id};family.count++;declarationInstances.set(identity,family);
      if(family.count>declarationInstanceLimit){r.kind='declaration-instantiation-boundary';r.sourceFamilyRepresentativeTypeId=family.representative;r.boundaries.push('declaration-instantiation-detail-budget');continue;}
    }
    if(type.aliasTypeArguments)r.arguments=type.aliasTypeArguments.map(t=>ensure(t,depth+1));
    else if(flags&ts.TypeFlags.Object&&(type.objectFlags&ts.ObjectFlags.Reference))r.arguments=checker.getTypeArguments(type).map(t=>ensure(t,depth+1));
    if(structuralTypeOperations){
      if(type.aliasTypeArguments)r.aliasTypeArguments=type.aliasTypeArguments.map(t=>ensure(t,depth+1));
      if(flags&ts.TypeFlags.Object&&(type.objectFlags&ts.ObjectFlags.Reference))r.arguments=checker.getTypeArguments(type).map(t=>ensure(t,depth+1));
    }
    if(symbolicGenerics&&r.arguments.length&&r.declarations.length&&symbol?.declarations?.some(d=>d.typeParameters?.length)){
      const definition=checker.getDeclaredTypeOfSymbol(symbol);
      if(definition&&definition!==type){r.kind='generic-application';r.genericDefinitionTypeId=ensure(definition,depth+1);r.boundaries.push('symbolic-generic-members-not-instantiated');continue;}
    }
    if(flags&ts.TypeFlags.Any){r.kind='any';r.boundaries.push(type.intrinsicName==='error'?'compiler-error-type':'unconstrained-any');continue;}
    if(flags&ts.TypeFlags.Unknown){r.kind='unknown';r.boundaries.push('unconstrained-unknown');continue;}
    if(type.isUnionOrIntersection()){r.kind=type.isUnion()?'union':'intersection';r.constituents=type.types.map(t=>ensure(t,depth+1));if(type.isUnion())continue;}
    if(flags&ts.TypeFlags.TypeParameter){
      r.kind='type-parameter';const declaration=type.symbol?.declarations?.find(ts.isTypeParameterDeclaration);
      const baseConstraint=checker.getBaseConstraintOfType(type);
      const constraint=structuralTypeOperations&&declaration?.constraint?checker.getTypeFromTypeNode(declaration.constraint):baseConstraint;
      r.constraintTypeId=constraint&&constraint!==type?ensure(constraint,depth+1):null;
      if(structuralTypeOperations)r.baseConstraintTypeId=baseConstraint&&baseConstraint!==type?ensure(baseConstraint,depth+1):null;
      r.defaultTypeId=declaration?.default?ensure(checker.getTypeAtLocation(declaration.default),depth+1):null;continue;
    }
    if(structuralTypeOperations&&flags&ts.TypeFlags.Conditional){
      const node=type.root?.node;
      if(!node||!ts.isConditionalTypeNode(node))throw new Error(`Missing conditional type source ${r.id}`);
      r.kind='conditional';r.operationSource=loc(node);r.distributive=Boolean(type.root.isDistributive);
      r.checkTypeId=ensure(type.checkType,depth+1);r.extendsTypeId=ensure(type.extendsType,depth+1);
      r.trueTypeId=ensure(checker.getTypeFromTypeNode(node.trueType),depth+1);r.falseTypeId=ensure(checker.getTypeFromTypeNode(node.falseType),depth+1);
      r.branchPolicy='source-declaration-branches-not-instantiated';
      r.boundaries.push('generic-operation-not-instantiated');continue;
    }
    if(structuralTypeOperations&&flags&ts.TypeFlags.IndexedAccess){
      r.kind='indexed-access';r.objectTypeId=ensure(type.objectType,depth+1);r.indexTypeId=ensure(type.indexType,depth+1);
      r.boundaries.push('generic-operation-not-instantiated');continue;
    }
    if(structuralTypeOperations&&flags&ts.TypeFlags.Index){
      r.kind='keyof';r.objectTypeId=ensure(type.type,depth+1);r.boundaries.push('generic-operation-not-instantiated');continue;
    }
    if(checker.isTupleType(type)){r.kind='tuple';r.readonlyTuple=Boolean(type.target.readonly);r.elementFlags=type.target.elementFlags;r.elementLabels=(type.target.labeledElementDeclarations??[]).map(d=>d?.name?.getText()??null);continue;}
    if(checker.isArrayType(type)){r.kind='array';continue;}
    if(r.declarations.length&&r.declarations.every(d=>d.origin==='compiler-library')){r.kind='compiler-library-reference';continue;}
    if(!(flags&(ts.TypeFlags.Object|ts.TypeFlags.Intersection))){r.kind='language-type';if(flags&(ts.TypeFlags.Conditional|ts.TypeFlags.IndexedAccess|ts.TypeFlags.Substitution))r.boundaries.push('generic-operation-not-expanded');continue;}
    if(r.kind!=='intersection')r.kind='object';
    if(type.objectFlags&ts.ObjectFlags.Mapped)r.boundaries.push('mapped-modifiers-not-verified');
    r.properties=checker.getPropertiesOfType(type).filter(p=>!hidden(p)).sort((a,b)=>a.getName().localeCompare(b.getName())).map(p=>{
      const declaration=p.valueDeclaration??p.declarations?.[0]??symbol?.declarations?.[0];
      return {name:p.getName(),optional:Boolean(p.flags&ts.SymbolFlags.Optional),readonlySyntax:(p.declarations??[]).some(syntaxReadonly),declarations:(p.declarations??[]).map(loc),typeId:ensure(checker.getTypeOfSymbolAtLocation(p,declaration),depth+1)};
    });
    r.calls=checker.getSignaturesOfType(type,ts.SignatureKind.Call).map(s=>signature(s,depth));r.constructs=checker.getSignaturesOfType(type,ts.SignatureKind.Construct).map(s=>signature(s,depth));
    r.indexes=checker.getIndexInfosOfType(type).map(info=>({keyTypeId:ensure(info.keyType,depth+1),typeId:ensure(info.type,depth+1),readonly:info.isReadonly,source:info.declaration?loc(info.declaration):null}));
  }
  const moduleMap=new Map(modules.map(m=>[m.source.path,m]));
  for(const diagnostic of program.getSemanticDiagnostics()){
    const file=diagnostic.file?.fileName;if(!file?.startsWith(virtual))continue;
    const module=moduleMap.get(file.slice(virtual.length));if(!module)continue;
    module.diagnostics.push({code:diagnostic.code,start:diagnostic.start??null,message:ts.flattenDiagnosticMessageText(diagnostic.messageText,' ').replaceAll(virtual,'')});
    module.boundaries.push('isolated-program-diagnostic');
  }
  for(const dependency of resolutionRecords.values()){
    const module=moduleMap.get(dependency.sourcePath);if(!module)continue;
    module.dependencies.push(dependency);
    if(dependency.resolution.status!=='source')module.boundaries.push('unresolved-source-dependency');
    if(dependency.resolution.alternatives?.length>1)module.boundaries.push('multiple-source-conditions');
    if(dependency.resolution.versionCompatibility==='NOT_VERIFIED')module.boundaries.push('workspace-version-not-verified');
    if(dependency.resolution.contextBoundary)module.boundaries.push(dependency.resolution.contextBoundary);
    if(dependency.resolution.projectContextBoundary)module.boundaries.push(dependency.resolution.projectContextBoundary);
  }
  for(const m of modules){m.boundaries=[...new Set(m.boundaries)].sort();m.dependencies.sort((a,b)=>a.request.localeCompare(b.request));}
  const typesById=new Map(types.map(t=>[t.id,t]));
  const parents=new Map(),affected=[];
  for(const t of types){t.hasTransitiveBoundary=Boolean(t.boundaries.length);if(t.hasTransitiveBoundary)affected.push(t.id);for(const child of semanticTypeReferences(t)){if(!parents.has(child))parents.set(child,new Set());parents.get(child).add(t.id);}}
  for(let i=0;i<affected.length;i++)for(const parent of parents.get(affected[i])??[]){const t=typesById.get(parent);if(!t.hasTransitiveBoundary){t.hasTransitiveBoundary=true;affected.push(parent);}}
  for(const inference of inferences)if(inference.typeId){const type=typesById.get(inference.typeId);inference.typeBoundaries=type.boundaries;inference.status=type.hasTransitiveBoundary?'EVALUATED_WITH_BOUNDARY':'EVALUATED';}
  for(const plugin of plugins)if(plugin.status==='EVALUATED'&&plugin.optionsTypeIds.some(id=>typesById.get(id).hasTransitiveBoundary))plugin.status='EVALUATED_WITH_BOUNDARY';
  const diagnosticRow=diagnostic=>({code:diagnostic.code,source:diagnostic.file?{path:diagnostic.file.fileName.startsWith(compilerRoot)?diagnostic.file.fileName.slice(compilerRoot.length):diagnostic.file.fileName.slice(virtual.length),start:diagnostic.start??null,length:diagnostic.length??null}:null,message:ts.flattenDiagnosticMessageText(diagnostic.messageText,' ').replaceAll(virtual,'')});
  const projectionDiagnostics=consumerProjection?ts.getPreEmitDiagnostics(program).map(diagnosticRow):null;
  if(consumerProjection){
    // Native file-processing diagnostics include path/types/lib failures hidden by skipLibCheck.
    const diagnosticOptions={...options,skipLibCheck:false,skipDefaultLibCheck:false,noCheck:false};
    const diagnosticHost={...host,getSourceFile:file=>{const original=sources.get(file);if(!original)return undefined;const source=ts.createSourceFile(file,original.text,diagnosticOptions.target,true,original.scriptKind);source.checkJsDirective=undefined;return source;}};
    const diagnosticProgram=ts.createProgram(program.getRootFileNames(),diagnosticOptions,diagnosticHost);
    verifyConsumerProgram(diagnosticProgram);
    if(typeof diagnosticProgram.getProgramDiagnostics!=='function')throw new Error('Compiler native file-processing diagnostics unavailable');
    for(const source of diagnosticProgram.getSourceFiles())for(const diagnostic of diagnosticProgram.getProgramDiagnostics(source)){
      const row={...diagnosticRow(diagnostic),origin:'program-file-processing'};
      const existing=projectionDiagnostics.find(previous=>previous.code===row.code&&previous.source?.path===row.source?.path&&previous.source?.start===row.source?.start&&previous.message===row.message);
      if(existing)existing.origin=row.origin;else projectionDiagnostics.push(row);
    }
    for(const diagnostic of diagnosticProgram.getOptionsDiagnostics()){
      const row=diagnosticRow(diagnostic);
      if(!projectionDiagnostics.some(previous=>previous.code===row.code&&previous.source?.path===row.source?.path&&previous.source?.start===row.source?.start&&previous.message===row.message))projectionDiagnostics.push({...row,origin:'program-file-processing'});
    }
  }
  return {schemaVersion:1,compilerVersion:ts.version,compilerLibraries:{package:'typescript',version:ts.version,meaning:'analysis tool declarations, not Expo source',files:[...libraries].map(([file,text])=>({path:file,sha256:hash(text)}))},
    policy:'all source-module export candidates, not a claim that every internal module is a public package entry; type identities stable for identical frozen input/compiler; no host dependencies or cross-package ambient root merging',
    inputs:[...files].sort(([a],[b])=>a.localeCompare(b)).map(([file,text])=>({path:file,sha256:hash(String(text))})),packages:[...packages].sort((a,b)=>a.id.localeCompare(b.id)),
    excludedAmbientFiles:excludedAmbientFiles.sort(),modules,exports,types,inferences,plugins,...(externalContext?{externalContext:externalContext.snapshot()}:{}),...(project?{projectContext:project.snapshot()}:{}),...(symbolicGenerics?{genericApplicationPolicy:'definition and ordered type arguments retained unless a declaration detail budget is reached; instantiated members remain an explicit analysis boundary'}:{}),...(declarationInstanceLimit!==Infinity?{declarationInstanceLimit}:{}),
    ...(structuralTypeOperations?{structuralTypeOperations:true}:{}),...(!exportRoots?{exportRootsPolicy:'plugin-candidates-only'}:{}),...(consumerProjection?{references,consumerProjection:{contextId:consumerProjection.contextId,rootPaths:[...consumerProjection.rootPaths],ambientRootPaths:[...consumerProjection.ambientRootPaths],programInputs:program.getSourceFiles().map(source=>({path:source.fileName.startsWith(compilerRoot)?source.fileName.slice(compilerRoot.length):source.fileName.slice(virtual.length),origin:source.fileName.startsWith(compilerRoot)?'compiler-library':'fixed-source',sha256:hash(String(source.fileName.startsWith(compilerRoot)?libraries.get(source.fileName.slice(compilerRoot.length)):files.get(source.fileName.slice(virtual.length))))})).sort((a,b)=>a.path.localeCompare(b.path)),diagnostics:projectionDiagnostics,...(consumerSources?{sourceResolutions:[...consumerSourceRecords.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.from.localeCompare(b.from)||a.request.localeCompare(b.request))}:{})}}:{}),publicSurfaceComplete:false,stageClosable:false};
}

export function buildClosureStatus({types=[],modules=[],inferences=[],supplements=[]}){
  const blockers=[];
  const add=(id,records,reason)=>{if(records.length)blockers.push({id,count:records.length,records,reason});};
  add('semantic-type-boundaries',types.filter(t=>t.boundaries.length).map(t=>t.id),'源内可展开部分已求值；外部错误、any/unknown、泛型操作等仍需完整来源/明确契约');
  add('semantic-context-boundaries',modules.filter(m=>m.boundaries.length).map(m=>m.id??m.source?.path??'<fixture>'),'隔离分析诊断、未解依赖、条件/版本/模板/CommonJS尚未完成逐项审阅');
  add('missing-inferred-declaration',inferences.filter(i=>i.status==='MISSING_DECLARATION').map(i=>i.id),'前置候选必须逐项定位，不能遗漏');
  add('excluded-inferred-context',inferences.filter(i=>i.status==='EXCLUDED_CONTEXT').map(i=>i.id),'被隔离的ambient上下文需要按所属包分析，不能查询未绑定节点或伪造类型');
  for(const s of supplements.filter(s=>!s.complete))blockers.push({id:`supplement:${s.id}`,count:1,records:[s.path??s.id],reason:s.reason??'前置专项仍显式未完成，不因聚合改绿'});
  for(const id of ['packages','plugins','config','commands','syntax','exports','ambient','external','metro'])if(!supplements.some(s=>s.id===id))blockers.push({id:`missing-supplement:${id}`,count:1,records:[],reason:'缺少合并验收输入'});
  return {units:{'M0-02':blockers.length?'INCOMPLETE':'READY_FOR_ACCEPTANCE','M0-03':blockers.length?'INCOMPLETE':'READY_FOR_ACCEPTANCE'},blockers,stageClosable:false,meaning:'readiness is separate from acceptance; original M0 exit rules and existing accepted units are unchanged'};
}

export function validateConsolidated(actual,expected){
  const failures=[];
  const same=(a,b)=>a===b||(Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((row,i)=>same(row,b[i])):serializeInventory(a)===serializeInventory(b));
  const typeIds=new Set((actual?.types??[]).map(t=>t.id));
  const checkReferences=(value,location,field='')=>{
    if(typeof value==='string'&&(/(?:^typeId$|TypeId$)/.test(field)||['arguments','constituents','typeParameters','optionsTypeIds','aliasTypeArguments'].includes(field))&&!typeIds.has(value))failures.push(`Dangling type reference ${value} at ${location}`);
    else if(Array.isArray(value))value.forEach((v,i)=>checkReferences(v,`${location}[${i}]`,field));
    else if(value&&typeof value==='object')for(const [k,v]of Object.entries(value))checkReferences(v,`${location}.${k}`,k);
  };
  for(const field of ['types','exports','inferences','plugins'])for(const row of actual?.[field]??[])checkReferences(row,`${field}:${row.id}`);
  for(const field of ['inputs','packages','modules','exports','types','inferences','plugins']){
    const records=new Map();for(const row of actual?.[field]??[]){const id=row.id??row.path;if(records.has(id))failures.push(`Duplicate ${field} ${id}`);records.set(id,row);}
    for(const row of expected[field]??[]){const id=row.id??row.path,value=records.get(id);if(!value||!same(value,row))failures.push(`${!value?'Missing':'Changed'} ${field} ${id} at ${row.source?.path??row.declarations?.[0]?.path??row.path??''}:${row.source?.line??row.declarations?.[0]?.line??''}`);records.delete(id);}
    for(const id of records.keys())failures.push(`Unexpected ${field} ${id}`);
  }
  const keys=value=>Object.keys(value??{}).filter(k=>value[k]!==undefined).sort();
  if(!same(keys(actual),keys(expected))||keys(expected).some(k=>!same(actual?.[k],expected[k])))failures.push('Consolidated inventory differs from fixed source reconstruction');
  return {valid:!failures.length,failures};
}

export function validateConsolidatedSet(documents,expected,readActual=document=>document.actual){
  if(!Array.isArray(documents)||!documents.length)throw new Error('Empty validation set');
  const seen=new Set(),results=documents.map(document=>{const {path}=document,checked=validateConsolidated(readActual(document),expected);if(seen.has(path)){checked.valid=false;checked.failures.push(`Duplicate validation path ${path}`);}seen.add(path);return {path,...checked};});
  return {valid:results.every(r=>r.valid),results};
}

export function buildConsolidated({sourceDir,externalContext=null,projectSources=null,maxTypes=150000,symbolicGenerics=false,declarationInstanceLimit=Infinity,structuralTypeOperations=false}){
  const inventory=buildSourceInventory({sourceDir}),{tree,entries}=readSourceTree(sourceDir,SDK54_EXPO_COMMIT),selected=projectSources?.selected??selectWorkspaceSources(entries,inventory),files=new Map();
  if(tree!==inventory.source.tree)throw new Error('Fixed tree mismatch');
  for(let i=0;i<selected.length;i+=200)for(const [file,bytes] of readSourceBlobs(sourceDir,selected.slice(i,i+200)))files.set(file,bytes.toString());
  const syntaxSummaryPath='docs/releases/sdk54-workspace-surface-summary.json',summary=JSON.parse(fs.readFileSync(syntaxSummaryPath)),bytes=fs.readFileSync(summary.artifact.path);
  if(hash(bytes)!==summary.artifact.sha256)throw new Error('Syntax artifact hash mismatch');
  const syntax=JSON.parse(gunzipSync(bytes));
  const pluginIndex=JSON.parse(fs.readFileSync('docs/releases/sdk54-plugin-source-index.json'));
  const projectContext=projectSources?createProjectSourceContext({files,entries,packages:[...inventory.packages,...inventory.templates],configArchives:projectSources.configArchives,locks:projectSources.locks,sourceProvenance:projectSources.sourceProvenance}):null;
  const result=indexSemanticSurface({files,packages:[...inventory.packages,...inventory.templates],inferredCandidates:syntax.gaps.filter(g=>g.kind==='inferred-type'),pluginCandidates:pluginIndex.modules.flatMap(m=>m.configPlugins),externalContext,projectContext,maxTypes,symbolicGenerics,declarationInstanceLimit,structuralTypeOperations});
  result.source={revision:SDK54_EXPO_COMMIT,tree};for(const input of result.inputs)input.blob=selected.find(e=>e.path===input.path).oid;
  const definitions=[
    ['packages','sdk54-source-package-inventory.json',true,'固定workspace包来源已接受，不能代替公开面'],
    ['plugins','sdk54-plugin-source-index.json',false,'fullPluginOptionsComplete=false，仍需全部插件选项语义与消费关系'],
    ['config','sdk54-config-contract.json',true,'仅配置类型/schema契约子集完成'],
    ['commands','sdk54-cli-command-surface.json',true,'仅命令/参数声明清单完成'],
    ['syntax','sdk54-workspace-surface-summary.json',false,'原9646保守候选需结合公开入口和语义逐项闭合，不能靠汇总改绿'],
    ['exports','sdk54-workspace-export-graph-summary.json',false,'原动态/CommonJS/入口/外部边界尚未全部闭合'],
    ['ambient','sdk54-ambient-modules-summary.json',false,'7处原external-star有5处声明来源、2处仍缺；并非运行来源闭合'],
    ['external','sdk54-external-source-review.json',false,'42项来源分层完成；归档/API与缺锁/身份差异尚未全部解决'],
    ['metro','sdk54-metro-type-source.json',false,'ConfigT显式声明来源完成；utility与外部类型仍未展开']
  ];
  result.supplements=definitions.map(([id,name,complete,reason])=>{const file='docs/releases/'+name,b=fs.readFileSync(file);return {id,path:file,sha256:hash(b),complete,reason};});
  result.priorSyntax={path:summary.artifact.path,sha256:hash(bytes),inferredCandidates:syntax.gaps.filter(g=>g.kind==='inferred-type').length};
  result.closure=buildClosureStatus({...result,supplements:result.supplements});return result;
}

export function summarizeConsolidated(result,artifact){return {schemaVersion:1,source:result.source,artifact,compilerVersion:result.compilerVersion,compilerLibraryFiles:result.compilerLibraries.files.length,
  counts:Object.fromEntries(['inputs','packages','modules','exports','types','inferences','plugins'].map(k=>[k,result[k].length])),
  properties:result.types.reduce((n,t)=>n+t.properties.length,0),calls:result.types.reduce((n,t)=>n+t.calls.length,0),constructs:result.types.reduce((n,t)=>n+t.constructs.length,0),
  typeKinds:Object.fromEntries([...new Set(result.types.map(t=>t.kind))].sort().map(k=>[k,result.types.filter(t=>t.kind===k).length])),
  inferenceStatuses:Object.fromEntries([...new Set(result.inferences.map(i=>i.status))].sort().map(k=>[k,result.inferences.filter(i=>i.status===k).length])),
  pluginStatuses:Object.fromEntries([...new Set(result.plugins.map(i=>i.status))].sort().map(k=>[k,result.plugins.filter(i=>i.status===k).length])),
  supplements:result.supplements,closure:{...result.closure,blockers:result.closure.blockers.map(({records,...rest})=>rest)},publicSurfaceComplete:false,stageClosable:false};}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(!['--source','--output','--check','--check-set','--summary'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Invalid args');options[args[i]]=args[i+1];}
    if(!options['--source']||['--output','--check','--check-set'].filter(k=>options[k]).length!==1||options['--summary']&&!options['--output'])throw new Error('Usage: --source <git> --output|--check <json[.gz]> | --check-set <paths.json> [--summary <json>]');
    const result=buildConsolidated({sourceDir:options['--source']});
    const readArtifact=file=>{const b=fs.readFileSync(file);return JSON.parse((file.endsWith('.gz')?gunzipSync(b):b).toString());};
    if(options['--check-set']){const paths=JSON.parse(fs.readFileSync(options['--check-set']));const checked=validateConsolidatedSet(paths.map(file=>({path:file})),result,document=>readArtifact(document.path));console.log(JSON.stringify(checked));if(!checked.valid)process.exitCode=1;}
    else if(options['--check']){const check=validateConsolidated(readArtifact(options['--check']),result);console.log(JSON.stringify(check));if(!check.valid)process.exitCode=1;}
    else{const file=options['--output'],text=serializeConsolidated(result);fs.writeFileSync(file,file.endsWith('.gz')?gzipSync(text):text);const summary=summarizeConsolidated(result,{path:file,sha256:hash(fs.readFileSync(file))});if(options['--summary'])fs.writeFileSync(options['--summary'],serializeConsolidated(summary));console.log(JSON.stringify(summary));}
  }catch(error){console.error(error.stack);process.exitCode=1;}
}
