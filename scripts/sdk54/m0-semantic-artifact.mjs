import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync,gunzipSync } from 'node:zlib';
import { serializeInventory } from './source-inventory.mjs';

const format='sdk54-semantic-shards-v1',hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const readJson=file=>JSON.parse((file.endsWith('.gz')?gunzipSync(fs.readFileSync(file)):fs.readFileSync(file)).toString());
const writeJson=(file,value,escapeSlashes=false)=>{const serialized=serializeInventory(value),text=escapeSlashes?serialized.replaceAll('/','\\/'):serialized;fs.writeFileSync(file,file.endsWith('.gz')?gzipSync(text):text);};

export function writeSemanticArtifact(file,graph,{sharded=false,recordsPerShard=32}={}){
  if(!sharded){writeJson(file,graph,true);return;}
  if(!Number.isSafeInteger(recordsPerShard)||recordsPerShard<1||recordsPerShard>1024)throw new Error('Invalid semantic shard size');
  const {types,...metadata}=graph,typeShards=[],directory=file+'.parts';fs.mkdirSync(directory,{recursive:true});
  for(let i=0;i<types.length;i+=recordsPerShard){
    const rows=types.slice(i,i+recordsPerShard),bytes=gzipSync(serializeInventory(rows)),sha256=hash(bytes),name=sha256+'.json.gz';
    fs.writeFileSync(path.join(directory,name),bytes);typeShards.push({path:name,sha256,count:rows.length,firstId:rows[0].id,lastId:rows.at(-1).id});
  }
  writeJson(file,{schemaVersion:1,format,graph:metadata,typeCount:types.length,typeShards});
}

export function readSemanticArtifact(file){
  const value=readJson(file);if(value.format!==format)return value;
  if(value.schemaVersion!==1||!value.graph||Object.hasOwn(value.graph,'types')||!Array.isArray(value.typeShards)||!Number.isSafeInteger(value.typeCount)||value.typeCount<0)throw new Error('Invalid semantic shard index');
  const types=[],seen=new Set();
  for(const shard of value.typeShards){
    if(!/^[a-f0-9]{64}\.json\.gz$/.test(shard.path)||seen.has(shard.path))throw new Error('Invalid semantic shard path');seen.add(shard.path);
    const bytes=fs.readFileSync(path.join(file+'.parts',shard.path));
    if(hash(bytes)!==shard.sha256||shard.path!==shard.sha256+'.json.gz')throw new Error(`Semantic shard integrity mismatch ${shard.path}`);
    const rows=JSON.parse(gunzipSync(bytes).toString());
    if(!Array.isArray(rows)||rows.length!==shard.count||!rows.length||rows[0].id!==shard.firstId||rows.at(-1).id!==shard.lastId)throw new Error('Semantic shard record count or identity mismatch');
    types.push(...rows);
  }
  if(types.length!==value.typeCount)throw new Error('Semantic shard total count mismatch');
  return {...value.graph,types};
}
