const { defineHarmonyPlugin } = require('expo/harmony-config');
const plugin = require('./plugin/build');

// Router's native config mod is iOS-only; JS router options still run on every platform.
module.exports = defineHarmonyPlugin(plugin.default ?? plugin, { platforms: ['ios', 'android'] });
