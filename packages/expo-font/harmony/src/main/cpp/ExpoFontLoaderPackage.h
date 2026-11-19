#pragma once
#include "ExpoFontLoaderTurboModule.h"
#include "ExpoFontUtilsTurboModule.h"
#include "RNOH/Package.h"
namespace expo::font::harmony {
class ExpoFontLoaderFactory final : public rnoh::TurboModuleFactoryDelegate {
 public:
  SharedTurboModule createTurboModule(Context context, const std::string& name) const override {
    if (name == "ExpoFontUtils") return std::make_shared<ExpoFontUtilsTurboModule>(std::move(context), name);
    if (name != "ExpoFontLoader") return nullptr;
    return std::make_shared<ExpoFontLoaderTurboModule>(std::move(context), name);
  }
};
class ExpoFontLoaderPackage final : public rnoh::Package {
 public:
  using Package::Package;
  std::unique_ptr<rnoh::TurboModuleFactoryDelegate> createTurboModuleFactoryDelegate() override {
    return std::make_unique<ExpoFontLoaderFactory>();
  }
};
} // namespace expo::font::harmony
