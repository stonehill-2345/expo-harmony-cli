import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { exportOtherCaptures } from '../abc/b-export-other-captures.mjs';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const ids = ['M4-A03-splash','M4-A03-system-ui','M4-A03-status-bar','M4-A04-linking-router','M4-A05-browser','M4-A07-package-sync'];
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'b-other-captures-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const put=(name,value)=>{const b=Buffer.from(value);fs.writeFileSync(path.join(root,name),b);return {path:name,sha256:hash(b)};};
  const candidate=put('candidate.json','{"packages":[]}');
  const cases=Object.fromEntries(ids.map((id,i)=>{
    const capture=put(`capture-${i}.json`,JSON.stringify({kind:'raw-capture',pid:100+i}));
    return [id,{bundle:`dev.app${i}`,pid:100+i,hap:put(`app-${i}.hap`,`hap-${i}`),mode:'release',bootIds:[1,2],captureCwd:root,capture}];
  }));
  const manifest={schemaVersion:1,runId:'test-run',candidate,device:{target:'target',platformVersion:'6'},m4:{other:{caseCaptures:cases}}};
  const manifestFile=path.join(root,'run-manifest.json');
  const write=()=>fs.writeFileSync(manifestFile,JSON.stringify(manifest));write();
  return {root,manifest,write,manifestFile,output:path.join(root,'export')};
}
test('exports all Other case identities without claiming acceptance',t=>{
  const f=fixture(t);const r=exportOtherCaptures(f);
  assert.equal(r.status,'CAPTURED_NOT_VERIFIED');assert.equal(Object.keys(r.cases).length,6);
  assert.equal(r.cases[ids[0]].pid,100);assert.equal(r.cases[ids[1]].pid,101);
  for(const row of Object.values(r.cases)) assert.equal(hash(fs.readFileSync(path.join(f.output,row.capture.path))),row.capture.sha256);
  assert.throws(()=>exportOtherCaptures(f),/exists/);
});
for(const defect of ['missing','hash','escape','symlink','pid']) test(`rejects ${defect} before publishing`,t=>{
  const f=fixture(t),row=f.manifest.m4.other.caseCaptures[ids[0]];
  if(defect==='missing')delete f.manifest.m4.other.caseCaptures[ids[0]];
  if(defect==='hash')row.capture.sha256='0'.repeat(64);
  if(defect==='escape')row.capture.path='../capture.json';
  if(defect==='symlink'){fs.unlinkSync(path.join(f.root,row.capture.path));fs.symlinkSync('/etc/hosts',path.join(f.root,row.capture.path));}
  if(defect==='pid')row.pid=0;
  f.write();assert.throws(()=>exportOtherCaptures(f));assert.equal(fs.existsSync(f.output),false);
});

test('copies nested command and image references without changing raw capture bytes',t=>{
  const f=fixture(t), row=f.manifest.m4.other.caseCaptures[ids[0]];
  const raw=Buffer.from('raw hilog');fs.writeFileSync(path.join(f.root,'hilog.txt'),raw);
  const bytes=Buffer.from(JSON.stringify({logCommand:{stdout:{path:'hilog.txt',sha256:hash(raw)}}}));
  fs.writeFileSync(path.join(f.root,row.capture.path),bytes);row.capture.sha256=hash(bytes);f.write();
  exportOtherCaptures(f);
  assert.deepEqual(fs.readFileSync(path.join(f.output,'hilog.txt')),raw);
  assert.deepEqual(fs.readFileSync(path.join(f.output,row.capture.path)),bytes);
  const relocated=path.join(f.root,'relocated');fs.renameSync(f.output,relocated);
  const replay=exportOtherCaptures({manifestFile:path.join(relocated,'source-run-manifest.json'),output:path.join(f.root,'replay')});
  assert.equal(replay.cases[ids[0]].capture.sha256,row.capture.sha256);
});

test('rejects corrupted nested logs before publishing',t=>{
  const f=fixture(t), row=f.manifest.m4.other.caseCaptures[ids[0]];
  fs.writeFileSync(path.join(f.root,'hilog.txt'),'wrong');
  const bytes=Buffer.from(JSON.stringify({stdout:{path:'hilog.txt',sha256:hash('expected')}}));
  fs.writeFileSync(path.join(f.root,row.capture.path),bytes);row.capture.sha256=hash(bytes);f.write();
  assert.throws(()=>exportOtherCaptures(f),/hash mismatch/);
  assert.equal(fs.existsSync(f.output),false);
});

