import { describe, it, expect } from 'vitest';
import { OhPackageJson5Template } from '../OhPackageJson5Template';
import { HvigorConfigJson5Template } from '../HvigorConfigJson5Template';
import { AppScopeAppJSON5Template } from '../AppScopeAppJSON5Template';
import { AppScopeStringVarTemplate } from '../AppScopeStringVarTemplate';
import { EntryIndexTemplate } from '../EntryIndexTemplate';
import { EntryOhPackageJson5Template } from '../EntryOhPackageJson5Template';
import { EntryStringVarTemplate } from '../EntryStringVarTemplate';
import { MetroConfigTemplate } from '../MetroConfigTemplate';

describe('dynamic templates', () => {
  it('OhPackageJson5Template 注入 rnoh 包名', () => {
    const out = new OhPackageJson5Template('@react-native-oh/react-native-harmony').build();
    expect(out).toContain('"@rnoh/react-native-openharmony": "file:../node_modules/@react-native-oh/react-native-harmony/react_native_openharmony.har"');
  });

  it('EntryOhPackageJson5Template 注入 entry 可解析的 RNOH 包路径', () => {
    const out = new EntryOhPackageJson5Template('@react-native-oh/react-native-harmony').build();
    expect(out).toContain('"name": "entry"');
    expect(out).toContain('"@rnoh/react-native-openharmony": "file:../../node_modules/@react-native-oh/react-native-harmony/react_native_openharmony.har"');
  });

  it('AppScopeAppJSON5Template 注入 bundleName', () => {
    const out = new AppScopeAppJSON5Template('com.example.myapp').build();
    expect(out).toContain('"bundleName": "com.example.myapp"');
    expect(out).toContain('"label": "$string:app_name"');
    expect(out).toContain('"icon": "$media:layered_image"');
    expect(out).not.toContain('$media:app_icon');
  });

  it('AppScopeStringVarTemplate 注入 appName', () => {
    const out = new AppScopeStringVarTemplate('MyApp').build();
    expect(out).toContain('"name": "app_name"');
    expect(out).toContain('"value": "MyApp"');
  });

  it('EntryIndexTemplate 注入 appName，并固定 Expo appKey 为 main + Metro 8081', () => {
    const out = new EntryIndexTemplate('MyApp').build();
    expect(out.match(/MyApp/g)?.length).toBe(1);
    expect(out).toContain('name: "MyApp"');
    expect(out).toContain('appKey: "main"');
    expect(out).toContain("dataPreferences.getSync('devHostAndPortAddress', '')");
    expect(out).toContain("'localhost:8081'");
    expect(out).toContain("'/index.bundle?platform=harmony&dev=true&minify=false'");
    expect(out).toContain('createMetroJSBundleProvider(this.rnohCoreContext)');
    expect(out).toContain("'bundle.harmony.js'");
    expect(out).toContain('new AnyJSBundleProvider([');
    expect(out).toContain('new ResourceJSBundleProvider');
    expect(out).not.toContain('hermes_bundle.hbc');
    expect(out).not.toContain('new MetroJSBundleProvider()');
  });

  it('EntryStringVarTemplate 注入 name + description', () => {
    const out = new EntryStringVarTemplate('MyApp', '').build();
    expect(out).not.toContain('module_desc');
    expect(out).toContain('"name": "EntryAbility_label"');
    expect(out).toContain('"value": "MyApp"');
    expect(out).toContain('"value": ""');
  });

  it('HvigorConfigJson5Template 注入 cli 包名 + hvigor 插件文件名', () => {
    const out = new HvigorConfigJson5Template(
      '@react-native-oh/react-native-harmony-cli',
      'rnoh-hvigor-plugin-0.77.71.tgz',
    ).build();
    expect(out).toContain('"@rnoh/hvigor-plugin": "../../node_modules/@react-native-oh/react-native-harmony-cli/harmony/rnoh-hvigor-plugin-0.77.71.tgz"');
  });

  it('MetroConfigTemplate 注入 harmony 包名', () => {
    const out = new MetroConfigTemplate('@react-native-oh/react-native-harmony').build();
    expect(out).toContain("require('@react-native-oh/react-native-harmony/metro.config')");
    expect(out).toContain("reactNativeHarmonyPackageName: '@react-native-oh/react-native-harmony'");
  });
});
