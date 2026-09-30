#pragma once

#include "RNOH/ArkTSTurboModule.h"

namespace expo::systemui::harmony {

class ExpoSystemUITurboModule final : public rnoh::ArkTSTurboModule {
 public:
  ExpoSystemUITurboModule(Context context, const std::string& name);
};

} // namespace expo::systemui::harmony
