#include "ExpoModulesCoreAsync.h"
#include "ExpoModulesCoreRuntime.h"
#include <ReactCommon/CallInvoker.h>
#include <hermes/hermes.h>
#include <condition_variable>
#include <future>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

namespace jsi = facebook::jsi;
using namespace expo::harmony;
using namespace std::chrono_literals;
namespace {
void expect(bool condition, const char* message) {
  if (!condition) throw std::runtime_error(message);
}
jsi::Value evaluate(jsi::Runtime& rt, const std::string& source) {
  return rt.evaluateJavaScript(std::make_shared<jsi::StringBuffer>(source), "async-test.js");
}
void check(jsi::Runtime& rt, const std::string& source) {
  auto value = evaluate(rt, source);
  expect(value.isBool() && value.getBool(), source.c_str());
}
auto makeRuntime() {
  auto runtime = facebook::hermes::makeHermesRuntime(
      ::hermes::vm::RuntimeConfig::Builder().withMicrotaskQueue(true).build());
  install(*runtime);
  return runtime;
}
// A deterministic JS queue, not a fake runtime: native work uses actual OS
// threads, and callbacks execute against the actual device Hermes runtime.
class TestInvoker final : public facebook::react::CallInvoker {
public:
  void invokeAsync(facebook::react::CallFunc&& call) noexcept override {
    std::lock_guard lock(mutex_);
    calls_.push_back(std::move(call));
    ready_.notify_one();
  }
  void invokeSync(facebook::react::CallFunc&&) override {
    throw std::runtime_error("Sync callback must not be used");
  }
  void flush(jsi::Runtime& runtime) {
    std::vector<facebook::react::CallFunc> calls;
    {
      std::unique_lock lock(mutex_);
      expect(ready_.wait_for(lock, 3s, [&] { return !calls_.empty(); }), "Native worker did not finish");
      calls.swap(calls_);
    }
    for (auto& call : calls) call(runtime);
    runtime.drainMicrotasks();
  }
private:
  std::mutex mutex_;
  std::condition_variable ready_;
  std::vector<facebook::react::CallFunc> calls_;
};
void publish(jsi::Runtime& rt, AsyncTask task) {
  rt.global().setProperty(rt, "pending", std::move(task.promise));
  evaluate(rt, "globalThis.outcome = null; pending.then(v => outcome = v, e => outcome = e.code + ':' + e.message)");
}
void tests() {
  std::vector<std::pair<const char*, std::function<void()>>> tests = {
    {"worker runs off JS thread; Promise resolves on owning JS queue", [] {
      auto rt = makeRuntime(); auto queue = std::make_shared<TestInvoker>();
      auto jsThread = std::this_thread::get_id();
      publish(*rt, startAsync(*rt, queue, [jsThread](CancellationSignal) {
        expect(std::this_thread::get_id() != jsThread, "Work ran on JS thread");
        return [jsThread](jsi::Runtime&) {
          expect(std::this_thread::get_id() == jsThread, "JS conversion ran on worker");
          return jsi::Value(42);
        };
      }));
      check(*rt, "pending instanceof Promise && outcome === null");
      queue->flush(*rt);
      check(*rt, "outcome === 42");
      expect(getRuntimeState(*rt)->pendingAsyncCount() == 0, "Resolved call retained");
    }},
    {"native worker exception rejects with code and message", [] {
      auto rt = makeRuntime(); auto queue = std::make_shared<TestInvoker>();
      publish(*rt, startAsync(*rt, queue, [](CancellationSignal) -> AsyncResult {
        throw std::runtime_error("Requested native failure");
      }));
      queue->flush(*rt);
      check(*rt, "outcome === 'ERR_NATIVE_ASYNC:Requested native failure'");
      expect(getRuntimeState(*rt)->pendingAsyncCount() == 0, "Rejected call retained");
    }},
    {"structured native worker error preserves its code and message", [] {
      auto rt = makeRuntime(); auto queue = std::make_shared<TestInvoker>();
      publish(*rt, startAsync(*rt, queue, [](CancellationSignal) -> AsyncResult {
        throw NativeAsyncError("ERR_CORE_ASYNC_PROBE", "Typed native failure");
      }));
      queue->flush(*rt);
      check(*rt, "outcome === 'ERR_CORE_ASYNC_PROBE:Typed native failure'");
      expect(getRuntimeState(*rt)->pendingAsyncCount() == 0, "Typed rejection retained");
    }},
    {"structured result conversion error preserves its code and message", [] {
      auto rt = makeRuntime(); auto queue = std::make_shared<TestInvoker>();
      publish(*rt, startAsync(*rt, queue, [](CancellationSignal) {
        return [](jsi::Runtime&) -> jsi::Value {
          throw NativeAsyncError("ERR_CORE_CONVERT_PROBE", "Typed conversion failure");
        };
      }));
      queue->flush(*rt);
      check(*rt, "outcome === 'ERR_CORE_CONVERT_PROBE:Typed conversion failure'");
      expect(getRuntimeState(*rt)->pendingAsyncCount() == 0, "Typed conversion rejection retained");
    }},
    {"JS result conversion exception rejects rather than escaping queue", [] {
      auto rt = makeRuntime(); auto queue = std::make_shared<TestInvoker>();
      publish(*rt, startAsync(*rt, queue, [](CancellationSignal) {
        return [](jsi::Runtime&) -> jsi::Value { throw std::runtime_error("conversion failed"); };
      }));
      queue->flush(*rt);
      check(*rt, "outcome === 'ERR_NATIVE_ASYNC:conversion failed'");
    }},
    {"cancel rejects once and discards late native completion", [] {
      auto rt = makeRuntime(); auto queue = std::make_shared<TestInvoker>();
      auto gate = std::make_shared<std::promise<void>>(); auto ready = gate->get_future().share();
      auto task = startAsync(*rt, queue, [ready](CancellationSignal signal) {
        expect(ready.wait_for(3s) == std::future_status::ready, "Test gate timed out");
        expect(signal->load(), "Worker did not observe cancellation");
        return [](jsi::Runtime&) { return jsi::Value(42); };
      });
      auto id = task.id; publish(*rt, std::move(task));
      expect(cancelAsync(*rt, id), "Cancel did not find pending task");
      expect(!cancelAsync(*rt, id), "Task canceled twice");
      rt->drainMicrotasks();
      check(*rt, "outcome === 'ERR_CANCELED:Native async operation was canceled'");
      gate->set_value(); queue->flush(*rt);
      check(*rt, "outcome === 'ERR_CANCELED:Native async operation was canceled'");
      expect(getRuntimeState(*rt)->pendingAsyncCount() == 0, "Canceled call retained");
    }},
    {"runtime invalidation cancels work without invoking JS callbacks", [] {
      auto rt = makeRuntime(); auto queue = std::make_shared<TestInvoker>();
      auto state = getRuntimeState(*rt);
      publish(*rt, startAsync(*rt, queue, [](CancellationSignal) {
        return [](jsi::Runtime&) { return jsi::Value(42); };
      }));
      state->invalidate(); queue->flush(*rt);
      check(*rt, "outcome === null");
      expect(state->pendingAsyncCount() == 0, "Invalidated call retained");
    }},
    {"destroyed runtime releases callbacks even with an external state owner", [] {
      auto queue = std::make_shared<TestInvoker>();
      std::shared_ptr<RuntimeState> retained;
      {
        auto rt = makeRuntime(); retained = getRuntimeState(*rt);
        publish(*rt, startAsync(*rt, queue, [](CancellationSignal) {
          return [](jsi::Runtime&) -> jsi::Value {
            throw std::runtime_error("Destroyed runtime callback invoked");
          };
        }));
      }
      expect(!retained->isActive() && retained->pendingAsyncCount() == 0,
             "Runtime destruction retained JS callbacks");
      auto replacement = makeRuntime(); queue->flush(*replacement);
      check(*replacement, "typeof outcome === 'undefined'");
    }},
  };
  size_t failures = 0;
  for (auto& [name, test] : tests) {
    try { test(); std::cout << "PASS " << name << std::endl; }
    catch (const std::exception& error) {
      ++failures;
      std::cerr << "FAIL " << name << ": " << error.what() << std::endl;
    }
  }
  if (failures) throw std::runtime_error("Async test failures: " + std::to_string(failures));
  std::cout << "ASYNC_TESTS_PASSED=" << tests.size() << std::endl;
}
}
int main() {
  try { tests(); return 0; }
  catch (const std::exception& error) { std::cerr << "FAIL " << error.what() << std::endl; return 1; }
}
