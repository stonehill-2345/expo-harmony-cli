# Font-v1 shared fixture

Use `prepare-fixture.cjs --i0 --linking --font` with the fixed Core-v1-v3 HAR.
The fixture installs the exact `@expo/vector-icons`15.1.1 package, registers the
real ExpoFontLoader package on C++/ETS sides and retains all prior I0/Linking
checks. Router is not installed. Device acceptance and unsupported boundaries are
recorded in the Font-v1 evidence; this directory is not autolinking/prebuild.

The current fixture requires `Font.renderToImageAsync` to return image metadata.
The older Font-v1 logs expected explicit unavailability instead; only historical
log replay may set `EXPO_FONT_LEGACY_V1_EVIDENCE=1`. Do not set it for a current
device acceptance run. Pixel-level renderer checks live in the expo-font
`harmony/example/FontAssetApp.tsx` acceptance fixture.
