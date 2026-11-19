import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export const FIXED_SOURCE = Object.freeze({
  name: 'expo-image',
  version: '3.0.11',
  commit: '172a69f5f70c1d0e043e1532f924de97210cabc3',
  tarball: 'https://registry.npmjs.org/expo-image/-/expo-image-3.0.11.tgz',
  integrity: 'sha512-4TudfUCLgYgENv+f48omnU8tjS2S0Pd9EaON5/s1ZUBRwZ7K8acEr4NfvLPSaeXvxW24iLAiyQ7sV7BXQH3RoA==',
  shasum: '54195565dc710e632c10414c3609deebb7149ac5',
  sha256: 'e17879a4cc6cebdf50efadf3170956b2601363f1525f0426b10859a6154178bb',
});

export const FROZEN_PUBLIC_CONTRACT = Object.freeze({
  entryExports: ['Image', 'ImageBackground', 'useImage'],
  typeExports: [
    'ImageBackgroundProps', 'ImageContentFit', 'ImageContentPosition', 'ImageContentPositionObject',
    'ImageContentPositionString', 'ImageContentPositionValue', 'ImageDecodeFormat', 'ImageErrorEventData',
    'ImageLoadEventData', 'ImageLoadOptions', 'ImageNativeModule', 'ImageNativeProps', 'ImagePrefetchOptions',
    'ImageProgressEventData', 'ImageProps', 'ImageRef', 'ImageSource', 'ImageStyle', 'ImageTransition',
  ],
  imageProps: [
    'style', 'source', 'placeholder', 'contentFit', 'placeholderContentFit', 'contentPosition', 'transition',
    'blurRadius', 'tintColor', 'priority', 'cachePolicy', 'responsivePolicy', 'recyclingKey', 'autoplay',
    'onLoadStart', 'onLoad', 'onProgress', 'onError', 'onLoadEnd', 'onDisplay', 'defaultSource',
    'loadingIndicatorSource', 'resizeMode', 'fadeDuration', 'focusable', 'accessible', 'accessibilityLabel',
    'alt', 'enableLiveTextInteraction', 'allowDownscaling', 'decodeFormat', 'useAppleWebpCodec',
    'enforceEarlyResizing',
  ],
  deprecatedProps: ['defaultSource', 'loadingIndicatorSource', 'resizeMode', 'fadeDuration'],
  events: ['onLoadStart', 'onLoad', 'onProgress', 'onError', 'onLoadEnd', 'onDisplay'],
  staticMethods: ['prefetch', 'clearMemoryCache', 'clearDiskCache', 'getCachePathAsync', 'generateBlurhashAsync', 'generateThumbhashAsync', 'loadAsync'],
  instanceMethods: ['startAnimating', 'stopAnimating', 'lockResourceAsync', 'unlockResourceAsync', 'reloadAsync'],
  nativeCommands: ['startAnimating', 'stopAnimating', 'lockResourceAsync', 'unlockResourceAsync', 'reloadAsync'],
  imageRefProperties: ['width', 'height', 'scale', 'mediaType', 'isAnimated'],
});

export const DEFAULT_PAGE_REQUIREMENTS = Object.freeze([
  {
    page: 'app/(tabs)/index.tsx', pageSha256: '6eb90b4657ccaf8d2be7dbaceaf6c7628785ad0880343f5ed439327fbd061fdc',
    source: '@/assets/images/partial-react-logo.png', asset: 'assets/images/partial-react-logo.png',
    assetSha256: '015a72aeb24c1166243ebc185355c9488cc892fbf3aa82f9ae66819a10f3451c',
    pixels: { width: 518, height: 316 }, display: { width: 290, height: 178 },
  },
  {
    page: 'app/(tabs)/explore.tsx', pageSha256: '42195d1fcc3b37b4d1cd7d953ff643970297afc705327c17a254b5010fa8460a',
    source: '@/assets/images/react-logo.png', asset: 'assets/images/react-logo.png',
    assetSha256: '224b7636b15e672801579b5b418077cbc2ca42f0146389062364356b0ecb5c5c',
    pixels: { width: 100, height: 100 }, display: { width: 100, height: 100 },
  },
]);

