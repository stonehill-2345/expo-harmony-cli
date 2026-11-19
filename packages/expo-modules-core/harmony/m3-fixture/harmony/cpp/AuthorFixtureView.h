#pragma once
#include "RNOH/Package.h"

namespace expo::harmony::m3 {
std::string readAuthorFixtureView(const rnoh::ComponentInstance::Shared& view);

class AuthorFixtureViewPackage : public rnoh::Package {
public:
  using Package::Package;
  std::vector<facebook::react::ComponentDescriptorProvider> createComponentDescriptorProviders() override;
  rnoh::ComponentInstance::Shared createComponentInstance(const rnoh::ComponentInstance::Context& context) override;
  rnoh::ComponentJSIBinderByString createComponentJSIBinderByName() override;
};
}
