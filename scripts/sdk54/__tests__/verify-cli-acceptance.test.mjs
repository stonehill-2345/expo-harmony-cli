import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  APPROVED_VERSIONS,
  verifyBlankDeviceEvidence,
  verifyDefaultDeviceEvidence,
  verifyFinalEvidence,
  verifyInstallPrebuildEvidence,
} from '../verify-cli-acceptance.mjs';
import {
  EXPO_ARCHIVE_VERSIONS,
  EXTERNAL_ARCHIVE_VERSIONS,
} from '../fixture-contract.mjs';

const HASH = 'a'.repeat(64);

function installCell(template, packageManager) {
  const templateArg = template === 'default' ? 'default@sdk-54' : 'blank-typescript@sdk-54';
  return {
    template,
    packageManager,
    create: {
      argv: ['npx', 'create-expo-app@5.0.0', 'fixture', '--template', templateArg, '--no-install'],
      exitCode: 0,
    },
    install: { exitCode: 0 },
    patchProbe: { success: true },
    officialPrebuild: {
      argv: ['npx', 'expo', 'prebuild', '--platform', 'harmony'],
      exitCode: 0,
    },
    forbiddenFileScan: { success: true, found: [] },
    reinstall: { exitCode: 0, patchProbe: { success: true } },
    ignoreScripts: {
      installExitCode: 0,
      patchProbe: { success: false },
      expectedFailure: true,
    },
  };
}

function installEvidence() {
  return {
    schemaVersion: 1,
    cliTgz: { file: 'expo-harmony-cli-1.5.0.tgz', sha256: HASH },
    versions: { ...APPROVED_VERSIONS },
    unsupportedPackageManagers: {
      yarn: { rejectedBeforeCreate: true, projectDirectoryCreated: false },
      bun: { rejectedBeforeCreate: true, projectDirectoryCreated: false },
    },
    matrix: [
      installCell('blank-typescript', 'npm'),
      installCell('blank-typescript', 'pnpm'),
      installCell('default', 'npm'),
      installCell('default', 'pnpm'),
    ],
  };
}

function clone(value) {
  return structuredClone(value);
}

test('accepts the complete blank/default x npm/pnpm install-prebuild matrix', () => {
  assert.doesNotThrow(() => verifyInstallPrebuildEvidence(installEvidence()));
});

test('rejects every missing install-prebuild matrix cell', () => {
  for (const missing of installEvidence().matrix) {
    const evidence = installEvidence();
    evidence.matrix = evidence.matrix.filter(
      (cell) =>
        cell.template !== missing.template || cell.packageManager !== missing.packageManager,
    );
    assert.throws(
      () => verifyInstallPrebuildEvidence(evidence),
      new RegExp(`${missing.template}/${missing.packageManager}`),
    );
  }
});



test('requires Yarn and Bun rejection before a project directory is created', () => {
  for (const packageManager of ['yarn', 'bun']) {
    const missing = installEvidence();
    delete missing.unsupportedPackageManagers[packageManager];
    assert.throws(
      () => verifyInstallPrebuildEvidence(missing),
      new RegExp(`unsupportedPackageManagers\\.${packageManager}`),
    );

    const late = installEvidence();
    late.unsupportedPackageManagers[packageManager].projectDirectoryCreated = true;
    assert.throws(
      () => verifyInstallPrebuildEvidence(late),
      new RegExp(`unsupportedPackageManagers\\.${packageManager}\\.projectDirectoryCreated`),
    );
  }
});

test('rejects false success fields and an ignore-scripts false negative', () => {
  const cases = [
    ['patchProbe.success', (cell) => { cell.patchProbe.success = false; }],
    ['forbiddenFileScan.success', (cell) => { cell.forbiddenFileScan.success = false; }],
    ['reinstall.patchProbe.success', (cell) => { cell.reinstall.patchProbe.success = false; }],
    ['ignoreScripts.expectedFailure', (cell) => { cell.ignoreScripts.expectedFailure = false; }],
    ['ignoreScripts.patchProbe.success', (cell) => { cell.ignoreScripts.patchProbe.success = true; }],
  ];

  for (const [field, mutate] of cases) {
    const evidence = installEvidence();
    mutate(evidence.matrix[0]);
    assert.throws(() => verifyInstallPrebuildEvidence(evidence), new RegExp(field));
  }
});

