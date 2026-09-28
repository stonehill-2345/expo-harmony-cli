import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  BLANK_DEV_DEPENDENCIES,
  BLANK_EXPO_PACKAGES,
  BLANK_PLAIN_DEPENDENCIES,
  DEFAULT_DEV_DEPENDENCIES,
  DEFAULT_EXPO_PACKAGES,
  DEFAULT_EXTERNAL_PACKAGES,
  DEFAULT_IMAGE_FILES,
  DEFAULT_IMAGE_IMPORT,
  DEFAULT_PLAIN_DEPENDENCIES,
  DEFAULT_REACT_NATIVE_IMAGE_IMPORT,
  EXPO_ARCHIVE_VERSIONS,
  EXTERNAL_ARCHIVE_VERSIONS,
  FIXTURE_TEMPLATES,
} from './fixture-contract.mjs';

const FORBIDDEN_PATHS = Object.freeze([
  ['harmony', 'harmony/'],
  ['metro.config.js', 'metro.config.js'],
  ['index.harmony.js', 'index.harmony.js'],
  ['shims', 'shims/'],
]);
const DEPENDENCY_SECTIONS = Object.freeze([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]);

function reportFor(template, failures = []) {
  return {
    template,
    changedFiles: [],
    packageVersions: {},
    substitutions: [],
    failures,
  };
}

function readJson(filePath, label, failures) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    return null;
  }
}

function countOccurrences(contents, value) {
  return contents.split(value).length - 1;
}

function archiveReference(projectDir, tgzDir, file) {
  const relative = path.relative(projectDir, path.join(tgzDir, file)).split(path.sep).join('/');
  return `file:${relative.startsWith('.') ? relative : `./${relative}`}`;
}

function validateBypasses(projectDir, manifest, failures) {
  for (const [relativePath, label] of FORBIDDEN_PATHS) {
    if (fs.existsSync(path.join(projectDir, relativePath))) {
      failures.push(`Fixture must not contain pre-existing ${label}`);
    }
  }
  if (DEPENDENCY_SECTIONS.some(
    (section) => Object.hasOwn(manifest[section] ?? {}, 'patch-package'),
  )) {
    failures.push('Fixture must not depend on patch-package');
  }
  if (Object.hasOwn(manifest.scripts ?? {}, 'postinstall')) {
    failures.push('Fixture must not define a postinstall script');
  }
}

function isContainedPath(rootDir, candidate) {
  const relative = path.relative(rootDir, candidate);
  return relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function normalizePackageArray(staging, field, failures) {
  if (!Array.isArray(staging[field])) {
    failures.push(`Staging manifest ${field} must be an array`);
    return [];
  }
  return staging[field];
}

function validateExactPackageSet({ entries, expectedVersions, expectedSource, label, failures }) {
  const expectedNames = new Set(Object.keys(expectedVersions));
  const namedEntries = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string' || entry.name === '') {
      failures.push(`Staging manifest contains an invalid ${label} package entry`);
      continue;
    }
    namedEntries.push(entry);
    if (!expectedNames.has(entry.name)) {
      failures.push(`Staging manifest contains unexpected ${label} package ${entry.name}`);
      continue;
    }
    if (entry.version !== expectedVersions[entry.name]) {
      failures.push(
        `Staging manifest has ${label} package ${entry.name}@${entry.version}; expected ${entry.name}@${expectedVersions[entry.name]}`,
      );
    }
    if (entry.source !== expectedSource) {
      failures.push(
        `Staging manifest source for ${label} package ${entry.name} is ${entry.source}; expected ${expectedSource}`,
      );
    }
  }

  for (const [name, version] of Object.entries(expectedVersions)) {
    if (!namedEntries.some((entry) => entry.name === name)) {
      failures.push(`Staging manifest is missing ${label} package ${name}@${version}`);
    }
  }
}

