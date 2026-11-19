from pathlib import Path
from PIL import Image, ImageFont, ImageDraw
import json, sys, hashlib
root=Path(sys.argv[3]) if len(sys.argv)>3 else Path(__file__).resolve().parent
phase=sys.argv[1]
record=json.loads((root/(phase+'-capture.json')).read_text())
checks=[]; details={}; masks={}
def check(name, value): checks.append(dict(name=name,passed=bool(value)))
for name, rgb, alpha in [('icon',(0,87,184),255),('large',(0,87,184),128),('text',(180,35,24),255),('transparent',None,0),('fallback',(0,0,0),255)]:
 path=root/(phase+'-'+name+'.png'); im=Image.open(path).convert('RGBA'); a=im.getchannel('A'); box=a.getbbox(); meta=record['images'][name]
 check(name+'-dimensions', all(abs(actual-meta[key]*meta['scale'])<.01 for actual,key in zip(im.size,['width','height'])))
 check(name+'-alpha',a.getextrema()[1]==alpha)
 if rgb:
  pixels=[p for p in im.getdata() if p[3]==alpha]
  check(name+'-color',bool(pixels) and all(all(abs(p[i]-rgb[i])<=1 for i in range(3)) for p in pixels))
 check(name+'-content',box is None if name=='transparent' else box is not None)
 if box: masks[name]=a.crop(box).resize((128,128))
 details[name]=dict(size=im.size,bbox=box,alphaRange=a.getextrema(),sha256=hashlib.sha256(path.read_bytes()).hexdigest())
# Independent reference from the real embedded font, not another renderer invocation.
font=ImageFont.truetype(sys.argv[2],168)
ref=Image.new('L',(400,400)); ImageDraw.Draw(ref).text((100,100),'\ue88a',font=font,fill=255,anchor='lt')
ref=ref.crop(ref.getbbox()).resize((128,128)); reference=[v>64 for v in ref.getdata()]
for name, size in [('icon',168),('large',336)]:
 expected=ImageFont.truetype(sys.argv[2],size)
 check(name+'-font-metric-size',abs(details[name]['size'][0]-expected.getlength('\ue88a'))<=1 and abs(details[name]['size'][1]-sum(expected.getmetrics()))<=1)
 values=[v>(32 if name=='large' else 64) for v in masks[name].getdata()] if name in masks else [False]*len(reference)
 intersection=sum(x and y for x,y in zip(reference,values)); union=sum(x or y for x,y in zip(reference,values)); iou=intersection/union
 check(name+'-material-home-shape',iou>.95); details[name]['referenceIoU']=iou
if all(details[n]['bbox'] for n in ['icon','large']):
 b=details['icon']['bbox']; c=details['large']['bbox']
 check('glyph-size-doubles',all(abs((c[i+2]-c[i])-2*(b[i+2]-b[i]))<=3 for i in [0,1]))
else: check('glyph-size-doubles',False)
result=dict(phase=phase,passed=all(c['passed'] for c in checks),checks=checks,images=details,referenceFontSha256=hashlib.sha256(Path(sys.argv[2]).read_bytes()).hexdigest())
output=root/(phase+'-pixels.json'); assert not output.exists(); output.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2));sys.exit(0 if result['passed'] else 1)
