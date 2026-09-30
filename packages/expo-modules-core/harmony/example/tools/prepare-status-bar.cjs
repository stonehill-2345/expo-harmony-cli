const fs=require('node:fs');const path=require('node:path');
module.exports=function prepareStatusBar(sdk,root){
 const source=path.join(sdk,'packages/expo-modules-core/harmony/example/status-bar');const main=path.join(root,'harmony/entry/src/main');
 const base=fs.existsSync(path.join(root,'FontApp.tsx'))?'./FontApp':fs.existsSync(path.join(root,'LinkingApp.tsx'))?'./LinkingApp':'./I0App';
 fs.writeFileSync(path.join(root,'StatusBarApp.tsx'),fs.readFileSync(path.join(source,'StatusBarApp.tsx'),'utf8').replace('__BASE_APP__',base));
 fs.cpSync(path.join(source,'native/ets'),path.join(main,'ets/status-bar-oracle'),{recursive:true});
 const cpp=path.join(main,'cpp/PackageProvider.cpp');let text=fs.readFileSync(cpp,'utf8').replace('using namespace rnoh;','#include "StatusBarOraclePackage.h"\nusing namespace rnoh;');const marker=')};\n}';const index=text.lastIndexOf(marker);if(index<0)throw new Error('Unexpected C++ PackageProvider shape');text=text.slice(0,index)+'),\n      std::make_shared<expo::statusbar::testing::StatusBarOraclePackage>(ctx)};\n}'+text.slice(index+marker.length);fs.writeFileSync(cpp,text);
 fs.appendFileSync(path.join(main,'cpp/CMakeLists.txt'),'\ntarget_include_directories(rnoh_app PRIVATE "${NODE_MODULES}/expo-modules-core/harmony/example/status-bar/native/cpp")\n');
 const ets=path.join(main,'ets/PackageProvider.ets');fs.writeFileSync(ets,"import { StatusBarOraclePackage } from './status-bar-oracle/StatusBarOraclePackage';\n"+fs.readFileSync(ets,'utf8').replace('  return [','  return [new StatusBarOraclePackage(ctx), '));
 const entry=path.join(root,'expo-entry.ts');fs.writeFileSync(entry,fs.readFileSync(entry,'utf8').replace(base,'./StatusBarApp'));
};
