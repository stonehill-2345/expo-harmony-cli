import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import jpeg from 'jpeg-js';
import {PNG} from 'pngjs';
import {isMain,readRef} from './a-common.mjs';

const cases=['initial','modal','returned','explore','images','home','modal-back','back','cold'];
const bounds=a=>a.bounds.match(/-?\d+/g).map(Number);
const rgba=(im,x,y)=>Array.from(im.data.subarray((y*im.width+x)*4,(y*im.width+x)*4+4));
const near=(a,b,tolerance)=>a.every((v,i)=>Math.abs(v-b[i])<=tolerance);
function nodes(root,bundle=''){
  const owner=root.attributes?.bundleName||bundle;
  return [...(root.attributes?[{...root.attributes,bundleName:owner}]:[]),...(root.children??[]).flatMap(child=>nodes(child,owner))];
}

function checkHdc(command,target) {
  assert.ok(Array.isArray(command.argv)&&command.argv.every(a=>typeof a==='string'),'Invalid HDC command');
  assert.equal(path.basename(command.argv[0]),'hdc','Expected HDC executable');
  assert.deepEqual(command.argv.slice(1,3),['-t',target],'HDC target mismatch');
  assert.equal(command.exitCode,0,'HDC command failed');
}
function checkOutput(command) {
  assert.ok(typeof command.stdout==='string'&&typeof command.stderr==='string','Missing HDC output');
  assert.ok(!/\[Fail\]|\berror\s*:|\bfailed\b/i.test(command.stdout+'\n'+command.stderr),'HDC command failed despite exit code');
}

function verifyCaptureCommands(commands,observation,files,capturePath) {
  assert.ok(Array.isArray(commands)&&commands.length>=7,'Incomplete capture command list');
  let end=-Infinity;
  for(const command of commands){
    checkHdc(command,observation.target);
    const start=Date.parse(command.start),next=Date.parse(command.end);
    assert.ok(Number.isFinite(start)&&Number.isFinite(next)&&start>=end&&next>=start,'Invalid capture chronology');end=next;
    // App hilog can contain nonfatal platform errors; interpret command status
    // only for device operations, not the contents of an application log.
    if(command.argv[4]!=='hilog')checkOutput(command);
  }
  const find=args=>commands.map((c,i)=>({c,i})).filter(({c})=>JSON.stringify(c.argv.slice(3))===JSON.stringify(args));
  const pids=find(['shell','pidof',observation.bundle]);
  assert.equal(pids.length,2,'Require PID observations before and after capture');
  pids.forEach(({c})=>assert.equal(c.stdout.trim(),observation.pid,'PID changed during capture'));
  const log=find(['shell','hilog','-x','-P',observation.pid]);assert.equal(log.length,1,'Missing or duplicate hilog command');
  assert.equal(log[0].c.stdout,files['device.log'].toString(),'Captured hilog differs from raw output');
  const logPids=[...files['device.log'].toString().matchAll(/^\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(\d+)\s+\d+\s+[A-Z]\s/gm)].map(m=>m[1]);
  assert.ok(logPids.length>0&&logPids.every(pid=>pid===observation.pid),'Hilog PID does not match capture');
  const transfers=[];
  for(const name of ['layout.json','screen.jpeg']){
    const recv=commands.map((c,i)=>({c,i})).filter(({c})=>c.argv.length===7&&c.argv[3]==='file'&&c.argv[4]==='recv'&&path.basename(c.argv[6])===name);
    assert.equal(recv.length,1,`Missing or duplicate capture transfer: ${name}`);
    const {c,i}=recv[0],remote=c.argv[5];
    assert.equal(path.basename(path.dirname(c.argv[6])),path.basename(path.dirname(capturePath)),'Capture transfer destination mismatch');
    const size=c.stdout.match(/FileTransfer finish,\s*Size:(\d+),\s*File count = 1\b/);
    assert.ok(size&&Number(size[1])===files[name].length,`Capture transfer byte count mismatch: ${name}`);
    const produced=find(name==='layout.json'?['shell','uitest','dumpLayout','-p',remote]:['shell','snapshot_display','-f',remote]);
    assert.equal(produced.length,1,`Missing capture producer: ${name}`);
    assert.ok(produced[0].c.stdout.includes(name==='layout.json'?'DumpLayout saved to:'+remote:'write to '+remote+' as jpeg'),`Missing capture success: ${name}`);
    assert.ok(pids[0].i<produced[0].i&&produced[0].i<i&&i<log[0].i&&log[0].i<pids[1].i,'Invalid capture command order');
    transfers.push({producer:produced[0].i,received:i});
  }
  assert.ok(transfers[0].received<transfers[1].producer,'Screenshot precedes layout capture');
  return {start:Date.parse(commands[0].start),end};
}

