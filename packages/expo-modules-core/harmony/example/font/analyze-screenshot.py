#!/usr/bin/env python3
import json, re, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw

def find_bounds(tree, label):
    found = []
    def walk(node):
        if isinstance(node, dict):
            attrs = node.get('attributes', {})
            if attrs.get('visible') == 'true' and label in {str(v) for v in attrs.values()}:
                nums = [int(v) for v in re.findall(r'\d+', attrs.get('bounds', ''))]
                if len(nums) == 4:
                    found.append(tuple(nums))
            for value in node.values(): walk(value)
        elif isinstance(node, list):
            for value in node: walk(value)
    walk(tree)
    if not found: raise AssertionError(f'Missing visible node {label}')
    return min(found, key=lambda b: (b[2]-b[0])*(b[3]-b[1]))

def color_count(image, bounds, target, tolerance=70, center=False):
    x1,y1,x2,y2=bounds
    if center:
        dx=max(1,(x2-x1)//4);dy=max(1,(y2-y1)//4);x1+=dx;x2-=dx;y1+=dy;y2-=dy
    crop=image.crop((x1,y1,x2,y2)).convert('RGB')
    pixels = crop.get_flattened_data() if hasattr(crop, 'get_flattened_data') else crop.getdata()
    return sum(1 for pixel in pixels if sum(abs(pixel[i]-target[i]) for i in range(3)) <= tolerance)

def analyze(layout_path, image_path):
    tree=json.loads(Path(layout_path).read_text())
    image=Image.open(image_path)
    icon=find_bounds(tree,'font-material-icon');fallback=find_bounds(tree,'font-fallback-glyph')
    result={
      'imageSize':image.size,'iconBounds':icon,'fallbackBounds':fallback,
      'bluePixels':color_count(image,icon,(0,87,184)),
      'blueCenterPixels':color_count(image,icon,(0,87,184),center=True),
      'redPixels':color_count(image,fallback,(180,35,24)),
      'redCenterPixels':color_count(image,fallback,(180,35,24),center=True),
    }
    assert result['bluePixels'] >= 40, result
    assert result['blueCenterPixels'] >= 8, result
    # The PUA glyph is intentionally absent from the system fallback. The same
    # code point must draw only after MaterialIcons is registered.
    assert result['redPixels'] <= 8, result
    return result

def self_test():
    with tempfile.TemporaryDirectory() as d:
        image=Image.new('RGB',(200,100),'white');draw=ImageDraw.Draw(image)
        draw.rectangle((20,20,60,60),fill=(0,87,184));# fallback bounds intentionally remain blank
        png=Path(d)/'x.png';image.save(png)
        layout={'children':[{'attributes':{'visible':'true','description':'font-material-icon','bounds':'[15,15][65,65]'}},{'attributes':{'visible':'true','description':'font-fallback-glyph','bounds':'[115,15][165,65]'}}]}
        js=Path(d)/'x.json';js.write_text(json.dumps(layout))
        result=analyze(js,png);assert result['blueCenterPixels'] > 0 and result['redPixels'] == 0
        print('FONT_SCREENSHOT_ANALYZER_SELF_TEST=PASS')

if __name__=='__main__':
    if sys.argv[1:]==['--self-test']: self_test()
    elif len(sys.argv)==3: print(json.dumps(analyze(sys.argv[1],sys.argv[2]),indent=2))
    else: raise SystemExit('Usage: analyze-screenshot.py LAYOUT SCREENSHOT | --self-test')
