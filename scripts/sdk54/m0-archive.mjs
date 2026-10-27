import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { list as listTar } from 'tar';
import { verifyArchiveIntegrity } from './metro-type-source.mjs';

export class DeclarationArchiveStructureError extends Error {}

export function assertDeclarationEntry(entry,seen,root){
  if(!['File','OldFile','Directory'].includes(entry.type))throw new DeclarationArchiveStructureError(`Unsafe archive link/type ${entry.path}`);
  if(entry.size<0||entry.size>64*1024*1024)throw new DeclarationArchiveStructureError('Archive file size limit');
  const file=entry.path.replace(/\/$/,'');
  if(entry.type==='Directory'&&file===root)return;
  if(!file.startsWith(root+'/')||file.includes('\\')||file.split('/').some(s=>['','.','..'].includes(s)))throw new DeclarationArchiveStructureError(`Unsafe archive path ${entry.path}`);
  if(seen.has(file))throw new DeclarationArchiveStructureError(`Duplicate archive entry ${file}`);seen.add(file);
}

export function verifyDeclarationPackage(loaded){
  const manifest=JSON.parse(String(loaded.files.get('package.json')));
  if(manifest.name!==loaded.identity.name||manifest.version!==loaded.identity.version)throw new Error(`Archive package identity mismatch ${loaded.identity.selector}`);
  return manifest;
}

export function readDeclarationArchive(file,identity,{includeConfigJson=false}={}){
  const verified=verifyArchiveIntegrity(fs.readFileSync(file),identity),seen=new Set(),files=new Map(),entries=[];let root=null,total=0;
  listTar({file,sync:true,strict:true,onReadEntry(entry){
    const candidate=entry.path.split('/')[0];
    if(!root){
      const name=identity.name.split('/').at(-1),roots=['package',name,`${name}-v${identity.version}`];
      if(identity.name.startsWith('@types/')&&/^\d+\.\d+\.\d+$/.test(identity.version))roots.push(`${name} v${identity.version.split('.').slice(0,2).join('.')}`);
      if(!roots.includes(candidate))throw new DeclarationArchiveStructureError(`Unsafe archive root ${candidate}`);root=candidate;
    }
    assertDeclarationEntry(entry,seen,root);total+=entry.size;if(total>512*1024*1024)throw new DeclarationArchiveStructureError('Archive total size limit');
    entries.push({path:entry.path,type:entry.type,bytes:entry.size});
    if(['File','OldFile'].includes(entry.type)&&(/\.d\.[cm]?ts$/.test(entry.path)||entry.path.endsWith('/package.json')||includeConfigJson&&/\.json$/.test(entry.path))){
      const chunks=[];entry.on('data',chunk=>chunks.push(chunk));entry.on('end',()=>{const bytes=Buffer.concat(chunks);if(bytes.length!==entry.size)throw new Error(`Truncated archive entry ${entry.path}`);files.set(entry.path.slice(root.length+1),bytes.toString('utf8'));});
    }entry.resume();
  }});
  const loaded={identity,files,archive:{...verified,path:file,root,totalBytes:total,entries:entries.sort((a,b)=>a.path.localeCompare(b.path))}};
  verifyDeclarationPackage(loaded);return loaded;
}

export function loadPlannedDeclarationArchives(planned){
  const loaded=[],availability=[];
  for(const {identity,file}of planned){
    if(!fs.existsSync(file)){availability.push({identity,file,status:'MISSING_ARCHIVE'});continue;}
    try{const archive=readDeclarationArchive(file,identity);loaded.push(archive);availability.push({identity,file,status:'VERIFIED',sha256:archive.archive.sha256});}
    catch(error){if(!(error instanceof DeclarationArchiveStructureError))throw error;availability.push({identity,file,status:'REJECTED_ARCHIVE',sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),reason:error.message});}
  }
  return {loaded,availability};
}
