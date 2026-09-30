#pragma once

#include "RNOH/Package.h"
#include "ExpoModulesCoreRuntime.h"
#include <ReactCommon/CallInvoker.h>

namespace expo::harmony {

struct ModuleContext {
  std::shared_ptr<facebook::react::CallInvoker> jsInvoker;
  rnoh::RNInstance::SafeWeak instance;
  rnoh::TaskExecutor::Shared taskExecutor;
};

struct ModuleDefinition {
  std::string name;
  std::function<void(jsi::Runtime&, jsi::Object&,
                     const ModuleContext&)> initialize;
};

// The native modules provider supplies definitions; autolinking can generate
// this list without putting any module initialization into the JS application.
class ExpoModulesCorePackage final : public rnoh::Package {
public:
  explicit ExpoModulesCorePackage(rnoh::Package::Context context,
                                  std::vector<ModuleDefinition> modules = {});

  std::unique_ptr<rnoh::TurboModuleFactoryDelegate> createTurboModuleFactoryDelegate() override;
  rnoh::GlobalJSIBinders createGlobalJSIBinders(
      const rnoh::GlobalJSIBinder::Context& context) override;

private:
  std::vector<ModuleDefinition> modules_;
};

} // namespace expo::harmony
