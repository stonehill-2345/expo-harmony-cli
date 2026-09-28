#pragma once

#include "ExpoSplashScreenTurboModule.h"
#include "RNOH/Package.h"

namespace expo::splashscreen::harmony {

class ExpoSplashScreenFactory final : public rnoh::TurboModuleFactoryDelegate {
 public:
  SharedTurboModule createTurboModule(Context context, const std::string& name) const override {
    if (name != "ExpoSplashScreen") return nullptr;
    return std::make_shared<ExpoSplashScreenTurboModule>(std::move(context), name);
  }
};

class ExpoSplashScreenPackage final : public rnoh::Package {
 public:
  using Package::Package;
  std::unique_ptr<rnoh::TurboModuleFactoryDelegate> createTurboModuleFactoryDelegate() override {
    return std::make_unique<ExpoSplashScreenFactory>();
  }
};

} // namespace expo::splashscreen::harmony
