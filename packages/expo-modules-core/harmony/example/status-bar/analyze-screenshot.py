#!/usr/bin/env python3
import json,sys
from pathlib import Path
from PIL import Image
image=Image.open(sys.argv[1]).convert('RGB');width,height=image.size;crop=image.crop((0,0,width,min(125,height)));pixels=list(crop.get_flattened_data() if hasattr(crop,'get_flattened_data') else crop.getdata());target=(85,102,119)
count=sum(1 for p in pixels if sum(abs(p[i]-target[i]) for i in range(3))<=75)
result={'imageSize':[width,height],'topHeight':crop.height,'targetColor':'#556677','matchingPixels':count,'ratio':count/len(pixels)}
assert result['ratio']>0.35,result
print(json.dumps(result,indent=2))
