#include "RNOH/PackageProvider.h"
#include "ExpoModulesCorePackage.h"
#include "ExpoCoreTestPackage.h"
#include "ExpoCoreTestView.h"
#include "ExpoCoreInteropProbePackage.h"
using namespace rnoh;
std::vector<std::shared_ptr<Package>> PackageProvider::getPackages(Package::Context ctx) {
  return {std::make_shared<expo::harmony::ExpoModulesCorePackage>(ctx,
      std::vector<expo::harmony::ModuleDefinition>{expo::harmony::testing::createExpoCoreTestModule()}),
      std::make_shared<expo::harmony::testing::ExpoCoreTestViewPackage>(ctx),
      std::make_shared<expo::harmony::testing::ExpoCoreInteropProbePackage>(ctx)};
}
