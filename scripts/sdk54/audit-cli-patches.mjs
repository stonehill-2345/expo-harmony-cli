import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { SDK54_CLI_PATCH_PACKAGES, SDK54_PACKAGES, isSdk54RuntimePatchTarget } from './catalog.mjs';

const ARCHIVE_PATTERN = /\.(?:tgz|hap|har)(?:\b|$)/i;
const BINARY_PATCH_PATTERN = /(?:^|\n)(?:GIT binary patch|Binary files .+ differ)(?:\n|$)/;
const CREDENTIAL_PATTERNS = [
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /(?:_authToken\s*=|NpmToken\.[A-Za-z0-9_-]+)/,
  /\b(?:gh[pousr]_|npm_)[A-Za-z0-9_-]{12,}\b/,
  /\bAuthorization\s*:\s*Bearer\s+\S+/i,
];
const PRIVATE_IPV4_PATTERN = /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/;
const FORBIDDEN_CACHE_PATH_PATTERN = /(?:^|[^A-Za-z0-9_.-])(?:build-cache|\.hvigor|\.cxx|oh_modules|[^/\\]+\.tsbuildinfo)(?:[/\\]|$)/im;
const LICENSE_BASENAME_PATTERN = /^(?:licen[cs]e|notice|copying)(?:[-.]|$)/i;
const PUBLIC_REGISTRY_HOSTS = new Set(['registry.npmjs.org', 'registry.yarnpkg.com', 'registry.npmmirror.com']);
const EXPO_LICENSE_SHA256 = 'fb3ca4a837f5779e83cef89b78253a8949cfb9429c340309f62d0465ec6610b4';
const EXPO_CLI_THIRD_PARTY_SHA256 = '377f1a9763b9dd9dad730c1534fe2f215496eda131553a16f3f9251f559e3a59';
const SCREENS_ISC_SHA256 = '1ae666f49b43866942f26146127e96776fb02a2311f9abd68ea38065240d0e04';

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function relativeFiles(rootDir) {
  const files = [];
  const visit = (directory, relativeDirectory = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relativePath = relativeDirectory ? path.join(relativeDirectory, entry.name) : entry.name;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath, relativePath);
      else if (entry.isFile() || entry.isSymbolicLink()) files.push(relativePath.split(path.sep).join('/'));
    }
  };
  visit(rootDir);
  return files;
}

function safePath(rootDir, relativePath) {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) return null;
  const absolutePath = path.resolve(rootDir, relativePath);
  const relative = path.relative(rootDir, absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  try {
    if (fs.lstatSync(absolutePath).isSymbolicLink()) return null;
    const realRoot = fs.realpathSync(rootDir);
    const realTarget = fs.realpathSync(absolutePath);
    const realRelative = path.relative(realRoot, realTarget);
    if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) return null;
  } catch { return absolutePath; }
  return absolutePath;
}

