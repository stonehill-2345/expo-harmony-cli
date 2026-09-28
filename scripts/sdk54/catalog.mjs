export const SDK54_EXPO_COMMIT = '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1';
export const SDK54_MVP_SOURCE_COMMIT = '2704a48cc52781f510b3996af17c882fb82e1090';

const FIXED_BUILD_ENV = Object.freeze({
  CI: '1',
  EXPO_NONINTERACTIVE: '1',
  TZ: 'UTC',
  LC_ALL: 'C',
  LANG: 'C',
  SOURCE_DATE_EPOCH: '946684800',
});

function frozenLinks(links) {
  return Object.freeze(links.map(Object.freeze));
}

function buildRecipe(argv, { toolLinks, binLinks, linkProductionDependencies = false, ...extra }) {
  return Object.freeze({
    argv: Object.freeze(argv),
    env: FIXED_BUILD_ENV,
    shell: false,
    toolLinks: frozenLinks(toolLinks),
    binLinks: frozenLinks(binLinks),
    linkProductionDependencies,
    ...extra,
  });
}

function runtime(requiredFiles, probe) {
  return Object.freeze({
    requiredFiles: Object.freeze(requiredFiles.map(Object.freeze)),
    probe: Object.freeze({ ...probe, peerProviders: Object.freeze(probe.peerProviders ?? []) }),
  });
}

const CLI_BUILD = buildRecipe(
  ['pnpm', '--dir', '{packageDir}', 'exec', 'taskr', 'release'],
  {
    toolLinks: [
      { name: 'taskr', source: 'package' },
      { name: '@swc/core', source: 'package' },
      { name: 'getenv', source: 'package' },
      { name: '@taskr/clear', source: 'package' },
      { name: '@taskr/esnext', source: 'package' },
      { name: '@taskr/watch', source: 'package' },
    ],
    binLinks: [{ name: 'taskr', package: 'taskr', path: 'cli.js' }],
  },
);

const TSC_ARGV = [
  'pnpm', '--dir', '{packageDir}', 'exec', 'expo-module', 'tsc',
  '--project', 'tsconfig.json', '--pretty', 'false',
];

const TYPESCRIPT_TOOLS = [
  { name: 'expo-module-scripts', source: 'package' },
  { name: 'typescript', source: 'root', path: 'node_modules/.pnpm/typescript@5.9.3/node_modules/typescript' },
  { name: '@tsconfig/node18', source: 'root', path: 'node_modules/.pnpm/node_modules/@tsconfig/node18' },
];
const TYPESCRIPT_BINS = [
  { name: 'expo-module', package: 'expo-module-scripts', path: 'bin/expo-module.js' },
  { name: 'tsc', package: 'typescript', path: 'bin/tsc' },
];

const METRO_BUILD = buildRecipe(TSC_ARGV, {
  linkProductionDependencies: true,
  toolLinks: [
    ...TYPESCRIPT_TOOLS,
    { name: '@types/node', source: 'root', path: 'node_modules/.pnpm/node_modules/@types/node' },
    { name: '@jridgewell/trace-mapping', source: 'package' },
    { name: '@types/babel__core', source: 'package' },
    { name: '@types/picomatch', source: 'package' },
    { name: 'dedent', source: 'package' },
    { name: 'sass', source: 'package' },
  ],
  binLinks: TYPESCRIPT_BINS,
  supportCopies: Object.freeze([
    Object.freeze({ from: 'packages/@expo/cli/ts-declarations', to: 'packages/@expo/cli/ts-declarations' }),
  ]),
  supportLinks: Object.freeze([
    Object.freeze({ from: 'node_modules/.pnpm/node_modules/@types/node', to: 'packages/@expo/cli/ts-declarations/node' }),
  ]),
  tsconfigCompilerOptions: Object.freeze({ noCheck: true, preserveSymlinks: true }),
});

const AUTOLINKING_BUILD = buildRecipe(TSC_ARGV, {
  linkProductionDependencies: true,
  toolLinks: TYPESCRIPT_TOOLS,
  binLinks: TYPESCRIPT_BINS,
});

const CLI_RUNTIME = runtime(
  [
    { path: 'build/bin/cli', executable: true },
    { path: 'build/src/run/harmony/runHarmonyAsync.js' },
    { path: 'build/src/prebuild/harmony/prebuildHarmonyAsync.js' },
  ],
  { type: 'cli', version: '54.0.27' },
);

const METRO_RUNTIME = runtime(
  [{ path: 'build/withHarmony.js' }],
  { type: 'metro', peerProviders: ['expo'] },
);

const AUTOLINKING_RUNTIME = runtime(
  [
    { path: 'build/platforms/harmony/index.js' },
    { path: 'build/platforms/harmony/nativeProject.js' },
  ],
  { type: 'autolinking' },
);

