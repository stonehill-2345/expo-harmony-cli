import * as fs from 'fs';
import * as path from 'path';
import { VERSION_MATRIX as V } from '../version-matrix';
import { lockAllDependencyVersions } from '../scanner/compat-patch';


/** 读现有 package.json，合并 G 类 scripts + dependencies + devDependencies。*/
export function mergePackageJson(targetDir: string): void {
  const pkgPath = path.join(targetDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  pkg.scripts = {
    ...(pkg.scripts || {}),
    'start:harmony': 'node scripts/start-harmony.js',
    'dev:harmony': 'node scripts/bundle-harmony-dev.js',
    'bundle:harmony:release': 'node scripts/bundle-harmony-release.js',
    codegen: 'react-native codegen-harmony --cpp-output-path ./harmony/entry/src/main/cpp/generated --rnoh-module-path ./harmony/entry/oh_modules/@rnoh/react-native-openharmony',
    postinstall: 'patch-package && node scripts/postinstall-harmony.js',
  };

  pkg.dependencies = {
    ...(pkg.dependencies || {}),
    '@react-native-oh/react-native-harmony': V.rnoh,
    '@react-native-oh/react-native-harmony-cli': V.rnohCli,
    '@babel/runtime': V.babelRuntime,
    '@react-navigation/elements': V.reactNavigationElements,
    'react-native-svg': '15.12.0',
  };

  // 默认模板的图标改由 react-native-svg 绘制，避免 ExpoFontLoader 的鸿蒙原生模块依赖。
  delete pkg.dependencies['@expo/vector-icons'];
  // 默认启动页不依赖原生 Splash 模块；代码与 app.json plugin 由 create 清理。
  delete pkg.dependencies['expo-splash-screen'];
  delete pkg.dependencies['expo-splash-screen2'];

  pkg.devDependencies = {
    ...(pkg.devDependencies || {}),
    '@react-native/metro-config': V.reactNative,
    '@react-native-community/cli': V.reactNativeCommunityCli,
    'patch-package': '8.0.0',
    'react-native-svg-transformer': '1.5.3',
  };

  lockAllDependencyVersions(pkg);

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}
