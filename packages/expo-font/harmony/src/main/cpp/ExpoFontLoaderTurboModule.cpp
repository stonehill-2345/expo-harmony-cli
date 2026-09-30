#include "ExpoFontLoaderTurboModule.h"
namespace expo::font::harmony {
ExpoFontLoaderTurboModule::ExpoFontLoaderTurboModule(Context context, const std::string& name)
    : ArkTSTurboModule(std::move(context), name) {
  methodMap_ = {
      ARK_METHOD_METADATA(getLoadedFonts, 0),
      ARK_ASYNC_METHOD_METADATA(loadAsync, 2),
  };
}
} // namespace expo::font::harmony
