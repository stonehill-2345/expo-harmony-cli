#pragma once

#include "ExpoAssetTurboModule.h"
#include "RNOH/Package.h"

namespace expo::asset::harmony {

class ExpoAssetFactory final : public rnoh::TurboModuleFactoryDelegate {
 public:
  SharedTurboModule createTurboModule(Context context,
                                      const std::string& name) const override {
    if (name != "ExpoAsset") {
      return nullptr;
    }
    return std::make_shared<ExpoAssetTurboModule>(std::move(context), name);
  }
};

class ExpoAssetPackage final : public rnoh::Package {
 public:
  using Package::Package;

  std::unique_ptr<rnoh::TurboModuleFactoryDelegate>
  createTurboModuleFactoryDelegate() override {
    return std::make_unique<ExpoAssetFactory>();
  }
};

} // namespace expo::asset::harmony
