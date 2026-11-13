import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import test from 'node:test';

function captureFixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'abc-a-device-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const ref=(name,value)=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:JSON.stringify(value));fs.writeFileSync(path.join(root,name),bytes);return {path:name,sha256:createHash('sha256').update(bytes).digest('hex')};};
  const png=new PNG({width:100,height:200});png.data.fill(255);for(let y=0;y<100;y++)for(let x=0;x<100;x++){let i=(y*100+x)*4;png.data[i]=100;png.data[i+1]=100;png.data[i+2]=100;}
  const identity={target:'TEST_ONLY',systemVersion:'fixture',bundle:'dev.fixture',pid:123,boot:'test-boot',hapSha256:'a'.repeat(64),candidateSha256:'b'.repeat(64)};
  const node=(type,bounds,extra={})=>({attributes:{type,bounds,visible:'true',...extra},children:[]});
  const layout={attributes:{bounds:'[0,0][100,200]'},children:[node('root','[0,0][100,200]',{bundleName:'dev.fixture'}),node('SheetWrapper','[0,0][100,200]'),node('SheetPage','[0,100][100,200]'),node('Text','[10,110][90,130]',{id:'sheet-title',text:'Harmony Form Sheet: one'})]};
  const sample={id:'one',at:'2026-11-11T01:00:01Z',buildId:'release',...identity,screenshot:ref('screen.png',PNG.sync.write(png)),layout:ref('layout.json',layout),identity:ref('identity.json',identity),hilog:ref('hilog.txt','11-11 09:00:01.000 123 456 I ReactNative: A_ROUTER_PROBE='+JSON.stringify({boot:'test-boot',pathname:'/sheet',state:{routes:[{name:'(tabs)'},{name:'sheet'}]}})+'\n')};
  const run={startedAt:'2026-11-11T01:00:00Z',endedAt:'2026-11-11T01:00:02Z',device:{target:identity.target,systemVersion:identity.systemVersion,bundle:identity.bundle},candidate:{sha256:identity.candidateSha256},builds:[{id:'release',hap:{sha256:identity.hapSha256}}]};
  return {root,ref,sample,run,layout,png};
}
test('decodes real PNG, HDC layout and PID-scoped route log for sheet semantics',async t=>{
  const {readCapture,verifyNavigationCase}=await import('../abc/a-verify-device.mjs');const f=captureFixture(t);const sample=readCapture(f.root,f.run,f.sample);
  assert.doesNotThrow(()=>verifyNavigationCase('S01',{one:sample}));
});
test('sheet body sampling tolerates a button at the old point but rejects an absent body',async t=>{
  const {readCapture,verifyNavigationCase}=await import('../abc/a-verify-device.mjs');const f=captureFixture(t);
  for(let y=155;y<175;y++)for(let x=10;x<98;x++){const i=(y*100+x)*4;f.png.data[i]=0;f.png.data[i+1]=80;f.png.data[i+2]=200;}
  f.sample.screenshot=f.ref('button.png',PNG.sync.write(f.png));
  assert.doesNotThrow(()=>verifyNavigationCase('S01',{one:readCapture(f.root,f.run,f.sample)}));
  f.png.data.fill(0);f.sample.screenshot=f.ref('absent.png',PNG.sync.write(f.png));
  assert.throws(()=>verifyNavigationCase('S01',{one:readCapture(f.root,f.run,f.sample)}),/body/);
});
test('S02 checks the public stable field and rejects unstable or native-only events',async t=>{
  const {readCapture,verifyNavigationCase}=await import('../abc/a-verify-device.mjs');const f=captureFixture(t),samples={};
  for(const [key,index,height] of [['small',0,70],['large',1,150],['collapsed',0,70]]){
    f.layout.children.find(n=>n.attributes.type==='SheetPage').attributes.bounds=`[0,${200-height}][100,200]`;
    f.layout.children.at(-1).attributes.text='Harmony Form Sheet: two';
    f.png.data.fill(255);f.png.data[0]=index;
    const log=fs.readFileSync(path.join(f.root,f.sample.hilog.path),'utf8')+`11-11 09:00:01.000 123 456 I ReactNative: A_SHEET_DETENT=${JSON.stringify({index,stable:true})}\n`;
    samples[key]=readCapture(f.root,f.run,{...f.sample,layout:f.ref(key+'.json',f.layout),screenshot:f.ref(key+'.png',PNG.sync.write(f.png)),hilog:f.ref(key+'.log',log)});
  }
  assert.doesNotThrow(()=>verifyNavigationCase('S02',samples));
  const good=samples.small.log;
  samples.small.log=good.replace('"stable":true','"stable":false');assert.throws(()=>verifyNavigationCase('S02',samples));
  samples.small.log=good.replace('"stable":true','"isStable":true');assert.throws(()=>verifyNavigationCase('S02',samples));
});
test('grabber requires visible contrast against the sheet, including system gray 204',async t=>{
  const {readCapture,verifyNavigationCase}=await import('../abc/a-verify-device.mjs');const f=captureFixture(t);
  f.layout.children.at(-1).attributes.text='Harmony Form Sheet: two';
  const hidden=readCapture(f.root,f.run,{...f.sample,layout:f.ref('hidden.json',f.layout)});
  f.layout.children.at(-1).attributes.text='Harmony Form Sheet: grabber';
  f.layout.children.push({attributes:{type:'SheetDragBar',bounds:'[40,104][60,108]',visible:'true'}});
  const layout=f.ref('grabber.json',f.layout);
  for(let y=104;y<108;y++)for(let x=40;x<60;x++){const i=(y*100+x)*4;f.png.data[i]=f.png.data[i+1]=f.png.data[i+2]=204;}
  const shown=readCapture(f.root,f.run,{...f.sample,layout,screenshot:f.ref('gray.png',PNG.sync.write(f.png))});
  assert.doesNotThrow(()=>verifyNavigationCase('S09',{hidden,shown}));
  f.png.data.fill(255);shown.image=f.png;
  assert.throws(()=>verifyNavigationCase('S09',{hidden,shown}),/Grabber/);
});
for(const fault of ['old-pid','old-hap','old-time','hash','empty-image','no-layout','event-only','wrong-case']) test(`rejects ${fault} evidence`,async t=>{
  const {readCapture,verifyNavigationCase}=await import('../abc/a-verify-device.mjs');const f=captureFixture(t);
  if(fault==='old-pid')f.sample.pid=999;
  if(fault==='old-hap')f.sample.hapSha256='c'.repeat(64);
  if(fault==='old-time')f.sample.at='2026-11-10T00:00:00Z';
  if(fault==='hash')fs.appendFileSync(path.join(f.root,'screen.png'),'tampered');
  if(fault==='empty-image')f.sample.screenshot=f.ref('blank.png',Buffer.from('not png'));
  if(fault==='no-layout')f.sample.layout=f.ref('empty-layout.json',{});
  if(fault==='wrong-case'){f.layout.children.at(-1).attributes.text='Harmony Form Sheet: three-1';f.sample.layout=f.ref('wrong-case.json',f.layout);}
  if(fault==='event-only'){f.layout.children=f.layout.children.filter(x=>x.attributes.type!=='SheetPage');f.sample.layout=f.ref('event-layout.json',f.layout);}
  assert.throws(()=>verifyNavigationCase('S01',{one:readCapture(f.root,f.run,f.sample)}));
});
test('unchanged pixels/layout cannot pass a drag based on a reported event',async t=>{
  const {readCapture,verifyNavigationCase}=await import('../abc/a-verify-device.mjs');const f=captureFixture(t);const s=readCapture(f.root,f.run,f.sample);assert.throws(()=>verifyNavigationCase('S02',{small:s,large:s,collapsed:s}));
});
test('failure status cannot be hidden by passed true',async t=>{
  const {verifyDevice}=await import('../abc/a-verify-device.mjs');const f=captureFixture(t);f.ref('a-device-evidence.json',{schemaVersion:1,scenario:'navigation',passed:true,cases:[]});assert.throws(()=>verifyDevice('navigation',f.root));
});

