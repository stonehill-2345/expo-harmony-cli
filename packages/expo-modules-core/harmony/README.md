# Expo Modules Core: Harmony native foundation

This directory contains the **Core-v1 contract candidate**, based on Expo Modules
Core 3.0.30 and RNOH 0.82.30 with the pinned SDK compatibility artifact. The bounded
C01–C09 contract and its review status are tracked in
`docs/harmony-sdk54/team/progress-a.md`. This is not full Expo SDK/DSL parity or
standard Expo template acceptance; do not infer release approval from code presence.

## Implemented

- Runtime-local installation of the upstream C++ `EventEmitter`, `NativeModule`,
  `SharedObject`, and `SharedRef` classes.
- Native module registration with a real native initializer. Failed initializers
  are not published; duplicate registrations are rejected.
- Native-to-JS events using the upstream event implementation and subscriptions.
- C++ resource ownership for shared objects/references. Explicit release, GC,
  invalidation, and runtime destruction are idempotent. Externally retained state
  is invalidated when its owning runtime is destroyed.
- An RNOH Package with runtime-local module definitions. The synchronous
  `ExpoModulesCore.installModules` TurboModule and buffered GlobalJSIBinder use
  the same installer, including module registration before top-level JS imports.
- Native asynchronous work, RNOH CallInvoker completion, real Promises, errors,
  cooperative cancellation and runtime-owned callback cleanup.
- Native view configuration and a Harmony public view adapter, exercised with a
  real Fabric descriptor / C++ component / ArkUI text node and native ref method.
- Real UIAbility-backed global directories and package-derived native version.
- System secure UUIDv4 and system SHA1/UTF8 UUIDv5 through the official public API.
- Public `reloadAppAsync` exercising same-bundle Runtime replacement in Debug/Release.
- Structured C++ native error propagation, live SharedObject binding lookup and
  instance-bound native view methods with unmount/reload invalidation.
- A real RNAbility/RNApp/HAP [Core example](example/README.md).

All runtime operations must occur on the owning JS thread. Attached resources
must not retain JSI objects belonging to that runtime. The registry does not hold
JSI objects, and shared-object releasers refer back to it weakly.

## Not implemented or not yet validated

- Full Expo Core contract parity, module-definition DSL and ArkTS authoring bridge.
- ETS/package/HAR metadata, automatic linking and prebuild/Expo CLI support.
- All native view variants, event types, layout/teardown and imperative contracts.
- Standard Expo JS startup, Constants/Asset/Router and the unmodified Expo template.
- Full Expo monorepo typechecking, Android/iOS native regression and production load.

Missing capabilities are not represented by successful no-op functions. Do not
use this partial package to claim the default Expo app is supported yet. Worker
closures and result converters may capture native data, never JSI handles. The
initial async dispatcher uses one native thread per call; cancellation is
cooperative, not forcible interruption of arbitrary native I/O.

## Native Hermes tests

The tests run a real aarch64 executable on Harmony using the unmodified
`libhermesvm.so` from the published RNOH HAR. `libjsi.so` is compiled from the same
HAR's RN JSI sources. This is **not** a mock runtime or an Android executable.

Run from the `expo-harmony-template` repository root. Set these paths to the
actual local SDK, extracted RNOH HAR and scratch directory. Use a fresh build
directory: old CMake caches refer to `expo-harmony-sdk54`, whose Harmony changes
have been moved out. The HAR extraction below is a local development dependency,
not a file guaranteed to exist on a teammate's machine:

```sh
export CORE="$PWD/packages/expo-modules-core"
export OH_NATIVE_SDK="/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/native"
export RNOH_PACKAGE_DIR="/tmp/expo-core-native-20260918/rnoh-full/package"
export BUILD="/tmp/expo-harmony-template-core-debug"
export CMAKE="$OH_NATIVE_SDK/build-tools/cmake/bin/cmake"

"$CMAKE" -S "$CORE/harmony/tests" -B "$BUILD" -G Ninja \
  -DCMAKE_MAKE_PROGRAM="$OH_NATIVE_SDK/build-tools/cmake/bin/ninja" \
  -DCMAKE_TOOLCHAIN_FILE="$OH_NATIVE_SDK/build/cmake/ohos.toolchain.cmake" \
  -DOHOS_ARCH=arm64-v8a -DCMAKE_BUILD_TYPE=Debug \
  -DRNOH_PACKAGE_DIR="$RNOH_PACKAGE_DIR" -DEXPO_CORE_RUNTIME_TESTS=ON
"$CMAKE" --build "$BUILD" -j 4
```

