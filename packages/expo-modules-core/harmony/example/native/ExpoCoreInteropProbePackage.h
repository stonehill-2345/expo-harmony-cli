#pragma once
#include "RNOH/Package.h"

namespace expo::harmony::testing {
class ExpoCoreInteropProbePackage final : public rnoh::Package {
public:
  explicit ExpoCoreInteropProbePackage(Context context) : Package(context) {}
  std::unique_ptr<rnoh::TurboModuleFactoryDelegate> createTurboModuleFactoryDelegate() override;
};
} // namespace expo::harmony::testing
