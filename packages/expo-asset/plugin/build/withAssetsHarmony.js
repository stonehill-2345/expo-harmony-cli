"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withAssetsHarmony = withAssetsHarmony;
const crypto_1 = require("crypto");
const harmony_config_1 = require("expo/harmony-config");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const utils_1 = require("./utils");
const pkg = require('expo-asset/package.json');
function withAssetsHarmony(config, assets) {
    return (0, harmony_config_1.withHarmonyResources)(config, async (mod) => {
        if (!Array.isArray(assets) || assets.some(asset => typeof asset !== 'string' || !asset)) {
            throw new Error('Harmony expo-asset assets must be an array of file or directory paths');
        }
        const root = mod.modRequest.projectRoot;
        for (const source of (await (0, utils_1.resolveAssetPaths)(assets, root)).sort()) {
            const extension = path_1.default.extname(source);
            if (!utils_1.ACCEPTED_TYPES.includes(extension) || utils_1.FONT_TYPES.includes(extension)) {
                throw new Error(`Unsupported Harmony embedded asset type: ${source}; use expo-font for fonts`);
            }
            const bytes = await promises_1.default.readFile(source);
            mod.modResults.push({ owner: 'expo-asset', packageName: pkg.name, packageVersion: pkg.version,
                source: path_1.default.relative(root, source).split(path_1.default.sep).join('/'), target: path_1.default.basename(source),
                sha256: (0, crypto_1.createHash)('sha256').update(bytes).digest('hex') });
        }
        return mod;
    });
}
