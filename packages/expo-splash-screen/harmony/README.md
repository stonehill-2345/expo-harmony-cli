# Expo Splash Screen on Harmony

Native RNOH backend for `expo-splash-screen@31.0.13`, React Native 0.82.1,
and RNOH 0.82.30. The official `expo-splash-screen` JavaScript entry, native
name (`ExpoSplashScreen`), and method signatures remain unchanged.

This package controls a real ArkUI layer placed above `RNApp`. Returning values
from the TurboModule without mounting `ExpoSplashScreenView` is not a complete
integration.

## Native contract

The module implements `setOptions`, `hide`, `hideAsync`,
`preventAutoHideAsync`, `internalPreventAutoHideAsync`, and
`internalMaybeHideAsync`.

- RNOH `CONTENT_APPEARED` hides an unclaimed splash screen.
- Router's internal prevention holds the screen until internal maybe-hide.
- A user `preventAutoHideAsync()` call keeps ownership until explicit `hide()`
  or `hideAsync()`.
- A reload starts a new visible runtime and ignores callbacks from the previous
  runtime.
- The module removes marker and reload listeners when RNOH destroys it.
- `setOptions` defaults to `duration: 400` and `fade: false`; a fading hide uses
  ArkUI animation and removes the covering layer only after completion.

## Required host wiring

Create one controller for the owning UIAbility before `RNAbility.onCreate`
finishes, make the same object available to the page and package provider, and
destroy it with the Ability. The storage key below is only an example for a
single-Ability host.

```ts
private readonly splashScreenController = new ExpoSplashScreenController();

override onCreate(want: Want, launchParam?: AbilityConstant.LaunchParam): void {
  AppStorage.setOrCreate('ExpoSplashScreenController', this.splashScreenController);
  super.onCreate(want, launchParam);
}

override onDestroy(): void {
  this.splashScreenController.destroy();
  AppStorage.delete('ExpoSplashScreenController');
  super.onDestroy();
}
```

Register the ArkTS package with that exact controller:

```ts
const controller = AppStorage.get<ExpoSplashScreenController>('ExpoSplashScreenController');
if (!controller) throw new Error('ExpoSplashScreen controller is missing');

return [new ExpoSplashScreenPackage(ctx, controller)];
```

Mount the covering view after `RNApp` inside the same full-screen `Stack`. Supply
real app resources through the builder; the module does not invent a logo,
background, or business-specific configuration.

```ts
Stack() {
  RNApp({ /* existing host configuration */ })
  ExpoSplashScreenView({
    controller: this.splashScreenController,
    splashContent: this.splashContent,
  })
}
.width('100%')
.height('100%')
```

Add `src/main/cpp` after the RNOH target exists, link
`rnoh_expo_splash_screen`, and register the C++ package:

```cpp
std::make_shared<expo::splashscreen::harmony::ExpoSplashScreenPackage>(ctx)
```

Both ArkTS and C++ registrations are required. Do not rename the module or add
an application-side JS proxy. RNOH recreates the package and TurboModule for a
new RNInstance during public reload; the Ability-owned controller intentionally
survives that reload and is reset to a new runtime generation.

## Verification

```sh
node --experimental-strip-types --test \
  packages/expo-splash-screen/harmony/tests/splash-screen-controller.test.mjs

EXPO_HARMONY_TOOLING_ROOT=/path/to/typescript-tooling \
node --experimental-vm-modules --test \
  packages/expo-splash-screen/harmony/tests/splash-screen-module.test.cjs
```

These tests cover the state machine and RNOH-facing lifecycle with test
adapters. They do not replace a device check. Device acceptance must separately
verify Debug and Release cold launch, Router internal prevent/maybe-hide, user
prevent plus explicit hide, fade/duration, public reload, foreground/background,
and Ability destruction through the official JS API and Core lookup path.

Current results and outstanding device gates are recorded in
`docs/harmony-sdk54/team/progress-c.md`.
