import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertExternalConsumerWorkspace } from '../creation-workspace.mjs';

test('consumer workspace rejects the repository root and descendants before writes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'creation-workspace-'));
  try {
    for (const candidate of [root, path.join(root, 'missing', 'child')]) {
      assert.throws(() => assertExternalConsumerWorkspace(candidate, root), /outside the source repository/);
    }
    assert.equal(fs.existsSync(path.join(root, 'missing')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('consumer workspace rejects symlink aliases into the repository', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'creation-workspace-'));
  const repository = path.join(temporary, 'repository');
  const alias = path.join(temporary, 'alias');
  fs.mkdirSync(repository);
  fs.symlinkSync(repository, alias, 'dir');
  try {
    for (const candidate of [alias, path.join(alias, 'missing', 'child')]) {
      assert.throws(() => assertExternalConsumerWorkspace(candidate, repository), /outside the source repository/);
    }
    assert.equal(fs.existsSync(path.join(repository, 'missing')), false);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('consumer workspace accepts an external missing path with a shared textual prefix', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'creation-workspace-'));
  const repository = path.join(temporary, 'repo');
  fs.mkdirSync(repository);
  try {
    assert.doesNotThrow(() => assertExternalConsumerWorkspace(path.join(temporary, 'repo-consumer', 'missing'), repository));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
