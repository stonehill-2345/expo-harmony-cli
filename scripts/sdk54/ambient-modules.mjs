import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';
import { buildSourceInventory, readSourceTree, readSourceBlobs, serializeInventory } from './source-inventory.mjs';
import { selectWorkspaceSources } from './workspace-surface.mjs';

const virtual = '/__sdk54_ambient__/';
const hash = value => createHash('sha256').update(value).digest('hex');
const key = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');
const code = file => /\.[cm]?[jt]sx?$/.test(file);
export const serializeAmbientModules = value => serializeInventory(value).replaceAll('/', '\\/');

export function indexAmbientModules({ files, packages }) {
  const roots = packages.map(p => ({...p, directory:path.posix.dirname(p.sourcePath)})).sort((a,b)=>b.directory.length-a.directory.length||a.id.localeCompare(b.id));
  const owner = file => roots.find(p=>file.startsWith(p.directory+'/'));
  const sources = new Map(), groups = new Map(), nodes = new Map(), symbols = new Map();
  const loc = node => {const source=node.getSourceFile(),start=node.getStart(source),pos=source.getLineAndCharacterOfPosition(start);return {path:source.fileName.slice(virtual.length),line:pos.line+1,column:pos.character+1,start,end:node.end};};
  for (const [file,text] of [...files].sort(([a],[b])=>a.localeCompare(b))) {
    if(!code(file))continue;
    const source=ts.createSourceFile(virtual+file,String(text),ts.ScriptTarget.Latest,true);sources.set(source.fileName,source);
    const scan=node=>{
      if(ts.isModuleDeclaration(node)&&ts.isStringLiteral(node.name)){
        const pkg=owner(file);if(!pkg)throw new Error(`Missing ambient owner ${file}`);
        const name=node.name.text,kind=!ts.isSourceFile(node.parent)?'nested':ts.isExternalModule(source)?'augmentation':name.includes('*')?'wildcard':!node.body?'untyped':'ambient';
        const id=`AMBIENT:${key(pkg.id)}#${kind}:${key(name)}${kind==='augmentation'||kind==='nested'?':'+key(file)+':'+node.getStart(source):''}`;
        if(!groups.has(id))groups.set(id,{id,packageId:pkg.id,name,kind,declarations:[],boundaries:kind==='ambient'?[]:[`${kind}:${file}:${loc(node).line}`],diagnostics:[]});
        groups.get(id).declarations.push(loc(node));nodes.set(node,id);
      }
      ts.forEachChild(node,scan);
    };scan(source);
  }
  const edges=[],exports=[];
  for(const pkg of roots){
    const local=[...groups.values()].filter(m=>m.packageId===pkg.id&&m.kind==='ambient');if(!local.length)continue;
    // Augmentation files are indexed separately and are not globally merged into this declaration projection.
    const rootFiles=[...new Set(local.flatMap(m=>m.declarations.map(d=>virtual+d.path)))];
    const resolve=(request,containing)=>{
      if(!request.startsWith('.'))return undefined;
      const from=containing.slice(virtual.length),base=path.posix.normalize(path.posix.join(path.posix.dirname(from),request)),stem=base.replace(/\.[cm]?js$/,'');
      const target=[base,stem+'.d.ts',stem+'.ts',stem+'.tsx',base+'/index.d.ts'].find(f=>sources.has(virtual+f)&&owner(f)?.id===pkg.id);
      if(!target)return undefined;
      return {resolvedFileName:virtual+target,extension:target.endsWith('.d.ts')?ts.Extension.Dts:target.endsWith('.tsx')?ts.Extension.Tsx:ts.Extension.Ts};
    };
    const host={getSourceFile:file=>sources.get(file),getDefaultLibFileName:()=>'',writeFile(){},getCurrentDirectory:()=>virtual,getDirectories:()=>[],
      fileExists:file=>sources.has(file),readFile:file=>sources.get(file)?.text,getCanonicalFileName:file=>file,useCaseSensitiveFileNames:()=>true,getNewLine:()=>'\n',
      resolveModuleNames:(requests,containing)=>requests.map(request=>resolve(request,containing))};
    const program=ts.createProgram(rootFiles,{noLib:true,noEmit:true,types:[],strict:true,skipLibCheck:false,target:ts.ScriptTarget.Latest,module:ts.ModuleKind.CommonJS},host),checker=program.getTypeChecker();
    const targetFor=request=>local.find(m=>m.name===request);
    const rememberSymbol=symbol=>{
      if(symbol.flags&ts.SymbolFlags.Alias)symbol=checker.getAliasedSymbol(symbol);
      const declarations=(symbol.declarations??[]).map(loc).filter(d=>files.has(d.path)).sort((a,b)=>a.path.localeCompare(b.path)||a.start-b.start);
      if(!declarations.length)return null;
      const id=`AMBIENT-SYMBOL:${key(pkg.id)}#${key(symbol.getName())}:${declarations.map(d=>key(d.path)+':'+d.start).join('|')}`;
      if(!symbols.has(id))symbols.set(id,{id,packageId:pkg.id,name:symbol.getName(),spaces:{type:Boolean(symbol.flags&ts.SymbolFlags.Type),value:Boolean(symbol.flags&ts.SymbolFlags.Value),namespace:Boolean(symbol.flags&ts.SymbolFlags.Namespace)},declarations});
      return id;
    };
    for(const m of local){
      const declarations=[...nodes].filter(([,id])=>id===m.id).map(([node])=>node);
      const symbol=checker.getSymbolAtLocation(declarations[0].name);
      if(!symbol)m.boundaries.push(`missing-module-symbol:${m.id}`);
      const moduleExports=symbol?checker.getExportsOfModule(symbol):[];
      for(const exported of moduleExports){
        const name=exported.getName(),symbolId=rememberSymbol(exported);
        if(!symbolId)m.boundaries.push(`unresolved-export:${name}:${m.id}`);
        exports.push({id:`AMBIENT-EXPORT:${m.id}#${key(name)}`,moduleId:m.id,name,symbolIds:symbolId?[symbolId]:[],meaning:'declaration export; no runtime or full property semantics acceptance'});
      }
      for(const node of declarations){
        if(node.getSourceFile().parseDiagnostics.length)m.boundaries.push(`parse-diagnostic:${loc(node).path}`);
        if(!node.body||!ts.isModuleBlock(node.body)){m.boundaries.push(`unsupported-body:${m.id}`);continue;}
        for(const statement of node.body.statements){
          if(ts.isExportAssignment(statement)&&statement.isExportEquals)m.boundaries.push(`export-equals:${loc(statement).path}:${loc(statement).start}`);
          if(!ts.isExportDeclaration(statement)||!statement.moduleSpecifier)continue;
          const request=ts.isStringLiteralLike(statement.moduleSpecifier)?statement.moduleSpecifier.text:null;
          const target=request?targetFor(request):null;
          const kind=!statement.exportClause?'star':ts.isNamespaceExport(statement.exportClause)?'namespace':'named';
          const source=loc(statement),id=`AMBIENT-EDGE:${m.id}#${key(source.path)}:${source.start}`;
          edges.push({id,moduleId:m.id,kind,request,typeOnlySyntax:statement.isTypeOnly,source,targetModuleId:target?.id??null,
            namedBindings:statement.exportClause&&ts.isNamedExports(statement.exportClause)?statement.exportClause.elements.map(e=>({name:e.name.text,importedName:e.propertyName?.text??e.name.text,typeOnlySyntax:e.isTypeOnly})):[],
            resolution:target?'same-package-ambient-declaration':request?.startsWith('.')?'relative-source-unreviewed':'external-or-other-context'});
          if(!target)m.boundaries.push(id);
        }
      }
    }
    const codes=new Set([2305,2308,2309,2459,2498,2614,2724,1192,2613,2306,2300,2451,2717,2323,2393,2394,2687,2428,2432]);
    for(const diagnostic of program.getSemanticDiagnostics().filter(d=>d.file&&d.start!==undefined&&codes.has(d.code))){
      const file=diagnostic.file.fileName.slice(virtual.length),start=diagnostic.start;
      for(const m of local.filter(m=>m.declarations.some(d=>d.path===file&&start>=d.start&&start<d.end))){
        const id=`diagnostic:${file}:${start}:${diagnostic.code}`;m.boundaries.push(id);
        m.diagnostics.push({code:diagnostic.code,path:file,start,message:ts.flattenDiagnosticMessageText(diagnostic.messageText,' ')});
      }
    }
  }
  // A finite union propagates unresolved outward declaration dependencies through cycles.
  let changed=true;
  while(changed){changed=false;for(const edge of edges){if(!edge.targetModuleId)continue;const m=groups.get(edge.moduleId),target=groups.get(edge.targetModuleId);for(const boundary of target.boundaries)if(!m.boundaries.includes(boundary)){m.boundaries.push(boundary);changed=true;}}}
  for(const m of groups.values()){m.boundaries.sort();m.declarations.sort((a,b)=>a.path.localeCompare(b.path)||a.start-b.start);m.diagnostics.sort((a,b)=>a.path.localeCompare(b.path)||a.start-b.start);}
  const sort=records=>records.sort((a,b)=>a.id.localeCompare(b.id));
  return {schemaVersion:1,compilerVersion:ts.version,policy:'same-package ambient declaration projection; augmentation/wildcard/shorthand/nested and unresolved sources remain boundaries; no host libraries or project/runtime acceptance',
    inputs:[...files].sort(([a],[b])=>a.localeCompare(b)).map(([file,text])=>({path:file,sha256:hash(String(text))})),
    packages:[...packages].sort((a,b)=>a.id.localeCompare(b.id)),modules:sort([...groups.values()]),edges:sort(edges),symbols:sort([...symbols.values()]),exports:sort(exports),publicSurfaceComplete:false,stageClosable:false};
}

