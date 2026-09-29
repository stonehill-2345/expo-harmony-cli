import { BackHandler, Platform } from "react-native";
export const isSearchBarAvailableForCurrentPlatform = ["ios", "android", "harmony"].includes(Platform.OS);
export function executeNativeBackPress() {
  // This function invokes the native back press event
  BackHandler.exitApp();
  return true;
}
export const isHeaderBarButtonsAvailableForCurrentPlatform = Platform.OS === 'ios';
export function parseBooleanToOptionalBooleanNativeProp(prop) {
  if (Platform.OS === 'harmony') {
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