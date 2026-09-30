import { BackHandler, Platform } from "react-native";

export const isSearchBarAvailableForCurrentPlatform = [
  "ios",
  "android",
  "harmony",
].includes(Platform.OS);

export function executeNativeBackPress() {
  // This function invokes the native back press event
  BackHandler.exitApp();
  return true;
}

export const isHeaderBarButtonsAvailableForCurrentPlatform =
  Platform.OS === 'ios';

type OptionalBoolean = 'undefined' | 'false' | 'true';
export function parseBooleanToOptionalBooleanNativeProp(
  prop: boolean | undefined,
): OptionalBoolean {
  if (Platform.OS === 'harmony') {
    return prop as unknown as OptionalBoolean;
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