export function reviewAmbientStars(result,previous){
  const roots=result.packages.map(p=>({...p,directory:path.posix.dirname(p.sourcePath)})).sort((a,b)=>b.directory.length-a.directory.length);
  return previous.reviews.filter(r=>r.kind==='external-star').map(old=>{
    const edge=result.edges.find(e=>e.source.path===old.source.path&&e.source.start===old.source.start&&e.kind==='star');
    const pkg=roots.find(p=>old.source.path.startsWith(p.directory+'/'));
    // File-level stars also consume ambient declarations, even though they are outside a declare block.
    const request=edge?.request??old.request??null;
    const target=edge?.targetModuleId?result.modules.find(m=>m.id===edge.targetModuleId):result.modules.find(m=>m.packageId===pkg?.id&&m.kind==='ambient'&&m.name===request);
    const consumer=edge?result.modules.find(m=>m.id===edge.moduleId):null;
    const namedExports=target?result.exports.filter(e=>e.moduleId===target.id&&!['default','export='].includes(e.name)).map(e=>e.id).sort():[];
    const boundaries=[...new Set([...(target?.boundaries??[]),...(consumer?.boundaries??[])])].sort();
    return {id:`AMBIENT-REVIEW:${old.id}`,previousReviewId:old.id,source:old.source,request,targetModuleId:target?.id??null,targetDeclarations:target?.declarations??[],namedExports,boundaries,
      status:!target?'UNRESOLVED_DECLARATION':boundaries.length?'PARTIAL_AMBIENT_DECLARATION':'EXPANDED_AMBIENT_DECLARATION',
      meaning:'fixed-source ambient declaration topology only; not external package identity, inferred properties, platform or runtime acceptance'};
  });
}

