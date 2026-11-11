import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { html, sha256, resolveMapped, safeFile, verifyReceipts, newOutput } from '../abc/c-evidence-lib.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'c-portable-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'archives'));
  fs.writeFileSync(path.join(root, 'archives/a.tgz'), 'original bytes');
  return root;
}
test('maps exact historical prefix to another absolute root without rewriting originals', t => {
  const root = fixture(t), mappings = [{ from: '/old/evidence', to: root }];
  const ref = { path: '/old/evidence/archives/a.tgz', sha256: sha256('original bytes') };
  assert.equal(resolveMapped(ref.path, mappings), fs.realpathSync(path.join(root, 'archives/a.tgz')));
  assert.equal(verifyReceipts([ref], mappings)[0].sha256, ref.sha256);
  assert.equal(ref.path, '/old/evidence/archives/a.tgz');
});
test('rejects fake hash, ambiguous mapping, absent mapping and prefix collision', t => {
  const root = fixture(t), map = [{ from: '/old', to: root }];
  assert.throws(() => verifyReceipts([{path:'/old/archives/a.tgz',sha256:'0'.repeat(64)}], map), /hash/i);
  assert.throws(() => resolveMapped('/old/archives/a.tgz', [...map, ...map]), /ambiguous/i);
  assert.throws(() => resolveMapped('/older/archives/a.tgz', map), /mapping/i);
});
test('rejects traversal, symlink escape, missing file and reused output', t => {
  const root = fixture(t);
  fs.symlinkSync(os.tmpdir(), path.join(root,'escape'));
  for (const p of ['../x','/etc/passwd','escape/nope','missing']) assert.throws(() => safeFile(root,p));
  assert.throws(() => newOutput(root), /exist/i);
  assert.throws(() => resolveMapped('/old/../escape', [{from:'/old',to:root}]), /escape|unsafe/i);
});
test('HTML report renders safe relative evidence links as clickable navigation', () => {
  const report=html('report',{links:['input-audit/report.html','../escape.html','https://example.com']});
  assert.match(report,/<a href="input-audit\/report\.html">input-audit\/report\.html<\/a>/);
  assert.doesNotMatch(report,/href="\.\.\/escape\.html"/);
  assert.doesNotMatch(report,/href="https:\/\//);
});
