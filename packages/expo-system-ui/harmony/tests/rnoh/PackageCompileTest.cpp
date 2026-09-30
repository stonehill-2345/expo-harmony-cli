#include <memory>

#include "ExpoSystemUIPackage.h"

int main() {
  rnoh::Package::Context context{};
  auto package = std::make_shared<expo::systemui::harmony::ExpoSystemUIPackage>(context);
  auto factory = package->createTurboModuleFactoryDelegate();
  return factory == nullptr;
}