export const SDK54_PACKAGES = Object.freeze([
  { name: '@expo/cli', version: '54.0.27', relativePath: 'packages/@expo/cli', patchFile: '@expo+cli+54.0.27.patch', build: CLI_BUILD, runtime: CLI_RUNTIME },
  { name: '@expo/metro-config', version: '54.0.17', relativePath: 'packages/@expo/metro-config', patchFile: '@expo+metro-config+54.0.17.patch', build: METRO_BUILD, runtime: METRO_RUNTIME },
  { name: 'expo', version: '54.0.37', relativePath: 'packages/expo', patchFile: 'expo+54.0.37.patch' },
  { name: 'expo-asset', version: '12.0.13', relativePath: 'packages/expo-asset', patchFile: 'expo-asset+12.0.13.patch' },
  { name: 'expo-constants', version: '18.0.14', relativePath: 'packages/expo-constants', patchFile: 'expo-constants+18.0.14.patch' },
  { name: 'expo-font', version: '14.0.12', relativePath: 'packages/expo-font', patchFile: 'expo-font+14.0.12.patch' },
  { name: 'expo-linking', version: '8.0.12', relativePath: 'packages/expo-linking', patchFile: 'expo-linking+8.0.12.patch' },
  { name: 'expo-modules-autolinking', version: '3.0.27', relativePath: 'packages/expo-modules-autolinking', patchFile: 'expo-modules-autolinking+3.0.27.patch', templateOwner: true, build: AUTOLINKING_BUILD, runtime: AUTOLINKING_RUNTIME },
  { name: 'expo-modules-core', version: '3.0.30', relativePath: 'packages/expo-modules-core', patchFile: 'expo-modules-core+3.0.30.patch' },
  { name: 'expo-router', version: '6.0.24', relativePath: 'packages/expo-router', patchFile: 'expo-router+6.0.24.patch' },
  { name: 'expo-splash-screen', version: '31.0.13', relativePath: 'packages/expo-splash-screen', patchFile: 'expo-splash-screen+31.0.13.patch' },
  { name: 'expo-status-bar', version: '3.0.9', relativePath: 'packages/expo-status-bar', patchFile: 'expo-status-bar+3.0.9.patch' },
  { name: 'expo-system-ui', version: '6.0.9', relativePath: 'packages/expo-system-ui', patchFile: 'expo-system-ui+6.0.9.patch' },
  { name: 'expo-web-browser', version: '15.0.11', relativePath: 'packages/expo-web-browser', patchFile: 'expo-web-browser+15.0.11.patch' },
].map(Object.freeze));

export const EXPECTED_INTERNAL_EDGES = Object.freeze([
  { from: '@expo/cli', to: '@expo/metro-config', section: 'dependencies' },
  { from: '@expo/cli', to: 'expo', section: 'peerDependencies' },
  { from: '@expo/cli', to: 'expo-router', section: 'peerDependencies' },
  { from: '@expo/metro-config', to: 'expo', section: 'peerDependencies' },
  { from: 'expo', to: '@expo/cli', section: 'dependencies' },
  { from: 'expo', to: '@expo/metro-config', section: 'dependencies' },
  { from: 'expo', to: 'expo-asset', section: 'dependencies' },
  { from: 'expo', to: 'expo-constants', section: 'dependencies' },
  { from: 'expo', to: 'expo-font', section: 'dependencies' },
  { from: 'expo', to: 'expo-modules-autolinking', section: 'dependencies' },
  { from: 'expo', to: 'expo-modules-core', section: 'dependencies' },
  { from: 'expo-asset', to: 'expo-constants', section: 'dependencies' },
  { from: 'expo-asset', to: 'expo', section: 'peerDependencies' },
  { from: 'expo-constants', to: 'expo', section: 'peerDependencies' },
  { from: 'expo-font', to: 'expo', section: 'peerDependencies' },
  { from: 'expo-linking', to: 'expo-constants', section: 'dependencies' },
  { from: 'expo-router', to: 'expo', section: 'peerDependencies' },
  { from: 'expo-router', to: 'expo-constants', section: 'peerDependencies' },
  { from: 'expo-router', to: 'expo-linking', section: 'peerDependencies' },
  { from: 'expo-splash-screen', to: 'expo', section: 'peerDependencies' },
  { from: 'expo-system-ui', to: 'expo', section: 'peerDependencies' },
  { from: 'expo-web-browser', to: 'expo', section: 'peerDependencies' },
].map(Object.freeze));

export function getDescriptorByName(name) {
  const descriptor = SDK54_PACKAGES.find((candidate) => candidate.name === name);
  if (!descriptor) {
    throw new Error(`Unknown SDK54 package: ${name}`);
  }
  return descriptor;
}
