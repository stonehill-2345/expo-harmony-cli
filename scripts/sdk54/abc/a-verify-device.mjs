import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { createReleaseManifest } from '../release-catalog.mjs';
import { isMain, json, options, readRef, repository, scenario, sha256 } from './a-common.mjs';

const contract=json(path.join(repository,'docs/releases/sdk54-abc-20261111/a-sheet-contract.json'));
export const resourceCases={R01:['initial','reload'],R02:['updated'],R03:['removed']};
const identityFields=['target','systemVersion','bundle','pid','boot','hapSha256','candidateSha256'];
function nodes(tree) { return [tree.attributes??{},...(tree.children??[]).flatMap(nodes)]; }
function bounds(node) {
  const match=/^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(node?.bounds??'');
  assert.ok(match,'Missing actual HDC bounds');const [x,y,right,bottom]=match.slice(1).map(Number);
  assert.ok(right>x&&bottom>y,'Empty HDC bounds');return {x,y,right,bottom,width:right-x,height:bottom-y};
}
function find(sample,predicate) {return sample.nodes.find(n=>n.visible!=='false'&&n.opacity!=='0.000000'&&predicate(n));}
function visibleText(sample,text) {const n=find(sample,n=>(n.text??'').includes(text));assert.ok(n,`Missing visible ${text}`);bounds(n);return n;}
function event(sample,marker) {
  const prefix=marker+'=';
  const lines=sample.log.split(/\r?\n/).filter(line=>line.includes(prefix)&&new RegExp(`(?:^|\\s)${sample.pid}(?:\\s|$)`).test(line.slice(0,line.indexOf(prefix))));
  assert.ok(lines.length,`Missing PID ${sample.pid} event ${marker}`);
  return JSON.parse(lines.at(-1).slice(lines.at(-1).indexOf(prefix)+prefix.length));
}
function route(sample) {const value=event(sample,'A_ROUTER_PROBE');assert.equal(value.boot,sample.boot,'Old runtime boot');assert.ok(Array.isArray(value.state?.routes),'Missing actual route state');return value;}
function pixel(sample,x,y) {
  assert.ok(x>=0&&y>=0&&x<sample.image.width&&y<sample.image.height,'Pixel outside screenshot');
  const offset=(Math.floor(y)*sample.image.width+Math.floor(x))*4;return Array.from(sample.image.data.subarray(offset,offset+3));
}
export function readCapture(root,run,capture) {
  assert.ok(Number.isInteger(capture.pid)&&capture.pid>0,'Invalid PID');assert.ok(typeof capture.boot==='string'&&capture.boot.length>0,'Missing runtime boot');
  const at=Date.parse(capture.at);assert.ok(Number.isFinite(at)&&at>=Date.parse(run.startedAt)&&at<=Date.parse(run.endedAt),'Stale capture time');
  const identity=JSON.parse(readRef(root,capture.identity));
  for(const key of identityFields)assert.equal(identity[key],capture[key],`Capture identity mismatch: ${key}`);
  for(const key of ['target','systemVersion','bundle'])assert.equal(capture[key],run.device[key],`Device mismatch: ${key}`);
  assert.equal(capture.candidateSha256,run.candidate.sha256,'Wrong candidate');
  const build=run.builds.find(b=>b.id===capture.buildId);assert.ok(build,'Unknown HAP build');assert.equal(capture.hapSha256,build.hap.sha256,'Old HAP');
  const image=PNG.sync.read(readRef(root,capture.screenshot),{checkCRC:true});assert.ok(image.width>1&&image.height>1,'Empty screenshot');
  const tree=JSON.parse(readRef(root,capture.layout)),all=nodes(tree),area=bounds(tree.attributes);
  assert.equal(image.width,area.width,'Screenshot/layout width mismatch');assert.equal(image.height,area.height,'Screenshot/layout height mismatch');
  assert.ok(all.some(n=>n.bundleName===run.device.bundle),'Layout belongs to another app');
  const log=readRef(root,capture.hilog).toString('utf8');
  const value={...capture,image,nodes:all,log};
  if(run.scenario==='resources')assert.equal(event(value,'A_RESOURCE_PROBE').boot,capture.boot,'Old resource runtime');else route(value);
  assert.ok(!log.split(/\r?\n/).some(line=>new RegExp(`(?:^|\\s)${capture.pid}(?:\\s|$)`).test(line)&&line.includes('A_RESOURCE_FAILURE=')),'Resource execution failed');
  return value;
}
function sheet(sample,fraction,caseName) {
  assert.equal(route(sample).pathname,'/sheet','Wrong sheet route');visibleText(sample,'Harmony Form Sheet'+(caseName?': '+caseName:''));
  const area=bounds(find(sample,n=>n.type==='SheetPage')),wrapper=bounds(find(sample,n=>n.type==='SheetWrapper'));
  if(fraction!==undefined)assert.ok(Math.abs(area.height/wrapper.height-fraction)<.07,`Sheet actual height ${area.height}/${wrapper.height} != ${fraction}`);
  assert.ok(area.bottom<=sample.image.height&&area.x>=0&&area.right<=sample.image.width,'Sheet outside screenshot');
  // The fixture has a white background. Require pixels inside the measured sheet, not just a button event.
  assert.ok(pixel(sample,area.x+area.width*.92,area.y+area.height*.65).every(v=>v>240),'Sheet body is absent from screenshot');
  return area;
}
function closed(sample,pathname='/') {
  assert.ok(!find(sample,n=>n.type==='SheetPage'),'Sheet remains visible');const r=route(sample);assert.equal(r.pathname,pathname);
  assert.ok(!r.state.routes.some(item=>item.name==='sheet'),'Sheet remains in route state');
  visibleText(sample,pathname==='/'?'Native Tabs Home':'Sheet contract');
}
function unchanged(samples) {
  const first=samples[0];for(const s of samples.slice(1)){assert.equal(s.pid,first.pid);assert.equal(s.boot,first.boot);assert.equal(s.hapSha256,first.hapSha256);assert.equal(route(s).pathname,route(first).pathname);}
}
function parentPresses(sample) {const n=visibleText(sample,'Parent presses:');return Number(/Parent presses:\s*(\d+)/.exec(n.text)?.[1]);}

