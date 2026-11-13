import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import jpeg from 'jpeg-js';
import {PNG} from 'pngjs';
import {sha256} from '../abc/a-common.mjs';
import {verifyDefaultRun} from '../abc/a-verify-default.mjs';

const ids=['initial','modal','returned','explore','images','home','modal-back','back','cold'];
function fixture(t,hapBundle='dev.expo.harmony.a.defaultlocal') {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'a-default-evidence-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const write=(name,value)=>{
    const bytes=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:JSON.stringify(value));
    const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
    return {path:name,sha256:sha256(bytes)};
  };
  const source={width:20,height:20,data:Buffer.alloc(20*20*4)};
  for(let y=5;y<15;y++)for(let x=5;x<15;x++)source.data.set([10,120,180,255],(y*20+x)*4);
  const png=PNG.sync.write(source),home=write('fixtures/home.png',png),explore=write('fixtures/explore.png',png);
  write('archive/module.json',{app:{bundleName:hapBundle}});
  write('archive/home.png',png);write('archive/explore.png',png);
  execFileSync('python3',['-c',`import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(root/'default.hap','w') as z:
 for p in (root/'archive').iterdir(): z.write(p,p.name)
`,root]);
  const hap={path:'default.hap',sha256:sha256(fs.readFileSync(path.join(root,'default.hap')))};
  const target='test-target',bundle='dev.expo.harmony.a.defaultlocal';
  const install={argv:['/sdk/hdc','-t',target,'install','/historical/default.hap'],exitCode:0,logs:[write('install.stdout.log','install bundle successfully'),write('install.stderr.log','')]};
  const manifest={scope:'LOCAL',target,bundle,hap,install:write('install.json',install),sources:{home:{...home,hapMember:'home.png'},explore:{...explore,hapMember:'explore.png'}},captures:[]};
  const observations={},commandLists={},layouts={};
  for(const [index,id] of ids.entries()){
    const pid=id==='cold'?'124':'123',modal=id.startsWith('modal'),isExplore=['explore','images'].includes(id);
    const screen={width:240,height:240,data:Buffer.alloc(240*240*4)};
    for(let y=0;y<240;y++)for(let x=0;x<240;x++){
      const ink=x>=30&&x<170&&y>=10&&y<20,solid=x>=80&&x<160&&y>=80&&y<160;
      screen.data.set(ink?[20,20,20,255]:solid?[10,120,180,255]:isExplore?[255,255,255,255]:[161,206,220,255],(y*240+x)*4);
    }
    const title=modal?'This is a modal':isExplore?'This app includes example code to help you get started.':'Welcome!';
    const layout={attributes:{bounds:'[0,0][240,240]'},children:[{attributes:{bundleName:bundle},children:[
      {attributes:{visible:'true',text:title,bounds:'[20,5][220,25]'}},
      {attributes:{visible:'true',id:'ViewManagerAdapter_ExpoImage(8)',bounds:'[40,40][200,200]'}},
    ]}]};
    const log=`11-13 10:00:00.001 ${pid} ${pid} W A0beef/#RNOH_ARK: TypeError: Cannot read property getWindowName of undefined\n`;
    const prefix=`captures/${id}/`,layoutRef=write(prefix+'layout.json',layout),imageRef=write(prefix+'screen.jpeg',jpeg.encode(screen,95).data),logRef=write(prefix+'device.log',log);
    const remote='/data/local/tmp/'+id;
    const command=(args,stdout)=>({argv:['/sdk/hdc','-t',target,...args],exitCode:0,stdout,stderr:''});
    const commands=[
      command(['shell','pidof',bundle],pid+'\n'),
      command(['shell','uitest','dumpLayout','-p',remote+'.json'],'DumpLayout saved to:'+remote+'.json'),
      command(['file','recv',remote+'.json','/historical/'+prefix+'layout.json'],'FileTransfer finish, Size:'+fs.statSync(path.join(root,layoutRef.path)).size+', File count = 1'),
      command(['shell','snapshot_display','-f',remote+'.jpeg'],'success: snapshot display 0 , write to '+remote+'.jpeg as jpeg, width: 240, height: 240'),
      command(['file','recv',remote+'.jpeg','/historical/'+prefix+'screen.jpeg'],'FileTransfer finish, Size:'+fs.statSync(path.join(root,imageRef.path)).size+', File count = 1'),
      command(['shell','hilog','-x','-P',pid],log),
      command(['shell','pidof',bundle],pid+'\n'),
    ];
    commands.forEach((c,i)=>{c.start=new Date(Date.UTC(2026,10,13,0,index,i)).toISOString();c.end=new Date(Date.UTC(2026,10,13,0,index,i,100)).toISOString();});
    const refs=[layoutRef,imageRef,logRef,write(prefix+'commands.json',commands)].map(ref=>({...ref,path:path.basename(ref.path)}));
    const observation={target,bundle,pid,hapSha256:hap.sha256,files:refs};
    manifest.captures.push({id,...write(prefix+'observation.json',observation)});
    observations[id]=observation;commandLists[id]=commands;layouts[id]=layout;
  }
  function saveCapture(id,file,value){
    const ref=write(`captures/${id}/${file}`,value),observation=observations[id];
    const index=observation.files.findIndex(f=>f.path===file);observation.files[index]={...ref,path:file};
  }
  function flush(){
    manifest.install=write('install.json',install);
    manifest.captures=ids.map(id=>({id,...write(`captures/${id}/observation.json`,observations[id])}));
    write('default-run.json',manifest);
  }
  flush();return {root,manifest,install,observations,commandLists,layouts,saveCapture,flush};
}

