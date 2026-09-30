#include "ExponentConstantsPackage.h"
#include "../../example/native/cpp/LaneBConstantsOraclePackage.h"

#include <type_traits>

using expo::constants::harmony::ExponentConstantsPackage;

static_assert(std::is_base_of_v<rnoh::Package, ExponentConstantsPackage>);

std::shared_ptr<rnoh::Package> createExponentConstantsPackage(
    rnoh::Package::Context context) {
  return std::make_shared<ExponentConstantsPackage>(std::move(context));
}

std::shared_ptr<rnoh::Package> createConstantsOraclePackage(rnoh::Package::Context context) {
  return std::make_shared<lane_b::constants_oracle::LaneBConstantsOraclePackage>(std::move(context));
}
