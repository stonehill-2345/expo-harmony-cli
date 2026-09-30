# A0 / S1: real RNOH module wiring

This is an independent Core fixture, **not** ExpoAsset/ExponentConstants and not
standard Expo startup. The original eight JSI tests remain in App.tsx; the
separate `EXPO_CORE_INTEROP_RESULTS` group exercises the real RNOH fallback.
A failed error-code test is an acceptance failure, never an allowed skip.
The published RNOH 0.82.30 loses error codes; use the pinned SDK compatibility
artifact below. Its provenance and removal policy are in
[`../rnoh-compat/README.md`](../rnoh-compat/README.md).

## Build from this repository

Prerequisites: Node 22, npm, tar, DevEco SDK/ohpm/hvigor, a supported arm64 test
device. Use independent fixture directories and serialize device testing with B.
No old CMake cache or modified node_modules is required. The checked-in `host/`
was extracted from the historical example-host-source.zip and is now maintained
as source; the historical ZIP is not modified. App identity is
`com.expo.harmonycorea0`, separate from the earlier Core test application.

```sh
export SDK="$(pwd -P)"
export EXAMPLE="$SDK/packages/expo-modules-core/harmony/example"
export DEVECO_HOME="/Applications/DevEco-Studio.app/Contents"
# Put Node 22 on PATH. For a clean machine, prepare only the build-time compiler:
npm install --prefix /tmp/expo-a0-tools --ignore-scripts --no-audit typescript@5.9.2
export FIXTURE=/private/tmp/expo-core-a0-new
# SDK-side dependency build; do not patch the application's installed dependencies.
python3 "$EXAMPLE/../rnoh-compat/prepare_har.py" \
  --input-har /absolute/path/original/react_native_openharmony.har \
  --output-har /private/tmp/expo-deps/rnoh-0.82.30-core-v1-v3.har
node "$EXAMPLE/tools/prepare-fixture.cjs" \
  --sdk-root "$SDK" --fixture-root "$FIXTURE" --tooling-root /tmp/expo-a0-tools \
  --har /private/tmp/expo-deps/rnoh-0.82.30-core-v1-v3.har
# Omitting --har intentionally uses the original 0.82.30 HAR, which loses error codes.
node "$EXAMPLE/tools/verify-install.cjs" "$FIXTURE"
bash "$EXAMPLE/tools/build-hap.sh" "$FIXTURE" debug
# Actual Release HAP, not a Debug HAP with production JS:
bash "$EXAMPLE/tools/build-hap.sh" "$FIXTURE" release
```

The destination must not exist. `--prepare-only` builds archives and writes host
source without npm install; run `npm install --ignore-scripts --no-audit --no-fund`
inside the fixture afterward. Use a **new** fixture after changing SDK sources.
The compiler can also be resolved from an existing development environment via
`--tooling-root`, which is only read, never used as the Core/Metro source.

`source-manifest.json` records base commit, dirty status, all source file hashes,
package versions and archive SHA256. Core runtime TS and C++ are packed from
current repository sources; Metro runtime TS is locally transpiled from **all**
non-test src files. Existing declaration files are retained. This is **not** a
complete monorepo build, declaration regeneration, or full SDK typecheck.
Core native compilation occurs during the real HAP build. `host/package-lock.json`
pins registry dependencies; historical local archive references are replaced by
newly generated Core/Metro dependencies at assembly time. No historical tgz is
read. Build warnings must still be reviewed.

## Real device validation

```sh
export HDC=/path/to/hdc
export DEVICE=127.0.0.1:5557
"$HDC" -t "$DEVICE" install "$FIXTURE/artifacts/core-a0-debug.hap"
"$HDC" -t "$DEVICE" shell aa start -a EntryAbility -b com.expo.harmonycorea0
# Wait for test completion, then obtain the actual current PID (do not reuse an old PID).
"$HDC" -t "$DEVICE" shell pidof com.expo.harmonycorea0
"$HDC" -t "$DEVICE" shell hilog -x -P <PID> > "$FIXTURE/debug-device.log"
node "$EXAMPLE/tools/check-device-log.cjs" "$FIXTURE/debug-device.log"
# Repeat install/start/PID/log/check with core-a0-release.hap.
```

The final checker requires all groups: original 8/8, interop 16/16, context 7/7,
UUID 9/9, boundary 5/5, and view 5/5. It exits
nonzero for missing, truncated or failed results. HDC host exit 0, a live process,
or a successful build is not acceptance. The two routes each test constants,
sync string, sync null, Promise resolve, rejection code+message, string rejection,
and rejection without code; lookup and
raw identity are tested separately. Error logs include both native and JS sides.

## Files and registration interfaces for B

| Layer | Probe example | How a business package uses it |
| --- | --- | --- |
| ArkTS implementation | `ets/ExpoCoreInteropProbePackage.ets` | Export a `RNOHPackage`; extend `UITurboModule` only when UI context/API is needed |
| ArkTS factory | `getUITurboModuleFactoryByNameMap()` | Map the **exact public native name** to a factory receiving `UITurboModuleContext` |
| C++ bridge | `native/ExpoCoreInteropProbePackage.cpp` | Subclass `rnoh::ArkTSTurboModule`, declare method names/argument counts using `ARK_METHOD_METADATA` / `ARK_ASYNC_METHOD_METADATA` |
| C++ factory | `createTurboModuleFactoryDelegate()` | Return the module only for its exact native name, nullptr otherwise |
| CMake | `expo_core_interop_probe` | Link `rnoh`, export headers; host links the package target into `rnoh_app` |
| Host C++ | `host/harmony/entry/src/main/cpp/PackageProvider.cpp` | Add one package instance; retain the Core package and original test packages |
| Host ArkTS | `host/harmony/entry/src/main/ets/PackageProvider.ets` | Return one matching ETS package; the assembly tool copies the probe ETS source into the host |
| JS | `interop-tests.ts` | Keep official public `requireNativeModule(name)`; no application proxy/entry workaround |

