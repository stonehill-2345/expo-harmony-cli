"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHarmonyProject = isHarmonyProject;
exports.shouldEnableHarmonyMetro = shouldEnableHarmonyMetro;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const resolve_from_1 = __importDefault(require("resolve-from"));
const harmonyPackage = '@react-native-oh/react-native-harmony';
const supportedRelease = {
    release: 'sdk54-expo-oh-harmony.1',
    expo: {
        installName: 'expo',
        publishName: '@expo-oh/expo',
        publishVersion: '54.0.38',
        upstreamVersion: '54.0.37',
        installSpec: 'npm:@expo-oh/expo@54.0.38',
    },
    harmonyVersion: '0.82.30',
};
/** Detect installed release identity without reading CLI-managed state or changing process state. */
function isHarmonyProject(projectRoot) {
    const expoFile = resolve_from_1.default.silent(projectRoot, 'expo/package.json');
    if (!expoFile)
        return false;
    const expo = JSON.parse(fs_1.default.readFileSync(expoFile, 'utf8'));
    if (expo.name !== '@expo-oh/expo')
        return false;
    // Once an adapted Expo package is identified, damaged release metadata is an error.
    // Falling back to official Expo would hide an incomplete or mixed installation.
    const manifestFile = path_1.default.join(path_1.default.dirname(expoFile), 'harmony-release.json');
    let release;
    try {
        release = JSON.parse(fs_1.default.readFileSync(manifestFile, 'utf8'));
    }
    catch (error) {
        throw new Error(`Invalid Harmony release manifest at ${manifestFile}: ${String(error)}`);
    }
    const expoEntries = Array.isArray(release?.packages)
        ? release.packages.filter((item) => item?.installName === 'expo')
        : [];
    const expectedVersion = release?.catalog?.external?.[harmonyPackage];
    if (release?.schemaVersion !== 1 ||
        release.release !== supportedRelease.release ||
        expoEntries.length !== 1 ||
        expo.version !== supportedRelease.expo.publishVersion ||
        Object.entries(supportedRelease.expo).some(([key, value]) => expoEntries[0]?.[key] !== value) ||
        expoEntries[0].publishName !== expo.name ||
        expoEntries[0].publishVersion !== expo.version ||
        expectedVersion !== supportedRelease.harmonyVersion) {
        throw new Error(`Invalid Harmony release identity or pinned RNOH catalog version at ${manifestFile}`);
    }
    const harmonyFile = resolve_from_1.default.silent(projectRoot, `${harmonyPackage}/package.json`);
    if (!harmonyFile)
        return false;
    const harmony = JSON.parse(fs_1.default.readFileSync(harmonyFile, 'utf8'));
    return harmony.name === harmonyPackage && harmony.version === expectedVersion;
}
function shouldEnableHarmonyMetro(projectRoot, platform) {
    return platform === 'harmony' || isHarmonyProject(projectRoot);
}
//# sourceMappingURL=harmonyProject.js.map