const ERROR_TEXT = 'Native Harmony view is not registered: ExpoImage/default';
const EVIDENCE_HASHES = Object.freeze({
  'default-debug-hilog.txt': '132034848edd4f569f5d2338e39a9676a988ee6c9448fa72214821ae1619f2a0',
  'default-debug-unsigned.hap': 'cf6af49cfb55ba181d7d40ebfdd8d5c8b890952621e31b4b8708badf741253c7',
  'default-expo-image-module-config.json': '9c1773f416794b36f35a603986d910ad57bbed8ce69b2a23ace9cc4116206cc5',
  'default-debug-first-screen.png': '600e5c906266f59a2c8112fb07facb976a64db384e488d9d1125b9ed6fe5358a',
  'default-cold-restart-recaptured.png': 'e90b735d5bda6d9dd6a48af305040d0a69b7d18c3b006075f2e599a985926ed5',
});
const GIT_ONLY = ['.npmignore', 'android/.gitignore', 'babel.config.js',
  'src/__rsc_tests__/__snapshots__/index.test.tsx.snap.android',
  'src/__rsc_tests__/__snapshots__/index.test.tsx.snap.ios',
  'src/__rsc_tests__/__snapshots__/index.test.tsx.snap.web', 'src/__rsc_tests__/index.test.tsx'];
const NPM_ONLY = [
  'expo.modules.image-3.0.11-sources.jar', 'expo.modules.image-3.0.11-sources.jar.md5',
  'expo.modules.image-3.0.11-sources.jar.sha1', 'expo.modules.image-3.0.11-sources.jar.sha256',
  'expo.modules.image-3.0.11-sources.jar.sha512', 'expo.modules.image-3.0.11.aar',
  'expo.modules.image-3.0.11.aar.md5', 'expo.modules.image-3.0.11.aar.sha1',
  'expo.modules.image-3.0.11.aar.sha256', 'expo.modules.image-3.0.11.aar.sha512',
  'expo.modules.image-3.0.11.module', 'expo.modules.image-3.0.11.module.md5',
  'expo.modules.image-3.0.11.module.sha1', 'expo.modules.image-3.0.11.module.sha256',
  'expo.modules.image-3.0.11.module.sha512', 'expo.modules.image-3.0.11.pom',
  'expo.modules.image-3.0.11.pom.md5', 'expo.modules.image-3.0.11.pom.sha1',
  'expo.modules.image-3.0.11.pom.sha256', 'expo.modules.image-3.0.11.pom.sha512',
].map(name => `local-maven-repo/BareExpo/expo.modules.image/3.0.11/${name}`).concat([
  'local-maven-repo/BareExpo/expo.modules.image/maven-metadata.xml',
  'local-maven-repo/BareExpo/expo.modules.image/maven-metadata.xml.md5',
  'local-maven-repo/BareExpo/expo.modules.image/maven-metadata.xml.sha1',
  'local-maven-repo/BareExpo/expo.modules.image/maven-metadata.xml.sha256',
  'local-maven-repo/BareExpo/expo.modules.image/maven-metadata.xml.sha512',
]);

const digest = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sorted = values => [...new Set(values)].sort();
const portable = file => file.split(path.sep).join('/');
const same = (actual, expected, message) => assert.deepEqual(actual, expected, message);

function sourceFile(name, text, kind = name.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS) {
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, kind);
  assert.equal(source.parseDiagnostics.length, 0, `TypeScript parse failed: ${name}`);
  return source;
}

const nameOf = (node, source) => node.name && ts.isIdentifier(node.name) ? node.name.text : node.name?.getText(source);
const typeOf = (node, source) => node.type?.getText(source) ?? null;
const hasModifier = (node, kind) => node.modifiers?.some(modifier => modifier.kind === kind) ?? false;
const hasTag = (node, tag) => ts.getJSDocTags(node).some(item => item.tagName.text === tag);

function declarationMembers(declaration, source) {
  return declaration.members.map(member => ({
    name: nameOf(member, source), type: typeOf(member, source), optional: Boolean(member.questionToken),
    readonly: hasModifier(member, ts.SyntaxKind.ReadonlyKeyword), deprecated: hasTag(member, 'deprecated'),
  })).filter(row => row.name);
}

