import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { extract as extractTar, list as listTar } from 'tar';

import { EXPECTED_INTERNAL_EDGES, SDK54_PACKAGES, getDescriptorByName } from './catalog.mjs';
import { packPackages, probePackageRuntime } from './pack-packages.mjs';

const FORBIDDEN_DIRECTORY_NAMES = new Set([
  'node_modules',
  'oh_modules',
  '.hvigor',
  '.cxx',
  'build-cache',
]);
const FORBIDDEN_EXTENSIONS = new Set(['.hap', '.har', '.tgz']);
const TEXT_EXTENSIONS = new Set([
  '.c', '.cc', '.cmake', '.cpp', '.css', '.ets', '.gradle', '.h', '.hpp', '.html', '.js',
  '.json', '.json5', '.jsx', '.map', '.md', '.mjs', '.cjs', '.properties', '.sh', '.toml', '.ts',
  '.tsx', '.txt', '.xml', '.yaml', '.yml', '.zsh',
]);
const ENTRY_EXTENSIONS = ['.js', '.mjs', '.cjs', '.json', '.node', '.ts', '.tsx', '.d.ts'];
const TYPE_ENTRY_EXTENSIONS = ['.d.ts', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'];

function portable(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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

function sourceMapViolations(text) {
  let sourceMap;
  try {
    sourceMap = JSON.parse(text);
  } catch (error) {
    return [`invalid JSON: ${error.message}`];
  }
  const sources = Array.isArray(sourceMap.sources) ? sourceMap.sources : [];
  return [sourceMap.sourceRoot, ...sources]
    .filter((value) => typeof value === 'string' && value.length > 0)
    .filter((value) => path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^file:/i.test(value));
}

function isAllowedCliCanary(packageName, relativePath) {
  return packageName === '@expo/cli' &&
    relativePath.startsWith('static/canary-full/node_modules/');
}

function walkFiles(rootDir, ignoreWorkspaceNodeModules = false) {
  const files = [];
  const visit = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (ignoreWorkspaceNodeModules && currentDir === rootDir && entry.name === 'node_modules') continue;
        visit(absolutePath);
      }
      else if (entry.isFile()) files.push(absolutePath);
    }
  };
  visit(rootDir);
  return files;
}

function scanTree({ rootDir, packageName, label, ignoreWorkspaceNodeModules = false }) {
  const failures = [];
  for (const filePath of walkFiles(rootDir, ignoreWorkspaceNodeModules)) {
    const relativePath = portable(path.relative(rootDir, filePath));
    const segments = relativePath.split('/');
    const forbiddenPath =
      !isAllowedCliCanary(packageName, relativePath) &&
      (segments.some((segment) => FORBIDDEN_DIRECTORY_NAMES.has(segment)) ||
        FORBIDDEN_EXTENSIONS.has(path.extname(relativePath).toLowerCase()));
    if (forbiddenPath) failures.push(`${label}: forbidden file ${relativePath}`);
    if (!isTextFile(filePath)) continue;
    const text = fs.readFileSync(filePath, 'utf8');
    for (const violation of textViolations(text, relativePath)) {
      failures.push(`${label}: forbidden text ${violation} in ${relativePath}`);
    }
    if (relativePath.endsWith('.map')) {
      for (const violation of sourceMapViolations(text)) {
        failures.push(`${label}: source map ${relativePath} contains absolute path ${violation}`);
      }
    }
  }
  return failures;
}

