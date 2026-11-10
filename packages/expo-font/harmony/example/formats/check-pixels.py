"""Verify public PNG outputs AND native Text glyphs in a captured device screenshot."""
from pathlib import Path
from PIL import Image, ImageFont, ImageDraw
import json,sys,hashlib
root=Path(sys.argv[1]);phase=sys.argv[2];fixtures=Path(sys.argv[3])
capture=json.loads((root/(phase+'-capture.json')).read_text());checks=[];details={}
def check(name,passed):checks.append({'name':name,'passed':bool(passed)})
def normalized(mask):
 box=mask.getbbox()
 return None if box is None else mask.crop(box).resize((128,128))
def similarity(a,b):
 if a is None:return 0
 aa=[p>64 for p in a.getdata()];bb=[p>64 for p in b.getdata()]
 return sum(x and y for x,y in zip(aa,bb))/sum(x or y for x,y in zip(aa,bb))
references={}
for name,color,extension in [('ttf',(0,87,184),'ttf'),('otf',(22,128,60),'otf'),('retry',(0,87,184),'ttf')]:
 meta=capture['images'][name];im=Image.open(root/(phase+'-'+name+'.png')).convert('RGBA');alpha=im.getchannel('A')
 size=round(60*meta['scale']);font=ImageFont.truetype(str(fixtures/('probe.'+extension)),size)
 ref=Image.new('L',(size*3,size*3));ImageDraw.Draw(ref).text((size,size),'\ue001',font=font,fill=255,anchor='lt');ref=normalized(ref);references[name]=ref
 check(name+'-metadata',all(abs(v-meta[key]*meta['scale'])<.01 for v,key in zip(im.size,['width','height'])))
 # Native advance was measured as 210.0000457763672 px at nominal 210 px.
 # Permit only the one extra column from ceil; height and glyph shape stay strict.
 check(name+'-font-size',size <= im.width <= size+1 and im.height == size)
 check(name+'-opaque-content',alpha.getextrema()[1]==255)
 solid=[p for p in im.getdata() if p[3]==255];check(name+'-color',bool(solid) and all(p[:3]==color for p in solid))
 score=similarity(normalized(alpha),ref);check(name+'-glyph',score>.95)
 details[name]={'size':im.size,'bbox':alpha.getbbox(),'referenceIoU':score,'sha256':hashlib.sha256((root/(phase+'-'+name+'.png')).read_bytes()).hexdigest()}
# Each format appears twice: native Text first, then its PNG. Reject missing/fallback text.
screen=Image.open(root/(phase+'.png')).convert('RGB')
for name,color in [('ttf',(0,87,184)),('otf',(22,128,60))]:
 mask=Image.new('L',screen.size);mask.putdata([255 if all(abs(p[i]-color[i])<5 for i in range(3)) else 0 for p in screen.getdata()])
 rows=[y for y in range(screen.height) if mask.crop((0,y,screen.width,y+1)).getbbox()];groups=[]
 for y in rows:
  if not groups or y>groups[-1][-1]+1:groups.append([y])
  else:groups[-1].append(y)
 check(name+'-screen-two-glyphs',len(groups)==2)
 for index,group in enumerate(groups):
  glyph=normalized(mask.crop((0,group[0],screen.width,group[-1]+1)));score=similarity(glyph,references[name]);check(name+('-native-text' if index==0 else '-screen-image'),score>.94)
  details[name+f'-screen-{index}']={'rows':[group[0],group[-1]],'referenceIoU':score}
result={'passed':all(c['passed'] for c in checks),'phase':phase,'checks':checks,'images':details}
p=root/(phase+'-pixels.json');assert not p.exists();p.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2));sys.exit(0 if result['passed'] else 1)