test('verifier refuses complete-looking manifests with missing mandatory cases',async t=>{
  const {verifyDevice}=await import('../abc/a-verify-device.mjs');const f=captureFixture(t);
  f.ref('a-device-evidence.json',{...f.run,schemaVersion:1,runId:'synthetic-only',scope:'LOCAL',scenario:'navigation',cases:{S01:{one:f.sample}}});
  assert.throws(()=>verifyDevice('navigation',f.root));
});

// This is an oracle unit fixture, explicitly synthetic. It is never written as a device run result.
async function resourceFixture(t) {
  const {verifyDevice}=await import('../abc/a-verify-device.mjs');
  const {createReleaseManifest}=await import('../release-catalog.mjs');
  const {execFileSync,spawnSync}=await import('node:child_process');
  if(spawnSync('python3',['-c','import PIL']).status!==0){t.skip('Pillow is required for the pixel oracle');return;}
  const f=captureFixture(t),font=path.resolve('packages/expo-font/harmony/example/fixtures/a-oracle-test.ttf');
  const metadata=JSON.parse(execFileSync('python3',['-c',`
import sys,json,io,math,hashlib,zipfile
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
root=Path(sys.argv[1]); font_bytes=Path(sys.argv[2]).read_bytes(); font=ImageFont.truetype(io.BytesIO(font_bytes),48)
w=math.ceil(font.getlength('\\ue88a')); h=sum(font.getmetrics()); glyph=Image.new('RGBA',(w,h));ImageDraw.Draw(glyph).text((0,0),'\\ue88a',font=font,fill=(0,87,184,255),anchor='lt');glyph.save(root/'glyph.png')
for phase in ['initial','updated','removed']:
 files={}
 if phase!='removed':
  files={'resources/rawfile/expo-font/fonts/EmbeddedIcons.ttf':font_bytes,'resources/rawfile/expo-font/fonts.json':json.dumps([{'family':'EmbeddedIcons','resource':'expo-font/fonts/EmbeddedIcons.ttf','sha256':hashlib.sha256(font_bytes).hexdigest()}]).encode(),'resources/rawfile/expo-asset/data.json':('{ "embedded": "'+phase+'" }\\n').encode()}
 with zipfile.ZipFile(root/(phase+'.hap'),'w') as z:
  z.writestr('module.json',json.dumps({'app':{'bundleName':'dev.fixture'}}))
  for name,content in files.items():z.writestr(name,content)
 state={'schemaVersion':1,'resources':[{'owner':'expo-font' if '/expo-font/' in name else 'expo-asset','target':'entry/src/main/'+name,'sha256':hashlib.sha256(content).hexdigest()} for name,content in files.items()]};(root/(phase+'-state.json')).write_text(json.dumps(state))
 screenshot=Image.new('RGBA',(100,200),'white')
 if phase!='removed':screenshot.paste(glyph,(10,80),glyph)
 screenshot.save(root/(phase+'.png'))
print(json.dumps({'width':w,'height':h,'scale':1,'uri':'file:///cache/glyph.png'}))
`,f.root,font],{encoding:'utf8'}));
  const fileRef=name=>f.ref(name,fs.readFileSync(path.join(f.root,name)));
  const packages=createReleaseManifest().packages.map((p,i)=>{const r=f.ref(`pkg-${i}.tgz`,`synthetic package ${p.publishName}`);return {name:p.publishName,version:p.publishVersion,file:r.path,sha256:r.sha256,bytes:fs.statSync(path.join(f.root,r.path)).size};});
  const candidate=f.ref('candidate.json',{packages,failures:[],scope:'LOCAL'});
  const builds=['initial','updated','removed'].map(phase=>{const hap=fileRef(phase+'.hap');return {id:phase,hap,candidateSha256:candidate.sha256,generatedState:fileRef(phase+'-state.json'),install:f.ref(phase+'-install.json',{target:'TEST_ONLY',hapSha256:hap.sha256,exitCode:0,argv:['hdc','-t','TEST_ONLY','install','-r',phase+'.hap']})};});
  const run={...f.run,scenario:'resources',schemaVersion:1,scope:'LOCAL',runId:'synthetic-unit-only',candidate,builds,cases:{}};
  const samples=[];
  for(const [i,phase] of ['initial','initial','updated','removed'].entries()){
    const id=`capture-${i}`,build=builds.find(b=>b.id===phase),pid=i<2?123:123+i;
    const identity={target:'TEST_ONLY',systemVersion:'fixture',bundle:'dev.fixture',pid,boot:`boot-${i}`,hapSha256:build.hap.sha256,candidateSha256:candidate.sha256};
    const probe={boot:identity.boot,phase,markerBefore:i!==0,fonts:phase==='removed'?[]:['EmbeddedIcons'],text:phase==='removed'?null:`{ "embedded": "${phase}" }\n`,cacheUri:phase==='removed'?null:'file:///cache/data.json',rejected:phase==='removed',png:phase==='removed'?null:metadata};
    const layout={attributes:{bounds:'[0,0][100,200]'},children:[{attributes:{type:'root',bounds:'[0,0][100,200]',bundleName:'dev.fixture'}},{attributes:{type:'Text',text:`Resource phase: ${phase}`,bounds:'[0,0][100,40]'}},{attributes:{type:'Image',bundleName:'dev.fixture',description:'embedded-font-glyph',bounds:`[10,80][${10+metadata.width},${80+metadata.height}]`}}]};
    samples.push({id,buildId:phase,at:`2026-11-11T01:00:0${i/10+1}Z`,...identity,screenshot:fileRef(phase+'.png'),glyph:fileRef('glyph.png'),layout:f.ref(id+'-layout.json',layout),identity:f.ref(id+'-identity.json',identity),hilog:f.ref(id+'-hilog.txt',`11-11 09:00:01.000 ${pid} 456 I ReactNative: A_RESOURCE_PROBE=${JSON.stringify(probe)}\n`)});
  }
  run.cases={R01:{initial:samples[0],reload:samples[1]},R02:{updated:samples[2]},R03:{removed:samples[3]}};
  return {...f,run,verifyDevice};
}
test('complete synthetic resource evidence passes and a cached update cannot pass',async t=>{
  const f=await resourceFixture(t);if(!f)return;const {run,verifyDevice}=f;
  f.ref('a-device-evidence.json',run);assert.deepEqual(verifyDevice('resources',f.root).verifiedCaseIds,['R01','R02','R03']);
  const stale=fs.readFileSync(path.join(f.root,'capture-2-hilog.txt'),'utf8').replace('updated\\"','initial\\"');
  run.cases.R02.updated.hilog=f.ref('stale-update.txt',stale);f.ref('a-device-evidence.json',run);assert.throws(()=>verifyDevice('resources',f.root));
});
test('resource oracle identifies an unlabeled Image by unique geometry and pixels',async t=>{
  const f=await resourceFixture(t);if(!f)return;
  for(const sample of [f.run.cases.R01.initial,f.run.cases.R01.reload,f.run.cases.R02.updated]){
    const layout=JSON.parse(fs.readFileSync(path.join(f.root,sample.layout.path)));
    const image=layout.children.pop();delete image.attributes.description;delete image.attributes.bundleName;
    layout.children[0].children=[image];
    layout.children.push({...structuredClone(image),attributes:{...image.attributes,bundleName:'system.statusbar'}});
    sample.layout=f.ref(sample.layout.path,layout);
  }
  f.ref('a-device-evidence.json',f.run);
  assert.doesNotThrow(()=>f.verifyDevice('resources',f.root));
  const sample=f.run.cases.R01.initial,layout=JSON.parse(fs.readFileSync(path.join(f.root,sample.layout.path)));
  layout.children[0].children.push(structuredClone(layout.children[0].children[0]));
  sample.layout=f.ref(sample.layout.path,layout);f.ref('a-device-evidence.json',f.run);
  assert.throws(()=>f.verifyDevice('resources',f.root),/ambiguous|unique/i);
});

