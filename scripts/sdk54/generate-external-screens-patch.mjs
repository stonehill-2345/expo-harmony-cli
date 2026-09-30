import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const NAME = '@react-native-ohos/react-native-screens';
const VERSION = '4.9.0';
const PATCH_PACKAGE = path.resolve('node_modules/patch-package/dist/index.js');
const OVERLAY = path.resolve('scripts/sdk54/external-overlays/react-native-screens-4.9.0');
const LICENSE = path.resolve('scripts/sdk54/licenses/react-native-ohos-screens-ISC');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export function applyScreensOverlay(packageRoot) {
  const files = [];
  const visit = (dir, relative = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const next = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) visit(path.join(dir, entry.name), next);
      else files.push(next);
    }
  };
  visit(OVERLAY);
  for (const relative of files) {
    const target = path.join(packageRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(OVERLAY, relative), target);
  }
  return files.sort();
}

export function generateExternalScreensPatch(outputDir) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-screens-patch-'));
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    const archiveName = execFileSync('npm', ['pack', '--ignore-scripts', '--silent', `${NAME}@${VERSION}`, '--pack-destination', root], { encoding: 'utf8' }).trim().split(/\r?\n/).at(-1);
    const unpack = path.join(root, 'unpack'); fs.mkdirSync(unpack);
    execFileSync('tar', ['-xzf', path.join(root, archiveName), '-C', unpack]);
    const target = path.join(root, 'node_modules', NAME); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.cpSync(path.join(unpack, 'package'), target, { recursive: true });
    const overlayFiles = applyScreensOverlay(target);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'screens-patch', version: '1.0.0', dependencies: { [NAME]: VERSION } }));
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ name: 'screens-patch', version: '1.0.0', lockfileVersion: 3, packages: { '': { dependencies: { [NAME]: VERSION } }, [`node_modules/${NAME}`]: { version: VERSION } } }));
    fs.mkdirSync(path.join(root, 'patches'));
    execFileSync(process.execPath, [PATCH_PACKAGE, NAME, '--patch-dir', 'patches', '--exclude', '^$'], { cwd: root, stdio: 'pipe', env: { ...process.env, CI: '1' } });
    const file = '@react-native-ohos+react-native-screens+4.9.0.patch';
    fs.copyFileSync(path.join(root, 'patches', file), path.join(outputDir, file));
    const license = 'licenses/@react-native-ohos__react-native-screens/LICENSE';
    fs.mkdirSync(path.join(outputDir, path.dirname(license)), { recursive: true }); fs.copyFileSync(LICENSE, path.join(outputDir, license));
    return { name: NAME, version: VERSION, file, sha256: sha256(path.join(outputDir, file)), licenses: [license], overlayFiles };
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

function main() { const args=process.argv.slice(2); const i=args.indexOf('--output'); const output=path.resolve(i>=0?args[i+1]:'apps/cli/content/patches/sdk-54'); const report=generateExternalScreensPatch(output); process.stdout.write(JSON.stringify(report,null,2)+'\n'); }
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
