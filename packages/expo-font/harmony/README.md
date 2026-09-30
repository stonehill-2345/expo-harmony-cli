# expo-font Harmony backend

This directory provides the real RNOH `ExpoFontLoader` backend for expo-font
14.0.12. Public JavaScript continues to import `expo-font`.

The UI TurboModule validates an absolute `file://` URI, rejects missing/empty
files, parses the TTF/OTF sfnt header and bounded table directory, then calls the
owning `RNInstance.registerFont`. That existing RNOH API updates ArkUI's font
manager and the instance C++ FontRegistry used by React Native text measurement.
The alias is reported by `getLoadedFonts()` only after structural validation and
registration return successfully. Font collections (`ttcf`) are explicitly out of
Font-v1 scope instead of being accepted without validation.

Exports:
- ArkTS: `ExpoFontLoaderPackage` from `index.ets`
- C++: `expo::font::harmony::ExpoFontLoaderPackage`
- CMake: `rnoh_expo_font`

This first runtime scope does not implement web-only unload methods,
`ExpoFontUtils.renderToImageAsync`, config-plugin/prebuild or autolinking.
See the SDK Font-v1 evidence for real MaterialIcons/rendering acceptance; local
Node scheduling tests alone are not device evidence.
