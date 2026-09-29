import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

import { SDK54_PACKAGES } from './catalog.mjs';

const ROOT_IGNORED_DIRECTORIES = new Set([
  '.git', '.pnpm-store', 'coverage', 'dist', 'node_modules', 'outputs',
]);
const APPROVED_STAGE_COMMAND = 'node scripts/sdk54/stage-e2e-packages.mjs';
const FORBIDDEN_DIRECTORY_NAMES = new Set([
  'node_modules', 'oh_modules', '.hvigor', '.cxx', 'build-cache',
]);
const FORBIDDEN_EXTENSIONS = new Set(['.hap', '.har', '.tgz']);
const TEXT_EXTENSIONS = new Set([
  '.c', '.cc', '.cmake', '.cpp', '.css', '.ets', '.gradle', '.h', '.hpp', '.html', '.js',
  '.json', '.json5', '.jsx', '.md', '.mjs', '.cjs', '.properties', '.sh', '.toml', '.ts',
  '.tsx', '.txt', '.xml', '.yaml', '.yml', '.zsh',
]);

function portable(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function isTextFile(filePath) {
  const basename = path.basename(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(path.extname(basename)) ||
    ['license', 'licence', 'notice', 'readme', 'copying'].some((prefix) => basename.startsWith(prefix));
}

function textViolations(text, relativePath) {
  const violations = [];
  const normalizedPath = portable(relativePath);
  const basename = path.basename(normalizedPath).toLowerCase();
  const extension = path.extname(basename);
  const isTestFixture = /(^|\/)(?:__tests__|tests?|fixtures?|__mocks__|snapshots?)(?:\/|$)/i.test(normalizedPath);
  const configurationText = new Set([
    '.env', '.json', '.json5', '.npmrc', '.properties', '.toml', '.txt', '.yaml', '.yml',
  ]).has(extension) || basename === 'package.json' || basename === 'oh-package.json5';

  if (!isTestFixture && /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(text)) violations.push('PRIVATE KEY');
  if (configurationText && /\/Users\//.test(text)) violations.push('/Users/');
  if (configurationText && /\/private\/tmp(?:\/|\b)/.test(text)) violations.push('/private/tmp');
  if (configurationText && /\bfile:\//.test(text)) violations.push('file:/');
  if (configurationText) {
    const privateIp = text.match(/\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/);
    if (privateIp) violations.push(privateIp[0]);
  }
  if (!isTestFixture && /\bAKIA[0-9A-Z]{16}\b/.test(text)) violations.push('AWS access key');
  if (!isTestFixture && /(?:_authToken\s*=|NpmToken\.[A-Za-z0-9_-]+)/.test(text)) violations.push('registry token');
  return violations;
}

function isAllowedCliCanary(relativePath) {
  return relativePath.startsWith('packages/@expo/cli/static/canary-full/node_modules/');
}

function isApprovedEvidencePath(relativePath) {
  return relativePath === '.tmp' || relativePath.startsWith('.tmp/') ||
    relativePath === '.superpowers/sdd' || relativePath.startsWith('.superpowers/sdd/');
}

function gitVisibleEvidenceFiles(rootDir) {
  try {
    const output = execFileSync(
      'git',
      ['-C', rootDir, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.superpowers/sdd', '.tmp'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return new Set(output.split('\0').filter(Boolean));
  } catch {
    return null;
  }
}

function rootManifestTextForScan(text, manifest) {
  if (manifest.scripts?.['sdk54:e2e:stage'] !== APPROVED_STAGE_COMMAND) return text;
  return JSON.stringify({
    ...manifest,
    scripts: { ...manifest.scripts, 'sdk54:e2e:stage': '' },
  });
}

function workspaceManifestPaths(rootDir) {
  const manifests = [path.join(rootDir, 'package.json')];
  const appsDir = path.join(rootDir, 'apps');
  if (fs.existsSync(appsDir)) {
    for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) manifests.push(path.join(appsDir, entry.name, 'package.json'));
    }
  }
  for (const descriptor of SDK54_PACKAGES) {
    manifests.push(path.join(rootDir, descriptor.relativePath, 'package.json'));
  }
  return manifests.filter((manifestPath) => fs.existsSync(manifestPath));
}

function repositoryFiles(rootDir) {
  const files = [];
  const gitCheckout = fs.existsSync(path.join(rootDir, '.git'));
  const visibleEvidenceFiles = gitVisibleEvidenceFiles(rootDir);
  const workspaceRoots = new Set(SDK54_PACKAGES.map(({ relativePath }) => relativePath));
  const appsDir = path.join(rootDir, 'apps');
  if (fs.existsSync(appsDir)) {
    for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) workspaceRoots.add(`apps/${entry.name}`);
    }
  }
  const visit = (currentDir, relativeDir = '') => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (!relativeDir && entry.isDirectory() && ROOT_IGNORED_DIRECTORIES.has(entry.name)) continue;
      const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        const parentPath = portable(relativeDir);
        if (gitCheckout && entry.name === 'node_modules' && workspaceRoots.has(parentPath)) continue;
        visit(absolutePath, relativePath);
      }
      else if (entry.isFile()) {
        const normalizedPath = portable(relativePath);
        if (visibleEvidenceFiles && isApprovedEvidencePath(normalizedPath) &&
          !visibleEvidenceFiles.has(normalizedPath)) continue;
        files.push({ absolutePath, relativePath: normalizedPath });
      }
    }
  };
  visit(rootDir);
  return files;
}

export function checkRepository(rootDir) {
  const publishable = [];
  const forbiddenFiles = [];
  const forbiddenText = [];
  const failures = [];
  const rootManifestPath = path.join(rootDir, 'package.json');
  const rootManifestText = fs.readFileSync(rootManifestPath, 'utf8');
  const rootManifest = JSON.parse(rootManifestText);

  if (rootManifest.scripts?.['sdk54:e2e:stage'] !== APPROVED_STAGE_COMMAND) {
    failures.push('root package.json sdk54:e2e:stage must equal the approved command');
  }

  for (const manifestPath of workspaceManifestPaths(rootDir)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.private !== true && manifest.name) publishable.push(manifest.name);
  }
  publishable.sort((left, right) => left.localeCompare(right, 'en'));
  if (publishable.length !== 1 || publishable[0] !== 'expo-harmony-cli') {
    failures.push('expo-harmony-cli must be the sole publishable package');
  }

  for (const { absolutePath, relativePath } of repositoryFiles(rootDir)) {
    const segments = relativePath.split('/');
    const forbiddenPath =
      !isAllowedCliCanary(relativePath) &&
      (segments.some((segment) => FORBIDDEN_DIRECTORY_NAMES.has(segment)) ||
        FORBIDDEN_EXTENSIONS.has(path.extname(relativePath).toLowerCase()));
    if (forbiddenPath) forbiddenFiles.push(relativePath);
    if (!isTextFile(absolutePath)) continue;
    const text = relativePath === 'package.json'
      ? rootManifestTextForScan(rootManifestText, rootManifest)
      : fs.readFileSync(absolutePath, 'utf8');
    for (const violation of textViolations(text, relativePath)) {
      forbiddenText.push(`${relativePath}: ${violation}`);
    }
  }

  forbiddenFiles.sort();
  forbiddenText.sort();
  if (forbiddenFiles.length > 0) failures.push(`${forbiddenFiles.length} forbidden repository files`);
  if (forbiddenText.length > 0) failures.push(`${forbiddenText.length} forbidden repository text matches`);

  return { publishable, forbiddenFiles, forbiddenText, failures };
}

function main() {
  const report = checkRepository(process.cwd());
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.failures.length > 0) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
