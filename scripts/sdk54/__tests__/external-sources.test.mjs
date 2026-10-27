import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFixedYarnLock, indexExternalSources, validateExternalSources } from '../external-sources.mjs';

const lockText = `# yarn lockfile v1
"@scope/a@^1.0.0", "@scope/a@~1.2.0":
  version "1.2.3"
  resolved "https://registry.example/a.tgz#${'a'.repeat(40)}"
  integrity sha512-YQ==

"b@^2.0.0":
  version "2.1.0"
  resolved "https://registry.example/b.tgz#${'b'.repeat(40)}"
  integrity sha512-Yg==
`;
function fixture() {
  return { lockText, bundle: { '@scope/a': '^1.0.0', b: '~2.1.0', missing: '1.0.0', mismatch: '^4.0.0' },
    seeds: ['@scope/a', 'b', 'missing', 'mismatch'].map(name => ({ id: `SEED:${name}`, name, bundledSpec: null })),
    manifests: [{ path: 'packages/tool/package.json', value: { name: 'tool', dependencies: { '@scope/a': '^1.0.0', b: '^2.0.0' } } }],
    scopes: Object.fromEntries(['@scope/a', 'b', 'missing', 'mismatch'].map(name => [name, { batch: 'M7.1', reason: 'fixture scope' }])) };
}

test('Yarn v1 scoped/multi selectors retain independent exact identities and lines', () => {
  const lock = parseFixedYarnLock(lockText);
  assert.equal(lock.length, 3);
  assert.equal(lock.find(row => row.selector === '@scope/a@~1.2.0').version, '1.2.3');
  assert.equal(lock.find(row => row.selector === '@scope/a@^1.0.0').name, '@scope/a');
  assert.equal(lock[0].source.path, 'yarn.lock'); assert.ok(lock[0].source.line > 0);
});
test('duplicate selectors and unresolved merge conflicts fail closed', () => {
  assert.throws(() => parseFixedYarnLock(lockText + lockText), /Duplicate/);
  assert.throws(() => parseFixedYarnLock(lockText.replace('"@scope/a@~1.2.0"', '"@scope/a@^1.0.0"')), /Duplicate/);
  assert.throws(() => parseFixedYarnLock('<<<<<<< HEAD\n' + lockText), /lock|parse|conflict/i);
});
test('exact selectors differ from semver-compatible candidates; highest version is not fabricated as resolved', () => {
  const result = indexExternalSources(fixture());
  assert.equal(result.seeds.find(row => row.name === '@scope/a').identityStatus, 'EXACT_LOCK');
  const b = result.seeds.find(row => row.name === 'b');
  assert.equal(b.identityStatus, 'COMPATIBLE_LOCK_CANDIDATES'); assert.equal(b.exactLockId, null);
  assert.equal(b.compatibleLockIds.length, 1);
  assert.equal(result.seeds.find(row => row.name === 'missing').identityStatus, 'NO_LOCK');
});
test('mismatching locked versions remain unresolved and scope metadata is mandatory', () => {
  const input = fixture(); input.lockText += '\n"mismatch@^3.0.0":\n  version "3.2.0"\n';
  const result = indexExternalSources(input);
  assert.equal(result.seeds.find(row => row.name === 'mismatch').identityStatus, 'LOCK_RANGE_MISMATCH');
  delete input.scopes.b; assert.throws(() => indexExternalSources(input), /Missing scope/);
});
test('upstream declarations and seed target differences are kept separately', () => {
  const input = fixture(); input.seeds[0].bundledSpec = '9.0.0';
  const row = indexExternalSources(input).seeds.find(row => row.name === '@scope/a');
  assert.equal(row.seedSpec, '9.0.0'); assert.equal(row.fixedBundleSpec, '^1.0.0'); assert.equal(row.seedDiffersFromUpstream, true);
  assert.equal(row.declarations[0].source.path, 'packages/tool/package.json');
});
test('no selector means no registry identity; duplicate seed IDs are rejected', () => {
  const input = fixture(); input.seeds.push({ id: 'SEED:target', name: 'target', bundledSpec: '9.0.0' }); input.scopes.target = { batch: 'M7.1', reason: 'target-only fixture' };
  assert.equal(indexExternalSources(input).seeds.find(row => row.name === 'target').identityStatus, 'NO_UPSTREAM_IDENTITY');
  input.seeds.push(input.seeds[0]); assert.throws(() => indexExternalSources(input), /Duplicate seed/);
});
test('source reconstruction rejects missing seed/lock, changed versions/scopes and fake completion', () => {
  const expected = indexExternalSources(fixture()); assert.deepEqual(indexExternalSources(fixture()), expected);
  for (const mutate of [a => a.seeds.pop(), a => a.locks.pop(), a => a.seeds[0].identityStatus = 'EXACT_LOCK_FAKE', a => a.seeds[0].scope.reason = 'fake', a => a.externalSourcesComplete = true, a => a.locks[0].version = '9.0.0']) {
    const actual = structuredClone(expected); mutate(actual); assert.equal(validateExternalSources(actual, expected).valid, false);
  }
});

test('same ID under another package and incompatible versions behind exact selectors are not accepted', () => {
  const duplicate = fixture(); duplicate.seeds[1].id = duplicate.seeds[0].id;
  assert.throws(() => indexExternalSources(duplicate), /Duplicate seed/);
  const input = fixture(); input.lockText = input.lockText.replace('version "1.2.3"', 'version "9.0.0"');
  const row = indexExternalSources(input).seeds.find(row => row.name === '@scope/a');
  assert.equal(row.identityStatus, 'EXACT_LOCK_RANGE_MISMATCH'); assert.ok(row.exactLockId);
});
