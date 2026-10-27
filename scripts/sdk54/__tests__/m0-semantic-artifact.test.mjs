import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync,gzipSync } from 'node:zlib';
import test from 'node:test';
import * as artifact from '../m0-semantic-artifact.mjs';
import { serializeConsolidated } from '../m0-consolidated.mjs';

test('legacy artifact JSON and gzip retain the exact prior escaped serialization bytes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sdk54-shards-'));
 try{
  const graph={types:[{id:'one',path:'packages/a/index.ts'}],url:'https://registry.npmjs.org/archive.tgz',stageClosable:false};
  const text=serializeConsolidated(graph);
  for(const name of ['legacy.json','legacy.json.gz']){const file=path.join(dir,name);artifact.writeSemanticArtifact(file,graph);
   assert.deepEqual(fs.readFileSync(file),name.endsWith('.gz')?gzipSync(text):Buffer.from(text));
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('sharded semantic artifacts preserve every record without serializing the entire type array',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sdk54-shards-'));
 try{
  const file=path.join(dir,'graph.json.gz'),types=Array.from({length:5},(_,i)=>({id:`TYPE:${i}`,properties:[{name:'value',typeId:'TYPE:0'}],display:'x'.repeat(1000)}));
  // The whole-array serializer is deliberately unavailable; individual records remain serializable.
  Object.defineProperty(types,'toJSON',{value(){throw new Error('monolithic serialization');}});
  const graph={schemaVersion:1,types,exports:[{id:'export',typeId:'TYPE:0'}],stageClosable:false};
  artifact.writeSemanticArtifact(file,graph,{sharded:true,recordsPerShard:2});
  const index=JSON.parse(gunzipSync(fs.readFileSync(file)));
  assert.equal(index.typeShards.length,3);assert.equal(index.typeCount,5);
  const loaded=artifact.readSemanticArtifact(file);
  assert.deepEqual(loaded,{...graph,types:Array.from(types)});
  const before=fs.readFileSync(file);artifact.writeSemanticArtifact(file,graph,{sharded:true,recordsPerShard:2});
  assert.deepEqual(fs.readFileSync(file),before);
  const shard=path.join(file+'.parts',index.typeShards[0].path);fs.appendFileSync(shard,'tamper');
  assert.throws(()=>artifact.readSemanticArtifact(file),/integrity/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('legacy JSON and gzip artifacts remain readable and sharded paths and counts are validated',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sdk54-shards-'));
 try{
  const graph={types:[{id:'one'}],stageClosable:false};
  for(const name of ['legacy.json','legacy.json.gz']){const file=path.join(dir,name);artifact.writeSemanticArtifact(file,graph);assert.deepEqual(artifact.readSemanticArtifact(file),graph);}
  const file=path.join(dir,'shards.json');artifact.writeSemanticArtifact(file,graph,{sharded:true,recordsPerShard:1});
  const index=JSON.parse(fs.readFileSync(file));
  fs.writeFileSync(file,JSON.stringify({...index,typeCount:2}));assert.throws(()=>artifact.readSemanticArtifact(file),/count/);
  index.typeShards[0].path='../outside.json.gz';fs.writeFileSync(file,JSON.stringify(index));assert.throws(()=>artifact.readSemanticArtifact(file),/path/);
  assert.throws(()=>artifact.writeSemanticArtifact(file,graph,{sharded:true,recordsPerShard:0}),/shard size/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
