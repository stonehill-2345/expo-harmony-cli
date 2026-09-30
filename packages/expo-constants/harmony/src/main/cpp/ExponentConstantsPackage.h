#pragma once

#include "ExponentConstantsTurboModule.h"
#include "RNOH/Package.h"

namespace expo::constants::harmony {

class ExponentConstantsFactory final : public rnoh::TurboModuleFactoryDelegate {
 public:
  SharedTurboModule createTurboModule(Context context,
                                      const std::string& name) const override {
    if (name != "ExponentConstants") {
      return nullptr;
    }
    return std::make_shared<ExponentConstantsTurboModule>(std::move(context), name);
  }
};

class ExponentConstantsPackage final : public rnoh::Package {
 public:
  using Package::Package;

  std::unique_ptr<rnoh::TurboModuleFactoryDelegate>
  createTurboModuleFactoryDelegate() override {
    return std::make_unique<ExponentConstantsFactory>();
  }
};

} // namespace expo::constants::harmony
