#include "AuthorFixturePackage.h"
#include <type_traits>

static_assert(std::is_base_of_v<rnoh::Package, expo::harmony::m3::AuthorFixturePackage>);

std::shared_ptr<rnoh::Package> createAuthorFixturePackage(const rnoh::Package::Context& context) {
  return std::make_shared<expo::harmony::m3::AuthorFixturePackage>(context);
}
