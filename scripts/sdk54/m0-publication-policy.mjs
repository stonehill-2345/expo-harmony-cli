import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(new URL('../../apps/cli/package.json', import.meta.url));
const packlist = require('npm-packlist');
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const policyNames = new Set(['package.json', '.npmignore', '.gitignore']);
const sha256 = text => createHash('sha256').update(text).digest('hex');

function assertSafePath(file) {
  if (typeof file !== 'string' || !file || file.includes('\\') || file.includes('\0') || path.posix.isAbsolute(file) || path.posix.normalize(file) !== file || file.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe publication tree path: ${file}`);
  }
}

function normalizedManifest(manifest, packageName) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
  if (manifest.files !== undefined && (!Array.isArray(manifest.files) || manifest.files.some(file => typeof file !== 'string'))) return null;
  if (manifest.bin !== undefined && typeof manifest.bin !== 'string' && (!manifest.bin || typeof manifest.bin !== 'object' || Array.isArray(manifest.bin) || Object.values(manifest.bin).some(file => typeof file !== 'string'))) return null;
  if (manifest.main !== undefined && typeof manifest.main !== 'string') return null;
  // npm-packlist receives normalized bin and bundle fields from npm's package tree.
  const bin = typeof manifest.bin === 'string' ? { [packageName.split('/').at(-1)]: manifest.bin } : manifest.bin;
  return { ...manifest, bin, bundleDependencies: [] };
}

export async function projectPublicationFiles({ packages, treeEntries, files }) {
  for (const entry of treeEntries) assertSafePath(entry.path);
  const entries = [...treeEntries].sort((left, right) => compare(left.path, right.path));
  const result = [];
  for (const descriptor of [...packages].sort((left, right) => compare(left.id, right.id))) {
    assertSafePath(descriptor.sourcePath);
    const root = path.posix.dirname(descriptor.sourcePath);
    const prefix = root === '.' ? '' : `${root}/`;
    const packageEntries = entries.filter(entry => entry.path.startsWith(prefix));
    const row = { packageId: descriptor.id, files: [], policyInputs: [], boundaries: [], acceptance: 'SOURCE_TREE_PROJECTION_ONLY' };
    result.push(row);
    const regularEntries = [];
    let unavailablePolicy = false;
    for (const entry of packageEntries) {
      if (entry.mode === '120000') {
        row.boundaries.push({ kind: 'SYMLINK_NOT_FOLLOWED', path: entry.path });
        continue;
      }
      if (entry.type !== 'blob') {
        if (entry.type !== 'tree') row.boundaries.push({ kind: 'NON_BLOB_TREE_ENTRY', path: entry.path });
        continue;
      }
      regularEntries.push(entry);
      if (!policyNames.has(path.posix.basename(entry.path))) continue;
      const text = files.get(entry.path);
      if (typeof text !== 'string') {
        row.boundaries.push({ kind: 'POLICY_TEXT_UNAVAILABLE', path: entry.path });
        unavailablePolicy = true;
      } else row.policyInputs.push({ path: entry.path, sha256: sha256(text) });
    }
    if (!regularEntries.some(entry => entry.path === descriptor.sourcePath)) {
      row.boundaries.push({ kind: 'MANIFEST_NOT_IN_TREE', path: descriptor.sourcePath });
      continue;
    }
    let manifest;
    const manifestText = files.get(descriptor.sourcePath);
    if (typeof manifestText === 'string') {
      try {
        manifest = JSON.parse(manifestText.replace(/^\uFEFF/, ''));
      } catch {
        row.boundaries.push({ kind: 'MANIFEST_INVALID', path: descriptor.sourcePath });
      }
    }
    if (manifest && (manifest.bundleDependencies === true || manifest.bundledDependencies === true || manifest.bundleDependencies?.length || manifest.bundledDependencies?.length)) {
      row.boundaries.push({ kind: 'BUNDLED_DEPENDENCIES_NOT_PROJECTED', path: descriptor.sourcePath });
    }
    const normalized = manifest && normalizedManifest(manifest, descriptor.name);
    if (manifest !== undefined && !normalized && !row.boundaries.some(boundary => boundary.kind === 'MANIFEST_INVALID')) {
      row.boundaries.push({ kind: 'MANIFEST_INVALID', path: descriptor.sourcePath });
    }
    if (unavailablePolicy || !normalized) continue;
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sdk54-publication-policy-'));
    try {
      const mirroredPaths = new Set();
      for (const entry of regularEntries) {
        const relative = entry.path.slice(prefix.length);
        const destination = path.join(temporaryRoot, relative);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, policyNames.has(path.posix.basename(entry.path)) ? files.get(entry.path) : '');
        mirroredPaths.add(relative);
      }
      const projected = await packlist({ path: temporaryRoot, package: normalized, isProjectRoot: true, workspaces: null, edgesOut: new Map() });
      row.files = [...projected].filter(file => mirroredPaths.has(file)).map(file => `${prefix}${file}`).sort(compare);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
    row.boundaries.sort((left, right) => compare(left.kind, right.kind) || compare(left.path ?? '', right.path ?? ''));
  }
  return result;
}
