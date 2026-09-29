"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.executeNativeBackPress = executeNativeBackPress;
exports.isSearchBarAvailableForCurrentPlatform = exports.isHeaderBarButtonsAvailableForCurrentPlatform = void 0;
exports.parseBooleanToOptionalBooleanNativeProp = parseBooleanToOptionalBooleanNativeProp;
var _reactNative = require("react-native");
const isSearchBarAvailableForCurrentPlatform = exports.isSearchBarAvailableForCurrentPlatform = ["ios", "android", "harmony"].includes(_reactNative.Platform.OS);
function executeNativeBackPress() {
  // This function invokes the native back press event
  _reactNative.BackHandler.exitApp();
  return true;
}
const isHeaderBarButtonsAvailableForCurrentPlatform = exports.isHeaderBarButtonsAvailableForCurrentPlatform = _reactNative.Platform.OS === 'ios';
function parseBooleanToOptionalBooleanNativeProp(prop) {
  if (_reactNative.Platform.OS === 'harmony') {
    return prop;
  }
  switch (prop) {
    case undefined:
      return 'undefined';
    case true:
      return 'true';
    case false:
      return 'false';
  }
}
//# sourceMappingURL=utils.js.map