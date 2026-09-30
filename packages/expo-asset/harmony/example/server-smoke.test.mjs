import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import test from 'node:test';

test('controlled server: bytes, Unicode URI, 404, counters and abort evidence', { timeout: 10000 }, async () => {
  const child = spawn(process.execPath, [new URL('./server.mjs', import.meta.url).pathname],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  let output = '';
  let errors = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { errors += data; });
  async function waitFor(text) {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (output.includes(text)) return;
      if (child.exitCode !== null) throw new Error(`Server exited: ${errors}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Missing server marker: ${text}`);
  }
  try {
    await waitFor('LANE_B_HTTP_READY');
    const origin = 'http://127.0.0.1:18080';
    assert.equal(await (await fetch(`${origin}/asset?run=host-smoke`)).text(), 'lane-b-http-fixture-v1\n');
    assert.equal(await (await fetch(`${origin}/a%20b-%E8%B5%84%E6%BA%90`)).text(), 'lane-b-http-fixture-v1\n');
    assert.equal((await fetch(`${origin}/missing`)).status, 404);
    const stats = await (await fetch(`${origin}/stats`)).json();
    assert.equal(stats['/asset?run=host-smoke'], 1);
    const controller = new AbortController();
    const slow = fetch(`${origin}/slow`, { signal: controller.signal });
    await waitFor('/slow');
    controller.abort();
    await assert.rejects(slow);
    await waitFor('aborted');
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM');
    await exited;
  }
});
