import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { prepareCreateExpoFixture } from '../prepare-create-expo-fixture.mjs';

const EXPO_PACKAGES = [
  ['@expo/cli', '54.0.27', '@expo+cli+54.0.27.tgz'],
  ['@expo/metro-config', '54.0.17', '@expo+metro-config+54.0.17.tgz'],
  ['expo', '54.0.37', 'expo+54.0.37.tgz'],
  ['expo-asset', '12.0.13', 'expo-asset+12.0.13.tgz'],
  ['expo-constants', '18.0.14', 'expo-constants+18.0.14.tgz'],
  ['expo-font', '14.0.12', 'expo-font+14.0.12.tgz'],
  ['expo-linking', '8.0.12', 'expo-linking+8.0.12.tgz'],
  ['expo-modules-autolinking', '3.0.27', 'expo-modules-autolinking+3.0.27.tgz'],
  ['expo-modules-core', '3.0.30', 'expo-modules-core+3.0.30.tgz'],
  ['expo-router', '6.0.24', 'expo-router+6.0.24.tgz'],
  ['expo-splash-screen', '31.0.13', 'expo-splash-screen+31.0.13.tgz'],
  ['expo-status-bar', '3.0.9', 'expo-status-bar+3.0.9.tgz'],
  ['expo-system-ui', '6.0.9', 'expo-system-ui+6.0.9.tgz'],
  ['expo-web-browser', '15.0.11', 'expo-web-browser+15.0.11.tgz'],
];

const EXTERNAL_PACKAGES = [
  ['@react-native-oh/react-native-harmony', '0.82.30', 'react-native-oh-react-native-harmony-0.82.30.tgz'],
  ['react-native-gesture-handler', '2.30.0', 'react-native-gesture-handler-2.30.0.tgz'],
  ['@react-native-ohos/react-native-gesture-handler', '2.30.1', 'react-native-ohos-react-native-gesture-handler-2.30.1.tgz'],
  ['react-native-reanimated', '4.2.1', 'react-native-reanimated-4.2.1.tgz'],
  ['@react-native-ohos/react-native-reanimated', '4.0.1', 'react-native-ohos-react-native-reanimated-4.0.1.tgz'],
  ['react-native-safe-area-context', '5.6.2', 'react-native-safe-area-context-5.6.2.tgz'],
  ['@react-native-ohos/react-native-safe-area-context', '5.6.3', 'react-native-ohos-react-native-safe-area-context-5.6.3.tgz'],
  ['react-native-screens', '4.17.1', 'react-native-screens-4.17.1.tgz'],
  ['@react-native-ohos/react-native-screens', '4.9.0', 'react-native-ohos-react-native-screens-4.9.0.tgz'],
  ['react-native-worklets', '0.7.1', 'react-native-worklets-0.7.1.tgz'],
  ['@react-native-ohos/react-native-worklets', '1.0.0', 'react-native-ohos-react-native-worklets-1.0.0.tgz'],
];

const BLANK_EXPO_PACKAGES = EXPO_PACKAGES.filter(
  ([name]) => name !== 'expo-router' && name !== 'expo-web-browser',
);

const DEFAULT_IMPORT = [
  "import { Image } from 'expo-image';",
  "import { Platform, StyleSheet } from 'react-native';",
].join('\n');
const REACT_NATIVE_IMPORT = "import { Image, Platform, StyleSheet } from 'react-native';";

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createStaging(t, baseDir) {
  const tgzDir = path.join(baseDir, 'staging', 'tgz');
  fs.mkdirSync(tgzDir, { recursive: true });
  const makeEntries = (packages, source) => packages.map(([name, version, file]) => {
    fs.writeFileSync(path.join(tgzDir, file), `${name}@${version}\n`);
    return { name, version, file, bytes: fs.statSync(path.join(tgzDir, file)).size, sha256: 'test', source };
  });
  const manifest = {
    expoPackages: makeEntries(EXPO_PACKAGES, 'workspace'),
    externalPackages: makeEntries(EXTERNAL_PACKAGES, 'external'),
    packages: 25,
    failures: [],
  };
  writeJson(path.join(tgzDir, 'manifest.json'), manifest);
  return tgzDir;
}

