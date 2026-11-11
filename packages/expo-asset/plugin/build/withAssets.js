"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_plugins_1 = require("expo/config-plugins");
const withAssetsAndroid_1 = require("./withAssetsAndroid");
const withAssetsIos_1 = require("./withAssetsIos");
const withAssetsHarmony_1 = require("./withAssetsHarmony");
const pkg = require('expo-asset/package.json');
const withAssets = (config, props) => {
    var _a, _b, _c;
    config = (0, withAssetsHarmony_1.withAssetsHarmony)(config, (_a = props === null || props === void 0 ? void 0 : props.assets) !== null && _a !== void 0 ? _a : []);
    if (!props) {
        return config;
    }
    if (props.assets && props.assets.length === 0) {
        return config;
    }
    config = (0, withAssetsIos_1.withAssetsIos)(config, (_b = props.assets) !== null && _b !== void 0 ? _b : []);
    config = (0, withAssetsAndroid_1.withAssetsAndroid)(config, (_c = props.assets) !== null && _c !== void 0 ? _c : []);
    return config;
};
exports.default = Object.assign((0, config_plugins_1.createRunOncePlugin)(withAssets, pkg.name, pkg.version), {
    harmony: { platforms: ['harmony', 'ios', 'android'] },
});
