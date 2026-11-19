import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadM1Source } from '../m1-test-support.mjs';

const source = 'packages/expo-modules-autolinking/src/platforms/harmony/generationTransaction.ts';
const api = fs.existsSync(source) ? loadM1Source(source) : {};
const run = (...args) => api.runHarmonyGenerationTransactionAsync(...args);
const root = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-m2-transaction-')));
function put(dir, relative, value) {
  const target = path.join(dir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}
function tree(dir) {
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .map(item => [item.name, item.isSymbolicLink() ? { link: fs.readlinkSync(path.join(dir, item.name)) }
      : item.isDirectory() ? tree(path.join(dir, item.name)) : fs.readFileSync(path.join(dir, item.name), 'hex')]);
}
function seed(project) {
  put(project, 'harmony/.expo-harmony-state.json', '{"schemaVersion":1}');
  put(project, 'harmony/current.txt', 'old');
  put(project, 'outside.txt', 'outside');
}
function fingerprint(file) {
  if (!fs.existsSync(file)) return { kind: 'absent' };
  const stat = fs.statSync(file);
  return { kind: 'file', sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'), mode: stat.mode & 0o7777 };
}
function patchPlan(project, stage) {
  return {
    writes: ['.expo-harmony-state.json', 'current.txt'],
    deletes: [],
    entries: {
      '.expo-harmony-state.json': {
        before: fingerprint(path.join(project, 'harmony/.expo-harmony-state.json')),
        after: fingerprint(path.join(stage, '.expo-harmony-state.json')),
      },
      'current.txt': {
        before: fingerprint(path.join(project, 'harmony/current.txt')),
        after: fingerprint(path.join(stage, 'current.txt')),
      },
    },
  };
}
const generate = async stage => {
  put(stage, '.expo-harmony-state.json', '{"schemaVersion":1}');
  put(stage, 'current.txt', 'new');
  return 'result';
};
const self = fileURLToPath(import.meta.url);
if (process.argv[2] === '--child') {
  const [, , , project, mode] = process.argv;
  await run({ projectRoot: project, generate: async (stage, hash) => {
    if (mode === 'hold') {
      process.send('holding');
      await once(process, 'message');
    }
    const value = await generate(stage);
    if (mode.startsWith('patch-')) hash.applyManagedPatch(patchPlan(project, stage));
    return value;
  }, fault: async point => {
    if (mode === point || mode === `patch-${point}`) process.exit(77);
  } });
} else {
  test('recovers a pre-permissions journal using its original content-only fingerprint', async () => {
    const project = root(); seed(project);
    const before = tree(path.join(project, 'harmony'));
    const child = spawn(process.execPath, [self, '--child', project, 'after-install'], { stdio: 'pipe' });
    try {
      assert.equal((await once(child, 'exit'))[0], 77);
      const owner = JSON.parse(fs.readFileSync(path.join(project, '.expo-harmony-generation/lock.json')));
      const journalFile = path.join(project, '.expo-harmony-generation', owner.token, 'journal.json');
      const journal = JSON.parse(fs.readFileSync(journalFile));
      const hash = createHash('sha256');
      for (const name of fs.readdirSync(path.join(project, 'harmony')).sort((a, b) => a.localeCompare(b))) {
        hash.update(JSON.stringify([name, 'file']));
        hash.update(createHash('sha256').update(fs.readFileSync(path.join(project, 'harmony', name))).digest());
      }
      journal.candidateHash = hash.digest('hex');
      delete journal.hashVersion;
      fs.writeFileSync(journalFile, JSON.stringify(journal));
      await run({ projectRoot: project, generate: async stage => {
        assert.deepEqual(tree(path.join(project, 'harmony')), before);
        return generate(stage);
      } });
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
  });
  test('permission-only generation changes are committed and concurrent chmod is rejected', async () => {
    const project = root();
    const file = path.join(project, 'harmony/current.txt');
    try {
      await run({ projectRoot: project, generate });
      fs.chmodSync(file, 0o644);
      await run({ projectRoot: project, generate: async stage => {
        await generate(stage);
        fs.chmodSync(path.join(stage, 'current.txt'), 0o600);
      } });
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      await assert.rejects(run({ projectRoot: project, generate: async stage => {
        await generate(stage);
        fs.chmodSync(file, 0o640);
      } }), /changed|conflict/i);
      assert.equal(fs.statSync(file).mode & 0o777, 0o640);
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
  });
  test('same-size concurrent edits with restored mtime still abort', async () => {
    const project = root(); seed(project);
    const file = path.join(project, 'harmony/current.txt');
    const original = fs.statSync(file);
    try {
      await assert.rejects(run({ projectRoot: project, generate: async stage => {
        fs.writeFileSync(file, 'edit'.slice(0, original.size));
        fs.utimesSync(file, original.atime, original.mtime);
        return generate(stage);
      } }), /changed|conflict/i);
      assert.equal(fs.readFileSync(file, 'utf8'), 'edi');
      assert.equal(fs.statSync(file).size, original.size);
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
  });
  test('unchanged old-tree files reuse their initial content digests during commit checks', async () => {
    const project = root(); seed(project);
    let reads = 0;
    const injectedFs = { ...fs, createReadStream: (...args) => {
      reads++;
      return fs.createReadStream(...args);
    } };
    try {
      const transaction = loadM1Source(source, { fs: injectedFs });
      await transaction.runHarmonyGenerationTransactionAsync({ projectRoot: project, generate });
      assert.equal(reads, 4, 'two old-tree files and two candidate files should each be read once');
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
  });
  test('candidate hashing reuses files from generator-declared cloned roots', async () => {
    if (process.platform !== 'darwin') return;
    const project = root(); seed(project); put(project, 'harmony/cache/package.bin', 'cached');
    let reads = 0;
    const injectedFs = { ...fs, createReadStream: (...args) => {
      reads++;
      return fs.createReadStream(...args);
    } };
    try {
      const transaction = loadM1Source(source, { fs: injectedFs });
      await transaction.runHarmonyGenerationTransactionAsync({ projectRoot: project, generate: async (stage, hash) => {
        fs.copyFileSync(path.join(project, 'harmony/.expo-harmony-state.json'), path.join(stage, '.expo-harmony-state.json'));
        fs.copyFileSync(path.join(project, 'harmony/current.txt'), path.join(stage, 'current.txt'));
        execFileSync('/bin/cp', ['-c', '-p', '-R', path.join(project, 'harmony/cache'), path.join(stage, 'cache')]);
        put(stage, 'current.txt', 'new');
        hash.reuseClonedRoot('cache');
      } });
      assert.equal(reads, 5, 'three initial files and two non-cloned candidate files should be read');
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
  });
  test('a persisted file hash cache avoids rereading an unchanged current tree', async () => {
    const project = root(); seed(project);
    let reads = 0;
    const injectedFs = { ...fs, createReadStream: (...args) => {
      reads++;
      return fs.createReadStream(...args);
    } };
    try {
      const transaction = loadM1Source(source, { fs: injectedFs });
      await transaction.runHarmonyGenerationTransactionAsync({ projectRoot: project, generate });
      reads = 0;
      await transaction.runHarmonyGenerationTransactionAsync({ projectRoot: project, generate: async (stage, hash) => {
        await generate(stage);
        hash.reuseCurrentTree();
      } });
      assert.equal(reads, 0, 'the second no-op run should not read current or candidate contents');
      assert.equal(fs.existsSync(path.join(project, '.expo-harmony-generation/tree-hash-cache-v1.json')), true);
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
  });
  test('a declared no-op does not read current file contents before generation', async () => {
    const project = root(); seed(project);
    let reads = 0;
    const injectedFs = { ...fs, createReadStream: (...args) => {
      reads++;
      return fs.createReadStream(...args);
    } };
    try {
      const transaction = loadM1Source(source, { fs: injectedFs });
      await transaction.runHarmonyGenerationTransactionAsync({ projectRoot: project, generate: async (stage, hash) => {
        fs.cpSync(path.join(project, 'harmony'), stage, { recursive: true });
        hash.reuseCurrentTree();
      } });
      assert.equal(reads, 0);
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
  });
  test('managed patch commits only declared files and preserves the Harmony root', async () => {
    const project = root(); seed(project); put(project, 'harmony/user.txt', 'user');
    const rootInode = fs.statSync(path.join(project, 'harmony')).ino;
    const userInode = fs.statSync(path.join(project, 'harmony/user.txt')).ino;
    try {
      await run({ projectRoot: project, generate: async (stage, hash) => {
        await generate(stage);
        hash.applyManagedPatch(patchPlan(project, stage));
        return 'patched';
      } });
      assert.equal(fs.readFileSync(path.join(project, 'harmony/current.txt'), 'utf8'), 'new');
      assert.equal(fs.readFileSync(path.join(project, 'harmony/user.txt'), 'utf8'), 'user');
      assert.equal(fs.statSync(path.join(project, 'harmony')).ino, rootInode);
      assert.equal(fs.statSync(path.join(project, 'harmony/user.txt')).ino, userInode);
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
  });
  for (const point of ['after-backup', 'after-install']) {
    test(`managed patch fault at ${point} restores every declared file`, async () => {
      const project = root(); seed(project);
      const before = tree(path.join(project, 'harmony'));
      try {
        await assert.rejects(run({ projectRoot: project, generate: async (stage, hash) => {
          await generate(stage);
          hash.applyManagedPatch(patchPlan(project, stage));
        }, fault: async current => {
          if (current === point) throw new Error(`injected patch ${point}`);
        } }), new RegExp(`injected patch ${point}`));
        assert.deepEqual(tree(path.join(project, 'harmony')), before);
      } finally { fs.rmSync(project, { recursive: true, force: true }); }
    });
  }
  test('managed patch rejects a concurrent edit without losing it', async () => {
    const project = root(); seed(project);
    try {
      await assert.rejects(run({ projectRoot: project, generate: async (stage, hash) => {
        await generate(stage);
        const patch = patchPlan(project, stage);
        put(project, 'harmony/current.txt', 'concurrent');
        hash.applyManagedPatch(patch);
      } }), /managed patch conflict/i);
      assert.equal(fs.readFileSync(path.join(project, 'harmony/current.txt'), 'utf8'), 'concurrent');
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
  });
  for (const point of ['after-backup', 'after-install']) {
    test(`managed patch rejects a parent symlink during ${point} without writing outside`, async () => {
      const project = root(); seed(project);
      put(project, 'harmony/entry/config.json', 'old');
      put(project, 'outside/config.json', point === 'after-install' ? 'new' : 'old');
      const externalBefore = tree(path.join(project, 'outside'));
      try {
        await assert.rejects(run({ projectRoot: project, generate: async (stage, hash) => {
          put(stage, 'entry/config.json', 'new');
          hash.applyManagedPatch({ writes: ['entry/config.json'], deletes: [], entries: {
            'entry/config.json': { before: fingerprint(path.join(project, 'harmony/entry/config.json')),
              after: fingerprint(path.join(stage, 'entry/config.json')) },
          } });
        }, fault: async current => {
          if (current !== point) return;
          fs.renameSync(path.join(project, 'harmony/entry'), path.join(project, 'entry-saved'));
          fs.symlinkSync(path.join(project, 'outside'), path.join(project, 'harmony/entry'));
          if (point === 'after-install') throw new Error('trigger recovery');
        } }), /symlink/i);
        assert.deepEqual(tree(path.join(project, 'outside')), externalBefore);
        assert.equal(fs.existsSync(path.join(project, '.expo-harmony-generation/lock.json')), true,
          'keep recovery journal and backups until the conflicting path is repaired');
      } finally { fs.rmSync(project, { recursive: true, force: true }); }
    });
  }
  test('invalid or symlinked file hash caches fall back without touching external files', async () => {
    for (const mode of ['invalid', 'symlink']) {
      const project = root(), external = root(); seed(project);
      let reads = 0;
      const injectedFs = { ...fs, createReadStream: (...args) => {
        reads++;
        return fs.createReadStream(...args);
      } };
      try {
        const transaction = loadM1Source(source, { fs: injectedFs });
        await transaction.runHarmonyGenerationTransactionAsync({ projectRoot: project, generate });
        const cache = path.join(project, '.expo-harmony-generation/tree-hash-cache-v1.json');
        if (mode === 'invalid') fs.writeFileSync(cache, '{invalid');
        else {
          const outside = path.join(external, 'outside.json');
          fs.writeFileSync(outside, 'external');
          fs.rmSync(cache);
          fs.symlinkSync(outside, cache);
        }
        reads = 0;
        await transaction.runHarmonyGenerationTransactionAsync({ projectRoot: project, generate });
        assert.equal(reads, 4, `${mode} cache must fall back to current and candidate reads`);
        if (mode === 'symlink') assert.equal(fs.readFileSync(path.join(external, 'outside.json'), 'utf8'), 'external');
      } finally {
        fs.rmSync(project, { recursive: true, force: true });
        fs.rmSync(external, { recursive: true, force: true });
      }
    }
  });
  test('bounded hashing preserves the sequential version 2 fingerprint across nested files and links', async () => {
    const project = root();
    try {
      await run({ projectRoot: project, generate: async stage => {
        await generate(stage);
        for (let i = 0; i < 25; i++) {
          put(stage, `file-${i}`, `value ${i}`);
          fs.chmodSync(path.join(stage, `file-${i}`), i % 2 ? 0o600 : 0o755);
        }
        put(stage, 'dir/nested', 'nested');
        fs.symlinkSync('missing', path.join(stage, 'link'));
      }, fault: async point => {
        if (point !== 'after-install') return;
        const hash = createHash('sha256');
        const visit = (directory, prefix = '') => {
          for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
            const file = path.join(directory, entry.name), relative = path.posix.join(prefix, entry.name);
            hash.update(JSON.stringify([relative, entry.isDirectory() ? 'dir' : entry.isSymbolicLink() ? 'link' : 'file']));
            if (entry.isSymbolicLink()) hash.update(fs.readlinkSync(file));
            else if (entry.isDirectory()) visit(file, relative);
            else {
              hash.update(JSON.stringify(fs.statSync(file).mode & 0o7777));
              hash.update(createHash('sha256').update(fs.readFileSync(file)).digest());
            }
          }
        };
        visit(path.join(project, 'harmony'));
        const lock = JSON.parse(fs.readFileSync(path.join(project, '.expo-harmony-generation/lock.json')));
        const journal = JSON.parse(fs.readFileSync(path.join(project, '.expo-harmony-generation', lock.token, 'journal.json')));
        assert.equal(journal.hashVersion, 2);
        assert.equal(journal.candidateHash, hash.digest('hex'));
      } });
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
  });
  test('a failed parallel hash waits for all open readers before rollback', async () => {
    const project = root();
    let active = 0, peak = 0;
    const injectedFs = { ...fs, createReadStream: file => {
      active++; peak = Math.max(peak, active);
      return Readable.from((async function* () {
        try {
          await new Promise(resolve => setTimeout(resolve, file.endsWith('file-0') ? 1 : 15));
          if (file.endsWith('file-0')) throw Object.assign(new Error('hash read failed'), { code: 'EIO' });
          yield fs.readFileSync(file);
        } finally { active--; }
      })());
    }, promises: { ...fs.promises, rm: async (...args) => {
      assert.equal(active, 0, 'rollback must not race pending readers');
      return fs.promises.rm(...args);
    } } };
    try {
      const transaction = loadM1Source(source, { fs: injectedFs });
      await assert.rejects(transaction.runHarmonyGenerationTransactionAsync({ projectRoot: project, generate: async stage => {
        for (let i = 0; i < 20; i++) put(stage, `file-${i}`, 'contents');
      } }), /hash read failed/);
      assert.ok(peak > 1 && peak <= 8);
      assert.equal(active, 0);
      assert.equal(fs.existsSync(path.join(project, 'harmony')), false);
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
  });
  test('transaction API exists', () => assert.equal(typeof api.runHarmonyGenerationTransactionAsync, 'function'));
  test('successful generation commits one tree and an identical next generation is a no-op', async () => {
    const project = root();
    try {
      const result = await run({ projectRoot: project, generate });
      assert.equal(result.value, 'result');
      assert.equal(result.harmonyRoot, path.join(project, 'harmony'));
      const before = fs.statSync(path.join(project, 'harmony/current.txt')).ino;
      await run({ projectRoot: project, generate });
      assert.equal(fs.statSync(path.join(project, 'harmony/current.txt')).ino, before);
      assert.equal(fs.existsSync(path.join(project, '.expo-harmony-generation/lock.json')), false);
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
  });
  for (const point of ['after-generate', 'after-validate', 'after-backup', 'after-install']) {
    test(`failure at ${point} restores the complete old tree`, async () => {
      const project = root(); seed(project);
      const before = tree(path.join(project, 'harmony'));
      try {
        await assert.rejects(run({ projectRoot: project, generate, fault: async current => {
          if (point === current) throw new Error('injected ' + point);
        } }), /injected/);
        assert.deepEqual(tree(path.join(project, 'harmony')), before);
        assert.equal(fs.readFileSync(path.join(project, 'outside.txt'), 'utf8'), 'outside');
        await run({ projectRoot: project, generate });
      } finally { fs.rmSync(project, { recursive: true, force: true }); }
    });
  }
  for (const mode of ['clean', 'migration']) {
    test(`${mode} retains a complete user-visible backup`, async () => {
      const project = root(); seed(project);
      if (mode === 'migration') fs.unlinkSync(path.join(project, 'harmony/.expo-harmony-state.json'));
      put(project, 'harmony/manual/user.ets', 'user data');
      const before = tree(path.join(project, 'harmony'));
      try {
        const result = await run({ projectRoot: project, clean: mode === 'clean', generate });
        assert.ok(result.backupPath.startsWith(path.join(project, '.expo/harmony-backups/')));
        assert.deepEqual(tree(result.backupPath), before);
        assert.equal(fs.readFileSync(path.join(project, 'outside.txt'), 'utf8'), 'outside');
      } finally { fs.rmSync(project, { recursive: true, force: true }); }
    });
  }
  test('a real live generator prevents a second process from acquiring the lock', async () => {
    const project = root(); seed(project);
    const child = spawn(process.execPath, [self, '--child', project, 'hold'], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const exited = once(child, 'exit');
    try {
      await once(child, 'message');
      await assert.rejects(run({ projectRoot: project, generate }), /locked|running/i);
      child.send('release');
      assert.equal((await exited)[0], 0);
      assert.equal(fs.readFileSync(path.join(project, 'harmony/current.txt'), 'utf8'), 'new');
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
      fs.rmSync(project, { recursive: true, force: true });
    }
  });
  for (const mode of ['after-backup', 'after-install']) {
    test(`a process exiting at ${mode} is recovered before the next generation`, async () => {
      const project = root(); seed(project);
      const before = tree(path.join(project, 'harmony'));
      const child = spawn(process.execPath, [self, '--child', project, mode], { stdio: 'pipe' });
      try {
        assert.equal((await once(child, 'exit'))[0], 77);
        await run({ projectRoot: project, generate: async stage => {
          assert.deepEqual(tree(path.join(project, 'harmony')), before);
          return generate(stage);
        } });
        assert.equal(fs.readFileSync(path.join(project, 'harmony/current.txt'), 'utf8'), 'new');
      } finally { fs.rmSync(project, { recursive: true, force: true }); }
    });
  }
  for (const point of ['after-backup', 'after-install']) {
    test(`a process exiting at managed patch ${point} is recovered before the next generation`, async () => {
      const project = root(); seed(project);
      const before = tree(path.join(project, 'harmony'));
      const child = spawn(process.execPath, [self, '--child', project, `patch-${point}`], { stdio: 'pipe' });
      try {
        assert.equal((await once(child, 'exit'))[0], 77);
        await run({ projectRoot: project, generate: async stage => {
          assert.deepEqual(tree(path.join(project, 'harmony')), before);
          return generate(stage);
        } });
      } finally { fs.rmSync(project, { recursive: true, force: true }); }
    });
  }
  test('target root symlinks are rejected without touching their destination', async () => {
    const project = root(), external = root();
    put(external, 'safe.txt', 'external');
    fs.symlinkSync(external, path.join(project, 'harmony'));
    try {
      await assert.rejects(run({ projectRoot: project, generate }), /symbolic|symlink/i);
      assert.equal(fs.readFileSync(path.join(external, 'safe.txt'), 'utf8'), 'external');
    } finally {
      fs.rmSync(project, { recursive: true, force: true }); fs.rmSync(external, { recursive: true, force: true });
    }
  });
  test('prepare refuses an existing project without deleting it', async () => {
    const project = root(); seed(project);
    const before = tree(path.join(project, 'harmony'));
    try {
      await assert.rejects(run({ projectRoot: project, prepareOnly: true, generate }), /already exists/);
      assert.deepEqual(tree(path.join(project, 'harmony')), before);
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
  });
  test('recovery rejects a replaced backup parent symlink', async () => {
    const project = root(), external = root(); seed(project);
    const child = spawn(process.execPath, [self, '--child', project, 'after-backup'], { stdio: 'pipe' });
    try {
      assert.equal((await once(child, 'exit'))[0], 77);
      // A migration backup is visible outside the transaction workspace.
      const lock = JSON.parse(fs.readFileSync(path.join(project, '.expo-harmony-generation/lock.json')));
      const workspace = path.join(project, '.expo-harmony-generation', lock.token);
      const journal = JSON.parse(fs.readFileSync(path.join(workspace, 'journal.json')));
      journal.preserveBackup = true;
      fs.writeFileSync(path.join(workspace, 'journal.json'), JSON.stringify(journal));
      put(external, `harmony-backups/${lock.token}/harmony/external.txt`, 'external');
      fs.symlinkSync(external, path.join(project, '.expo'));
      await assert.rejects(run({ projectRoot: project, generate }), /symlink/);
      assert.equal(fs.readFileSync(path.join(external, `harmony-backups/${lock.token}/harmony/external.txt`), 'utf8'), 'external');
    } finally {
      fs.rmSync(project, { recursive: true, force: true }); fs.rmSync(external, { recursive: true, force: true });
    }
  });
  test('an edit to the old tree during generation aborts without losing that edit', async () => {
    const project = root(); seed(project);
    try {
      await assert.rejects(run({ projectRoot: project, generate: async stage => {
        put(project, 'harmony/manual.ets', 'concurrent user edit');
        return generate(stage);
      } }), /changed|conflict/i);
      assert.equal(fs.readFileSync(path.join(project, 'harmony/manual.ets'), 'utf8'), 'concurrent user edit');
      assert.equal(fs.readFileSync(path.join(project, 'harmony/current.txt'), 'utf8'), 'old');
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
  });
}
