import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';

export function gitBytes(kind, bytes) {
  return Buffer.concat([Buffer.from(`${kind} ${bytes.length}\0`), bytes]);
}

export function verifyGitObject(kind, bytes, expected) {
  const raw = gitBytes(kind, bytes);
  assert.equal(createHash('sha1').update(raw).digest('hex'), expected, `Official ${kind} object mismatch: ${expected}`);
  return raw;
}

function store(repository, kind, bytes, expected) {
  const raw = verifyGitObject(kind, bytes, expected);
  const file = path.join(repository, 'objects', expected.slice(0, 2), expected.slice(2));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, deflateSync(raw), { flag: 'wx' });
}

// GitHub's JSON dates normalize the timezone. Recover it only if the complete
// reconstructed commit bytes match the already pinned Git SHA-1 exactly.
export function recoverCommit(commit) {
  const offsets = ['+0000', '-0700', '-0800', '-0400', '-0500', '+0800'];
  for (const sign of ['+', '-']) for (let minutes = 0; minutes <= 840; minutes += 15) {
    const offset = `${sign}${String(Math.floor(minutes / 60)).padStart(2, '0')}${String(minutes % 60).padStart(2, '0')}`;
    if (!offsets.includes(offset)) offsets.push(offset);
  }
  const person = (value, offset) => `${value.name} <${value.email}> ${Date.parse(value.date) / 1000} ${offset}`;
  const prefix = `tree ${commit.tree.sha}\n` + commit.parents.map(parent => `parent ${parent.sha}\n`).join('');
  for (const suffix of ['', '\n', '\n\n']) for (const author of offsets) for (const committer of offsets) {
    const bytes = Buffer.from(`${prefix}author ${person(commit.author, author)}\ncommitter ${person(commit.committer, committer)}\n\n${commit.message}${suffix}`);
    if (createHash('sha1').update(gitBytes('commit', bytes)).digest('hex') === commit.sha) return bytes;
  }
  throw new Error('Cannot recover exact commit bytes; use official Git transport');
}

