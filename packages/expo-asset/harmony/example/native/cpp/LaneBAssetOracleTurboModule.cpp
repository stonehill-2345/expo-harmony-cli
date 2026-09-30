#include "LaneBAssetOracleTurboModule.h"

namespace lane_b::asset_oracle {

LaneBAssetOracleTurboModule::LaneBAssetOracleTurboModule(
    rnoh::ArkTSTurboModule::Context context, const std::string& name)
    : ArkTSTurboModule(std::move(context), name) {
  methodMap_ = {
      ARK_METHOD_METADATA(readText, 1),
      ARK_METHOD_METADATA(overwriteText, 2),
      ARK_METHOD_METADATA(listCache, 0),
      ARK_METHOD_METADATA(hasReloadMarker, 0),
      ARK_METHOD_METADATA(markReload, 0),
  };
}

} // namespace lane_b::asset_oracle