for(const fault of ['null cache URI','missing cache URI','remote cache URI','wrong HAP argument','missing HAP argument','extra install command','wrong executable','HAP symlink escape'])test(`resource evidence rejects ${fault}`,async t=>{
  const f=await resourceFixture(t);if(!f)return;const {run,verifyDevice}=f;
  if(fault.includes('cache URI'))for(const sample of [run.cases.R01.initial,run.cases.R01.reload,run.cases.R02.updated]){
    const file=path.join(f.root,sample.hilog.path),line=fs.readFileSync(file,'utf8'),prefix=line.slice(0,line.indexOf('A_RESOURCE_PROBE=')+'A_RESOURCE_PROBE='.length),probe=JSON.parse(line.slice(prefix.length));
    if(fault==='null cache URI')probe.cacheUri=null;
    if(fault==='missing cache URI')delete probe.cacheUri;
    if(fault==='remote cache URI')probe.cacheUri='https://example.invalid/data.json';
    sample.hilog=f.ref(sample.hilog.path,prefix+JSON.stringify(probe)+'\n');
  }else{
    const build=run.builds.find(b=>b.id==='updated'),install=JSON.parse(fs.readFileSync(path.join(f.root,build.install.path)));
    if(fault==='wrong HAP argument')install.argv[5]='initial.hap';
    if(fault==='missing HAP argument')install.argv.pop();
    if(fault==='extra install command')install.argv.push('shell','bm','clean');
    if(fault==='wrong executable')install.argv[0]='echo';
    if(fault==='HAP symlink escape'){
      const outside=fs.mkdtempSync(path.join(os.tmpdir(),'abc-a-outside-'));t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));
      fs.copyFileSync(path.join(f.root,'updated.hap'),path.join(outside,'updated.hap'));
      fs.symlinkSync(path.join(outside,'updated.hap'),path.join(f.root,'linked.hap'));install.argv[5]='linked.hap';
    }
    build.install=f.ref(build.install.path,install);
  }
  f.ref('a-device-evidence.json',run);
  assert.throws(()=>verifyDevice('resources',f.root),fault.includes('cache URI')?/cache URI/:/install|HAP|hdc|Evidence/i);
});