test('rejects private absolute paths anywhere in install-prebuild evidence', () => {
  const evidence = installEvidence();
  evidence.matrix[0].create.argv.push('/private/tmp/packed-cli.tgz');
  assert.throws(() => verifyInstallPrebuildEvidence(evidence), /private absolute path/i);
});

test('rejects unapproved versions', () => {
  const evidence = installEvidence();
  evidence.versions.expo = '54.0.38';
  assert.throws(() => verifyInstallPrebuildEvidence(evidence), /versions\.expo.*54\.0\.37/);
});


function blankDeviceEvidence() {
  return {
    schemaVersion: 1,
    cliTgz: { file: 'expo-harmony-cli-1.5.0.tgz', sha256: HASH },
    versions: { ...APPROVED_VERSIONS },
    template: 'blank-typescript',
    packageManager: 'pnpm',
    freshCreate: { success: true },
    applicationFiles: {
      changed: [],
      baselineSha256: HASH,
      actualSha256: HASH,
    },
    officialPrebuild: {
      argv: ['npx', 'expo', 'prebuild', '--platform', 'harmony'],
      exitCode: 0,
    },
    forbiddenFileScan: { success: true, found: [] },
    debug: {
      build: true,
      installed: true,
      launched: true,
      dev: true,
      officialBlankText: true,
    },
    release: {
      cleanBuild: true,
      installed: true,
      launched: true,
      dev: false,
      officialBlankText: true,
      hapSha256: HASH,
      bundleSha256: HASH,
      embeddedBundleSha256: HASH,
    },
    coldStart: {
      metroStopped: true,
      launched: true,
      officialBlankText: true,
    },
  };
}

test('accepts complete blank device Debug, Release, and cold-start evidence', () => {
  assert.doesNotThrow(() => verifyBlankDeviceEvidence(blankDeviceEvidence()));
});

test('rejects missing blank device sections and false success fields', () => {
  for (const field of ['freshCreate', 'applicationFiles', 'officialPrebuild', 'debug', 'release', 'coldStart']) {
    const evidence = blankDeviceEvidence();
    delete evidence[field];
    assert.throws(() => verifyBlankDeviceEvidence(evidence), new RegExp(field));
  }

  const evidence = blankDeviceEvidence();
  evidence.debug.launched = false;
  assert.throws(() => verifyBlankDeviceEvidence(evidence), /debug\.launched/);
});

test('rejects changed blank application files and mismatched Release bundle hashes', () => {
  const changed = blankDeviceEvidence();
  changed.applicationFiles.changed = ['App.tsx'];
  assert.throws(() => verifyBlankDeviceEvidence(changed), /applicationFiles\.changed/);

  const mismatched = blankDeviceEvidence();
  mismatched.release.embeddedBundleSha256 = 'b'.repeat(64);
  assert.throws(() => verifyBlankDeviceEvidence(mismatched), /bundleSha256.*embeddedBundleSha256/);
});

test('requires blank HAP, generated bundle, embedded bundle, and source hashes', () => {
  for (const [section, field] of [
    ['applicationFiles', 'baselineSha256'],
    ['applicationFiles', 'actualSha256'],
    ['release', 'hapSha256'],
    ['release', 'bundleSha256'],
    ['release', 'embeddedBundleSha256'],
  ]) {
    const evidence = blankDeviceEvidence();
    delete evidence[section][field];
    assert.throws(() => verifyBlankDeviceEvidence(evidence), new RegExp(`${section}\\.${field}`));
  }
});


const DEFAULT_IMAGE_FILES = ['app/(tabs)/explore.tsx', 'app/(tabs)/index.tsx'];
const PROTECTED_FILES = ['app/modal.tsx', 'app/_layout.tsx', 'app.json'];

function protectedFileHashes() {
  return Object.fromEntries(
    PROTECTED_FILES.map((file) => [file, { beforeSha256: HASH, afterSha256: HASH }]),
  );
}