function validateArchiveEntry(entry, tgzDir, canonicalTgzDir, failures) {
  const label = typeof entry?.name === 'string' && entry.name ? entry.name : '<unknown>';
  const file = entry?.file;
  if (typeof file !== 'string' || file === '' || file === '.' || file === '..') {
    failures.push(`Staging archive filename for ${label} must be a non-empty .tgz basename`);
    return false;
  }
  if (file.includes('/') || file.includes('\\')) {
    failures.push(`Staging archive filename for ${label} must not contain a path separator or traversal`);
    return false;
  }
  if (!file.endsWith('.tgz')) {
    failures.push(`Staging archive filename for ${label} must end with .tgz`);
    return false;
  }

  const archivePath = path.resolve(tgzDir, file);
  if (!isContainedPath(tgzDir, archivePath)) {
    failures.push(`Staging archive for ${label} resolves outside tgzDir`);
    return false;
  }

  let canonicalArchive;
  try {
    canonicalArchive = fs.realpathSync(archivePath);
  } catch (error) {
    failures.push(`Staging archive for ${label} is missing or unreadable: ${file}: ${error.message}`);
    return false;
  }
  if (!isContainedPath(canonicalTgzDir, canonicalArchive)) {
    failures.push(`Staging archive for ${label} resolves outside canonical tgzDir: ${file}`);
    return false;
  }

  let archiveStat;
  try {
    archiveStat = fs.lstatSync(archivePath);
  } catch (error) {
    failures.push(`Staging archive for ${label} cannot be inspected: ${file}: ${error.message}`);
    return false;
  }
  if (!archiveStat.isFile()) {
    failures.push(`Staging archive for ${label} must be an actual regular file: ${file}`);
    return false;
  }
  return true;
}

function loadArchiveEntries(tgzDir, failures) {
  const staging = readJson(path.join(tgzDir, 'manifest.json'), 'Staging manifest', failures);
  if (!staging || typeof staging !== 'object' || Array.isArray(staging)) return new Map();

  const expoPackages = normalizePackageArray(staging, 'expoPackages', failures);
  const externalPackages = normalizePackageArray(staging, 'externalPackages', failures);
  if (expoPackages.length !== 14) {
    failures.push('Staging manifest must contain exactly 14 expoPackages');
  }
  if (externalPackages.length !== 11) {
    failures.push('Staging manifest must contain exactly 11 externalPackages');
  }
  if (staging.packages !== 25) {
    failures.push('Staging manifest packages must equal 25');
  }
  if (!Array.isArray(staging.failures) || staging.failures.length > 0) {
    failures.push('Staging manifest must have zero failures');
  }

  validateExactPackageSet({
    entries: expoPackages,
    expectedVersions: EXPO_ARCHIVE_VERSIONS,
    expectedSource: 'workspace',
    label: 'workspace',
    failures,
  });
  validateExactPackageSet({
    entries: externalPackages,
    expectedVersions: EXTERNAL_ARCHIVE_VERSIONS,
    expectedSource: 'external',
    label: 'external',
    failures,
  });

  const allEntries = [...expoPackages, ...externalPackages];
  const counts = new Map();
  for (const entry of allEntries) {
    if (entry && typeof entry === 'object' && typeof entry.name === 'string' && entry.name !== '') {
      counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
    }
  }
  for (const [name, count] of counts) {
    if (count > 1) failures.push(`Staging manifest contains duplicate package ${name}`);
  }

  let canonicalTgzDir;
  try {
    canonicalTgzDir = fs.realpathSync(tgzDir);
    if (!fs.statSync(canonicalTgzDir).isDirectory()) {
      failures.push(`Staging tgzDir must be a directory: ${tgzDir}`);
      return new Map();
    }
  } catch (error) {
    failures.push(`Staging tgzDir cannot be resolved: ${tgzDir}: ${error.message}`);
    return new Map();
  }

  const entries = new Map();
  for (const entry of allEntries) {
    const validArchive = validateArchiveEntry(entry, tgzDir, canonicalTgzDir, failures);
    if (
      validArchive
      && entry
      && typeof entry === 'object'
      && typeof entry.name === 'string'
      && entry.name !== ''
      && !entries.has(entry.name)
    ) {
      entries.set(entry.name, entry);
    }
  }
  return entries;
}

function resolveArchivePins({ names, versions, source, entries, projectDir, tgzDir, failures }) {
  const pins = {};
  for (const name of names) {
    const entry = entries.get(name);
    const expectedVersion = versions[name];
    if (!entry) {
      failures.push(`Staging manifest is missing ${name}@${expectedVersion}`);
      continue;
    }
    if (entry.version !== expectedVersion) {
      failures.push(`Staging manifest has ${name}@${entry.version}; expected ${expectedVersion}`);
    }
    if (entry.source !== source) {
      failures.push(`Staging manifest source for ${name} is ${entry.source}; expected ${source}`);
    }
    pins[name] = archiveReference(projectDir, tgzDir, entry.file);
  }
  return pins;
}

