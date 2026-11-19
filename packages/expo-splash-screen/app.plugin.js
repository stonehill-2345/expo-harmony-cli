const { defineHarmonyPlugin, withHarmonyModule } = require('expo/harmony-config');
const plugin = require('./plugin/build/withSplashScreen');

module.exports = defineHarmonyPlugin((config, props) => {
  config = (plugin.default ?? plugin)(config, props);
  const splash = { ...config.splash };
  for (const key of ['image', 'backgroundColor', 'imageWidth', 'resizeMode', 'dark']) {
    if (props?.[key] !== undefined) splash[key] = props[key];
  }
  config.harmony = {
    ...config.harmony,
    splash: { ...splash, ...config.harmony?.splash },
  };
  return withHarmonyModule(config, mod => {
    const entry = mod.modResults.abilities?.find(ability => ability.name === 'EntryAbility');
    if (!entry) throw new Error('expo-splash-screen requires Harmony EntryAbility');
    entry.startWindowIcon = '$media:startIcon';
    entry.startWindowBackground = '$color:start_window_background';
    return mod;
  });
}, { platforms: ['harmony', 'ios', 'android'] });
