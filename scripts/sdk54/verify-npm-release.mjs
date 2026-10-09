import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { extract } from 'tar';
import { pathToFileURL } from 'node:url';
import { RELEASE_ID, RELEASE_PACKAGES, rewriteReleaseManifest, createReleaseManifest } from './release-catalog.mjs';

export async function verifyRelease(directory, rootDir = process.cwd()) {
  const report = JSON.parse(fs.readFileSync(path.join(directory, 'release.json')));
  const failures = [...report.failures];
  if (report.release !== RELEASE_ID || report.packages.length !== RELEASE_PACKAGES.length) failures.push('Incomplete release set');
  for (const descriptor of RELEASE_PACKAGES) {
    const item = report.packages.find(p => p.name === descriptor.publishName);
    if (!item) { failures.push(`Missing ${descriptor.publishName}`); continue; }
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-oh-verify-'));
    try {
      if (path.basename(item.file) !== item.file) throw new Error('Unsafe archive filename');
      const archive = path.join(directory, item.file);
      const integrity = `sha512-${crypto.createHash('sha512').update(fs.readFileSync(archive)).digest('base64')}`;
      if (integrity !== item.integrity) throw new Error('Integrity mismatch');
      await extract({ file: archive, cwd: stage, strict: true });
      const root = path.join(stage, 'package');
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
      if (manifest.name !== descriptor.publishName || manifest.version !== descriptor.publishVersion || manifest.private !== false) throw new Error('Incorrect package identity');
      if (descriptor.relativePath) {
        const expected = rewriteReleaseManifest(JSON.parse(fs.readFileSync(path.join(rootDir, descriptor.relativePath, 'package.json'))));
        for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta']) {
          if (JSON.stringify(manifest[key]) !== JSON.stringify(expected[key])) throw new Error(`Incorrect ${key}`);
        }
      }
      for (const section of ['dependencies', 'optionalDependencies']) {
        for (const spec of Object.values(manifest[section] ?? {})) if (/^(file:|workspace:|link:)/.test(spec)) throw new Error(`Local dependency: ${spec}`);
      }
      const required = [manifest.main, manifest.types, ...Object.values(typeof manifest.bin === 'string' ? { bin: manifest.bin } : manifest.bin ?? {}), ...(descriptor.runtime?.requiredFiles.map(p => p.path) ?? []), ...(createReleaseManifest().packages.find(p => p.installName === descriptor.installName)?.requiredFiles ?? [])].filter(Boolean);
      const configFile = path.join(root, 'expo-module.config.json');
      if (fs.existsSync(configFile)) {
        const harmony = JSON.parse(fs.readFileSync(configFile)).harmony;
        if (harmony?.ets?.entrypoint) required.push(harmony.ets.entrypoint);
        if (harmony?.cpp?.cmakePath) required.push(`${harmony.cpp.cmakePath}/CMakeLists.txt`);
      }
      for (const file of required) if (!['', '.js', '.ts', '.tsx', '/index.js', '/index.ts', '.d.ts'].some(ext => fs.existsSync(path.join(root, file + ext)))) throw new Error(`Missing runtime entry: ${file}`);
      if (!fs.readdirSync(root).some(file => /^licen[sc]e(?:\.md|\.txt)?$/i.test(file))) throw new Error('Missing license');
      if (descriptor.installName === 'expo') {
        const { cliVersion: _actualCliVersion, ...actualRuntime } = JSON.parse(fs.readFileSync(path.join(root, 'harmony-release.json')));
        const { cliVersion: _expectedCliVersion, ...expectedRuntime } = createReleaseManifest();
        if (JSON.stringify(actualRuntime) !== JSON.stringify(expectedRuntime)) throw new Error('Stale runtime release metadata');
      }
    } catch (error) { failures.push(`${descriptor.publishName}: ${error.message}`); }
    finally { fs.rmSync(stage, { recursive: true, force: true }); }
  }
  return failures;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const failures = await verifyRelease(path.resolve(process.argv[2] ?? 'outputs/sdk54/npm-release'));
  console.log(JSON.stringify({ failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}
