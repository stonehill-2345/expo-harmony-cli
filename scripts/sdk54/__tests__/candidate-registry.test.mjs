import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { create } from 'tar';
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

test('upstream timeout is configurable for slow registry metadata', async () => {
  const registry = await startCandidateRegistry([], {
    upstreamTimeoutMs: 10,
    fetchUpstream: async (_url, { signal }) => {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 50);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(signal.reason);
        }, { once: true });
      });
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        arrayBuffer: async () => new TextEncoder().encode('{}').buffer,
      };
    },
  });
  try {
    const response = await fetch(`${registry.registry}slow-public-package`, { signal: AbortSignal.timeout(2000) });
    assert.equal(response.status, 502);
    assert.match(await response.text(), /timeout|abort/i);
  } finally { await registry.close(); }
});

test('upstream tarballs are streamed before the response body completes', async () => {
  let releaseTail;
  const tail = new Promise(resolve => { releaseTail = resolve; });
  const registry = await startCandidateRegistry([], {
    fetchUpstream: async () => new Response(new ReadableStream({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode('first-'));
        await tail;
        controller.enqueue(new TextEncoder().encode('second'));
        controller.close();
      },
    }), { headers: { 'content-type': 'application/octet-stream' } }),
  });
  try {
    const response = await Promise.race([
      fetch(`${registry.registry}public/-/public-1.0.0.tgz`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('tarball response was buffered')), 500)),
    ]);
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    assert.equal(new TextDecoder().decode((await reader.read()).value), 'first-');
    releaseTail();
    assert.equal(new TextDecoder().decode((await reader.read()).value), 'second');
  } finally {
    releaseTail();
    await registry.close();
  }
});

test('upstream tarballs use their dedicated transfer timeout', async () => {
  const registry = await startCandidateRegistry([], {
    upstreamTimeoutMs: 10,
    upstreamTarballTimeoutMs: 500,
    fetchUpstream: async (_url, { signal }) => new Response(new ReadableStream({
      start(controller) {
        const timer = setTimeout(() => {
          controller.enqueue(new TextEncoder().encode('slow tarball'));
          controller.close();
        }, 50);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          controller.error(signal.reason);
        }, { once: true });
      },
    }), { headers: { 'content-type': 'application/octet-stream' } }),
  });
  try {
    const response = await fetch(`${registry.registry}public/-/public-1.0.0.tgz`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'slow tarball');
  } finally { await registry.close(); }
});

test('upstream HEAD requests do not download tarball bodies', async () => {
  let method;
  const registry = await startCandidateRegistry([], {
    fetchUpstream: async (_url, options) => {
      method = options.method;
      return new Response(null, { status: 200, headers: { 'content-type': 'application/octet-stream' } });
    },
  });
  try {
    const response = await fetch(`${registry.registry}public/-/public-1.0.0.tgz`, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(method, 'HEAD');
    assert.equal((await response.arrayBuffer()).byteLength, 0);
  } finally { await registry.close(); }
});

test('candidate metadata preserves the release harmony dist-tag', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'candidate-registry-tag-'));
  const source=path.join(root,'source'),pkg=path.join(source,'package'),archive=path.join(root,'candidate.tgz');
  fs.mkdirSync(pkg,{recursive:true});
  fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'@expo-oh/test',version:'1.2.3'}));
  await create({cwd:source,file:archive,gzip:true},['package']);
  const bytes=fs.readFileSync(archive),integrity=`sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const registry=await startCandidateRegistry([{name:'@expo-oh/test',version:'1.2.3',archive,integrity}]);
  try {
    const metadata=await (await fetch(`${registry.registry}@expo-oh/test`)).json();
    assert.deepEqual(metadata['dist-tags'],{latest:'1.2.3',harmony:'1.2.3'});
  } finally {
    await registry.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('public packages use the configured upstream registry', async () => {
  let requested;
  const registry=await startCandidateRegistry([],{
    upstreamRegistry:'https://registry.example.test/',
    fetchUpstream:async url=>{
      requested=url;
      return new Response('{}',{headers:{'content-type':'application/json'}});
    },
  });
  try {
    assert.equal((await fetch(`${registry.registry}public-package?tag=latest`)).status,200);
    assert.equal(requested,'https://registry.example.test/public-package?tag=latest');
  } finally { await registry.close(); }
});