function createBase(t, name) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), `sdk54-fixture-${name}-`));
  t.after(() => fs.rmSync(baseDir, { recursive: true, force: true }));
  const projectDir = path.join(baseDir, 'projects', name);
  fs.mkdirSync(projectDir, { recursive: true });
  const tgzDir = createStaging(t, baseDir);
  fs.writeFileSync(path.join(projectDir, 'package-lock.json'), 'keep lock file\n');
  fs.mkdirSync(path.join(projectDir, 'node_modules', 'sentinel'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'node_modules', 'sentinel', 'keep.txt'), 'keep installed tree\n');
  return { baseDir, projectDir, tgzDir };
}

function snapshotFiles(projectDir, relativePaths) {
  return Object.fromEntries(relativePaths.map((relativePath) => [
    relativePath,
    fs.readFileSync(path.join(projectDir, relativePath)),
  ]));
}

function assertFilesUnchanged(projectDir, snapshots) {
  for (const [relativePath, before] of Object.entries(snapshots)) {
    assert.deepEqual(fs.readFileSync(path.join(projectDir, relativePath)), before, relativePath);
  }
}

function expectedArchiveReference(projectDir, tgzDir, file) {
  const relative = path.relative(projectDir, path.join(tgzDir, file)).split(path.sep).join('/');
  return `file:${relative.startsWith('.') ? relative : `./${relative}`}`;
}

function manifestVersions(projectDir, tgzDir, packages) {
  return Object.fromEntries(packages.map(([name, , file]) => [
    name,
    expectedArchiveReference(projectDir, tgzDir, file),
  ]));
}

function writeBlankFixture(projectDir) {
  const sources = {
    'App.tsx': "import { Text, View } from 'react-native';\n\nexport default function App() {\n  return <View><Text>Open up App.tsx to start working on your app!</Text></View>;\n}\n",
    'index.ts': "import { registerRootComponent } from 'expo';\n\nimport App from './App';\n\nregisterRootComponent(App);\n",
    'app.json': '{\n  "expo": {\n    "name": "blank-app",\n    "slug": "blank-app"\n  }\n}\n',
  };
  for (const [relativePath, contents] of Object.entries(sources)) {
    fs.writeFileSync(path.join(projectDir, relativePath), contents);
  }
  writeJson(path.join(projectDir, 'package.json'), {
    name: 'blank-app',
    version: '1.0.0',
    main: 'index.ts',
    scripts: { start: 'expo start', android: 'expo start --android' },
    dependencies: {
      expo: '~57.0.24',
      'expo-status-bar': '~3.0.9',
      react: '19.2.3',
      'react-native': '0.86.3',
    },
    devDependencies: {
      '@types/react': '~19.2.0',
      typescript: '~5.9.2',
    },
    private: true,
  });
}

