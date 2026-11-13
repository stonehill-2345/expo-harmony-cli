import assert from 'node:assert/strict';
import test from 'node:test';
import {compareDefaultImage,verifyDefaultPage} from '../abc/a-verify-default.mjs';

function raster(width,height,color){
  return {width,height,data:Buffer.from(Array.from({length:width*height},()=>color).flat())};
}
function rect(im,x1,y1,x2,y2,color){
  for(let y=y1;y<y2;y++)for(let x=x1;x<x2;x++)im.data.set(color,(y*im.width+x)*4);
}
test('default image oracle checks alpha background and rendered logo, rejecting blank or stale pixels',()=>{
  const source=raster(20,20,[0,0,0,0]);rect(source,5,5,15,15,[10,120,180,255]);
  const screen=raster(240,240,[161,206,220,255]);rect(screen,70,70,170,170,[10,120,180,255]);
  assert.equal(compareDefaultImage(screen,source,[20,20,220,220],[161,206,220]).ratio,1);
  assert.throws(()=>compareDefaultImage(raster(240,240,[161,206,220,255]),source,[20,20,220,220],[161,206,220]),/mismatch/);
  assert.throws(()=>compareDefaultImage(screen,source,[20,20,220,220],[255,255,255]),/mismatch/);
  const stale=raster(240,240,[161,206,220,255]);rect(stale,100,70,200,170,[10,120,180,255]);
  assert.throws(()=>compareDefaultImage(stale,source,[20,20,220,220],[161,206,220]),/mismatch/);
  assert.throws(()=>compareDefaultImage(screen,source,[-1,0,220,220],[161,206,220]),/bounds/);
});
test('default page oracle requires both native title and visible ink, and rejects a retained modal',()=>{
  const title=text=>({attributes:{text,visible:'true',bounds:'[10,10][90,30]'}});
  const layout={children:[title('Welcome!')]};
  const screen=raster(100,100,[255,255,255,255]);rect(screen,20,15,70,25,[20,20,20,255]);
  assert.equal(verifyDefaultPage(layout,screen,'initial').length,1);
  assert.throws(()=>verifyDefaultPage(layout,raster(100,100,[255,255,255,255]),'initial'),/no rendered ink/);
  assert.throws(()=>verifyDefaultPage({children:[]},screen,'initial'),/Missing/);
  assert.throws(()=>verifyDefaultPage({children:[title('Welcome!'),title('This is a modal')]},screen,'back'),/Modal remains/);
  assert.throws(()=>verifyDefaultPage(layout,screen,'modal'),/Missing/);
});
