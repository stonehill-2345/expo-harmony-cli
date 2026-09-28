#include "ExpoModulesCoreAsync.h"
#include "ExpoModulesCoreRuntime.h"
#include <ReactCommon/CallInvoker.h>
#include <thread>
#include <optional>

namespace expo::harmony {
namespace {
struct AsyncFailure {
  std::string code;
  std::string message;
};

void reject(jsi::Runtime& runtime, detail::PendingAsyncCall& call,
            const std::string& code, const std::string& message) {
  auto error = runtime.global().getPropertyAsFunction(runtime, "Error")
                   .callAsConstructor(runtime, jsi::String::createFromUtf8(runtime, message))
                   .asObject(runtime);
  error.setProperty(runtime, "code", jsi::String::createFromUtf8(runtime, code));
  call.reject.call(runtime, error);
}
}

AsyncTask startAsync(jsi::Runtime& runtime,
                     std::shared_ptr<facebook::react::CallInvoker> jsInvoker,
                     AsyncWork work) {
  auto state = getRuntimeState(runtime);
  if (!jsInvoker || !work) throw jsi::JSError(runtime, "Async work requires a JS invoker and worker");
  const auto id = state->nextAsyncId_++;
  auto cancelled = std::make_shared<std::atomic<bool>>(false);
  auto executor = jsi::Function::createFromHostFunction(runtime,
      jsi::PropNameID::forAscii(runtime, "expoAsyncExecutor"), 2,
      [state, id, cancelled](jsi::Runtime& rt, const jsi::Value&,
                             const jsi::Value* args, size_t count) {
        if (count != 2) throw jsi::JSError(rt, "Invalid Promise executor arguments");
        state->pendingAsync_.emplace(id, std::make_unique<detail::PendingAsyncCall>(
            detail::PendingAsyncCall{args[0].asObject(rt).asFunction(rt),
                                     args[1].asObject(rt).asFunction(rt), cancelled}));
        return jsi::Value::undefined();
      });
  auto promise = runtime.global().getPropertyAsFunction(runtime, "Promise")
                     .callAsConstructor(runtime, executor).asObject(runtime);
  if (!state->pendingAsync_.contains(id)) {
    throw jsi::JSError(runtime, "Promise constructor did not invoke the native executor");
  }
  std::weak_ptr<RuntimeState> weakState = state;
  try {
    std::thread([weakState, id, cancelled, jsInvoker, work = std::move(work)]() {
      AsyncResult result;
      std::optional<AsyncFailure> error;
      try {
        result = work(cancelled);
        if (!result) throw std::runtime_error("Native async worker returned no result converter");
      } catch (const NativeAsyncError& exception) {
        error = AsyncFailure{exception.code, exception.what()};
      } catch (const std::exception& exception) {
        error = AsyncFailure{"ERR_NATIVE_ASYNC", exception.what()};
      } catch (...) {
        error = AsyncFailure{"ERR_NATIVE_ASYNC", "Unknown native async exception"};
      }
      jsInvoker->invokeAsync([weakState, id, result = std::move(result), error = std::move(error)]
                            (jsi::Runtime& rt) {
        auto owner = weakState.lock();
        if (!owner || !owner->isActive()) return;
        auto entry = owner->pendingAsync_.extract(id);
        if (entry.empty()) return; // Canceled on the JS thread; never settle twice.
        auto call = std::move(entry.mapped());
        if (error) {
          reject(rt, *call, error->code, error->message);
          return;
        }
        try {
          auto value = result(rt);
          call->resolve.call(rt, std::move(value));
        } catch (const NativeAsyncError& exception) {
          reject(rt, *call, exception.code, exception.what());
        } catch (const std::exception& exception) {
          reject(rt, *call, "ERR_NATIVE_ASYNC", exception.what());
        }
      });
    }).detach();
  } catch (const std::exception& exception) {
    auto entry = state->pendingAsync_.extract(id);
    cancelled->store(true);
    reject(runtime, *entry.mapped(), "ERR_NATIVE_ASYNC", exception.what());
  }
  return {std::move(promise), id};
}

bool cancelAsync(jsi::Runtime& runtime, AsyncTaskId id) {
  auto state = getRuntimeState(runtime);
  auto entry = state->pendingAsync_.extract(id);
  if (entry.empty()) return false;
  entry.mapped()->cancelled->store(true);
  reject(runtime, *entry.mapped(), "ERR_CANCELED", "Native async operation was canceled");
  return true;
}
} // namespace expo::harmony
