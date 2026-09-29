import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  BLANK_PLAIN_DEPENDENCIES,
  DEFAULT_IMAGE_FILES,
  EXPO_ARCHIVE_VERSIONS,
  EXTERNAL_ARCHIVE_VERSIONS,
} from './fixture-contract.mjs';

export const APPROVED_VERSIONS = Object.freeze({
  cli: '1.5.0',
  createExpoApp: '5.0.0',
  patchPackage: '8.0.0',
  expo: EXPO_ARCHIVE_VERSIONS.expo,
  expoCli: EXPO_ARCHIVE_VERSIONS['@expo/cli'],
  expoMetroConfig: EXPO_ARCHIVE_VERSIONS['@expo/metro-config'],
  expoRouter: EXPO_ARCHIVE_VERSIONS['expo-router'],
  react: BLANK_PLAIN_DEPENDENCIES.react,
  reactNative: BLANK_PLAIN_DEPENDENCIES['react-native'],
  rnoh: EXTERNAL_ARCHIVE_VERSIONS['@react-native-oh/react-native-harmony'],
  rnohCli: BLANK_PLAIN_DEPENDENCIES['@react-native-oh/react-native-harmony-cli'],
  gestureHandler: EXTERNAL_ARCHIVE_VERSIONS['react-native-gesture-handler'],
  harmonyGestureHandler: EXTERNAL_ARCHIVE_VERSIONS['@react-native-ohos/react-native-gesture-handler'],
  reanimated: EXTERNAL_ARCHIVE_VERSIONS['react-native-reanimated'],
  harmonyReanimated: EXTERNAL_ARCHIVE_VERSIONS['@react-native-ohos/react-native-reanimated'],
  safeAreaContext: EXTERNAL_ARCHIVE_VERSIONS['react-native-safe-area-context'],
  harmonySafeAreaContext: EXTERNAL_ARCHIVE_VERSIONS['@react-native-ohos/react-native-safe-area-context'],
  screens: EXTERNAL_ARCHIVE_VERSIONS['react-native-screens'],
  harmonyScreens: EXTERNAL_ARCHIVE_VERSIONS['@react-native-ohos/react-native-screens'],
  worklets: EXTERNAL_ARCHIVE_VERSIONS['react-native-worklets'],
  harmonyWorklets: EXTERNAL_ARCHIVE_VERSIONS['@react-native-ohos/react-native-worklets'],
});

