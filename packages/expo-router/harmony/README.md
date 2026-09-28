# Expo Router 6.0.24 on Harmony

This is the first package-level adaptation, not completed device acceptance.
The public entry remains `expo-router/entry`; no application Metro configuration,
shim, native module substitute, or custom router entry is required by this change.

## Implemented and tested

- Route discovery recognizes `.harmony.js/jsx/ts/tsx` as platform files, with
  Harmony → native → universal precedence. Other platforms ignore Harmony files.
- Layouts and dynamic routes keep their platform-neutral logical names. A
  platform-specific route still needs its universal sibling. API routes cannot
  use a Harmony suffix. Typed routes do not publish `.harmony` URLs.
- Package-owned `_ctx.harmony.js` passes the normal Expo Babel app-root and import
  mode values to Metro's `require.context`. It excludes server API, root HTML and
  middleware files while retaining `+native-intent` for native deep-link handling.
  The existing package whitelist `_ctx.*` already includes this file.
- The tracked `build/getRoutesCore.js` and source map are generated from the
  changed TypeScript with the root lock's TypeScript 5.9.2. No dependency upgrade.

```sh
node --experimental-vm-modules --test packages/expo-router/harmony/tests/platform-routes.test.cjs packages/expo-router/harmony/tests/context.test.mjs
```

These 12 tests execute the package's actual built route scanner and typed-route
generator. The context test captures `require.context` arguments inside a Node VM;
it does not claim Metro bundling or native navigation works. Tests need no mocked
Expo/Core/native modules. The full upstream Jest suite still requires the normal
monorepo test dependencies (`expo-module` is unavailable in this checkout).

## Standard-entry fixture

`example/package.json` declares `main: expo-router/entry`; `example/app` contains
a root Stack, two Tabs, a dynamic detail page, links, imperative push/replace/back,
query parameters and a not-found page. Copy these source inputs into the agreed
independent B host through A's existing assembly workflow. Install the current SDK
artifacts and locked dependencies there through the normal package manager; do not
use unmodified registry Core/Metro or modify node_modules. The fixture intentionally
does not select new dependency versions or add a second SDK bundler.

Generate actual public config from `example/app.json` using Constants' official
script; register the real Core, Constants, Asset, Linking, Screens and SafeArea
packages in the host. The native app key for Expo's standard registration is
`main`. Use a distinct test bundle ID such as `dev.expo.laneb.routerfixture` and
register its real `lanebrouter` URI scheme in its Harmony module manifest.

Require visible screens and matching `LANE_B_ROUTER_STATE` / `LANE_B_ROUTER_PARAMS`
logs for each operation; these are observations, not automatic PASS markers:

1. Cold launch reaches Home; switching Home/Settings preserves correct tab state.
2. Link opens details 42 with query `资源 space`; push opens details 7; replace
   changes it to 99; UI back and system back produce the expected stack state.
3. Missing route shows the not-found page, and Home replace recovers.
4. A real OS deep link to `lanebrouter://details/42` works for a stopped app and
   an already running app. Verify Unicode/query decoding and listener cleanup.
5. Repeat in Debug and Release, then test runtime reload and background/foreground.
   Capture app/SDK versions, source and HAP hashes, PID-scoped logs and actual UI.

The fixture's six TSX files currently have syntax/transpilation checks only.
No Router HAP has been bundled, installed, launched or accepted in this session.

## External prerequisites and ownership

| Dependency | Source requirement | Current finding |
| --- | --- | --- |
| Core/Metro/Expo entry | SDK-owned Harmony initialization and context transformation | A-owned; no newly accepted S1 in local history. B does not replace it. |
| expo-linking 8.0.12 | `src/ExpoLinking.ts` immediately requires real `ExpoLinking`; initial URL and URL events must be native-backed | Harmony backend exists; Debug/Release direct RNOH results and Debug reload are recorded in `linking-direct-20260920`. Official JS/Core and Router integration still need device acceptance. |
| Native Stack 7.3.16 | `NativeStackView.native.tsx` imports `ScreenStackItem`; peer Screens >=4.0.0 | Local adapter 3.34.1 lacks this export. Read-only candidate Harmony Screens 4.9.0 includes it and a native HAR, but requires upstream 4.17.1 rather than the SDK's ~4.16.0. No candidate installed. |
| Screens native runtime | Candidate HAR must compile and run against the agreed RNOH | Candidate 4.9.0 declares RNOH 0.82.18; this workspace uses 0.82.30. Compatibility is unverified. Native registration and source findings are in `router-screens-audit-20260920/report.md`. |
| Navigation native | Native Stack peer `@react-navigation/native ^7.1.11` | Root lock resolves native 7.1.8. Needs a reviewed compatible dependency baseline; no version change made. |
| SafeArea | `ExpoRoot` uses the actual native SafeAreaProvider | Local adapter 5.6.3 exists, but it is not registered in the old B two-module fixture. No fake zero metrics. |

Screens/SafeArea versions, native registration and the shared test host are an A
integration request (B-ROUTER-002). Module-local Router work does not authorize
dependency upgrades, editing third-party adapters or replacing the native stack.
The user confirmed Constants/Asset as the preceding completed modules; that
confirmation does not count as a Router device result.

`unstable-native-tabs`, Drawer/gestures, iOS Link preview/Handoff, RSC/server routes,
web builds and full default-template compatibility have not been accepted by this
change. Further behavior must be verified against actual native dependencies.
Candidate Screens 4.9.0 marks BottomTabs exports unsupported and omits their
C++ descriptors/binders and ArkTS factory registration; source files alone do not
make native tabs usable. Sheet detents also lack a traced native implementation.
Neither is a prerequisite for the fixture's ordinary Stack and JavaScript Tabs.

Progress and source evidence: `docs/harmony-sdk54/team/progress-b.md` and
`docs/harmony-sdk54/evidence/lane-b/router-platform-20260918/`.
