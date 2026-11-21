import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { create } from 'tar';
import packlist from 'npm-packlist';
import { RELEASE_PACKAGES, createReleaseManifest } from './release-catalog.mjs';

const sourceInventory = JSON.parse(fs.readFileSync(new URL('./creation-template-sources.json', import.meta.url)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export const CREATION_TEMPLATES = Object.freeze({
  default: Object.freeze({ name: '@expo-oh/expo-template-default', version: '54.0.65', upstreamVersion: '54.0.63' }),
  'blank-typescript': Object.freeze({ name: '@expo-oh/expo-template-blank-typescript', version: '54.0.49', upstreamVersion: '54.0.47' }),
});

export function createTemplateManifest(source, template) {
  const descriptor = CREATION_TEMPLATES[template];
  assert.ok(descriptor, `Unsupported creation template: ${template}`);
  assert.ok(source.name === `expo-template-${template}` && source.version === descriptor.upstreamVersion,
    `Unexpected template source identity: ${source.name}@${source.version}`);
  const release = createReleaseManifest();
  const contract = release.templates[template];
  const dependencies = { ...source.dependencies, ...contract.dependencies };
  for (const name of contract.expoPackages) {
    const item = RELEASE_PACKAGES.find(p => p.installName === name);
    assert.ok(item, `Missing template release mapping: ${name}`);
    dependencies[name] = item.installSpec;
  }
  for (const name of contract.externalPackages) {
    const item = RELEASE_PACKAGES.find(p => p.installName === name);
    dependencies[name] = item?.installSpec ?? release.catalog.external[name];
    assert.ok(dependencies[name], `Missing external template mapping: ${name}`);
  }
  return {
    ...structuredClone(source),
    name: descriptor.name,
    version: descriptor.version,
    private: true,
    scripts: { ...source.scripts, harmony: 'expo run:harmony' },
    dependencies,
    devDependencies: { ...source.devDependencies, ...contract.devDependencies },
  };
}

export function validateCreationTemplate(manifest, template) {
  const descriptor = CREATION_TEMPLATES[template];
  assert.ok(descriptor, `Unsupported creation template: ${template}`);
  const expected = createTemplateManifest(sourceInventory.templates[template].manifest, template);
  assert.deepEqual(manifest, expected, 'Template manifest differs from fixed source and release mapping');
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
      assert.ok(!/^(?:file:|link:|workspace:)/.test(spec), `Template contains local dependency: ${name}`);
      assert.notEqual(name, 'patch-package', 'Creation template must not install patches');
    }
  }
  assert.equal(manifest.scripts.postinstall, undefined, 'Creation template must not patch after installation');
}

function validateTemplateContent(sourceDir, template) {
  const expected = sourceInventory.templates[template].files;
  const actual = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      assert.ok(!entry.isSymbolicLink(), `Template source contains a symlink: ${file}`);
      if (entry.isDirectory()) visit(file);
      else {
        assert.ok(entry.isFile(), `Unexpected template source kind: ${file}`);
        actual.push(path.relative(sourceDir, file).split(path.sep).join('/'));
      }
    }
  }
  visit(sourceDir);
  assert.deepEqual(actual.sort(), expected.map(file => file.path).sort(), 'Template source files differ from fixed upstream');
  for (const file of expected.filter(file => file.path !== 'package.json')) {
    assert.equal(sha256(fs.readFileSync(path.join(sourceDir, file.path))), file.sha256,
      `Template source content changed: ${template}/${file.path}`);
  }
}

export async function packCreationTemplates({ rootDir, outputDir }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const packages = [];
  for (const [template, descriptor] of Object.entries(CREATION_TEMPLATES)) {
    const sourceDir = path.join(rootDir, 'templates', `expo-template-${template}`);
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'package.json')));
    validateCreationTemplate(manifest, template);
    validateTemplateContent(sourceDir, template);
    for (const forbidden of ['harmony', 'node_modules', '.expo-harmony', 'patches']) {
      assert.ok(!fs.existsSync(path.join(sourceDir, forbidden)), `Unexpected template content: ${forbidden}`);
    }
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-oh-template-'));
    try {
      fs.cpSync(sourceDir, stage, { recursive: true });
      const published = { ...manifest, private: false };
      fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(published, null, 2) + '\n');
      const files = await packlist({ path: stage, package: published, isProjectRoot: true, edgesOut: new Map() });
      const file = `${descriptor.name.replace('@', '').replace('/', '-')}-${descriptor.version}.tgz`;
      const archive = path.join(outputDir, file);
      await create({ cwd: stage, file: archive, prefix: 'package/', gzip: true, portable: true, mtime: new Date('2000-01-01T00:00:00Z') }, files.sort());
      const bytes = fs.readFileSync(archive);
      packages.push({ template, name: descriptor.name, version: descriptor.version, file,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
        files: files.sort(),
      });
    } finally { fs.rmSync(stage, { recursive: true, force: true }); }
  }
  const report = { schemaVersion: 1, sourceRevision: '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1', packages };
  fs.writeFileSync(path.join(outputDir, 'templates.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 2 && args[0] === '--output', 'Usage: creation-catalog.mjs --output <directory>');
  console.log(JSON.stringify(await packCreationTemplates({ rootDir: process.cwd(), outputDir: path.resolve(args[1]) }), null, 2));
}