export function verifyNavigationCase(id,s) {
  if(id==='S01')sheet(s.one,.5,'one');
  else if(id==='S02'){
    const a=sheet(s.small,.35,'two'),b=sheet(s.large,.75,'two'),c=sheet(s.collapsed,.35,'two');assert.ok(b.height>a.height*1.5);assert.ok(Math.abs(a.height-c.height)<8);
    for(const [key,index] of [['small',0],['large',1],['collapsed',0]]){const e=event(s[key],'A_SHEET_DETENT');assert.equal(e.index,index);assert.equal(e.isStable,true);}
    assert.notEqual(s.small.screenshot.sha256,s.large.screenshot.sha256,'No actual pixel change');unchanged(Object.values(s));
  }else if(['S03','S04','S05'].includes(id)){const index=Number(id.slice(1))-3;sheet(s[`three-${index}`],[.2,.5,.9][index],`three-${index}`);}
  else if(id==='S08'){
    const area=sheet(s.fit,undefined,'fit'),content=bounds(find(s.fit,n=>n.id==='sheet-content'));const layout=event(s.fit,'A_SHEET_LAYOUT');
    assert.ok(Math.abs(layout.height-280)<1,'fit content should measure 280vp');const ratio=content.height/layout.height;
    assert.ok(ratio>=1&&ratio<=5);assert.ok(area.height>=content.height&&area.height<content.height+160*ratio,'fit sheet stretches beyond content');
  }else if(id==='S09'){
    sheet(s.hidden,undefined,'two');sheet(s.shown,undefined,'grabber');assert.ok(!find(s.hidden,n=>n.type==='SheetDragBar'),'Grabber should be hidden');
    const bar=bounds(find(s.shown,n=>n.type==='SheetDragBar'));let contrast=false;
    for(let y=bar.y;y<bar.bottom;y++)for(let x=bar.x;x<bar.right;x++){if(pixel(s.shown,x,y).some(v=>v<200))contrast=true;}
    assert.ok(contrast,'Grabber pixels missing');
  }else if(id==='S10'){
    sheet(s.before,.35);sheet(s.interactive,.35,'undimmed');sheet(s.dimmed,.75,'undimmed');
    assert.equal(parentPresses(s.interactive),parentPresses(s.before)+1,'Parent did not receive real tap');
    const mask=find(s.dimmed,n=>n.type==='SheetWrapper');assert.ok(mask.backgroundColor&&mask.backgroundColor!=='#00000000','Missing dimmed mask');
    closed(s['masked-closed'],'/sheet-cases');assert.equal(parentPresses(s['masked-closed']),parentPresses(s.interactive),'Mask tap passed through to parent');
  }else if(['S11','S12'].includes(id)){
    const blocked=Object.entries(s).filter(([key])=>key!=='closed').map(([,value])=>value);unchanged(blocked);
    const initial=sheet(s.before);for(const sample of blocked)assert.ok(Math.abs(sheet(sample).height-initial.height)<8,'Blocked dismissal moved sheet');closed(s.closed,'/sheet-cases');
  }else if(id==='S13'){
    const a=sheet(s.square,.5,'square'),b=sheet(s.round,.5,'radius');
    assert.ok(pixel(s.square,a.x+3,a.y+3).every(v=>v>240),'Zero radius must have square white corners');
    assert.ok(pixel(s.round,b.x+3,b.y+3).some(v=>v<240),'Rounded corner missing');
    assert.notDeepEqual(pixel(s.square,a.x+a.width/2,a.y-4),pixel(s.round,b.x+b.width/2,b.y-4),'Elevation has no visible shadow difference');
  }else if(id==='S14'){
    unchanged(Object.values(s));for(const sample of Object.values(s))sheet(sample,.35);
    assert.ok(s.portrait.image.height>s.portrait.image.width);assert.ok(s.landscape.image.width>s.landscape.image.height);assert.equal(s.restored.image.width,s.portrait.image.width);
  }else if(['S15','S16'].includes(id)){sheet(s.before);closed(s.closed);assert.equal(s.before.boot,s.closed.boot);assert.equal(s.before.pid,s.closed.pid);const lifecycle=event(s.closed,'A_SHEET_TRANSITION');assert.equal(lifecycle.phase,'end');assert.equal(lifecycle.closing,true);}
  else if(id==='S17'){sheet(s.before);closed(s.reloaded);assert.equal(s.before.pid,s.reloaded.pid);assert.notEqual(s.before.boot,s.reloaded.boot);assert.equal(s.before.hapSha256,s.reloaded.hapSha256);}
  else if(id==='N01'){
    for(const key of ['home','gesture-closed']){visibleText(s[key],'Drawer Home');assert.equal(event(s[key],'STEP3_DRAWER').status,'closed');}
    for(const key of ['gesture-open','button-open']){visibleText(s[key],'Drawer Second');assert.equal(event(s[key],'STEP3_DRAWER').status,'open');}
    for(const key of ['second','interior']){visibleText(s[key],'Drawer Second Content');assert.equal(route(s[key]).pathname,'/drawer/second');assert.equal(event(s[key],'STEP3_DRAWER').status,'closed');}
    assert.notEqual(s['gesture-open'].screenshot.sha256,s.home.screenshot.sha256);closed(s.back);
  }else if(id==='N02'){unchanged([s.before,s.foreground]);assert.ok(Math.abs(sheet(s.before).height-sheet(s.foreground).height)<8);}
  else if(id==='N03'){visibleText(s.home,'Native Tabs Home');visibleText(s.settings,'Native Tabs Settings');visibleText(s['home-again'],'Native Tabs Home');assert.equal(route(s.settings).pathname,'/settings');assert.equal(route(s['home-again']).pathname,'/');}
  else throw new Error(`Unknown navigation case ${id}`);
}

