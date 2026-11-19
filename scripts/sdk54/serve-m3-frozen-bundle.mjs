import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';

const [file, expected, portText] = process.argv.slice(2);
if (!file || !/^[a-f0-9]{64}$/.test(expected || '') || !/^\d+$/.test(portText || '')) {
  throw new Error('Usage: node serve-m3-frozen-bundle.mjs BUNDLE SHA256 PORT');
}
const bundle = fs.readFileSync(file);
const digest = crypto.createHash('sha256').update(bundle).digest('hex');
if (digest !== expected) throw new Error('Bundle hash mismatch');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const valid = req.method === 'GET' && url.pathname === '/index.bundle' &&
    url.searchParams.get('platform') === 'harmony' && url.searchParams.get('dev') === 'true' &&
    url.searchParams.get('minify') === 'false';
  console.log(JSON.stringify({ time: new Date().toISOString(), method: req.method, url: req.url,
    status: valid ? 200 : 404, sha256: valid ? digest : null }));
  if (!valid) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'application/javascript', 'Content-Length': bundle.length });
  res.end(bundle);
});
server.listen(Number(portText), '127.0.0.1', () => console.log(JSON.stringify({ listening: Number(portText), sha256: digest })));
