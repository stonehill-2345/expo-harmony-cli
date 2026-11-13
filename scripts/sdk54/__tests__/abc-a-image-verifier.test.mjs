import assert from 'node:assert/strict';
import test from 'node:test';
import {compareImagePixels,verifyImageEvents} from '../abc/a-verify-expo-image.mjs';
function image(width,height,color){
  const data=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set([...color(x,y),255],(y*width+x)*4);
  return {width,height,data};
}
const red=[255,0,0],blue=[0,0,255],white=[255,255,255],gray=[238,238,238];
const source=image(80,40,x=>x<30?red:x<50?white:blue);
const screens={
  cover:image(240,180,x=>x<75?red:x<165?white:blue),
  fill:image(240,180,x=>x<90?red:x<150?white:blue),
  contain:image(240,180,(x,y)=>y<30||y>=150?gray:x<90?red:x<150?white:blue),
};
test('pixel oracle distinguishes independently rasterized contain, cover and fill',()=>{
  for(const fit of Object.keys(screens))assert.equal(compareImagePixels(screens[fit],source,[0,0,240,180],fit).ratio,1);
});
test('fractional contain edges tolerate device pixel rounding',()=>{
  const portrait=image(40,80,x=>x<20?[0,128,0]:[255,255,0]);
  const rounded=image(840,630,x=>x<262||x>=578?gray:x<420?[0,128,0]:[255,255,0]);
  assert.equal(compareImagePixels(rounded,portrait,[0,0,840,630],'contain').ratio,1);
});
test('stretched cover, cropped fill, blank success and stale pixels after unload fail',()=>{
  assert.throws(()=>compareImagePixels(screens.fill,source,[0,0,240,180],'cover'),/mismatch/);
  assert.throws(()=>compareImagePixels(screens.cover,source,[0,0,240,180],'fill'),/mismatch/);
  assert.throws(()=>compareImagePixels(image(240,180,()=>gray),source,[0,0,240,180],'contain'),/mismatch/);
  assert.throws(()=>compareImagePixels(screens.contain,null,[0,0,240,180],'contain'),/mismatch/);
  assert.equal(compareImagePixels(image(240,180,()=>gray),null,[0,0,240,180],'contain').ratio,1);
});
const success=()=>[
  {boot:'1',sequence:1,name:'loadStart'},
  {boot:'1',sequence:2,name:'load',payload:{cacheType:'none',source:{url:'asset://first.png',width:80,height:40,mediaType:null}}},
  {boot:'1',sequence:3,name:'loadEnd'},
  {boot:'1',sequence:4,name:'display'},
];
test('native success has exactly one JS loadEnd and correct source metadata',()=>{
  assert.equal(verifyImageEvents(success(),'load',0,'1','first',source),4);
  for(const change of [events=>events.push({...events[2],sequence:5}),events=>events[1].payload.source.width=1,events=>events[1].boot='old',events=>events[1].sequence=1,events=>events[1].payload.source.url='asset://second.png']){
    const events=success();change(events);assert.throws(()=>verifyImageEvents(events,'load',0,'1','first',source));
  }
});
test('fit and unmount quiet window rejects any additional native callbacks',()=>{
  assert.equal(verifyImageEvents(success(),'quiet',4,'1',null,null),4);
  assert.throws(()=>verifyImageEvents([...success(),{boot:'1',sequence:5,name:'loadEnd'}],'quiet',4,'1',null,null));
});
test('native failures end once and unsupported static methods reject their code',()=>{
  const events=[{boot:'1',sequence:1,name:'loadStart'},{boot:'1',sequence:2,name:'error',payload:{error:'ERR_IMAGE_LOAD: 401'}},{boot:'1',sequence:3,name:'loadEnd'}];
  assert.equal(verifyImageEvents(events,'loadError',0,'1',null,null),3);
  assert.throws(()=>verifyImageEvents(events.slice(0,2),'loadError',0,'1',null,null));
  assert.equal(verifyImageEvents([{boot:'1',sequence:1,name:'prefetchRejected',payload:{code:'ERR_IMAGE_UNSUPPORTED'}}],'prefetch',0,'1',null,null),1);
  assert.throws(()=>verifyImageEvents([{boot:'1',sequence:1,name:'prefetchRejected',payload:{code:'OTHER'}}],'prefetch',0,'1',null,null));
});
