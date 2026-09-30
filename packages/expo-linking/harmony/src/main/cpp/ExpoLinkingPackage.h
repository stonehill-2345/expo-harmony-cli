#pragma once

#include "ExpoLinkingTurboModule.h"
#include "RNOH/Package.h"

namespace expo::linking::harmony {

class ExpoLinkingFactory final : public rnoh::TurboModuleFactoryDelegate {
 public:
  SharedTurboModule createTurboModule(Context context, const std::string& name) const override {
    if (name != "ExpoLinking") return nullptr;
    return std::make_shared<ExpoLinkingTurboModule>(std::move(context), name);
  }
};

class ExpoLinkingPackage final : public rnoh::Package {
 public:
  using Package::Package;
  std::unique_ptr<rnoh::TurboModuleFactoryDelegate> createTurboModuleFactoryDelegate() override {
    return std::make_unique<ExpoLinkingFactory>();
  }
};

} // namespace expo::linking::harmony
