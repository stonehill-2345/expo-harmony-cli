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
    },
  devDependencies: {
    "@ohos/hypium": "1.0.6",
  },
  overrides: {
    "@rnoh/react-native-openharmony": "file:../node_modules/{{{rnohNpmPackageName}}}/react_native_openharmony.har",
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
