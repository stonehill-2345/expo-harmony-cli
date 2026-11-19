#pragma once
#include "RNOH/ArkTSTurboModule.h"
#include "RNOH/Package.h"
namespace expo::splashscreen::testing {
class SplashOracle final : public rnoh::ArkTSTurboModule {
 public:
  SplashOracle(Context ctx, const std::string& name) : ArkTSTurboModule(std::move(ctx), name) {
    methodMap_ = {ARK_METHOD_METADATA(getSnapshot, 0)};
  }
};
class Factory final : public rnoh::TurboModuleFactoryDelegate {
 public:
  SharedTurboModule createTurboModule(Context ctx, const std::string& name) const override {
    if (name != "SplashOracle") return nullptr;
    return std::make_shared<SplashOracle>(std::move(ctx), name);
  }
};
class SplashOraclePackage final : public rnoh::Package {
 public:
  using Package::Package;
  std::unique_ptr<rnoh::TurboModuleFactoryDelegate> createTurboModuleFactoryDelegate() override { return std::make_unique<Factory>(); }
};
}
