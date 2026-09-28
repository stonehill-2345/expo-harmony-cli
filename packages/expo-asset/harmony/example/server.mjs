import http from 'node:http';

const counts = new Map();

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:18080');
  if (url.pathname === '/stats') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(Object.fromEntries(counts)));
    return;
  }
  const key = url.pathname + url.search;
  const count = (counts.get(key) ?? 0) + 1;
  counts.set(key, count);
  console.log(`LANE_B_HTTP_REQUEST ${Date.now()} ${key} ${count}`);

  if (['/asset', '/nohash', '/mismatch', '/a%20b-%E8%B5%84%E6%BA%90'].includes(url.pathname)) {
    response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    response.end('lane-b-http-fixture-v1\n');
    return;
  }
  if (url.pathname === '/slow') {
    response.on('close', () => {
      clearTimeout(timer);
      console.log(`LANE_B_HTTP_SLOW_CLOSED ${Date.now()} ${response.writableEnded ? 'completed' : 'aborted'}`);
    });
    const timer = setTimeout(() => {
      if (!response.destroyed) {
        response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        response.end('lane-b-slow-fixture-v1\n');
      }
    }, 120000);
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain' });
  response.end('not found\n');
});

server.listen(18080, '127.0.0.1', () => {
  console.log('LANE_B_HTTP_READY 127.0.0.1:18080');
});