export function validateAmbientModules(actual,expected){
  const failures=[];
  for(const field of ['inputs','packages','modules','edges','symbols','exports','reviews']){
    const records=new Map();for(const record of actual?.[field]??[]){const id=record.id??record.path;if(records.has(id))failures.push(`Duplicate ${field} ${id}`);records.set(id,record);}
    for(const record of expected[field]??[]){const id=record.id??record.path,value=records.get(id);if(!value||serializeInventory(value)!==serializeInventory(record))failures.push(`${!value?'Missing':'Changed'} ${field} ${id} at ${record.source?.path??record.declarations?.[0]?.path??record.path??''}:${record.source?.line??record.declarations?.[0]?.line??''}`);records.delete(id);}
    for(const id of records.keys())failures.push(`Unexpected ${field} ${id}`);
  }
  if(serializeInventory(actual)!==serializeInventory(expected))failures.push('Ambient declaration graph differs from fixed source reconstruction');
  return {valid:!failures.length,failures};
}

export function readAmbientReviewInputs({previousBytes,syntaxBytes,expectedHash}){
  if(hash(previousBytes)!==expectedHash)throw new Error('Frozen previous export summary identity mismatch');
  const previous=JSON.parse(previousBytes),syntax=JSON.parse(syntaxBytes);
  if(hash(syntaxBytes)!==previous.previous?.sha256)throw new Error('Frozen syntax summary identity mismatch');
  for(const review of previous.reviews.filter(r=>r.kind==='external-star')){
    const gap=syntax.nonInferredGaps.find(g=>g.id===review.previousGapId);
    if(typeof gap?.details!=='string'||!gap.details)throw new Error(`Missing original star request ${review.id}`);
    review.request=gap.details;
  }
  return previous;
}