function declaration(source, name) {
  const node = source.statements.find(statement => statement.name?.text === name);
  assert.ok(node, `Missing declaration ${name}`);
  return node;
}

function exportedDeclarations(source) {
  return source.statements.filter(statement => statement.name && hasModifier(statement, ts.SyntaxKind.ExportKeyword))
    .map(statement => ({ name: statement.name.text, kind: ts.SyntaxKind[statement.kind] })).sort((a, b) => a.name.localeCompare(b.name));
}

function classMembers(source, className) {
  const node = declaration(source, className);
  assert.ok(ts.isClassDeclaration(node), `Expected class ${className}`);
  return node.members.map(member => ({
    name: ts.isConstructorDeclaration(member) ? 'constructor' : nameOf(member, source),
    kind: ts.SyntaxKind[member.kind], static: hasModifier(member, ts.SyntaxKind.StaticKeyword),
    type: typeOf(member, source), definite: Boolean(member.exclamationToken),
  })).filter(row => row.name);
}

function callIdentities(source, functionName) {
  const values = [];
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === functionName) {
      values.push(node.arguments.map(argument => ts.isStringLiteral(argument) ? argument.text : argument.getText(source)));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return values;
}

function importContract(sources) {
  const imports = new Map();
  for (const source of sources) for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text.startsWith('.')) continue;
    const names = imports.get(statement.moduleSpecifier.text) ?? [];
    const clause = statement.importClause;
    if (clause?.name) names.push('default');
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) names.push(...clause.namedBindings.elements.map(element => element.name.text));
    imports.set(statement.moduleSpecifier.text, names);
  }
  return Object.fromEntries([...imports].sort(([a], [b]) => a.localeCompare(b)).map(([module, names]) => [module, sorted(names)]));
}

export function extractPublicContract(files) {
  const index = sourceFile('index.ts', files.index);
  const types = sourceFile('Image.types.ts', files.types);
  const image = sourceFile('Image.tsx', files.image);
  const nativeView = sourceFile('ExpoImage.tsx', files.nativeView);
  const nativeModule = sourceFile('ImageModule.ts', files.nativeModule);
  const useImage = sourceFile('useImage.ts', files.useImage);
  const entryExports = [], exportAll = [];
  for (const statement of index.statements) if (ts.isExportDeclaration(statement)) {
    if (!statement.exportClause) exportAll.push(statement.moduleSpecifier.text);
    else if (ts.isNamedExports(statement.exportClause)) entryExports.push(...statement.exportClause.elements.map(element => element.name.text));
  }
  const props = declarationMembers(declaration(types, 'ImageProps'), types);
  const ref = declarationMembers(declaration(types, 'ImageRef'), types);
  const typeExports = exportedDeclarations(types);
  const members = classMembers(image, 'Image');
  const nativeMembers = classMembers(nativeView, 'ExpoImage');
  const eventPayloadNames = ['ImageLoadEventData', 'ImageProgressEventData', 'ImageErrorEventData'];
  const payloads = Object.fromEntries(eventPayloadNames.map(name => [name, declarationMembers(declaration(types, name).type, types)]));
  const events = props.filter(row => row.name.startsWith('on'));
  return {
    entry: { named: sorted(entryExports), exportAll: sorted(exportAll) },
    typeExports,
    imageProps: props,
    events,
    eventPayloads: payloads,
    imageRef: { heritage: declaration(types, 'ImageRef').heritageClauses?.map(node => node.getText(types)) ?? [], properties: ref },
    imageClass: {
      staticProperties: sorted(members.filter(row => row.static && row.kind === 'PropertyDeclaration').map(row => row.name)),
      staticMethods: sorted(members.filter(row => row.static && row.kind === 'MethodDeclaration').map(row => row.name)),
      instanceMethods: sorted(members.filter(row => !row.static && row.kind === 'MethodDeclaration' && !['constructor', 'render'].includes(row.name)).map(row => row.name)),
      componentMembers: members.filter(row => ['constructor', 'getAnimatableRef', 'render', 'nativeViewRef', 'containerViewRef'].includes(row.name)),
    },
    native: {
      moduleCalls: callIdentities(nativeModule, 'requireNativeModule'),
      viewCalls: callIdentities(nativeView, 'requireNativeViewManager'),
      moduleName: 'ExpoImage', viewName: 'default', expectedHarmonyComponentName: 'ViewManagerAdapter_ExpoImage',
      commands: nativeMembers.filter(row => row.definite && row.kind === 'PropertyDeclaration').map(row => ({ name: row.name, type: row.type })),
    },
    dependencies: importContract([types, image, nativeView, nativeModule, useImage]),
  };
}