// Default uses centered cover. Ignore only interpolation edges predicted from
// the source PNG, then compare both opaque pixels and transparent background.
export function compareDefaultImage(screen,source,box,background) {
  const [x1,y1,x2,y2]=box,w=x2-x1,h=y2-y1;
  assert.ok(w>0&&h>0&&x1>=0&&y1>=0&&x2<=screen.width&&y2<=screen.height,'Invalid image bounds');
  const scale=Math.max(w/source.width,h/source.height),left=x1+(w-source.width*scale)/2,top=y1+(h-source.height*scale)/2;
  let checked=0,matched=0,opaque=0;
  for(let row=0;row<40;row++)for(let col=0;col<40;col++){
    const x=Math.floor(x1+(col+.5)*w/40),y=Math.floor(y1+(row+.5)*h/40);
    const sx=Math.min(source.width-1,Math.max(0,Math.floor((x-left)/scale))),sy=Math.min(source.height-1,Math.max(0,Math.floor((y-top)/scale)));
    const color=rgba(source,sx,sy);
    if(color[3]!==0&&color[3]!==255)continue;
    if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>!near(color,rgba(source,Math.max(0,Math.min(source.width-1,sx+dx)),Math.max(0,Math.min(source.height-1,sy+dy))),8)))continue;
    const expected=color[3]===255?color.slice(0,3):background;
    checked++;if(color[3]===255)opaque++;
    if(near(rgba(screen,x,y).slice(0,3),expected,24))matched++;
  }
  assert.ok(checked>=800&&opaque>=100&&matched/checked>=.98,`Default image mismatch: ${matched}/${checked}, opaque ${opaque}`);
  return {checked,matched,opaque,ratio:matched/checked};
}

export function verifyDefaultPage(layout,screen,id,bundle) {
  const visible=nodes(layout).filter(a=>a.visible==='true'&&(!bundle||a.bundleName===bundle));
  if(bundle)assert.ok(visible.length>0,'Layout bundle does not match HAP');
  const modal=['modal','modal-back'].includes(id),explore=['explore','images'].includes(id);
  const title=modal?'This is a modal':explore?'This app includes example code to help you get started.':'Welcome!';
  const matches=visible.filter(a=>a.text===title);assert.equal(matches.length,1,`Missing/duplicate page title: ${title}`);
  if(!modal)assert.ok(!visible.some(a=>a.text==='This is a modal'),'Modal remains after return');
  // A covered native screen may still report visible=true. Require rendered ink
  // at the title bounds, so a layout tree behind a white modal is insufficient.
  const [x1,y1,x2,y2]=bounds(matches[0]);
  assert.ok(x1>=0&&y1>=0&&x2<=screen.width&&y2<=screen.height,'Title outside screenshot');
  let ink=0,total=0;
  for(let y=y1;y<y2;y+=2)for(let x=x1;x<x2;x+=2){total++;if(rgba(screen,x,y).slice(0,3).every(v=>v<100))ink++;}
  assert.ok(total>0&&ink/total>.02,`Page title has no rendered ink: ${title}`);
  return visible;
}

