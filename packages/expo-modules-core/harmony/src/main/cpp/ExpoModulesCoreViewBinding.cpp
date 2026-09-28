#include "ExpoModulesCoreViewBinding.h"
#include "RNOH/RNInstanceCAPI.h"

namespace expo::harmony {
namespace {
class ViewBindingOwner final : public jsi::NativeState {
public:
  explicit ViewBindingOwner(std::shared_ptr<NativeViewBinding> binding) : binding(std::move(binding)) {}
  ~ViewBindingOwner() override { binding->active.store(false); }
  const std::shared_ptr<NativeViewBinding> binding;
};
}

void mountNativeView(jsi::Runtime& runtime, const jsi::Value& receiver, const ModuleContext& context) {
  getRuntimeState(runtime);
  if (!receiver.isObject()) throw jsi::JSError(runtime, "Native view receiver is not an object");
  auto object = receiver.asObject(runtime);
  auto tag = object.getProperty(runtime, "nativeTag");
  if (!tag.isNumber()) throw jsi::JSError(runtime, "Native view is not mounted");
  if (object.hasNativeState<ViewBindingOwner>(runtime)) {
    object.getNativeState<ViewBindingOwner>(runtime)->binding->active.store(false);
  }
  auto binding = std::make_shared<NativeViewBinding>();
  binding->tag = static_cast<facebook::react::Tag>(tag.asNumber());
  binding->instance = context.instance;
  // React's mount callback can precede the Fabric UI mutation. Do not block JS
  // or require the UI registry to contain the view yet; bind once on first use.
  object.setNativeState(runtime, std::make_shared<ViewBindingOwner>(std::move(binding)));
}

void unmountNativeView(jsi::Runtime& runtime, const jsi::Value& receiver) {
  if (!receiver.isObject()) return;
  auto object = receiver.asObject(runtime);
  if (object.hasNativeState<ViewBindingOwner>(runtime)) {
    object.getNativeState<ViewBindingOwner>(runtime)->binding->active.store(false);
  }
}

NativeViewBinding::Weak getNativeViewBinding(jsi::Runtime& runtime, const jsi::Value& receiver) {
  getRuntimeState(runtime);
  if (!receiver.isObject()) throw jsi::JSError(runtime, "Native view receiver is not an object");
  auto object = receiver.asObject(runtime);
  if (!object.hasNativeState<ViewBindingOwner>(runtime)) throw jsi::JSError(runtime, "Native view has no mount binding");
  auto binding = object.getNativeState<ViewBindingOwner>(runtime)->binding;
  auto tag = object.getProperty(runtime, "nativeTag");
  if (!binding->active.load() || !tag.isNumber() || tag.asNumber() != binding->tag) {
    throw jsi::JSError(runtime, "Native view is not mounted");
  }
  return binding;
}

rnoh::ComponentInstance::Shared resolveNativeView(const NativeViewBinding::Weak& weak) {
  auto binding = weak.lock();
  if (binding && binding->active.load()) {
    auto owner = std::dynamic_pointer_cast<rnoh::RNInstanceCAPI>(binding->instance.lock());
    if (owner && !binding->resolved) {
      auto first = owner->findComponentInstanceByTag(binding->tag);
      if (first && !first->getParent().expired()) {
        binding->view = first;
        binding->resolved = true;
      }
    }
    auto view = binding->view.lock();
    if (owner && view && owner->findComponentInstanceByTag(binding->tag) == view && !view->getParent().expired()) {
      return view;
    }
  }
  throw NativeAsyncError("ERR_VIEW_UNMOUNTED", "Native view is not mounted");
}
} // namespace expo::harmony
