#include <memory>

#include "ExpoSplashScreenPackage.h"

int main() {
  rnoh::Package::Context context{};
  auto package = std::make_shared<expo::splashscreen::harmony::ExpoSplashScreenPackage>(context);
  auto factory = package->createTurboModuleFactoryDelegate();
  return factory == nullptr;
}
