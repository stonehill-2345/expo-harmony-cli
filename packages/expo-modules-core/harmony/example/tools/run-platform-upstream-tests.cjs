// Run the original Expo Platform snapshot test against a source copy, not against
// a different registry Core. Install tooling separately; never edit node_modules.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const tooling = fs.realpathSync(process.argv[2]);
const destination = path.resolve(process.argv[3]);
if (fs.existsSync(destination)) throw new Error('Source test destination already exists');
const core = path.resolve(__dirname, '../../..');
fs.cpSync(core, destination, { recursive: true, filter: p => path.basename(p) !== 'node_modules' });
fs.symlinkSync(path.join(tooling, 'node_modules'), path.join(destination, 'node_modules'), 'dir');
const config = JSON.parse(fs.readFileSync(path.join(destination, 'tsconfig.json')));
config.compilerOptions.baseUrl = '.';
config.compilerOptions.paths = { 'expo-modules-core': ['./src/index.ts'], 'expo-modules-core/*': ['./*'] };
fs.writeFileSync(path.join(destination, 'tsconfig.json'), JSON.stringify(config, null, 2));
fs.writeFileSync(path.join(destination, 'jest.source.config.cjs'), `
const preset = require('expo-module-scripts/jest-preset');
module.exports = { ...preset, projects: preset.projects.map(project => ({
  ...project, rootDir: __dirname, moduleNameMapper: { ...project.moduleNameMapper,
    '^expo-modules-core$': '<rootDir>/src/index.ts', '^expo-modules-core/(.*)$': '<rootDir>/$1',
  },
})) };
`);
execFileSync(process.execPath, [path.join(tooling, 'node_modules/jest/bin/jest.js'),
  '--config', 'jest.source.config.cjs', 'src/__tests__/Platform-test.ts', '--runInBand', '--no-watchman'],
  { cwd: destination, stdio: 'inherit' });
