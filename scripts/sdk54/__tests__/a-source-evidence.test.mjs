import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { gitBytes, verifyGitObject, recoverCommit } from '../a-fetch-sdk54-source.mjs';
import { main } from '../a-rebuild-source-evidence.mjs';

test('official source object verification rejects changed bytes and object kind', () => {
  const bytes = Buffer.from('fixed SDK54 source\n');
  const oid = createHash('sha1').update(gitBytes('blob', bytes)).digest('hex');
  assert.deepEqual(verifyGitObject('blob', bytes, oid), gitBytes('blob', bytes));
  assert.throws(() => verifyGitObject('blob', Buffer.from('different source'), oid), /object mismatch/);
  assert.throws(() => verifyGitObject('tree', bytes, oid), /object mismatch/);
});

test('normalized API commit is accepted only when exact Git commit bytes match', () => {
  const tree = 'a'.repeat(40), parent = 'b'.repeat(40);
  const bytes = Buffer.from(`tree ${tree}\nparent ${parent}\nauthor Expo <sdk@example.test> 1704067200 +0800\ncommitter Expo <sdk@example.test> 1704067200 -0700\n\nSDK 54 fixture\n`);
  const sha = createHash('sha1').update(gitBytes('commit', bytes)).digest('hex');
  const person = { name: 'Expo', email: 'sdk@example.test', date: '2024-01-01T00:00:00Z' };
  const api = { sha, tree: { sha: tree }, parents: [{ sha: parent }], author: person, committer: person, message: 'SDK 54 fixture' };
  assert.deepEqual(recoverCommit(api), bytes);
  assert.throws(() => recoverCommit({ ...api, message: 'changed message' }), /Cannot recover exact commit bytes/);
});

test('rebuild CLI rejects unknown stages and writing inside the source repository', async () => {
  await assert.rejects(main(['unknown', '/tmp/source', '/tmp/evidence']), /Unknown stage/);
  await assert.rejects(main(['census', '/tmp/source', '/tmp/source/evidence']), /must not overwrite source/);
  await assert.rejects(main(['census', '/tmp/source', '/tmp/source']), /must not overwrite source/);
});
