"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withFontsHarmony = withFontsHarmony;
const crypto_1 = require("crypto");
const harmony_config_1 = require("expo/harmony-config");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const utils_1 = require("./utils");
const pkg = require('expo-font/package.json');
const sha256 = (bytes) => (0, crypto_1.createHash)('sha256').update(bytes).digest('hex');
function withFontsHarmony(config, fonts) {
    return (0, harmony_config_1.withHarmonyResources)(config, async (mod) => {
        if (!Array.isArray(fonts) || fonts.some(font => typeof font !== 'string' || !font)) {
            throw new Error('Harmony expo-font fonts must be an array of file or directory paths');
        }
        const root = mod.modRequest.projectRoot;
        for (const font of fonts) {
            const source = path_1.default.resolve(root, font);
            if (!(await promises_1.default.stat(source)).isDirectory() && !/\.(ttf|otf)$/.test(source)) {
                throw new Error(`Harmony embedded fonts support TTF/OTF: ${font}`);
            }
        }
        const resources = [];
        const entries = [];
        for (const source of (await (0, utils_1.resolveFontPaths)(fonts, root)).sort()) {
            if (!/\.(ttf|otf)$/.test(source))
                throw new Error(`Harmony embedded fonts support TTF/OTF: ${source}`);
            const bytes = await promises_1.default.readFile(source);
            const magic = bytes.subarray(0, 4).toString('hex');
            if (!['00010000', '4f54544f', '74727565'].includes(magic))
                throw new Error(`Invalid Harmony TTF/OTF font: ${source}`);
            const family = path_1.default.parse(source).name;
            if (entries.some(entry => entry.family === family))
                throw new Error(`Duplicate Harmony embedded font family: ${family}`);
            const target = `fonts/${path_1.default.basename(source)}`;
            const hash = sha256(bytes);
            resources.push({ owner: 'expo-font', packageName: pkg.name, packageVersion: pkg.version,
                source: path_1.default.relative(root, source).split(path_1.default.sep).join('/'), target, sha256: hash });
            entries.push({ family, resource: `expo-font/${target}`, sha256: hash });
        }
        const contents = JSON.stringify(entries) + '\n';
        resources.push({ owner: 'expo-font', packageName: pkg.name, packageVersion: pkg.version,
            target: 'fonts.json', contents, sha256: sha256(contents) });
        mod.modResults.push(...resources);
        return mod;
    });
}
