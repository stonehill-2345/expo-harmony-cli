import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function adapter(mode = 'lazy') {
  const calls=[];
  const config={validAttributes:{source:true},directEventTypes:{}};
  let registered=mode==='ready';
  const context={exports:{},console,expo:{getViewConfig:()=>registered?config:null},require:name=>{
    if(name==='react')return {PureComponent:class{},createRef:()=>({current:null})};
    if(name==='react-native')return {findNodeHandle:()=>1,TurboModuleRegistry:{get:moduleName=>{
      calls.push(['lookup',moduleName]);
      if(mode==='missing')return null;
      return {installModule:()=>{
        calls.push(['install']);
        if(mode==='throw')throw Error('native bootstrap failed');
        if(mode!=='no-view')registered=true;
      }};
    }}};
    if(name==='react-native/Libraries/NativeComponent/NativeComponentRegistry')return {get:(name,getConfig)=>{
      calls.push(['component',name]);assert.equal(getConfig().validAttributes.source,true);return ()=>{};
    }};
    if(name==='./requireNativeModule')return {requireNativeModule:()=>({ViewPrototypes:{ExpoImage:{reloadAsync(){}}}})};
    throw Error(name);
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('packages/expo-modules-core/src/NativeViewManagerAdapter.harmony.tsx','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React},
  }).outputText,context);
  return {get:context.exports.requireNativeViewManager,calls};
}
test('Harmony view lookup installs a lazy native module before validating its view config',()=>{
  const a=adapter();const View=a.get('ExpoImage');
  assert.equal(typeof View.prototype.reloadAsync,'function');
  assert.deepEqual(a.calls,[['lookup','ExpoImage'],['install'],['component','ViewManagerAdapter_ExpoImage']]);
  a.get('ExpoImage');assert.equal(a.calls.filter(c=>c[0]==='install').length,1);
});
test('already registered Harmony views do not repeat native installation',()=>{
  const a=adapter('ready');a.get('ExpoImage');assert.deepEqual(a.calls,[['component','ViewManagerAdapter_ExpoImage']]);
});
test('missing modules and installers without a view cannot fake registration',()=>{
  for(const mode of ['missing','no-view'])assert.throws(()=>adapter(mode).get('ExpoImage'),/Native Harmony view is not registered/);
});
test('native installation failures retain their original error',()=>{
  assert.throws(()=>adapter('throw').get('ExpoImage'),/native bootstrap failed/);
});