function versionParts(value) {
  const match = String(value).trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function simpleRangeAccepts(version, range) {
  const normalized = range.trim().replace(/^workspace:/, '');
  if (normalized === '*' || normalized === 'latest') return true;
  const target = versionParts(version);
  if (!target) return false;
  if (normalized.startsWith('^') || normalized.startsWith('~')) {
    const minimum = versionParts(normalized.slice(1));
    if (!minimum || compareVersions(target, minimum) < 0) return false;
    if (normalized.startsWith('~')) return target[0] === minimum[0] && target[1] === minimum[1];
    if (minimum[0] > 0) return target[0] === minimum[0];
    if (minimum[1] > 0) return target[0] === 0 && target[1] === minimum[1];
    return target[0] === 0 && target[1] === 0 && target[2] === minimum[2];
  }
  return normalized.replace(/^=/, '') === version;
}

function rangeAccepts(version, range) {
  return String(range).split('||').some((candidate) => simpleRangeAccepts(version, candidate));
}

function edgeKey(edge) {
  return `${edge.from}\0${edge.section}\0${edge.to}`;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function exactFile(packageRoot, target) {
  if (typeof target !== 'string' || !target.startsWith('./')) return null;
  const absoluteTarget = path.resolve(packageRoot, target);
  if (!isInside(packageRoot, absoluteTarget)) return null;
  try { return fs.statSync(absoluteTarget).isFile() ? portable(path.relative(packageRoot, absoluteTarget)) : null; } catch { return null; }
}

function resolveEntrypoint(packageRoot, target, field) {
  if (field === 'exports') return exactFile(packageRoot, target);
  if (field === 'bin') return exactFile(packageRoot, target.startsWith('./') ? target : `./${target}`);
  if (typeof target !== 'string' || target.length === 0 || /^[a-z]+:/i.test(target) || path.isAbsolute(target)) return null;
  const absoluteTarget = path.resolve(packageRoot, target);
  if (!isInside(packageRoot, absoluteTarget)) return null;
  const candidates = [absoluteTarget];
  if (field === 'types') {
    if (!target.endsWith('.d.ts')) candidates.push(`${absoluteTarget}.d.ts`, path.join(absoluteTarget, 'index.d.ts'));
  } else if (!path.extname(absoluteTarget)) {
    candidates.push(...ENTRY_EXTENSIONS.map((extension) => `${absoluteTarget}${extension}`));
    candidates.push(...ENTRY_EXTENSIONS.map((extension) => path.join(absoluteTarget, `index${extension}`)));
  }
  for (const candidate of candidates) {
    try { if (fs.statSync(candidate).isFile()) return portable(path.relative(packageRoot, candidate)); } catch {}
  }
  return null;
}

function invalidExport(failures, detail) {
  failures.push(`invalid exports: ${detail}`);
}

function validatePackagePath(value, { allowRoot = false } = {}) {
  if (allowRoot && value === '.') return { valid: true, wildcardCount: 0 };
  if (!value.startsWith('./') || value.includes('\\')) return { valid: false, reason: 'must start with ./ and use forward slashes' };
  let wildcardCount = 0;
  for (const rawSegment of value.slice(2).split('/')) {
    if (!rawSegment) return { valid: false, reason: 'contains an empty segment' };
    let segment;
    try { segment = decodeURIComponent(rawSegment); }
    catch { return { valid: false, reason: `contains malformed percent encoding in ${rawSegment}` }; }
    if (segment.includes('/') || segment.includes('\\')) return { valid: false, reason: `decoded segment contains a separator: ${rawSegment}` };
    const normalized = segment.toLowerCase();
    if (segment === '.' || segment === '..') return { valid: false, reason: `contains decoded ${segment} segment` };
    if (normalized === 'node_modules') return { valid: false, reason: 'contains node_modules segment' };
    wildcardCount += (segment.match(/\*/g) ?? []).length;
  }
  return { valid: true, wildcardCount };
}

function isIntegerConditionKey(key) {
  return /^(?:0|[1-9]\d*)$/.test(key);
}

function validateExports(exportsValue) {
  const failures = [];
  const concrete = [];
  const visitTarget = (value, subpath, patternCount, location) => {
    if (value === null) return;
    if (typeof value === 'string') {
      const targetValidation = validatePackagePath(value);
      if (!targetValidation.valid) {
        invalidExport(failures, `${location} target is unsafe (${targetValidation.reason}): ${value}`);
        return;
      }
      const targetPatterns = targetValidation.wildcardCount;
      if (patternCount > 1 || targetPatterns > 1 || targetPatterns !== patternCount) {
        invalidExport(failures, `${location} wildcard mapping is incoherent`);
        return;
      }
      if (targetPatterns === 0) concrete.push({ subpath, target: value });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((child, index) => visitTarget(child, subpath, patternCount, `${location}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') {
      invalidExport(failures, `${location} target has invalid type ${typeof value}`);
      return;
    }
    for (const [condition, child] of Object.entries(value)) {
      if (!condition || condition.startsWith('.') || isIntegerConditionKey(condition)) {
        invalidExport(failures, `${location} condition key is invalid: ${condition}`);
        continue;
      }
      visitTarget(child, subpath, patternCount, `${location}.${condition}`);
    }
  };

  if (exportsValue === null || typeof exportsValue === 'string' || Array.isArray(exportsValue)) {
    visitTarget(exportsValue, '.', 0, 'exports');
  } else if (!exportsValue || typeof exportsValue !== 'object') {
    invalidExport(failures, `root has invalid type ${typeof exportsValue}`);
  } else {
    const keys = Object.keys(exportsValue);
    const subpathKeys = keys.filter((key) => key.startsWith('.'));
    if (subpathKeys.length > 0 && subpathKeys.length !== keys.length) {
      invalidExport(failures, 'top-level keys must not mix subpaths and conditions');
    } else if (subpathKeys.length === 0) {
      visitTarget(exportsValue, '.', 0, 'exports');
    } else {
      for (const [subpath, value] of Object.entries(exportsValue)) {
        const subpathValidation = validatePackagePath(subpath, { allowRoot: true });
        if (!subpathValidation.valid) {
          invalidExport(failures, `invalid subpath key (${subpathValidation.reason}): ${subpath}`);
          continue;
        }
        visitTarget(value, subpath, subpathValidation.wildcardCount, `exports[${subpath}]`);
      }
    }
  }
  return { failures, concrete };
}

function inspectDeclaredEntrypoints(packageRoot, packageName, manifest) {
  const failures = [];
  const checks = [];
  for (const field of ['main', 'module', 'types']) {
    if (typeof manifest[field] === 'string') checks.push({ label: field, target: manifest[field], field });
  }
  if (typeof manifest.bin === 'string') {
    checks.push({ label: 'bin', target: manifest.bin, field: 'bin', executable: true });
  } else if (manifest.bin && typeof manifest.bin === 'object') {
    for (const [name, target] of Object.entries(manifest.bin)) {
      checks.push({ label: `bin.${name}`, target, field: 'bin', executable: true });
    }
  }
  if (Object.hasOwn(manifest, 'exports')) {
    const exportsValidation = validateExports(manifest.exports);
    failures.push(...exportsValidation.failures.map((failure) => `${packageName}: ${failure}`));
    for (const { subpath, target } of exportsValidation.concrete) {
      checks.push({ label: `exports[${subpath}]`, target, field: 'exports' });
    }
  }

  const seen = new Set();
  for (const check of checks) {
    const key = `${check.label}\0${check.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const resolved = resolveEntrypoint(packageRoot, check.target, check.field);
    if (!resolved) {
      failures.push(`${packageName}: ${check.label} target is missing: ${check.target}`);
      continue;
    }
    if (check.executable && (fs.statSync(path.join(packageRoot, resolved)).mode & 0o111) === 0) {
      failures.push(`${packageName}: ${check.label} target is not executable: ${resolved}`);
    }
  }
  return failures;
}

function inspectPackageRuntime(packageRoot, descriptor, rootDir) {
  const failures = [];
  for (const required of descriptor.runtime?.requiredFiles ?? []) {
    const outputPath = path.join(packageRoot, required.path);
    let stat;
    try { stat = fs.statSync(outputPath); } catch { failures.push(`${descriptor.name}: required runtime output is missing: ${required.path}`); continue; }
    if (!stat.isFile()) failures.push(`${descriptor.name}: required runtime output is not a file: ${required.path}`);
    if (required.executable && (stat.mode & 0o111) === 0) failures.push(`${descriptor.name}: required runtime output is not executable: ${required.path}`);
  }
  if (failures.length === 0 && descriptor.runtime?.probe) {
    try {
      probePackageRuntime({ packageDir: packageRoot, sourcePackageDir: path.join(rootDir, descriptor.relativePath), rootDir, descriptor });
    } catch (error) {
      failures.push(`${descriptor.name}: ${error.message}`);
    }
  }
  return failures;
}

function inspectArchive({ archivePath, packageName, expectedVersion, expectedBytes, expectedSha256, rootDir }) {
  const failures = [];
  if (!fs.existsSync(archivePath)) return [`${packageName}: archive is missing: ${archivePath}`];
  const actualBytes = fs.statSync(archivePath).size;
  const actualSha256 = sha256(archivePath);
  if (Number.isFinite(expectedBytes) && actualBytes !== expectedBytes) {
    failures.push(`${packageName}: archive byte size mismatch`);
  }
  if (/^[a-f0-9]{64}$/.test(expectedSha256 ?? '') && actualSha256 !== expectedSha256) {
    failures.push(`${packageName}: archive sha256 mismatch`);
  }

  const entries = [];
  try {
    listTar({
      file: archivePath,
      sync: true,
      onReadEntry(entry) {
        entries.push(entry.path);
        entry.resume();
      },
    });
  } catch (error) {
    return [...failures, `${packageName}: cannot list archive: ${error.message}`];
  }
  for (const entryPath of entries) {
    const normalized = entryPath.replaceAll('\\', '/');
    if (!normalized.startsWith('package/') || normalized.includes('../')) {
      failures.push(`${packageName}: unsafe archive entry ${normalized}`);
      continue;
    }
    const relativePath = normalized.slice('package/'.length);
    const segments = relativePath.split('/');
    if (
      !isAllowedCliCanary(packageName, relativePath) &&
      (segments.some((segment) => FORBIDDEN_DIRECTORY_NAMES.has(segment)) ||
        FORBIDDEN_EXTENSIONS.has(path.extname(relativePath).toLowerCase()))
    ) {
      failures.push(`${packageName}: forbidden archive entry ${relativePath}`);
    }
  }

  const extractRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-audit-archive-'));
  try {
    extractTar({ file: archivePath, cwd: extractRoot, sync: true, strict: true });
    const packageRoot = path.join(extractRoot, 'package');
    if (!fs.existsSync(packageRoot) || !fs.statSync(packageRoot).isDirectory()) {
      failures.push(`${packageName}: archive package/ root is missing`);
    } else {
      failures.push(...scanTree({ rootDir: packageRoot, packageName, label: `${packageName} archive` }));
      const manifestPath = path.join(packageRoot, 'package.json');
      if (!fs.existsSync(manifestPath)) {
        failures.push(`${packageName}: archive package.json is missing`);
      } else {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.name !== packageName) failures.push(`${packageName}: archive package name mismatch: ${String(manifest.name)}`);
        if (manifest.version !== expectedVersion) failures.push(`${packageName}: archive package version mismatch: ${String(manifest.version)} (expected ${expectedVersion})`);
        failures.push(...inspectDeclaredEntrypoints(packageRoot, packageName, manifest));
        const descriptor = SDK54_PACKAGES.find(({ name }) => name === packageName);
        if (descriptor) failures.push(...inspectPackageRuntime(packageRoot, descriptor, rootDir));
      }
    }
  } catch (error) {
    failures.push(`${packageName}: cannot extract or inspect archive: ${error.message}`);
  } finally {
    fs.rmSync(extractRoot, { recursive: true, force: true });
  }
  return failures;
}

export function auditPackages({ rootDir, manifestPath }) {
  const failures = [];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const catalogNames = new Set(SDK54_PACKAGES.map(({ name }) => name));
  const actualEdges = [];
  for (const failure of manifest.failures ?? []) failures.push(`Pack manifest failure: ${failure}`);
  const manifestEntries = Array.isArray(manifest.packages) ? manifest.packages : [];
  const counts = new Map();
  for (const entry of manifestEntries) {
    counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
    const descriptor = SDK54_PACKAGES.find(({ name }) => name === entry.name);
    if (!descriptor) failures.push(`Unknown manifest package: ${String(entry.name)}`);
    else if (entry.version !== descriptor.version) failures.push(`Manifest version mismatch for ${entry.name}: ${String(entry.version)} (expected ${descriptor.version})`);
  }
  for (const descriptor of SDK54_PACKAGES) {
    const count = counts.get(descriptor.name) ?? 0;
    if (count === 0) failures.push(`Missing catalog package: ${descriptor.name}`);
    if (count > 1) failures.push(`Duplicate manifest package: ${descriptor.name}`);
  }
  if (manifestEntries.length !== SDK54_PACKAGES.length) failures.push(`Manifest package count mismatch: ${manifestEntries.length} (expected ${SDK54_PACKAGES.length})`);

  for (const descriptor of SDK54_PACKAGES) {
    const packageDir = path.join(rootDir, descriptor.relativePath);
    if (!fs.existsSync(packageDir)) {
      failures.push(`${descriptor.name}: package directory is missing`);
      continue;
    }
    const packageManifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
    for (const section of ['dependencies', 'peerDependencies']) {
      for (const [targetName, range] of Object.entries(packageManifest[section] ?? {})) {
        if (!catalogNames.has(targetName)) continue;
        const edge = { from: descriptor.name, to: targetName, section };
        actualEdges.push(edge);
        const target = getDescriptorByName(targetName);
        if (!rangeAccepts(target.version, range)) {
          failures.push(
            `${descriptor.name} -> ${targetName} (${section}) range ${range} does not accept ${target.version}`,
          );
        }
      }
    }
    failures.push(...scanTree({
      rootDir: packageDir,
      packageName: descriptor.name,
      label: descriptor.name,
      ignoreWorkspaceNodeModules: fs.existsSync(path.join(rootDir, '.git')),
    }));
  }

  const actualKeys = new Set(actualEdges.map(edgeKey));
  const expectedKeys = new Set(EXPECTED_INTERNAL_EDGES.map(edgeKey));
  for (const edge of EXPECTED_INTERNAL_EDGES) {
    if (!actualKeys.has(edgeKey(edge))) failures.push(`Missing internal edge: ${edge.from} -> ${edge.to} (${edge.section})`);
  }
  for (const edge of actualEdges) {
    if (!expectedKeys.has(edgeKey(edge))) failures.push(`Unexpected internal edge: ${edge.from} -> ${edge.to} (${edge.section})`);
  }

  const manifestDir = path.dirname(manifestPath);
  for (const archive of manifestEntries) {
    failures.push(...inspectArchive({
      archivePath: path.resolve(manifestDir, archive.file),
      packageName: archive.name,
      expectedVersion: SDK54_PACKAGES.find(({ name }) => name === archive.name)?.version ?? archive.version,
      expectedBytes: archive.bytes,
      expectedSha256: archive.sha256,
      rootDir,
    }));
  }

  return {
    packages: manifest.packages?.length ?? 0,
    internalEdges: actualKeys.size,
    failures: [...new Set(failures)].sort(),
  };
}

async function main() {
  const rootDir = process.cwd();
  const args = process.argv.slice(2);
  const manifestIndex = args.indexOf('--manifest');
  const explicitManifest = manifestIndex >= 0 ? args[manifestIndex + 1] : null;
  let temporaryRoot;
  let manifestPath;
  try {
    if (explicitManifest) {
      manifestPath = path.resolve(rootDir, explicitManifest);
    } else {
      temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-audit-pack-'));
      await packPackages({ rootDir, outputDir: temporaryRoot, round: 'audit' });
      manifestPath = path.join(temporaryRoot, 'manifest.json');
    }
    const report = auditPackages({ rootDir, manifestPath });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.failures.length > 0) process.exitCode = 1;
  } finally {
    if (temporaryRoot) fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
