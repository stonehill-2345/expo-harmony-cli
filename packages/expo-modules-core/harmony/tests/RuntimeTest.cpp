// Harmony integration tests for expo-modules-core.

#include <hermes/hermes.h>
#include <jsi/jsi.h>
#include <jsi/instrumentation.h>

#include <functional>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

#ifdef EXPO_CORE_RUNTIME_TESTS
#include "EventEmitter.h"
#include "ExpoModulesCoreRuntime.h"
#include "NativeModule.h"
#endif

namespace jsi = facebook::jsi;

namespace {

jsi::Value evaluate(jsi::Runtime& runtime, const std::string& source) {
  return runtime.evaluateJavaScript(std::make_shared<jsi::StringBuffer>(source), "expo-core-test.js");
}

void expect(bool condition, const char* message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}

void expectJavaScript(jsi::Runtime& runtime, const std::string& source) {
  auto result = evaluate(runtime, source);
  expect(result.isBool() && result.getBool(), source.c_str());
}

#ifdef EXPO_CORE_RUNTIME_TESTS
struct Resource {
  explicit Resource(int& releases) : releases(releases) {}
  ~Resource() { ++releases; }
  int& releases;
};

void expectFailure(const std::function<void()>& action) {
  bool rejected = false;
  try {
    action();
  } catch (const std::exception&) {
    rejected = true;
  }
  expect(rejected, "Expected native operation to fail");
}

using Test = std::pair<const char*, std::function<void()>>;

void runCoreTests() {
  const std::vector<Test> tests = {
      {"installs real Expo class inheritance and repeats idempotently", [] {
        auto runtime = facebook::hermes::makeHermesRuntime();
        auto first = expo::harmony::install(*runtime);
        expect(first == expo::harmony::install(*runtime), "Installer did not reuse runtime state");
        expectJavaScript(*runtime, R"JS(
          new expo.NativeModule() instanceof expo.EventEmitter &&
          new expo.SharedObject() instanceof expo.EventEmitter &&
          new expo.SharedRef() instanceof expo.SharedObject &&
          Object.getPrototypeOf(expo.modules) === null
        )JS");
      }},
      {"view config comes from native registration and normalizes real events", [] {
        auto runtime = facebook::hermes::makeHermesRuntime();
        expo::harmony::install(*runtime);
        expectJavaScript(*runtime, "expo.getViewConfig('Missing') === null");
        expo::harmony::registerViewConfig(*runtime, "Probe", "", {{"label"}, {"onValue"}});
        expo::harmony::registerViewConfig(*runtime, "Probe", "Named", {{"value"}, {}});
        expectJavaScript(*runtime, R"JS(
          expo.getViewConfig('Probe').validAttributes.label === true &&
          expo.getViewConfig('Probe').directEventTypes.topValue.registrationName === 'onValue' &&
          expo.getViewConfig('Probe', 'Named').validAttributes.value === true &&
          expo.getViewConfig('Probe', 'Other') === null
        )JS");
        expectFailure([&] { expo::harmony::registerViewConfig(*runtime, "Probe", "", {}); });
        expectFailure([&] { expo::harmony::registerViewConfig(*runtime, "Invalid", "", {{}, {"value"}}); });
        expectJavaScript(*runtime, "expo.getViewConfig('Invalid') === null");
      }},
      {"rejects foreign Expo globals rather than trusting a fake object", [] {
        auto runtime = facebook::hermes::makeHermesRuntime();
        evaluate(*runtime, "globalThis.expo = { marker: 17 }");
        expectFailure([&] { expo::harmony::install(*runtime); });
        expectJavaScript(*runtime, "expo.marker === 17 && expo.NativeModule === undefined");
      }},
      {"requires installation before module registration", [] {
        auto runtime = facebook::hermes::makeHermesRuntime();
        expectFailure([&] {
          expo::harmony::registerModule(*runtime, "MissingCore", [](auto&, auto&) {});
        });
      }},
      {"registers a real native method and preserves duplicate module identity", [] {
        auto runtime = facebook::hermes::makeHermesRuntime();
        expo::harmony::install(*runtime);
        expo::harmony::registerModule(*runtime, "Arithmetic", [](jsi::Runtime& rt, jsi::Object& module) {
          module.setProperty(rt, "add", jsi::Function::createFromHostFunction(
              rt, jsi::PropNameID::forAscii(rt, "add"), 2,
              [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) {
                if (count != 2 || !args[0].isNumber() || !args[1].isNumber()) {
                  throw jsi::JSError(rt, "add expects two numbers");
                }
                return jsi::Value(args[0].asNumber() + args[1].asNumber());
              }));
        });
        expectJavaScript(*runtime, "expo.modules.Arithmetic instanceof expo.NativeModule && expo.modules.Arithmetic.add(20, 22) === 42");
        expectJavaScript(*runtime, "(() => { try { expo.modules.Arithmetic.add('bad', 1); return false; } catch (e) { return e.message.includes('two numbers'); } })()");
        expectFailure([&] {
          expo::harmony::registerModule(*runtime, "Arithmetic", [](auto&, auto&) {});
        });
        expectJavaScript(*runtime, "expo.modules.Arithmetic.add(1, 2) === 3");
      }},
      {"does not publish failed initialization and permits a real retry", [] {
        auto runtime = facebook::hermes::makeHermesRuntime();
        expo::harmony::install(*runtime);
        expectFailure([&] {
          expo::harmony::registerModule(*runtime, "Retry", [](jsi::Runtime& rt, jsi::Object&) {
            throw jsi::JSError(rt, "initialization failed");
          });
        });
        expectJavaScript(*runtime, "expo.modules.Retry === undefined");
        expo::harmony::registerModule(*runtime, "Retry", [](jsi::Runtime& rt, jsi::Object& module) {
          module.setProperty(rt, "answer", 42);
        });
        expectJavaScript(*runtime, "expo.modules.Retry.answer === 42");
      }},
      {"native events stop after subscription removal", [] {
        auto runtime = facebook::hermes::makeHermesRuntime();
        expo::harmony::install(*runtime);
        expo::harmony::registerModule(*runtime, "Events", [](auto&, auto&) {});
        evaluate(*runtime, "globalThis.eventTotal = 0; globalThis.subscription = expo.modules.Events.addListener('value', n => { eventTotal += n; });");
        auto emitter = evaluate(*runtime, "expo.modules.Events").asObject(*runtime);
        std::vector<jsi::Value> payload;
        payload.emplace_back(4);
        expo::EventEmitter::emitEvent(*runtime, emitter, "value", payload);
        expectJavaScript(*runtime, "eventTotal === 4 && expo.modules.Events.listenerCount('value') === 1");
        evaluate(*runtime, "subscription.remove(); subscription.remove();");
        expo::EventEmitter::emitEvent(*runtime, emitter, "value", payload);
        expectJavaScript(*runtime, "eventTotal === 4 && expo.modules.Events.listenerCount('value') === 0");
      }},
      {"shared objects release native resources exactly once", [] {
        int releases = 0;
        auto runtime = facebook::hermes::makeHermesRuntime();
        auto state = expo::harmony::install(*runtime);
        auto object = evaluate(*runtime, "globalThis.resource = new expo.SharedObject(); resource").asObject(*runtime);
        expo::harmony::attachSharedObject(*runtime, object, std::make_shared<Resource>(releases));
        expect(state->resourceCount() == 1, "Native resource was not retained");
        expectJavaScript(*runtime, "resource.__expo_shared_object_id__ > 0");
        evaluate(*runtime, "resource.release(); resource.release();");
        expect(releases == 1 && state->resourceCount() == 0, "Explicit release must be idempotent");
        expectJavaScript(*runtime, "resource.__expo_shared_object_id__ === 0");
      }},
      {"resource attachment preserves existing event listeners", [] {
        int releases = 0;
        auto runtime = facebook::hermes::makeHermesRuntime();
        expo::harmony::install(*runtime);
        auto object = evaluate(*runtime, "globalThis.resource = new expo.SharedObject(); globalThis.total = 0; resource.addListener('value', n => { total += n; }); resource").asObject(*runtime);
        expo::harmony::attachSharedObject(*runtime, object, std::make_shared<Resource>(releases));
        std::vector<jsi::Value> payload;
        payload.emplace_back(3);
        expo::EventEmitter::emitEvent(*runtime, object, "value", payload);
        expectJavaScript(*runtime, "total === 3 && resource.listenerCount('value') === 1");
      }},
      {"JS release revokes binding without destroying an external native owner", [] {
        int releases = 0;
        auto runtime = facebook::hermes::makeHermesRuntime();
        auto state = expo::harmony::install(*runtime);
        auto owner = std::make_shared<Resource>(releases);
        auto object = evaluate(*runtime, "globalThis.held = new expo.SharedObject(); held").asObject(*runtime);
        expo::harmony::attachSharedObject(*runtime, object, owner);
        expect(expo::harmony::getSharedObjectResource(*runtime, jsi::Value(*runtime, object)).get() == owner.get(), "Wrong native binding");
        evaluate(*runtime, "held.release(); held.release()");
        expect(releases == 0 && state->resourceCount() == 0, "Release destroyed external ownership");
        expectFailure([&] { expo::harmony::getSharedObjectResource(*runtime, jsi::Value(*runtime, object)); });
        owner.reset();
        expect(releases == 1, "Last external owner did not reclaim resource");
      }},
      {"resource bindings remain isolated when runtime-local IDs coincide", [] {
        int firstReleases = 0, secondReleases = 0;
        auto first = facebook::hermes::makeHermesRuntime();
        auto second = facebook::hermes::makeHermesRuntime();
        expo::harmony::install(*first); expo::harmony::install(*second);
        auto a = evaluate(*first, "globalThis.r = new expo.SharedObject(); r").asObject(*first);
        auto b = evaluate(*second, "globalThis.r = new expo.SharedObject(); r").asObject(*second);
        auto firstOwner = std::make_shared<Resource>(firstReleases);
        auto secondOwner = std::make_shared<Resource>(secondReleases);
        expo::harmony::attachSharedObject(*first, a, firstOwner);
        expo::harmony::attachSharedObject(*second, b, secondOwner);
        expect(a.getProperty(*first, "__expo_shared_object_id__").asNumber() == b.getProperty(*second, "__expo_shared_object_id__").asNumber(), "Expected same local IDs");
        evaluate(*first, "r.release()");
        expect(expo::harmony::getSharedObjectResource(*second, jsi::Value(*second, b)).get() == secondOwner.get(), "Release affected another runtime");
        firstOwner.reset();
        expect(firstReleases == 1 && secondReleases == 0, "Native ownership leaked across runtimes");
      }},
      {"unbound and invalidated resource access is rejected", [] {
        int releases = 0;
        auto runtime = facebook::hermes::makeHermesRuntime();
        auto state = expo::harmony::install(*runtime);
        auto object = evaluate(*runtime, "new expo.SharedObject()").asObject(*runtime);
        expectFailure([&] { expo::harmony::getSharedObjectResource(*runtime, jsi::Value(*runtime, object)); });
        expectFailure([&] { expo::harmony::getSharedObjectResource(*runtime, jsi::Value::null()); });
        auto owner = std::make_shared<Resource>(releases);
        expo::harmony::attachSharedObject(*runtime, object, owner);
        state->invalidate();
        expectFailure([&] { expo::harmony::getSharedObjectResource(*runtime, jsi::Value(*runtime, object)); });
        expect(releases == 0, "Invalidation destroyed an external owner");
      }},
      {"garbage collection releases an unreachable shared object", [] {
        int releases = 0;
        auto runtime = facebook::hermes::makeHermesRuntime();
        auto state = expo::harmony::install(*runtime);
        {
          auto object = evaluate(*runtime, "new expo.SharedObject()").asObject(*runtime);
          expo::harmony::attachSharedObject(*runtime, object, std::make_shared<Resource>(releases));
        }
        runtime->instrumentation().collectGarbage("Expo Core SharedObject test");
        expect(releases == 1 && state->resourceCount() == 0, "GC did not release unreachable native resource");
      }},
      {"shared refs retain native resource identity", [] {
        int releases = 0;
        auto runtime = facebook::hermes::makeHermesRuntime();
        expo::harmony::install(*runtime);
        auto object = evaluate(*runtime, "globalThis.ref = new expo.SharedRef(); ref").asObject(*runtime);
        expo::harmony::attachSharedObject(*runtime, object, std::make_shared<Resource>(releases));
        expectJavaScript(*runtime, "ref instanceof expo.SharedObject && ref.__expo_shared_object_id__ > 0");
        evaluate(*runtime, "ref.release()");
        expect(releases == 1, "SharedRef resource was not released");
      }},
      {"rejects invalid or duplicate resource attachment", [] {
        int releases = 0;
        auto runtime = facebook::hermes::makeHermesRuntime();
        auto state = expo::harmony::install(*runtime);
        auto plain = evaluate(*runtime, "({})").asObject(*runtime);
        expectFailure([&] {
          expo::harmony::attachSharedObject(*runtime, plain, std::make_shared<Resource>(releases));
        });
        expect(state->resourceCount() == 0, "Rejected attachment leaked a native resource");
        auto object = evaluate(*runtime, "new expo.SharedObject()").asObject(*runtime);
        expectFailure([&] { expo::harmony::attachSharedObject(*runtime, object, nullptr); });
        expo::harmony::attachSharedObject(*runtime, object, std::make_shared<Resource>(releases));
        expectFailure([&] {
          expo::harmony::attachSharedObject(*runtime, object, std::make_shared<Resource>(releases));
        });
        expect(state->resourceCount() == 1, "Duplicate attachment replaced the resource");
      }},
      {"separate Hermes runtimes do not share module or resource state", [] {
        auto first = facebook::hermes::makeHermesRuntime();
        auto second = facebook::hermes::makeHermesRuntime();
        auto state1 = expo::harmony::install(*first);
        auto state2 = expo::harmony::install(*second);
        expect(state1 != state2, "States must be runtime-local");
        expo::harmony::registerModule(*first, "OnlyFirst", [](auto&, auto&) {});
        expectJavaScript(*second, "expo.modules.OnlyFirst === undefined");
      }},
      {"invalidation clears resources and rejects further writes", [] {
        int releases = 0;
        auto runtime = facebook::hermes::makeHermesRuntime();
        auto state = expo::harmony::install(*runtime);
        auto object = evaluate(*runtime, "globalThis.resource = new expo.SharedObject(); resource").asObject(*runtime);
        expo::harmony::attachSharedObject(*runtime, object, std::make_shared<Resource>(releases));
        state->invalidate();
        state->invalidate();
        expect(releases == 1 && state->resourceCount() == 0, "Invalidation must release once");
        expectFailure([&] { expo::harmony::install(*runtime); });
        expectFailure([&] {
          expo::harmony::registerModule(*runtime, "Late", [](auto&, auto&) {});
        });
        expectFailure([&] {
          auto late = evaluate(*runtime, "new expo.SharedObject()").asObject(*runtime);
          expo::harmony::attachSharedObject(*runtime, late, std::make_shared<Resource>(releases));
        });
        evaluate(*runtime, "resource.release()");
      }},
      {"runtime destruction invalidates externally retained state", [] {
        int releases = 0;
        std::shared_ptr<expo::harmony::RuntimeState> survivor;
        {
          auto runtime = facebook::hermes::makeHermesRuntime();
          survivor = expo::harmony::install(*runtime);
          auto object = evaluate(*runtime, "globalThis.resource = new expo.SharedObject(); resource").asObject(*runtime);
          expo::harmony::attachSharedObject(*runtime, object, std::make_shared<Resource>(releases));
        }
        expect(!survivor->isActive(), "External state handle stayed active after runtime destruction");
        expect(survivor->resourceCount() == 0 && releases == 1, "External state retained dead runtime resources");
      }},
      {"destroying Hermes releases remaining resources", [] {
        int releases = 0;
        std::weak_ptr<expo::harmony::RuntimeState> state;
        {
          auto runtime = facebook::hermes::makeHermesRuntime();
          state = expo::harmony::install(*runtime);
          auto object = evaluate(*runtime, "globalThis.resource = new expo.SharedObject(); resource").asObject(*runtime);
          expo::harmony::attachSharedObject(*runtime, object, std::make_shared<Resource>(releases));
          expect(releases == 0, "Resource released before runtime destruction");
        }
        expect(state.expired(), "RuntimeState leaked after Hermes destruction");
        expect(releases == 1, "Runtime destruction did not release native resource exactly once");
      }},
  };
  for (const auto& test : tests) {
    test.second();
    std::cout << "PASS " << test.first << std::endl;
  }
  std::cout << "CORE_TESTS_PASSED=" << tests.size() << std::endl;
}
#endif

} // namespace

int main() {
  try {
    auto runtime = facebook::hermes::makeHermesRuntime();
    auto result = evaluate(*runtime, "21 * 2");
    expect(result.isNumber() && result.asNumber() == 42, "Hermes did not evaluate JavaScript correctly");
    std::cout << "PASS real Hermes JavaScript evaluation" << std::endl;
#ifdef EXPO_CORE_RUNTIME_TESTS
    runCoreTests();
#endif
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "FAIL " << error.what() << std::endl;
    return 1;
  }
}
