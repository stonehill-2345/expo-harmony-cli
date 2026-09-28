#pragma once

#include <jsi/jsi.h>
#include "ExpoModulesCoreAsync.h"

#include <functional>
#include <memory>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace expo::harmony {
namespace jsi = facebook::jsi;

// Owned by the Expo global's NativeState, never a process-wide singleton.
// All access, including invalidation, must take place on the owning JS thread.
// Resources must not retain JSI handles back into the owning runtime.
struct ViewConfig {
  std::vector<std::string> props;
  std::vector<std::string> events;
};

class RuntimeState final {
public:
  using ObjectId = long;

  ~RuntimeState();
  void invalidate() noexcept;
  bool isActive() const noexcept;
  size_t resourceCount() const noexcept;
  size_t pendingAsyncCount() const noexcept;

private:
  friend AsyncTask startAsync(jsi::Runtime&, std::shared_ptr<facebook::react::CallInvoker>, AsyncWork);
  friend bool cancelAsync(jsi::Runtime&, AsyncTaskId);
  friend void registerViewConfig(jsi::Runtime&, const std::string&, const std::string&, ViewConfig);
  friend std::shared_ptr<RuntimeState> install(jsi::Runtime& runtime);
  friend void registerModule(jsi::Runtime&, const std::string&,
                             const std::function<void(jsi::Runtime&, jsi::Object&)>&);
  friend void attachSharedObject(jsi::Runtime&, jsi::Object&, std::shared_ptr<void>);
  friend std::shared_ptr<void> getSharedObjectResource(jsi::Runtime&, const jsi::Value&);

  ObjectId retain(std::shared_ptr<void> resource);
  void release(ObjectId id) noexcept;

  AsyncTaskId nextAsyncId_ = 1;
  std::unordered_map<AsyncTaskId, std::unique_ptr<detail::PendingAsyncCall>> pendingAsync_;
  std::unordered_map<std::string, ViewConfig> viewConfigs_;
  bool active_ = true;
  ObjectId nextObjectId_ = 1;
  std::unordered_map<ObjectId, std::shared_ptr<void>> resources_;
  std::unordered_set<std::string> moduleNames_;
};

using ModuleInitializer = std::function<void(jsi::Runtime&, jsi::Object&)>;

std::shared_ptr<RuntimeState> install(jsi::Runtime& runtime);
std::shared_ptr<RuntimeState> getRuntimeState(jsi::Runtime& runtime);
void registerViewConfig(jsi::Runtime& runtime, const std::string& moduleName,
                        const std::string& viewName, ViewConfig config);
void registerModule(jsi::Runtime& runtime, const std::string& name,
                    const ModuleInitializer& initialize);
void attachSharedObject(jsi::Runtime& runtime, jsi::Object& object,
                        std::shared_ptr<void> resource);

// Read through the live JS binding, not through the underlying resource's lifetime.
// Native methods must also validate their receiver/resource type before casting.
std::shared_ptr<void> getSharedObjectResource(jsi::Runtime& runtime,
                                              const jsi::Value& receiver);

} // namespace expo::harmony
