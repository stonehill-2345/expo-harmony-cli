#pragma once

#include "RNOH/ArkTSTurboModule.h"

namespace expo::splashscreen::harmony {

class ExpoSplashScreenTurboModule final : public rnoh::ArkTSTurboModule {
 public:
  ExpoSplashScreenTurboModule(Context context, const std::string& name);
};

} // namespace expo::splashscreen::harmony
