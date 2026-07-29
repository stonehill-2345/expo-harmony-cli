import mustache from 'mustache';

const TEMPLATE = `{
  "name": "entry",
  "version": "1.0.0",
  "description": "Please describe the basic information.",
  "main": "",
  "author": "",
  "license": "",
  "dependencies": {
    "@rnoh/react-native-openharmony": "file:../../node_modules/{{{rnohNpmPackageName}}}/react_native_openharmony.har"
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
