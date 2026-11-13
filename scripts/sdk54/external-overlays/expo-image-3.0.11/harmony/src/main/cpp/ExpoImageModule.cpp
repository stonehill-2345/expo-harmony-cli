#include "ExpoImagePackage.h"
#include "ExpoImageProps.h"
#include "ExpoModulesCorePackage.h"
#include "ExpoModulesCoreViewBinding.h"
#include "RNOH/ArkTSTurboModule.h"
#include "RNOH/TurboModuleProvider.h"

namespace expo::image::harmony {
namespace jsi = facebook::jsi;
using namespace expo::harmony;
namespace {
void initialize(jsi::Runtime& rt, jsi::Object& module, const ModuleContext& context) {
  registerViewConfig(rt, "ExpoImage", "", {
    std::vector<std::string>(props.begin(), props.end()), std::vector<std::string>(events.begin(), events.end())});
  jsi::Object prototype(rt), prototypes(rt);
  prototype.setProperty(rt, "__expoMountView", jsi::Function::createFromHostFunction(rt,
    jsi::PropNameID::forAscii(rt, "__expoMountView"), 0,
    [context](jsi::Runtime& rt, const jsi::Value& self, const jsi::Value*, size_t) {
      mountNativeView(rt, self, context);return jsi::Value::undefined();
    }));
  prototype.setProperty(rt, "__expoUnmountView", jsi::Function::createFromHostFunction(rt,
    jsi::PropNameID::forAscii(rt, "__expoUnmountView"), 0,
    [](jsi::Runtime& rt, const jsi::Value& self, const jsi::Value*, size_t) {
      unmountNativeView(rt, self);return jsi::Value::undefined();
    }));
  for (const auto* name : {"startAnimating", "stopAnimating", "lockResourceAsync", "unlockResourceAsync", "reloadAsync"}) {
    prototype.setProperty(rt, name, jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, name), 0,
      [context, command = std::string(name)](jsi::Runtime& rt, const jsi::Value& self, const jsi::Value*, size_t) {
        const auto binding = getNativeViewBinding(rt, self);
        auto task = startAsync(rt, context.jsInvoker, [context, binding, command](CancellationSignal cancelled) -> AsyncResult {
          if (command != "reloadAsync") throw NativeAsyncError("ERR_IMAGE_UNSUPPORTED", command + " is not implemented on Harmony");
          std::exception_ptr failure;
          context.taskExecutor->runSyncTask(rnoh::TaskThread::MAIN, [&] {
            try {
              if (cancelled->load()) return;
              resolveNativeView(binding)->handleCommand(command, folly::dynamic::array());
            } catch (...) { failure = std::current_exception(); }
          });
          if (failure) std::rethrow_exception(failure);
          return [](jsi::Runtime&) { return jsi::Value::undefined(); };
        });
        return jsi::Value(std::move(task.promise));
      }));
  }
  prototypes.setProperty(rt, "ExpoImage", prototype);module.setProperty(rt, "ViewPrototypes", prototypes);
  for (const auto* name : {"prefetch", "clearMemoryCache", "clearDiskCache", "getCachePathAsync", "generateBlurhashAsync", "generateThumbhashAsync", "loadAsync"}) {
    module.setProperty(rt, name, jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, name), 0,
      [invoker = context.jsInvoker, method = std::string(name)](jsi::Runtime& rt, const jsi::Value&, const jsi::Value*, size_t) {
        auto task = startAsync(rt, invoker, [method](CancellationSignal) -> AsyncResult {
          throw NativeAsyncError("ERR_IMAGE_UNSUPPORTED", method + " is not implemented on Harmony");
        });
        return jsi::Value(std::move(task.promise));
      }));
  }
  module.setProperty(rt, "Image", jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, "Image"), 0,
    [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value*, size_t) -> jsi::Value {
      throw jsi::JSError(rt, "ERR_IMAGE_UNSUPPORTED: ImageRef is not implemented on Harmony");
    }));
}
class ImageModule final : public rnoh::ArkTSTurboModule {
public:
  explicit ImageModule(Context context) : ArkTSTurboModule(context, "ExpoImage"),
      context_{context.jsInvoker, context.safeInstance, context.taskExecutor} {
    methodMap_["installModule"] = {0, [](jsi::Runtime& rt, facebook::react::TurboModule& module, const jsi::Value*, size_t) {
      static_cast<ImageModule&>(module).bind(rt);return jsi::Value::undefined();
    }};
  }
  void bind(jsi::Runtime& rt) {
    install(rt);
    auto modules = rt.global().getPropertyAsObject(rt, "expo").getPropertyAsObject(rt, "modules");
    if (modules.hasProperty(rt, "ExpoImage")) return;
    registerModule(rt, "ExpoImage", [&](auto& runtime, auto& module) { initialize(runtime, module, context_); });
  }
private:
  ModuleContext context_;
};
class ImageFactory final : public rnoh::TurboModuleFactoryDelegate {
public:
  SharedTurboModule createTurboModule(Context context, const std::string& name) const override {
    return name == "ExpoImage" ? std::make_shared<ImageModule>(context) : nullptr;
  }
};
class ImageGlobalBinder final : public rnoh::GlobalJSIBinder {
public:
  using GlobalJSIBinder::GlobalJSIBinder;
  void createBindings(jsi::Runtime& rt, std::shared_ptr<rnoh::TurboModuleProvider> provider) override {
    auto module = std::dynamic_pointer_cast<ImageModule>(provider->getTurboModule("ExpoImage"));
    if (!module) throw jsi::JSError(rt, "ExpoImage native factory missing");
    module->bind(rt);
  }
};
}
std::unique_ptr<rnoh::TurboModuleFactoryDelegate> ExpoImagePackage::createTurboModuleFactoryDelegate() {
  return std::make_unique<ImageFactory>();
}
rnoh::GlobalJSIBinders ExpoImagePackage::createGlobalJSIBinders(const rnoh::GlobalJSIBinder::Context& context) {
  return {std::make_shared<ImageGlobalBinder>(context)};
}
}