test('resource evidence resolves install cwd after relocation and leaves raw evidence unchanged',async t=>{
  const f=await resourceFixture(t);if(!f)return;const {run,verifyDevice}=f;
  fs.mkdirSync(path.join(f.root,'builds'));
  for(const phase of ['updated','removed']){
    fs.copyFileSync(path.join(f.root,phase+'.hap'),path.join(f.root,'builds',phase+'.hap'));
    const build=run.builds.find(b=>b.id===phase),install=JSON.parse(fs.readFileSync(path.join(f.root,build.install.path)));
    install.cwd='builds';build.install=f.ref(build.install.path,install);
  }
  f.ref('a-device-evidence.json',run);
  const moved=fs.mkdtempSync(path.join(os.tmpdir(),'abc-a-moved-'));t.after(()=>fs.rmSync(moved,{recursive:true,force:true}));
  fs.cpSync(f.root,moved,{recursive:true});
  const snapshot=()=>fs.readdirSync(moved,{recursive:true}).filter(name=>fs.statSync(path.join(moved,name)).isFile()).sort().map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(moved,name))).digest('hex')]);
  const before=snapshot();assert.deepEqual(verifyDevice('resources',moved).verifiedCaseIds,['R01','R02','R03']);assert.deepEqual(snapshot(),before);
});

