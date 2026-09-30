#include "ExpoCoreInteropProbePackage.h"
#include "RNOH/ArkTSTurboModule.h"

namespace expo::harmony::testing {
namespace {
class InteropProbe final : public rnoh::ArkTSTurboModule {
public:
  InteropProbe(Context context, const std::string& name) : ArkTSTurboModule(context, name) {
    methodMap_ = {
      ARK_METHOD_METADATA(getConstants, 0),
      ARK_METHOD_METADATA(getDirectoryOracle, 0),
      ARK_METHOD_METADATA(checkCoreContextInvalidation, 0),
      ARK_ASYNC_METHOD_METADATA(failFromDestroyedCoreAsync, 0),
      ARK_METHOD_METADATA(roundTripFile, 2),
      ARK_METHOD_METADATA(echoNullable, 1),
      ARK_ASYNC_METHOD_METADATA(addAsync, 2),
      ARK_ASYNC_METHOD_METADATA(failAsync, 0),
      ARK_ASYNC_METHOD_METADATA(failStringAsync, 0),
      ARK_ASYNC_METHOD_METADATA(failUncodedAsync, 0),
      ARK_ASYNC_METHOD_METADATA(failLaterAsync, 1),
    };
  }
};

class InteropProbeFactory final : public rnoh::TurboModuleFactoryDelegate {
public:
  SharedTurboModule createTurboModule(Context context, const std::string& name) const override {
    if (name == "ExpoCoreInteropProbe") return std::make_shared<InteropProbe>(context, name);
    return nullptr;
  }
};
} // namespace

std::unique_ptr<rnoh::TurboModuleFactoryDelegate>
ExpoCoreInteropProbePackage::createTurboModuleFactoryDelegate() {
  return std::make_unique<InteropProbeFactory>();
}
} // namespace expo::harmony::testing
