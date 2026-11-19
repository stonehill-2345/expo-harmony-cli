"""Create original geometric font fixtures; requires fonttools 4.60.1 and brotli 1.1.0."""
from pathlib import Path
import sys, json, hashlib
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.ttLib import TTFont, TTCollection

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=False)
order = ['.notdef', 'space', 'probe']
shapes = {
    'ttf': [(120,100),(120,900),(300,900),(300,300),(880,300),(880,100)],
    'otf': [(100,100),(500,900),(900,100)],
}
for kind, points in shapes.items():
    builder = FontBuilder(1000, isTTF=kind == 'ttf')
    builder.setupGlyphOrder(order)
    builder.setupCharacterMap({32: 'space', 0xE001: 'probe'})
    glyphs = {}
    for name in order:
        pen = TTGlyphPen(None) if kind == 'ttf' else T2CharStringPen(1000, None)
        if name == 'probe':
            pen.moveTo(points[0])
            for point in points[1:]: pen.lineTo(point)
            pen.closePath()
        glyphs[name] = pen.glyph() if kind == 'ttf' else pen.getCharString()
    if kind == 'ttf': builder.setupGlyf(glyphs)
    else: builder.setupCFF('A03ProbeOTF', {'FullName':'A03 Probe OTF','FamilyName':'A03 Probe OTF','Weight':'Regular'}, glyphs, {})
    builder.setupHorizontalMetrics({name: (1000, 0) for name in order})
    builder.setupHorizontalHeader(ascent=900, descent=-100)
    builder.setupNameTable({'familyName': 'A03 Probe '+kind.upper(), 'styleName':'Regular',
        'uniqueFontIdentifier':'A03Probe-'+kind, 'fullName':'A03 Probe '+kind.upper(),
        'psName':'A03Probe'+kind.upper(), 'version':'Version 1.0'})
    builder.setupOS2(sTypoAscender=900, sTypoDescender=-100, usWinAscent=900, usWinDescent=100)
    builder.setupPost(); builder.setupMaxp()
    builder.font['head'].created = builder.font['head'].modified = 2082844800
    builder.font.recalcTimestamp = False
    builder.save(out/('probe.'+kind))
collection=TTCollection(); collection.fonts=[TTFont(out/'probe.ttf', recalcTimestamp=False),TTFont(out/'probe.otf', recalcTimestamp=False)]
collection.save(out/'probe.ttc')
for flavor in ['woff','woff2']:
    font=TTFont(out/'probe.ttf', recalcTimestamp=False); font.flavor=flavor; font.save(out/('probe.'+flavor))
# Structurally bounded directory without a decodable font: the old validator accepts it.
malformed=bytearray(32); malformed[:6]=bytes([0,1,0,0,0,1]);malformed[12:16]=b'head'
malformed[20:28]=bytes([0,0,0,28,0,0,0,4]);(out/'undecodable.ttf').write_bytes(malformed)
(out/'empty.ttf').write_bytes(b'')
(out/'truncated.ttf').write_bytes((out/'probe.ttf').read_bytes()[:20])
rows=[{'name':p.name,'size':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(out.iterdir())]
(out/'manifest.json').write_text(json.dumps({'generator':'create-fixtures.py','fonttools':'4.60.1','brotli':'1.1.0','glyph':'U+E001','license':'Original test geometry, MIT (same as expo-font)','files':rows},indent=2)+'\n')
print(json.dumps(rows,indent=2))