B should export its ETS package from its own package/HAR rather than copying its
business logic into this host. A owns shared host edits. Native names remain
`ExponentConstants` and `ExpoAsset`; the probe never registers either of them.
Do not implement another Promise runtime or change public business imports.

## Context, threads, destruction

For this probe, context becomes available in the RNOH factory/constructor.
`getConstants()` reads `ctx.uiAbilityContext.cacheDir`, not a fixed app path.
The fixed `source` marker is test data only. The probe uses `UITurboModule` because
it deliberately exercises the UIAbility context. RNOH executes those ArkTS methods
on MAIN/UI. Sync C++ `call()` uses `runSyncTask`; never wait back on JS or start
async work during synchronous constants access. Keep that path small.

`ARK_ASYNC_METHOD_METADATA` uses the existing RNOH `callAsync` Promise bridge and
CallInvoker for JS settlement. The trivial addition tests bridge delivery; it
**does not** prove CPU work runs off UI. For APIs safe on UI/worker, use
`AnyThreadTurboModule` and `getAnyThreadTurboModuleFactoryByNameMap()` only after
checking platform API restrictions and whether the host actually enables workers.

RNOH `TurboModuleProvider.onDestroy()` calls `__onDestroy__()` on cached modules.
The probe marks itself destroyed and guards subsequent context access; it holds
no background resource or custom callback registry. Process kill is not proof of
this lifecycle hook. The existing Debug reload button also starts a delayed ArkTS
rejection: a native `destroyed=true` late-completion log must not produce a JS
`EXPO_CORE_STALE_REJECTION` in the new runtime. This is a test of the existing
DevSettings reload path, not Expo's public reloadAppAsync implementation.

## Acceptance status

See `docs/harmony-sdk54/team/progress-a.md` and the A0 evidence report for the
actual device results. Do not infer S1 support from the presence of these files.

## Core-v1 native host registration (A1)

Core now owns a real ArkTS context backend at
`harmony/src/main/ets/ExpoModulesCorePackage.ets`. The SDK assembler copies this
source into the fixed host and its `PackageProvider.ets` registers
`new ExpoModulesCorePackage(ctx)` alongside the probe. Keep the existing C++
`expo::harmony::ExpoModulesCorePackage` registration as well. Both sides use the
native name `ExpoModulesCore`; no business module/import changes are required.
Do not inject directory strings in EntryAbility or the application JS entry.

`cacheDir` is the platform UIAbility cacheDir; `documentsDir` is UIAbility filesDir,
the persistent private files directory (the equivalent of Android's filesDir).
Harmony exposes native absolute paths, as permitted by the cross-platform Core
contract; it does not manufacture a URI. Version values are generated by CMake
from Core's package.json, not copied from the example's app version.

This host-registration change is owned by A. B should consume the updated A
fixture/Core package rather than add another context bridge. Full HAR publishing
and autolinking are still separate milestones.

## Core-v1 resource and view authoring contracts (A3)

JS `SharedObject.release()` revokes a binding, not other native owners of the
same resource. C++ methods should call `getSharedObjectResource(runtime, receiver)`
from `ExpoModulesCoreRuntime.h`, then validate the resource type/identity before
casting. The helper rejects released/unbound/foreign-runtime bindings and checks
the current registry. A weak_ptr alone is not evidence that JS still has access.
See the probe's getValue and retained-owner tests; do not change the upstream
SharedObject base to forcibly destroy other owners' resources.

For native view prototype methods, `ExpoModulesCoreViewBinding.h` provides:

- `mountNativeView` / `unmountNativeView`, wired through prototype hooks
  `__expoMountView` / `__expoUnmountView`. The Harmony public adapter invokes them
  after obtaining the actual nativeTag and before clearing it on unmount.
- `getNativeViewBinding` on JS returns a weak binding. Capture this rather than a
  bare tag in delayed native operations.
- `resolveNativeView` on MAIN binds the first real mounted instance (React mount
  may precede the Fabric UI mutation), then verifies the token, that weak instance,
  still-mounted native parent, and registry identity. It rejects with
  `ERR_VIEW_UNMOUNTED` rather than accessing a different view that reused a tag.

The wrapper owns the token; it does not retain the view. Unmount and wrapper
NativeState destruction revoke it. Runtime-owned async settlement still uses
Core startAsync, so late native completion cannot settle into a replacement
Runtime. A queued void setter may be canceled if unmounted after dispatch;
a result-returning read must reject, not manufacture success. No complete view
DSL or autogenerated HAR linking is claimed.

`NativeAsyncError(code, message)` is the Core C++ worker/converter rejection
contract; ordinary std::exception keeps ERR_NATIVE_ASYNC. ArkTS modules continue
to use RNOH's existing Promise path and the pinned compatibility artifact.

Platform's Harmony key is accepted by public TS types. The SDK package assembly
regenerates Platform declarations with TypeScript rather than patching installed
node_modules; remaining declarations are the source snapshot's existing files.
