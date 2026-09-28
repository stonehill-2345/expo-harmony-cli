#include "ExpoSplashScreenTurboModule.h"

namespace expo::splashscreen::harmony {

ExpoSplashScreenTurboModule::ExpoSplashScreenTurboModule(Context context, const std::string& name)
    : ArkTSTurboModule(std::move(context), name) {
  methodMap_ = {
      ARK_METHOD_METADATA(setOptions, 1),
      ARK_METHOD_METADATA(hide, 0),
      ARK_ASYNC_METHOD_METADATA(hideAsync, 0),
      ARK_ASYNC_METHOD_METADATA(preventAutoHideAsync, 0),
      ARK_ASYNC_METHOD_METADATA(internalPreventAutoHideAsync, 0),
      ARK_ASYNC_METHOD_METADATA(internalMaybeHideAsync, 0),
  };
}

} // namespace expo::splashscreen::harmony
