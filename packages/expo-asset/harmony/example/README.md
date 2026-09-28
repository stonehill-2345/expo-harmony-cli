# Lane B module handoff: Constants and Asset

Status on 2026-09-18: module source and acceptance sources are available;
**B2/B3 public device acceptance and final B4 acceptance remain open**.
The current source commit is `78b7bb04eeb3228d9bcaad0d87d24696e295c9cc` plus
the unstaged lane B changes recorded in `progress-b.md`. Core remains at the
shared `ed0f2789c868f4f97a84eada7877e6ed4991f6bb` baseline; no new S1 was delivered.

This is a module test payload, not another Core/Metro build system or a standalone
prebuild project. A owns the reproducible SDK package build and shared host.
Use a separate B fixture/app ID and an agreed device window for these tests.

## Versions and production wiring

Use Expo 54.0.37, Core 3.0.30, Constants 18.0.14, Asset 12.0.13,
RN 0.82.1, React 19.1.1, RNOH 0.82.30, and Metro config 54.0.17.
Do not substitute unmodified registry Core/Metro packages for the Harmony source.
The local compile check used Node 22.20.0 and DevEco SDK target 6.0.2(22),
compatible 5.0.5(17), arm64-v8a. Runtime coverage is only the phone emulator
identified in the evidence; the full compatible-API range is not certified.

| Module | C++ header/class | CMake target | ArkTS export |
| --- | --- | --- | --- |
| `ExponentConstants` | `expo-constants/harmony/src/main/cpp/ExponentConstantsPackage.h`, `expo::constants::harmony::ExponentConstantsPackage` | `rnoh_expo_constants` | `ExponentConstantsPackage` from `expo-constants/harmony/index.ets` |
| `ExpoAsset` | `expo-asset/harmony/src/main/cpp/ExpoAssetPackage.h`, `expo::asset::harmony::ExpoAssetPackage` | `rnoh_expo_asset` | `ExpoAssetPackage` from `expo-asset/harmony/index.ets` |

After adding RNOH, add each package's `harmony/src/main/cpp` directory with
`add_subdirectory` and link the two targets into `rnoh_app`. Instantiate both C++
packages with the provider's real `rnoh::Package::Context ctx`; instantiate both
ArkTS packages with the real `RNPackageContext ctx`. Include all ArkTS source
siblings (`ConstantsData.ts` and `AssetCache.ts` included), and keep relative
imports intact. Constants uses `getUITurboModuleFactoryByNameMap`; Asset uses
`getAnyThreadTurboModuleFactoryByNameMap`. No module rename or JS import change.

Constants exposes sync `getConstants()` and async `getWebViewUserAgentAsync()`.
Asset exposes async `downloadAsync(url, md5Hash, type)`, with three positional
arguments and a `Promise<string>` file URI result. Constants runs on UI with a
ready windowStage. Asset uses actual RNOH context/cache/resource/httpClient and
async filesystem APIs; AnyThread does not by itself certify background execution
of every operation. Both follow the owning RNInstance lifetime. Do not retain
context across runtime destruction. No new JSI or Promise runtime is required.

The host must request `ohos.permission.INTERNET` for network resources.
`asset://x` reads rawfile `<rnInstance.getAssetsDest()>/x` (default `assets/x`);
`rawfile://x` reads rawfile `x`. Metro's numeric asset ID must resolve through
the official JS and RNOH resolver to the actual packaged filename; do not manually
register a fake asset ID or invent a successful URI.

## Public test assembly (after A supplies S1)

1. Use A's confirmed SDK build/install flow in an isolated fixture. Install the
   current two B packages through that flow; do not edit node_modules. Keep A's
   existing native Core package/initialization wiring. Add the two B production
   packages above. No application Metro config, alias, shim, or installation hook.
2. Register the test-only native packages alongside them:
   `lane_b::constants_oracle::LaneBConstantsOraclePackage` (header-only C++ in
   `expo-constants/harmony/example/native/cpp`) and its ArkTS
   `LaneBConstantsOraclePackage` from `native/ets/LaneBConstantsOracle.ets`;
   `lane_b::asset_oracle::LaneBAssetOraclePackage` from this example's
   `native/cpp`, link `lane_b_asset_oracle`, and add the ArkTS package of the
   same short class name from `native/ets`. Pass real contexts to every constructor.
   These oracles are fixture-only and must not ship in the production package list.