const APPROVED_PACKAGE_VERSIONS = Object.freeze({
  ...EXPO_ARCHIVE_VERSIONS,
  ...EXTERNAL_ARCHIVE_VERSIONS,
  '@react-native-oh/react-native-harmony-cli': BLANK_PLAIN_DEPENDENCIES['@react-native-oh/react-native-harmony-cli'],
  react: BLANK_PLAIN_DEPENDENCIES.react,
  'react-native': BLANK_PLAIN_DEPENDENCIES['react-native'],
});

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const MATRIX_CELLS = Object.freeze([
  ['blank-typescript', 'npm'],
  ['blank-typescript', 'pnpm'],
  ['default', 'npm'],
  ['default', 'pnpm'],
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function add(errors, condition, message) {
  if (!condition) errors.push(message);
}

function requireObject(errors, value, field) {
  add(errors, isObject(value), `${field} must be an object`);
  return isObject(value) ? value : {};
}

function requireExitZero(errors, value, field) {
  add(errors, value === 0, `${field} must be 0`);
}

function requireTrue(errors, value, field) {
  add(errors, value === true, `${field} must be true`);
}

function requireFalse(errors, value, field) {
  add(errors, value === false, `${field} must be false`);
}

function requireHash(errors, value, field) {
  add(errors, typeof value === 'string' && HASH_PATTERN.test(value), `${field} must be a sha256`);
}

function isPrivateAbsolutePath(value) {
  if (typeof value !== 'string') return false;
  return (
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    value.startsWith('~/') ||
    /file:\/\//i.test(value) ||
    /(^|[\s"'])\/(?:Users|home|private|tmp|var\/folders)\//.test(value)
  );
}

function scanPrivatePaths(value, errors, field = 'evidence') {
  if (typeof value === 'string') {
    if (isPrivateAbsolutePath(value)) errors.push(`${field} contains a private absolute path`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanPrivatePaths(entry, errors, `${field}[${index}]`));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    scanPrivatePaths(entry, errors, `${field}.${key}`);
  }
}

function validateVersions(evidence, errors) {
  const versions = requireObject(errors, evidence.versions, 'versions');
  for (const [name, expected] of Object.entries(APPROVED_VERSIONS)) {
    add(errors, versions[name] === expected, `versions.${name} must be ${expected}`);
  }

  const visit = (value, field) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${field}[${index}]`));
      return;
    }
    if (!isObject(value)) return;
    if (typeof value.name === 'string' && 'version' in value && value.name in APPROVED_PACKAGE_VERSIONS) {
      const expected = APPROVED_PACKAGE_VERSIONS[value.name];
      add(errors, value.version === expected, `${field}.version for ${value.name} must be ${expected}`);
    }
    for (const [key, entry] of Object.entries(value)) visit(entry, `${field}.${key}`);
  };
  visit(evidence, 'evidence');
}

function validateCommon(evidence, errors) {
  add(errors, isObject(evidence), 'evidence must be an object');
  if (!isObject(evidence)) return;
  add(errors, evidence.schemaVersion === 1, 'schemaVersion must be 1');
  scanPrivatePaths(evidence, errors);
  validateVersions(evidence, errors);
}

function validateCliTgz(evidence, errors) {
  const cliTgz = requireObject(errors, evidence.cliTgz, 'cliTgz');
  add(
    errors,
    typeof cliTgz.file === 'string' && path.basename(cliTgz.file) === cliTgz.file && cliTgz.file === 'expo-harmony-cli-1.5.0.tgz',
    'cliTgz.file must be expo-harmony-cli-1.5.0.tgz',
  );
  requireHash(errors, cliTgz.sha256, 'cliTgz.sha256');
}

function validateCreateArgv(errors, cell, field) {
  const create = requireObject(errors, cell.create, `${field}.create`);
  add(errors, Array.isArray(create.argv), `${field}.create.argv must be an array`);
  const argv = Array.isArray(create.argv) ? create.argv : [];
  const expectedTemplate = cell.template === 'default' ? 'default@sdk-54' : 'blank-typescript@sdk-54';
  add(errors, argv.includes('create-expo-app@5.0.0'), `${field}.create.argv must use create-expo-app@5.0.0`);
  const templateIndex = argv.indexOf('--template');
  add(
    errors,
    templateIndex >= 0 && argv[templateIndex + 1] === expectedTemplate,
    `${field}.create.argv must use --template ${expectedTemplate}`,
  );
  add(errors, argv.includes('--no-install'), `${field}.create.argv must use --no-install`);
  requireExitZero(errors, create.exitCode, `${field}.create.exitCode`);
}

function validateInstallCell(cell, errors, field) {
  validateCreateArgv(errors, cell, field);

  const install = requireObject(errors, cell.install, `${field}.install`);
  requireExitZero(errors, install.exitCode, `${field}.install.exitCode`);

  const patchProbe = requireObject(errors, cell.patchProbe, `${field}.patchProbe`);
  requireTrue(errors, patchProbe.success, `${field}.patchProbe.success`);

  validateOfficialPrebuild(cell.officialPrebuild, errors, `${field}.officialPrebuild`);
  validateForbiddenFileScan(cell.forbiddenFileScan, errors, `${field}.forbiddenFileScan`);

  const reinstall = requireObject(errors, cell.reinstall, `${field}.reinstall`);
  requireExitZero(errors, reinstall.exitCode, `${field}.reinstall.exitCode`);
  const reinstallProbe = requireObject(errors, reinstall.patchProbe, `${field}.reinstall.patchProbe`);
  requireTrue(errors, reinstallProbe.success, `${field}.reinstall.patchProbe.success`);

  const ignoreScripts = requireObject(errors, cell.ignoreScripts, `${field}.ignoreScripts`);
  requireExitZero(errors, ignoreScripts.installExitCode, `${field}.ignoreScripts.installExitCode`);
  requireTrue(errors, ignoreScripts.expectedFailure, `${field}.ignoreScripts.expectedFailure`);
  const ignoredProbe = requireObject(errors, ignoreScripts.patchProbe, `${field}.ignoreScripts.patchProbe`);
  requireFalse(errors, ignoredProbe.success, `${field}.ignoreScripts.patchProbe.success`);
}

function throwIfInvalid(kind, errors) {
  if (errors.length === 0) return;
  throw new Error(`${kind} evidence is invalid:\n- ${errors.join('\n- ')}`);
}

export function verifyInstallPrebuildEvidence(evidence) {
  const errors = [];
  validateCommon(evidence, errors);
  if (isObject(evidence)) validateCliTgz(evidence, errors);

  const matrix = isObject(evidence) && Array.isArray(evidence.matrix) ? evidence.matrix : [];
  add(errors, Array.isArray(evidence?.matrix), 'matrix must be an array');

  for (const [template, packageManager] of MATRIX_CELLS) {
    const matches = matrix.filter(
      (cell) => cell?.template === template && cell?.packageManager === packageManager,
    );
    add(errors, matches.length === 1, `matrix cell ${template}/${packageManager} must appear exactly once`);
    if (matches.length === 1) {
      validateInstallCell(matches[0], errors, `matrix.${template}/${packageManager}`);
    }
  }
  add(errors, matrix.length === MATRIX_CELLS.length, 'matrix must contain exactly 4 cells');

  const unsupported = requireObject(
    errors,
    evidence?.unsupportedPackageManagers,
    'unsupportedPackageManagers',
  );
  for (const packageManager of ['yarn', 'bun']) {
    const result = requireObject(
      errors,
      unsupported[packageManager],
      `unsupportedPackageManagers.${packageManager}`,
    );
    requireTrue(
      errors,
      result.rejectedBeforeCreate,
      `unsupportedPackageManagers.${packageManager}.rejectedBeforeCreate`,
    );
    requireFalse(
      errors,
      result.projectDirectoryCreated,
      `unsupportedPackageManagers.${packageManager}.projectDirectoryCreated`,
    );
  }

  throwIfInvalid('install-prebuild', errors);
  return evidence;
}

function validateOfficialPrebuild(value, errors, field) {
  const prebuild = requireObject(errors, value, field);
  add(
    errors,
    Array.isArray(prebuild.argv) &&
      prebuild.argv.join('\0') === ['npx', 'expo', 'prebuild', '--platform', 'harmony'].join('\0'),
    `${field}.argv must be npx expo prebuild --platform harmony`,
  );
  requireExitZero(errors, prebuild.exitCode, `${field}.exitCode`);
}

function validateForbiddenFileScan(value, errors, field = 'forbiddenFileScan') {
  const forbidden = requireObject(errors, value, field);
  requireTrue(errors, forbidden.success, `${field}.success`);
  add(errors, Array.isArray(forbidden.found) && forbidden.found.length === 0, `${field}.found must be empty`);
}

export function verifyBlankDeviceEvidence(evidence) {
  const errors = [];
  validateCommon(evidence, errors);
  if (!isObject(evidence)) {
    throwIfInvalid('blank-device', errors);
    return evidence;
  }

  validateCliTgz(evidence, errors);
  add(errors, evidence.template === 'blank-typescript', 'template must be blank-typescript');
  add(errors, evidence.packageManager === 'pnpm', 'packageManager must be pnpm');

  const freshCreate = requireObject(errors, evidence.freshCreate, 'freshCreate');
  requireTrue(errors, freshCreate.success, 'freshCreate.success');

  const applicationFiles = requireObject(errors, evidence.applicationFiles, 'applicationFiles');
  add(
    errors,
    Array.isArray(applicationFiles.changed) && applicationFiles.changed.length === 0,
    'applicationFiles.changed must be empty',
  );
  requireHash(errors, applicationFiles.baselineSha256, 'applicationFiles.baselineSha256');
  requireHash(errors, applicationFiles.actualSha256, 'applicationFiles.actualSha256');
  add(
    errors,
    applicationFiles.baselineSha256 === applicationFiles.actualSha256,
    'applicationFiles.baselineSha256 must equal applicationFiles.actualSha256',
  );

  validateOfficialPrebuild(evidence.officialPrebuild, errors, 'officialPrebuild');
  validateForbiddenFileScan(evidence.forbiddenFileScan, errors);

  const debug = requireObject(errors, evidence.debug, 'debug');
  for (const field of ['build', 'installed', 'launched', 'dev', 'officialBlankText']) {
    requireTrue(errors, debug[field], `debug.${field}`);
  }

  const release = requireObject(errors, evidence.release, 'release');
  for (const field of ['cleanBuild', 'installed', 'launched', 'officialBlankText']) {
    requireTrue(errors, release[field], `release.${field}`);
  }
  requireFalse(errors, release.dev, 'release.dev');
  for (const field of ['hapSha256', 'bundleSha256', 'embeddedBundleSha256']) {
    requireHash(errors, release[field], `release.${field}`);
  }
  add(
    errors,
    release.bundleSha256 === release.embeddedBundleSha256,
    'release.bundleSha256 must equal release.embeddedBundleSha256',
  );

  const coldStart = requireObject(errors, evidence.coldStart, 'coldStart');
  for (const field of ['metroStopped', 'launched', 'officialBlankText']) {
    requireTrue(errors, coldStart[field], `coldStart.${field}`);
  }

  throwIfInvalid('blank-device', errors);
  return evidence;
}


const DEFAULT_PROTECTED_FILES = Object.freeze(['app/modal.tsx', 'app/_layout.tsx', 'app.json']);

function requireTrueFields(errors, object, fields, prefix) {
  for (const field of fields) requireTrue(errors, object[field], `${prefix}.${field}`);
}

export function verifyDefaultDeviceEvidence(evidence) {
  const errors = [];
  validateCommon(evidence, errors);
  if (!isObject(evidence)) {
    throwIfInvalid('default-device', errors);
    return evidence;
  }

  validateCliTgz(evidence, errors);
  add(errors, evidence.template === 'default', 'template must be default');
  add(errors, evidence.packageManager === 'pnpm', 'packageManager must be pnpm');

  const freshCreate = requireObject(errors, evidence.freshCreate, 'freshCreate');
  requireTrue(errors, freshCreate.success, 'freshCreate.success');

  const applicationChanges = requireObject(errors, evidence.applicationChanges, 'applicationChanges');
  const actualFiles = Array.isArray(applicationChanges.files)
    ? [...applicationChanges.files].sort((left, right) => left.localeCompare(right, 'en'))
    : [];
  const expectedFiles = [...DEFAULT_IMAGE_FILES].sort((left, right) => left.localeCompare(right, 'en'));
  add(
    errors,
    JSON.stringify(actualFiles) === JSON.stringify(expectedFiles),
    `applicationChanges.files must contain only ${expectedFiles.join(', ')}`,
  );
  requireTrue(errors, applicationChanges.dependencyAdjustments, 'applicationChanges.dependencyAdjustments');

  const protectedFiles = requireObject(errors, evidence.protectedFiles, 'protectedFiles');
  add(
    errors,
    Object.keys(protectedFiles).length === DEFAULT_PROTECTED_FILES.length,
    `protectedFiles must contain exactly ${DEFAULT_PROTECTED_FILES.join(', ')}`,
  );
  for (const file of DEFAULT_PROTECTED_FILES) {
    const hashes = requireObject(errors, protectedFiles[file], `protectedFiles.${file}`);
    requireHash(errors, hashes.beforeSha256, `protectedFiles.${file}.beforeSha256`);
    requireHash(errors, hashes.afterSha256, `protectedFiles.${file}.afterSha256`);
    add(
      errors,
      hashes.beforeSha256 === hashes.afterSha256,
      `protectedFiles.${file}.beforeSha256 must equal protectedFiles.${file}.afterSha256`,
    );
  }

  const expoImage = requireObject(errors, evidence.expoImage, 'expoImage');
  requireFalse(errors, expoImage.backendSupported, 'expoImage.backendSupported');

  validateOfficialPrebuild(evidence.officialPrebuild, errors, 'officialPrebuild');
  validateForbiddenFileScan(evidence.forbiddenFileScan, errors);

  const debug = requireObject(errors, evidence.debug, 'debug');
  requireTrueFields(
    errors,
    debug,
    [
      'build',
      'installed',
      'launched',
      'dev',
      'tabs',
      'materialIcons',
      'reactNativeImages',
      'modal',
      'singleLevelDismissTo',
      'physicalBack',
      'customAnimation',
      'reload',
    ],
    'debug',
  );
  add(
    errors,
    Number.isInteger(debug.arkWebOpenCloseRounds) && debug.arkWebOpenCloseRounds > 0,
    'debug.arkWebOpenCloseRounds must be a positive integer',
  );

  const release = requireObject(errors, evidence.release, 'release');
  requireTrueFields(
    errors,
    release,
    [
      'cleanBuild',
      'installed',
      'launched',
      'tabs',
      'materialIcons',
      'reactNativeImages',
      'modal',
      'singleLevelDismissTo',
      'physicalBack',
      'customAnimation',
    ],
    'release',
  );
  requireFalse(errors, release.dev, 'release.dev');
  add(
    errors,
    Number.isInteger(release.arkWebOpenCloseRounds) && release.arkWebOpenCloseRounds > 0,
    'release.arkWebOpenCloseRounds must be a positive integer',
  );
  for (const field of ['hapSha256', 'bundleSha256', 'embeddedBundleSha256']) {
    requireHash(errors, release[field], `release.${field}`);
  }
  add(
    errors,
    release.bundleSha256 === release.embeddedBundleSha256,
    'release.bundleSha256 must equal release.embeddedBundleSha256',
  );

  const coldStart = requireObject(errors, evidence.coldStart, 'coldStart');
  requireTrueFields(
    errors,
    coldStart,
    ['metroStopped', 'launched', 'tabs', 'reactNativeImages', 'modal', 'arkWebOpenClose'],
    'coldStart',
  );

  const boundaries = requireObject(errors, evidence.boundaries, 'boundaries');
  add(
    errors,
    boundaries.routerDismissTo === 'single-level',
    'boundaries.routerDismissTo must be single-level',
  );
  add(
    errors,
    boundaries.webBrowser === 'arkweb-open-close',
    'boundaries.webBrowser must be arkweb-open-close',
  );

  throwIfInvalid('default-device', errors);
  return evidence;
}


function validatePatchGenerationEvidence(evidence, errors, field) {
  const value = requireObject(errors, evidence, field);
  scanPrivatePaths(value, errors, field);
  add(errors, value.patchSet === 'sdk54-mvp-1', `${field}.patchSet must be sdk54-mvp-1`);
  requireTrue(errors, value.deterministic, `${field}.deterministic`);
  add(errors, value.packages === 14, `${field}.packages must be 14`);
  add(errors, Array.isArray(value.failures) && value.failures.length === 0, `${field}.failures must be empty`);
  const patches = Array.isArray(value.patches) ? value.patches : [];
  add(errors, patches.length === Object.keys(EXPO_ARCHIVE_VERSIONS).length, `${field}.patches must contain 14 entries`);
  for (const [name, version] of Object.entries(EXPO_ARCHIVE_VERSIONS)) {
    const matches = patches.filter((entry) => entry?.name === name);
    add(errors, matches.length === 1, `${field}.patches must contain ${name} exactly once`);
    if (matches.length === 1) {
      add(errors, matches[0].version === version, `${field}.patches ${name} version must be ${version}`);
      requireHash(errors, matches[0].sha256, `${field}.patches ${name} sha256`);
      add(
        errors,
        typeof matches[0].file === 'string' && path.basename(matches[0].file) === matches[0].file,
        `${field}.patches ${name} file must be a basename`,
      );
    }
  }
}

function validateExternalComparisonEvidence(evidence, errors, field) {
  const value = requireObject(errors, evidence, field);
  scanPrivatePaths(value, errors, field);
  add(errors, Array.isArray(value.failures) && value.failures.length === 0, `${field}.failures must be empty`);
  const packages = Array.isArray(value.packages) ? value.packages : [];
  add(errors, packages.length === Object.keys(EXTERNAL_ARCHIVE_VERSIONS).length, `${field}.packages must contain 11 entries`);
  for (const [name, version] of Object.entries(EXTERNAL_ARCHIVE_VERSIONS)) {
    const matches = packages.filter((entry) => entry?.name === name);
    add(errors, matches.length === 1, `${field}.packages must contain ${name} exactly once`);
    if (matches.length === 1) {
      const entry = matches[0];
      add(errors, entry.version === version, `${field}.packages ${name} version must be ${version}`);
      requireTrue(errors, entry.publicAvailable, `${field}.packages ${name}.publicAvailable`);
      const isScreensPatch = name === '@react-native-ohos/react-native-screens';
      add(
        errors,
        entry.decision === (isScreensPatch ? 'public-text-patch' : 'public-identical'),
        `${field}.packages ${name}.decision must be ${isScreensPatch ? 'public-text-patch' : 'public-identical'}`,
      );
      requireHash(errors, entry.approvedSha256, `${field}.packages ${name}.approvedSha256`);
      requireHash(errors, entry.publicSha256, `${field}.packages ${name}.publicSha256`);
      add(errors, Array.isArray(entry.manifestDiff) && entry.manifestDiff.length === 0, `${field}.packages ${name}.manifestDiff must be empty`);
      add(errors, Array.isArray(entry.binaryDiff) && entry.binaryDiff.length === 0, `${field}.packages ${name}.binaryDiff must be empty`);
      add(errors, Array.isArray(entry.textDiff) && (isScreensPatch ? entry.textDiff.length > 0 : entry.textDiff.length === 0), `${field}.packages ${name}.textDiff has invalid content`);
    }
  }
}

function loadReferencedEvidence(baseDir, relativePath, errors, field) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    errors.push(`${field} must be a relative JSON path`);
    return undefined;
  }
  if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    errors.push(`${field} must be relative`);
    return undefined;
  }
  const resolvedBase = path.resolve(baseDir);
  const resolved = path.resolve(resolvedBase, relativePath);
  if (resolved !== resolvedBase && !resolved.startsWith(`${resolvedBase}${path.sep}`)) {
    errors.push(`${field} must stay inside the final evidence directory`);
    return undefined;
  }
  if (!fs.existsSync(resolved)) {
    errors.push(`${field} ${relativePath} does not exist`);
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    errors.push(`${field} ${relativePath} is not valid JSON: ${error.message}`);
    return undefined;
  }
}

function captureChildValidation(errors, field, verify, evidence) {
  if (evidence === undefined) return;
  try {
    verify(evidence);
  } catch (error) {
    errors.push(`${field}: ${error.message}`);
  }
}

function validateTestCountSuite(value, errors, field) {
  const suite = requireObject(errors, value, field);
  add(errors, Number.isInteger(suite.files) && suite.files > 0, `${field}.files must be a positive integer`);
  add(errors, Number.isInteger(suite.tests) && suite.tests > 0, `${field}.tests must be a positive integer`);
  requireTrue(errors, suite.passed, `${field}.passed`);
}

export function verifyFinalEvidence(evidence, { baseDir = process.cwd() } = {}) {
  const errors = [];
  validateCommon(evidence, errors);
  if (!isObject(evidence)) {
    throwIfInvalid('final', errors);
    return evidence;
  }

  requireFalse(errors, evidence.published, 'published');
  const source = requireObject(errors, evidence.source, 'source');
  if (source.state === 'uncommitted-worktree') {
    add(errors, /^[a-f0-9]{40}$/.test(source.baseCommit), 'source.baseCommit must be a 40-character git sha');
    add(errors, !Object.hasOwn(source, 'commit'), 'source.commit must be omitted for an uncommitted worktree');
  } else if (source.state === 'committed') {
    add(errors, /^[a-f0-9]{40}$/.test(source.commit), 'source.commit must be a 40-character git sha');
    add(errors, !Object.hasOwn(source, 'baseCommit'), 'source.baseCommit must be omitted for committed evidence');
  } else {
    errors.push('source.state must be uncommitted-worktree or committed');
  }
  add(errors, !Object.hasOwn(evidence, 'commit'), 'top-level commit must be omitted; use source provenance');
  add(errors, evidence.patchSet === 'sdk54-mvp-1', 'patchSet must be sdk54-mvp-1');
  validateCliTgz(evidence, errors);

  const packageCounts = requireObject(errors, evidence.packageCounts, 'packageCounts');
  add(errors, packageCounts.patches === 14, 'packageCounts.patches must be 14');
  add(errors, packageCounts.external === 11, 'packageCounts.external must be 11');

  const tests = requireObject(errors, evidence.tests, 'tests');
  validateTestCountSuite(tests.cli, errors, 'tests.cli');
  validateTestCountSuite(tests.sdk54Tools, errors, 'tests.sdk54Tools');
  for (const gate of [
    'typeCheck',
    'testPack',
    'sdk54Validate',
    'sdk54PackCheck',
    'sdk54Audit',
    'sdk54PatchAudit',
    'sdk54Repository',
  ]) {
    const result = requireObject(errors, tests[gate], `tests.${gate}`);
    requireTrue(errors, result.passed, `tests.${gate}.passed`);
  }
  add(
    errors,
    Array.isArray(evidence.knownLimits) &&
      evidence.knownLimits.length > 0 &&
      evidence.knownLimits.every((entry) => typeof entry === 'string' && entry.length > 0),
    'knownLimits must be a non-empty string array',
  );

  const references = requireObject(errors, evidence.evidence, 'evidence');
  const loaded = {};
  for (const field of [
    'patchGeneration',
    'externalComparison',
    'installPrebuild',
    'blankDevice',
    'defaultDevice',
  ]) {
    loaded[field] = loadReferencedEvidence(baseDir, references[field], errors, `evidence.${field}`);
  }

  if (loaded.patchGeneration !== undefined) {
    validatePatchGenerationEvidence(loaded.patchGeneration, errors, 'evidence.patchGeneration');
    add(
      errors,
      loaded.patchGeneration.patchSet === evidence.patchSet,
      'evidence.patchGeneration.patchSet must match patchSet',
    );
  }
  if (loaded.externalComparison !== undefined) {
    validateExternalComparisonEvidence(loaded.externalComparison, errors, 'evidence.externalComparison');
  }
  captureChildValidation(errors, 'evidence.installPrebuild', verifyInstallPrebuildEvidence, loaded.installPrebuild);
  captureChildValidation(errors, 'evidence.blankDevice', verifyBlankDeviceEvidence, loaded.blankDevice);
  captureChildValidation(errors, 'evidence.defaultDevice', verifyDefaultDeviceEvidence, loaded.defaultDevice);

  for (const field of ['installPrebuild', 'blankDevice', 'defaultDevice']) {
    if (isObject(loaded[field])) {
      add(
        errors,
        loaded[field].cliTgz?.sha256 === evidence.cliTgz?.sha256,
        `cliTgz.sha256 must match evidence.${field}.cliTgz.sha256`,
      );
    }
  }

  throwIfInvalid('final', errors);
  return evidence;
}


const CLI_MODES = Object.freeze({
  '--install-prebuild': ['install-prebuild', verifyInstallPrebuildEvidence],
  '--blank-device': ['blank-device', verifyBlankDeviceEvidence],
  '--default-device': ['default-device', verifyDefaultDeviceEvidence],
  '--final': ['final', verifyFinalEvidence],
});

export function verifyAcceptanceEvidence(kind, evidence, options) {
  const entry = Object.values(CLI_MODES).find(([candidate]) => candidate === kind);
  if (!entry) throw new Error(`unknown acceptance evidence kind: ${kind}`);
  return entry[1](evidence, options);
}

export function verifyAcceptanceFile(flag, filePath) {
  const entry = CLI_MODES[flag];
  if (!entry) throw new Error(`unknown acceptance flag: ${flag}`);
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error(`${flag} requires a JSON file`);
  }
  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${filePath}: ${error.message}`);
  }
  const [kind, verify] = entry;
  verify(evidence, kind === 'final' ? { baseDir: path.dirname(path.resolve(filePath)) } : undefined);
  return { kind, filePath };
}

function usage() {
  return `Usage: node scripts/sdk54/verify-cli-acceptance.mjs ${Object.keys(CLI_MODES).join('|')} <evidence.json>`;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || !(args[0] in CLI_MODES)) throw new Error(usage());
  const result = verifyAcceptanceFile(args[0], args[1]);
  process.stdout.write(`PASS ${result.kind}: ${path.basename(result.filePath)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
