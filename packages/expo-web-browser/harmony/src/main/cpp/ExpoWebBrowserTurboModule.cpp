#include "ExpoWebBrowserTurboModule.h"

namespace expo::webbrowser::harmony {

ExpoWebBrowserTurboModule::ExpoWebBrowserTurboModule(Context context, const std::string& name)
    : ArkTSTurboModule(std::move(context), name) {
  methodMap_ = {
      ARK_ASYNC_METHOD_METADATA(openBrowserAsync, 2),
      ARK_ASYNC_METHOD_METADATA(dismissBrowser, 0),
      ARK_ASYNC_METHOD_METADATA(openAuthSessionAsync, 3),
      ARK_METHOD_METADATA(dismissAuthSession, 0),
  };
}

} // namespace expo::webbrowser::harmony
