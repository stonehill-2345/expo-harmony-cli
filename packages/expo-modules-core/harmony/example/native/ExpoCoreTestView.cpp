#include "ExpoCoreTestView.h"
#include "RNOH/CppComponentInstance.h"
#include "RNOH/arkui/TextNode.h"
#include "RNOHCorePackage/ComponentBinders/ViewComponentJSIBinder.h"
#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/components/view/conversions.h>
#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <react/renderer/core/propsConversions.h>

namespace expo::harmony::testing {
namespace react = facebook::react;
namespace jsi = facebook::jsi;
namespace {
const char probeName[] = "ViewManagerAdapter_ExpoCoreTest";
const char namedProbeName[] = "ViewManagerAdapter_ExpoCoreTest_Named";

class ProbeProps final : public react::ViewProps {
public:
  ProbeProps() = default;
  ProbeProps(const react::PropsParserContext& context, const ProbeProps& source,
             const react::RawProps& rawProps)
      : react::ViewProps(context, source, rawProps),
        label(react::convertRawProp(context, rawProps, "label", source.label, std::string{})) {}
  std::string label;
};
using ProbeShadowNode = react::ConcreteViewShadowNode<probeName, ProbeProps>;
using ProbeDescriptor = react::ConcreteComponentDescriptor<ProbeShadowNode>;
using NamedProbeShadowNode = react::ConcreteViewShadowNode<namedProbeName, ProbeProps>;
using NamedProbeDescriptor = react::ConcreteComponentDescriptor<NamedProbeShadowNode>;

class ReadableTextNode final : public rnoh::TextNode {
public:
  using TextNode::TextNode;
  std::string readText() const {
    const auto& attribute = getAttribute(NODE_TEXT_CONTENT);
    return attribute.string ? std::string(attribute.string) : std::string{};
  }
};
class TextReader {
public:
  virtual ~TextReader() = default;
  virtual std::string readText() const = 0;
};

template <typename ShadowNode>
class ProbeComponent final : public rnoh::CppComponentInstance<ShadowNode>, public TextReader {
  using Base = rnoh::CppComponentInstance<ShadowNode>;
public:
  using Context = typename Base::Context;
  using SharedConcreteProps = typename Base::SharedConcreteProps;
  explicit ProbeComponent(Context context)
      : Base(std::move(context)), node_(this->m_arkUINodeCtx) {
    node_.setFontSize(22).setFontColor(0xff174a7e);
  }
  rnoh::TextNode& getLocalRootArkUINode() override { return node_; }
  std::string readText() const override { return node_.readText(); }
  void onPropsChanged(SharedConcreteProps const& props) override {
    auto previous = this->m_props;
    Base::onPropsChanged(props);
    if (previous->label != props->label) {
      text_ = props->label;
      node_.setTextContent(text_);
      pendingEvent_ = true;
    }
  }
  void onFinalizeUpdates() override {
    Base::onFinalizeUpdates();
    if (pendingEvent_ && this->m_eventEmitter) {
      pendingEvent_ = false;
      emitValue();
    }
  }
  void handleCommand(const std::string& command, const folly::dynamic& args) override {
    if (command == "setText" && args.isArray() && args.size() == 1 && args[0].isString()) {
      text_ = args[0].asString();
      node_.setTextContent(text_);
      emitValue();
      return;
    }
    throw std::invalid_argument("Unknown Expo Core probe command");
  }
private:
  void emitValue() {
    if (this->m_eventEmitter) this->m_eventEmitter->dispatchEvent("value", folly::dynamic::object("value", text_));
  }
  ReadableTextNode node_;
  std::string text_;
  bool pendingEvent_ = false;
};

class ProbeBinder final : public rnoh::ViewComponentJSIBinder {
  jsi::Object createNativeProps(jsi::Runtime& runtime) override {
    auto props = ViewComponentJSIBinder::createNativeProps(runtime);
    props.setProperty(runtime, "label", true);
    props.setProperty(runtime, "onValue", true);
    return props;
  }
  jsi::Object createDirectEventTypes(jsi::Runtime& runtime) override {
    auto events = ViewComponentJSIBinder::createDirectEventTypes(runtime);
    events.setProperty(runtime, "topValue", createDirectEvent(runtime, "onValue"));
    return events;
  }
};
}
std::string readExpoCoreTestView(const rnoh::ComponentInstance::Shared& view) {
  auto reader = std::dynamic_pointer_cast<TextReader>(view);
  if (!reader) throw std::runtime_error("Unexpected native view type");
  return reader->readText();
}
std::vector<react::ComponentDescriptorProvider>
ExpoCoreTestViewPackage::createComponentDescriptorProviders() {
  return {react::concreteComponentDescriptorProvider<ProbeDescriptor>(),
          react::concreteComponentDescriptorProvider<NamedProbeDescriptor>()};
}
rnoh::ComponentInstance::Shared ExpoCoreTestViewPackage::createComponentInstance(
    const rnoh::ComponentInstance::Context& context) {
  if (context.componentName == probeName) return std::make_shared<ProbeComponent<ProbeShadowNode>>(context);
  if (context.componentName == namedProbeName) return std::make_shared<ProbeComponent<NamedProbeShadowNode>>(context);
  return nullptr;
}
rnoh::ComponentJSIBinderByString ExpoCoreTestViewPackage::createComponentJSIBinderByName() {
  return {{probeName, std::make_shared<ProbeBinder>()}, {namedProbeName, std::make_shared<ProbeBinder>()}};
}
}
