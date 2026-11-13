import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import * as tar from 'tar';
import {isMain,repository,sha256,writeJSON} from './a-common.mjs';
import {EXPO_IMAGE_UPSTREAM_SHA256} from '../release-catalog.mjs';

const overlay=path.join(repository,'scripts/sdk54/external-overlays/expo-image-3.0.11');
export async function prepareExpoImage({archive,output}) {
  assert.ok(archive&&output,'archive and output are required');
  assert.ok(!fs.existsSync(output),`Output exists: ${output}`);
  const original=fs.readFileSync(archive);assert.equal(sha256(original),EXPO_IMAGE_UPSTREAM_SHA256,'Unsupported ExpoImage archive SHA256');
  const root=path.resolve(output),pkg=path.join(root,'package');fs.mkdirSync(pkg,{recursive:true});
  try {
    await tar.x({file:path.resolve(archive),cwd:pkg,strip:1});
    const manifest=JSON.parse(fs.readFileSync(path.join(pkg,'package.json')));
    assert.equal(manifest.name,'expo-image');assert.equal(manifest.version,'3.0.11');
    const config=JSON.parse(fs.readFileSync(path.join(pkg,'expo-module.config.json')));
    assert.deepEqual(config.platforms,['apple','android']);
    config.platforms.push('harmony');
    config.harmony=JSON.parse(fs.readFileSync(path.join(overlay,'harmony/expo-module.harmony.json')));
    fs.cpSync(path.join(overlay,'harmony'),path.join(pkg,'harmony'),{recursive:true});
    writeJSON(path.join(pkg,'expo-module.config.json'),config);
    const name='expo-image-3.0.11-harmony-local.tgz';
    await tar.c({file:path.join(root,name),cwd:root,gzip:true,portable:true,mtime:new Date(0)},['package']);
    const bytes=fs.readFileSync(path.join(root,name));
    const overlayFiles=fs.readdirSync(path.join(pkg,'harmony'),{recursive:true}).map(p=>'harmony/'+p).filter(p=>fs.statSync(path.join(pkg,p)).isFile()).sort().map(p=>({path:p,sha256:sha256(fs.readFileSync(path.join(pkg,p)))}));
    const result={schemaVersion:1,scope:'LOCAL',stageClosable:false,upstream:{name:manifest.name,version:manifest.version,sha256:EXPO_IMAGE_UPSTREAM_SHA256},archive:{path:name,sha256:sha256(bytes),bytes:bytes.length},overlayFiles,
      limitations:['PNG URI renderer only; not the complete ExpoImage API','Unsupported source/props/methods reject explicitly','No unified B release identity or device acceptance']};
    writeJSON(path.join(root,'expo-image-local.json'),result);return result;
  } catch(error) {fs.rmSync(root,{recursive:true,force:true});throw error;}
}
if(isMain(import.meta.url)) {
  try {
    const {values}=parseArgs({options:{archive:{type:'string'},output:{type:'string'},help:{type:'boolean'}}});
    if(values.help)console.log('a-prepare-expo-image.mjs --archive <pinned expo-image-3.0.11.tgz> --output <new directory>');
    else console.log(JSON.stringify(await prepareExpoImage(values),null,2));
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
