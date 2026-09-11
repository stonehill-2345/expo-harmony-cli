import mustache from 'mustache';

const TEMPLATE = `
{
  name: "example-name",
  description: "example description",
  version: "1.0.0",
  modelVersion: "5.0.0",
  license: "ISC",
  repository: {},
  dependencies: {
    "@rnoh/react-native-openharmony": "file:../node_modules/{{{rnohNpmPackageName}}}/react_native_openharmony.har",
    "@react-native-ohos/react-native-gesture-handler": "file:../node_modules/@react-native-ohos/react-native-gesture-handler/harmony/gesture_handler.har",
    "@react-native-ohos/react-native-reanimated": "file:../node_modules/@react-native-ohos/react-native-reanimated/harmony/reanimated.har",
    "@react-native-ohos/react-native-safe-area-context": "file:../node_modules/@react-native-ohos/react-native-safe-area-context/harmony/safe_area.har",
    "@react-native-ohos/react-native-screens": "file:../node_modules/@react-native-ohos/react-native-screens/harmony/screens.har",
    "@react-native-ohos/react-native-svg": "file:../node_modules/@react-native-ohos/react-native-svg/harmony/svg.har",
    "@react-native-ohos/react-native-worklets": "file:../node_modules/@react-native-ohos/react-native-worklets/harmony/worklets.har",
  },
  devDependencies: {
    "@ohos/hypium": "1.0.6",
  },
  overrides: {
    "@rnoh/react-native-openharmony": "file:../node_modules/{{{rnohNpmPackageName}}}/react_native_openharmony.har",
    "@react-native-ohos/react-native-worklets": "file:../node_modules/@react-native-ohos/react-native-worklets/harmony/worklets.har",
  },
}
`;

export class OhPackageJson5Template {
  constructor(private rnohNpmPackageName: string) {}

  build(): string {
    return mustache.render(TEMPLATE.trimStart(), {
      rnohNpmPackageName: this.rnohNpmPackageName,
    });
  }
}
