#pragma once
#include "RNOH/Package.h"

namespace expo::image::harmony {
class ExpoImagePackage final : public rnoh::Package {
public:
  using Package::Package;
  std::vector<facebook::react::ComponentDescriptorProvider> createComponentDescriptorProviders() override;
  rnoh::ComponentInstance::Shared createComponentInstance(const rnoh::ComponentInstance::Context& context) override;
  rnoh::ComponentJSIBinderByString createComponentJSIBinderByName() override;
  std::unique_ptr<rnoh::TurboModuleFactoryDelegate> createTurboModuleFactoryDelegate() override;
  rnoh::GlobalJSIBinders createGlobalJSIBinders(const rnoh::GlobalJSIBinder::Context& context) override;
};
}
