"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_plugins_1 = require("expo/config-plugins");
const withFontsAndroid_1 = require("./withFontsAndroid");
const withFontsIos_1 = require("./withFontsIos");
const withFontsHarmony_1 = require("./withFontsHarmony");
const pkg = require('expo-font/package.json');
const withFonts = (config, props) => {
    var _a, _b, _c, _d, _e, _f, _g;
    config = (0, withFontsHarmony_1.withFontsHarmony)(config, (_a = props === null || props === void 0 ? void 0 : props.fonts) !== null && _a !== void 0 ? _a : []);
    if (!props) {
        return config;
    }
    const iosFonts = [...((_b = props.fonts) !== null && _b !== void 0 ? _b : []), ...((_d = (_c = props.ios) === null || _c === void 0 ? void 0 : _c.fonts) !== null && _d !== void 0 ? _d : [])];
    if (iosFonts.length > 0) {
        config = (0, withFontsIos_1.withFontsIos)(config, iosFonts);
    }
    const androidFonts = [...((_e = props.fonts) !== null && _e !== void 0 ? _e : []), ...((_g = (_f = props.android) === null || _f === void 0 ? void 0 : _f.fonts) !== null && _g !== void 0 ? _g : [])];
    if (androidFonts.length > 0) {
        config = (0, withFontsAndroid_1.withFontsAndroid)(config, androidFonts);
    }
    return config;
};
exports.default = Object.assign((0, config_plugins_1.createRunOncePlugin)(withFonts, pkg.name, pkg.version), {
    harmony: { platforms: ['harmony', 'ios', 'android'] },
});
