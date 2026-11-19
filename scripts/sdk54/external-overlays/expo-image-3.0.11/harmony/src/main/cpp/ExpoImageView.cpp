#include "ExpoImagePackage.h"
#include "ExpoImageProps.h"
#include "ImageRequest.h"
#include "RNOH/CppComponentInstance.h"
#include "RNOH/RNInstanceInternal.h"
#include "RNOH/arkui/ImageNode.h"
#include "RNOH/arkui/StackNode.h"
#include "RNOHCorePackage/ComponentBinders/ViewComponentJSIBinder.h"
#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <folly/dynamic.h>

namespace expo::image::harmony {
namespace react = facebook::react;
namespace jsi = facebook::jsi;
namespace {
const char componentName[] = "ViewManagerAdapter_ExpoImage";
class ImageProps final : public react::ViewProps {
public:
  ImageProps() = default;
  ImageProps(const react::PropsParserContext& context, const ImageProps& source, const react::RawProps& raw)
      : react::ViewProps(context, source, raw), values(source.values) {
    const auto update = static_cast<folly::dynamic>(raw);
    for (const auto& item : update.items()) values[item.first] = item.second;
  }
  folly::dynamic values = folly::dynamic::object();
};
using ShadowNode = react::ConcreteViewShadowNode<componentName, ImageProps>;
using Descriptor = react::ConcreteComponentDescriptor<ShadowNode>;

// A node is never reused across sources: events from a removed source cannot
// accidentally be attributed to the replacement request.
class LoadingImage final : public rnoh::ImageNode, public rnoh::ImageNodeDelegate {
public:
  LoadingImage(const rnoh::ArkUINode::Context::Shared& context, uint64_t generation,
               std::function<void(uint64_t, const std::string&, folly::dynamic)> emit)
      : ImageNode(context), generation_(generation), emit_(std::move(emit)) {
    setNodeDelegate(this);setDraggable(false);setOrientationAuto();
  }
  ~LoadingImage() override { setNodeDelegate(nullptr); }
  void onComplete(float width, float height) override {
    emit_(generation_, "load", folly::dynamic::object("width", width)("height", height));
  }
  void onError(int32_t code) override {
    emit_(generation_, "error", folly::dynamic::object("error", "ERR_IMAGE_LOAD: ArkUI " + std::to_string(code)));
  }
  void onProgress(uint32_t loaded, uint32_t total) override {
    emit_(generation_, "progress", folly::dynamic::object("loaded", loaded)("total", total));
  }
private:
  uint64_t generation_;
  std::function<void(uint64_t, const std::string&, folly::dynamic)> emit_;
};

class ImageComponent final : public rnoh::CppComponentInstance<ShadowNode> {
  using Base = rnoh::CppComponentInstance<ShadowNode>;
public:
  explicit ImageComponent(Context context) : Base(std::move(context)), root_(m_arkUINodeCtx) {
    root_.setClip(true);
  }
  ~ImageComponent() override { clearImage(); }
  rnoh::StackNode& getLocalRootArkUINode() override { return root_; }
  void onPropsChanged(SharedConcreteProps const& props) override { Base::onPropsChanged(props);pending_ = true; }
  void onLayoutChanged(const react::LayoutMetrics& layout) override {
    Base::onLayoutChanged(layout);
    if (image_) image_->setSize(layout.frame.size);
  }
  void onFinalizeUpdates() override {
    Base::onFinalizeUpdates();
    if (!pending_ || !m_eventEmitter) return;
    pending_ = false;
    applySource(false);
  }
  void handleCommand(const std::string& command, const folly::dynamic&) override {
    if (command != "reloadAsync") throw std::invalid_argument("ERR_IMAGE_UNSUPPORTED: " + command);
    applySource(true);
  }
private:
  std::string assetPrefix() const {
    const auto instance = m_deps->rnInstance.lock();
    if (!instance) throw std::runtime_error("ERR_IMAGE_RUNTIME: runtime destroyed");
    const auto bundle = instance->getBundlePath();
    if (bundle.starts_with('/') && bundle.rfind('/') != std::string::npos) return "file://" + bundle.substr(0, bundle.rfind('/') + 1);
    const auto hsp = instance->getHspModuleName();
    return hsp.empty() ? "resource://RAWFILE/assets/" : "file:///data/storage/el1/bundle/" + hsp + "/resources/resfile/assets/";
  }
  void clearImage() {
    request_.cancel();
    if (image_) { root_.removeChild(*image_);image_.reset(); }
  }
  void emit(const std::string& name, folly::dynamic payload) {
    if (m_eventEmitter) m_eventEmitter->dispatchEvent(name, std::move(payload));
  }
  react::ImageResizeMode resizeMode() const {
    const auto fit = m_props->values.getDefault("contentFit", "cover");
    if (fit == "contain") return react::ImageResizeMode::Contain;
    if (fit == "fill") return react::ImageResizeMode::Stretch;
    if (fit == "cover") return react::ImageResizeMode::Cover;
    throw std::invalid_argument("ERR_IMAGE_UNSUPPORTED: contentFit supports cover, contain and fill");
  }
  std::string validateSource() const {
    const auto& values = m_props->values;
    const auto sources = values.getDefault("source", folly::dynamic::array());
    if (sources.isNull() || (sources.isArray() && sources.empty())) return "";
    if (!sources.isArray() || sources.size() != 1 || !sources[0].isObject()) {
      throw std::invalid_argument("ERR_IMAGE_UNSUPPORTED: expected one URI source; ImageRef and multiple sources are not implemented");
    }
    const auto uri = sources[0].getDefault("uri", nullptr);
    if (!uri.isString()) throw std::invalid_argument("ERR_IMAGE_SOURCE: source.uri must be a string");
    for (const auto* key : {"headers", "cacheKey", "blurhash", "thumbhash"}) {
      if (sources[0].count(key) && !sources[0][key].isNull()) throw std::invalid_argument(std::string("ERR_IMAGE_UNSUPPORTED: source.") + key);
    }
    for (const auto* key : {"cachePolicy", "priority", "placeholderContentFit", "autoplay", "decodeFormat", "allowDownscaling", "enableLiveTextInteraction", "useAppleWebpCodec", "enforceEarlyResizing"}) {
      if (values.count(key) && !values[key].isNull()) throw std::invalid_argument(std::string("ERR_IMAGE_UNSUPPORTED: ") + key);
    }
    const auto placeholder = values.getDefault("placeholder", nullptr);
    if (!placeholder.isNull() && (!placeholder.isArray() || !placeholder.empty())) throw std::invalid_argument("ERR_IMAGE_UNSUPPORTED: placeholder");
    const auto position = values.getDefault("contentPosition", nullptr);
    if (!position.isNull() && position != folly::dynamic::object("top", "50%")("left", "50%")) throw std::invalid_argument("ERR_IMAGE_UNSUPPORTED: non-centered contentPosition");
    for (const auto* key : {"transition", "tintColor", "blurRadius"}) {
      if (values.count(key) && !values[key].isNull() && values[key] != 0) throw std::invalid_argument(std::string("ERR_IMAGE_UNSUPPORTED: ") + key);
    }
    resizeMode();
    return resolvePngUri(uri.asString(), assetPrefix());
  }
  void applySource(bool force) {
    const auto& values = m_props->values;
    std::string resolved, error;
    try { resolved = validateSource(); } catch (const std::exception& failure) { error = failure.what(); }
    const auto sources = values.getDefault("source", nullptr);
    // RawProps object member order can change between updates. Compare values,
    // so changing contentFit does not reload an otherwise identical source.
    const auto key = folly::dynamic::array(sources, values.getDefault("recyclingKey", nullptr), error);
    if (!force && key == sourceKey_) {
      if (image_ && error.empty()) image_->setResizeMode(resizeMode());
      return;
    }
    sourceKey_ = key;
    clearImage();
    if (resolved.empty() && error.empty()) return;
    emit("loadStart", folly::dynamic::object());
    if (!error.empty()) { emit("error", folly::dynamic::object("error", error));return; }
    const auto generation = request_.begin();
    const auto url = sources[0]["uri"].asString();
    image_ = std::make_unique<LoadingImage>(m_arkUINodeCtx, generation,
      [this, url](uint64_t token, const std::string& name, folly::dynamic payload) {
        if (!request_.accepts(token)) return;
        if (name == "load") {
          if (!request_.finish(token)) return;
          payload["url"] = url;
          payload["mediaType"] = nullptr; // ArkUI does not report decoded MIME type here.
          emit("load", folly::dynamic::object("cacheType", "none")("source", payload));
          emit("display", folly::dynamic::object());
        } else {
          if (name == "error" && !request_.finish(token)) return;
          emit(name, payload);
        }
      });
    image_->setSize(m_layoutMetrics.frame.size).setPosition({0, 0});
    image_->setResizeMode(resizeMode());
    root_.addChild(*image_);
    image_->setSource(resolved);
  }
  rnoh::StackNode root_;
  std::unique_ptr<LoadingImage> image_;
  ImageRequest request_;
  folly::dynamic sourceKey_ = nullptr;
  bool pending_ = true;
};

class ImageBinder final : public rnoh::ViewComponentJSIBinder {
  jsi::Object createNativeProps(jsi::Runtime& runtime) override {
    auto result = ViewComponentJSIBinder::createNativeProps(runtime);
    for (const auto* name : props) result.setProperty(runtime, name, true);
    for (const auto* name : events) result.setProperty(runtime, name, true);
    return result;
  }
  jsi::Object createDirectEventTypes(jsi::Runtime& runtime) override {
    auto result = ViewComponentJSIBinder::createDirectEventTypes(runtime);
    for (const auto* name : events) result.setProperty(runtime, ("top" + std::string(name).substr(2)).c_str(), createDirectEvent(runtime, name));
    return result;
  }
};
}
std::vector<react::ComponentDescriptorProvider> ExpoImagePackage::createComponentDescriptorProviders() {
  return {react::concreteComponentDescriptorProvider<Descriptor>()};
}
rnoh::ComponentInstance::Shared ExpoImagePackage::createComponentInstance(const rnoh::ComponentInstance::Context& context) {
  return context.componentName == componentName ? std::make_shared<ImageComponent>(context) : nullptr;
}
rnoh::ComponentJSIBinderByString ExpoImagePackage::createComponentJSIBinderByName() {
  return {{componentName, std::make_shared<ImageBinder>()}};
}
}