for (const suffix of ['JSON', 'raw']) test(`parses ${suffix} capture bytes and recursively copies all references`, t => {
  const f = fixture(t), row = f.manifest.m4.other.caseCaptures[ids[0]];
  const image = Buffer.from('image bytes');
  fs.writeFileSync(path.join(f.root, 'screen.png'), image);
  const layout = Buffer.from(JSON.stringify({ screenshot: { path: 'screen.png', sha256: hash(image) } }));
  fs.writeFileSync(path.join(f.root, `layout.${suffix}`), layout);
  const bytes = Buffer.from(JSON.stringify({ layout: { path: `layout.${suffix}`, sha256: hash(layout) } }));
  row.capture = { path: `capture.${suffix}`, sha256: hash(bytes) };
  fs.writeFileSync(path.join(f.root, row.capture.path), bytes);
  f.write();
  exportOtherCaptures(f);
  assert.deepEqual(fs.readFileSync(path.join(f.output, `layout.${suffix}`)), layout);
  assert.deepEqual(fs.readFileSync(path.join(f.output, 'screen.png')), image);
  assert.deepEqual(fs.readFileSync(path.join(f.output, row.capture.path)), bytes);
});

for (const suffix of ['json', 'JSON', 'raw']) test(`rejects non-JSON ${suffix} capture before publishing`, t => {
  const f = fixture(t), row = f.manifest.m4.other.caseCaptures[ids[0]];
  const bytes = Buffer.from('not JSON');
  row.capture = { path: `capture.${suffix}`, sha256: hash(bytes) };
  fs.writeFileSync(path.join(f.root, row.capture.path), bytes);
  f.write();
  assert.throws(() => exportOtherCaptures(f), /JSON|capture/);
  assert.equal(fs.existsSync(f.output), false);
});

for (const value of [null, [], 'capture']) test(`rejects non-object capture JSON ${JSON.stringify(value)}`, t => {
  const f = fixture(t), row = f.manifest.m4.other.caseCaptures[ids[0]];
  const bytes = Buffer.from(JSON.stringify(value));
  fs.writeFileSync(path.join(f.root, row.capture.path), bytes);
  row.capture.sha256 = hash(bytes); f.write();
  assert.throws(() => exportOtherCaptures(f), /capture/);
  assert.equal(fs.existsSync(f.output), false);
});

test('collects references attached as metadata to another reference', t => {
  const f = fixture(t), row = f.manifest.m4.other.caseCaptures[ids[0]];
  const image = Buffer.from('screen');
  fs.writeFileSync(path.join(f.root, 'screen.png'), image);
  const log = Buffer.from('log');
  fs.writeFileSync(path.join(f.root, 'hilog.txt'), log);
  const bytes = Buffer.from(JSON.stringify({ log: { path: 'hilog.txt', sha256: hash(log),
    screenshot: { path: 'screen.png', sha256: hash(image) } } }));
  fs.writeFileSync(path.join(f.root, row.capture.path), bytes);
  row.capture.sha256 = hash(bytes); f.write();
  exportOtherCaptures(f);
  assert.deepEqual(fs.readFileSync(path.join(f.output, 'screen.png')), image);
});

for (const bootIds of [[''], ['uuid\0suffix'], [0], [Number.MAX_SAFE_INTEGER + 1]]) {
  test(`rejects invalid bootIds ${JSON.stringify(bootIds)} before publishing`, t => {
    const f = fixture(t);
    f.manifest.m4.other.caseCaptures[ids[0]].bootIds = bootIds;
    f.write();
    assert.throws(() => exportOtherCaptures(f), /identities/);
    assert.equal(fs.existsSync(f.output), false);
  });
}

test('exports Router UUID boots unchanged alongside numeric application boots', t => {
  const f = fixture(t);
  const bootIds = ['550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001'];
  f.manifest.m4.other.caseCaptures['M4-A04-linking-router'].bootIds = bootIds;
  f.write();
  const result = exportOtherCaptures(f);
  assert.deepEqual(result.cases['M4-A04-linking-router'].bootIds, bootIds);
  assert.deepEqual(result.cases['M4-A03-splash'].bootIds, [1, 2]);
});
