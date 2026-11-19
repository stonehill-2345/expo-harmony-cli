const { withMod } = require('@expo/config-plugins');
const { defineHarmonyPlugin } = require('expo/harmony-config');
module.exports = defineHarmonyPlugin(
  (config) =>
    withMod(config, {
      platform: 'android',
      mod: 'dangerous',
      action: () => {
        throw new Error('M1_ANDROID_ONLY_MOD_EXECUTED');
      },
    }),
  { platforms: ['android'] }
);
