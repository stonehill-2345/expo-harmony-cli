import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { list, extract } from 'tar';
import { CREATION_TEMPLATES, createTemplateManifest, validateCreationTemplate, packCreationTemplates } from '../creation-catalog.mjs';
import { RELEASE_PACKAGES } from '../release-catalog.mjs';

const upstream = (template) => ({
  name: `expo-template-${template}`,
  version: template === 'default' ? '54.0.63' : '54.0.47',
  main: template === 'default' ? 'expo-router/entry' : 'index.ts',
  scripts: { start: 'expo start' },
  dependencies: { expo: '~54.0.37', react: '19.1.0', 'react-native': '0.81.5', ...(template === 'default' ? { 'expo-image': '~3.0.11' } : {}) },
  devDependencies: { typescript: '~5.9.2' },
});

test('creation templates declare release aliases and target dependencies before creation', () => {
  for (const template of ['default', 'blank-typescript']) {
    const source = upstream(template);
    const manifest = createTemplateManifest(source, template);
    assert.equal(source.dependencies.react, '19.1.0');
    assert.equal(manifest.name, CREATION_TEMPLATES[template].name);
    assert.equal(manifest.version, CREATION_TEMPLATES[template].version);
    assert.equal(manifest.private, true);
    assert.equal(manifest.dependencies.react, '19.1.1');
    assert.equal(manifest.dependencies['react-native'], '0.82.1');
    assert.equal(manifest.dependencies['@react-native-oh/react-native-harmony'], '0.82.30');
    for (const item of RELEASE_PACKAGES.filter(p => template === 'default' || !['expo-router', 'expo-web-browser', 'expo-image', '@react-native-ohos/react-native-screens'].includes(p.installName))) {
      assert.equal(manifest.dependencies[item.installName], item.installSpec);
    }
    assert.equal(manifest.scripts.harmony, 'expo run:harmony');
    assert.equal(manifest.scripts.postinstall, undefined);
    assert.equal(manifest.dependencies['patch-package'], undefined);
  }
});

test('default keeps expo-image and original entry; unknown source identity is rejected', () => {
  const manifest = createTemplateManifest(upstream('default'), 'default');
  assert.equal(manifest.dependencies['expo-image'], 'npm:@expo-oh/expo-image@3.0.12');
  assert.equal(createTemplateManifest(upstream('blank-typescript'), 'blank-typescript').dependencies['expo-image'], undefined);
  assert.equal(manifest.main, 'expo-router/entry');
  assert.throws(() => createTemplateManifest({ ...upstream('default'), version: '55.0.0' }, 'default'), /identity/i);
  assert.throws(() => createTemplateManifest(upstream('default'), 'unknown'), /template/i);
});

test('real template packing is repeatable and preserves app bytes without native or state injection', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm0a-templates-'));
  try {
    const first = await packCreationTemplates({ rootDir: process.cwd(), outputDir });
    const second = await packCreationTemplates({ rootDir: process.cwd(), outputDir: path.join(outputDir, 'repeat') });
    assert.equal(first.packages.length, 2);
    assert.deepEqual(first.packages.map(p => p.sha256), second.packages.map(p => p.sha256));
    for (const item of first.packages) {
      const entries = [];
      await list({ file: path.join(outputDir, item.file), onReadEntry: entry => entries.push(entry.path) });
      assert.ok(entries.includes('package/package.json'));
      assert.ok(!entries.some(file => /(?:^|\/)(?:node_modules|harmony|\.expo-harmony|patches)(?:\/|$)/.test(file)));
      const unpacked = path.join(outputDir, item.template);
      fs.mkdirSync(unpacked);
      await extract({ file: path.join(outputDir, item.file), cwd: unpacked });
      const manifest = JSON.parse(fs.readFileSync(path.join(unpacked, 'package/package.json')));
      assert.equal(manifest.dependencies.expo, 'npm:@expo-oh/expo@54.0.38');
      assert.equal(manifest.private, false);
      const app = item.template === 'default' ? 'app/(tabs)/index.tsx' : 'App.tsx';
      assert.deepEqual(fs.readFileSync(path.join(unpacked, 'package', app)), fs.readFileSync(path.join('templates', `expo-template-${item.template}`, app)));
      if (item.template === 'default') assert.match(fs.readFileSync(path.join(unpacked, 'package', app), 'utf8'), /from 'expo-image'/);
    }
  } finally { fs.rmSync(outputDir, { recursive: true, force: true }); }
});

test('template validation rejects missing entry, missing start and undeclared dependencies', () => {
  const original = JSON.parse(fs.readFileSync('templates/expo-template-default/package.json'));
  const mutations = [
    manifest => { delete manifest.main; },
    manifest => { delete manifest.scripts.start; },
    manifest => { manifest.dependencies.unexpected = '1.0.0'; },
  ];
  for (const mutate of mutations) {
    const manifest = structuredClone(original);
    mutate(manifest);
    assert.throws(() => validateCreationTemplate(manifest, 'default'), /manifest|entry|mapping/i);
  }
});

test('packing rejects missing, changed or hidden original application content', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm0a-template-mutations-'));
  const templateDir = path.join(rootDir, 'templates/expo-template-default');
  const mutations = [
    () => fs.rmSync(path.join(templateDir, 'app/(tabs)/index.tsx')),
    () => fs.appendFileSync(path.join(templateDir, 'app/(tabs)/index.tsx'), '\n// changed\n'),
    () => fs.appendFileSync(path.join(templateDir, '.npmignore'), '\nassets/\n'),
  ];
  try {
    for (const mutate of mutations) {
      fs.rmSync(path.join(rootDir, 'templates'), { recursive: true, force: true });
      fs.cpSync('templates', path.join(rootDir, 'templates'), { recursive: true });
      mutate();
      await assert.rejects(packCreationTemplates({ rootDir, outputDir: path.join(rootDir, 'packed') }), /source|content|missing|files/i);
    }
  } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
});
