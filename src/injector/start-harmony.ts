import * as fs from 'fs';
import * as path from 'path';

const START_HARMONY_JS = `#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function isPrivateIPv4(address) {
  return /^(10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[0-1])\\.)/.test(address);
}

function findLanIPv4() {
  if (process.env.HARMONY_METRO_HOST) return process.env.HARMONY_METRO_HOST;
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      candidates.push(entry.address);
    }
  }
  return candidates.find(isPrivateIPv4) || candidates[0] || 'localhost';
}

function getMetroHostAndPort() {
  const host = findLanIPv4();
  return host.includes(':') ? '[' + host + ']:8888' : host + ':8888';
}

function findHdc() {
  const windowsDevEcoHdc = process.platform === 'win32' && process.env.ProgramFiles
    ? path.join(process.env.ProgramFiles, 'Huawei', 'DevEco Studio', 'sdk', 'default', 'openharmony', 'toolchains', 'hdc.exe')
    : null;
  const candidates = [
    process.env.HDC_PATH,
    windowsDevEcoHdc,
    '/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc',
    'hdc',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue;
    const result = spawnSync(candidate, ['version'], { stdio: 'ignore' });
    if (result.status === 0) return candidate;
  }
  return null;
}

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
  const original = [
    '  console.warn(',
    '    \\x60The "EXNativeModulesProxy" native module is not exported through NativeModules; verify that expo-modules-core\\\'s native code is linked properly\\x60',
    '  );',
  ].join('\\n');
  const patched = [
    '  Object.keys(NativeModules).forEach((moduleName) => {',
    '    NativeModulesProxy[moduleName] = NativeModules[moduleName];',
    '  });',
  ].join('\\n');
  if (content.includes(patched)) return true;
  if (!content.includes(original)) return false;
  content = content.replace(original, patched);
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

function findExpoModulesCoreNativeModulesProxy() {
  try {
    return require.resolve('expo-modules-core/src/NativeModulesProxy.native.ts', { paths: [process.cwd()] });
  } catch {}

  const pnpmDir = path.join(process.cwd(), 'node_modules/.pnpm');
  if (!fs.existsSync(pnpmDir)) return null;
  for (const entry of fs.readdirSync(pnpmDir)) {
    if (!entry.startsWith('expo-modules-core@')) continue;
    const candidate = path.join(
      pnpmDir,
      entry,
      'node_modules/expo-modules-core/src/NativeModulesProxy.native.ts'
    );
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}


function ensurePnpmDecodedRNOHLogBoxImages() {
  const pnpmDir = path.join(process.cwd(), 'node_modules/.pnpm');
  if (!fs.existsSync(pnpmDir)) return;
  for (const entry of fs.readdirSync(pnpmDir)) {
    if (!entry.startsWith('@react-native-oh+react-native-harmony@')) continue;
    const decodedEntry = entry.replace(/\\+/g, ' ');
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
  const proxyPath = findExpoModulesCoreNativeModulesProxy();
  if (proxyPath) patchExpoModulesCoreNativeModulesProxy(proxyPath);
}

function ensureRNOHLogBoxImages() {
  let rnohRoot;
  try {
    rnohRoot = path.dirname(require.resolve('@react-native-oh/react-native-harmony/package.json', { paths: [process.cwd()] }));
  } catch {
    return;
  }

  const logBoxImagesDir = path.join(rnohRoot, 'Libraries/LogBox/UI/LogBoxImages');
  fs.mkdirSync(logBoxImagesDir, { recursive: true });
  for (const imageName of LOGBOX_IMAGE_NAMES) {
    const imagePath = path.join(logBoxImagesDir, imageName);
    if (!fs.existsSync(imagePath)) {
      fs.writeFileSync(imagePath, Buffer.from(TRANSPARENT_PNG_BASE64, 'base64'));
    }
  }
}

function runHdcRport(hdc, remote, local) {
  const result = spawnSync(hdc, ['rport', remote, local], { encoding: 'utf8' });
  if (result.status === 0) {
    console.log('[harmony] hdc rport ' + remote + ' ' + local + ' ready');
    return;
  }
  const message = ((result.stderr || '') + (result.stdout || '')).trim();
  if (message) console.warn('[harmony] hdc rport ' + remote + ' ' + local + ' skipped: ' + message);
}

function setupHarmonyPortForwarding() {
  const hdc = findHdc();
  if (!hdc) {
    console.warn('[harmony] hdc not found, skip reverse port forwarding. If the app cannot load bundle, run: hdc rport tcp:8888 tcp:8888');
    return;
  }
  // Harmony RNOH 默认从设备侧 8081 请求，开发机上的 Harmony Metro 独立使用 8888。
  runHdcRport(hdc, 'tcp:8888', 'tcp:8888');
  runHdcRport(hdc, 'tcp:8081', 'tcp:8888');
}

ensureRNOHLogBoxImages();
ensurePnpmDecodedRNOHLogBoxImages();
ensureExpoModulesCoreNativeModulesProxyNoWarn();
setupHarmonyPortForwarding();

const metroHostAndPort = getMetroHostAndPort();
const metroHost = metroHostAndPort.replace(/^\[/, '').replace(/\]:\d+$/, '').split(':')[0];
console.log('[harmony] Metro LAN URL: http://' + metroHostAndPort);
console.log('[harmony] If the app cannot load bundle on a real device, set RNOH Dev Settings to: ' + metroHostAndPort);

const env = {
  ...process.env,
  EXPO_OFFLINE: '1',
  RN_BUNDLE_PLATFORM: 'harmony',
  EXPO_PACKAGER_HOSTNAME: metroHost,
  REACT_NATIVE_PACKAGER_HOSTNAME: metroHost,
};

const metroArgs = ['start', '--offline', '--port', '8888'];
if (process.env.HARMONY_METRO_CLEAR === '1' || process.env.HARMONY_METRO_CLEAR === 'true') {
  metroArgs.push('--clear');
}

const child = spawn('expo', metroArgs, {
  stdio: 'inherit',
  shell: true,
  env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
`;

export function writeStartHarmony(targetDir: string): void {
  const scriptsDir = path.join(targetDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  const file = path.join(scriptsDir, 'start-harmony.js');
  fs.writeFileSync(file, START_HARMONY_JS);
  fs.chmodSync(file, 0o755);
}
