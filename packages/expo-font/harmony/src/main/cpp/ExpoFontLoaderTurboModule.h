#pragma once
#include "RNOH/ArkTSTurboModule.h"
namespace expo::font::harmony {
class ExpoFontLoaderTurboModule final : public rnoh::ArkTSTurboModule {
 public:
  ExpoFontLoaderTurboModule(Context context, const std::string& name);
};
} // namespace expo::font::harmony
