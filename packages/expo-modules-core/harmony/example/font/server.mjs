import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const root = path.resolve(process.argv[2] ?? '.');
const requireApp = createRequire(path.join(root, 'package.json'));
const vectorRoot = path.dirname(requireApp.resolve('@expo/vector-icons/package.json'));
const fontPath = path.join(vectorRoot, 'build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf');
const bytes = fs.readFileSync(fontPath);
const counts = new Map();
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:18081');
  if (url.pathname === '/stats') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ counts: Object.fromEntries(counts), sha256: process.env.FONT_SHA256, bytes: bytes.length }));
    return;
  }
  const key = url.pathname + url.search;
  counts.set(key, (counts.get(key) ?? 0) + 1);
  console.log(`FONT_HTTP_REQUEST ${Date.now()} ${key} ${counts.get(key)}`);
  const send = data => { response.writeHead(200, { 'Content-Type': 'font/ttf' }); response.end(data); };
  if (url.pathname === '/MaterialIcons.ttf') return send(bytes);
  if (url.pathname === '/empty.ttf') return send(Buffer.alloc(0));
  if (url.pathname === '/corrupt.ttf') return send(Buffer.from('not-a-font-v1'));
  if (url.pathname === '/slow/MaterialIcons.ttf') {
    const timer = setTimeout(() => { if (!response.destroyed) send(bytes); }, 4000);
    response.on('close', () => { clearTimeout(timer); console.log(`FONT_HTTP_SLOW_CLOSED ${Date.now()} ${response.writableEnded ? 'completed' : 'aborted'}`); });
    return;
  }
  response.writeHead(404); response.end('not found');
});
server.listen(18081, '127.0.0.1', () => console.log(`FONT_HTTP_READY ${fontPath} ${bytes.length}`));
