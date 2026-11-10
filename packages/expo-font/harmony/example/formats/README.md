# Font format acceptance

This standalone fixture checks current public Font APIs and native React Native
Text using original geometric TTF and CFF-OTF fonts. It is not production prebuild
or declarative plugin acceptance.

1. In a separate Python environment install `fonttools==4.60.1 brotli==1.1.0`.
2. Run `create-fixtures.py /absolute/new-fixture-directory`.
3. Prepare the Core host with `--i0 --font`. Copy generated files into its
   `harmony/entry/src/main/resources/rawfile/font-formats/` directory.
4. Copy `FontFormatsApp.tsx` into the consumer root, select it in `expo-entry.ts`,
   and make `index.ts` import `./expo-entry` before using `build-hap.sh`.
5. Capture exact `A03_FONT_FORMATS=` rows for each boot, screenshots, and the three
   PNGs reported in `kind: images`. Verify TTF/OTF and retry glyphs against an
   independent rasterization of the generated fonts; also verify native Text
   from the screenshot. API results alone are insufficient.

Expected 13 public checks: six rejections (TTC, WOFF, WOFF2, empty, truncated,
structurally bounded but undecodable sfnt), retry after failure, concurrent TTF
load, OTF load, loaded-alias idempotence, and three image results. Unsupported
containers remain explicit capability boundaries, not completed format support.
The TTF glyph is an L; the OTF glyph is a triangle. Both use U+E001 so a system
fallback cannot pass by displaying ordinary Latin text.

`check-pixels.py EVIDENCE_DIR PHASE FIXTURE_DIR` checks three PNGs and the two
native Text glyphs in the screenshot. At scale 3.5 the native engine measured a
nominal 210 px advance as 210.0000457763672; ceil correctly allocates 211 columns.
The gate permits at most this one extra column, keeps height exact, and checks
shape independently. Missing glyphs and larger padding must still fail.
