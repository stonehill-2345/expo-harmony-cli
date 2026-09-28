#pragma once

#include "RNOH/ArkTSTurboModule.h"
#include "RNOH/Package.h"

namespace lane_b::constants_oracle {

class LaneBConstantsOracle final : public rnoh::ArkTSTurboModule {
 public:
  LaneBConstantsOracle(Context context, const std::string& name)
      : ArkTSTurboModule(std::move(context), name) {
    methodMap_ = {ARK_METHOD_METADATA(getSnapshot, 0)};
  }
};

class Factory final : public rnoh::TurboModuleFactoryDelegate {
 public:
  SharedTurboModule createTurboModule(Context context, const std::string& name) const override {
    if (name != "LaneBConstantsOracle") return nullptr;
    return std::make_shared<LaneBConstantsOracle>(std::move(context), name);
  }
};

class LaneBConstantsOraclePackage final : public rnoh::Package {
 public:
  using Package::Package;
  std::unique_ptr<rnoh::TurboModuleFactoryDelegate> createTurboModuleFactoryDelegate() override {
    return std::make_unique<Factory>();
  }
};

} // namespace lane_b::constants_oracle
