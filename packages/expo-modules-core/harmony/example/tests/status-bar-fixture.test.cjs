const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {execFileSync}=require('node:child_process');const sdk=path.resolve(__dirname,'../../../../..');
test('StatusBar assembly archives the official JS package and wires only a test oracle',()=>{
 const root=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'status-bar-fixture-')),'fixture');
 execFileSync(process.execPath,[path.resolve(__dirname,'../tools/prepare-fixture.cjs'),'--sdk-root',sdk,'--fixture-root',root,'--tooling-root',process.env.EXPO_HARMONY_TOOLING_ROOT,'--i0','--linking','--font','--status-bar','--prepare-only'],{stdio:'pipe'});
 const read=f=>fs.readFileSync(path.join(root,f),'utf8');const m=JSON.parse(read('source-manifest.json'));
 assert.ok(m.packages['expo-status-bar'].files['src/NativeStatusBarWrapper.tsx']);
 assert.match(read('StatusBarApp.tsx'),/from 'expo-status-bar'/);assert.match(read('StatusBarApp.tsx'),/FontApp/);assert.doesNotMatch(read('StatusBarApp.tsx'),/__BASE_APP__/);
 assert.match(read('harmony/entry/src/main/cpp/PackageProvider.cpp'),/StatusBarOraclePackage/);assert.match(read('harmony/entry/src/main/ets/PackageProvider.ets'),/new StatusBarOraclePackage\(ctx\)/);
 assert.match(read('expo-entry.ts'),/from '.\/StatusBarApp'/);assert.equal(JSON.parse(read('package.json')).dependencies['expo-router'],undefined);assert.equal(fs.existsSync(path.join(root,'metro.config.js')),false);
});
