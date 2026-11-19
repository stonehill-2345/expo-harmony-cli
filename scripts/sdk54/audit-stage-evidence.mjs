import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Availability is separate from historical acceptance. A summary cannot replace
// missing artifacts or certify the current source and device behavior.
export function auditStageEvidence(root) {
  root = fs.realpathSync(root);
  const acceptance = JSON.parse(fs.readFileSync(path.join(root, 'docs/releases/sdk54-stage-acceptance.json')));
  const files = new Map();
  for (const entry of [...acceptance.units, ...acceptance.closures]) {
    for (const evidence of entry.evidence) {
      const absolute = path.resolve(root, evidence.path);
      assert.ok(!path.isAbsolute(evidence.path) && absolute.startsWith(root + path.sep), 'Evidence outside repository');
      assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
      const previous = files.get(evidence.path);
      if (previous) {
        assert.equal(previous.expected, evidence.sha256, `Conflicting evidence hashes: ${evidence.path}`);
        continue;
      }
      let actual = null;
      if (fs.existsSync(absolute)) {
        assert.ok(fs.realpathSync(absolute).startsWith(root + path.sep), 'Evidence symlink outside repository');
        actual = createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
      }
      files.set(evidence.path, { expected: evidence.sha256, actual });
    }
  }
  const missing = [...files].filter(([, value]) => value.actual === null).map(([file]) => file).sort();
  const mismatched = [...files].filter(([, value]) => value.actual !== null && value.actual !== value.expected)
    .map(([file, value]) => ({ path: file, ...value })).sort((a, b) => a.path.localeCompare(b.path));
  const unavailable = new Set([...missing, ...mismatched.map(value => value.path)]);
  return {
    schemaVersion: 1,
    basis: 'historical acceptance artifact availability; not current source or device revalidation',
    totalFiles: files.size,
    verifiedFiles: files.size - unavailable.size,
    missing,
    mismatched,
    stages: acceptance.closures.map(closure => {
      const units = acceptance.units.filter(unit => unit.id.startsWith(`${closure.stage}-`));
      const evidence = new Set([...units, closure].flatMap(entry => entry.evidence.map(item => item.path)));
      return { stage: closure.stage, historicalStatus: closure.status,
        evidenceStatus: [...evidence].some(file => unavailable.has(file)) ? 'UNVERIFIED' : 'VERIFIED' };
    }),
    passed: unavailable.size === 0,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--output'), 'Usage: audit-stage-evidence.mjs [--output report.json]');
  const report = auditStageEvidence(fileURLToPath(new URL('../../', import.meta.url)));
  const text = JSON.stringify(report, null, 2) + '\n';
  if (args.length) fs.writeFileSync(args[1], text);
  else process.stdout.write(text);
  if (!report.passed) process.exitCode = 1;
}