export function buildAmbientModules({sourceDir}){
  const inventory=buildSourceInventory({sourceDir}),{tree,entries}=readSourceTree(sourceDir,SDK54_EXPO_COMMIT);
  if(tree!==inventory.source.tree)throw new Error('Fixed source tree mismatch');
  const selected=selectWorkspaceSources(entries,inventory),files=new Map();
  for(let i=0;i<selected.length;i+=200)for(const [file,bytes] of readSourceBlobs(sourceDir,selected.slice(i,i+200)))files.set(file,bytes.toString());
  const result=indexAmbientModules({files,packages:[...inventory.packages,...inventory.templates]});
  result.source={revision:SDK54_EXPO_COMMIT,tree};for(const input of result.inputs)input.blob=selected.find(e=>e.path===input.path).oid;
  const previousPath='docs/releases/sdk54-workspace-export-graph-summary.json',previousBytes=fs.readFileSync(previousPath);
  const syntaxPath='docs/releases/sdk54-workspace-surface-summary.json',syntaxBytes=fs.readFileSync(syntaxPath);
  const previous=readAmbientReviewInputs({previousBytes,syntaxBytes,expectedHash:'4dc4e6180648a6af335cdb4d31c0dbab6f583f3866ef812b55a906c146ec56b1'});
  result.previous={path:previousPath,sha256:hash(previousBytes),syntaxPath,syntaxSha256:hash(syntaxBytes)};
  result.reviews=reviewAmbientStars(result,previous);return result;
}

export function summarizeAmbientModules(result,artifact){return {schemaVersion:1,source:result.source,previous:result.previous,artifact,
  counts:Object.fromEntries(['inputs','packages','modules','edges','symbols','exports'].map(k=>[k,result[k].length])),
  moduleKinds:Object.fromEntries([...new Set(result.modules.map(m=>m.kind))].sort().map(kind=>[kind,result.modules.filter(m=>m.kind===kind).length])),
  reviewCounts:Object.fromEntries([...new Set(result.reviews.map(r=>r.status))].sort().map(status=>[status,result.reviews.filter(r=>r.status===status).length])),
  reviews:result.reviews,publicSurfaceComplete:false,stageClosable:false};}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const options={},args=process.argv.slice(2);for(let i=0;i<args.length;i+=2){if(!['--source','--output','--check','--summary'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Invalid arguments');options[args[i]]=args[i+1];}
    if(!options['--source']||Boolean(options['--output'])===Boolean(options['--check'])||options['--summary']&&!options['--output'])throw new Error('Usage: --source <git> --output|--check <json[.gz]> [--summary <json>]');
    const result=buildAmbientModules({sourceDir:options['--source']});
    if(options['--check']){const file=options['--check'],bytes=fs.readFileSync(file),actual=JSON.parse((file.endsWith('.gz')?gunzipSync(bytes):bytes).toString());const checked=validateAmbientModules(actual,result);console.log(JSON.stringify(checked));if(!checked.valid)process.exitCode=1;}
    else{const file=options['--output'],text=serializeAmbientModules(result);fs.writeFileSync(file,file.endsWith('.gz')?gzipSync(text):text);const summary=summarizeAmbientModules(result,{path:file,sha256:hash(fs.readFileSync(file))});if(options['--summary'])fs.writeFileSync(options['--summary'],serializeAmbientModules(summary));console.log(JSON.stringify({...summary.counts,moduleKinds:summary.moduleKinds,reviews:summary.reviewCounts,publicSurfaceComplete:false,stageClosable:false}));}
  }catch(error){console.error(error.stack);process.exitCode=1;}
}
