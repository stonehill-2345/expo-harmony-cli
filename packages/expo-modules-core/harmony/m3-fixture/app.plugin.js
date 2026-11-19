const { defineHarmonyPlugin, withHarmonyModule } = require('expo/harmony-config');
module.exports = defineHarmonyPlugin(config => withHarmonyModule(config, mod => {
  mod.modResults.metadata = [
    ...(mod.modResults.metadata || []).filter(item => item.name !== 'expo.m3.author-fixture'),
    { name: 'expo.m3.author-fixture', value: '1' },
  ];
  return mod;
}));
