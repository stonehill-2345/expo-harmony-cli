import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {createHash} from 'node:crypto';
import * as tar from 'tar';

const overlay=path.resolve('scripts/sdk54/external-overlays/expo-image-3.0.11');
test('native PNG source and request lifecycle reject invalid, replaced and cancelled loads',t=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'expo-image-native-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
  const binary=path.join(tmp,'image-request-test');
  execFileSync('c++',['-std=c++20','-Wall','-Wextra','-Werror','-I',path.join(overlay,'harmony/src/main/cpp'),path.join(overlay,'harmony/tests/ImageRequestTest.cpp'),'-o',binary],{stdio:'pipe'});
  assert.match(execFileSync(binary,{encoding:'utf8'}),/rejection passed/);
});
test('ExpoImage pack refuses unpinned bytes and existing output without overwriting',async t=>{
  const {prepareExpoImage}=await import('../abc/a-prepare-expo-image.mjs');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'expo-image-pack-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
  const archive=path.join(tmp,'bad.tgz');fs.writeFileSync(archive,'wrong source');
  await assert.rejects(prepareExpoImage({archive,output:path.join(tmp,'new')}),/SHA256/);
  assert.equal(fs.existsSync(path.join(tmp,'new')),false);
  const output=path.join(tmp,'existing');fs.mkdirSync(output);fs.writeFileSync(path.join(output,'keep'),'keep');
  await assert.rejects(prepareExpoImage({archive,output}),/exists/);
  assert.equal(fs.readFileSync(path.join(output,'keep'),'utf8'),'keep');
});
test('pinned official JS is preserved and the real Harmony module is packaged',{
  skip:!process.env.SDK54_IMAGE_ARCHIVE&&'Set SDK54_IMAGE_ARCHIVE to the pinned expo-image 3.0.11 archive',
},async t=>{
  const {prepareExpoImage}=await import('../abc/a-prepare-expo-image.mjs');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'expo-image-pinned-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
  const output=path.join(tmp,'pack');const result=await prepareExpoImage({archive:process.env.SDK54_IMAGE_ARCHIVE,output});
  assert.equal(result.scope,'LOCAL');assert.equal(result.stageClosable,false);
  const original=path.join(tmp,'original'),packed=path.join(tmp,'packed');fs.mkdirSync(original);fs.mkdirSync(packed);
  await tar.x({file:process.env.SDK54_IMAGE_ARCHIVE,cwd:original,strip:1});
  await tar.x({file:path.join(output,result.archive.path),cwd:packed,strip:1});
  for(const file of fs.readdirSync(original,{recursive:true}).filter(p=>fs.statSync(path.join(original,p)).isFile()&&p!=='expo-module.config.json'))
    assert.deepEqual(fs.readFileSync(path.join(packed,file)),fs.readFileSync(path.join(original,file)),file);
  const config=JSON.parse(execFileSync('tar',['-xOf',path.join(output,result.archive.path),'package/expo-module.config.json']));
  assert.ok(config.platforms.includes('harmony'));assert.ok(config.android.modules.length>0);
  assert.equal(config.harmony.cpp.packageClass,'expo::image::harmony::ExpoImagePackage');
  for(const row of result.overlayFiles){
    const bytes=execFileSync('tar',['-xOf',path.join(output,result.archive.path),'package/'+row.path]);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
  }
  // Execute the unmodified official wrapper: native must emit load/error, not
  // loadEnd, because the wrapper synthesizes the terminal event itself.
  const ts=(await import('typescript')).default;
  const vm=await import('node:vm');
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(path.join(packed,'src/ExpoImage.tsx'),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true},
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(name=>{
    if(name==='react')return {PureComponent:class{constructor(props){this.props=props;}}};
    if(name==='react-native')return {};
    if(name==='expo-modules-core')return {requireNativeViewManager:name=>{assert.equal(name,'ExpoImage');return {};}};
    throw Error('Unexpected runtime import: '+name);
  },module,module.exports);
  const events=[];
  const view=new module.exports.default({onLoadStart:()=>events.push('start'),onLoad:event=>events.push(['load',event.source.width]),onError:event=>events.push(['error',event.error]),onLoadEnd:()=>events.push('end')});
  view.onLoadStart();view.onLoad({nativeEvent:{cacheType:'none',source:{url:'asset://first.png',width:80,height:40,mediaType:null}}});
  view.onLoadStart();view.onError({nativeEvent:{error:'ERR_IMAGE_LOAD'}});
  assert.deepEqual(events,['start',['load',80],'end','start',['error','ERR_IMAGE_LOAD'],'end']);
});

test('Harmony autolinking resolves the overlay and CMake accepts Core declared after Image',async t=>{
  const ts=(await import('typescript')).default;
  const vm=await import('node:vm');
  function load(file){
    const module={exports:{}};
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:file})(name=>{
      if(name==='fs')return fs;
      if(name==='path')return path;
      if(name==='./moduleValidation')return load(path.resolve('packages/expo-modules-autolinking/src/platforms/harmony/moduleValidation.ts'));
      throw Error('Unexpected autolinking import: '+name);
    },module,module.exports);
    return module.exports;
  }
  const api=load(path.resolve('packages/expo-modules-autolinking/src/platforms/harmony/harmony.ts'));
  const config=JSON.parse(fs.readFileSync(path.join(overlay,'harmony/expo-module.harmony.json')));
  const image=await api.resolveModuleAsync('expo-image',{path:overlay,version:'3.0.11',config:{harmonyConfig:()=>config}});
  assert.equal(image.cpp.cmakeTarget,'rnoh_expo_image');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'expo-image-link-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
  await api.generatePackageListAsync([image],path.join(tmp,'generated'),'');
  assert.match(fs.readFileSync(path.join(tmp,'generated/ExpoModulesPackages.cpp'),'utf8'),/expo::image::harmony::ExpoImagePackage/);
  // CMake supports forward target references. Autolinking sorts expo-image before
  // expo-modules-core; configuration must not require the latter to already exist.
  fs.writeFileSync(path.join(tmp,'empty.cpp'),'void image_link_probe() {}\n');
  fs.writeFileSync(path.join(tmp,'CMakeLists.txt'),`cmake_minimum_required(VERSION 3.16)\nproject(image_link_order LANGUAGES CXX)\nadd_library(rnoh_app STATIC empty.cpp)\ninclude("${tmp}/generated/expo-modules.cmake")\nadd_library(rnoh_expo_modules_core INTERFACE)\n`);
  execFileSync('cmake',['-S',tmp,'-B',path.join(tmp,'build')],{stdio:'pipe'});
});