export function verifyDefaultRun(directory) {
  const root=fs.realpathSync(directory),read=ref=>readRef(root,ref);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'default-run.json')));
  assert.equal(manifest.scope,'LOCAL');assert.deepEqual(manifest.captures.map(c=>c.id),cases);
  assert.ok(typeof manifest.target==='string'&&manifest.target.trim(),'Missing device target');
  assert.ok(typeof manifest.bundle==='string'&&manifest.bundle.trim(),'Missing bundle name');
  read(manifest.hap);
  const hap=path.join(root,manifest.hap.path);
  const module=JSON.parse(execFileSync('unzip',['-p',hap,'module.json'],{encoding:'utf8'}));
  assert.equal(module.app?.bundleName,manifest.bundle,'HAP bundle does not match manifest');
  const install=JSON.parse(read(manifest.install));checkHdc(install,manifest.target);
  assert.ok(install.argv.length===5||(install.argv.length===6&&install.argv[4]==='-r'),'Unexpected install arguments');
  assert.equal(install.argv[3],'install');
  assert.equal(path.basename(install.argv.at(-1)),path.basename(manifest.hap.path),'Installed HAP does not match manifest');
  assert.equal(install.logs?.length,2,'Missing install stdout/stderr');
  const stdout=read(install.logs[0]).toString(),stderr=read(install.logs[1]).toString();
  checkOutput({stdout,stderr});assert.match(stdout,/install bundle successfully/);
  assert.deepEqual(Object.keys(manifest.sources).sort(),['explore','home'],'Missing image sources');
  const sources=Object.fromEntries(Object.entries(manifest.sources).map(([name,ref])=>{
    const bytes=read(ref);assert.deepEqual(execFileSync('unzip',['-p',path.join(root,manifest.hap.path),ref.hapMember]),bytes,'PNG differs from HAP');
    return [name,PNG.sync.read(bytes)];
  }));
  let firstPid,previousEnd=-Infinity;const results=[];
  for(const capture of manifest.captures){
    const observation=JSON.parse(read(capture));
    assert.equal(observation.target,manifest.target);assert.equal(observation.bundle,manifest.bundle);assert.equal(observation.hapSha256,manifest.hap.sha256);
    assert.match(observation.pid,/^[1-9]\d*$/);
    firstPid??=observation.pid;
    if(capture.id==='cold')assert.notEqual(observation.pid,firstPid,'Cold start reused PID');else assert.equal(observation.pid,firstPid,'Unexpected process change');
    assert.ok(Array.isArray(observation.files),'Missing capture files');
    assert.equal(new Set(observation.files.map(f=>f.path)).size,observation.files.length,'Duplicate capture file');
    const files=Object.fromEntries(observation.files.map(f=>{
      assert.ok(typeof f.path==='string'&&path.basename(f.path)===f.path,'Invalid capture filename');
      return [f.path,read({path:path.join(path.dirname(capture.path),f.path),sha256:f.sha256})];
    }));
    for(const name of ['layout.json','screen.jpeg','device.log','commands.json'])assert.ok(files[name],`Missing capture file: ${name}`);
    const commands=JSON.parse(files['commands.json']);
    const timing=verifyCaptureCommands(commands,observation,files,capture.path);
    assert.ok(timing.start>=previousEnd,'Capture chronology overlaps or reverses');previousEnd=timing.end;
    const log=files['device.log'].toString();
    assert.ok(!/Native Harmony view is not registered|Cannot find native module|ERR_IMAGE_(?:SOURCE|LOAD|UNSUPPORTED)/.test(log),'Native image/module error');
    const screen=jpeg.decode(files['screen.jpeg'],{useTArray:true});
    const layout=JSON.parse(files['layout.json']);
    assert.deepEqual(bounds(layout.attributes),[0,0,screen.width,screen.height],'Layout viewport differs from screenshot');
    const visible=verifyDefaultPage(layout,screen,capture.id,manifest.bundle);
    let pixels=null;
    if(['initial','returned','images','home','back','cold'].includes(capture.id)){
      const views=visible.filter(a=>a.id?.startsWith('ViewManagerAdapter_ExpoImage('));assert.equal(views.length,1,'Expected one ExpoImage');
      pixels=compareDefaultImage(screen,sources[capture.id==='images'?'explore':'home'],bounds(views[0]),capture.id==='images'?[255,255,255]:[161,206,220]);
    }
    results.push({id:capture.id,status:'PASS',pid:observation.pid,pixels});
  }
  return {scope:'LOCAL',stageClosable:false,hapSha256:manifest.hap.sha256,cases:results};
}
if(isMain(import.meta.url)){
  try{const {values}=parseArgs({options:{'run-dir':{type:'string'}}});assert.ok(values['run-dir'],'--run-dir required');console.log(JSON.stringify(verifyDefaultRun(values['run-dir']),null,2));}
  catch(error){console.error(error.stack);process.exitCode=1;}
}
