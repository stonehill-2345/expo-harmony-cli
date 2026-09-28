#pragma once
#include "RNOH/ArkTSTurboModule.h"
#include "RNOH/Package.h"
namespace expo::statusbar::testing {
class StatusBarOracleTurboModule final : public rnoh::ArkTSTurboModule {
 public:
  StatusBarOracleTurboModule(Context context, const std::string& name)
      : ArkTSTurboModule(std::move(context), name) { methodMap_ = {ARK_METHOD_METADATA(getSnapshot, 0)}; }
};
class Factory final : public rnoh::TurboModuleFactoryDelegate {
 public:
  SharedTurboModule createTurboModule(Context context, const std::string& name) const override {
    if (name != "StatusBarOracle") return nullptr;
    return std::make_shared<StatusBarOracleTurboModule>(std::move(context), name);
  }
};
class StatusBarOraclePackage final : public rnoh::Package {
 public:
  using Package::Package;
  std::unique_ptr<rnoh::TurboModuleFactoryDelegate> createTurboModuleFactoryDelegate() override { return std::make_unique<Factory>(); }
};
} // namespace expo::statusbar::testing
