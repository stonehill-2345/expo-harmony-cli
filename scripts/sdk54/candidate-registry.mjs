import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { extract } from 'tar';

// Reuse the read-only candidate registry protocol from test-release-install.mjs.
export async function startCandidateRegistry(packages, { fetchUpstream = fetch } = {}) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-candidate-registry-'));
  const manifests = new Map();
  try {
    for (const [index, item] of packages.entries()) {
      assert.ok(!manifests.has(item.name), `Duplicate candidate: ${item.name}`);
      const bytes = fs.readFileSync(item.archive);
      const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
      assert.equal(integrity, item.integrity, `Candidate integrity mismatch: ${item.name}`);
      const directory = path.join(stage, String(index));
      fs.mkdirSync(directory);
      await extract({ file: item.archive, cwd: directory, strict: true });
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package/package.json')));
      assert.equal(manifest.name, item.name);
      assert.equal(manifest.version, item.version);
      manifests.set(item.name, { ...item, manifest, index });
    }
    let registry;
    const server = http.createServer(async (request, response) => {
      try {
        if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
        const url = new URL(request.url, 'http://localhost');
        const name = decodeURIComponent(url.pathname.slice(1));
        if (name.startsWith('tarballs/')) {
          const item = [...manifests.values()].find(p => name === `tarballs/${p.index}.tgz`);
          if (!item) { response.writeHead(404).end(); return; }
          response.setHeader('Content-Type', 'application/octet-stream');
          if (request.method === 'HEAD') response.end();
          else fs.createReadStream(item.archive).pipe(response);
        } else if (manifests.has(name)) {
          const item = manifests.get(name);
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ name, 'dist-tags': { latest: item.version }, versions: {
            [item.version]: { ...item.manifest, dist: { integrity: item.integrity, tarball: `${registry}tarballs/${item.index}.tgz` } },
          } }));
        } else if (name.startsWith('@expo-oh/')) {
          response.writeHead(404).end();
        } else {
          const upstream = await fetchUpstream(`https://registry.npmjs.org${url.pathname}${url.search}`, {
            headers: { accept: 'application/vnd.npm.install-v1+json' }, signal: AbortSignal.timeout(30000),
          });
          const bytes = Buffer.from(await upstream.arrayBuffer());
          response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream' });
          response.end(bytes);
        }
      } catch (error) {
        if (response.headersSent) response.destroy(error);
        else response.writeHead(502).end(String(error));
      }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    registry = `http://127.0.0.1:${server.address().port}/`;
    return { registry, async close() {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      fs.rmSync(stage, { recursive: true, force: true });
    } };
  } catch (error) { fs.rmSync(stage, { recursive: true, force: true }); throw error; }
}
