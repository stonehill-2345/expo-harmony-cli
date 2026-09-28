#include "ExpoAssetTurboModule.h"

namespace expo::asset::harmony {

ExpoAssetTurboModule::ExpoAssetTurboModule(
    rnoh::ArkTSTurboModule::Context context, const std::string& name)
    : ArkTSTurboModule(std::move(context), name) {
  methodMap_ = {
      ARK_ASYNC_METHOD_METADATA(downloadAsync, 3),
  };
}

} // namespace expo::asset::harmony
