import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';
import {PNG} from 'pngjs';
import {parseArgs} from 'node:util';
import {execFileSync} from 'node:child_process';
import {isMain,sha256} from './a-common.mjs';

export const imageCases=[
  ['initial','load','first','contain'],['replace','load','second','contain'],
  ['missing','loadError',null,'contain'],['unsupported','unsupported',null,'contain'],
  ['recover','load','first','contain'],['cover','quiet','first','cover'],
  ['fill','quiet','first','fill'],['contain','quiet','first','contain'],
  ['reload','load','first','contain'],['unmount','quiet',null,'contain'],
  ['remount','load','first','contain'],['prefetch','prefetch','first','contain'],
];
const pixel=(image,x,y)=>Array.from(image.data.subarray((y*image.width+x)*4,(y*image.width+x)*4+3));
const near=(a,b,tolerance)=>a.every((v,i)=>Math.abs(v-b[i])<=tolerance);
export function compareImagePixels(screen,source,bounds,fit) {
  const [x1,y1,x2,y2]=bounds,w=x2-x1,h=y2-y1;
  assert.ok(w>0&&h>0&&x1>=0&&y1>=0&&x2<=screen.width&&y2<=screen.height,'Image bounds outside screenshot');
  assert.ok(['cover','contain','fill'].includes(fit));
  const scale=source?(fit==='cover'?Math.max(w/source.width,h/source.height):Math.min(w/source.width,h/source.height)):1;
  const dw=source?(fit==='fill'?w:source.width*scale):0,dh=source?(fit==='fill'?h:source.height*scale):0;
  let checked=0,matched=0;
  for(let row=0;row<30;row++)for(let col=0;col<40;col++){
    const x=Math.floor(x1+(col+.5)*w/40),y=Math.floor(y1+(row+.5)*h/30);
    let expected=[238,238,238];
    if(source){
      const left=x1+(w-dw)/2,top=y1+(h-dh)/2;
      // ArkUI rounds fractional layout edges to device pixels.
      if([x-left,x-left-dw,y-top,y-top-dh].some(d=>Math.abs(d)<2))continue;
      const sx=(x-x1-(w-dw)/2)/dw*source.width,sy=(y-y1-(h-dh)/2)/dh*source.height;
      if(sx>=0&&sy>=0&&sx<source.width&&sy<source.height){
        const ix=Math.floor(sx),iy=Math.floor(sy);expected=pixel(source,ix,iy);
        // Exclude decoder interpolation at color boundaries, not incorrect areas.
        if([-1,1].some(d=>!near(expected,pixel(source,Math.max(0,Math.min(source.width-1,ix+d)),iy),0)))continue;
      }
    }
    checked++;if(near(pixel(screen,x,y),expected,24))matched++;
  }
  const ratio=matched/checked;
  assert.ok(checked>=800&&ratio>=.98,`Image pixel mismatch: ${matched}/${checked} (${ratio}) for ${fit}`);
  return {checked,matched,ratio};
}
export function verifyImageEvents(events,kind,after,boot,sourceName,source) {
  const current=events.filter(e=>e.sequence>after);
  current.forEach((e,i)=>{assert.equal(e.boot,boot,'Old runtime event');assert.equal(e.sequence,after+i+1,'Missing or duplicate event');});
  const names=kind==='load'?['loadStart','load','loadEnd','display']:['loadError','unsupported'].includes(kind)?['loadStart','error','loadEnd']:kind==='prefetch'?['prefetchRejected']:[];
  assert.deepEqual(current.map(e=>e.name),names,'Unexpected image event order');
  if(kind==='load'){
    const payload=current[1].payload;
    assert.equal(payload.source.url,`asset://${sourceName}.png`);assert.equal(payload.source.width,source.width);assert.equal(payload.source.height,source.height);
    assert.equal(payload.source.mediaType,null);assert.equal(payload.cacheType,'none');
  }else if(kind==='loadError')assert.match(current[1].payload.error,/ERR_IMAGE_LOAD/);
  else if(kind==='unsupported')assert.match(current[1].payload.error,/ERR_IMAGE_UNSUPPORTED/);
  else if(kind==='prefetch')assert.equal(current[0].payload.code,'ERR_IMAGE_UNSUPPORTED');
  return current.length?current.at(-1).sequence:after;
}
function nodes(root){const found=[];function walk(n){if(!n||typeof n!=='object')return;if(n.attributes)found.push(n.attributes);for(const c of n.children??[])walk(c);}walk(root);return found;}
export function verifyImageRun(directory) {
  const root=fs.realpathSync(directory),readRef=ref=>{
    assert.ok(ref&&typeof ref.path==='string'&&!path.isAbsolute(ref.path));
    const file=fs.realpathSync(path.resolve(root,ref.path));assert.ok(file.startsWith(root+path.sep),'Evidence escapes run');
    const bytes=fs.readFileSync(file);assert.equal(sha256(bytes),ref.sha256,'Evidence hash mismatch');return bytes;
  };
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'image-run.json')));
  assert.equal(manifest.scope,'LOCAL');assert.equal(manifest.bundle,'com.expo.aimage.local');
  assert.deepEqual(manifest.captures.map(c=>c.id),imageCases.map(c=>c[0]));
  readRef(manifest.hap);
  const install=JSON.parse(readRef(manifest.install));assert.equal(install.exitCode,0);
  const argv=install.argv;assert.deepEqual(argv.slice(-4,-1),['-t',manifest.target,'install']);
  // The installation command retains its original machine path. Verify the
  // archived input rather than requiring that historical path on replay.
  assert.equal(path.basename(argv.at(-1)),path.basename(manifest.hap.path));
  const installStdout=readRef(install.logs[0]).toString();assert.match(installStdout,/install bundle successfully/);
  const sources=Object.fromEntries(['first','second'].map(n=>{
    const bytes=readRef(manifest.sources[n]);
    assert.deepEqual(execFileSync('unzip',['-p',path.join(root,manifest.hap.path),`resources/rawfile/assets/${n}.png`]),bytes,'Fixture differs from installed HAP');
    return [n,PNG.sync.read(bytes)];
  }));
  let pid,boot,bounds,sequence=0;const results=[];
  for(let i=0;i<imageCases.length;i++){
    const [id,kind,name,fit]=imageCases[i],ref=manifest.captures[i];
    const observation=JSON.parse(readRef(ref));
    for(const f of observation.files)readRef({path:path.join(path.dirname(ref.path),f.path),sha256:f.sha256});
    assert.equal(observation.target,manifest.target);assert.equal(observation.bundle,manifest.bundle);assert.equal(observation.hapSha256,manifest.hap.sha256);
    assert.match(observation.pid,/^\d+$/);assert.match(observation.bootId,/^\d+$/);
    if(!pid){pid=observation.pid;boot=observation.bootId;}else{assert.equal(observation.pid,pid,'Process changed');assert.equal(observation.bootId,boot,'Runtime changed');}
    const file=n=>{const f=observation.files.find(f=>f.path===n);assert.ok(f,n);return readRef({path:path.join(path.dirname(ref.path),n),sha256:f.sha256});};
    const log=file('device.log').toString();
    const commands=JSON.parse(file('commands.json'));
    for(const c of commands){assert.deepEqual(c.argv.slice(1,3),['-t',manifest.target]);assert.equal(c.exitCode,0);}
    const logCommand=commands.find(c=>c.argv.slice(3).join(' ')===`shell hilog -x -P ${pid}`);
    assert.equal(logCommand?.stdout,log,'Log command does not match PID or captured bytes');
    assert.ok(!/runtime not ready|UNEXPECTED_PREFETCH_SUCCESS/.test(log),'Runtime error');
    const events=log.split('\n').filter(l=>l.includes('A_IMAGE_EVENT ')).map(l=>JSON.parse(l.split('A_IMAGE_EVENT ')[1]));
    assert.deepEqual(events,observation.events,'Event summary differs from raw log');
    sequence=verifyImageEvents(events,kind,sequence,boot,name,name?sources[name]:null);
    const views=nodes(JSON.parse(file('layout.json'))).filter(a=>a.id?.startsWith('ViewManagerAdapter_ExpoImage(')&&a.visible==='true');
    if(id==='unmount')assert.equal(views.length,0,'View remains after unmount');
    else {assert.equal(views.length,1,'Expected one native Image view');const actual=views[0].bounds.match(/-?\d+/g).map(Number);if(!bounds)bounds=actual;else assert.deepEqual(actual,bounds,'Image geometry changed');}
    const screen=jpeg.decode(file('screen.jpeg'),{useTArray:true});
    const pixels=compareImagePixels(screen,name?sources[name]:null,bounds,fit);
    results.push({id,status:'PASS',sequence,pixels});
  }
  return {scope:'LOCAL',stageClosable:false,target:manifest.target,pid,boot,hapSha256:manifest.hap.sha256,cases:results};
}
if(isMain(import.meta.url)){
  try{const {values}=parseArgs({options:{'run-dir':{type:'string'}}});assert.ok(values['run-dir'],'--run-dir required');console.log(JSON.stringify(verifyImageRun(values['run-dir']),null,2));}
  catch(error){console.error(error.stack);process.exitCode=1;}
}
