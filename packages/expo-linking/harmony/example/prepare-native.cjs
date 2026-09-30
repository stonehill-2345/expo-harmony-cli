// Prepare only this package's isolated native diagnostic fixture. No installs here.
const fs = require('node:fs');
const path = require('node:path');
if (process.argv.length < 4 || process.argv.length > 5) throw new Error('Usage: prepare-native.cjs EMPTY_DEST RN_DEPENDENCY_ROOT [--release]');
const [destination, dependencyRoot] = process.argv.slice(2, 4).map((p) => fs.realpathSync(p));
const release = process.argv.includes('--release');
if (fs.readdirSync(destination).length) throw new Error('Destination must be an existing empty directory');
const rnoh = path.join(dependencyRoot, 'node_modules/@react-native-oh/react-native-harmony');
const version = JSON.parse(fs.readFileSync(path.join(rnoh, 'package.json'))).version;
if (version !== '0.82.30') throw new Error('Requires locked RNOH 0.82.30');
fs.cpSync(path.join(__dirname, 'native'), destination, { recursive: true, errorOnExist: true });
for (const language of ['ets', 'cpp']) {
  fs.cpSync(path.join(__dirname, '../src/main', language), path.join(destination, 'entry/src/main', language, 'expo_linking'), { recursive: true });
}
fs.mkdirSync(path.join(destination, 'dependencies'));
fs.copyFileSync(path.join(rnoh, release ? 'react_native_openharmony_release.har' : 'react_native_openharmony.har'), path.join(destination, 'dependencies/react_native_openharmony.har'));
fs.mkdirSync(path.join(destination, 'js'));
fs.copyFileSync(path.join(__dirname, 'direct.js'), path.join(destination, 'js/direct.js'));
fs.writeFileSync(path.join(destination, 'js/package.json'), JSON.stringify({ name: 'lane-b-linking-direct', private: true }));
console.log('Prepared native diagnostic fixture:', destination);
