import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('release-install reuses the streaming candidate registry',()=>{
  const source=fs.readFileSync(new URL('../test-release-install.mjs',import.meta.url),'utf8');
  assert.match(source,/import \{ startCandidateRegistry \} from '\.\/candidate-registry\.mjs'/);
  assert.doesNotMatch(source,/http\.createServer|upstream\.arrayBuffer/);
});

test('candidate consumers allow the registry tarball transfer window',()=>{
  for(const file of ['../test-release-install.mjs','../abc/a-prepare.mjs']){
    const source=fs.readFileSync(new URL(file,import.meta.url),'utf8');
    assert.match(source,/npm_config_fetch_timeout:\s*'900000'/,file);
  }
});

test('resource preparation allows metadata plus a slow tarball transfer',async()=>{
  const module=await import('../abc/a-prepare.mjs');
  assert.equal(module.candidateInstallTimeoutMs,3600000);
  const source=fs.readFileSync(new URL('../abc/a-prepare.mjs',import.meta.url),'utf8');
  assert.match(source,/setTimeout\(\(\)=>\{[^;]+;try\{process\.kill\(-child\.pid,'SIGKILL'\)/);
  assert.match(source,/\},candidateInstallTimeoutMs\)/);
});

test('release-install can write evidence outside a read-only candidate',()=>{
  const source=fs.readFileSync(new URL('../test-release-install.mjs',import.meta.url),'utf8');
  assert.match(source,/const reportPath = path\.resolve\(option\('--report'/);
  assert.match(source,/fs\.writeFileSync\(reportPath,/);
});

test('candidate consumers record and use the configured public registry',()=>{
  const release=fs.readFileSync(new URL('../test-release-install.mjs',import.meta.url),'utf8');
  assert.match(release,/option\('--upstream-registry'/);
  assert.match(release,/startCandidateRegistry\([\s\S]+upstreamRegistry/);
  assert.match(release,/upstreamRegistry, results/);
  const prepare=fs.readFileSync(new URL('../abc/a-prepare.mjs',import.meta.url),'utf8');
  assert.match(prepare,/startCandidateRegistry\(packages,\{upstreamRegistry\}\)/);
  assert.match(prepare,/upstreamRegistry/);
});
