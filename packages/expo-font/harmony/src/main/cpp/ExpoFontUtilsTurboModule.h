#pragma once
#include "RNOH/ArkTSTurboModule.h"
namespace expo::font::harmony {
class ExpoFontUtilsTurboModule final : public rnoh::ArkTSTurboModule {
 public:
  ExpoFontUtilsTurboModule(Context context, const std::string& name);
};
} // namespace expo::font::harmony
