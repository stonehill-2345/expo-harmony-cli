#include "ExpoLinkingTurboModule.h"

namespace expo::linking::harmony {

ExpoLinkingTurboModule::ExpoLinkingTurboModule(Context context, const std::string& name)
    : ArkTSTurboModule(context, name),
      rnoh::ArkTSMessageHub::Observer(context.arkTSMessageHub),
      urlEmitter_(std::make_shared<facebook::react::AsyncEventEmitter<folly::dynamic>>()) {
  methodMap_ = {ARK_METHOD_METADATA(getLinkingURL, 0)};
  eventEmitterMap_["onURLReceived"] = urlEmitter_;
}

void ExpoLinkingTurboModule::onMessageReceived(const rnoh::ArkTSMessage& message) {
  if (message.name != "ExpoLinking:onURLReceived") return;
  const auto& url = message.payload["url"];
  if (!url.isString() || url.getString().empty()) return;
  urlEmitter_->emit([value = url.getString()](facebook::jsi::Runtime& runtime) {
    facebook::jsi::Object event(runtime);
    event.setProperty(runtime, "url", facebook::jsi::String::createFromUtf8(runtime, value));
    return facebook::jsi::Value(std::move(event));
  });
}

} // namespace expo::linking::harmony
