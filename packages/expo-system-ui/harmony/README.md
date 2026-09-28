# expo-system-ui Harmony

The Harmony implementation keeps the upstream module name `ExpoSystemUI` and
the public `setBackgroundColorAsync` / `getBackgroundColorAsync` signatures.
It calls the API 22 main window's real `setWindowBackgroundColor` method.

Harmony does not expose a matching background-color getter on `Window`. The
module therefore returns the last color that was successfully applied and
persists explicit colors in Preferences so RNOH reload and process recreation
restore the same real window state. Passing `null` removes that preference and
resolves the current UIAbility color mode to black or white, matching the
Android/iOS reset behavior.

## Host wiring

ArkTS package provider:

```ets
import { ExpoSystemUIPackage } from './system-ui/ExpoSystemUIPackage';

return [new ExpoSystemUIPackage(ctx), ...otherPackages];
```

C++ package provider:

```cpp
#include "ExpoSystemUIPackage.h"

std::make_shared<expo::systemui::harmony::ExpoSystemUIPackage>(ctx)
```

CMake:

```cmake
add_subdirectory("${NODE_MODULES}/expo-system-ui/harmony/src/main/cpp" expo-system-ui)
target_link_libraries(rnoh_app PUBLIC rnoh_expo_system_ui)
```

Copy `harmony/src/main/ets` into the host's ArkTS source tree or expose the
package through an OHPM library. Do not add a JS proxy: the official package JS
must reach this module through Expo Modules Core's normal native lookup path.
