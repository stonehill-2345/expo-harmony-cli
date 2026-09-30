#include "RNOH/PackageProvider.h"
#include "ExpoModulesCorePackage.h"
#include "ExpoCoreTestPackage.h"
#include "ExpoCoreTestView.h"
#include "ExpoCoreInteropProbePackage.h"
#include "ExponentConstantsPackage.h"
#include "ExpoAssetPackage.h"
#include "ExpoSystemUIPackage.h"
#include "LaneBConstantsOraclePackage.h"
#include "LaneBAssetOraclePackage.h"
using namespace rnoh;
std::vector<std::shared_ptr<Package>> PackageProvider::getPackages(Package::Context ctx) {
  return {std::make_shared<expo::harmony::ExpoModulesCorePackage>(ctx,
      std::vector<expo::harmony::ModuleDefinition>{expo::harmony::testing::createExpoCoreTestModule()}),
      std::make_shared<expo::harmony::testing::ExpoCoreTestViewPackage>(ctx),
      std::make_shared<expo::harmony::testing::ExpoCoreInteropProbePackage>(ctx),
      std::make_shared<expo::constants::harmony::ExponentConstantsPackage>(ctx),
      std::make_shared<expo::asset::harmony::ExpoAssetPackage>(ctx),
      std::make_shared<expo::systemui::harmony::ExpoSystemUIPackage>(ctx),
      std::make_shared<lane_b::constants_oracle::LaneBConstantsOraclePackage>(ctx),
      std::make_shared<lane_b::asset_oracle::LaneBAssetOraclePackage>(ctx)};
}