3. Assemble this `index.ts` at the fixture root; copy Constants example's
   `public-checks.js` as `constants-public-checks.js`, this example's
   `public-checks.js` as `asset-public-checks.js`, Constants example's `app.json`
   as the actual fixture config, and `fixtures/lane-b.svg` preserving its path.
   Set RNApp `appKey` to `LaneBPublicFixture`. Create `expected-build.json` from
   the selected build inputs, e.g. `{"debugMode":true,"runId":"<unique run identifier>"}`
   for Debug; use `false` for Release. Never infer this expected native value
   from `__DEV__` or from Constants itself.
4. Build Constants' existing scripts with their locked dependencies through the
   package build, create the destination rawfile directory, and run the official
   config generator below. Package its output as `rawfile/app.config`.
   The fixture root must contain its actual `package.json` and the above `app.json`.
   Do not handwrite `app.config`. Copy this example's `rawfile/` contents preserving
   paths. A's normal asset pipeline must additionally package `lane-b.svg` under
   the path produced by Metro/RNOH for the static `require`.
5. Start the controlled server, forward device TCP 18080 to host TCP 18080 using
   the approved HDC workflow, then use A's SDK-owned bundle command and build
   both Debug/dev:true and Release/dev:false HAPs. The old B direct fixture's
   local `metro.config.js` is not part of this handoff and must not be used for
   public API acceptance. Do not edit A's bundler to force these tests through.
6. Install/start only the B test app in the agreed window. Save PID-scoped logs,
   server request counts, generated config, source/HAP hashes, and build modes.
   Require both `LANE_B_PUBLIC_CONSTANTS_PASS` and `LANE_B_PUBLIC_ASSET_PASS`,
   and no `LANE_B_PUBLIC_FAIL`. Repeat a cold launch and compare sessionId values.
   Build success alone is not a passing result. Stop the B app/server and remove
   only the test's own forward rule afterward.

```sh
node packages/expo-constants/scripts/getAppConfig.js "$LANE_B_FIXTURE_ROOT" "$LANE_B_RAWFILE_DIR"
node packages/expo-asset/harmony/example/server.mjs
node --test packages/expo-asset/harmony/example/server-smoke.test.mjs
node --experimental-strip-types --test packages/expo-constants/harmony/tests/constants-data.test.mjs packages/expo-asset/harmony/tests/asset-cache.test.mjs
```

The host smoke test binds 127.0.0.1:18080 temporarily and closes it. Run it while
the device-test server is stopped. It tests only server behavior, not Harmony.
The server supplies response bytes, per-URL counters at `/stats`, 404s and a
120-second slow response; request/close logs contain timestamps to distinguish
runtime cancellation from the module's 30-second HTTP read timeout.

## Preserved direct test and remaining gaps

`direct-rnoh.jsx` preserves the prior Asset fixture entry; `rawfile/` and the
Asset oracle are its original sources. Its app key is `AwesomeProject`, and its
reload marker persists in the test app's files directory. It is historical
diagnostic input, not an assertion-complete B3 test. In particular, a server
`aborted` line alone does not prove destruction rather than HTTP timeout.

The new public checks cover Constants config and system oracle, session identity,
UA method forwarding, Asset numeric/static and URL modules, loadAsync, real bytes,
MD5 cache/repair/request counts, null-hash concurrency, file URI, encoded spaces
and Unicode with no extension, 404/missing-resource rejection and public state.
They have not yet run on device. Exact static asset naming and Core TurboModule
method forwarding are deliberately tested, not bypassed.

Still required: real configuration missing/malformed cases, window/UA failures,
HTTPS trust and certificate errors, transport failure, write/space/permission
failure, I/O cancellation/handle cleanup and runtime reload timing, and complete
Debug/Release public results. These module-local negative tests do not all depend
on A. Standard Expo initialization is A's separate I0 milestone.

Current blockers and evidence are in
`docs/harmony-sdk54/team/progress-b.md` (B-CORE-001) and
`docs/harmony-sdk54/evidence/lane-b/public-preflight-20260918/`.
