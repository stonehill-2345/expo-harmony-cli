const fs = require('node:fs');
const { withMod } = require('@expo/config-plugins');
const {
  defineHarmonyPlugin,
  resolveHarmonyConfig,
  withHarmonyApp,
  withHarmonyModule,
} = require('expo/harmony-config');

module.exports = defineHarmonyPlugin((config, options = {}) => {
  if (process.env.M1_EXPECTED_SNAPSHOT) {
    fs.writeFileSync(
      process.env.M1_EXPECTED_SNAPSHOT,
      JSON.stringify(resolveHarmonyConfig(config).expoConfig)
    );
  }
  config = withHarmonyApp(config, async (mod) => {
    fs.appendFileSync(process.env.M1_MOD_TRACE, 'harmony.app\n');
    if (options.case === 'failure') throw new Error('M1_FIXTURE_MOD_FAILURE');
    if (options.case === 'identity-drift') mod.modResults.bundleName = 'com.fixture.drift';
    if (options.case === 'non-json') mod.modResults.invalid = () => true;
    mod.modResults.vendor = 'm1-third-party';
    return mod;
  });
  config = withHarmonyModule(config, (mod) => {
    fs.appendFileSync(process.env.M1_MOD_TRACE, 'harmony.module\n');
    mod.modResults.metadata = [{ name: 'm1.fixture', value: 'applied' }];
    return mod;
  });
  for (const platform of ['ios', 'android']) {
    config = withMod(config, {
      platform,
      mod: 'dangerous',
      action: () => {
        throw new Error(`M1_WRONG_PLATFORM_EXECUTED:${platform}`);
      },
    });
  }
  return config;
});
