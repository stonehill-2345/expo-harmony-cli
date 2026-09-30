#pragma once

#include <jsi/jsi.h>
#include <atomic>
#include <cstdint>
#include <functional>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>

namespace facebook::react { class CallInvoker; }

namespace expo::harmony {
namespace jsi = facebook::jsi;
// Native modules opt into a coded rejection; ordinary exceptions stay generic.
class NativeAsyncError final : public std::runtime_error {
public:
  NativeAsyncError(std::string code, std::string message)
      : std::runtime_error(std::move(message)), code(std::move(code)) {}
  const std::string code;
};

using AsyncTaskId = uint64_t;
using CancellationSignal = std::shared_ptr<const std::atomic<bool>>;
// Work and the returned converter may capture native data, never JSI handles.
// Only the converter is called on the owning JS thread.
using AsyncResult = std::function<jsi::Value(jsi::Runtime&)>;
using AsyncWork = std::function<AsyncResult(CancellationSignal)>;
struct AsyncTask {
  jsi::Object promise;
  AsyncTaskId id;
};
namespace detail {
struct PendingAsyncCall {
  jsi::Function resolve;
  jsi::Function reject;
  std::shared_ptr<std::atomic<bool>> cancelled;
};
}

// Call these on the owning JS thread. Work runs on a native worker thread.
// Cancellation is cooperative for work and suppresses any late completion.
AsyncTask startAsync(jsi::Runtime& runtime,
                     std::shared_ptr<facebook::react::CallInvoker> jsInvoker,
                     AsyncWork work);
bool cancelAsync(jsi::Runtime& runtime, AsyncTaskId id);
} // namespace expo::harmony