function lifecycleFixture(t,states=['background','active']) {
  const f=captureFixture(t);
  f.layout.children.find(n=>n.attributes.type==='SheetPage').attributes.bounds='[0,130][100,200]';
  f.layout.children.at(-1).attributes.text='Harmony Form Sheet: two';
  f.layout.children.at(-1).attributes.bounds='[10,140][90,160]';
  f.sample.layout=f.ref('two-layout.json',f.layout);
  const before={...f.sample,id:'before',at:'2026-11-11T01:00:00.100Z'};
  const foreground={...f.sample,id:'foreground',at:'2026-11-11T01:00:01.900Z'};
  const events=states.map((to,i)=>({boot:f.sample.boot,from:i?states[i-1]:'active',to,at:new Date(Date.parse('2026-11-11T01:00:00Z')+(i+1)*300).toISOString()}));
  const saveEvents=(pid=123)=>{
    const log=fs.readFileSync(path.join(f.root,f.sample.hilog.path),'utf8')+events.map(e=>`11-11 09:00:01.000 ${pid} 456 I ReactNative: A_ROUTER_APP_STATE=${JSON.stringify(e)}\n`).join('');
    foreground.hilog=f.ref('foreground-hilog.txt',log);
  };
  saveEvents();return {...f,before,foreground,events,saveEvents};
}
for(const states of [['background','active'],['inactive','background','inactive','active']])test(`N02 accepts observed lifecycle ${states.join(' → ')}`,async t=>{
  const {readCapture,verifyNavigationCase}=await import('../abc/a-verify-device.mjs');const f=lifecycleFixture(t,states);
  assert.doesNotThrow(()=>verifyNavigationCase('N02',{before:readCapture(f.root,f.run,f.before),foreground:readCapture(f.root,f.run,f.foreground)}));
});
for(const fault of ['missing events','inactive only','old cycle','future event','wrong boot','wrong PID','reversed events','broken chain','no return'])test(`N02 rejects ${fault}`,async t=>{
  const {readCapture,verifyNavigationCase}=await import('../abc/a-verify-device.mjs');const f=lifecycleFixture(t);
  if(fault==='missing events')f.events.length=0;
  if(fault==='inactive only'){f.events[0].to='inactive';f.events[1].from='inactive';}
  if(fault==='old cycle')f.events.forEach(e=>{e.at='2026-11-10T01:00:01Z';});
  if(fault==='future event')f.events[1].at='2026-11-11T01:00:02Z';
  if(fault==='wrong boot')f.events.forEach(e=>{e.boot='stale-boot';});
  if(fault==='reversed events')f.events.reverse();
  if(fault==='broken chain')f.events[1].from='inactive';
  if(fault==='no return')f.events.pop();
  f.saveEvents(fault==='wrong PID'?999:123);
  assert.throws(()=>verifyNavigationCase('N02',{before:readCapture(f.root,f.run,f.before),foreground:readCapture(f.root,f.run,f.foreground)}),/AppState|APP_STATE|lifecycle|background|active|boot/i);
});
