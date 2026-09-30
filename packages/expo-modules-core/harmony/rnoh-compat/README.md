# SDK-owned RNOH compatibility artifact

`expo-rnoh-0.82.30-core-v1-v3` includes the A-RNOH-001 fix: the published
RNOH 0.82.30 ArkTS Promise bridge drops native error fields other than `message`.
This is a **local SDK compatibility artifact**, not an official RNOH release or
a new Expo business implementation. Do not apply this patch inside an application
or via postinstall/patch-package. Do not change installed node_modules/oh_modules.

## Scope

The structured rejection patch changes `src/main/cpp/RNOH/ArkTSTurboModule.cpp`:

- Preserve a native rejection object when it has the required string message.
- Normalize string/empty-argument rejection to the same message object as before.
- Settle through the existing RNOH/RN Promise's reject function on its existing
  JS CallInvoker task. Keep weak Promise ownership and `allowRelease` unchanged.
- Do not modify RN's Promise type, create another Promise implementation, inject
  Expo error codes, or special-case any module name.

Objects with no code remain without code; native string or numeric code fields
are not inferred from messages. Native conversion failures still use the existing
`reject(string)` path. This compatibility patch is not a full ArkTS error-schema
or arbitrary-value rejection redesign.

The v3 profile additionally changes `src/main/ets/RNApp.ets` for A-RNOH-002:
a reactive local mount generation keys the surface/overlay subtree. RNOH reload
reuses numeric instance IDs, so those IDs cannot serve as generation keys. `shouldShow`
false/true may coalesce in one UI update during fast Release reload; identity
must not depend on the old subtree disappearing first. The patch uses ArkUI's
keyed lifecycle, not a timeout, extra application entry, or fake reload result.
The initial Release blank-surface failure, an unchanged-HAP retry that passed,
and the failed instance-ID-key candidate are all preserved in final evidence; see A's final evidence for actual multi-round validation.

## Produce a dependency artifact

Requires Python 3.11+ and `patch` on PATH. The original HAR can come from the
locked `@react-native-oh/react-native-harmony@0.82.30` npm package. The tool reads
it without modifying it. No downloaded source repository or long-lived fork is
needed. In the tested host, CMake compiles the patched C++ source during HAP build;
the tool below repackages the HAR but does not claim to precompile all RNOH.

```sh
python3 packages/expo-modules-core/harmony/rnoh-compat/prepare_har.py \
  --input-har /absolute/path/react_native_openharmony.har \
  --output-har /private/tmp/expo-deps/rnoh-0.82.30-core-v1-v3.har
```

`rnoh-0.82.30-core-v1-v3.json` pins the complete input HAR hash, native package
version, and both original/patch/result source hashes. A mismatch
fails closed, not a fuzzy apply. Output must not already exist. The output HAR
and adjacent `.manifest.json` record original/patched identities. They are local
build artifacts and must not be committed. Identical input/tool produces identical
HAR bytes (fixed gzip timestamp and filename; preserved member metadata/content).

Use the artifact through the SDK fixture assembler:

```sh
node packages/expo-modules-core/harmony/example/tools/prepare-fixture.cjs \
  --sdk-root "$PWD" --fixture-root /private/tmp/expo-a0-patched \
  --tooling-root /absolute/path/typescript-tooling \
  --har /private/tmp/expo-deps/rnoh-0.82.30-core-v1-v3.har
```

The default profile is `core-v1-v3`; the failed v2 candidate is evidence-only. Use `--profile structured-rejection-v1`
only to reproduce the previous single-file artifact; its original lock and patch
remain unchanged. A successful v1 interop test is not proof of stable Release
surface reload.

A maintains this single shared build input. B keeps its public imports and
native module wiring unchanged. Future template/toolchain distribution should
consume the same controlled artifact instead of instructing applications to
apply their own patches; automatic Expo prebuild/autolinking is not delivered
by this script.

## Tests and removal

```sh
RNOH_INPUT_HAR=/absolute/path/react_native_openharmony.har \
  python3 packages/expo-modules-core/harmony/example/tests/rnoh-compat.test.py
```

Tool tests use the real HAR and check deterministic output, original input
immutability, exactly-two-file content change, rejection of unknown inputs and
refusal to overwrite outputs. Device acceptance remains necessary: all six final result groups (8+16+7+9+5+5), Debug/Release, repeated public
reload, and pending native worker/view/ArkTS rejection during reload.
A tool test alone cannot establish native behavior.

When an official compatible RNOH fixes this behavior, first run the same public
API/device tests against the unpatched artifact. Remove this patch only after
those tests pass; do not silently apply it to a different release/hash. See A's
progress/evidence for actual acceptance status, not merely the presence of a patch.