function defaultDeviceEvidence() {
  return {
    schemaVersion: 1,
    cliTgz: { file: 'expo-harmony-cli-1.5.0.tgz', sha256: HASH },
    versions: { ...APPROVED_VERSIONS },
    template: 'default',
    packageManager: 'pnpm',
    freshCreate: { success: true },
    applicationChanges: {
      files: [...DEFAULT_IMAGE_FILES],
      dependencyAdjustments: true,
    },
    protectedFiles: protectedFileHashes(),
    expoImage: { backendSupported: false },
    officialPrebuild: {
      argv: ['npx', 'expo', 'prebuild', '--platform', 'harmony'],
      exitCode: 0,
    },
    forbiddenFileScan: { success: true, found: [] },
    debug: {
      build: true,
      installed: true,
      launched: true,
      dev: true,
      tabs: true,
      materialIcons: true,
      reactNativeImages: true,
      modal: true,
      singleLevelDismissTo: true,
      physicalBack: true,
      customAnimation: true,
      arkWebOpenCloseRounds: 1,
      reload: true,
    },
    release: {
      cleanBuild: true,
      installed: true,
      launched: true,
      dev: false,
      tabs: true,
      materialIcons: true,
      reactNativeImages: true,
      modal: true,
      singleLevelDismissTo: true,
      physicalBack: true,
      customAnimation: true,
      arkWebOpenCloseRounds: 2,
      hapSha256: HASH,
      bundleSha256: HASH,
      embeddedBundleSha256: HASH,
    },
    coldStart: {
      metroStopped: true,
      launched: true,
      tabs: true,
      reactNativeImages: true,
      modal: true,
      arkWebOpenClose: true,
    },
    boundaries: {
      routerDismissTo: 'single-level',
      webBrowser: 'arkweb-open-close',
    },
  };
}

test('accepts complete default device UI, Debug, Release, and cold-start evidence', () => {
  assert.doesNotThrow(() => verifyDefaultDeviceEvidence(defaultDeviceEvidence()));
});

test('allows only the two image substitutions and dependency adjustments', () => {
  const evidence = defaultDeviceEvidence();
  evidence.applicationChanges.files.push('app/modal.tsx');
  assert.throws(() => verifyDefaultDeviceEvidence(evidence), /applicationChanges\.files/);

  const noDependencyAdjustment = defaultDeviceEvidence();
  noDependencyAdjustment.applicationChanges.dependencyAdjustments = false;
  assert.throws(
    () => verifyDefaultDeviceEvidence(noDependencyAdjustment),
    /applicationChanges\.dependencyAdjustments/,
  );
});

test('rejects expo-image backend support claims', () => {
  const evidence = defaultDeviceEvidence();
  evidence.expoImage.backendSupported = true;
  assert.throws(() => verifyDefaultDeviceEvidence(evidence), /expoImage\.backendSupported.*false/);
});

