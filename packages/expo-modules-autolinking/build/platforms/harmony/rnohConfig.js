"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverRnohHarmonyConfigAsync = discoverRnohHarmonyConfigAsync;
var fs_1 = require("fs");
var path_1 = require("path");
var ExpoModuleConfig_1 = require("../../ExpoModuleConfig");
var NAVIGATION_COMPATIBILITY = {
    '@react-native-ohos/react-native-screens': {
        version: '4.9.0',
        harName: 'screens.har',
        cppPackageClass: 'ScreensPackage',
        cppHeader: 'ScreensPackage.h',
        cmakeTarget: 'rnoh_screens',
        etsPackageClass: 'RNOHScreensPackage',
        etsImportPath: '@react-native-ohos/react-native-screens',
        importKind: 'default',
        transform: 'screens-content-wrapper-v1',
    },
    '@react-native-ohos/react-native-safe-area-context': {
        version: '5.6.3',
        harName: 'safe_area.har',
        cppPackageClass: 'rnoh::SafeAreaViewPackage',
        cppHeader: 'SafeAreaViewPackage.h',
        cmakeTarget: 'rnoh_safe_area',
        etsPackageClass: 'SafeAreaViewPackage',
        etsImportPath: '@react-native-ohos/react-native-safe-area-context/ts',
        importKind: 'named',
    },
    '@react-native-ohos/react-native-gesture-handler': {
        version: '2.30.1',
        harName: 'gesture_handler.har',
        cppPackageClass: 'rnoh::GestureHandlerPackage',
        cppHeader: 'GestureHandlerPackage.h',
        cmakeTarget: 'rnoh_gesture_handler',
        etsPackageClass: 'GestureHandlerPackage',
        etsImportPath: '@react-native-ohos/react-native-gesture-handler',
        importKind: 'default',
    },
    '@react-native-ohos/react-native-worklets': {
        version: '1.0.0',
        harName: 'worklets.har',
        cppPackageClass: 'rnoh::ReanimatedWorkletPackage',
        cppHeader: 'ReanimatedWorkletPackage.h',
        cmakeTarget: 'rnoh_worklets',
        etsPackageClass: 'ReanimatedWorkletPackage',
        etsImportPath: '@react-native-ohos/react-native-worklets/ts',
        importKind: 'named',
        transform: 'worklets-private-symbols-v2',
    },
    '@react-native-ohos/react-native-reanimated': {
        version: '4.0.1',
        harName: 'reanimated.har',
        cppPackageClass: 'rnoh::ReanimatedPackage',
        cppHeader: 'ReanimatedPackage.h',
        cmakeTarget: 'rnoh_reanimated',
        etsPackageClass: 'ReanimatedPackage',
        etsImportPath: '@react-native-ohos/react-native-reanimated/ts',
        importKind: 'named',
    },
};
function createNavigationCompatibilityConfig(packageRoot, packageJson) {
    var nativePackageName = packageJson.name === '@expo-oh/react-native-screens'
        ? '@react-native-ohos/react-native-screens'
        : packageJson.name;
    var entry = NAVIGATION_COMPATIBILITY[nativePackageName];
    if (!entry || packageJson.version !== entry.version)
        return null;
    return new ExpoModuleConfig_1.ExpoModuleConfig({
        platforms: ['harmony'],
        harmony: {
            kind: 'rnoh-package',
            cpp: {
                packageClass: entry.cppPackageClass,
                header: entry.cppHeader,
                cmakeTarget: entry.cmakeTarget,
                cmakePath: 'src/main/cpp',
            },
            ets: {
                packageClass: entry.etsPackageClass,
                importPath: entry.etsImportPath,
                entrypoint: 'index.ets',
                importKind: entry.importKind,
            },
            har: {
                packageName: nativePackageName,
                packagePath: path_1.default.join('harmony', entry.harName),
                primary: true,
                transform: entry.transform,
            },
        },
    });
}
function discoverRnohHarmonyConfigAsync(packageRoot, fallbackPackageName) {
    return __awaiter(this, void 0, void 0, function () {
        var packageJson, _a, _b, _c, provided, config, packageName, harRoot, harPaths, hars, defaultClass, etsPackageClassName, cppPackageClassName;
        var _d, _e, _f, _g, _h, _j;
        return __generator(this, function (_k) {
            switch (_k.label) {
                case 0:
                    _k.trys.push([0, 2, , 3]);
                    _b = (_a = JSON).parse;
                    return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(packageRoot, 'package.json'), 'utf8')];
                case 1:
                    packageJson = _b.apply(_a, [_k.sent()]);
                    return [3 /*break*/, 3];
                case 2:
                    _c = _k.sent();
                    return [2 /*return*/, null];
                case 3:
                    provided = (_d = packageJson.harmony) === null || _d === void 0 ? void 0 : _d.autolinking;
                    if (provided == null) {
                        return [2 /*return*/, createNavigationCompatibilityConfig(packageRoot, packageJson)];
                    }
                    config = provided === true ? {} : provided;
                    packageName = (_e = packageJson.name) !== null && _e !== void 0 ? _e : fallbackPackageName;
                    harRoot = path_1.default.join(packageRoot, (_f = config.mainHarPath) !== null && _f !== void 0 ? _f : 'harmony');
                    return [4 /*yield*/, findHarFilesAsync(harRoot)];
                case 4:
                    harPaths = _k.sent();
                    if (harPaths.length === 0) {
                        return [2 /*return*/, null];
                    }
                    hars = resolveRnohHars(packageName, harPaths, config.ohPackageName);
                    hars[0] = __assign(__assign({}, hars[0]), { primary: true });
                    defaultClass = "".concat(pascalCase(packageName.replace(/^@/, '').replace('/', '-')), "Package");
                    etsPackageClassName = (_g = config.etsPackageClassName) !== null && _g !== void 0 ? _g : defaultClass;
                    cppPackageClassName = (_h = config.cppPackageClassName) !== null && _h !== void 0 ? _h : defaultClass;
                    return [2 /*return*/, new ExpoModuleConfig_1.ExpoModuleConfig({
                            platforms: ['harmony'],
                            harmony: {
                                kind: 'rnoh-package',
                                cpp: {
                                    packageClass: "rnoh::".concat(cppPackageClassName),
                                    header: "".concat(cppPackageClassName, ".h"),
                                    cmakeTarget: (_j = config.cmakeLibraryTargetName) !== null && _j !== void 0 ? _j : rnohCmakeTarget(packageName),
                                    cmakePath: 'src/main/cpp',
                                },
                                ets: {
                                    packageClass: etsPackageClassName,
                                    importPath: hars[0].packageName,
                                    entrypoint: 'index.ets',
                                },
                                har: hars.map(function (_a) {
                                    var packageName = _a.packageName, packagePath = _a.packagePath, primary = _a.primary, version = _a.version;
                                    return ({
                                        packageName: packageName,
                                        packagePath: path_1.default.relative(packageRoot, packagePath),
                                        primary: primary,
                                        version: version,
                                    });
                                }),
                            },
                        })];
            }
        });
    });
}
function findHarFilesAsync(root) {
    return __awaiter(this, void 0, void 0, function () {
        var entries, _a, files;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fs_1.default.promises.readdir(root, { withFileTypes: true })];
                case 1:
                    entries = _b.sent();
                    return [3 /*break*/, 3];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, []];
                case 3: return [4 /*yield*/, Promise.all(entries.map(function (entry) {
                        var target = path_1.default.join(root, entry.name);
                        return entry.isDirectory()
                            ? findHarFilesAsync(target)
                            : Promise.resolve(entry.isFile() && entry.name.endsWith('.har') ? [target] : []);
                    }))];
                case 4:
                    files = (_b.sent()).flat();
                    return [2 /*return*/, files.sort()];
            }
        });
    });
}
function resolveRnohHars(npmPackageName, harPaths, names) {
    var defaultName = rnohOhPackageName(npmPackageName);
    var createHar = function (packagePath, mapping) {
        var _a;
        var harName = path_1.default.basename(packagePath);
        var suffix = harPaths.length > 1 ? "--".concat(path_1.default.basename(harName, '.har')) : '';
        return {
            packageName: (_a = mapping === null || mapping === void 0 ? void 0 : mapping.packageName) !== null && _a !== void 0 ? _a : (typeof names === 'string' ? names : defaultName) + suffix,
            packagePath: packagePath,
            version: mapping === null || mapping === void 0 ? void 0 : mapping.version,
        };
    };
    if (!Array.isArray(names)) {
        return harPaths.map(function (packagePath) { return createHar(packagePath); });
    }
    var harByName = new Map(harPaths.map(function (packagePath) { return [path_1.default.basename(packagePath), packagePath]; }));
    var processed = new Set();
    var resolved = [];
    for (var _i = 0, names_1 = names; _i < names_1.length; _i++) {
        var mapping = names_1[_i];
        var packagePath = harByName.get(mapping.harName);
        if (packagePath) {
            resolved.push(createHar(packagePath, mapping));
            processed.add(mapping.harName);
        }
    }
    for (var _a = 0, harPaths_1 = harPaths; _a < harPaths_1.length; _a++) {
        var packagePath = harPaths_1[_a];
        if (!processed.has(path_1.default.basename(packagePath))) {
            resolved.push(createHar(packagePath));
        }
    }
    return resolved;
}
function pascalCase(value) {
    return value
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map(function (part) { return part[0].toUpperCase() + part.slice(1); })
        .join('');
}
function snakeCase(value) {
    return value
        .replace(/^@/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}
function kebabCase(value) {
    return snakeCase(value).replaceAll('_', '-');
}
function rnohCmakeTarget(packageName) {
    if (packageName.startsWith('@')) {
        var _a = packageName.slice(1).split('/'), scope = _a[0], name_1 = _a[1];
        return "rnoh__".concat(snakeCase(scope), "__").concat(snakeCase(name_1));
    }
    return "rnoh__".concat(snakeCase(packageName));
}
function rnohOhPackageName(packageName) {
    if (packageName.startsWith('@')) {
        var _a = packageName.slice(1).split('/'), scope = _a[0], name_2 = _a[1];
        return "@rnoh/".concat(kebabCase(scope), "--").concat(kebabCase(name_2));
    }
    return "@rnoh/".concat(kebabCase(packageName));
}
//# sourceMappingURL=rnohConfig.js.map