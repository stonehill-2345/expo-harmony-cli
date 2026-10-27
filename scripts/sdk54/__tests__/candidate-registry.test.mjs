import assert from 'node:assert/strict';
import test from 'node:test';
import { startCandidateRegistry } from '../candidate-registry.mjs';

test('upstream response-body failure returns 502 without crashing the registry', async () => {
  const registry = await startCandidateRegistry([], { fetchUpstream: async () => ({
    status: 200, headers: new Headers({ 'content-type': 'application/json' }),
    arrayBuffer: async () => { throw new Error('fixture interrupted response body'); },
  }) });
  try {
    const response = await fetch(`${registry.registry}some-public-package`, { signal: AbortSignal.timeout(2000) });
    assert.equal(response.status, 502);
    assert.match(await response.text(), /fixture interrupted response body/);
    assert.equal((await fetch(`${registry.registry}@expo-oh/unknown`)).status, 404);
    assert.equal((await fetch(registry.registry, { method: 'POST' })).status, 405);
  } finally { await registry.close(); }
});
