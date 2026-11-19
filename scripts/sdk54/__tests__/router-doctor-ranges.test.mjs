import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire, Module } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = path.resolve('packages/expo-router/src/doctor/index.ts');
const loaded = new Module(source);
loaded.filename = source;
loaded.paths = Module._nodeModulePaths(path.dirname(source));
loaded._compile(ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, source);
const { doctor } = loaded.exports;
const format = { bold: value => value, learnMore: value => value };

test('Router doctor accepts compatible exact versions from the real default candidate', () => {
  assert.deepEqual(doctor({ dependencies: {
    '@react-navigation/bottom-tabs': '7.4.0',
    '@react-navigation/native': '7.1.17',
    '@react-navigation/native-stack': '7.3.16',
  } }, undefined, format), []);
});

test('Router doctor rejects user ranges that allow versions outside its supported range', () => {
  const result = doctor({ dependencies: { '@react-navigation/native': '^7.0.0' } }, undefined, format);
  assert.deepEqual(result.map(row => row.packageName), ['@react-navigation/native']);
});


test('Router doctor accepts exact navigation pins when Router is installed through its release alias', () => {
  assert.deepEqual(doctor({ dependencies: {
    'expo-router': 'npm:@expo-oh/expo-router@6.0.25',
    '@react-navigation/native': '7.1.17',
  } }, undefined, format), []);
});

test('Router doctor keeps exclusions and rejects incompatible exact navigation versions', () => {
  assert.deepEqual(doctor({ dependencies: { '@react-navigation/native': '6.1.0' },
    expo: { install: { exclude: ['@react-navigation/native'] } },
  }, undefined, format), []);
  assert.deepEqual(doctor({ devDependencies: { '@react-navigation/native': '8.0.0' } }, undefined, format)
    .map(row => [row.packageName, row.packageType]), [['@react-navigation/native', 'devDependencies']]);
});

test('published Router doctor matches source behavior for compatible exact versions', () => {
  const published = require('../../../packages/expo-router/build/doctor/index.js');
  const pkg = { dependencies: { 'expo-router': 'npm:@expo-oh/expo-router@6.0.25', '@react-navigation/native': '7.1.17' } };
  assert.deepEqual(published.doctor(pkg, undefined, format), []);
  assert.deepEqual(published.doctor(pkg, undefined, format), doctor(pkg, undefined, format));
});
