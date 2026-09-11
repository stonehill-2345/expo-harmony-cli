import mustache from 'mustache';

const TEMPLATE = `{
  "name": "entry",
  "version": "1.0.0",
  "description": "Please describe the basic information.",
  "main": "",
  "author": "",
  "license": "",
  "dependencies": {
    "@rnoh/react-native-openharmony": "file:../../node_modules/{{{rnohNpmPackageName}}}/react_native_openharmony.har",
    "@react-native-ohos/react-native-gesture-handler": "file:../../node_modules/@react-native-ohos/react-native-gesture-handler/harmony/gesture_handler.har",
    "@react-native-ohos/react-native-reanimated": "file:../../node_modules/@react-native-ohos/react-native-reanimated/harmony/reanimated.har",
    "@react-native-ohos/react-native-safe-area-context": "file:../../node_modules/@react-native-ohos/react-native-safe-area-context/harmony/safe_area.har",
    "@react-native-ohos/react-native-screens": "file:../../node_modules/@react-native-ohos/react-native-screens/harmony/screens.har",
    "@react-native-ohos/react-native-svg": "file:../../node_modules/@react-native-ohos/react-native-svg/harmony/svg.har",
    "@react-native-ohos/react-native-worklets": "file:../../node_modules/@react-native-ohos/react-native-worklets/harmony/worklets.har"
  }
}
`;

export class EntryOhPackageJson5Template {
  constructor(private rnohNpmPackageName: string) {}

  build(): string {
    return mustache.render(TEMPLATE, {
      rnohNpmPackageName: this.rnohNpmPackageName,
    });
  }
}