function writeDefaultFixture(projectDir, { importText = DEFAULT_IMPORT } = {}) {
  const routerFiles = {
    'app/(tabs)/_layout.tsx': "import { Tabs } from 'expo-router';\nexport default function TabLayout() { return <Tabs />; }\n",
    'app/(tabs)/index.tsx': `${importText}\n\nexport default function HomeScreen() {\n  return <Image source={require('@/assets/images/partial-react-logo.png')} style={{ width: 100 }} />;\n}\n`,
    'app/(tabs)/explore.tsx': `${importText}\n\nexport default function ExploreScreen() {\n  return <Image source={require('@/assets/images/react-logo.png')} style={{ height: 178 }} />;\n}\n`,
    'app/_layout.tsx': "import { Stack } from 'expo-router';\nexport default function RootLayout() { return <Stack />; }\n",
    'app/modal.tsx': "import { Link } from 'expo-router';\nexport default function ModalScreen() { return <Link href=\"/\">Go home</Link>; }\n",
    'app.json': '{\n  "expo": {\n    "name": "default-app",\n    "slug": "default-app",\n    "plugins": ["expo-router"]\n  }\n}\n',
  };
  for (const [relativePath, contents] of Object.entries(routerFiles)) {
    const filePath = path.join(projectDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }
  writeJson(path.join(projectDir, 'package.json'), {
    name: 'default-app',
    version: '1.0.0',
    main: 'expo-router/entry',
    scripts: { start: 'expo start', lint: 'expo lint' },
    dependencies: {
      '@expo/vector-icons': '^15.0.3',
      '@react-navigation/bottom-tabs': '^7.4.0',
      '@react-navigation/elements': '^2.6.3',
      '@react-navigation/native': '^7.1.8',
      expo: '~54.0.36',
      'expo-constants': '~18.0.13',
      'expo-font': '~14.0.12',
      'expo-haptics': '~15.0.8',
      'expo-image': '~3.0.11',
      'expo-linking': '~8.0.12',
      'expo-router': '~6.0.24',
      'expo-splash-screen': '~31.0.13',
      'expo-status-bar': '~3.0.9',
      'expo-symbols': '~1.0.8',
      'expo-system-ui': '~6.0.9',
      'expo-web-browser': '~15.0.11',
      react: '19.1.0',
      'react-dom': '19.1.0',
      'react-native': '0.81.5',
      'react-native-gesture-handler': '~2.28.0',
      'react-native-reanimated': '~4.1.1',
      'react-native-safe-area-context': '~5.6.0',
      'react-native-screens': '~4.16.0',
      'react-native-web': '~0.21.0',
      'react-native-worklets': '0.5.1',
    },
    devDependencies: {
      '@types/react': '~19.1.0',
      eslint: '^9.25.0',
      'eslint-config-expo': '~10.0.0',
      typescript: '~5.9.2',
    },
    private: true,
  });
}

test('prepares a blank TypeScript fixture without changing application files or deleting install artifacts', (t) => {
  const { projectDir, tgzDir } = createBase(t, 'blank-app');
  writeBlankFixture(projectDir);
  const protectedFiles = snapshotFiles(projectDir, ['App.tsx', 'index.ts', 'app.json']);

  const report = prepareCreateExpoFixture({ projectDir, template: 'blank-typescript', tgzDir });

  assert.deepEqual(report.failures, []);
  assert.deepEqual(report.changedFiles, ['package.json']);
  assert.deepEqual(report.substitutions, []);
  assertFilesUnchanged(projectDir, protectedFiles);
  assert.equal(fs.readFileSync(path.join(projectDir, 'package-lock.json'), 'utf8'), 'keep lock file\n');
  assert.equal(fs.readFileSync(path.join(projectDir, 'node_modules/sentinel/keep.txt'), 'utf8'), 'keep installed tree\n');

  const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
  const archivePins = manifestVersions(projectDir, tgzDir, BLANK_EXPO_PACKAGES);
  assert.deepEqual(
    Object.fromEntries(BLANK_EXPO_PACKAGES.map(([name]) => [name, manifest.dependencies[name]])),
    archivePins,
  );
  assert.equal(manifest.dependencies['@react-native-oh/react-native-harmony'], expectedArchiveReference(
    projectDir,
    tgzDir,
    'react-native-oh-react-native-harmony-0.82.30.tgz',
  ));
  assert.equal(manifest.dependencies['@react-native-oh/react-native-harmony-cli'], '0.82.30');
  assert.equal(manifest.dependencies.react, '19.1.1');
  assert.equal(manifest.dependencies['react-native'], '0.82.1');
  assert.equal(manifest.devDependencies['@types/react'], '19.1.17');
  assert.equal(manifest.devDependencies.typescript, '5.9.2');
  assert.equal(Object.hasOwn(manifest.dependencies, 'expo-router'), false);
  assert.equal(Object.hasOwn(manifest.dependencies, 'expo-web-browser'), false);
  assert.equal(Object.hasOwn(manifest.dependencies, 'react-dom'), false);
  assert.equal(Object.hasOwn(manifest.dependencies, 'react-native-web'), false);
  assert.deepEqual(report.packageVersions, { ...manifest.dependencies, ...manifest.devDependencies });

  for (const forbidden of ['harmony', 'metro.config.js', 'index.harmony.js', 'shims']) {
    assert.equal(fs.existsSync(path.join(projectDir, forbidden)), false, forbidden);
  }
});

test('prepares the default Router fixture with exact guide pins and only two Image substitutions', (t) => {
  const { projectDir, tgzDir } = createBase(t, 'default-app');
  writeDefaultFixture(projectDir);
  const protectedFiles = snapshotFiles(projectDir, ['app/modal.tsx', 'app/_layout.tsx', 'app.json']);

  const report = prepareCreateExpoFixture({ projectDir, template: 'default', tgzDir });

  assert.deepEqual(report.failures, []);
  assert.deepEqual(report.changedFiles, [
    'app/(tabs)/explore.tsx',
    'app/(tabs)/index.tsx',
    'package.json',
  ]);
  assert.deepEqual(report.substitutions, [
    'app/(tabs)/explore.tsx: expo-image Image -> react-native Image',
    'app/(tabs)/index.tsx: expo-image Image -> react-native Image',
  ]);
  assertFilesUnchanged(projectDir, protectedFiles);
  assert.equal(fs.readFileSync(path.join(projectDir, 'package-lock.json'), 'utf8'), 'keep lock file\n');
  assert.equal(fs.readFileSync(path.join(projectDir, 'node_modules/sentinel/keep.txt'), 'utf8'), 'keep installed tree\n');

  for (const relativePath of ['app/(tabs)/index.tsx', 'app/(tabs)/explore.tsx']) {
    const contents = fs.readFileSync(path.join(projectDir, relativePath), 'utf8');
    assert.equal(contents.includes(DEFAULT_IMPORT), false, relativePath);
    assert.equal(contents.split(REACT_NATIVE_IMPORT).length - 1, 1, relativePath);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
  assert.equal(manifest.main, 'expo-router/entry');
  assert.equal(Object.hasOwn(manifest.dependencies, 'expo-image'), false);
  assert.deepEqual(
    Object.fromEntries(EXPO_PACKAGES.map(([name]) => [name, manifest.dependencies[name]])),
    manifestVersions(projectDir, tgzDir, EXPO_PACKAGES),
  );
  assert.deepEqual(
    Object.fromEntries(EXTERNAL_PACKAGES.map(([name]) => [name, manifest.dependencies[name]])),
    manifestVersions(projectDir, tgzDir, EXTERNAL_PACKAGES),
  );
  assert.deepEqual(
    Object.fromEntries([
      '@expo/metro-runtime', '@expo/vector-icons', '@react-native-oh/react-native-harmony-cli',
      '@react-navigation/bottom-tabs', '@react-navigation/core', '@react-navigation/elements',
      '@react-navigation/native', '@react-navigation/native-stack', '@react-navigation/routers',
      'expo-haptics', 'expo-symbols', 'react', 'react-dom', 'react-native', 'react-native-web',
    ].map((name) => [name, manifest.dependencies[name]])),
    {
      '@expo/metro-runtime': '6.1.2',
      '@expo/vector-icons': '15.0.3',
      '@react-native-oh/react-native-harmony-cli': '0.82.30',
      '@react-navigation/bottom-tabs': '7.4.0',
      '@react-navigation/core': '7.12.4',
      '@react-navigation/elements': '2.6.3',
      '@react-navigation/native': '7.1.17',
      '@react-navigation/native-stack': '7.3.16',
      '@react-navigation/routers': '7.5.1',
      'expo-haptics': '15.0.8',
      'expo-symbols': '1.0.8',
      react: '19.1.1',
      'react-dom': '19.1.1',
      'react-native': '0.82.1',
      'react-native-web': '0.21.0',
    },
  );
  assert.deepEqual(manifest.devDependencies, {
    '@types/react': '19.1.17',
    eslint: '9.25.0',
    'eslint-config-expo': '10.0.0',
    typescript: '5.9.2',
  });
  assert.deepEqual(report.packageVersions, { ...manifest.dependencies, ...manifest.devDependencies });
});

test('rejects every forbidden pre-existing bypass before modifying package.json', (t) => {
  const cases = [
    ['harmony/', ({ projectDir }) => fs.mkdirSync(path.join(projectDir, 'harmony'))],
    ['metro.config.js', ({ projectDir }) => fs.writeFileSync(path.join(projectDir, 'metro.config.js'), 'module.exports = {};\n')],
    ['index.harmony.js', ({ projectDir }) => fs.writeFileSync(path.join(projectDir, 'index.harmony.js'), 'export {};\n')],
    ['shims/', ({ projectDir }) => fs.mkdirSync(path.join(projectDir, 'shims'))],
    ['patch-package dependency', ({ projectDir }) => {
      const filePath = path.join(projectDir, 'package.json');
      const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      manifest.devDependencies['patch-package'] = '8.0.0';
      writeJson(filePath, manifest);
    }],
    ['postinstall script', ({ projectDir }) => {
      const filePath = path.join(projectDir, 'package.json');
      const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      manifest.scripts.postinstall = 'node scripts/postinstall.js';
      writeJson(filePath, manifest);
    }],
  ];

  for (const [name, arrange] of cases) {
    const { projectDir, tgzDir } = createBase(t, name.replaceAll(/[^a-z]+/gi, '-'));
    writeBlankFixture(projectDir);
    arrange({ projectDir });
    const before = fs.readFileSync(path.join(projectDir, 'package.json'));

    const report = prepareCreateExpoFixture({ projectDir, template: 'blank-typescript', tgzDir });

    const expectedToken = name.startsWith('patch-package') ? 'patch-package' : name.startsWith('postinstall') ? 'postinstall' : name.split('/')[0];
    assert.ok(report.failures.some((failure) => failure.includes(expectedToken)), JSON.stringify(report));
    assert.deepEqual(report.changedFiles, []);
    assert.deepEqual(fs.readFileSync(path.join(projectDir, 'package.json')), before);
  }
});

test('rejects a changed default Image import shape without partial modification', (t) => {
  const { projectDir, tgzDir } = createBase(t, 'changed-default');
  writeDefaultFixture(projectDir, {
    importText: "import { Image } from 'expo-image';\nimport { StyleSheet, Platform } from 'react-native';",
  });
  const before = snapshotFiles(projectDir, [
    'package.json',
    'app/(tabs)/index.tsx',
    'app/(tabs)/explore.tsx',
  ]);

  const report = prepareCreateExpoFixture({ projectDir, template: 'default', tgzDir });

  assert.ok(report.failures.some((failure) => failure.includes('expected expo-image import shape')), JSON.stringify(report));
  assert.deepEqual(report.changedFiles, []);
  assert.deepEqual(report.substitutions, []);
  assertFilesUnchanged(projectDir, before);
});

function readStagingManifest(tgzDir) {
  return JSON.parse(fs.readFileSync(path.join(tgzDir, 'manifest.json'), 'utf8'));
}

function updateStagingManifest(tgzDir, update) {
  const manifest = readStagingManifest(tgzDir);
  update(manifest);
  writeJson(path.join(tgzDir, 'manifest.json'), manifest);
}

function blankMutationSnapshot(projectDir) {
  return snapshotFiles(projectDir, [
    'package.json',
    'App.tsx',
    'index.ts',
    'app.json',
    'package-lock.json',
    'node_modules/sentinel/keep.txt',
  ]);
}

function assertRejectedWithoutBlankMutation({ projectDir, report, before, expected }) {
  assert.ok(report.failures.some((failure) => failure.includes(expected)), JSON.stringify(report, null, 2));
  assert.deepEqual(report.changedFiles, []);
  assert.deepEqual(report.substitutions, []);
  assertFilesUnchanged(projectDir, before);
}

test('rejects unsafe or non-regular archive entries without modifying the project', async (t) => {
  const cases = [
    ['empty archive filename', '', 'archive filename'],
    ['dot archive filename', '.', 'archive filename'],
    ['dot-dot archive filename', '..', 'archive filename'],
    ['non-TGZ archive filename', '@expo+cli+54.0.27.tar', '.tgz'],
    ['forward-slash path', 'nested/@expo+cli+54.0.27.tgz', 'path separator'],
    ['backslash path', 'nested\\@expo+cli+54.0.27.tgz', 'path separator'],
    ['parent traversal', '../@expo+cli+54.0.27.tgz', 'path separator'],
  ];

  for (const [name, unsafeFile, expected] of cases) {
    await t.test(name, () => {
      const { projectDir, tgzDir } = createBase(t, name.replaceAll(/[^a-z]+/gi, '-'));
      writeBlankFixture(projectDir);
      const before = blankMutationSnapshot(projectDir);
      updateStagingManifest(tgzDir, (manifest) => {
        manifest.expoPackages.find((entry) => entry.name === '@expo/cli').file = unsafeFile;
      });
      if (unsafeFile.endsWith('.tar')) {
        fs.writeFileSync(path.join(tgzDir, unsafeFile), 'not a tgz\n');
      }

      const report = prepareCreateExpoFixture({ projectDir, template: 'blank-typescript', tgzDir });

      assertRejectedWithoutBlankMutation({ projectDir, report, before, expected });
    });
  }

  await t.test('symlink escaping canonical tgzDir', () => {
    const { baseDir, projectDir, tgzDir } = createBase(t, 'escaping-symlink');
    writeBlankFixture(projectDir);
    const before = blankMutationSnapshot(projectDir);
    const archive = path.join(tgzDir, '@expo+cli+54.0.27.tgz');
    const outside = path.join(baseDir, 'outside-cli.tgz');
    fs.rmSync(archive);
    fs.writeFileSync(outside, 'outside archive\n');
    fs.symlinkSync(outside, archive);

    const report = prepareCreateExpoFixture({ projectDir, template: 'blank-typescript', tgzDir });

    assertRejectedWithoutBlankMutation({ projectDir, report, before, expected: 'outside canonical tgzDir' });
  });

  await t.test('directory with .tgz suffix', () => {
    const { projectDir, tgzDir } = createBase(t, 'archive-directory');
    writeBlankFixture(projectDir);
    const before = blankMutationSnapshot(projectDir);
    const archive = path.join(tgzDir, '@expo+cli+54.0.27.tgz');
    fs.rmSync(archive);
    fs.mkdirSync(archive);

    const report = prepareCreateExpoFixture({ projectDir, template: 'blank-typescript', tgzDir });

    assertRejectedWithoutBlankMutation({ projectDir, report, before, expected: 'regular file' });
  });

  await t.test('contained symlink is not an actual regular archive entry', () => {
    const { projectDir, tgzDir } = createBase(t, 'contained-symlink');
    writeBlankFixture(projectDir);
    const before = blankMutationSnapshot(projectDir);
    const archive = path.join(tgzDir, '@expo+cli+54.0.27.tgz');
    const target = path.join(tgzDir, 'contained-cli-target.tgz');
    fs.rmSync(archive);
    fs.writeFileSync(target, 'contained target\n');
    fs.symlinkSync(target, archive);

    const report = prepareCreateExpoFixture({ projectDir, template: 'blank-typescript', tgzDir });

    assertRejectedWithoutBlankMutation({ projectDir, report, before, expected: 'regular file' });
  });
});

test('blank validates the complete exact staging contract before selecting its subset', async (t) => {
  const cases = [
    ['unused Router version', (manifest) => {
      manifest.expoPackages.find((entry) => entry.name === 'expo-router').version = '6.0.25';
    }, 'expo-router@6.0.25'],
    ['unused WebBrowser source', (manifest) => {
      manifest.expoPackages.find((entry) => entry.name === 'expo-web-browser').source = 'external';
    }, 'expo-web-browser'],
    ['unused external version', (manifest) => {
      manifest.externalPackages.find((entry) => entry.name === '@react-native-ohos/react-native-worklets').version = '1.0.1';
    }, '@react-native-ohos/react-native-worklets@1.0.1'],
    ['missing unused external entry', (manifest) => {
      manifest.externalPackages = manifest.externalPackages.filter(
        (entry) => entry.name !== '@react-native-ohos/react-native-worklets',
      );
      manifest.packages = 24;
    }, 'missing external package @react-native-ohos/react-native-worklets@1.0.0'],
    ['replacement extra workspace entry', (manifest) => {
      manifest.expoPackages.find((entry) => entry.name === 'expo-router').name = 'expo-image';
    }, 'unexpected workspace package expo-image'],
    ['duplicate replacing a workspace entry', (manifest) => {
      manifest.expoPackages.find((entry) => entry.name === 'expo-router').name = 'expo';
    }, 'duplicate package expo'],
    ['external package in workspace list', (manifest) => {
      manifest.expoPackages.find((entry) => entry.name === 'expo-router').name = 'react-native-worklets';
    }, 'unexpected workspace package react-native-worklets'],
  ];

  for (const [name, mutate, expected] of cases) {
    await t.test(name, () => {
      const { projectDir, tgzDir } = createBase(t, name.replaceAll(/[^a-z]+/gi, '-'));
      writeBlankFixture(projectDir);
      const before = blankMutationSnapshot(projectDir);
      updateStagingManifest(tgzDir, mutate);

      const report = prepareCreateExpoFixture({ projectDir, template: 'blank-typescript', tgzDir });

      assertRejectedWithoutBlankMutation({ projectDir, report, before, expected });
    });
  }
});

test('normalizes malformed package arrays to failures instead of throwing', async (t) => {
  const malformedValues = [
    ['object', { bad: true }],
    ['null', null],
    ['string', 'not-an-array'],
  ];

  for (const field of ['expoPackages', 'externalPackages']) {
    for (const [kind, malformed] of malformedValues) {
      await t.test(`${field} as ${kind}`, () => {
        const { projectDir, tgzDir } = createBase(t, `${field}-${kind}`);
        writeBlankFixture(projectDir);
        const before = blankMutationSnapshot(projectDir);
        updateStagingManifest(tgzDir, (manifest) => {
          manifest[field] = malformed;
        });

        let report;
        assert.doesNotThrow(() => {
          report = prepareCreateExpoFixture({ projectDir, template: 'blank-typescript', tgzDir });
        });
        assertRejectedWithoutBlankMutation({
          projectDir,
          report,
          before,
          expected: `${field} must be an array`,
        });
      });
    }
  }
});

test('returns failures instead of throwing for non-string selected archive filenames', async (t) => {
  const cases = [
    ['null', null],
    ['number', 54],
    ['object', { file: '@expo+cli+54.0.27.tgz' }],
    ['array', ['@expo+cli+54.0.27.tgz']],
    ['boolean', true],
  ];

  for (const [kind, malformedFile] of cases) {
    await t.test(kind, () => {
      const { projectDir, tgzDir } = createBase(t, `selected-file-${kind}`);
      writeBlankFixture(projectDir);
      const before = blankMutationSnapshot(projectDir);
      updateStagingManifest(tgzDir, (manifest) => {
        manifest.expoPackages.find((entry) => entry.name === '@expo/cli').file = malformedFile;
      });

      let report;
      assert.doesNotThrow(() => {
        report = prepareCreateExpoFixture({ projectDir, template: 'blank-typescript', tgzDir });
      });
      assertRejectedWithoutBlankMutation({
        projectDir,
        report,
        before,
        expected: 'archive filename for @expo/cli',
      });
    });
  }
});
