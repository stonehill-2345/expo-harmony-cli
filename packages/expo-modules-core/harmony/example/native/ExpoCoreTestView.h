#pragma once
#include "RNOH/Package.h"

namespace expo::harmony::testing {
std::string readExpoCoreTestView(const rnoh::ComponentInstance::Shared& view);

class ExpoCoreTestViewPackage final : public rnoh::Package {
public:
  using Package::Package;
  std::vector<facebook::react::ComponentDescriptorProvider> createComponentDescriptorProviders() override;
  rnoh::ComponentInstance::Shared createComponentInstance(const rnoh::ComponentInstance::Context& context) override;
  rnoh::ComponentJSIBinderByString createComponentJSIBinderByName() override;
};
}
