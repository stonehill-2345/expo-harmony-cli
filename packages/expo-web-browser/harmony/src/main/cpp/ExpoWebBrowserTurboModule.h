#pragma once

#include "RNOH/ArkTSTurboModule.h"

namespace expo::webbrowser::harmony {

class ExpoWebBrowserTurboModule final : public rnoh::ArkTSTurboModule {
 public:
  ExpoWebBrowserTurboModule(Context context, const std::string& name);
};

} // namespace expo::webbrowser::harmony
