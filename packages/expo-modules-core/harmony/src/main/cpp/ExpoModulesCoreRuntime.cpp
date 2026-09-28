#include "ExpoModulesCoreRuntime.h"

#include "EventEmitter.h"
#include "JSIUtils.h"
#include "NativeModule.h"
#include "SharedObject.h"
#include "SharedRef.h"

#include <utility>

namespace expo::harmony {
namespace {

// The JS-owned token must invalidate state even when native callers keep a
// shared_ptr to it after the Hermes runtime has been destroyed.
class RuntimeStateOwner final : public jsi::NativeState {
public:
  explicit RuntimeStateOwner(std::shared_ptr<RuntimeState> state) : state(std::move(state)) {}
  ~RuntimeStateOwner() override { state->invalidate(); }

  const std::shared_ptr<RuntimeState> state;
};

// Only attachments made by this Core runtime may resolve through its registry.
class SharedResourceBinding final : public expo::SharedObject::NativeState {
public:
  SharedResourceBinding(RuntimeState::ObjectId id, expo::SharedObject::ObjectReleaser releaser,
                        const std::shared_ptr<RuntimeState>& owner)
      : NativeState(id, std::move(releaser)), owner(owner) {}
  const std::weak_ptr<RuntimeState> owner;
};

} // namespace

RuntimeState::~RuntimeState() {
  invalidate();
}

void RuntimeState::invalidate() noexcept {
  active_ = false;
  for (auto& [id, call] : pendingAsync_) call->cancelled->store(true);
  pendingAsync_.clear();
  resources_.clear();
  moduleNames_.clear();
  viewConfigs_.clear();
}

bool RuntimeState::isActive() const noexcept {
  return active_;
}

size_t RuntimeState::resourceCount() const noexcept {
  return resources_.size();
}

size_t RuntimeState::pendingAsyncCount() const noexcept {
  return pendingAsync_.size();
}

RuntimeState::ObjectId RuntimeState::retain(std::shared_ptr<void> resource) {
  const auto id = nextObjectId_++;
  resources_.emplace(id, std::move(resource));
  return id;
}

void RuntimeState::release(ObjectId id) noexcept {
  // Expo's SharedObject invokes release explicitly and again during NativeState
  // destruction. Erasing the resource makes these two paths safely idempotent.
  resources_.erase(id);
}

std::shared_ptr<RuntimeState> getRuntimeState(jsi::Runtime& runtime) {
  auto value = runtime.global().getProperty(runtime, "expo");
  if (!value.isObject() || !value.asObject(runtime).hasNativeState<RuntimeStateOwner>(runtime)) {
    throw jsi::JSError(runtime, "Expo Modules Core Harmony is not installed in this runtime");
  }
  auto state = value.asObject(runtime).getNativeState<RuntimeStateOwner>(runtime)->state;
  if (!state->isActive()) {
    throw jsi::JSError(runtime, "Expo Modules Core Harmony runtime has been invalidated");
  }
  return state;
}

std::shared_ptr<RuntimeState> install(jsi::Runtime& runtime) {
  if (!runtime.global().getProperty(runtime, "expo").isUndefined()) {
    // Do not accept a JS shim or silently replace another platform's runtime.
    return getRuntimeState(runtime);
  }

  auto state = std::make_shared<RuntimeState>();
  jsi::Object core(runtime);
  core.setNativeState(runtime, std::make_shared<RuntimeStateOwner>(state));
  auto objectConstructor = runtime.global().getPropertyAsObject(runtime, "Object");
  auto modules = objectConstructor.getPropertyAsFunction(runtime, "create")
                     .call(runtime, jsi::Value::null())
                     .asObject(runtime);
  core.setProperty(runtime, "modules", modules);
  core.setProperty(runtime, "getViewConfig", jsi::Function::createFromHostFunction(
      runtime, jsi::PropNameID::forAscii(runtime, "getViewConfig"), 2,
      [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) -> jsi::Value {
        if (count < 1 || !args[0].isString() ||
            (count > 1 && !args[1].isUndefined() && !args[1].isString())) {
          throw jsi::JSError(rt, "View config requires a module name and optional view name");
        }
        auto state = getRuntimeState(rt);
        auto key = args[0].asString(rt).utf8(rt) + std::string(1, '\0');
        if (count > 1 && args[1].isString()) key += args[1].asString(rt).utf8(rt);
        auto found = state->viewConfigs_.find(key);
        if (found == state->viewConfigs_.end()) return jsi::Value::null();
        jsi::Object config(rt), props(rt), events(rt);
        for (const auto& prop : found->second.props) props.setProperty(rt, prop.c_str(), true);
        for (const auto& event : found->second.events) {
          props.setProperty(rt, event.c_str(), true);
          jsi::Object registration(rt);
          registration.setProperty(rt, "registrationName", jsi::String::createFromUtf8(rt, event));
          events.setProperty(rt, ("top" + event.substr(2)).c_str(), registration);
        }
        config.setProperty(rt, "validAttributes", props);
        config.setProperty(rt, "directEventTypes", events);
        return config;
      }));
  runtime.global().setProperty(runtime, "expo", core);

  try {
    expo::EventEmitter::installClass(runtime);
    expo::NativeModule::installClass(runtime);
    const std::weak_ptr<RuntimeState> weakState = state;
    expo::SharedObject::installBaseClass(runtime, [weakState](auto id) {
      if (auto owner = weakState.lock()) {
        owner->release(id);
      }
    });
    expo::SharedRef::installBaseClass(runtime);
  } catch (...) {
    state->invalidate();
    runtime.global().setProperty(runtime, "expo", jsi::Value::undefined());
    throw;
  }
  return state;
}

void registerViewConfig(jsi::Runtime& runtime, const std::string& moduleName,
                        const std::string& viewName, ViewConfig config) {
  auto state = getRuntimeState(runtime);
  if (moduleName.empty()) throw jsi::JSError(runtime, "View config requires a module name");
  for (const auto& event : config.events) {
    if (!event.starts_with("on") || event.size() <= 2) {
      throw jsi::JSError(runtime, "View event names must use the onEvent form");
    }
  }
  if (!state->viewConfigs_.emplace(moduleName + std::string(1, '\0') + viewName, std::move(config)).second) {
    throw jsi::JSError(runtime, "View config already registered: " + moduleName + "/" + viewName);
  }
}

void registerModule(jsi::Runtime& runtime, const std::string& name,
                    const ModuleInitializer& initialize) {
  auto state = getRuntimeState(runtime);
  if (name.empty() || !initialize) {
    throw jsi::JSError(runtime, "Expo module registration requires a name and initializer");
  }
  if (!state->moduleNames_.insert(name).second) {
    throw jsi::JSError(runtime, "Expo module is already registered: " + name);
  }
  try {
    auto module = expo::NativeModule::createInstance(runtime);
    initialize(runtime, module);
    if (!state->isActive()) {
      throw jsi::JSError(runtime, "Expo module initialization invalidated its runtime");
    }
    auto modules = expo::common::getCoreObject(runtime).getPropertyAsObject(runtime, "modules");
    modules.setProperty(runtime, name.c_str(), module);
  } catch (...) {
    state->moduleNames_.erase(name);
    throw;
  }
}

void attachSharedObject(jsi::Runtime& runtime, jsi::Object& object,
                        std::shared_ptr<void> resource) {
  auto state = getRuntimeState(runtime);
  if (!resource || !object.instanceOf(runtime, expo::SharedObject::getBaseClass(runtime))) {
    throw jsi::JSError(runtime, "Native resources require an Expo SharedObject instance");
  }
  if (object.hasNativeState<expo::SharedObject::NativeState>(runtime)) {
    throw jsi::JSError(runtime, "Expo SharedObject already owns a native resource");
  }
  const auto id = state->retain(std::move(resource));
  const std::weak_ptr<RuntimeState> weakState = state;
  try {
    auto nativeState = std::make_shared<SharedResourceBinding>(id, [weakState](auto id) {
      if (auto owner = weakState.lock()) {
        owner->release(id);
      }
    }, state);
    if (object.hasNativeState<expo::EventEmitter::NativeState>(runtime)) {
      nativeState->listeners = std::move(
          object.getNativeState<expo::EventEmitter::NativeState>(runtime)->listeners);
    }
    object.setNativeState(runtime, std::move(nativeState));
  } catch (...) {
    state->release(id);
    throw;
  }
}

std::shared_ptr<void> getSharedObjectResource(jsi::Runtime& runtime, const jsi::Value& receiver) {
  auto state = getRuntimeState(runtime);
  if (!receiver.isObject()) throw jsi::JSError(runtime, "Native resource receiver is not an object");
  auto object = receiver.asObject(runtime);
  if (!object.hasNativeState<SharedResourceBinding>(runtime)) {
    throw jsi::JSError(runtime, "Native resource binding has been released");
  }
  auto binding = object.getNativeState<SharedResourceBinding>(runtime);
  if (binding->owner.lock() != state) throw jsi::JSError(runtime, "Native resource belongs to another runtime");
  auto entry = state->resources_.find(binding->objectId);
  if (entry == state->resources_.end()) throw jsi::JSError(runtime, "Native resource binding has been released");
  return entry->second;
}

} // namespace expo::harmony
