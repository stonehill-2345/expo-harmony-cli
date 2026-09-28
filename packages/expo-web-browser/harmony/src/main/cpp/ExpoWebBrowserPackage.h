#pragma once

#include "ExpoWebBrowserTurboModule.h"
#include "RNOH/Package.h"

namespace expo::webbrowser::harmony {

class ExpoWebBrowserFactory final : public rnoh::TurboModuleFactoryDelegate {
 public:
  SharedTurboModule createTurboModule(Context context, const std::string& name) const override {
    if (name != "ExpoWebBrowser") return nullptr;
    return std::make_shared<ExpoWebBrowserTurboModule>(std::move(context), name);
  }
};

class ExpoWebBrowserPackage final : public rnoh::Package {
 public:
  using Package::Package;
  std::unique_ptr<rnoh::TurboModuleFactoryDelegate> createTurboModuleFactoryDelegate() override {
    return std::make_unique<ExpoWebBrowserFactory>();
  }
};

} // namespace expo::webbrowser::harmony
