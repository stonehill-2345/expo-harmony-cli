#pragma once

#include "RNOH/ArkTSTurboModule.h"

namespace expo::constants::harmony {

class ExponentConstantsTurboModule final : public rnoh::ArkTSTurboModule {
 public:
  ExponentConstantsTurboModule(rnoh::ArkTSTurboModule::Context context,
                               const std::string& name);
};

} // namespace expo::constants::harmony