export function assertFrozenPublicContract(contract) {
  same(contract.entry.named, [...FROZEN_PUBLIC_CONTRACT.entryExports].sort(), 'Changed expo-image entry exports');
  same(contract.entry.exportAll, ['./Image.types'], 'Changed type export entry');
  same(contract.typeExports.map(row => row.name), [...FROZEN_PUBLIC_CONTRACT.typeExports].sort(), 'Changed exported type declarations');
  same(contract.imageProps.map(row => row.name), FROZEN_PUBLIC_CONTRACT.imageProps, 'Changed ImageProps');
  same(contract.imageProps.filter(row => row.deprecated).map(row => row.name), FROZEN_PUBLIC_CONTRACT.deprecatedProps, 'Changed deprecated ImageProps');
  same(contract.events.map(row => row.name), FROZEN_PUBLIC_CONTRACT.events, 'Changed Image events');
  same(contract.imageClass.staticMethods, [...FROZEN_PUBLIC_CONTRACT.staticMethods].sort(), 'Changed Image static methods');
  same(contract.imageClass.instanceMethods, [...FROZEN_PUBLIC_CONTRACT.instanceMethods].sort(), 'Changed Image instance methods');
  same(contract.native.commands.map(row => row.name), FROZEN_PUBLIC_CONTRACT.nativeCommands, 'Changed native view commands');
  same(contract.imageRef.properties.map(row => row.name), FROZEN_PUBLIC_CONTRACT.imageRefProperties, 'Changed ImageRef properties');
  same(contract.native.moduleCalls, [['ExpoImage']], 'Changed native module identity');
  same(contract.native.viewCalls, [['ExpoImage']], 'Changed native view identity');
  assert.ok(contract.imageRef.heritage.includes("extends SharedRef<'image'>"), 'ImageRef must retain SharedRef image identity');
  for (const [module, names] of Object.entries({
    expo: ['NativeModule', 'SharedRef', 'SharedRefType', 'requireNativeModule'],
    'expo-modules-core': ['Platform', 'createSnapshotFriendlyRef', 'requireNativeViewManager'],
    react: ['default'], 'react-native': ['NativeSyntheticEvent', 'Platform', 'StyleSheet', 'View', 'ViewProps'],
  })) for (const name of names) assert.ok(contract.dependencies[module]?.includes(name), `Missing ${module} dependency ${name}`);
  return contract;
}

function listFiles(root) {
  const files = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) files.push(portable(path.relative(root, file)));
    }
  };
  visit(root);
  return files;
}

export function assertFixedSourceIdentity(identity) {
  same(identity, FIXED_SOURCE, 'Changed expo-image fixed source identity');
}

