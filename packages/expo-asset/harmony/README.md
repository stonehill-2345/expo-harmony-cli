# expo-asset Harmony backend

This directory provides the RNOH `ExpoAsset` TurboModule backend for Expo SDK 54 / expo-asset 12.0.13.

## Host wiring

- Add `src/main/cpp` to the host CMake project and link `rnoh_expo_asset`.
- Return `std::make_shared<expo::asset::harmony::ExpoAssetPackage>(ctx)` from the host C++ package provider (`ctx` is `rnoh::Package::Context`).
- Add `new ExpoAssetPackage(ctx)` to the ArkTS RNOH package list.
- Export the package from the consuming Harmony library or copy the source through the package build. Do not rename `ExpoAsset`.
- Ensure the application requests `ohos.permission.INTERNET` when HTTP/HTTPS assets are used.
- Keep RNOH's `assetsDest` aligned with Metro's rawfile asset output. The default is `assets/`, so `asset://images/icon.png` reads rawfile `assets/images/icon.png`.

`downloadAsync(url, md5Hash, type)` returns a `file://` URI. HTTP/HTTPS and embedded rawfile bytes are written to the application cache through a temporary file, flushed, optionally MD5-verified, and atomically renamed. Existing caches with a supplied hash are content-verified before reuse. Active network requests and temporary files are cancelled/cleaned when the module is destroyed.

Direct RNOH validation is separate from validation through Expo Modules Core and the official expo-asset JavaScript API.

See [the lane B handoff](example/README.md) for preserved direct-test sources,
public API checks, fixture resources, server, and the outstanding S1 prerequisite.

## Lifecycle regression (A integration follow-up)

The module now awaits the original RNOH HTTP request Promise instead of wrapping
it in a second Promise that rejects during destruction. Destruction invokes the
RNOH cancellation handle; it does not inject a new rejection into the dying JS
Runtime. The tested platform can still close the underlying slow HTTP connection
at its read timeout, so immediate transport termination is not certified.

Cache hashing and file opening recheck module lifetime after awaiting. Pending
writers retain their temporary-path bookkeeping until their `finally` cleanup,
including when a file opens after the destruction hook.

```sh
EXPO_HARMONY_TOOLING_ROOT=/path/to/typescript-tooling \
  node --test packages/expo-asset/harmony/tests/asset-lifecycle.test.cjs
```

These tests execute the real ETS module with Node adapters for platform I/O;
they are scheduling/unit evidence, not Harmony-native acceptance. Real joint
Debug/Release results and the preserved pre-fix failure are recorded separately
under `docs/harmony-sdk54/evidence/2026-09-20-i0*`.
