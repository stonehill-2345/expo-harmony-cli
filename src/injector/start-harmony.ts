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
  return host.includes(':') ? '[' + host + ']:8081' : host + ':8081';
}

function isMetroRunningOnPort(port) {
  const result = spawnSync(process.execPath, ['-e',
    "const net=require('net');const s=net.connect(" + port + ",'127.0.0.1');" +
    "s.on('connect',function(){s.end();process.exit(0)});" +
    "s.on('error',function(){process.exit(1)});" +
    "setTimeout(function(){process.exit(1)},1000);"
  ], { stdio: 'ignore' });
  return result.status === 0;
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

function clearConflictingRportRules(hdc, devicePort) {
  const result = spawnSync(hdc, ['fport', 'ls'], { encoding: 'utf8' });
  if (result.status !== 0) return;
  const target = 'tcp:' + devicePort;
  const lines = (result.stdout || '').split('\\n');
  for (const line of lines) {
    // 反向转发(rport)规则行: "<serial>  tcp:REMOTE tcp:LOCAL  [Reverse]"
    // REMOTE 为设备侧端口，占用设备 8081 的旧规则会导致新 rport 失败，先清掉。
    const match = line.match(/(tcp:\\d+)\\s+(tcp:\\d+)\\s+\\[Reverse\\]/);
    if (!match) continue;
    const remote = match[1];
    const local = match[2];
    if (remote === target) {
      spawnSync(hdc, ['fport', 'rm', remote, local], { stdio: 'ignore' });
      console.log('[harmony] 清理冲突的 hdc 旧转发规则 ' + remote + ' ' + local);
    }
  }
}

function runHdcRport(hdc, remote, local) {
  const result = spawnSync(hdc, ['rport', remote, local], { encoding: 'utf8' });
  const out = ((result.stdout || '') + (result.stderr || '')).trim();
  // hdc rport 端口冲突失败时 exit code 仍为 0，必须依据输出判定：
  // 成功 → 输出 "Forwardport result:OK"；失败 → 输出含 "[Fail]"
  const ok = result.status === 0 && /Forwardport result:OK/i.test(out) && !/\\[Fail\\]/i.test(out);
  if (ok) {
    console.log('[harmony] hdc rport ' + remote + ' ' + local + ' ready');
    return;
  }
  console.error('[harmony] hdc rport ' + remote + ' ' + local + ' failed' + (out ? ': ' + out : ''));
  console.error('[harmony] 请确认 Harmony 设备已通过 USB/无线连接并开启调试。若仍失败，可手动执行：hdc rport ' + remote + ' ' + local);
  process.exit(1);
}

function setupHarmonyPortForwarding() {
  const hdc = findHdc();
  if (!hdc) {
    console.error('[harmony] 未找到 hdc。请安装 DevEco Studio，或设置 HDC_PATH 环境变量后重试：pnpm start:harmony');
    process.exit(1);
  }
  // 三端共用 8081：先清掉占用设备 8081 的旧转发规则（如 8888→8081 迁移残留），再建单条 rport。
  clearConflictingRportRules(hdc, 8081);
  runHdcRport(hdc, 'tcp:8081', 'tcp:8081');
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
  EXPO_PACKAGER_HOSTNAME: metroHost,
  REACT_NATIVE_PACKAGER_HOSTNAME: metroHost,
};

const metroArgs = ['start', '--offline', '--port', '8081'];
if (process.env.HARMONY_METRO_CLEAR === '1' || process.env.HARMONY_METRO_CLEAR === 'true') {
  metroArgs.push('--clear');
}

if (isMetroRunningOnPort(8081)) {
  console.log('[harmony] 检测到 8081 已有 Metro 运行，复用，仅完成 hdc 转发。');
} else {
  const child = spawn('expo', metroArgs, {
    stdio: 'inherit',
    shell: true,
    env,
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}
`;

export function writeStartHarmony(targetDir: string): void {
  const scriptsDir = path.join(targetDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  const file = path.join(scriptsDir, 'start-harmony.js');
  fs.writeFileSync(file, START_HARMONY_JS);
  fs.chmodSync(file, 0o755);
}