function validateDefaultTemplate(projectDir, manifest, failures) {
  if (manifest.main !== 'expo-router/entry') {
    failures.push('Default fixture package.json main must be expo-router/entry');
  }
  const replacements = new Map();
  for (const relativePath of DEFAULT_IMAGE_FILES) {
    const filePath = path.join(projectDir, relativePath);
    let contents;
    try {
      contents = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      failures.push(`${relativePath}: ${error.message}`);
      continue;
    }
    if (
      countOccurrences(contents, DEFAULT_IMAGE_IMPORT) !== 1
      || countOccurrences(contents, "from 'expo-image'") !== 1
    ) {
      failures.push(`${relativePath}: expected expo-image import shape was not found exactly once`);
      continue;
    }
    replacements.set(
      relativePath,
      contents.replace(DEFAULT_IMAGE_IMPORT, DEFAULT_REACT_NATIVE_IMAGE_IMPORT),
    );
  }
  for (const relativePath of ['app/(tabs)/_layout.tsx', 'app/_layout.tsx', 'app/modal.tsx', 'app.json']) {
    if (!fs.existsSync(path.join(projectDir, relativePath))) {
      failures.push(`Default fixture is missing ${relativePath}`);
    }
  }
  return replacements;
}

export function prepareCreateExpoFixture({ projectDir, template, tgzDir }) {
  const failures = [];
  const report = reportFor(template, failures);
  if (!FIXTURE_TEMPLATES.includes(template)) {
    failures.push(`Unsupported template: ${template}`);
    return report;
  }

  const resolvedProjectDir = path.resolve(projectDir);
  const resolvedTgzDir = path.resolve(tgzDir);
  const packagePath = path.join(resolvedProjectDir, 'package.json');
  const manifest = readJson(packagePath, 'Fixture package.json', failures);
  if (!manifest) return report;

  validateBypasses(resolvedProjectDir, manifest, failures);
  const entries = loadArchiveEntries(resolvedTgzDir, failures);
  const expoNames = template === 'default' ? DEFAULT_EXPO_PACKAGES : BLANK_EXPO_PACKAGES;
  const externalNames = template === 'default'
    ? DEFAULT_EXTERNAL_PACKAGES
    : ['@react-native-oh/react-native-harmony'];
  const dependencies = {
    ...resolveArchivePins({
      names: expoNames,
      versions: EXPO_ARCHIVE_VERSIONS,
      source: 'workspace',
      entries,
      projectDir: resolvedProjectDir,
      tgzDir: resolvedTgzDir,
      failures,
    }),
    ...resolveArchivePins({
      names: externalNames,
      versions: EXTERNAL_ARCHIVE_VERSIONS,
      source: 'external',
      entries,
      projectDir: resolvedProjectDir,
      tgzDir: resolvedTgzDir,
      failures,
    }),
    ...(template === 'default' ? DEFAULT_PLAIN_DEPENDENCIES : BLANK_PLAIN_DEPENDENCIES),
  };
  const devDependencies = template === 'default'
    ? { ...DEFAULT_DEV_DEPENDENCIES }
    : { ...BLANK_DEV_DEPENDENCIES };
  const replacements = template === 'default'
    ? validateDefaultTemplate(resolvedProjectDir, manifest, failures)
    : new Map();

  if (failures.length > 0) return report;

  const nextManifest = { ...manifest, dependencies, devDependencies };
  const nextPackageText = `${JSON.stringify(nextManifest, null, 2)}\n`;
  if (fs.readFileSync(packagePath, 'utf8') !== nextPackageText) {
    fs.writeFileSync(packagePath, nextPackageText);
    report.changedFiles.push('package.json');
  }
  for (const [relativePath, contents] of replacements) {
    fs.writeFileSync(path.join(resolvedProjectDir, relativePath), contents);
    report.changedFiles.push(relativePath);
    report.substitutions.push(`${relativePath}: expo-image Image -> react-native Image`);
  }
  report.changedFiles.sort((left, right) => left.localeCompare(right, 'en'));
  report.substitutions.sort((left, right) => left.localeCompare(right, 'en'));
  report.packageVersions = { ...dependencies, ...devDependencies };
  return report;
}

function argumentValue(args, name) {
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function main() {
  const args = process.argv.slice(2);
  const projectDir = argumentValue(args, '--project');
  const template = argumentValue(args, '--template');
  const tgzDir = argumentValue(args, '--tgz');
  if (!projectDir || !template || !tgzDir) {
    console.error('Usage: node scripts/sdk54/prepare-create-expo-fixture.mjs --project <dir> --template <blank-typescript|default> --tgz <dir>');
    process.exitCode = 1;
    return;
  }
  const report = prepareCreateExpoFixture({ projectDir, template, tgzDir });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.failures.length > 0) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
