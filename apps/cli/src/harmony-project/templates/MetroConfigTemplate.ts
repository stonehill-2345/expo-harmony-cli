import mustache from 'mustache';

const TEMPLATE = `
const {mergeConfig, getDefaultConfig} = require('@react-native/metro-config');
const {
  createHarmonyMetroConfig,
} = require('{{{reactNativeHarmonyPackageName}}}/metro.config');

/**
 * @type {import("metro-config").MetroConfig}
 */
const config = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(
  getDefaultConfig(__dirname),
  createHarmonyMetroConfig({
    reactNativeHarmonyPackageName: '{{{reactNativeHarmonyPackageName}}}',
  }),
  config,
);

`;

export class MetroConfigTemplate {
  constructor(private reactNativeHarmonyPackageName: string) {}

  build(): string {
    return mustache.render(TEMPLATE.trimStart(), {
      reactNativeHarmonyPackageName: this.reactNativeHarmonyPackageName,
    });
  }
}
