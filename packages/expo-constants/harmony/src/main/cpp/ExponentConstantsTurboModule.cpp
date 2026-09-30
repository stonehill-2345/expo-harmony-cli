#include "ExponentConstantsTurboModule.h"

namespace expo::constants::harmony {

ExponentConstantsTurboModule::ExponentConstantsTurboModule(
    rnoh::ArkTSTurboModule::Context context, const std::string& name)
    : ArkTSTurboModule(std::move(context), name) {
  methodMap_ = {
      ARK_METHOD_METADATA(getConstants, 0),
      ARK_ASYNC_METHOD_METADATA(getWebViewUserAgentAsync, 0),
  };
}

} // namespace expo::constants::harmony