For the initial toolchain/Hermes-only smoke test, configure a separate build
folder with `EXPO_CORE_RUNTIME_TESTS=OFF`. For optimization coverage, configure a
separate folder with `CMAKE_BUILD_TYPE=Release`; checks are not C `assert` macros
and are therefore not disabled by `NDEBUG`.

After selecting the intended development device, send only the test executable
and libraries to its dedicated temporary directory:

```sh
export DEVICE=127.0.0.1:5557
export REMOTE=/data/local/tmp/expo-core-sdk54-20260918
hdc -t "$DEVICE" shell mkdir -p "$REMOTE"
hdc -t "$DEVICE" file send "$BUILD/expo_core_runtime_test" "$REMOTE/expo_core_runtime_test"
hdc -t "$DEVICE" file send "$BUILD/libjsi.so" "$REMOTE/libjsi.so"
hdc -t "$DEVICE" file send "$RNOH_PACKAGE_DIR/src/main/cpp/third-party/prebuilt/arm64-v8a/libhermesvm.so" "$REMOTE/libhermesvm.so"
hdc -t "$DEVICE" file send "$OH_NATIVE_SDK/llvm/lib/aarch64-linux-ohos/libc++_shared.so" "$REMOTE/libc++_shared.so"
hdc -t "$DEVICE" shell "chmod 700 '$REMOTE/expo_core_runtime_test'; LD_LIBRARY_PATH='$REMOTE' '$REMOTE/expo_core_runtime_test'; result=\$?; echo EXPO_CORE_TEST_EXIT=\$result; exit \$result"
```

Require **both** `CORE_TESTS_PASSED=19` and `EXPO_CORE_TEST_EXIT=0` in the output.
HDC can return host exit code zero even when the remote process exits nonzero;
do not infer test success from the host command alone.

Observed build environment: DevEco Native SDK 6.1.1.125 (API 24), aarch64.
Observed test device: OpenHarmony 6.1.0.115 (API 23), aarch64. This only verifies
these binaries in that environment; it is not a minimum-platform compatibility
claim. `OHOS_PLATFORM_LEVEL=23` was unused by this CMake toolchain and is not a
valid basis for claiming an API 23-targeted build.

## RNOH Package compile check

The second build uses the **full** RNOH HAR to import its real CMake targets and
headers. It compiles the Package subclass and its GlobalJSIBinder override, plus
a caller matching a native PackageProvider.

```sh
"$CMAKE" -S "$CORE/harmony/tests/rnoh" -B /tmp/expo-harmony-template-package-check \
  -G Ninja -DCMAKE_MAKE_PROGRAM="$OH_NATIVE_SDK/build-tools/cmake/bin/ninja" \
  -DCMAKE_TOOLCHAIN_FILE="$OH_NATIVE_SDK/build/cmake/ohos.toolchain.cmake" \
  -DOHOS_ARCH=arm64-v8a -DCMAKE_BUILD_TYPE=Debug \
  -DRNOH_PACKAGE_DIR=/tmp/expo-core-native-20260918/rnoh-full/package
"$CMAKE" --build /tmp/expo-harmony-template-package-check \
  --target expo_core_package_compile_check -j 4
```

This compile-only target is distinct from the actual example HAP. The production
CMake entry defines `rnoh_expo_modules_core`; the example also links its separate
`expo_core_test_module` fixture target.
No module logic should be copied into an application's EntryAbility.

## Additional async lifecycle tests

The same test CMake project builds `expo_core_async_test`. Deploy it beside the
existing test libraries and run it with the same LD_LIBRARY_PATH. Require both
`ASYNC_TESTS_PASSED=8` and remote exit zero. These tests use actual device Hermes
and OS threads, with a deterministic test CallInvoker queue; the HAP additionally
verifies RNOH's actual JS CallInvoker. Debug and Release must both be tested.


## Core-v1 SDK contracts and reproducible fixture

Use [example/INTEROP.md](example/INTEROP.md) for Core C++/ETS registration, source
artifacts, strict public types, stable native view binding and SharedObject access.
The real RNOH TurboModule rejection path requires the pinned
[rnoh-compat](rnoh-compat/README.md) artifact; the original upstream 0.82.30 drops
native error codes. This is an SDK-maintained dependency build, not an app patch.

The original 16 runtime and 6 async tests remain; the counts are now 19 and 8 with
binding/lifecycle and coded-error additions. Standalone tests do not replace real
HAP checks. Final contract completion additionally requires the C01–C09 report and
independent review, which are not implied by these commands.
