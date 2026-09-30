# Linking on the shared I0 host

Prepare a new fixture with the SDK generator's `--i0 --linking` options. This
adds the real `ExpoLinking` C++ and ETS package, an Ability-owned lifecycle and
native skills/querySchemes matching the fixture's actual public config.
The single-Ability test host retains that lifecycle across RN reload; production
multi-Ability hosts must provide each owning Ability's state separately.
Router source may be present in the repository but is **not installed or
accepted by this fixture**. No application Metro config, lookup shim or alternate
initialization mechanism is introduced. Entry remains public
`expo/registerRootComponent` and the screen composes the unchanged I0 regressions.

Use the approved Core-v1-v3 HAR and a new canonical path under `/private/tmp`.
Normal `prepare-fixture.cjs` installation archives current source packages;
never edit node_modules/oh_modules. Build with `tools/build-i0.sh` and serve Debug
with `tools/serve-i0.cjs`. The Asset server on18080 is still required. Debug uses
real Metro8081/message websocket; Release is native release/dev:false.

After installing the matching HAP, with only this dedicated app under test:

```sh
node packages/expo-modules-core/harmony/example/linking/verify-device.cjs \
  "$HDC" "$TARGET" debug /private/tmp/linking-debug-evidence-new
# Same command with release after installing the real Release HAP.
```

The driver refuses to overwrite evidence and only targets `dev.expo.harmony.i0`.
It sends real cold/hot Wants, checks initial/latest URLs, direct/Core/public
methods/events, hook mount/unmount, duplicate/empty Wants, subscriptions,
public URL construction/opening/failure behavior, three **public Core reloads**,
late work and foreground recovery. It reads the actual UI tree for the public
reload button; it retries input only while no reload request has been observed,
recording every attempt. It accumulates observed raw hilog lines per PID because
the bounded log ring can evict earlier records; assertions retain exact per-boot
listener/event counts. Logs are not rewritten into synthetic events.

`openSettings` is a real platform operation. Its Promise result and actual Ability
dump are recorded separately: rejection/target absence is a platform limitation,
not a fabricated pass. tel/sms requests are not sent and their known RNOH fixed
query result is not certified as real handler discovery.

Offline verification:

```sh
node packages/expo-modules-core/harmony/example/linking/check-log.cjs "$RELOAD_LOG"
node packages/expo-modules-core/harmony/example/tools/check-i0-log.cjs "$RELOAD_LOG" debug --reload
node --test packages/expo-modules-core/harmony/example/tests/linking-device-log.test.cjs
```

The independent I0 checker still validates all50 Core assertions and actual
Constants/Asset results. The Linking checker additionally rejects missing hooks,
wrong initial/latest state, missing probe results and duplicate/stale events.
The test uses preserved real device evidence and removes hook records to confirm
rejection; it is not a mock-native proof.

Local fixture preparation/bundling tests rewrite raw bundles. Run those tests
before building/installing device artifacts, or explicitly rebuild the chosen
mode afterward. Source archives and any later test-only fixture changes must have
separate hashes; never relabel older HAPs with a new source identity.
