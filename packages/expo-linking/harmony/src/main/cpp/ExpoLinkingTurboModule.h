#pragma once

#include "RNOH/ArkTSTurboModule.h"

namespace expo::linking::harmony {

class ExpoLinkingTurboModule final : public rnoh::ArkTSTurboModule,
                                    public rnoh::ArkTSMessageHub::Observer {
 public:
  ExpoLinkingTurboModule(Context context, const std::string& name);
  void onMessageReceived(const rnoh::ArkTSMessage& message) override;

 private:
  std::shared_ptr<facebook::react::AsyncEventEmitter<folly::dynamic>> urlEmitter_;
};

} // namespace expo::linking::harmony
