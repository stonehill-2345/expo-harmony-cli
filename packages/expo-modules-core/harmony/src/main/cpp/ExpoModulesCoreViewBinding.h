#pragma once
#include "ExpoModulesCorePackage.h"
#include <atomic>

namespace expo::harmony {

// A JS wrapper owns this token, not the native view. Resolve only on MAIN.
// Capture Weak in queued work so neither the wrapper nor native view is kept alive.
struct NativeViewBinding final {
  using Weak = std::weak_ptr<NativeViewBinding>;
  std::atomic<bool> active{true};
  facebook::react::Tag tag;
  rnoh::RNInstance::SafeWeak instance;
  rnoh::ComponentInstance::Weak view;
  bool resolved = false; // MAIN only; never rebind after the first real resolution.
};

void mountNativeView(jsi::Runtime& runtime, const jsi::Value& receiver, const ModuleContext& context);
void unmountNativeView(jsi::Runtime& runtime, const jsi::Value& receiver);
NativeViewBinding::Weak getNativeViewBinding(jsi::Runtime& runtime, const jsi::Value& receiver);
// Throws NativeAsyncError(ERR_VIEW_UNMOUNTED), never returns a replacement tag's view.
rnoh::ComponentInstance::Shared resolveNativeView(const NativeViewBinding::Weak& binding);

} // namespace expo::harmony
