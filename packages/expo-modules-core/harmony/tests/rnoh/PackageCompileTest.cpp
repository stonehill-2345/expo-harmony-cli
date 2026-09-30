#include "ExpoModulesCorePackage.h"
#include "RNOH/Package.h"

#include <type_traits>

static_assert(std::is_base_of_v<rnoh::Package, expo::harmony::ExpoModulesCorePackage>);

// Compile the same call that a native PackageProvider makes. This verifies the
// actual RNOH 0.82.30 interface, not a locally invented mock Package.
std::shared_ptr<rnoh::Package> createExpoCorePackage(rnoh::Package::Context context) {
  return std::make_shared<expo::harmony::ExpoModulesCorePackage>(context);
}
