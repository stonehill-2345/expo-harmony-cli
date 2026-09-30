#pragma once

#include "RNOH/ArkTSTurboModule.h"

namespace lane_b::asset_oracle {

class LaneBAssetOracleTurboModule final : public rnoh::ArkTSTurboModule {
 public:
  LaneBAssetOracleTurboModule(rnoh::ArkTSTurboModule::Context context,
                              const std::string& name);
};

} // namespace lane_b::asset_oracle
