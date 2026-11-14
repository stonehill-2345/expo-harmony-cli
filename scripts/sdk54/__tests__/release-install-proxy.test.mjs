import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('release-install proxy handles an interrupted upstream body without crashing',async()=>{
  const source=fs.readFileSync(new URL('../test-release-install.mjs',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('const server = http.createServer('),source.indexOf('await new Promise(resolve => server.listen'));
  let handler;
  const context={http:{createServer:callback=>{handler=callback;return {};}},manifests:new Map(),Buffer,
    fetch:async()=>({status:200,headers:new Headers(),arrayBuffer:async()=>{throw Error('interrupted upstream');}})};
  vm.runInNewContext(code,context);
  let status,body;
  const response={headersSent:false,writeHead(code){assert.equal(this.headersSent,false,'headers already sent');this.headersSent=true;status=code;return this;},end(value){body=value;}};
  await assert.doesNotReject(handler({url:'/react'},response));
  assert.equal(status,502);assert.match(body,/interrupted upstream/);
});