function securityFailures(text, label, { manifest = false } = {}) {
  const failures = [];
  if (/\/Users\//.test(text)) failures.push(`${label}: absolute path /Users/`);
  if (/\/private\/tmp(?:\/|\b)/.test(text)) failures.push(`${label}: absolute path /private/tmp`);
  if (CREDENTIAL_PATTERNS.some(pattern => pattern.test(text))) failures.push(`${label}: credential material`);
  if (PRIVATE_IPV4_PATTERN.test(text)) failures.push(`${label}: private IPv4 address`);
  if (BINARY_PATCH_PATTERN.test(text)) failures.push(`${label}: binary patch payload`);

  const urls = [...text.matchAll(/https?:\/\/[^\s"'<>]+/gi)].map(match => match[0]);
  const registryAssignments = [...text.matchAll(/\bregistry\s*=\s*(https?:\/\/[^\s"'<>]+)/gi)]
    .map(match => match[1]);
  const hostname = (url) => {
    try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
  };
  const privateRegistry = registryAssignments.some(url => !PUBLIC_REGISTRY_HOSTS.has(hostname(url))) ||
    urls.some((url) => {
      const host = hostname(url);
      return /(?:^|\.)(?:corp|internal|private|intranet|local)(?:\.|$)/.test(host) && /(?:npm|registry)/.test(host);
    });
  if (manifest && urls.length > 0) failures.push(`${label}: registry URL is not allowed in manifest`);
  else if (privateRegistry) failures.push(`${label}: private registry URL`);
  return failures;
}

function decodePatch(filePath, label, failures) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.includes(0)) {
    failures.push(`${label}: binary patch payload`);
    return null;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    failures.push(`${label}: binary patch payload`);
    return null;
  }
}

function patchSections(text) {
  return text.split(/(?=^diff --git )/m).filter(section => section.startsWith('diff --git '));
}

function sectionTarget(section, packageName) {
  const header = section.split(/\r?\n/, 1)[0];
  const match = header.match(/^diff --git a\/(.+) b\/(.+)$/);
  if (!match || match[1] !== match[2]) return null;
  const prefix = `node_modules/${packageName}/`;
  if (!match[1].startsWith(prefix)) return null;
  return match[1].slice(prefix.length);
}

function hasActualHunk(section) {
  if (!/^@@ /m.test(section)) return false;
  return section.split(/\r?\n/).some(line =>
    (line.startsWith('+') && !line.startsWith('+++')) ||
    (line.startsWith('-') && !line.startsWith('---')),
  );
}

function inspectPatch(text, entry) {
  const failures = [...securityFailures(text, entry.file)];
  const sections = patchSections(text);
  const targets = sections.map(section => sectionTarget(section, entry.name)).filter(Boolean);
  const hunks = sections
    .map(section => ({ section, target: sectionTarget(section, entry.name) }))
    .filter(({ section, target }) => target && hasActualHunk(section));

  const archiveTarget = targets.find(target => ARCHIVE_PATTERN.test(target));
  if (archiveTarget) {
    const extension = archiveTarget.match(ARCHIVE_PATTERN)?.[0].toLowerCase();
    failures.push(`${entry.file}: forbidden archive path ${extension}`);
  }
  if (targets.some(target => FORBIDDEN_CACHE_PATH_PATTERN.test(target))) {
    failures.push(`${entry.file}: forbidden cache path`);
  }
  if (sections.length === 0) failures.push(`${entry.file}: no patch hunks`);
  if (sections.some(section => sectionTarget(section, entry.name) === null)) {
    failures.push(`${entry.file}: patch path does not match package ${entry.name}`);
  }
  const nonRuntimeTarget = targets.find(target => !isSdk54RuntimePatchTarget(entry.name, target));
  if (nonRuntimeTarget) failures.push(`${entry.file}: non-runtime patch target ${nonRuntimeTarget}`);
  const provenanceManifest = sections.find(section => {
    if (sectionTarget(section, entry.name) !== 'package.json') return false;
    const changes = section.split(/\r?\n/).filter(line => /^[+-](?![+-])/.test(line));
    return changes.length > 0 && changes.every(line => /"gitHead"/.test(line));
  });
  if (provenanceManifest) failures.push(`${entry.file}: non-runtime provenance-only package.json`);
  if (!hunks.some(({ target }) =>
    target.startsWith('build/') ||
    target.startsWith('harmony/') ||
    (entry.name === '@react-native-ohos/react-native-screens' && (target.startsWith('lib/') || target.startsWith('src/'))) ||
    ['package.json', 'bundledNativeModules.json', 'expo-module.config.json'].includes(target),
  )) {
    failures.push(`${entry.file}: missing build/harmony runtime hunk`);
  }

  const requiredTarget = entry.name === '@expo/cli'
    ? 'build/bin/cli'
    : entry.name === '@expo/metro-config'
      ? 'build/withHarmony.js'
      : entry.name === 'expo-modules-autolinking'
        ? 'build/platforms/harmony/'
        : entry.name === '@react-native-ohos/react-native-screens'
          ? 'lib/commonjs/components/ScreenStackItem.js'
          : null;
  if (requiredTarget && !hunks.some(({ target }) =>
    requiredTarget.endsWith('/') ? target.startsWith(requiredTarget) : target === requiredTarget,
  )) {
    failures.push(`${entry.file}: missing critical hunk ${requiredTarget}`);
  }
  return failures;
}

export function auditCliPatches({ patchDir, manifestPath, expectedPackages = SDK54_CLI_PATCH_PACKAGES }) {
  const failures = [];
  const packages = [];
  let manifest;
  let manifestText;

  try {
    manifestText = fs.readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(manifestText);
  } catch (error) {
    return { ok: false, packages, failures: [`${path.basename(manifestPath)}: ${error.message}`] };
  }

  failures.push(...securityFailures(manifestText, path.basename(manifestPath), { manifest: true }));
  const entries = Array.isArray(manifest.patches) ? manifest.patches : [];
  if (!Array.isArray(manifest.patches)) failures.push('manifest.json: patches must be an array');
  if (expectedPackages.filter(descriptor => SDK54_PACKAGES.some(expo => expo.name === descriptor.name)).length !== 14) failures.push('expectedPackages must contain exactly 14 Expo packages');
  if (entries.length !== expectedPackages.length) failures.push(`manifest.json: expected ${expectedPackages.length} patch entries, found ${entries.length}`);

  const expectedByName = new Map(expectedPackages.map(descriptor => [descriptor.name, descriptor]));
  const entryCounts = new Map();
  const fileCounts = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      failures.push('manifest.json: invalid patch entry');
      continue;
    }
    packages.push(entry.name);
    entryCounts.set(entry.name, (entryCounts.get(entry.name) ?? 0) + 1);
    fileCounts.set(entry.file, (fileCounts.get(entry.file) ?? 0) + 1);
  }

  for (const [name, count] of entryCounts) {
    if (count > 1) failures.push(`manifest.json: duplicate package ${name}`);
  }
  for (const [file, count] of fileCounts) {
    if (count > 1) failures.push(`manifest.json: duplicate patch file ${file}`);
  }
  for (const descriptor of expectedPackages) {
    if (!entryCounts.has(descriptor.name)) failures.push(`${descriptor.name}: missing manifest package`);
  }
  for (const name of entryCounts.keys()) {
    if (!expectedByName.has(name)) failures.push(`${name}: unexpected manifest package`);
  }

  const sortedNames = [...packages].sort((left, right) => String(left).localeCompare(String(right), 'en'));
  if (packages.some((name, index) => name !== sortedNames[index])) {
    failures.push('manifest.json: patches must use stable order by package name');
  }

  const declaredPatchFiles = new Set(entries.map(entry => entry?.file).filter(file => typeof file === 'string'));
  if (fs.existsSync(patchDir)) {
    for (const file of relativeFiles(patchDir).filter(file => file.endsWith('.patch'))) {
      if (!declaredPatchFiles.has(file)) failures.push(`${file}: patch file is not declared by manifest`);
    }
  } else {
    failures.push(`${patchDir}: patch directory is missing`);
  }

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const descriptor = expectedByName.get(entry.name);
    if (!descriptor) continue;
    if (entry.version !== descriptor.version) {
      failures.push(`${entry.name}: version must be ${descriptor.version}, found ${entry.version}`);
    }
    if (entry.file !== descriptor.patchFile) {
      failures.push(`${entry.name}: patch file must be ${descriptor.patchFile}, found ${entry.file}`);
    }

    const patchPath = safePath(patchDir, entry.file);
    if (!patchPath) {
      failures.push(`${entry.file}: patch path must stay inside patch directory`);
    } else if (!fs.existsSync(patchPath)) {
      failures.push(`${entry.file}: patch file is missing`);
    } else {
      const actualSha = sha256(patchPath);
      if (entry.sha256 !== actualSha) failures.push(`${entry.file}: sha256 mismatch`);
      const text = decodePatch(patchPath, entry.file, failures);
      if (text !== null) failures.push(...inspectPatch(text, entry));
    }

    if (!Array.isArray(entry.licenses) || entry.licenses.length === 0) {
      failures.push(`${entry.file}: LICENSE/NOTICE references are missing`);
    } else {
      for (const license of entry.licenses) {
        const referencedLicense = safePath(patchDir, license);
        if (!referencedLicense || !LICENSE_BASENAME_PATTERN.test(path.basename(license ?? ''))) {
          failures.push(`${entry.file}: LICENSE/NOTICE reference is invalid: ${license}`);
        } else if (!fs.existsSync(referencedLicense) || !fs.statSync(referencedLicense).isFile()) {
          failures.push(`${entry.file}: referenced LICENSE/NOTICE is missing: ${license}`);
        } else {
          const licenseText = fs.readFileSync(referencedLicense, 'utf8');
          const licenseHash = sha256(referencedLicense);
          const expectedLicenseHash = entry.name === '@react-native-ohos/react-native-screens' ? SCREENS_ISC_SHA256 : license.endsWith('LICENSE-third-party') ? EXPO_CLI_THIRD_PARTY_SHA256 : EXPO_LICENSE_SHA256;
          if (licenseText.trim().length < 100 || /expo-harmony-cli contributors/i.test(licenseText) || licenseHash !== expectedLicenseHash) {
            failures.push(`${entry.file}: referenced LICENSE/NOTICE is not valid upstream license text: ${license}`);
          }
        }
      }
    }
  }

  return { ok: failures.length === 0, packages, failures };
}

function main() {
  const args = process.argv.slice(2);
  const value = (name, fallback) => { const inline = args.find(arg => arg.startsWith(`${name}=`)); if (inline) return inline.slice(name.length + 1); const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
  const positional = args.filter((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'));
  const patchDir = path.resolve(value('--patch-dir', positional[0] ?? 'apps/cli/content/patches/sdk-54'));
  const manifestPath = path.resolve(value('--manifest', positional[1] ?? path.join(patchDir, 'manifest.json')));
  const report = auditCliPatches({ patchDir, manifestPath, expectedPackages: SDK54_CLI_PATCH_PACKAGES });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