test('default evidence replays outside original machine paths and preserves nonfatal RNOH warnings',t=>{
  const f=fixture(t);assert.equal(verifyDefaultRun(f.root).cases.length,9);
});
test('default evidence rejects a HAP belonging to another app',t=>{
  const f=fixture(t,'another.app');assert.throws(()=>verifyDefaultRun(f.root),/HAP bundle/);
});
test('default evidence rejects a fake installer or extra command arguments',async t=>{
  for(const [name,mutate] of [
    ['echo instead of hdc',f=>f.install.argv[0]='/bin/echo'],
    ['extra install args',f=>f.install.argv.push('default.hap')],
    ['contradictory success',f=>fs.writeFileSync(path.join(f.root,'install.stdout.log'),'[Fail] install bundle successfully')],
  ])await t.test(name,t=>{const f=fixture(t);mutate(f);f.install.logs[0].sha256=sha256(fs.readFileSync(path.join(f.root,'install.stdout.log')));f.flush();assert.throws(()=>verifyDefaultRun(f.root),/HDC|install|failed/i);});
});
test('default evidence rejects missing, failed, reordered and mismatched capture commands',async t=>{
  for(const [name,mutate] of [
    ['no PID observations',c=>{c.splice(6,1);c.splice(0,1);}],
    ['PID changed during capture',c=>c[6].stdout='999\n'],
    ['fake capture executable',c=>c.forEach(x=>x.argv[0]='/bin/echo')],
    ['snapshot exit zero but failed',c=>c[3].stdout='[Fail] unsupported snapshot format'],
    ['missing screenshot transfer',c=>c.splice(4,1)],
    ['wrong transfer source',c=>c[4].argv[5]='/data/local/tmp/stale.jpeg'],
    ['wrong transferred byte count',c=>c[4].stdout='FileTransfer finish, Size:1, File count = 1'],
    ['out of order timestamps',c=>c[3].start='2025-01-01T00:00:00Z'],
    ['missing hilog and empty raw log',c=>c.splice(5,1)],
    ['empty command list',c=>c.splice(0)],
  ])await t.test(name,t=>{
    const f=fixture(t),commands=f.commandLists.initial;mutate(commands);
    if(name==='missing hilog and empty raw log')f.saveCapture('initial','device.log','');
    f.saveCapture('initial','commands.json',commands);f.flush();
    assert.throws(()=>verifyDefaultRun(f.root),/PID|HDC|capture|transfer|snapshot|chronolog|hilog|command/i);
  });
});
test('default evidence rejects another app layout, inconsistent viewport and duplicate file references',async t=>{
  for(const [name,mutate] of [
    ['foreign app',f=>f.layouts.initial.children[0].attributes.bundleName='another.app'],
    ['wrong viewport',f=>f.layouts.initial.attributes.bounds='[0,0][100,100]'],
    ['duplicate file',f=>f.observations.initial.files.push({...f.observations.initial.files[0]})],
  ])await t.test(name,t=>{
    const f=fixture(t);mutate(f);
    if(name!=='duplicate file'){
      f.saveCapture('initial','layout.json',f.layouts.initial);
      f.commandLists.initial[2].stdout='FileTransfer finish, Size:'+fs.statSync(path.join(f.root,'captures/initial/layout.json')).size+', File count = 1';
      f.saveCapture('initial','commands.json',f.commandLists.initial);
    }
    f.flush();assert.throws(()=>verifyDefaultRun(f.root),/bundle|viewport|Duplicate/);
  });
});