test('requires matching before/after hashes for every protected default file', () => {
  for (const file of PROTECTED_FILES) {
    const missing = defaultDeviceEvidence();
    delete missing.protectedFiles[file];
    assert.throws(() => verifyDefaultDeviceEvidence(missing), new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    const changed = defaultDeviceEvidence();
    changed.protectedFiles[file].afterSha256 = 'b'.repeat(64);
    assert.throws(() => verifyDefaultDeviceEvidence(changed), /beforeSha256 must equal .*afterSha256/);
  }
});

test('rejects missing or false default interaction evidence', () => {
  const cases = [
    ['debug.reload', (evidence) => { evidence.debug.reload = false; }],
    ['debug.materialIcons', (evidence) => { evidence.debug.materialIcons = false; }],
    ['debug.singleLevelDismissTo', (evidence) => { evidence.debug.singleLevelDismissTo = false; }],
    ['release.customAnimation', (evidence) => { evidence.release.customAnimation = false; }],
    ['coldStart.arkWebOpenClose', (evidence) => { evidence.coldStart.arkWebOpenClose = false; }],
  ];
  for (const [field, mutate] of cases) {
    const evidence = defaultDeviceEvidence();
    mutate(evidence);
    assert.throws(() => verifyDefaultDeviceEvidence(evidence), new RegExp(field.replace('.', '\\.')));
  }
});

test('requires default Release hashes to match and records MVP boundaries', () => {
  const evidence = defaultDeviceEvidence();
  evidence.release.embeddedBundleSha256 = 'b'.repeat(64);
  assert.throws(() => verifyDefaultDeviceEvidence(evidence), /bundleSha256.*embeddedBundleSha256/);

  const expandedScope = defaultDeviceEvidence();
  expandedScope.boundaries.routerDismissTo = 'multi-level';
  assert.throws(() => verifyDefaultDeviceEvidence(expandedScope), /boundaries\.routerDismissTo/);
});


function patchGenerationEvidence() {
  return {
    schemaVersion: 1,
    patchSet: 'sdk54-mvp-1',
    deterministic: true,
    packages: 14,
    patches: Object.entries(EXPO_ARCHIVE_VERSIONS).map(([name, version]) => ({
      name,
      version,
      file: `${name.replace(/^@/, '').replaceAll('/', '+')}+${version}.patch`,
      sha256: HASH,
    })),
    failures: [],
  };
}

function externalComparisonEvidence() {
  return {
    schemaVersion: 1,
    packages: Object.entries(EXTERNAL_ARCHIVE_VERSIONS).map(([name, version]) => ({
      name,
      version,
      publicAvailable: true,
      decision: name === '@react-native-ohos/react-native-screens' ? 'public-text-patch' : 'public-identical',
      approvedSha256: HASH,
      publicSha256: HASH,
      manifestDiff: [],
      textDiff: name === '@react-native-ohos/react-native-screens' ? ['lib/commonjs/components/ScreenStackItem.js'] : [],
      binaryDiff: [],
    })),
    failures: [],
  };
}

function writeJson(directory, file, value) {
  fs.writeFileSync(path.join(directory, file), `${JSON.stringify(value, null, 2)}\n`);
}

function finalFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-acceptance-final-'));
  const files = {
    patchGeneration: 'patch-generation.json',
    externalComparison: 'external-comparison.json',
    installPrebuild: 'install-prebuild.json',
    blankDevice: 'blank-device.json',
    defaultDevice: 'default-device.json',
  };
  writeJson(directory, files.patchGeneration, patchGenerationEvidence());
  writeJson(directory, files.externalComparison, externalComparisonEvidence());
  writeJson(directory, files.installPrebuild, installEvidence());
  writeJson(directory, files.blankDevice, blankDeviceEvidence());
  writeJson(directory, files.defaultDevice, defaultDeviceEvidence());

  const evidence = {
    schemaVersion: 1,
    published: false,
    versions: { ...APPROVED_VERSIONS },
    source: { baseCommit: 'c'.repeat(40), state: 'uncommitted-worktree' },
    patchSet: 'sdk54-mvp-1',
    cliTgz: { file: 'expo-harmony-cli-1.5.0.tgz', sha256: HASH },
    packageCounts: { patches: 14, external: 11 },
    evidence: files,
    tests: {
      cli: { files: 50, tests: 500, passed: true },
      sdk54Tools: { files: 16, tests: 180, passed: true },
      typeCheck: { passed: true },
      pack: { passed: true },
      repository: { passed: true },
      testPack: { passed: true },
      sdk54Validate: { passed: true },
      sdk54PackCheck: { passed: true },
      sdk54Audit: { passed: true },
      sdk54PatchAudit: { passed: true },
      sdk54Repository: { passed: true },
    },
    knownLimits: [
      'expo-image Harmony backend is not implemented',
      'Router dismissTo is limited to a single level',
      'ArkWeb open/close is not a complete authentication session',
    ],
  };
  return { directory, evidence };
}

