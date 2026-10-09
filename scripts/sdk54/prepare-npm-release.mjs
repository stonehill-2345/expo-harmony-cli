import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { create, extract } from 'tar';
import packlist from 'npm-packlist';
import { stageBuildAndPack } from './pack-packages.mjs';
import { RELEASE_ID, SCREENS_UPSTREAM_INTEGRITY, RELEASE_PACKAGES, rewriteReleaseManifest, createReleaseManifest } from './release-catalog.mjs';
import { applyScreensOverlay } from './generate-external-screens-patch.mjs';

export async function transformPackage(directory, source) {
  const manifest = rewriteReleaseManifest(source);
  if (!fs.readdirSync(directory).some(file => /^licen[sc]e(?:\.md|\.txt)?$/i.test(file))) {
    const license = source.name === '@react-native-ohos/react-native-screens' ? 'react-native-ohos-screens-ISC' : 'expo-LICENSE';
    fs.copyFileSync(new URL(`./licenses/${license}`, import.meta.url), path.join(directory, 'LICENSE'));
  }
  if (source.name === 'expo') {
    fs.writeFileSync(path.join(directory, 'harmony-release.json'), `${JSON.stringify(createReleaseManifest(), null, 2)}\n`);
    manifest.files = [...(manifest.files ?? []), 'harmony-release.json'];
  }
  const descriptor = RELEASE_PACKAGES.find(p => p.installName === source.name);
  const readme = path.join(directory, 'README.md');
  const originalReadme = fs.existsSync(readme) ? fs.readFileSync(readme, 'utf8') : '';
  fs.writeFileSync(readme, `# ${descriptor.publishName}\n\nHarmonyOS adaptation of ${descriptor.installName}@${descriptor.upstreamVersion}.\n\nInstall using the original dependency key:\n\n\`npm install --save-exact ${descriptor.installName}@${descriptor.installSpec}\`\n\nRelease: ${RELEASE_ID}. See the repository release plan for supported capabilities. Upstream documentation follows.\n\n${originalReadme}`);
  fs.writeFileSync(path.join(directory, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function packDirectory(directory, file) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
  const files = await packlist({ path: directory, package: manifest, isProjectRoot: true, edgesOut: new Map() });
  await create({ cwd: directory, file, gzip: true, portable: true, mtime: new Date('2000-01-01T00:00:00Z'), prefix: 'package/' }, files.sort());
}

export async function prepareRelease({ rootDir, outputDir, screensArchive }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const previousReport = path.join(outputDir, 'release.json');
  if (fs.existsSync(previousReport)) {
    const previous = JSON.parse(fs.readFileSync(previousReport));
    for (const item of previous.packages ?? []) {
      if (path.basename(item.file) === item.file) fs.rmSync(path.join(outputDir, item.file), { force: true });
    }
  }
  const report = { release: RELEASE_ID, packages: [], failures: [] };
  for (const descriptor of RELEASE_PACKAGES) {
    const file = `${descriptor.publishName.replace('@', '').replace('/', '-')}-${descriptor.publishVersion}.tgz`;
    const archive = path.join(outputDir, file);
    try {
      if (!descriptor.relativePath) {
        if (!screensArchive) throw new Error('Supply --screens-archive with the verified upstream screens@4.9.0 tarball');
        const integrity = `sha512-${crypto.createHash('sha512').update(fs.readFileSync(screensArchive)).digest('base64')}`;
        if (integrity !== SCREENS_UPSTREAM_INTEGRITY) throw new Error('Screens upstream integrity mismatch');
        const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-oh-screens-'));
        try {
          await extract({ file: screensArchive, cwd: stage, strict: true });
          const directory = path.join(stage, 'package');
          const source = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
          applyScreensOverlay(directory);
          await transformPackage(directory, source);
          await packDirectory(directory, archive);
        } finally { fs.rmSync(stage, { recursive: true, force: true }); }
      } else {
        await stageBuildAndPack({ rootDir, outputDir, descriptor, transform: transformPackage, archiveFile: file });
      }
      report.packages.push({ installName: descriptor.installName, name: descriptor.publishName, version: descriptor.publishVersion, batch: descriptor.batch, file,
        integrity: `sha512-${crypto.createHash('sha512').update(fs.readFileSync(archive)).digest('base64')}` });
    } catch (error) { report.failures.push(`${descriptor.publishName}: ${error.message}`); }
  }
  if (screensArchive) report.screensUpstreamIntegrity = `sha512-${crypto.createHash('sha512').update(fs.readFileSync(screensArchive)).digest('base64')}`;
  fs.writeFileSync(path.join(outputDir, 'release.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
  const report = await prepareRelease({ rootDir: process.cwd(), outputDir: path.resolve(value('--output', 'outputs/sdk54/npm-release')), screensArchive: value('--screens-archive') });
  console.log(JSON.stringify(report, null, 2));
  if (report.failures.length) process.exitCode = 1;
}
