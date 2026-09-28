#include "ExpoSystemUITurboModule.h"

namespace expo::systemui::harmony {

ExpoSystemUITurboModule::ExpoSystemUITurboModule(Context context, const std::string& name)
    : ArkTSTurboModule(std::move(context), name) {
  methodMap_ = {
      ARK_ASYNC_METHOD_METADATA(setBackgroundColorAsync, 1),
      ARK_ASYNC_METHOD_METADATA(getBackgroundColorAsync, 0),
  };
}

} // namespace expo::systemui::harmony
