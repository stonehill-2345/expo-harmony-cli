import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepare, benchmark } from '../benchmark-prebuild.mjs';

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prebuild-benchmark-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), repository = path.join(root, 'repo');
  fs.mkdirSync(repository);
  fs.mkdirSync(path.join(source, 'node_modules/expo/bin'), { recursive: true });
  fs.writeFileSync(path.join(source, 'node_modules/expo/bin/cli'), 'throw Error("must not run")');
  for (const name of ['app', 'package']) fs.writeFileSync(path.join(source, name + '.json'), '{}');
  return { root, source, repository, workspace: path.join(root, 'workspace') };
}
test('prepare refuses existing, nested and repository-alias workspaces without touching source', t => {
  const { root, source, repository, workspace } = fixture(t);
  assert.throws(() => prepare(source, source, repository), /must be new/);
  assert.throws(() => prepare(source, path.join(source, 'nested'), repository), /outside source/);
  fs.symlinkSync(repository, path.join(root, 'repo-alias'));
  assert.throws(() => prepare(source, path.join(root, 'repo-alias', 'nested'), repository), /outside the source repository/);
  prepare(source, workspace, repository);
  const sourceStat = fs.statSync(path.join(source, 'app.json'), { bigint: true });
  const copiedStat = fs.statSync(path.join(workspace, 'project/app.json'), { bigint: true });
  assert.equal(copiedStat.mtimeNs, sourceStat.mtimeNs);
  assert.notEqual(copiedStat.ino, sourceStat.ino);
  assert.throws(() => prepare(source, workspace, repository), /must be new/);
  assert.equal(fs.readFileSync(path.join(source, 'app.json'), 'utf8'), '{}');
});
test('benchmark rejects output aliases inside its mutable project before restoring', async t => {
  const { root, source, repository, workspace } = fixture(t);
  prepare(source, workspace, repository);
  fs.symlinkSync(path.join(workspace, 'project'), path.join(root, 'alias'));
  await assert.rejects(benchmark({ workspace, output: path.join(root, 'alias/logs') }), /outside the mutable/);
  assert.equal(fs.existsSync(path.join(workspace, 'project/logs')), false);
});
test('benchmark rejects replaced config, project and snapshot symlinks', async t => {
  const { root, source, repository, workspace } = fixture(t);
  prepare(source, workspace, repository);
  const config = path.join(workspace, 'project/app.json');
  fs.unlinkSync(config); fs.symlinkSync(path.join(source, 'app.json'), config);
  await assert.rejects(benchmark({ workspace, output: path.join(root, 'logs') }), /symlink/);
  assert.equal(fs.readFileSync(path.join(source, 'app.json'), 'utf8'), '{}');
  fs.unlinkSync(config); fs.writeFileSync(config, '{}');
  fs.symlinkSync(source, path.join(workspace, 'snapshot'));
  await assert.rejects(benchmark({ workspace, output: path.join(root, 'logs') }), /symlink/);
  fs.unlinkSync(path.join(workspace, 'snapshot'));
  fs.renameSync(path.join(workspace, 'project'), path.join(workspace, 'saved'));
  fs.symlinkSync(source, path.join(workspace, 'project'));
  await assert.rejects(benchmark({ workspace, output: path.join(root, 'logs') }), /symlink|outside/);
});