export async function fetchFixedSource(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const repository = path.join(directory, 'expo-official.git');
  if (!fs.existsSync(repository)) execFileSync('git', ['init', '--bare', repository]);
  const json = async (file, url) => {
    if (!fs.existsSync(file)) {
      const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
      assert.ok(response.ok, `Official API HTTP ${response.status}`);
      fs.writeFileSync(file, await response.text(), { flag: 'wx' });
    }
    return JSON.parse(fs.readFileSync(file));
  };
  const commit = await json(path.join(directory, 'official-commit.json'), `https://api.github.com/repos/expo/expo/git/commits/${SDK54_EXPO_COMMIT}`);
  assert.equal(commit.sha, SDK54_EXPO_COMMIT);
  assert.equal(commit.tree.sha, '5457e824b21d968e55c8f533cdf1751860160a92');
  const tree = await json(path.join(directory, 'official-tree.json'), `https://api.github.com/repos/expo/expo/git/trees/${commit.tree.sha}?recursive=1`);
  assert.equal(tree.truncated, false, 'Truncated official tree');
  assert.equal(tree.sha, commit.tree.sha);
  const directories = new Map([['', { oid: tree.sha, children: [] }]]);
  for (const row of tree.tree) {
    assert.ok(!path.posix.isAbsolute(row.path) && path.posix.normalize(row.path) === row.path && !row.path.split('/').includes('..'), 'Unsafe official path');
    if (row.type === 'tree') directories.set(row.path, { oid: row.sha, children: [] });
  }
  for (const row of tree.tree) directories.get(path.posix.dirname(row.path) === '.' ? '' : path.posix.dirname(row.path)).children.push(row);
  for (const directory of directories.values()) {
    directory.children.sort((a, b) => Buffer.compare(Buffer.from(path.posix.basename(a.path) + (a.type === 'tree' ? '/' : '')), Buffer.from(path.posix.basename(b.path) + (b.type === 'tree' ? '/' : ''))));
    const bytes = Buffer.concat(directory.children.flatMap(row => [Buffer.from(`${row.mode.replace(/^0+/, '')} ${path.posix.basename(row.path)}\0`), Buffer.from(row.sha, 'hex')]));
    store(repository, 'tree', bytes, directory.oid);
  }
  store(repository, 'commit', recoverCommit(commit), commit.sha);
  fs.writeFileSync(path.join(repository, 'shallow'), commit.sha + '\n');
  const ordinary = tree.tree.filter(row => row.type === 'blob' && ['100644', '100755'].includes(row.mode));
  // Prioritize manifests and code so independent archive acquisition can start.
  const blobs = [...new Map(tree.tree.filter(row => row.type === 'blob').map(row => [row.sha, row])).values()].sort((a, b) =>
    Number(/(?:package\.json|yarn\.lock)$/.test(b.path)) - Number(/(?:package\.json|yarn\.lock)$/.test(a.path)));
  const existing = new Set(execFileSync('git', ['-C', repository, 'cat-file', '--batch-check=%(objectname) %(objecttype)'], {
    input: blobs.map(row => row.sha).join('\n') + '\n', encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
  }).split('\n').filter(row => row.endsWith(' blob')).map(row => row.split(' ')[0]));
  let cursor = 0, completed = 0;
  const failures = [];
  await Promise.all(Array.from({ length: 32 }, async () => {
    while (cursor < blobs.length) {
      const row = blobs[cursor++];
      const file = path.join(repository, 'objects', row.sha.slice(0, 2), row.sha.slice(2));
      if (!existing.has(row.sha) && !fs.existsSync(file)) {
        let failure;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const large = row.size > 4 * 1024 * 1024;
            const useApi = large || row.mode === '120000';
            const url = useApi ? `https://api.github.com/repos/expo/expo/git/blobs/${row.sha}`
              : `https://raw.githubusercontent.com/expo/expo/${commit.sha}/${row.path.split('/').map(encodeURIComponent).join('/')}`;
            const response = await fetch(url, { signal: AbortSignal.timeout(large ? 300000 : 90000) });
            assert.ok(response.ok, `Raw source HTTP ${response.status}: ${row.path}`);
            if (useApi) {
              const blob = await response.json();
              assert.equal(blob.sha, row.sha); assert.equal(blob.encoding, 'base64');
              store(repository, 'blob', Buffer.from(blob.content, 'base64'), row.sha);
            } else store(repository, 'blob', Buffer.from(await response.arrayBuffer()), row.sha);
            failure = null; break;
          } catch (error) { failure = String(error); }
        }
        if (failure) failures.push({ path: row.path, oid: row.sha, error: failure });
      }
      completed++;
      if (completed % 200 === 0) console.log(`${new Date().toISOString()} official blobs ${completed}/${blobs.length}, failures ${failures.length}`);
    }
  }));
  const report = { repository: 'https://github.com/expo/expo.git', transport: 'OFFICIAL_GITHUB_API_AND_RAW_VERIFIED_GIT_OBJECTS',
    revision: commit.sha, tree: tree.sha, ordinaryFiles: ordinary.length, uniqueBlobs: blobs.length,
    specialEntries: tree.tree.filter(row => row.type !== 'tree' && !['100644', '100755'].includes(row.mode)), failures };
  fs.writeFileSync(path.join(directory, 'source-acquisition.json'), JSON.stringify(report, null, 2) + '\n');
  assert.equal(failures.length, 0, 'Some official source objects could not be acquired; rerun to resume');
  console.log(JSON.stringify({ ...report, specialEntries: report.specialEntries.length }));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  assert.equal(process.argv.length, 3, 'Usage: <new-evidence-directory>');
  await fetchFixedSource(process.argv[2]);
}