function withFinalFixture(run) {
  const fixture = finalFixture();
  try {
    run(fixture);
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
}

test('accepts a final aggregation only after all referenced evidence verifies', () => {
  withFinalFixture(({ directory, evidence }) => {
    assert.doesNotThrow(() => verifyFinalEvidence(evidence, { baseDir: directory }));
  });
});

test('rejects every missing final evidence reference and missing referenced file', () => {
  for (const field of [
    'patchGeneration',
    'externalComparison',
    'installPrebuild',
    'blankDevice',
    'defaultDevice',
  ]) {
    withFinalFixture(({ directory, evidence }) => {
      delete evidence.evidence[field];
      assert.throws(() => verifyFinalEvidence(evidence, { baseDir: directory }), new RegExp(field));
    });
  }

  withFinalFixture(({ directory, evidence }) => {
    evidence.evidence.blankDevice = 'missing.json';
    assert.throws(() => verifyFinalEvidence(evidence, { baseDir: directory }), /missing\.json.*does not exist/);
  });
});

test('requires published to be exactly false', () => {
  for (const published of [undefined, true, 'false']) {
    withFinalFixture(({ directory, evidence }) => {
      evidence.published = published;
      assert.throws(() => verifyFinalEvidence(evidence, { baseDir: directory }), /published must be false/);
    });
  }
});

test('requires final TGZ hash, actual test counts, passing gates, and known limits', () => {
  const cases = [
    ['cliTgz.sha256', (evidence) => { delete evidence.cliTgz.sha256; }],
    ['tests.cli.files', (evidence) => { evidence.tests.cli.files = 0; }],
    ['tests.cli.tests', (evidence) => { delete evidence.tests.cli.tests; }],
    ['tests.sdk54Tools.tests', (evidence) => { evidence.tests.sdk54Tools.tests = 0; }],
    ['tests.typeCheck.passed', (evidence) => { evidence.tests.typeCheck.passed = false; }],
    ['tests.sdk54PatchAudit.passed', (evidence) => { evidence.tests.sdk54PatchAudit.passed = false; }],
    ['knownLimits', (evidence) => { evidence.knownLimits = []; }],
  ];
  for (const [field, mutate] of cases) {
    withFinalFixture(({ directory, evidence }) => {
      mutate(evidence);
      assert.throws(
        () => verifyFinalEvidence(evidence, { baseDir: directory }),
        new RegExp(field.replaceAll('.', '\\.')),
      );
    });
  }
});

test('rejects invalid child evidence instead of inferring success', () => {
  withFinalFixture(({ directory, evidence }) => {
    const childPath = path.join(directory, evidence.evidence.externalComparison);
    const child = JSON.parse(fs.readFileSync(childPath, 'utf8'));
    child.failures.push('public package unavailable');
    writeJson(directory, evidence.evidence.externalComparison, child);
    assert.throws(() => verifyFinalEvidence(evidence, { baseDir: directory }), /externalComparison.*failures/);
  });
});

test('requires the final CLI TGZ hash to match install and device evidence', () => {
  withFinalFixture(({ directory, evidence }) => {
    evidence.cliTgz.sha256 = 'b'.repeat(64);
    assert.throws(() => verifyFinalEvidence(evidence, { baseDir: directory }), /cliTgz\.sha256.*must match/);
  });
});


const VERIFIER_PATH = fileURLToPath(new URL('../verify-cli-acceptance.mjs', import.meta.url));

function runVerifier(args) {
  return spawnSync(process.execPath, [VERIFIER_PATH, ...args], { encoding: 'utf8' });
}

test('CLI dispatches all four acceptance modes', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-acceptance-cli-'));
  try {
    writeJson(directory, 'install.json', installEvidence());
    writeJson(directory, 'blank.json', blankDeviceEvidence());
    writeJson(directory, 'default.json', defaultDeviceEvidence());
    for (const [flag, file] of [
      ['--install-prebuild', 'install.json'],
      ['--blank-device', 'blank.json'],
      ['--default-device', 'default.json'],
    ]) {
      const result = runVerifier([flag, path.join(directory, file)]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /PASS/);
    }

    const { directory: finalDirectory, evidence } = finalFixture();
    try {
      writeJson(finalDirectory, 'final.json', evidence);
      const result = runVerifier(['--final', path.join(finalDirectory, 'final.json')]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /PASS/);
    } finally {
      fs.rmSync(finalDirectory, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI fails closed for invalid evidence and invalid arguments', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-acceptance-cli-'));
  try {
    const invalid = installEvidence();
    invalid.matrix.pop();
    writeJson(directory, 'invalid.json', invalid);
    const rejected = runVerifier(['--install-prebuild', path.join(directory, 'invalid.json')]);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /default\/pnpm/);

    const usage = runVerifier([]);
    assert.notEqual(usage.status, 0);
    assert.match(usage.stderr, /Usage:/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});


test('rejects ambiguous commit-only provenance for an uncommitted release candidate', () => {
  withFinalFixture(({ directory, evidence }) => {
    delete evidence.source;
    evidence.commit = 'c'.repeat(40);
    assert.throws(() => verifyFinalEvidence(evidence, { baseDir: directory }), /source\./);
  });
});


test('accepts committed release provenance with one exact source commit', () => {
  withFinalFixture(({ directory, evidence }) => {
    evidence.source = { state: 'committed', commit: 'd'.repeat(40) };
    assert.doesNotThrow(() => verifyFinalEvidence(evidence, { baseDir: directory }));
  });
});

test('rejects mixed or incomplete release provenance states', () => {
  const cases = [
    { state: 'committed', commit: 'bad' },
    { state: 'committed', commit: 'd'.repeat(40), baseCommit: 'c'.repeat(40) },
    { state: 'uncommitted-worktree', baseCommit: 'c'.repeat(40), commit: 'd'.repeat(40) },
    { state: 'unknown', baseCommit: 'c'.repeat(40) },
  ];
  for (const source of cases) {
    withFinalFixture(({ directory, evidence }) => {
      evidence.source = source;
      assert.throws(() => verifyFinalEvidence(evidence, { baseDir: directory }), /source\./);
    });
  }
});
