# A-owned Router host

This assembles B's six-page fixture with the official `expo-router/entry` and
real Core, Constants, Asset, Linking and navigation packages. It is a validation
host, not Expo prebuild/autolinking or a completed Router device acceptance.
The existing Core-only, `--i0` and `--i0 --linking` modes remain separate.

## Dependency candidate

`navigation-dependencies.json` pins the tested installation candidate. It does
not change the repository's root lock or SDK bundled-version declarations.
Native 7.1.17 is needed by Elements 2.6.3, not just Native Stack's lower peer.
Harmony Screens 4.9.0 requires upstream 4.17.1. Its top-level gesture provider
also imports Gesture Handler and Reanimated, so this candidate needs all five
native packages even for a basic Stack bundle. Harmony Worklets **1.0.0** is the
published adapter for upstream Worklets **0.7.1**.

The native host uses the previously accepted `expo-rnoh-0.82.30-core-v1-v3` HAR,
SHA256 `0e0cf3dbb5b2e510f49c819ff5db2f43ad5a5918d38e840cc2714055c9f6fd83`.
Normal OHPM root overrides unify adapter RNOH/Worklets dependencies; dependency
sources and HAR manifests are not edited. Screens' original RNOH 0.82.18
declaration alone is not a compatibility result.

Worklets 1.0.0 and Reanimated 4.0.1 export conflicting private C++ factory/message
and UI scheduler class names (the scheduler classes also have different layouts).
Real startup exposed the factory error, followed by a scheduler crash when only
the factory names were fixed, despite successful builds.
The user-authorized `prepare-worklets.py` creates a separate, deterministic HAR
with unique Worklets helper names, checking the original archive and source hashes.
Only four native source files change; public module names, package versions and the original
npm HAR remain unchanged. `build-i0.sh` prepares it before normal OHPM installation.
Use `EXPO_HARMONY_PYTHON` to select Python 3 if necessary.

When moving from the original HAR to this fixed artifact, generate a **fresh
fixture**: OHPM preserves source timestamps and the previous Ninja cache was
observed retaining the old symbols. A successful incremental build alone is
insufficient; verify the actual Worklets library exports before device acceptance.

## Prepare and validate

Use Node 22.20.0 and the existing A tooling environment with TypeScript 5.9.2,
React/RN 19.1.1/0.82.1 and their types. Use a fresh canonical `/private/tmp` path
for FIXTURE and the approved HAR; never reuse another running host directory.

```sh
node packages/expo-modules-core/harmony/example/tools/prepare-fixture.cjs \
  --sdk-root "$PWD" --fixture-root "$FIXTURE" --tooling-root "$TOOLING" \
  --har "$HAR" --router
node packages/expo-modules-core/harmony/example/tools/verify-navigation.cjs "$FIXTURE"
node packages/expo-modules-core/harmony/example/tools/verify-install.cjs "$FIXTURE"
DEVECO_HOME=/Applications/DevEco-Studio.app/Contents \
  bash packages/expo-modules-core/harmony/example/tools/build-i0.sh "$FIXTURE" release
```

The shared build script retains its `artifacts/i0-release.hap` filename; in this
mode its contents are the Router host, not an I0/Core50 test result. The bundle
comes from `node_modules/expo-router/entry.js`; there is no custom app entry,
Metro config, shim or copied dependency implementation. Constants' official
script generates actual config from the B fixture's `app.json`.

Debug uses the same build script with `debug` and the existing `serve-i0.cjs`:
the native Metro URL is `/node_modules/expo-router/entry.bundle?platform=harmony&dev=true&minify=false`.
Run the server and expose port 8081 only after checking device ownership. Router
does not execute I0's HTTP asset test server or Core50 screen; those suites are
validated with their own unchanged fixture modes. Do not run I0 log checkers on
Router output or interpret a successful bundle as a navigation test.

If another project owns host port 8081, set `EXPO_HARMONY_METRO_PORT=18081` when
running `serve-i0.cjs` and forward device port 8081 to host port 18081. Preserve the
other project's process and remove only this test's forwarding rule afterwards.

The generated root layout includes A's `RouterProbe` alongside B's Stack. It
logs real navigation state, SafeArea hook/native metrics and a runtime UUID, and
exposes a button calling public `reloadAppAsync`. It does not automatically
navigate or supply replacement native values. B's original six-page sources
remain unchanged. `inspect-device.cjs` records actual UI actions, PID logs,
layouts and screenshots in a new output directory; its output is observational,
so compare the route stack and visible page before declaring a case passed.

## Native registration

| HAR / npm adapter | C++ package | ArkTS package | CMake target |
| --- | --- | --- | --- |
| Screens | ScreensPackage | default RNOHScreensPackage | rnoh_screens |
| SafeArea | rnoh::SafeAreaViewPackage | SafeAreaViewPackage | rnoh_safe_area |
| Gesture Handler | GestureHandlerPackage | default GestureHandlerPackage | rnoh_gesture_handler |
| Worklets | rnoh::ReanimatedWorkletPackage | ReanimatedWorkletPackage | rnoh_worklets |
| Reanimated | rnoh::ReanimatedPackage | ReanimatedPackage | rnoh_reanimated |

All receive the actual RNOH package context. Worklets is configured before
Reanimated. The Ability retains the accepted Linking lifecycle wiring. Bundle
ID is `dev.expo.harmony.router`; URI scheme `lanebrouter` permits actual route
hosts such as `details`, rather than restricting URI matching to the I0 host.

## Acceptance result and remaining scope

The controlled fixture passed visible initial page, Stack/ordinary JS Tabs,
params/push/replace/single back/not-found, cold/hot Want, real SafeArea insets
and public reload in Debug and true Release. UI trees, screenshots and
`LANE_B_ROUTER_STATE`/`LANE_B_ROUTER_PARAMS` logs are preserved in
`docs/harmony-sdk54/evidence/2026-09-20-navigation-diagnosis/`; see its report.

Foreground/background and rotation were not rerun after the final Screens fix.
Native Tabs, sheet detents, full Drawer/gesture behavior and multi-Ability
isolation are separate; the presence of their dependency sources is not acceptance.

Current evidence: `docs/harmony-sdk54/evidence/2026-09-20-router-host/` and A's
progress file. Root SDK version adoption is a separate decision after runtime
compatibility has been established.

The v2 Worklets fix passed real Debug/Release module creation and public reload;
see `docs/harmony-sdk54/evidence/2026-09-20-worklets-fix/`. The later blank page
was fixed by registering the existing `RNSScreenContentWrapper` ArkTS builder in
a fixed-hash Screens HAR. The Screens JS/native `fullScreenSwipeEnabled` types
still disagree; it did not block this matrix, but gesture-specific acceptance
remains open.
