#pragma once

#include "ExpoSystemUITurboModule.h"
#include "RNOH/Package.h"

namespace expo::systemui::harmony {

class ExpoSystemUIFactory final : public rnoh::TurboModuleFactoryDelegate {
 public:
  SharedTurboModule createTurboModule(Context context, const std::string& name) const override {
    if (name != "ExpoSystemUI") return nullptr;
    return std::make_shared<ExpoSystemUITurboModule>(std::move(context), name);
  }
};

class ExpoSystemUIPackage final : public rnoh::Package {
 public:
  using Package::Package;

  std::unique_ptr<rnoh::TurboModuleFactoryDelegate> createTurboModuleFactoryDelegate() override {
    return std::make_unique<ExpoSystemUIFactory>();
  }
};

} // namespace expo::systemui::harmony
