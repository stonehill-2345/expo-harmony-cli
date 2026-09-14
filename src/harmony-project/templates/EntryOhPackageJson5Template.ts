import mustache from 'mustache';
import type { SdkVersion } from '../../version-matrix';

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
    "@react-native-ohos/react-native-svg": "file:../../node_modules/@react-native-ohos/react-native-svg/harmony/svg.har"{{#includeWorklets}},
    "@react-native-ohos/react-native-worklets": "file:../../node_modules/@react-native-ohos/react-native-worklets/harmony/worklets.har"{{/includeWorklets}}
  }
}
`;

export class EntryOhPackageJson5Template {
  constructor(private rnohNpmPackageName: string, private sdk: SdkVersion = 'sdk-54') {}

  build(): string {
    return mustache.render(TEMPLATE, {
      rnohNpmPackageName: this.rnohNpmPackageName,
      includeWorklets: this.sdk === 'sdk-54',
    });
  }
}
