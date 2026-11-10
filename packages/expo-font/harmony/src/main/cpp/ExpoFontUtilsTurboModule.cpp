#include "ExpoFontUtilsTurboModule.h"
namespace expo::font::harmony {
ExpoFontUtilsTurboModule::ExpoFontUtilsTurboModule(Context context, const std::string& name)
    : ArkTSTurboModule(std::move(context), name) {
  methodMap_ = {ARK_ASYNC_METHOD_METADATA(renderToImageAsync, 2)};
}
} // namespace expo::font::harmony
