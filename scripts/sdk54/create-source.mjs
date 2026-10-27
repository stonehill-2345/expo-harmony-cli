import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const CREATE_SOURCE_REVISION = '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1';
const SOURCE_PATH = 'packages/create-expo';
const ADAPTED_FILES = new Set(['package.json', 'tsconfig.json', 'src/cli.ts', 'src/createAsync.ts', 'src/Examples.ts', 'src/utils/github.ts']);
const ADDITIONAL_FILES = new Set(['src/harmonyTemplates.ts', 'LICENSE', 'UPSTREAM_LICENSE']);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function inspectCreateSource({ root = process.cwd(), sourceRepo = '/tmp/sdk54-expo-source' } = {}) {
  const git = (...args) => execFileSync('git', ['-C', sourceRepo, ...args], {
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1' }, maxBuffer: 16 * 1024 * 1024,
  });
  const tree = git('ls-tree', '-rz', CREATE_SOURCE_REVISION, '--', SOURCE_PATH).toString().split('\0').filter(Boolean);
  const failures = [];
  const files = tree.map((row) => {
    const [header, sourcePath] = row.split('\t');
    const [mode, type, blob] = header.split(' ');
    if (type !== 'blob' || !['100644', '100755'].includes(mode)) throw new Error(`Unexpected upstream source kind: ${sourcePath}`);
    const relative = sourcePath.slice(SOURCE_PATH.length + 1);
    const upstream = git('cat-file', 'blob', blob);
    const localPath = path.join(root, sourcePath);
    const local = fs.existsSync(localPath) ? fs.readFileSync(localPath) : null;
    const changed = !local || !local.equals(upstream);
    if (changed && !ADAPTED_FILES.has(relative)) failures.push(`Unapproved upstream source drift: ${sourcePath}`);
    if (!local) failures.push(`Missing upstream source: ${sourcePath}`);
    return {
      path: sourcePath, mode, upstreamBlob: blob, upstreamSha256: sha256(upstream),
      localSha256: local ? sha256(local) : null, disposition: changed ? 'harmony-adapted' : 'upstream-identical',
    };
  });
  const additionalFiles = [...ADDITIONAL_FILES].map((relative) => {
    const localPath = path.join(root, SOURCE_PATH, relative);
    if (!fs.existsSync(localPath)) failures.push(`Missing Harmony adaptation: ${relative}`);
    return { path: `${SOURCE_PATH}/${relative}`, sha256: fs.existsSync(localPath) ? sha256(fs.readFileSync(localPath)) : null };
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, SOURCE_PATH, 'package.json'), 'utf8'));
  const upstreamRootLicense = git('cat-file', 'blob', `${CREATE_SOURCE_REVISION}:LICENSE`);
  if (!fs.readFileSync(path.join(root, SOURCE_PATH, 'UPSTREAM_LICENSE')).equals(upstreamRootLicense)) {
    failures.push('Preserved upstream repository LICENSE does not match the fixed revision');
  }
  if (manifest.name !== '@expo-oh/create-expo' || manifest.version !== '3.5.12' || manifest.private !== true) {
    failures.push('Creator candidate identity/private guard mismatch');
  }
  for (const bin of ['create-expo', 'create-expo-app']) {
    if (manifest.bin?.[bin] !== './build/index.js') failures.push(`Creator bin mismatch: ${bin}`);
  }
  return {
    schemaVersion: 1,
    source: { repository: 'https://github.com/expo/expo.git', revision: CREATE_SOURCE_REVISION, path: SOURCE_PATH, upstreamVersion: '3.5.11' },
    candidate: { name: manifest.name, version: manifest.version, private: manifest.private },
    upstreamFiles: files.length,
    upstreamSourceSha256: sha256(JSON.stringify(files.map(({ path, upstreamBlob, upstreamSha256 }) => ({ path, upstreamBlob, upstreamSha256 })))),
    unchangedFiles: files.filter((file) => file.disposition === 'upstream-identical').length,
    adaptedFiles: files.filter((file) => file.disposition === 'harmony-adapted').length,
    files, additionalFiles, failures, passed: failures.length === 0,
    upstreamRootLicenseSha256: sha256(upstreamRootLicense),
    limitations: ['Source revision and registry gitHead are distinct; no build equivalence is claimed.', 'Creation does not establish Harmony build, runtime, device, HAR or ABI acceptance.'],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const argument = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
  const report = inspectCreateSource({ root: argument('--root', process.cwd()), sourceRepo: argument('--source-repo', '/tmp/sdk54-expo-source') });
  const output = argument('--output', null);
  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify({ passed: report.passed, upstreamFiles: report.upstreamFiles, unchangedFiles: report.unchangedFiles, adaptedFiles: report.adaptedFiles, failures: report.failures }));
  process.exitCode = report.passed ? 0 : 1;
}
