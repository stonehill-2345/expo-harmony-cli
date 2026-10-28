import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
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
const generate = async stage => {
  put(stage, '.expo-harmony-state.json', '{"schemaVersion":1}');
  put(stage, 'current.txt', 'new');
  return 'result';
};
const self = fileURLToPath(import.meta.url);
if (process.argv[2] === '--child') {
  const [, , , project, mode] = process.argv;
  await run({ projectRoot: project, generate: async stage => {
    if (mode === 'hold') {
      process.send('holding');
      await once(process, 'message');
    }
    return generate(stage);
  }, fault: async point => {
    if (mode === point) process.exit(77);
  } });
} else {
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