function rawfiles(hap) {
  return JSON.parse(execFileSync('python3',['-c',`import zipfile,json,sys,hashlib
with zipfile.ZipFile(sys.argv[1]) as z:
 names=[n for n in z.namelist() if n.startswith('resources/rawfile/expo-font/') or n=='resources/rawfile/expo-asset/data.json']
 assert len(names)==len(set(names)), 'Duplicate HAP entries'
 print(json.dumps({n:{'sha256':hashlib.sha256(z.read(n)).hexdigest(),'text':z.read(n).decode() if n.endswith('.json') else None} for n in names}))`,hap],{encoding:'utf8',maxBuffer:4*1024*1024}));
}
function verifyResources(root,run,samples) {
  const initial=samples.R01.initial,reload=samples.R01.reload,updated=samples.R02.updated,removed=samples.R03.removed;
  const probes=[initial,reload,updated,removed].map(s=>event(s,'A_RESOURCE_PROBE'));
  for(const [i,s] of [initial,reload,updated,removed].entries()){
    const phase=['initial','initial','updated','removed'][i],probe=probes[i];assert.equal(probe.phase,phase);visibleText(s,`Resource phase: ${phase}`);
    assert.equal(probe.markerBefore,i!==0,'Persistent marker lost or stale install reused');
    const build=run.builds.find(b=>b.id===s.buildId),hap=path.join(root,build.hap.path),files=rawfiles(hap);
    if(phase==='removed'){
      assert.ok(!probe.fonts.includes('EmbeddedIcons'));assert.equal(probe.rejected,true);assert.equal(probe.text,null);
      assert.ok(!files['resources/rawfile/expo-asset/data.json']);assert.ok(!files['resources/rawfile/expo-font/fonts/EmbeddedIcons.ttf']);
      if(files['resources/rawfile/expo-font/fonts.json'])assert.deepEqual(JSON.parse(files['resources/rawfile/expo-font/fonts.json'].text),[]);
    }else{
      const expected=`{ "embedded": "${phase}" }\n`;assert.equal(probe.text,expected);assert.equal(probe.rejected,false);assert.ok(probe.fonts.includes('EmbeddedIcons'));
      assert.equal(files['resources/rawfile/expo-asset/data.json']?.text,expected,'HAP rawfile bytes differ');
      const glyph=PNG.sync.read(readRef(root,s.glyph),{checkCRC:true});
      const glyphBounds=bounds(find(s,n=>[n.id,n.description].some(value=>value?.includes('embedded-font-glyph'))));
      let compared=0,matching=0;
      for(let y=0;y<glyph.height;y+=Math.max(1,Math.floor(glyph.height/24)))for(let x=0;x<glyph.width;x+=Math.max(1,Math.floor(glyph.width/24))){
        const offset=(y*glyph.width+x)*4,alpha=glyph.data[offset+3]/255;if(alpha<.5)continue;
        const actual=pixel(s,glyphBounds.x+(x+.5)*glyphBounds.width/glyph.width,glyphBounds.y+(y+.5)*glyphBounds.height/glyph.height);
        const expected=[0,1,2].map(i=>glyph.data[offset+i]*alpha+255*(1-alpha));compared++;if(actual.every((v,i)=>Math.abs(v-expected[i])<25))matching++;
      }
      assert.ok(compared>=8&&matching/compared>.9,'Rendered glyph is not visible in screenshot');assert.ok(probe.png?.uri?.startsWith('file:///'),'No real rendered PNG');
      const checks=JSON.parse(execFileSync('python3',[path.join(repository,'scripts/sdk54/abc/a-check-font.py')],{input:JSON.stringify({hap,png:path.join(root,s.glyph.path),metadata:probe.png}),encoding:'utf8'}));assert.ok(checks.glyphIoU>.95);
    }
  }
  for(let i=1;i<4;i++)assert.ok(Date.parse([initial,reload,updated,removed][i].at)>Date.parse([initial,reload,updated,removed][i-1].at),'Resource phases out of order');
  assert.equal(initial.pid,reload.pid,'Reload restarted process');assert.notEqual(initial.boot,reload.boot,'Reload retained old runtime');assert.equal(initial.hapSha256,reload.hapSha256);
  assert.equal(probes[0].cacheUri,probes[1].cacheUri);assert.equal(probes[0].cacheUri,probes[2].cacheUri,'Update changed URI instead of testing stale cache');
  assert.notEqual(initial.hapSha256,updated.hapSha256);assert.notEqual(updated.hapSha256,removed.hapSha256);
  // B must supply the actual installation command transcript; replacement may restart PID, reload may not.
  for(const phase of ['updated','removed']){
    const sample=phase==='updated'?updated:removed;const install=JSON.parse(readRef(root,run.builds.find(b=>b.id===sample.buildId).install));
    assert.equal(install.hapSha256,sample.hapSha256);assert.equal(install.target,run.device.target);assert.equal(install.exitCode,0);
    assert.equal(install.argv?.[install.argv.indexOf('-t')+1],run.device.target,'Install targeted wrong device');
    assert.ok(Array.isArray(install.argv)&&install.argv.includes('install')&&install.argv.includes('-r')&&!install.argv.includes('uninstall'),'Update must preserve app data');
  }
}

