#include "ExpoModulesCorePackage.h"
#include "RNOH/ArkTSTurboModule.h"
#include "ExpoModulesCoreVersion.h"
#include "RNOH/TurboModuleFactory.h"
#include "RNOH/TurboModuleProvider.h"

namespace expo::harmony {
namespace {

class ExpoModulesCoreTurboModule final : public rnoh::ArkTSTurboModule,
                                        public std::enable_shared_from_this<ExpoModulesCoreTurboModule> {
public:
  ExpoModulesCoreTurboModule(const rnoh::TurboModuleFactoryDelegate::Context& context, std::vector<ModuleDefinition> modules)
      : ArkTSTurboModule(context, "ExpoModulesCore"), modules_(std::move(modules)),
        context_{context.jsInvoker, context.safeInstance, context.taskExecutor} {
    methodMap_["installModules"] = {0, [](jsi::Runtime& runtime,
        facebook::react::TurboModule& module, const jsi::Value*, size_t) {
      static_cast<ExpoModulesCoreTurboModule&>(module).installModules(runtime);
      return jsi::Value::undefined();
    }};
  }

  void installModules(jsi::Runtime& runtime) {
    // Read actual platform state before publishing an initialized Core runtime.
    // The ETS getter is synchronous and must never wait back on the JS thread.
    auto directories = call(runtime, "getConstants", nullptr, 0).asObject(runtime);
    install(runtime);
    auto core = runtime.global().getPropertyAsObject(runtime, "expo");
    jsi::Object version(runtime);
    version.setProperty(runtime, "version", EXPO_CORE_VERSION);
    version.setProperty(runtime, "major", EXPO_CORE_VERSION_MAJOR);
    version.setProperty(runtime, "minor", EXPO_CORE_VERSION_MINOR);
    version.setProperty(runtime, "patch", EXPO_CORE_VERSION_PATCH);
    core.setProperty(runtime, "expoModulesCoreVersion", version);
    core.setProperty(runtime, "cacheDir", directories.getProperty(runtime, "cacheDir"));
    core.setProperty(runtime, "documentsDir", directories.getProperty(runtime, "documentsDir"));
    bindPlatformFunction(runtime, core, "uuidv4", 0, false);
    bindPlatformFunction(runtime, core, "uuidv5", 2, false);
    bindPlatformFunction(runtime, core, "reloadAppAsync", 1, true);
    auto registry = core.getPropertyAsObject(runtime, "modules");
    for (const auto& definition : modules_) {
      if (!registry.hasProperty(runtime, definition.name.c_str())) {
        registerModule(runtime, definition.name, [&](auto& rt, auto& module) {
          definition.initialize(rt, module, context_);
        });
      }
    }
  }

private:
  void bindPlatformFunction(jsi::Runtime& runtime, jsi::Object& core,
                            const char* name, size_t argumentCount, bool asynchronous) {
    const std::weak_ptr<ExpoModulesCoreTurboModule> weak = shared_from_this();
    core.setProperty(runtime, name, jsi::Function::createFromHostFunction(
        runtime, jsi::PropNameID::forAscii(runtime, name), argumentCount,
        [weak, method = std::string(name), argumentCount, asynchronous](
            jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) {
          getRuntimeState(rt);
          auto owner = weak.lock();
          if (!owner) throw jsi::JSError(rt, "Expo Core platform module was released");
          if (count != argumentCount) throw jsi::JSError(rt, "Invalid Expo Core platform argument count");
          for (size_t i = 0; i < count; i++) {
            if (!args[i].isString()) throw jsi::JSError(rt, "Expo Core platform arguments must be strings");
          }
          return asynchronous ? owner->callAsync(rt, method, args, count)
                              : owner->call(rt, method, args, count);
        }));
  }

  const std::vector<ModuleDefinition> modules_;
  const ModuleContext context_;
};

class ExpoModulesCoreFactory final : public rnoh::TurboModuleFactoryDelegate {
public:
  explicit ExpoModulesCoreFactory(std::vector<ModuleDefinition> modules)
      : modules_(std::move(modules)) {}
  SharedTurboModule createTurboModule(Context context, const std::string& name) const override {
    if (name == "ExpoModulesCore") {
      return std::make_shared<ExpoModulesCoreTurboModule>(context, modules_);
    }
    return nullptr;
  }
private:
  const std::vector<ModuleDefinition> modules_;
};

class ExpoModulesCoreJSIBinder final : public rnoh::GlobalJSIBinder {
public:
  explicit ExpoModulesCoreJSIBinder(const Context& context) : GlobalJSIBinder(context) {}
  void createBindings(jsi::Runtime& runtime,
                      std::shared_ptr<rnoh::TurboModuleProvider> provider) override {
    auto module = std::dynamic_pointer_cast<ExpoModulesCoreTurboModule>(
        provider->getTurboModule("ExpoModulesCore"));
    if (!module) throw jsi::JSError(runtime, "Expo Modules Core native factory is not registered");
    module->installModules(runtime);
  }
};

} // namespace

ExpoModulesCorePackage::ExpoModulesCorePackage(rnoh::Package::Context context,
                                               std::vector<ModuleDefinition> modules)
    : rnoh::Package(context), modules_(std::move(modules)) {
  std::unordered_set<std::string> names;
  for (const auto& module : modules_) {
    if (module.name.empty() || !module.initialize || !names.insert(module.name).second) {
      throw std::invalid_argument("Expo module definitions require unique names and initializers");
    }
  }
}

rnoh::GlobalJSIBinders ExpoModulesCorePackage::createGlobalJSIBinders(
    const rnoh::GlobalJSIBinder::Context& context) {
  return {std::make_shared<ExpoModulesCoreJSIBinder>(context)};
}

std::unique_ptr<rnoh::TurboModuleFactoryDelegate>
ExpoModulesCorePackage::createTurboModuleFactoryDelegate() {
  return std::make_unique<ExpoModulesCoreFactory>(modules_);
}

} // namespace expo::harmony
