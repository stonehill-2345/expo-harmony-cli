#pragma once

#include "RNOH/ArkTSTurboModule.h"

namespace expo::asset::harmony {

class ExpoAssetTurboModule final : public rnoh::ArkTSTurboModule {
 public:
  ExpoAssetTurboModule(rnoh::ArkTSTurboModule::Context context,
                       const std::string& name);
};

} // namespace expo::asset::harmony
