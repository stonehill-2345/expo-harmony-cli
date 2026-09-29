"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var React = _interopRequireWildcard(require("react"));
var _reactNative = require("react-native");
var _warnOnce = _interopRequireDefault(require("warn-once"));
var _ScreenStackHeaderConfig = require("./ScreenStackHeaderConfig");
var _Screen = _interopRequireDefault(require("./Screen"));
var _ScreenStack = _interopRequireDefault(require("./ScreenStack"));
var _contexts = require("react-native-screens/src/contexts");
var _ScreenFooter = require("./ScreenFooter");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ScreenStackItem({
  children,
  headerConfig,
  activityState,
  shouldFreeze,
  stackPresentation,
  contentStyle,
  style,
  screenId,
  // eslint-disable-next-line camelcase
  unstable_sheetFooter,
  ...rest
}, ref) {
  const currentScreenRef = React.useRef(null);
  const screenRefs = React.useContext(_contexts.RNSScreensRefContext);
  React.useImperativeHandle(ref, () => currentScreenRef.current);
  const isHeaderInModal = _reactNative.Platform.OS === 'android' ? false : stackPresentation !== 'push' && headerConfig?.hidden === false;
  // : stackPresentation !== 'push' && headerConfig?.headerShown === true && headerConfig?.hidden === false;

  const headerHiddenPreviousRef = React.useRef(headerConfig?.hidden);
  React.useEffect(() => {
    (0, _warnOnce.default)(_reactNative.Platform.OS !== 'android' && stackPresentation !== 'push' && headerHiddenPreviousRef.current !== headerConfig?.hidden, `Dynamically changing header's visibility in modals will result in remounting the screen and losing all local state.`);
    headerHiddenPreviousRef.current = headerConfig?.hidden;
  }, [headerConfig?.hidden, stackPresentation]);
  const content = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(_reactNative.View, {
    collapsable: false,
    style: [stackPresentation === 'formSheet' ? _reactNative.Platform.OS === 'ios' ? styles.absolute : null : styles.container]
  }, /*#__PURE__*/React.createElement(_reactNative.View, {
    style: [stackPresentation === 'formSheet' ? _reactNative.Platform.OS === 'ios' ? styles.absolute : null : styles.container, contentStyle]
  }, children)), /*#__PURE__*/React.createElement(_ScreenStackHeaderConfig.ScreenStackHeaderConfig, headerConfig), stackPresentation === 'formSheet' && unstable_sheetFooter && /*#__PURE__*/React.createElement(_ScreenFooter.FooterComponent, null, unstable_sheetFooter()));

  // We take backgroundColor from contentStyle and apply it on Screen.
  // This allows to workaround one issue with truncated
  // content with formSheet presentation.
  let internalScreenStyle;
  if (contentStyle) {
    const flattenContentStyles = _reactNative.StyleSheet.flatten(contentStyle);
    if (flattenContentStyles?.backgroundColor !== undefined) {
      internalScreenStyle = {
        backgroundColor: flattenContentStyles.backgroundColor
      };
    }
  }
  return /*#__PURE__*/React.createElement(_Screen.default, _extends({
    ref: node => {
      currentScreenRef.current = node;
      if (screenRefs === null) {
        console.warn('Looks like RNSScreensRefContext is missing. Make sure the ScreenStack component is wrapped in it');
        return;
      }
      const currentRefs = screenRefs.current;
      if (node === null) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete currentRefs[screenId];
      } else {
        currentRefs[screenId] = {
          current: node
        };
      }
    },
    screenId,
    enabled: true,
    isNativeStack: true,
    activityState: activityState,
    shouldFreeze: shouldFreeze,
    stackPresentation: stackPresentation,
    hasLargeHeader: headerConfig?.largeTitle ?? false,
    style: [style, internalScreenStyle]
  }, rest), isHeaderInModal ? /*#__PURE__*/React.createElement(_ScreenStack.default, {
    style: styles.container
  }, /*#__PURE__*/React.createElement(_Screen.default, {
    enabled: true,
    isNativeStack: true,
    activityState: activityState,
    shouldFreeze: shouldFreeze,
    hasLargeHeader: headerConfig?.largeTitle ?? false,
    style: _reactNative.StyleSheet.absoluteFill
  }, content)) : content);
}
const ScreenStackItemWithRef = /*#__PURE__*/React.forwardRef(ScreenStackItem);
ScreenStackItemWithRef.displayName = 'ScreenStackItem';
var _default = exports.default = ScreenStackItemWithRef;
const styles = _reactNative.StyleSheet.create({
  container: {
    flex: 1
  },
  absolute: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0
  }
});
//# sourceMappingURL=ScreenStackItem.js.map