function comparePublishedSource(sourceRepo, archive) {
  const packageRoot = path.join(sourceRepo, 'packages/expo-image');
  const commit = execFileSync('git', ['-C', sourceRepo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(commit, FIXED_SOURCE.commit, 'Changed Expo source commit');
  assert.equal(execFileSync('git', ['-C', sourceRepo, 'status', '--porcelain=v1', '--', 'packages/expo-image'], { encoding: 'utf8' }), '', 'Expo source package is dirty');
  const archiveBytes = fs.readFileSync(archive);
  const identity = {
    ...FIXED_SOURCE,
    integrity: `sha512-${digest(archiveBytes, 'sha512', 'base64')}`,
    shasum: digest(archiveBytes, 'sha1'), sha256: digest(archiveBytes), commit,
  };
  assertFixedSourceIdentity(identity);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-image-a06-'));
  try {
    execFileSync('tar', ['-xzf', archive, '-C', temporary]);
    const publishedRoot = path.join(temporary, 'package');
    const gitFiles = execFileSync('git', ['-C', sourceRepo, 'ls-tree', '-r', '--name-only', 'HEAD', 'packages/expo-image'], { encoding: 'utf8' })
      .trim().split('\n').map(file => file.replace('packages/expo-image/', '')).sort();
    const npmFiles = listFiles(publishedRoot);
    const gitSet = new Set(gitFiles), npmSet = new Set(npmFiles);
    const common = gitFiles.filter(file => npmSet.has(file));
    const gitOnly = gitFiles.filter(file => !npmSet.has(file));
    const npmOnly = npmFiles.filter(file => !gitSet.has(file));
    const changed = common.filter(file => !fs.readFileSync(path.join(packageRoot, file)).equals(fs.readFileSync(path.join(publishedRoot, file))));
    same({ git: gitFiles.length, npm: npmFiles.length, common: common.length }, { git: 199, npm: 217, common: 192 }, 'Changed Git/npm file counts');
    same(gitOnly, GIT_ONLY, 'Changed Git-only source files');
    same(npmOnly, NPM_ONLY, 'Changed npm-only published files');
    same(changed, ['expo-module.config.json', 'package.json'], 'Unexpected Git/npm byte differences');
    const gitPackage = readJson(path.join(packageRoot, 'package.json'));
    const npmPackage = readJson(path.join(publishedRoot, 'package.json'));
    const gitHead = npmPackage.gitHead; delete npmPackage.gitHead;
    same(npmPackage, gitPackage, 'npm package.json differs beyond gitHead');
    assert.equal(gitHead, FIXED_SOURCE.commit, 'Changed npm gitHead');
    assert.equal(gitPackage.name, FIXED_SOURCE.name); assert.equal(gitPackage.version, FIXED_SOURCE.version);
    same(gitPackage.dependencies, {}, 'expo-image must not gain direct dependencies');
    same(gitPackage.peerDependencies, { expo: '*', react: '*', 'react-native': '*', 'react-native-web': '*' }, 'Changed expo-image peer dependencies');
    assert.equal(gitPackage.plugin, undefined, 'Unexpected package config plugin field');
    const gitConfig = readJson(path.join(packageRoot, 'expo-module.config.json'));
    const npmConfig = readJson(path.join(publishedRoot, 'expo-module.config.json'));
    const publication = npmConfig.android.publication; delete npmConfig.android.publication;
    same(npmConfig, gitConfig, 'npm module config differs beyond Android publication');
    same(publication, { groupId: 'BareExpo', artifactId: 'expo.modules.image', version: '3.0.11', repository: 'local-maven-repo' }, 'Changed Android publication');
    assert.ok(!gitFiles.includes('app.plugin.js') && !gitFiles.some(file => file.startsWith('plugin/')), 'Unexpected config plugin');
    return {
      identity, package: { main: gitPackage.main, types: gitPackage.types, peerDependencies: gitPackage.peerDependencies },
      moduleConfig: gitConfig,
      publicationComparison: { gitFiles: gitFiles.length, npmFiles: npmFiles.length, commonFiles: common.length, unchangedCommonFiles: common.length - changed.length, changedCommonFiles: changed, gitOnly, npmOnly },
      configPlugin: { present: false, evidence: 'No app.plugin.js, package plugin field, or plugin/ source directory' },
    };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function pngSize(bytes) {
  assert.ok(bytes.subarray(1, 4).equals(Buffer.from('PNG')), 'Expected PNG resource');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function numberProperty(object, name) {
  const property = object?.properties.find(node => ts.isPropertyAssignment(node) && nameOf(node, object.getSourceFile()) === name);
  assert.ok(property && ts.isNumericLiteral(property.initializer), `Missing numeric style ${name}`);
  return Number(property.initializer.text);
}

export function extractDefaultPageUsage(text, file) {
  const source = sourceFile(file, text);
  const imageImport = source.statements.find(statement => ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === 'expo-image');
  assert.ok(imageImport?.importClause?.namedBindings && ts.isNamedImports(imageImport.importClause.namedBindings)
    && imageImport.importClause.namedBindings.elements.some(element => element.name.text === 'Image'), `Missing expo-image Image import in ${file}`);
  let usage = null;
  const styles = new Map();
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(source) === 'StyleSheet'
      && node.expression.name.text === 'create' && ts.isObjectLiteralExpression(node.arguments[0])) {
      for (const property of node.arguments[0].properties) if (ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer)) styles.set(nameOf(property, source), property.initializer);
    }
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'Image') {
      const sourceAttribute = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'source');
      const expression = sourceAttribute?.initializer?.expression;
      if (ts.isCallExpression(expression) && expression.expression.getText(source) === 'require' && ts.isStringLiteral(expression.arguments[0])) {
        const styleAttribute = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'style');
        usage = { asset: expression.arguments[0].text, styleExpression: styleAttribute?.initializer?.expression ?? null };
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(usage, `Missing local PNG Image usage in ${file}`);
  let style = usage.styleExpression;
  if (ts.isPropertyAccessExpression(style) && style.expression.getText(source) === 'styles') style = styles.get(style.name.text);
  assert.ok(ts.isObjectLiteralExpression(style), `Unresolved Image style in ${file}`);
  return { source: usage.asset, display: { width: numberProperty(style, 'width'), height: numberProperty(style, 'height') } };
}

export function verifyDefaultProject(defaultProject) {
  const manifestFile = path.join(defaultProject, 'package.json');
  const manifest = readJson(manifestFile);
  assert.equal(manifest.dependencies?.['expo-image'], FIXED_SOURCE.version, 'default must retain expo-image 3.0.11');
  assert.equal(manifest.main, 'expo-router/entry', 'default entry changed');
  return {
    manifest: { path: 'package.json', sha256: digest(fs.readFileSync(manifestFile)), dependency: manifest.dependencies['expo-image'], main: manifest.main },
    pages: DEFAULT_PAGE_REQUIREMENTS.map(expected => {
      const pageFile = path.join(defaultProject, expected.page), assetFile = path.join(defaultProject, expected.asset);
      const pageBytes = fs.readFileSync(pageFile), assetBytes = fs.readFileSync(assetFile);
      assert.equal(digest(pageBytes), expected.pageSha256, `Original default page changed: ${expected.page}`);
      const usage = extractDefaultPageUsage(pageBytes.toString(), expected.page);
      same(usage, { source: expected.source, display: expected.display }, `Changed default Image usage: ${expected.page}`);
      assert.equal(digest(assetBytes), expected.assetSha256, `Changed default image resource: ${expected.asset}`);
      same(pngSize(assetBytes), expected.pixels, `Changed default image dimensions: ${expected.asset}`);
      return { ...expected, usage: 'local PNG numeric require resource' };
    }),
  };
}

export function assertFailureBaseline({ moduleConfig, acceptance, log }) {
  assert.ok(!moduleConfig.platforms?.includes('harmony') && !moduleConfig.harmony, 'Old failure evidence is stale after Harmony module registration');
  assert.equal(acceptance.overallAcceptance, 'FAIL', 'default failure acceptance changed');
  assert.match(acceptance.reason, /cold restart/i, 'Missing cold restart failure conclusion');
  const screens = acceptance.screens.filter(screen => ['default-debug-first-screen', 'default-cold-restart-recaptured'].includes(screen.capture));
  assert.equal(screens.length, 2, 'Missing initial or cold-restart default capture');
  assert.ok(screens.every(screen => screen.passed && screen.expectedText === ERROR_TEXT), 'Default failure capture no longer matches ExpoImage error');
  const count = log.split(ERROR_TEXT).length - 1;
  assert.ok(count >= 2, 'ExpoImage registration error must be reproduced at least twice');
  return { error: ERROR_TEXT, occurrences: count, captures: screens.map(screen => screen.capture) };
}

function verifyFailureEvidence(defaultEvidence) {
  const config = readJson(path.join(defaultEvidence, 'default-expo-image-module-config.json'));
  const acceptanceFile = path.join(defaultEvidence, 'acceptance-result.json');
  const acceptance = readJson(acceptanceFile);
  const log = fs.readFileSync(path.join(defaultEvidence, 'default-debug-hilog.txt'), 'utf8');
  const baseline = assertFailureBaseline({ moduleConfig: config, acceptance, log });
  const index = readJson(path.join(defaultEvidence, 'artifact-index.json'));
  const receipts = index.files.filter(row => EVIDENCE_HASHES[row.path]);
  assert.equal(receipts.length, Object.keys(EVIDENCE_HASHES).length, 'Missing indexed ExpoImage evidence artifact');
  for (const [file, expected] of Object.entries(EVIDENCE_HASHES)) {
    assert.equal(receipts.find(row => row.path === file)?.sha256, expected, `Artifact index mismatch: ${file}`);
    assert.equal(digest(fs.readFileSync(path.join(defaultEvidence, file))), expected, `Artifact bytes mismatch: ${file}`);
  }
  return {
    ...baseline, overallAcceptance: acceptance.overallAcceptance, reason: acceptance.reason,
    modulePlatforms: config.platforms, artifacts: Object.entries(EVIDENCE_HASHES).map(([file, sha256]) => ({ file, sha256 })),
    acceptanceResult: { file: 'acceptance-result.json', sha256: digest(fs.readFileSync(acceptanceFile)) },
  };
}

function sourceFiles(packageRoot) {
  const read = name => fs.readFileSync(path.join(packageRoot, 'src', name), 'utf8');
  return { index: read('index.ts'), types: read('Image.types.ts'), image: read('Image.tsx'), nativeView: read('ExpoImage.tsx'), nativeModule: read('ImageModule.ts'), useImage: read('useImage.ts') };
}

export function buildEvidence({ sourceRepo, archive, defaultProject, defaultEvidence }) {
  const source = comparePublishedSource(sourceRepo, archive);
  const publicContract = assertFrozenPublicContract(extractPublicContract(sourceFiles(path.join(sourceRepo, 'packages/expo-image'))));
  const defaultUsage = verifyDefaultProject(defaultProject);
  const failureBaseline = verifyFailureEvidence(defaultEvidence);
  return {
    format: 'sdk54-a06-expo-image-contract-v1', task: 'A-06', package: 'expo-image', version: FIXED_SOURCE.version,
    implementationStatus: 'NOT_STARTED', preparationStatus: 'PASS', stageClosable: false,
    source, publicContract, defaultUsage, failureBaseline,
    acceptanceAssertions: [
      'ExpoImage/default registration error is absent from a fresh default run',
      'Original default pages and both local PNG resources remain unchanged and render visible image content',
      'Image load failure is observable through onError and onLoadEnd',
      'Unmount and reload do not deliver stale callbacks',
      'GI unblock, expo-image module completion, and M7.4 completion remain separate decisions',
    ],
    boundaries: [
      'No packages/expo-image Harmony implementation is introduced by A-06',
      'The recorded nova16 result is a fixed failure baseline, not a passing device result',
      'No config plugin exists in expo-image 3.0.11; this record does not invent one',
      'A-06 does not close GI, expo-image, M7.4, or any release stage',
    ],
  };
}

function options(args) {
  const result = { check: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--check') result.check = true;
    else {
      assert.ok(argument.startsWith('--') && args[index + 1], `Unknown or incomplete option: ${argument}`);
      result[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = args[++index];
    }
  }
  for (const name of ['sourceRepo', 'archive', 'defaultProject', 'defaultEvidence', 'output']) assert.ok(result[name], `Missing --${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`);
  return result;
}

export function main(args) {
  const input = options(args);
  const result = buildEvidence(input);
  const bytes = JSON.stringify(result, null, 2) + '\n';
  if (input.check) assert.equal(digest(fs.readFileSync(input.output)), digest(bytes), `Generated ExpoImage evidence differs: ${input.output}`);
  else fs.writeFileSync(input.output, bytes);
  console.log(JSON.stringify({ task: result.task, preparationStatus: result.preparationStatus, implementationStatus: result.implementationStatus, stageClosable: result.stageClosable }));
  return result;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main(process.argv.slice(2));
