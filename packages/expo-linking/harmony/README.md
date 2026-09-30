# Expo Linking on Harmony

Native backend for expo-linking 8.0.12, React Native 0.82.1 and RNOH 0.82.30.
The official JS entry and signatures are unchanged. This is a manual native
package integration; automatic linking and standard Expo initialization are not
claimed as complete.

## Native contract and wiring

- Native name: `ExpoLinking`.
- Synchronous method: `getLinkingURL(): string | null`, the latest nonempty URI
  received by this UIAbility. Before any link arrives it returns null. Empty
  Wants do not erase a previously received link.
- Event: `onURLReceived`, payload `{ url: string }`. Repeated real Wants produce
  repeated events. Registering a listener does not replay the previous URI.
- ArkTS: export `ExpoLinkingPackage` and `ExpoLinkingLifecycle` from `index.ets`.
  Construct one lifecycle per UIAbility, forward its real `onCreate(want)` and
  `onNewWant(want)` calls, and call `onDestroy()` at Ability destruction. Continue
  calling the corresponding `RNAbility` superclass callbacks so RN Linking's
  separate event path still works.
- Each RN instance's package factory constructs `new ExpoLinkingPackage(ctx,
  lifecycle)` with that Ability's lifecycle. Do not create a new lifecycle during
  RN reload. The example's AppStorage key is specific to its single Ability;
  production multi-Ability hosts must pass each owning Ability's object directly.
- C++: add `src/main/cpp` after RNOH, link `rnoh_expo_linking`, and register
  `expo::linking::harmony::ExpoLinkingPackage(ctx)` in PackageProvider.
- Declare the app's actual URI skills and `querySchemes` in its module manifest.
  The `laneblinking` scheme belongs only to the diagnostic fixture.

The UI TurboModule reads Ability state on MAIN and unsubscribes on module
destruction. RNOH's existing instance-scoped `postMessageToCpp` / ArkTSMessageHub
transports URL events. RN's existing AsyncEventEmitter schedules listeners on JS;
its subscription provides `remove()`. No additional JSI installer, JS module
lookup proxy, or Promise runtime is introduced. Removal prevents future event
enqueues; callbacks already queued by RN are subject to RN's semantics.

Official `getInitialURL`, `addEventListener`, `openURL`, `canOpenURL` and
`openSettings` still delegate to RN Linking. `getInitialURL` means the initial
launch URL, unlike `getLinkingURL`'s latest URL. RNOH 0.82.30 has platform limits:
its tel/sms query returns true without querying an installed handler, custom
scheme queries need querySchemes, and its settings target is platform-specific.
These paths must not be called universally validated from a backend event test.

RNOH returns null/undefined when the real open operation fulfills. The package's
`openURL` maps that fulfilled result to its documented `true`; it still waits for
the operation and propagates rejection unchanged. Other non-null native results
are preserved.

## Independent native diagnostic fixture

`example/native` is owned by lane B and uses bundle ID
`dev.expo.laneb.linkingfixture`. It includes only RNOH and this module, no business
app sources, signing material or shared Core host. Requires DevEco/Harmony SDK
supporting the declared target 6.0.2(22), compatible 5.0.5(17), arm64-v8a.

```sh
# RN_DEPENDENCY_ROOT contains the locked React/RN/RNOH and RN Metro dependencies.
# Preparation reads it and copies its RNOH HAR; it never installs into it.
LINKING_FIXTURE=$(mktemp -d /tmp/expo-linking-lane-b.XXXXXX)
node packages/expo-linking/harmony/example/prepare-native.cjs "$LINKING_FIXTURE" "$RN_DEPENDENCY_ROOT"
node packages/expo-linking/harmony/example/bundle-direct.cjs "$LINKING_FIXTURE" "$RN_DEPENDENCY_ROOT"
# In LINKING_FIXTURE, with DevEco's node/ohpm on PATH and DEVECO_SDK_HOME set:
ohpm install
hvigorw --mode module -p product=default -p module=entry@default -p buildMode=debug assembleHap --no-daemon --no-incremental
# Inspect module.json and resources/rawfile/bundle.harmony.js in the HAP first.
# Install only to an identified emulator that supports unsigned debug HAPs.
hdc -t TARGET install entry/build/default/outputs/default/entry-default-unsigned.hap
```

The bundler is solely for direct RNOH diagnostics and uses RNOH's supplied
configuration. It is not an application compatibility config or a substitute for
A's SDK Metro build. Run `example/verify-direct.cjs HDC TARGET` from the repository
after successful installation. It operates only the dedicated B application and
rejects detected A test activity. It sends actual Wants and asserts results from
PID-filtered logs; HDC's host exit code alone is insufficient.

For Release, prepare a separate empty directory with `prepare-native.cjs ...
--release` to select the locked RNOH Release HAR, bundle with `bundle-direct.cjs
... --release`, build with `-p buildMode=release`, and run `verify-direct.cjs HDC
TARGET --release`. This verifies cold/hot links and listeners in Release, but
does not claim DevSettings reload (a development-only API) works in Release.

## Public entry acceptance

`example/public.tsx` uses `import * as Linking from 'expo-linking'`, the official
`useLinkingURL` hook and Core `requireNativeModule`. Integrate it only with A's
accepted Core/Metro packages and the native wiring above. Verify initial/latest
URLs, the hook and RN event path, listener removal/unmount, restart and reload.
Do not substitute the direct diagnostic bundle for this acceptance.

Local state tests:

```sh
node --experimental-strip-types --test packages/expo-linking/harmony/tests/linking-lifecycle.test.mjs
node --experimental-vm-modules --test packages/expo-linking/harmony/tests/open-url.test.mjs
```

Use Node 22.20.0 for the VM tests. These tests exercise state transitions and
JS return/error behavior, not a mocked proof of native integration.
Current outcomes and remaining gates are recorded in
`docs/harmony-sdk54/team/progress-b.md` and lane B evidence.
