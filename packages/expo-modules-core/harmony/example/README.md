# Expo Core / Harmony integration example

This is a **Core validation fixture**, not the default Expo Router template.
It uses the public `expo-modules-core` entry point, a real RNAbility/RNApp host,
RNOH 0.82.30 / RN 0.82.1, React 19.1.1, and SDK 54 Core 3.0.30.

No application `metro.config.js`, `index.harmony.js`, shim, polyfill, or
patch-package is required. Harmony resolution/initialization belongs to the
local SDK Metro/Core packages. The native host is fixed for this stage;
**Expo prebuild / autolinking / Expo CLI Harmony commands are not implemented**.

## Source workspace after migration

The old `expo-harmony-sdk54` workspace has been returned to its official source
baseline. Develop the Harmony implementation in `expo-harmony-template` only.
The independent example is not moved by this documentation change. Its currently
installed tarballs still contain the previously tested code; after changing the
new source workspace, rebuild/install local Core and Metro artifacts before
claiming that the example validates those new changes. The A0 source assembly tools below now create a fresh standalone fixture;
S1 acceptance still requires every interop assertion, including native error codes.

## A0 real TurboModule fixture

See [INTEROP.md](INTEROP.md) for source packaging, fresh-host assembly, Debug/Release
build commands, device-log validation, and the C++/ArkTS registration contract.
The independent `ExpoCoreInteropProbe` keeps the original eight tests and adds a
separate sixteen-assertion direct-RNOH/public-Core comparison (the original twelve
plus string/uncoded rejection compatibility). It never registers
ExpoAsset or ExponentConstants. Current acceptance is recorded in
`docs/harmony-sdk54/team/progress-a.md`; a passing original 8/8 alone is not S1.

## Historical local installation

- SDK source: `<monorepo-root>`
- Example: `/path/to/expo-harmony-sdk54-example`
- The example's package-lock installs the modified Core and Metro from local
  `artifacts/*.tgz` files. Do not repair behavior by editing node_modules.
- Device test application: `com.expo.harmonycoretest`, `EntryAbility`.
- Original `my-app` and business `ohrn` are not changed.

## Run the existing example

```sh
cd /path/to/expo-harmony-sdk54-example
# Use Node 22.20.0. Dependencies are already installed.
npm run bundle:harmony:dev

cd harmony
export PATH=/path/to/node/bin:/Applications/DevEco-Studio.app/Contents/tools/ohpm/bin:$PATH
export DEVECO_SDK_HOME=/Applications/DevEco-Studio.app/Contents/sdk
/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw \
  --mode module -p product=default -p module=entry@default \
  -p buildMode=debug assembleHap --no-daemon --stacktrace

hdc -t 127.0.0.1:5557 install entry/build/default/outputs/default/entry-default-unsigned.hap
hdc -t 127.0.0.1:5557 shell aa start -a EntryAbility -b com.expo.harmonycoretest
```

For Release: first run `npm run bundle:harmony` from the example root, then
build with `-p buildMode=release`. A Debug HAP with `dev:false` JS is **not** a
Release HAP. The current test device accepts this unsigned test bundle without
signature bypass; other devices may require normal DevEco signing.

## What the page verifies

1. Public `requireNativeModule` during **bundle evaluation**, not only after mount.
2. A real synchronous C++ method.
3. A native event and subscription removal.
4. Native SharedObject resource ownership, release, repeated release and access
   after release.
5. Real native worker -> RNOH CallInvoker -> JS Promise resolve, without blocking JS.
6. Native Promise rejection with error code/message.
7. Cancellation, cleanup and suppression of late completion.
8. Public `requireNativeViewManager`, real Fabric/ArkUI text view, prop update,
   native event and native imperative ref method on the UI thread.

The development-only **Reload with native work pending** button starts a native
operation, then asks RNOH DevSettings to rebuild the RN runtime. Logs must show a
new `EXPO_CORE_BOOT`, the same app PID, another 8/8 result, and no
`EXPO_CORE_STALE_CALLBACK` / `EXPO_CORE_STALE_REJECTION` from the old runtime.
This tests RNOH reload integration; it does **not** implement Expo's
`reloadAppAsync` public API.

Background/foreground transitions log `EXPO_CORE_APP_STATE`; returning active
reruns the checks. `Run native tests again` does not reload the runtime.

Only read logs for this app's current PID:

```sh
hdc -t 127.0.0.1:5557 shell pidof com.expo.harmonycoretest
hdc -t 127.0.0.1:5557 shell hilog -x -P <PID>
```

Require every entry of `EXPO_CORE_EXAMPLE_RESULTS` to have `passed:true`.
Build success, app installation and a live process alone are insufficient.

## Core-v1 validation and remaining scope

The fixture now includes separate result groups for the original eight checks,
RNOH interop (16), context/version/IO (7), UUID (9), module/resource/platform
boundaries (5), and native view boundaries (5). The SDK checker verifies each
one. New suites run after the original eight to avoid synchronous platform probes
interfering with the original responsiveness assertion.

The **Reload through Expo public API** button is present in both Debug and
Release. It calls public `reloadAppAsync` with C++ work, an ArkTS rejection and a
native view read pending. Use the checker with `--reload`: require a new boot,
all groups again after that boot, native late-completion evidence and no stale JS
callback. The original DevSettings button remains a distinct historical test.

This is a bounded Core-v1 candidate, not all Expo Core DSL/view features, standard
Expo startup, Constants/Asset/Router, or prebuild/autolinking. Use progress-a and
the final C01–C09 report for review/acceptance state. Native cancellation remains
cooperative; no JSI handles may be captured on worker threads. Production load
and a shared scheduling policy are not covered by v1.


## Standard Expo startup acceptance (separate from the 8/8 Core baseline)

`expo-entry.ts` imports the real public `registerRootComponent` from `expo` and
registers the same App. It does not catch initialization failure or register fake
Constants/Asset modules. Copy this fixture beside App/index in the standalone
example, then build from the current SDK source:

```sh
# Run from the expo-harmony-template repository root.
export EXPO_HARMONY_EXAMPLE_ROOT=/path/to/expo-harmony-sdk54-example
node packages/expo-modules-core/harmony/example/bundle.cjs "$EXPO_HARMONY_EXAMPLE_ROOT" --expo
```

Without `--expo`, the bundler keeps the original Core-only `index.ts` entry.
The real-Metro selection tests run with:

```sh
node --test packages/expo-modules-core/harmony/example/tests/startup-entry.test.cjs
```

These selection tests build both entries and leave the default Core bundle as the
last output. They test bundle selection, **not** successful Expo initialization.
Actual HAP startup must additionally log `EXPO_STANDARD_STARTUP_REGISTERED` and
then pass the existing 8 Core tests.

On 2026-09-18 the standard-entry HAP stopped at missing native `ExpoAsset`, while
the rebuilt Core baseline passed 8/8. Core installation is therefore not the
first observed blocker; execution after the Asset failure is not yet validated.
Do not treat uncalled UUID/directory/reload API gaps as proven startup failures.
