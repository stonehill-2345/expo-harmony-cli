#include <memory>
#include <vector>
#include "ExpoFontLoaderPackage.h"
int main() {
  rnoh::Package::Context context{};
  auto package = std::make_shared<expo::font::harmony::ExpoFontLoaderPackage>(context);
  auto factory = package->createTurboModuleFactoryDelegate();
  return factory == nullptr;
}
