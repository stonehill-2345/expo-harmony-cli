#pragma once
#include "AuthorFixtureView.h"
#include "AuthorFixtureModule.h"
#include "RNOH/ArkTSTurboModule.h"
#include "RNOH/TurboModuleProvider.h"

namespace expo::harmony::m3 {
class ReloadMarker final : public rnoh::ArkTSTurboModule {
public:
  explicit ReloadMarker(Context context) : ArkTSTurboModule(context, "M3ReloadMarker") {
    methodMap_ = {ARK_METHOD_METADATA(consumePending, 0), ARK_METHOD_METADATA(setPending, 0)};
  }
};
class AuthorFixtureModule final : public rnoh::ArkTSTurboModule {
public:
  explicit AuthorFixtureModule(Context context)
      : ArkTSTurboModule(context, "ExpoM3AuthorFixture"),
        moduleContext_{context.jsInvoker, context.safeInstance, context.taskExecutor} {
    methodMap_["installModule"] = {0, [](jsi::Runtime& runtime,
        facebook::react::TurboModule& module, const jsi::Value*, size_t) {
      static_cast<AuthorFixtureModule&>(module).bind(runtime);
      return jsi::Value::undefined();
    }};
  }
  void bind(jsi::Runtime& runtime) {
    install(runtime);
    const auto definition = createExpoM3AuthorFixtureModule();
    auto registry = runtime.global().getPropertyAsObject(runtime, "expo").getPropertyAsObject(runtime, "modules");
    if (registry.hasProperty(runtime, definition.name.c_str())) return;
    registerModule(runtime, definition.name, [&](auto& rt, auto& module) {
      definition.initialize(rt, module, moduleContext_);
    });
  }
private:
  ModuleContext moduleContext_;
};
class AuthorFixtureFactory final : public rnoh::TurboModuleFactoryDelegate {
public:
  SharedTurboModule createTurboModule(Context context, const std::string& name) const override {
    if (name == "ExpoM3AuthorFixture") return std::make_shared<AuthorFixtureModule>(context);
    if (name == "M3ReloadMarker") return std::make_shared<ReloadMarker>(context);
    return nullptr;
  }
};
class AuthorFixtureBinder final : public rnoh::GlobalJSIBinder {
public:
  using GlobalJSIBinder::GlobalJSIBinder;
  void createBindings(jsi::Runtime& runtime, std::shared_ptr<rnoh::TurboModuleProvider> provider) override {
    auto module = std::dynamic_pointer_cast<AuthorFixtureModule>(provider->getTurboModule("ExpoM3AuthorFixture"));
    if (!module) throw jsi::JSError(runtime, "Author fixture native factory missing");
    module->bind(runtime);
  }
};
class AuthorFixturePackage final : public AuthorFixtureViewPackage {
public:
  using AuthorFixtureViewPackage::AuthorFixtureViewPackage;
  std::unique_ptr<rnoh::TurboModuleFactoryDelegate> createTurboModuleFactoryDelegate() override {
    return std::make_unique<AuthorFixtureFactory>();
  }
  rnoh::GlobalJSIBinders createGlobalJSIBinders(const rnoh::GlobalJSIBinder::Context& context) override {
    return {std::make_shared<AuthorFixtureBinder>(context)};
  }
};
}
