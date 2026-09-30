#pragma once

#include "LaneBAssetOracleTurboModule.h"
#include "RNOH/Package.h"

namespace lane_b::asset_oracle {

class LaneBAssetOracleFactory final : public rnoh::TurboModuleFactoryDelegate {
 public:
  SharedTurboModule createTurboModule(Context context,
                                      const std::string& name) const override {
    if (name != "LaneBAssetOracle") {
      return nullptr;
    }
    return std::make_shared<LaneBAssetOracleTurboModule>(std::move(context), name);
  }
};

class LaneBAssetOraclePackage final : public rnoh::Package {
 public:
  using Package::Package;

  std::unique_ptr<rnoh::TurboModuleFactoryDelegate>
  createTurboModuleFactoryDelegate() override {
    return std::make_unique<LaneBAssetOracleFactory>();
  }
};

} // namespace lane_b::asset_oracle
