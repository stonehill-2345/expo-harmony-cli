#include "AuthorFixtureModule.h"
#include "AuthorFixtureView.h"
#include "ExpoModulesCoreViewBinding.h"
#include "ExpoModulesCoreRuntime.h"
#include "EventEmitter.h"
#include "JSIUtils.h"
#include "SharedObject.h"
#include "SharedRef.h"
#include "RNOH/RNInstanceCAPI.h"
#include <chrono>
#include <atomic>
#include <cmath>
#include <thread>

namespace expo::harmony::m3 {
namespace jsi = facebook::jsi;
namespace {
struct Counters { int alive = 0; };
std::atomic<unsigned> nextResourceId{1};
struct Resource {
  Resource(std::shared_ptr<Counters> counters, double value) : counters(std::move(counters)), value(value), id(nextResourceId++) {
    ++this->counters->alive;
    LOG(INFO) << "M3_RESOURCE_CREATE id=" << id;
  }
  ~Resource() { --counters->alive; LOG(INFO) << "M3_RESOURCE_DESTROY id=" << id; }
  std::shared_ptr<Counters> counters;
  double value;
  unsigned id;
};

ModuleDefinition createDefinition() {
  return {"ExpoM3AuthorFixture", [](jsi::Runtime& rt, jsi::Object& module,
                           const ModuleContext& context) {
      LOG(INFO) << "M3_NATIVE_BUILD=m3-review-20261028-v2";
      auto jsInvoker = context.jsInvoker;
      registerViewConfig(rt, "ExpoM3AuthorFixture", "", {{"label"}, {"onValue"}});
      registerViewConfig(rt, "ExpoM3AuthorFixture", "Named", {{"label"}, {"onValue"}});
      jsi::Object prototypes(rt), prototype(rt);
      prototype.setProperty(rt, "__expoMountView", jsi::Function::createFromHostFunction(
        rt, jsi::PropNameID::forAscii(rt, "__expoMountView"), 0,
        [context](jsi::Runtime& rt, const jsi::Value& receiver, const jsi::Value*, size_t) {
          mountNativeView(rt, receiver, context);
          return jsi::Value::undefined();
        }));
      prototype.setProperty(rt, "__expoUnmountView", jsi::Function::createFromHostFunction(
        rt, jsi::PropNameID::forAscii(rt, "__expoUnmountView"), 0,
        [](jsi::Runtime& rt, const jsi::Value& receiver, const jsi::Value*, size_t) {
          unmountNativeView(rt, receiver);
          return jsi::Value::undefined();
        }));
      prototype.setProperty(rt, "setText", jsi::Function::createFromHostFunction(
        rt, jsi::PropNameID::forAscii(rt, "setText"), 1,
        [executor = context.taskExecutor]
        (jsi::Runtime& rt, const jsi::Value& receiver, const jsi::Value* args, size_t count) {
          if (count != 1 || !args[0].isString() || !receiver.isObject()) {
            throw jsi::JSError(rt, "setText requires a mounted view and a string");
          }
          auto binding = getNativeViewBinding(rt, receiver);
          executor->runTask(rnoh::TaskThread::MAIN,
              [binding, value = args[0].asString(rt).utf8(rt)] {
                try { resolveNativeView(binding)->handleCommand("setText", folly::dynamic::array(value)); }
                catch (const NativeAsyncError&) { /* A queued void command is canceled on unmount. */ }
              });
          return jsi::Value::undefined();
        }));
      prototype.setProperty(rt, "getTextAsync", jsi::Function::createFromHostFunction(
        rt, jsi::PropNameID::forAscii(rt, "getTextAsync"), 1,
        [executor = context.taskExecutor, jsInvoker]
        (jsi::Runtime& rt, const jsi::Value& receiver, const jsi::Value* args, size_t count) {
          if (!receiver.isObject() || count != 1 || !args[0].isNumber() || !std::isfinite(args[0].asNumber()) || args[0].asNumber() < 0 || args[0].asNumber() > 1000) {
            throw jsi::JSError(rt, "getTextAsync requires a view and delay in 0..1000ms");
          }
          auto binding = getNativeViewBinding(rt, receiver);
          auto task = startAsync(rt, jsInvoker,
            [binding, executor, delay = args[0].asNumber()](CancellationSignal) {
              if (delay > 0) std::this_thread::sleep_for(std::chrono::milliseconds(static_cast<int>(delay)));
              std::string text;
              std::exception_ptr error;
              executor->runSyncTask(rnoh::TaskThread::MAIN, [&] {
                try {
                  text = readAuthorFixtureView(resolveNativeView(binding));
                } catch (...) { error = std::current_exception(); }
              });
              if (delay > 0) LOG(INFO) << "M3_NATIVE_VIEW_DELAY_FINISHED invalid=" << static_cast<bool>(error) << " delay=" << delay;
              if (error) std::rethrow_exception(error);
              return [text](jsi::Runtime& rt) { return jsi::String::createFromUtf8(rt, text); };
            });
          return jsi::Value(std::move(task.promise));
        }));
      prototypes.setProperty(rt, "ExpoM3AuthorFixture", prototype);
      prototypes.setProperty(rt, "ExpoM3AuthorFixture_Named", prototype);
      module.setProperty(rt, "ViewPrototypes", prototypes);
      auto counters = std::make_shared<Counters>();
      auto lastResource = std::make_shared<std::weak_ptr<Resource>>();
      auto externalOwner = std::make_shared<std::shared_ptr<Resource>>();
      module.setProperty(rt, "retainLastResource", jsi::Function::createFromHostFunction(
        rt, jsi::PropNameID::forAscii(rt, "retainLastResource"), 0,
        [lastResource, externalOwner](jsi::Runtime& rt, const jsi::Value&, const jsi::Value*, size_t) {
          *externalOwner = lastResource->lock();
          if (!*externalOwner) throw jsi::JSError(rt, "No native resource to retain");
          return jsi::Value::undefined();
        }));
      module.setProperty(rt, "releaseExternalResource", jsi::Function::createFromHostFunction(
        rt, jsi::PropNameID::forAscii(rt, "releaseExternalResource"), 0,
        [externalOwner](jsi::Runtime&, const jsi::Value&, const jsi::Value*, size_t) {
          externalOwner->reset();
          return jsi::Value::undefined();
        }));
      module.setProperty(rt, "failWithCodeAsync", jsi::Function::createFromHostFunction(
        rt, jsi::PropNameID::forAscii(rt, "failWithCodeAsync"), 0,
        [jsInvoker](jsi::Runtime& rt, const jsi::Value&, const jsi::Value*, size_t) {
          auto task = startAsync(rt, jsInvoker, [](CancellationSignal) -> AsyncResult {
            throw NativeAsyncError("ERR_CORE_ASYNC_PROBE", "Typed native failure");
          });
          return jsi::Value(std::move(task.promise));
        }));
      auto lastTask = std::make_shared<AsyncTaskId>(0);
      module.setProperty(rt, "workAsync", jsi::Function::createFromHostFunction(
        rt, jsi::PropNameID::forAscii(rt, "workAsync"), 3,
        [jsInvoker, lastTask](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) {
          if (count != 3 || !args[0].isNumber() || !args[1].isNumber() || !args[2].isBool() ||
              !std::isfinite(args[0].asNumber()) || !std::isfinite(args[1].asNumber()) ||
              args[1].asNumber() < 0 || args[1].asNumber() > 5000) {
            throw jsi::JSError(rt, "Expected value, delay in 0..5000ms, and fail flag");
          }
          const auto value = args[0].asNumber();
          const auto delay = args[1].asNumber();
          const auto fail = args[2].getBool();
          const auto jsThread = std::this_thread::get_id();
          auto task = startAsync(rt, jsInvoker, [value, delay, fail, jsThread](CancellationSignal cancelled) {
            if (std::this_thread::get_id() == jsThread) throw std::runtime_error("Native work ran on JS thread");
            auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(static_cast<int>(delay));
            while (std::chrono::steady_clock::now() < deadline && !cancelled->load()) {
              std::this_thread::sleep_for(std::chrono::milliseconds(1));
            }
            if (delay >= 1000) LOG(INFO) << "M3_NATIVE_DELAY_FINISHED cancelled=" << cancelled->load();
            if (fail) throw std::runtime_error("Requested native failure");
            return [value, jsThread](jsi::Runtime&) {
              if (std::this_thread::get_id() != jsThread) throw std::runtime_error("Result converted outside JS thread");
              return jsi::Value(value);
            };
          });
          *lastTask = task.id;
          return jsi::Value(std::move(task.promise));
        }));
      module.setProperty(rt, "cancelLastAsync", jsi::Function::createFromHostFunction(
        rt, jsi::PropNameID::forAscii(rt, "cancelLastAsync"), 0,
        [lastTask](jsi::Runtime& rt, const jsi::Value&, const jsi::Value*, size_t) {
          return jsi::Value(cancelAsync(rt, *lastTask));
        }));
      module.setProperty(rt, "pendingAsyncCount", jsi::Function::createFromHostFunction(
        rt, jsi::PropNameID::forAscii(rt, "pendingAsyncCount"), 0,
        [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value*, size_t) {
          return jsi::Value(static_cast<double>(getRuntimeState(rt)->pendingAsyncCount()));
        }));
      module.setProperty(rt, "sum", jsi::Function::createFromHostFunction(
        rt, jsi::PropNameID::forAscii(rt, "sum"), 2,
        [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) {
          if (count != 2 || !args[0].isNumber() || !args[1].isNumber() ||
              !std::isfinite(args[0].asNumber()) || !std::isfinite(args[1].asNumber())) throw jsi::JSError(rt, "Expected two finite numbers");
          return jsi::Value(args[0].asNumber() + args[1].asNumber());
        }));
      module.setProperty(rt, "emitValue", jsi::Function::createFromHostFunction(
        rt, jsi::PropNameID::forAscii(rt, "emitValue"), 1,
        [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) {
          if (count != 1 || !args[0].isNumber() || !std::isfinite(args[0].asNumber())) throw jsi::JSError(rt, "Expected a finite event value");
          auto emitter = expo::common::getCoreObject(rt).getPropertyAsObject(rt, "modules").getPropertyAsObject(rt, "ExpoM3AuthorFixture");
          std::vector<jsi::Value> payload;
          payload.emplace_back(args[0].asNumber());
          expo::EventEmitter::emitEvent(rt, emitter, "value", payload);
          return jsi::Value::undefined();
        }));
      module.setProperty(rt, "resourcesAlive", jsi::Function::createFromHostFunction(
        rt, jsi::PropNameID::forAscii(rt, "resourcesAlive"), 0,
        [counters](jsi::Runtime&, const jsi::Value&, const jsi::Value*, size_t) {
          return jsi::Value(counters->alive);
        }));
      auto createResource = [counters, lastResource](bool isRef, jsi::Runtime& rt, const jsi::Value* args, size_t count) {
          if (count != 1 || !args[0].isNumber() || !std::isfinite(args[0].asNumber())) throw jsi::JSError(rt, "Expected finite resource value");
          auto resource = std::make_shared<Resource>(counters, args[0].asNumber());
          *lastResource = resource;
          auto object = (isRef ? expo::SharedRef::getBaseClass(rt) : expo::SharedObject::getBaseClass(rt)).callAsConstructor(rt).asObject(rt);
          attachSharedObject(rt, object, resource);
          object.setProperty(rt, "probeId", static_cast<double>(resource->id));
          std::weak_ptr<Resource> weakResource = resource;
          object.setProperty(rt, "getValue", jsi::Function::createFromHostFunction(
            rt, jsi::PropNameID::forAscii(rt, "getValue"), 0,
            [weakResource](jsi::Runtime& rt, const jsi::Value& receiver, const jsi::Value*, size_t) {
              auto binding = getSharedObjectResource(rt, receiver);
              auto resource = weakResource.lock();
              if (!resource || binding.get() != resource.get()) throw jsi::JSError(rt, "Native resource receiver does not match its binding");
              return jsi::Value(resource->value);
            }));
          return jsi::Value(rt, object);
      };
      for (const auto& entry : {std::pair{"createResource", false}, std::pair{"createRef", true}}) {
        module.setProperty(rt, entry.first, jsi::Function::createFromHostFunction(
          rt, jsi::PropNameID::forAscii(rt, entry.first), 1,
          [createResource, isRef = entry.second](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) {
            return createResource(isRef, rt, args, count);
          }));
      }
  }};
}
} // namespace

ModuleDefinition createExpoM3AuthorFixtureModule() { return createDefinition(); }
} // namespace expo::harmony::m3