export function verifyDevice(kind,root) {
  scenario(kind);const run=json(path.join(root,'a-device-evidence.json'));assert.equal(run.schemaVersion,1);assert.equal(run.scenario,kind);
  assert.ok(['LOCAL','CANDIDATE'].includes(run.scope),'Missing explicit evidence scope');assert.ok(run.runId,'Missing run ID');
  assert.ok(Date.parse(run.startedAt)<=Date.parse(run.endedAt),'Invalid run dates');
  for(const key of ['target','systemVersion','bundle'])assert.ok(typeof run.device?.[key]==='string'&&run.device[key],`Missing device ${key}`);
  const candidate=JSON.parse(readRef(root,run.candidate));assert.deepEqual(candidate.failures,[]);assert.equal(candidate.packages?.length,15,'Incomplete candidate');
  for(const expected of createReleaseManifest().packages)assert.ok(candidate.packages.some(p=>p.name===expected.publishName&&p.version===expected.publishVersion),'Candidate package identity mismatch');
  assert.equal(new Set(candidate.packages.map(p=>p.name)).size,candidate.packages.length,'Duplicate packages');
  for(const p of candidate.packages){const bytes=readRef(path.dirname(path.join(root,run.candidate.path)),{path:p.file,sha256:p.sha256});assert.equal(bytes.length,p.bytes);}
  assert.ok(run.builds?.length>0,'Missing HAP');assert.equal(new Set(run.builds.map(b=>b.id)).size,run.builds.length,'Duplicate HAP ID');
  for(const b of run.builds){readRef(root,b.hap);assert.equal(b.candidateSha256,run.candidate.sha256,'Build candidate mismatch');
    const state=JSON.parse(readRef(root,b.generatedState));assert.equal(state.schemaVersion,1);assert.ok(Array.isArray(state.resources),'Missing original generated resource state');
    const hap=path.join(root,b.hap.path);
    const module=JSON.parse(execFileSync('python3',['-c',"import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(z.read('module.json').decode())",hap],{encoding:'utf8'}));
    assert.equal(module.app?.bundleName,run.device.bundle,'HAP bundle identity mismatch');
    if(kind==='resources'){
      const files=rawfiles(hap);
      for(const resource of state.resources.filter(r=>['expo-font','expo-asset'].includes(r.owner))){
        const entry=resource.target.replace(/^entry\/src\/main\//,'');assert.equal(files[entry]?.sha256,resource.sha256,'Generated state/HAP mismatch');
      }
      for(const [entry,value] of Object.entries(files))assert.ok(state.resources.some(r=>r.target==='entry/src/main/'+entry&&r.sha256===value.sha256),'HAP resource missing generation ownership');
    }
  }
  const required=kind==='navigation'?Object.fromEntries(contract.cases.filter(c=>c.captures.length).map(c=>[c.caseId,c.captures])):resourceCases;
  assert.deepEqual(Object.keys(run.cases??{}).sort(),Object.keys(required).sort(),'Incomplete or unexpected case set');
  const decoded={},captureIds=new Set();
  for(const [id,keys] of Object.entries(required)){
    assert.deepEqual(Object.keys(run.cases[id]).sort(),[...keys].sort(),`Missing captures: ${id}`);
    decoded[id]=Object.fromEntries(keys.map(key=>[key,readCapture(root,run,run.cases[id][key])]));
    for(const key of keys){assert.ok(typeof decoded[id][key].id==='string'&&!captureIds.has(decoded[id][key].id),'Missing or reused capture ID');captureIds.add(decoded[id][key].id);}
    const dates=keys.map(key=>Date.parse(decoded[id][key].at));for(let i=1;i<dates.length;i++)assert.ok(dates[i]>=dates[i-1],'Capture sequence reversed');
    if(kind==='navigation')verifyNavigationCase(id,decoded[id]);
  }
  if(kind==='resources')verifyResources(root,run,decoded);
  return {schemaVersion:1,scenario:kind,scope:run.scope,runId:run.runId,verifiedCaseIds:Object.keys(required),candidateSha256:run.candidate.sha256,stageClaims:{step3:false,M4:false,M5:false,V:false}};
}
if(isMain(import.meta.url)){
  try{const args=options(['scenario','run-dir'],'a-verify-device.mjs --scenario resources|navigation --run-dir <saved evidence directory>');if(args)console.log(JSON.stringify(verifyDevice(args.scenario,path.resolve(args['run-dir'])),null,2));}
  catch(error){console.error(error.stack);process.exitCode=1;}
}
