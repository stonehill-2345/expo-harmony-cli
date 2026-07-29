#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const rnohRoot = path.join(__dirname, '../node_modules/@react-native-oh/react-native-harmony');
const linkingJsPath = path.join(rnohRoot, 'Libraries/Linking/Linking.js');

const LOGBOX_IMAGE_NAMES = [
  'alert-triangle.png',
  'chevron-left.png',
  'chevron-right.png',
  'close.png',
  'loader.png',
];
const TRANSPARENT_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';


function patchExpoModulesCoreNativeModulesProxy(filePath) {
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, 'utf8');
  const original = `  console.warn(
    \`The "EXNativeModulesProxy" native module is not exported through NativeModules; verify that expo-modules-core's native code is linked properly\`
  );`;
  const patched = `  Object.keys(NativeModules).forEach((moduleName) => {
    NativeModulesProxy[moduleName] = NativeModules[moduleName];
  });`;
  if (content.includes(patched)) return true;
  if (!content.includes(original)) return false;
  content = content.replace(original, patched);
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}


function ensurePnpmDecodedRNOHLogBoxImages() {
  const pnpmDir = path.join(process.cwd(), 'node_modules/.pnpm');
  if (!fs.existsSync(pnpmDir)) return;
  for (const entry of fs.readdirSync(pnpmDir)) {
    if (!entry.startsWith('@react-native-oh+react-native-harmony@')) continue;
    const decodedEntry = entry.replace(/\+/g, ' ');
    if (decodedEntry === entry) continue;
    const realPath = path.join(pnpmDir, entry);
    const decodedPath = path.join(pnpmDir, decodedEntry);
    if (fs.existsSync(decodedPath)) continue;
    try {
      fs.symlinkSync(realPath, decodedPath, 'dir');
    } catch {
      const realImagesDir = path.join(realPath, 'node_modules/@react-native-oh/react-native-harmony/Libraries/LogBox/UI/LogBoxImages');
      const decodedImagesDir = path.join(decodedPath, 'node_modules/@react-native-oh/react-native-harmony/Libraries/LogBox/UI/LogBoxImages');
      fs.mkdirSync(decodedImagesDir, { recursive: true });
      if (fs.existsSync(realImagesDir)) {
        for (const imageName of fs.readdirSync(realImagesDir)) {
          fs.copyFileSync(path.join(realImagesDir, imageName), path.join(decodedImagesDir, imageName));
        }
      }
    }
  }
}

function ensureExpoModulesCoreNativeModulesProxyNoWarn() {
  const proxyPath = path.join(
    __dirname,
    '../node_modules/expo-modules-core/src/NativeModulesProxy.native.ts'
  );
  if (patchExpoModulesCoreNativeModulesProxy(proxyPath)) {
    console.log('[postinstall] ✓ Ensured expo-modules-core NativeModulesProxy no-warn fallback');
  } else {
    console.log('[postinstall] ℹ expo-modules-core NativeModulesProxy not found or already different, skipping');
  }
}

function ensureRNOHLogBoxImages() {
  const logBoxImagesDir = path.join(rnohRoot, 'Libraries/LogBox/UI/LogBoxImages');
  if (!fs.existsSync(rnohRoot)) {
    console.log('[postinstall] ℹ RNOH package not found, skipping LogBoxImages repair');
    return;
  }

  fs.mkdirSync(logBoxImagesDir, { recursive: true });
  for (const imageName of LOGBOX_IMAGE_NAMES) {
    const imagePath = path.join(logBoxImagesDir, imageName);
    if (!fs.existsSync(imagePath)) {
      fs.writeFileSync(imagePath, Buffer.from(TRANSPARENT_PNG_BASE64, 'base64'));
    }
  }
  console.log('[postinstall] ✓ Ensured RNOH LogBoxImages assets');
}

console.log('[postinstall] Applying RNOH Linking.js patch...');

if (fs.existsSync(linkingJsPath)) {
  let content = fs.readFileSync(linkingJsPath, 'utf8');
  if (content.includes("Platform.OS === 'harmony'")) {
    console.log('[postinstall] ✓ Linking.js already patched');
  } else {
    const originalConstructor = `    super(Platform.OS === 'ios' ? nullthrows(NativeLinkingManager) : undefined);`;
    const patchedConstructor = `    if (Platform.OS === 'ios') {
      super(nullthrows(NativeLinkingManager));
    } else if (Platform.OS === 'harmony') {
      super(nullthrows(NativeLinkingManager));
    } else {
      super(undefined);
    }`;
    if (content.includes(originalConstructor)) {
      content = content.replace(originalConstructor, patchedConstructor);
      fs.writeFileSync(linkingJsPath, content, 'utf8');
      console.log('[postinstall] ✓ Applied Linking.js patch');
    } else {
      console.log('[postinstall] ℹ Linking.js structure different, skipping');
    }
  }
} else {
  console.log('[postinstall] ℹ Linking.js not found, skipping');
}

ensureRNOHLogBoxImages();
ensurePnpmDecodedRNOHLogBoxImages();
ensureExpoModulesCoreNativeModulesProxyNoWarn();

console.log('[postinstall] Done!');
