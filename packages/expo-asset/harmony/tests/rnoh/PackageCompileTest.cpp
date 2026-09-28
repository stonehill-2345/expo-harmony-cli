#include "ExpoAssetPackage.h"

#include <type_traits>

using expo::asset::harmony::ExpoAssetPackage;

static_assert(std::is_base_of_v<rnoh::Package, ExpoAssetPackage>);

std::shared_ptr<rnoh::Package> createExpoAssetPackage(
    rnoh::Package::Context context) {
  return std::make_shared<ExpoAssetPackage>(std::move(context));
}
