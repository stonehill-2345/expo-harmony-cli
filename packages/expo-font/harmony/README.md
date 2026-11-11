# expo-font Harmony backend

This directory provides the real RNOH `ExpoFontLoader` backend for expo-font
14.0.12. Public JavaScript continues to import `expo-font`.

The UI TurboModule validates an absolute `file://` URI, rejects missing/empty
files, parses the TTF/OTF sfnt header and bounded table directory, verifies native
decoding with `drawing.Typeface.makeFromFile`, then calls the
owning `RNInstance.registerFont`. That existing RNOH API updates ArkUI's font
manager and the instance C++ FontRegistry used by React Native text measurement.
The alias is reported by `getLoadedFonts()` only after structural validation and
registration return successfully. Font collections (`ttcf`) and WOFF/WOFF2
containers are explicitly rejected. TTC remains an open format requirement for
M4 acceptance; SDK54's WOFF/WOFF2 plugin extension is iOS-only.

Exports:
- ArkTS: `ExpoFontLoaderPackage` from `index.ets`
- C++: `expo::font::harmony::ExpoFontLoaderPackage`
- CMake: `rnoh_expo_font`

The same package also registers `ExpoFontUtils.renderToImageAsync`. It renders
text with Harmony's native Paragraph/Canvas APIs and writes a PNG to the application cache.
The public options select the registered font family, size in dp and color;
the result contains a local file URI, dp dimensions and the pixel scale.
Glyph overhangs and ascent/descent are included in the image bounds. Encoding
and write failures release native resources and remove partial files. A render
that completes after module destruction rejects and removes its unreturned file.
Empty text and non-positive/non-finite sizes reject explicitly.
The renderer explicitly loads each registered font file into the native text
collection under a private alias, then unloads it after rendering. Public family
names containing spaces or quotes are preserved in `getLoadedFonts()`.
Native ink bounds and font cleanup require Harmony API 20 or later.

The `expo-font` config plugin contributes shared `fonts` TTF/OTF files through
`expo/harmony-config`'s `withHarmonyResources` transaction. A font's basename
without its extension is its public family name; duplicate families reject.
The generated `expo-font/fonts.json` rawfile binds each resource to its SHA-256.
On module construction, the backend validates, caches and registers these fonts
before `getLoadedFonts()` returns. Removing or changing plugin inputs removes
obsolete owned resources on the next prebuild; edited or unowned files conflict
instead of being overwritten. Plugin removal takes effect in a rebuilt HAP.
Host tests cover this contract; native and device acceptance must use the new
candidate, and historical explicit-load results do not certify embedding.
Web-only unload methods remain outside this runtime implementation. Native registration
metadata is declared in `expo-module.config.json`; the standalone example does
not prove the production prebuild/autolinking path.

`harmony/example/FontAssetApp.tsx` exercises public image rendering and embedded
Asset loading/cache repair. Assemble the existing Core example with `--i0
--font`, copy this file to the consumer root and select it in `expo-entry.ts`.
Set the consumer's `index.ts` to `import './expo-entry';` when using
`build-hap.sh`, whose bundle entry defaults to `index.ts`.
It uses the fixture's `LaneBAssetOracle` for independent file/cache observations.
PNG pixels, dimensions and alpha must also be checked on-device; the host tests
use platform adapters and cannot certify actual rendering.

See the SDK Font-v1 evidence for real MaterialIcons/rendering acceptance; local
Node scheduling tests alone are not device evidence.

For saved device captures, run the independent pixel gate (Python with Pillow):

```sh
python3 harmony/example/check-pixels.py release-PHASE /absolute/MaterialIcons.ttf /absolute/evidence-dir
```

It requires the capture JSON and five PNGs; rejects blank custom glyphs, wrong
colors/alpha/dimensions and glyph shapes differing from the real font reference.
The output is a new `release-PHASE-pixels.json`; existing evidence is never overwritten.

`harmony/example/EmbeddedResourcesApp.tsx` and `RemovedResourcesApp.tsx` are
Release acceptance fixtures for this plugin contract. Configure a real
MaterialIcons font as `assets/EmbeddedIcons.ttf` with `expo-font`, and configure
`assets/data.json` with `expo-asset`. The updated fixture expects the exact bytes
`{ "embedded": "updated" }\n`; first install the original `step3` value, then
update without clearing the application cache. The removal fixture checks that
`EmbeddedIcons` is no longer registered and the removed asset rejects despite
its previous cache. Both fixtures require the Core example's LaneBAssetOracle.
