#!/usr/bin/env python3
"""Read-only glyph/pixel oracle. JSON request on stdin; requires Pillow."""
import hashlib
import io
import json
import sys
import zipfile
from PIL import Image, ImageDraw, ImageFont

request = json.load(sys.stdin)
with zipfile.ZipFile(request['hap']) as hap:
    font_bytes = hap.read('resources/rawfile/expo-font/fonts/EmbeddedIcons.ttf')
    manifest = json.loads(hap.read('resources/rawfile/expo-font/fonts.json'))
assert any(item['family'] == 'EmbeddedIcons' and item['sha256'] == hashlib.sha256(font_bytes).hexdigest() for item in manifest), 'Embedded font manifest mismatch'
image = Image.open(request['png']).convert('RGBA')
meta = request['metadata']
assert all(abs(actual - meta[key] * meta['scale']) < 1 for actual, key in zip(image.size, ['width', 'height'])), 'PNG dimensions disagree with native metadata'
alpha = image.getchannel('A')
assert alpha.getbbox() and alpha.getextrema()[1] == 255, 'Empty glyph'
pixels = [p for p in image.getdata() if p[3] == 255]
assert pixels and all(all(abs(p[i] - (0,87,184)[i]) <= 1 for i in range(3)) for p in pixels), 'Wrong glyph color'
font = ImageFont.truetype(io.BytesIO(font_bytes), round(48 * meta['scale']))
assert abs(image.width - font.getlength('\ue88a')) <= 1 and abs(image.height - sum(font.getmetrics())) <= 1, 'Wrong font metrics'
reference = Image.new('L', (image.width * 3, image.height * 3))
ImageDraw.Draw(reference).text((image.width, image.height), '\ue88a', font=font, fill=255, anchor='lt')
expected = reference.crop(reference.getbbox()).resize((128,128))
actual = alpha.crop(alpha.getbbox()).resize((128,128))
a = [v > 64 for v in actual.getdata()]; b = [v > 64 for v in expected.getdata()]
iou = sum(x and y for x,y in zip(a,b)) / sum(x or y for x,y in zip(a,b))
assert iou > .95, 'Glyph is not the embedded Material home outline'
print(json.dumps({'fontSHA256':hashlib.sha256(font_bytes).hexdigest(),'glyphIoU':iou,'dimensions':image.size}))
