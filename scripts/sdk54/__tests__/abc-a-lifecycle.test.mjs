import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Execute the actual fixture component with a mocked native event source.
// Synthetic callbacks are host tests, never evidence of a device background action.
test('RouterProbe observes native AppState changes only and removes its subscription',()=>{
  const source=fs.readFileSync('packages/expo-modules-core/harmony/example/router/RouterProbe.tsx','utf8');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const logs=[],cleanup=[];let callback,removed=0;
  const modules={
    react:{useEffect:effect=>{const clean=effect();if(clean)cleanup.push(clean);}},
    'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null},
    'react-native':{Button:()=>null,View:()=>null,TurboModuleRegistry:{getEnforcing:()=>({getConstants:()=>({initialWindowMetrics:{}})})},AppState:{currentState:'active',addEventListener:(name,listener)=>{assert.equal(name,'change');callback=listener;return {remove:()=>removed++};}}},
    'expo-router':{usePathname:()=>'/sheet',useRootNavigationState:()=>({routes:[{name:'sheet'}]})},
    'expo-linking':{getLinkingURL:()=>null},
    'expo-modules-core':{uuid:{v4:()=>'host-test-boot'},reloadAppAsync:async()=>{}},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0}),useSafeAreaFrame:()=>({})},
  };
  const exports={};vm.runInNewContext(code,{exports,__DEV__:true,console:{info:line=>logs.push(line)},require:name=>{assert.ok(modules[name],name);return modules[name];}});
  exports.RouterProbe();
  const observations=()=>logs.filter(line=>line.startsWith('A_ROUTER_APP_STATE=')).map(line=>JSON.parse(line.split('=').slice(1).join('=')));
  assert.deepEqual(observations(),[],'Mounting must not manufacture a lifecycle transition');
  assert.equal(typeof callback,'function','Missing native AppState subscription');
  callback('inactive');callback('background');callback('active');
  assert.deepEqual(observations().map(({from,to})=>[from,to]),[['active','inactive'],['inactive','background'],['background','active']]);
  for(const row of observations()){assert.equal(row.boot,'host-test-boot');assert.ok(Number.isFinite(Date.parse(row.at)));}
  cleanup.forEach(fn=>fn());assert.equal(removed,1,'Subscription must be cleaned up on unmount');
});
