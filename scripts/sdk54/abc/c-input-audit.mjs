import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyFixedSource } from '../a-rebuild-source-evidence.mjs';
import { args, read, save, sha256, newOutput, html } from './c-evidence-lib.mjs';

function verify(file, expected, label) {
  assert.ok(fs.existsSync(file) && fs.statSync(file).isFile(), `Missing ${label}: ${file}`);
  const bytes = fs.readFileSync(file), hash = sha256(bytes);
  assert.equal(bytes.length, expected.bytes, `${label} size mismatch`);
  assert.equal(hash, expected.sha256, `${label} hash mismatch`);
  return { originalPath: expected.path, localPath: fs.realpathSync(file), bytes: bytes.length, sha256: hash, status: 'EXACT_BYTES_VERIFIED' };
}

export function auditInputs(inputs, reconstruction, manifestFile) {
  const packageManifest = read(manifestFile);
  const packageFiles = packageManifest.files.map(row => verify(path.join(inputs, row.path), row, 'portable input'));
  const reconstructionManifestFile = path.join(reconstruction, 'reconstruction-manifest.json');
  const reconstructionManifest = read(reconstructionManifestFile), reconstructedFiles = [];
  for (const row of reconstructionManifest.files) reconstructedFiles.push(verify(path.join(reconstruction, row.path), row, 'reconstruction input'));
  const tree = verifyFixedSource(path.join(reconstruction, 'expo-official.git'));
  const archivePaths = read(path.join(reconstruction, 'archives.json')).map(row => {
    const local = path.join(reconstruction, 'archives', path.basename(row.file));
    const bytes = fs.readFileSync(local), hash = sha256(bytes);
    assert.equal(hash, row.integrityVerification.sha256, `Archive mapping hash mismatch: ${row.file}`);
    return { originalPath: row.file, localPath: fs.realpathSync(local), bytes: bytes.length, sha256: hash,
      status: 'ORIGINAL_PATH_MAPPED_TO_EXACT_LOCAL_BYTES' };
  });
  return { schemaVersion: 1, sourceIdentity: { revision: '5b42e3d21e0ac5e086752361ca8a5cb4de53bec1', tree: tree.tree },
    portableInputs: packageFiles, reconstructionManifest: { path: reconstructionManifestFile, sha256: sha256(fs.readFileSync(reconstructionManifestFile)) },
    reconstructedFiles, pathMappings: archivePaths,
    classifications: {
      newSourceReconstruction: reconstructedFiles.map(row => row.originalPath),
      restoredOriginals: packageFiles.map(row => row.originalPath),
      missingHistoricalEvidence: ['B historical npm/debug', 'B historical npm/release', 'B historical pnpm/debug'],
    },
    historicalAcceptanceRestored: false, valid: true };
}

export function main(argv) {
  const a = args(argv, ['inputs', 'reconstruction', 'manifest', 'output']);
  for (const key of ['inputs', 'reconstruction', 'manifest', 'output']) assert.ok(a[key], `Missing --${key}`);
  const output = newOutput(a.output), result = auditInputs(a.inputs, a.reconstruction, a.manifest);
  save(path.join(output, 'c-input-audit.json'), result);
  fs.writeFileSync(path.join(output, 'report.html'), html('SDK54 C 输入审计', result), { flag: 'wx' });
  return 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = main(process.argv.slice(2));
