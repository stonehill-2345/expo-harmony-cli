/**
 * Empty fallback for projects without generated Harmony codegen artifacts.
 * It can be overwritten by react-native codegen-harmony.
 */

#pragma once

#include "RNOH/Package.h"

namespace rnoh {

class RNOHGeneratedPackage : public Package {
 public:
  RNOHGeneratedPackage(Package::Context ctx) : Package(ctx) {}
};

} // namespace rnoh
