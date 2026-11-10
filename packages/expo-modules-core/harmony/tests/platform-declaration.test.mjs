import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packageRoot = process.env.EXPO_CORE_DECLARATION_PACKAGE ?? core;
const dependencies = process.env.EXPO_HARMONY_CONSUMER_NODE_MODULES;

test('published Core Platform accepts Harmony and rejects unsupported platform keys', t => {
  assert.ok(dependencies, 'Set EXPO_HARMONY_CONSUMER_NODE_MODULES to an installed consumer node_modules');
  const reactNative = path.join(dependencies, 'react-native/types/index.d.ts');
  assert.ok(fs.existsSync(reactNative), 'Real React Native declarations are required');
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-core-platform-types-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json')));
  const entry = manifest.exports?.['.']?.types ?? manifest.types;
  assert.ok(entry && fs.existsSync(path.resolve(packageRoot, entry)), 'Published type entry must exist');
  const file = path.join(fixture, 'consumer.ts');
  fs.writeFileSync(file, `import { Platform } from 'expo-modules-core';
const value: number = Platform.select({ harmony: 1, native: 2, default: 0 });
// @ts-expect-error A made-up platform must not become accepted through unresolved any types.
Platform.select({ notAnExpoPlatform: 1 });
void value;
`);
  const options = { noEmit: true, strict: true, skipLibCheck: true, types: [],
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    paths: { 'expo-modules-core': [path.resolve(packageRoot, entry)], 'react-native': [reactNative] },
  };
  const program = ts.createProgram([file], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => fixture, getCanonicalFileName: file => file, getNewLine: () => '\n',
  }));
});

test('checked-in Platform declaration matches a checked source emission', t => {
  assert.ok(dependencies, 'Real consumer dependencies are required');
  const source = path.join(core, 'src/Platform.ts');
  const req = createRequire(path.join(dependencies, 'react-native/package.json'));
  const nodeTypes = path.dirname(req.resolve('@types/node/package.json'));
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-core-platform-emit-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const options = { declaration: true, declarationMap: true, emitDeclarationOnly: true, noEmitOnError: true,
    strict: true, skipLibCheck: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, rootDir: path.join(core, 'src'), outDir: output,
    types: ['node'], typeRoots: [path.dirname(nodeTypes)],
    paths: { 'react-native': [path.join(dependencies, 'react-native/types/index.d.ts')] },
  };
  const program = ts.createProgram([source], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => core, getCanonicalFileName: file => file, getNewLine: () => '\n',
  }));
  assert.equal(program.emit().emitSkipped, false);
  assert.equal(fs.readFileSync(path.join(core, 'build/Platform.d.ts'), 'utf8'),
    fs.readFileSync(path.join(output, 'Platform.d.ts'), 'utf8'));
});
