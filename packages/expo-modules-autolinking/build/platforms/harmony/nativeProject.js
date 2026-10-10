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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RNOH_OUTPUT_HAR_SHA256 = exports.RNOH_INPUT_HAR_SHA256 = exports.RNOH_COMPATIBILITY_ID = void 0;
exports.prepareHarmonyNativeProjectAsync = prepareHarmonyNativeProjectAsync;
exports.copyHarmonyTemplateMediaAsync = copyHarmonyTemplateMediaAsync;
exports.syncHarmonyNativeProjectAsync = syncHarmonyNativeProjectAsync;
exports.generateHarmonyAppConfigAsync = generateHarmonyAppConfigAsync;
exports.prepareRnohCompatibilityHarAsync = prepareRnohCompatibilityHarAsync;
exports.stageHarmonyEtsPackagesAsync = stageHarmonyEtsPackagesAsync;
exports.renderExpoModulesLifecycle = renderExpoModulesLifecycle;
exports.renderExpoModulesAppOverlays = renderExpoModulesAppOverlays;
var fs_1 = require("fs");
var path_1 = require("path");
var crypto_1 = require("crypto");
var child_process_1 = require("child_process");
var harmony_1 = require("./harmony");
exports.RNOH_COMPATIBILITY_ID = 'expo-rnoh-0.82.30-core-v1-v3';
exports.RNOH_INPUT_HAR_SHA256 = 'cac2b5d1b9ce7d306079218931db12489aaceb240002c9c32e6c13185c577011';
exports.RNOH_OUTPUT_HAR_SHA256 = '0e0cf3dbb5b2e510f49c819ff5db2f43ad5a5918d38e840cc2714055c9f6fd83';
function prepareHarmonyNativeProjectAsync(_a) {
    return __awaiter(this, arguments, void 0, function (_b) {
        var harmonyRoot, _c, rnohHarPath, generatedFiles, error_1;
        var projectRoot = _b.projectRoot, appName = _b.appName, bundleName = _b.bundleName, modules = _b.modules, inputHarPath = _b.inputHarPath, corePackageRoot = _b.corePackageRoot, pythonExecutable = _b.pythonExecutable, runCompatibilityTool = _b.runCompatibilityTool, _d = _b.runAppConfigGenerator, runAppConfigGenerator = _d === void 0 ? runAppConfigGeneratorAsync : _d, _e = _b.templateRoot, templateRoot = _e === void 0 ? path_1.default.resolve(__dirname, '../../../templates/harmony') : _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    harmonyRoot = path_1.default.join(projectRoot, 'harmony');
                    if (fs_1.default.existsSync(harmonyRoot)) {
                        throw new Error("Harmony native project already exists at \"".concat(harmonyRoot, "\""));
                    }
                    _f.label = 1;
                case 1:
                    _f.trys.push([1, 6, , 8]);
                    return [4 /*yield*/, fs_1.default.promises.cp(templateRoot, harmonyRoot, { recursive: true })];
                case 2:
                    _f.sent();
                    return [4 /*yield*/, copyHarmonyTemplateMediaAsync(projectRoot, harmonyRoot)];
                case 3:
                    _f.sent();
                    return [4 /*yield*/, replaceTemplatePlaceholdersAsync(harmonyRoot, {
                            __EXPO_APP_NAME__: appName,
                            __EXPO_BUNDLE_NAME__: bundleName,
                        })];
                case 4:
                    _f.sent();
                    return [4 /*yield*/, assembleHarmonyGeneratedAreasAsync({
                            projectRoot: projectRoot,
                            harmonyRoot: harmonyRoot,
                            modules: modules,
                            inputHarPath: inputHarPath,
                            corePackageRoot: corePackageRoot,
                            pythonExecutable: pythonExecutable,
                            runCompatibilityTool: runCompatibilityTool,
                            runAppConfigGenerator: runAppConfigGenerator,
                        })];
                case 5:
                    _c = _f.sent(), rnohHarPath = _c.rnohHarPath, generatedFiles = _c.generatedFiles;
                    return [2 /*return*/, { harmonyRoot: harmonyRoot, rnohHarPath: rnohHarPath, generatedFiles: generatedFiles }];
                case 6:
                    error_1 = _f.sent();
                    return [4 /*yield*/, fs_1.default.promises.rm(harmonyRoot, { recursive: true, force: true })];
                case 7:
                    _f.sent();
                    throw error_1;
                case 8: return [2 /*return*/];
            }
        });
    });
}
function copyHarmonyTemplateMediaAsync(projectRoot, harmonyRoot) {
    return __awaiter(this, void 0, void 0, function () {
        var appJsonPath, app, _a, _b, expo, icon, foreground, splash, resolveAsset, media, _i, media_1, _c, source, relativeTarget, target;
        var _d, _e, _f, _g, _h, _j;
        return __generator(this, function (_k) {
            switch (_k.label) {
                case 0:
                    appJsonPath = path_1.default.join(projectRoot, 'app.json');
                    _b = (_a = JSON).parse;
                    return [4 /*yield*/, fs_1.default.promises.readFile(appJsonPath, 'utf8')];
                case 1:
                    app = _b.apply(_a, [_k.sent()]);
                    expo = (_d = app === null || app === void 0 ? void 0 : app.expo) !== null && _d !== void 0 ? _d : {};
                    icon = expo.icon;
                    if (typeof icon !== 'string' || !icon) {
                        throw new Error('Expo app.json must define expo.icon for Harmony media generation');
                    }
                    foreground = (_g = (_f = (_e = expo.android) === null || _e === void 0 ? void 0 : _e.adaptiveIcon) === null || _f === void 0 ? void 0 : _f.foregroundImage) !== null && _g !== void 0 ? _g : icon;
                    splash = (_j = (_h = expo.splash) === null || _h === void 0 ? void 0 : _h.image) !== null && _j !== void 0 ? _j : icon;
                    resolveAsset = function (relativePath, field) {
                        if (typeof relativePath !== 'string' || !relativePath)
                            throw new Error("".concat(field, " must be a project-relative asset path"));
                        var absolute = path_1.default.resolve(projectRoot, relativePath);
                        var relative = path_1.default.relative(projectRoot, absolute);
                        if (!relative || relative.startsWith('..') || path_1.default.isAbsolute(relative))
                            throw new Error("".concat(field, " must stay inside the project"));
                        if (!fs_1.default.existsSync(absolute) || !fs_1.default.statSync(absolute).isFile())
                            throw new Error("".concat(field, " asset is missing: ").concat(relativePath));
                        return absolute;
                    };
                    media = [
                        [resolveAsset(icon, 'expo.icon'), 'entry/src/main/resources/base/media/background.png'],
                        [resolveAsset(foreground, 'expo.android.adaptiveIcon.foregroundImage'), 'entry/src/main/resources/base/media/foreground.png'],
                        [resolveAsset(splash, 'expo.splash.image'), 'entry/src/main/resources/base/media/startIcon.png'],
                        [resolveAsset(icon, 'expo.icon'), 'AppScope/resources/base/media/app_icon.png'],
                    ];
                    _i = 0, media_1 = media;
                    _k.label = 2;
                case 2:
                    if (!(_i < media_1.length)) return [3 /*break*/, 6];
                    _c = media_1[_i], source = _c[0], relativeTarget = _c[1];
                    target = path_1.default.join(harmonyRoot, relativeTarget);
                    return [4 /*yield*/, fs_1.default.promises.mkdir(path_1.default.dirname(target), { recursive: true })];
                case 3:
                    _k.sent();
                    return [4 /*yield*/, fs_1.default.promises.copyFile(source, target)];
                case 4:
                    _k.sent();
                    _k.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 2];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function syncHarmonyNativeProjectAsync(options) {
    return __awaiter(this, void 0, void 0, function () {
        var harmonyRoot, _a, rnohHarPath, generatedFiles;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    harmonyRoot = path_1.default.join(options.projectRoot, 'harmony');
                    if (!!fs_1.default.existsSync(harmonyRoot)) return [3 /*break*/, 2];
                    return [4 /*yield*/, prepareHarmonyNativeProjectAsync(options)];
                case 1: return [2 /*return*/, _b.sent()];
                case 2: return [4 /*yield*/, writeHarmonyAppIdentityAsync(harmonyRoot, options.appName, options.bundleName)];
                case 3:
                    _b.sent();
                    return [4 /*yield*/, Promise.all([
                            fs_1.default.promises.rm(path_1.default.join(harmonyRoot, 'expo-modules'), { recursive: true, force: true }),
                            fs_1.default.promises.rm(path_1.default.join(harmonyRoot, 'dependencies/expo-modules'), {
                                recursive: true,
                                force: true,
                            }),
                            fs_1.default.promises.rm(path_1.default.join(harmonyRoot, 'entry/src/main/cpp/generated'), {
                                recursive: true,
                                force: true,
                            }),
                            fs_1.default.promises.rm(path_1.default.join(harmonyRoot, 'entry/src/main/ets/generated'), {
                                recursive: true,
                                force: true,
                            }),
                            fs_1.default.promises.rm(path_1.default.join(harmonyRoot, '.expo-autolinking'), {
                                recursive: true,
                                force: true,
                            }),
                        ])];
                case 4:
                    _b.sent();
                    return [4 /*yield*/, assembleHarmonyGeneratedAreasAsync(__assign(__assign({}, options), { harmonyRoot: harmonyRoot }))];
                case 5:
                    _a = _b.sent(), rnohHarPath = _a.rnohHarPath, generatedFiles = _a.generatedFiles;
                    return [2 /*return*/, { harmonyRoot: harmonyRoot, rnohHarPath: rnohHarPath, generatedFiles: generatedFiles }];
            }
        });
    });
}
function assembleHarmonyGeneratedAreasAsync(_a) {
    return __awaiter(this, arguments, void 0, function (_b) {
        var rnohHarPath, scratch, generatedFiles;
        var projectRoot = _b.projectRoot, harmonyRoot = _b.harmonyRoot, modules = _b.modules, inputHarPath = _b.inputHarPath, corePackageRoot = _b.corePackageRoot, pythonExecutable = _b.pythonExecutable, runCompatibilityTool = _b.runCompatibilityTool, runAppConfigGenerator = _b.runAppConfigGenerator;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, generateHarmonyAppConfigAsync({ projectRoot: projectRoot, harmonyRoot: harmonyRoot, runAppConfigGenerator: runAppConfigGenerator })];
                case 1:
                    _c.sent();
                    return [4 /*yield*/, prepareRnohCompatibilityHarAsync({
                            harmonyRoot: harmonyRoot,
                            inputHarPath: inputHarPath,
                            corePackageRoot: corePackageRoot,
                            pythonExecutable: pythonExecutable,
                            runCompatibilityTool: runCompatibilityTool,
                        })];
                case 2:
                    rnohHarPath = _c.sent();
                    return [4 /*yield*/, stageHarmonyEtsPackagesAsync(modules, harmonyRoot)];
                case 3:
                    _c.sent();
                    scratch = path_1.default.join(harmonyRoot, '.expo-autolinking');
                    return [4 /*yield*/, (0, harmony_1.generatePackageListAsync)(modules, scratch, 'expo.modules')];
                case 4:
                    _c.sent();
                    generatedFiles = {
                        cpp: path_1.default.join(harmonyRoot, 'entry/src/main/cpp/generated/ExpoModulesPackages.cpp'),
                        ets: path_1.default.join(harmonyRoot, 'entry/src/main/ets/generated/ExpoModulesPackages.ets'),
                        cmake: path_1.default.join(harmonyRoot, 'entry/src/main/cpp/generated/expo-modules.cmake'),
                        lifecycle: path_1.default.join(harmonyRoot, 'entry/src/main/ets/generated/ExpoModulesLifecycle.ets'),
                        overlays: path_1.default.join(harmonyRoot, 'entry/src/main/ets/generated/ExpoModulesAppOverlays.ets'),
                    };
                    return [4 /*yield*/, Promise.all([
                            copyFileAsync(path_1.default.join(scratch, 'ExpoModulesPackages.cpp'), generatedFiles.cpp),
                            copyFileAsync(path_1.default.join(scratch, 'ExpoModulesPackages.ets'), generatedFiles.ets),
                            copyFileAsync(path_1.default.join(scratch, 'expo-modules.cmake'), generatedFiles.cmake),
                            fs_1.default.promises
                                .mkdir(path_1.default.dirname(generatedFiles.lifecycle), { recursive: true })
                                .then(function () {
                                return fs_1.default.promises.writeFile(generatedFiles.lifecycle, renderExpoModulesLifecycle(modules), 'utf8');
                            }),
                            fs_1.default.promises
                                .mkdir(path_1.default.dirname(generatedFiles.overlays), { recursive: true })
                                .then(function () {
                                return fs_1.default.promises.writeFile(generatedFiles.overlays, renderExpoModulesAppOverlays(modules), 'utf8');
                            }),
                        ])];
                case 5:
                    _c.sent();
                    return [4 /*yield*/, fs_1.default.promises.rm(scratch, { recursive: true, force: true })];
                case 6:
                    _c.sent();
                    return [2 /*return*/, { rnohHarPath: rnohHarPath, generatedFiles: generatedFiles }];
            }
        });
    });
}
function writeHarmonyAppIdentityAsync(harmonyRoot, appName, bundleName) {
    return __awaiter(this, void 0, void 0, function () {
        var appPath, app, _a, _b, _i, _c, relativePath, filePath, resource, _d, _e, _f, _g, item;
        var _h;
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0:
                    appPath = path_1.default.join(harmonyRoot, 'AppScope/app.json5');
                    _b = (_a = JSON).parse;
                    return [4 /*yield*/, fs_1.default.promises.readFile(appPath, 'utf8')];
                case 1:
                    app = _b.apply(_a, [_j.sent()]);
                    app.app.bundleName = bundleName;
                    return [4 /*yield*/, fs_1.default.promises.writeFile(appPath, JSON.stringify(app, null, 2) + '\n')];
                case 2:
                    _j.sent();
                    _i = 0, _c = [
                        'AppScope/resources/base/element/string.json',
                        'entry/src/main/resources/base/element/string.json',
                    ];
                    _j.label = 3;
                case 3:
                    if (!(_i < _c.length)) return [3 /*break*/, 7];
                    relativePath = _c[_i];
                    filePath = path_1.default.join(harmonyRoot, relativePath);
                    _e = (_d = JSON).parse;
                    return [4 /*yield*/, fs_1.default.promises.readFile(filePath, 'utf8')];
                case 4:
                    resource = _e.apply(_d, [_j.sent()]);
                    for (_f = 0, _g = (_h = resource.string) !== null && _h !== void 0 ? _h : []; _f < _g.length; _f++) {
                        item = _g[_f];
                        item.value = appName;
                    }
                    return [4 /*yield*/, fs_1.default.promises.writeFile(filePath, JSON.stringify(resource, null, 2) + '\n')];
                case 5:
                    _j.sent();
                    _j.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 3];
                case 7: return [2 /*return*/];
            }
        });
    });
}
function generateHarmonyAppConfigAsync(_a) {
    return __awaiter(this, arguments, void 0, function (_b) {
        var scriptPath, destinationDir, outputPath, config, _c, _d, error_2;
        var projectRoot = _b.projectRoot, harmonyRoot = _b.harmonyRoot, _e = _b.runAppConfigGenerator, runAppConfigGenerator = _e === void 0 ? runAppConfigGeneratorAsync : _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    scriptPath = path_1.default.join(projectRoot, 'node_modules', 'expo-constants', 'scripts', 'getAppConfig.js');
                    if (!fs_1.default.existsSync(scriptPath)) {
                        throw new Error("expo-constants app config generator does not exist at \"".concat(scriptPath, "\""));
                    }
                    destinationDir = path_1.default.join(harmonyRoot, 'entry', 'src', 'main', 'resources', 'rawfile');
                    return [4 /*yield*/, fs_1.default.promises.mkdir(destinationDir, { recursive: true })];
                case 1:
                    _f.sent();
                    return [4 /*yield*/, runAppConfigGenerator({ scriptPath: scriptPath, projectRoot: projectRoot, destinationDir: destinationDir })];
                case 2:
                    _f.sent();
                    outputPath = path_1.default.join(destinationDir, 'app.config');
                    _f.label = 3;
                case 3:
                    _f.trys.push([3, 5, , 6]);
                    _d = (_c = JSON).parse;
                    return [4 /*yield*/, fs_1.default.promises.readFile(outputPath, 'utf8')];
                case 4:
                    config = _d.apply(_c, [_f.sent()]);
                    return [3 /*break*/, 6];
                case 5:
                    error_2 = _f.sent();
                    throw new Error("Invalid generated Harmony app.config at \"".concat(outputPath, "\": ").concat(String(error_2)));
                case 6:
                    if (!config || typeof config !== 'object' || Array.isArray(config)) {
                        throw new Error("Generated Harmony app.config must contain a JSON object at \"".concat(outputPath, "\""));
                    }
                    return [2 /*return*/, outputPath];
            }
        });
    });
}
function prepareRnohCompatibilityHarAsync(_a) {
    return __awaiter(this, arguments, void 0, function (_b) {
        var outputHarPath, scriptPath, manifestPath, error_3;
        var harmonyRoot = _b.harmonyRoot, inputHarPath = _b.inputHarPath, corePackageRoot = _b.corePackageRoot, _c = _b.pythonExecutable, pythonExecutable = _c === void 0 ? resolveHarmonyPythonExecutable() : _c, _d = _b.runCompatibilityTool, runCompatibilityTool = _d === void 0 ? runCompatibilityToolAsync : _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, assertSha256Async(inputHarPath, exports.RNOH_INPUT_HAR_SHA256, 'input')];
                case 1:
                    _e.sent();
                    outputHarPath = path_1.default.join(harmonyRoot, 'dependencies', 'react_native_openharmony.har');
                    if (!fs_1.default.existsSync(outputHarPath)) return [3 /*break*/, 3];
                    return [4 /*yield*/, assertSha256Async(outputHarPath, exports.RNOH_OUTPUT_HAR_SHA256, 'output')];
                case 2:
                    _e.sent();
                    return [2 /*return*/, outputHarPath];
                case 3:
                    scriptPath = path_1.default.join(corePackageRoot, 'harmony', 'rnoh-compat', 'prepare_har.py');
                    if (!fs_1.default.existsSync(scriptPath)) {
                        throw new Error("RNOH compatibility tool does not exist at \"".concat(scriptPath, "\""));
                    }
                    return [4 /*yield*/, fs_1.default.promises.mkdir(path_1.default.dirname(outputHarPath), { recursive: true })];
                case 4:
                    _e.sent();
                    _e.label = 5;
                case 5:
                    _e.trys.push([5, 8, , 10]);
                    return [4 /*yield*/, runCompatibilityTool({
                            pythonExecutable: pythonExecutable,
                            scriptPath: scriptPath,
                            inputHarPath: inputHarPath,
                            outputHarPath: outputHarPath,
                            profile: 'core-v1-v3',
                        })];
                case 6:
                    _e.sent();
                    return [4 /*yield*/, assertSha256Async(outputHarPath, exports.RNOH_OUTPUT_HAR_SHA256, 'output')];
                case 7:
                    _e.sent();
                    manifestPath = "".concat(outputHarPath, ".manifest.json");
                    if (!fs_1.default.existsSync(manifestPath)) {
                        throw new Error("RNOH compatibility manifest does not exist at \"".concat(manifestPath, "\""));
                    }
                    return [2 /*return*/, outputHarPath];
                case 8:
                    error_3 = _e.sent();
                    return [4 /*yield*/, Promise.all([
                            fs_1.default.promises.rm(outputHarPath, { force: true }),
                            fs_1.default.promises.rm("".concat(outputHarPath, ".manifest.json"), { force: true }),
                        ])];
                case 9:
                    _e.sent();
                    throw error_3;
                case 10: return [2 /*return*/];
            }
        });
    });
}
function stageHarmonyEtsPackagesAsync(modules_1, harmonyRoot_1) {
    return __awaiter(this, arguments, void 0, function (modules, harmonyRoot, runHarTransform) {
        var packages, _i, modules_2, module_1, ohPackageName, existing, dependencies, projectModules, _a, _b, _c, ohPackageName, module_2, stagingName, moduleName, stagingRoot, entrypointRelative, sourceHarmonyRoot, sourceEtsRoot, stats, error_4, managedHarRoot, managedHarScratch, harEntries, hasLocalHars, _d, harEntries_1, _e, har, owner, stagingName, fileName, target, backup, error_5, error_6, rootManifestPath, rootManifest, _f, _g, harOverrides, unmanagedOverrides, dependencySpecifiers, entryManifestPath, entryManifest, _h, _j, buildProfilePath, buildProfile, _k, _l;
        var _m, _o, _p;
        if (runHarTransform === void 0) { runHarTransform = runHarmonyHarTransformAsync; }
        return __generator(this, function (_q) {
            switch (_q.label) {
                case 0:
                    packages = new Map();
                    for (_i = 0, modules_2 = modules; _i < modules_2.length; _i++) {
                        module_1 = modules_2[_i];
                        if (!module_1.ets || module_1.kind === 'rnoh-package') {
                            continue;
                        }
                        ohPackageName = getOhPackageName(module_1.ets.importPath);
                        existing = packages.get(ohPackageName);
                        if (existing && existing.packageRoot !== module_1.packageRoot) {
                            throw new Error("Harmony OHPM package \"".concat(ohPackageName, "\" resolves to both \"").concat(existing.packageRoot, "\" and \"").concat(module_1.packageRoot, "\""));
                        }
                        packages.set(ohPackageName, __assign(__assign({}, module_1), { ets: module_1.ets }));
                    }
                    dependencies = new Map();
                    projectModules = [];
                    _a = 0, _b = __spreadArray([], packages, true).sort(function (_a, _b) {
                        var a = _a[0];
                        var b = _b[0];
                        return a.localeCompare(b);
                    });
                    _q.label = 1;
                case 1:
                    if (!(_a < _b.length)) return [3 /*break*/, 14];
                    _c = _b[_a], ohPackageName = _c[0], module_2 = _c[1];
                    stagingName = sanitizeOhPackageName(ohPackageName);
                    moduleName = stagingName.replace(/[^A-Za-z0-9_.]/g, '_');
                    stagingRoot = path_1.default.join(harmonyRoot, 'expo-modules', stagingName);
                    entrypointRelative = path_1.default.relative(module_2.packageRoot, module_2.ets.entrypoint);
                    if (entrypointRelative.startsWith('..') || path_1.default.isAbsolute(entrypointRelative)) {
                        throw new Error("Harmony ETS entrypoint for \"".concat(module_2.packageName, "\" is outside its package root"));
                    }
                    return [4 /*yield*/, fs_1.default.promises.mkdir(stagingRoot, { recursive: true })];
                case 2:
                    _q.sent();
                    return [4 /*yield*/, copyFileAsync(module_2.ets.entrypoint, path_1.default.join(stagingRoot, entrypointRelative))];
                case 3:
                    _q.sent();
                    sourceHarmonyRoot = path_1.default.dirname(module_2.ets.entrypoint);
                    sourceEtsRoot = path_1.default.join(sourceHarmonyRoot, 'src', 'main', 'ets');
                    _q.label = 4;
                case 4:
                    _q.trys.push([4, 8, , 9]);
                    return [4 /*yield*/, fs_1.default.promises.stat(sourceEtsRoot)];
                case 5:
                    stats = _q.sent();
                    if (!stats.isDirectory()) return [3 /*break*/, 7];
                    return [4 /*yield*/, fs_1.default.promises.cp(sourceEtsRoot, path_1.default.join(stagingRoot, path_1.default.relative(module_2.packageRoot, sourceEtsRoot)), { recursive: true })];
                case 6:
                    _q.sent();
                    _q.label = 7;
                case 7: return [3 /*break*/, 9];
                case 8:
                    error_4 = _q.sent();
                    if ((error_4 === null || error_4 === void 0 ? void 0 : error_4.code) !== 'ENOENT') {
                        throw error_4;
                    }
                    return [3 /*break*/, 9];
                case 9: return [4 /*yield*/, fs_1.default.promises.writeFile(path_1.default.join(stagingRoot, 'oh-package.json5'), JSON.stringify({
                        name: ohPackageName,
                        version: (_m = module_2.packageVersion) !== null && _m !== void 0 ? _m : '0.0.0',
                        main: entrypointRelative.split(path_1.default.sep).join('/'),
                        dependencies: {
                            '@rnoh/react-native-openharmony': 'file:../../dependencies/react_native_openharmony.har',
                        },
                    }, null, 2) + '\n')];
                case 10:
                    _q.sent();
                    return [4 /*yield*/, fs_1.default.promises.mkdir(path_1.default.join(stagingRoot, 'src', 'main'), { recursive: true })];
                case 11:
                    _q.sent();
                    return [4 /*yield*/, Promise.all([
                            fs_1.default.promises.writeFile(path_1.default.join(stagingRoot, 'src', 'main', 'module.json5'), JSON.stringify({ module: { name: moduleName, type: 'har', deviceTypes: ['default'] } }, null, 2) + '\n'),
                            fs_1.default.promises.writeFile(path_1.default.join(stagingRoot, 'build-profile.json5'), JSON.stringify({ apiType: 'stageMode', targets: [{ name: 'default', runtimeOS: 'HarmonyOS' }] }, null, 2) + '\n'),
                            fs_1.default.promises.writeFile(path_1.default.join(stagingRoot, 'hvigorfile.ts'), "import { harTasks } from '@ohos/hvigor-ohos-plugin';\nexport default { system: harTasks, plugins: [] };\n"),
                        ])];
                case 12:
                    _q.sent();
                    registerHarmonyDependency(dependencies, ohPackageName, "file:../expo-modules/".concat(stagingName), module_2.packageName);
                    projectModules.push({
                        name: moduleName,
                        srcPath: "./expo-modules/".concat(stagingName),
                        targets: [{ name: 'default', applyToProducts: ['default'] }],
                    });
                    _q.label = 13;
                case 13:
                    _a++;
                    return [3 /*break*/, 1];
                case 14:
                    managedHarRoot = path_1.default.join(harmonyRoot, 'dependencies', 'expo-modules');
                    managedHarScratch = path_1.default.join(harmonyRoot, '.expo-har-staging');
                    return [4 /*yield*/, fs_1.default.promises.rm(managedHarScratch, { recursive: true, force: true })];
                case 15:
                    _q.sent();
                    harEntries = modules
                        .flatMap(function (module) { var _a; return ((_a = module.hars) !== null && _a !== void 0 ? _a : []).map(function (har) { return ({ har: har, owner: module.packageName }); }); })
                        .sort(function (a, b) { return a.har.packageName.localeCompare(b.har.packageName); });
                    hasLocalHars = false;
                    _q.label = 16;
                case 16:
                    _q.trys.push([16, 37, , 39]);
                    _d = 0, harEntries_1 = harEntries;
                    _q.label = 17;
                case 17:
                    if (!(_d < harEntries_1.length)) return [3 /*break*/, 22];
                    _e = harEntries_1[_d], har = _e.har, owner = _e.owner;
                    if (har.version) {
                        registerHarmonyDependency(dependencies, har.packageName, har.version, owner);
                        return [3 /*break*/, 21];
                    }
                    hasLocalHars = true;
                    stagingName = sanitizeOhPackageName(har.packageName);
                    fileName = path_1.default.basename(har.packagePath);
                    target = path_1.default.join(managedHarScratch, stagingName, fileName);
                    registerHarmonyDependency(dependencies, har.packageName, "file:../dependencies/expo-modules/".concat(stagingName, "/").concat(fileName), owner);
                    if (!har.transform) return [3 /*break*/, 19];
                    return [4 /*yield*/, runHarTransform(har.transform, har.packagePath, target)];
                case 18:
                    _q.sent();
                    return [3 /*break*/, 21];
                case 19: return [4 /*yield*/, copyFileAsync(har.packagePath, target)];
                case 20:
                    _q.sent();
                    _q.label = 21;
                case 21:
                    _d++;
                    return [3 /*break*/, 17];
                case 22:
                    if (!hasLocalHars) return [3 /*break*/, 34];
                    return [4 /*yield*/, fs_1.default.promises.mkdir(path_1.default.dirname(managedHarRoot), { recursive: true })];
                case 23:
                    _q.sent();
                    backup = path_1.default.join(harmonyRoot, '.expo-har-backup');
                    return [4 /*yield*/, fs_1.default.promises.rm(backup, { recursive: true, force: true })];
                case 24:
                    _q.sent();
                    if (!fs_1.default.existsSync(managedHarRoot)) return [3 /*break*/, 26];
                    return [4 /*yield*/, fs_1.default.promises.rename(managedHarRoot, backup)];
                case 25:
                    _q.sent();
                    _q.label = 26;
                case 26:
                    _q.trys.push([26, 29, , 33]);
                    return [4 /*yield*/, fs_1.default.promises.rename(managedHarScratch, managedHarRoot)];
                case 27:
                    _q.sent();
                    return [4 /*yield*/, fs_1.default.promises.rm(backup, { recursive: true, force: true })];
                case 28:
                    _q.sent();
                    return [3 /*break*/, 33];
                case 29:
                    error_5 = _q.sent();
                    return [4 /*yield*/, fs_1.default.promises.rm(managedHarRoot, { recursive: true, force: true })];
                case 30:
                    _q.sent();
                    if (!fs_1.default.existsSync(backup)) return [3 /*break*/, 32];
                    return [4 /*yield*/, fs_1.default.promises.rename(backup, managedHarRoot)];
                case 31:
                    _q.sent();
                    _q.label = 32;
                case 32: throw error_5;
                case 33: return [3 /*break*/, 36];
                case 34: return [4 /*yield*/, fs_1.default.promises.rm(managedHarRoot, { recursive: true, force: true })];
                case 35:
                    _q.sent();
                    _q.label = 36;
                case 36: return [3 /*break*/, 39];
                case 37:
                    error_6 = _q.sent();
                    return [4 /*yield*/, fs_1.default.promises.rm(managedHarScratch, { recursive: true, force: true })];
                case 38:
                    _q.sent();
                    throw error_6;
                case 39:
                    rootManifestPath = path_1.default.join(harmonyRoot, 'oh-package.json5');
                    if (!fs_1.default.existsSync(rootManifestPath)) return [3 /*break*/, 42];
                    _g = (_f = JSON).parse;
                    return [4 /*yield*/, fs_1.default.promises.readFile(rootManifestPath, 'utf8')];
                case 40:
                    rootManifest = _g.apply(_f, [_q.sent()]);
                    harOverrides = Object.fromEntries(harEntries.map(function (_a) {
                        var _b;
                        var har = _a.har;
                        return [
                            har.packageName,
                            (_b = har.version) !== null && _b !== void 0 ? _b : "file:./dependencies/expo-modules/".concat(sanitizeOhPackageName(har.packageName), "/").concat(path_1.default.basename(har.packagePath)),
                        ];
                    }));
                    unmanagedOverrides = Object.fromEntries(Object.entries((_o = rootManifest.overrides) !== null && _o !== void 0 ? _o : {}).filter(function (_a) {
                        var specifier = _a[1];
                        return !String(specifier).startsWith('file:./dependencies/expo-modules/');
                    }));
                    rootManifest.overrides = __assign(__assign(__assign({}, unmanagedOverrides), { '@rnoh/react-native-openharmony': 'file:./dependencies/react_native_openharmony.har' }), harOverrides);
                    return [4 /*yield*/, fs_1.default.promises.writeFile(rootManifestPath, JSON.stringify(rootManifest, null, 2) + '\n')];
                case 41:
                    _q.sent();
                    _q.label = 42;
                case 42:
                    dependencySpecifiers = Object.fromEntries(__spreadArray([], dependencies, true).sort(function (_a, _b) {
                        var a = _a[0];
                        var b = _b[0];
                        return a.localeCompare(b);
                    })
                        .map(function (_a) {
                        var name = _a[0], value = _a[1];
                        return [name, value.specifier];
                    }));
                    entryManifestPath = path_1.default.join(harmonyRoot, 'entry', 'oh-package.json5');
                    _j = (_h = JSON).parse;
                    return [4 /*yield*/, fs_1.default.promises.readFile(entryManifestPath, 'utf8')];
                case 43:
                    entryManifest = _j.apply(_h, [_q.sent()]);
                    entryManifest.dependencies = __assign({ '@rnoh/react-native-openharmony': 'file:../dependencies/react_native_openharmony.har' }, dependencySpecifiers);
                    return [4 /*yield*/, fs_1.default.promises.writeFile(entryManifestPath, JSON.stringify(entryManifest, null, 2) + '\n')];
                case 44:
                    _q.sent();
                    buildProfilePath = path_1.default.join(harmonyRoot, 'build-profile.json5');
                    _l = (_k = JSON).parse;
                    return [4 /*yield*/, fs_1.default.promises.readFile(buildProfilePath, 'utf8')];
                case 45:
                    buildProfile = _l.apply(_k, [_q.sent()]);
                    buildProfile.modules = __spreadArray(__spreadArray([], ((_p = buildProfile.modules) !== null && _p !== void 0 ? _p : []).filter(function (module) { var _a; return !((_a = module.srcPath) === null || _a === void 0 ? void 0 : _a.startsWith('./expo-modules/')); }), true), projectModules, true);
                    return [4 /*yield*/, fs_1.default.promises.writeFile(buildProfilePath, JSON.stringify(buildProfile, null, 2) + '\n')];
                case 46:
                    _q.sent();
                    return [2 /*return*/, dependencySpecifiers];
            }
        });
    });
}
function runHarmonyHarTransformAsync(transform, input, output) {
    return __awaiter(this, void 0, void 0, function () {
        var script;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs_1.default.promises.mkdir(path_1.default.dirname(output), { recursive: true })];
                case 1:
                    _a.sent();
                    script = path_1.default.resolve(__dirname, "../../../scripts/harmony/".concat(transform === 'screens-content-wrapper-v1' ? 'prepare-screens.py' : 'prepare-worklets.py'));
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var child = (0, child_process_1.spawn)(resolveHarmonyPythonExecutable(), [script, '--input-har', input, '--output-har', output], { stdio: 'inherit' });
                            child.once('error', reject);
                            child.once('exit', function (code) {
                                return code === 0
                                    ? resolve()
                                    : reject(new Error("Harmony HAR transform ".concat(transform, " failed with exit code ").concat(code)));
                            });
                        })];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function registerHarmonyDependency(dependencies, packageName, specifier, owner) {
    var existing = dependencies.get(packageName);
    if (existing) {
        throw new Error("duplicate Harmony OHPM package name \"".concat(packageName, "\" in \"").concat(existing.owner, "\" and \"").concat(owner, "\""));
    }
    dependencies.set(packageName, { specifier: specifier, owner: owner });
}
function sanitizeOhPackageName(packageName) {
    return packageName.replace(/^@/, '').replace(/[^A-Za-z0-9._-]+/g, '__');
}
function renderExpoModulesLifecycle(modules) {
    var dependencies = collectLifecycleDependencies(modules);
    var imports = deduplicateLifecycleImports(dependencies)
        .map(function (_a) {
        var className = _a.className, importPath = _a.importPath;
        return "import { ".concat(className, " } from '").concat(escapeEtsString(importPath), "';");
    })
        .join('\n');
    if (dependencies.length === 0) {
        return ("// @generated by expo-modules-autolinking. Do not edit.\n" +
            "import { Want } from '@kit.AbilityKit';\n\n" +
            "export class ExpoModulesLifecycle {\n" +
            "  public onCreate(_want: Want): void {}\n" +
            "  public onNewWant(_want: Want): void {}\n" +
            "  public onDestroy(): void {}\n" +
            "}\n");
    }
    var fields = dependencies
        .map(function (_a) {
        var localName = _a.localName, className = _a.className;
        return "  private readonly ".concat(localName, " = new ").concat(className, "();");
    })
        .join('\n');
    var onCreate = dependencies
        .flatMap(function (_a) {
        var localName = _a.localName, appStorageKey = _a.appStorageKey;
        return [
            "    this.".concat(localName, ".onCreate(want);"),
            "    AppStorage.setOrCreate('".concat(escapeEtsString(appStorageKey), "', this.").concat(localName, ");"),
        ];
    })
        .join('\n');
    var onNewWant = dependencies
        .map(function (_a) {
        var localName = _a.localName;
        return "    this.".concat(localName, ".onNewWant(want);");
    })
        .join('\n');
    var onDestroy = dependencies
        .flatMap(function (_a) {
        var localName = _a.localName, appStorageKey = _a.appStorageKey;
        return [
            "    this.".concat(localName, ".onDestroy();"),
            "    AppStorage.delete('".concat(escapeEtsString(appStorageKey), "');"),
        ];
    })
        .join('\n');
    return ("// @generated by expo-modules-autolinking. Do not edit.\n" +
        "import { Want } from '@kit.AbilityKit';\n" +
        "".concat(imports, "\n\n") +
        "export class ExpoModulesLifecycle {\n" +
        "".concat(fields, "\n\n") +
        "  public onCreate(want: Want): void {\n".concat(onCreate, "\n  }\n\n") +
        "  public onNewWant(want: Want): void {\n".concat(onNewWant, "\n  }\n\n") +
        "  public onDestroy(): void {\n".concat(onDestroy, "\n  }\n") +
        "}\n");
}
function renderExpoModulesAppOverlays(modules) {
    var _a;
    var overlays = collectLifecycleDependencies(modules)
        .filter(function (dependency) { return dependency.arkUIOverlay != null; })
        .map(function (dependency) { return (__assign(__assign({}, dependency), { overlay: dependency.arkUIOverlay })); });
    if (overlays.length === 0) {
        return ("// @generated by expo-modules-autolinking. Do not edit.\n\n" +
            "@Component\n" +
            "export struct ExpoModulesAppOverlays {\n" +
            "  build() {\n" +
            "    Column() {}\n" +
            "      .width(0)\n" +
            "      .height(0)\n" +
            "  }\n" +
            "}\n");
    }
    var importsByPath = new Map();
    for (var _i = 0, overlays_1 = overlays; _i < overlays_1.length; _i++) {
        var dependency = overlays_1[_i];
        for (var _b = 0, _c = [
            [dependency.importPath, dependency.className],
            [dependency.overlay.importPath, dependency.overlay.className],
        ]; _b < _c.length; _b++) {
            var _d = _c[_b], importPath = _d[0], className = _d[1];
            var classNames = (_a = importsByPath.get(importPath)) !== null && _a !== void 0 ? _a : new Set();
            classNames.add(className);
            importsByPath.set(importPath, classNames);
        }
    }
    var imports = __spreadArray([], importsByPath, true).sort(function (_a, _b) {
        var a = _a[0];
        var b = _b[0];
        return a.localeCompare(b);
    })
        .map(function (_a) {
        var importPath = _a[0], classNames = _a[1];
        return "import { ".concat(__spreadArray([], classNames, true).sort().join(', '), " } from '").concat(escapeEtsString(importPath), "';");
    })
        .join('\n');
    var fields = overlays
        .map(function (dependency) {
        return "  @StorageLink('".concat(escapeEtsString(dependency.appStorageKey), "') private ").concat(dependency.localName, ": ").concat(dependency.className, " | undefined = undefined;");
    })
        .join('\n');
    var views = overlays
        .map(function (dependency) {
        return "    if (this.".concat(dependency.localName, ") {\n") +
            "      ".concat(dependency.overlay.className, "({ ").concat(dependency.overlay.controllerProperty, ": this.").concat(dependency.localName, " })\n") +
            "    }";
    })
        .join('\n');
    // ArkTS requires a single root. The container delegates hit testing to its
    // children so an empty/dismissed overlay does not block the RN surface.
    var body = overlays.length === 1
        ? views
        : "    Stack() {\n".concat(views.split('\n').map(function (line) { return "  ".concat(line); }).join('\n'), "\n") +
            "    }\n" +
            "    .width('100%')\n" +
            "    .height('100%')\n" +
            "    .hitTestBehavior(HitTestMode.None)";
    return ("// @generated by expo-modules-autolinking. Do not edit.\n" +
        "".concat(imports, "\n\n") +
        "@Component\n" +
        "export struct ExpoModulesAppOverlays {\n" +
        "".concat(fields, "\n\n") +
        "  build() {\n".concat(body, "\n  }\n") +
        "}\n");
}
function collectLifecycleDependencies(modules) {
    var dependencies = modules
        .flatMap(function (module) {
        return module.lifecycleDependencies.map(function (dependency) { return (__assign(__assign({}, dependency), { packageName: module.packageName })); });
    })
        .sort(function (a, b) {
        return [a.importPath, a.className, a.localName]
            .join('\0')
            .localeCompare([b.importPath, b.className, b.localName].join('\0'));
    });
    var localNameOwners = new Map();
    var appStorageKeyOwners = new Map();
    for (var _i = 0, dependencies_1 = dependencies; _i < dependencies_1.length; _i++) {
        var dependency = dependencies_1[_i];
        assertUniqueLifecycleValue('localName', dependency.localName, dependency.packageName, localNameOwners);
        assertUniqueLifecycleValue('appStorageKey', dependency.appStorageKey, dependency.packageName, appStorageKeyOwners);
    }
    return dependencies;
}
function assertUniqueLifecycleValue(field, value, packageName, owners) {
    var existingOwner = owners.get(value);
    if (existingOwner) {
        throw new Error("Invalid Harmony lifecycle metadata: duplicate lifecycle ".concat(field, " \"").concat(value, "\" in \"").concat(existingOwner, "\" and \"").concat(packageName, "\""));
    }
    owners.set(value, packageName);
}
function deduplicateLifecycleImports(dependencies) {
    var imports = new Map();
    for (var _i = 0, dependencies_2 = dependencies; _i < dependencies_2.length; _i++) {
        var dependency = dependencies_2[_i];
        imports.set("".concat(dependency.importPath, "\0").concat(dependency.className), {
            className: dependency.className,
            importPath: dependency.importPath,
        });
    }
    return __spreadArray([], imports.values(), true);
}
function escapeEtsString(value) {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function getOhPackageName(importPath) {
    var segments = importPath.split('/');
    var packageName = importPath.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
    if (!packageName) {
        throw new Error("Invalid Harmony ETS import path \"".concat(importPath, "\""));
    }
    return packageName;
}
function copyFileAsync(source, target) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs_1.default.promises.mkdir(path_1.default.dirname(target), { recursive: true })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, fs_1.default.promises.copyFile(source, target)];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function assertSha256Async(filePath, expected, label) {
    return __awaiter(this, void 0, void 0, function () {
        var data, error_7, actual;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fs_1.default.promises.readFile(filePath)];
                case 1:
                    data = _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    error_7 = _a.sent();
                    if ((error_7 === null || error_7 === void 0 ? void 0 : error_7.code) === 'ENOENT') {
                        throw new Error("RNOH compatibility ".concat(label, " HAR does not exist at \"").concat(filePath, "\""));
                    }
                    throw error_7;
                case 3:
                    actual = (0, crypto_1.createHash)('sha256').update(data).digest('hex');
                    if (actual !== expected) {
                        throw new Error("RNOH compatibility ".concat(label, " SHA256 mismatch for \"").concat(filePath, "\": expected ").concat(expected, ", got ").concat(actual));
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function runCompatibilityToolAsync(options) {
    return new Promise(function (resolve, reject) {
        var child = (0, child_process_1.spawn)(options.pythonExecutable, [
            options.scriptPath,
            '--input-har',
            options.inputHarPath,
            '--output-har',
            options.outputHarPath,
            '--profile',
            options.profile,
        ], { stdio: 'inherit' });
        child.once('error', reject);
        child.once('exit', function (code, signal) {
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error("RNOH compatibility tool failed with ".concat(signal ? "signal ".concat(signal) : "exit code ".concat(code))));
            }
        });
    });
}
function resolveHarmonyPythonExecutable() {
    var _a;
    if (process.env.EXPO_HARMONY_PYTHON) {
        return process.env.EXPO_HARMONY_PYTHON;
    }
    var candidates = process.platform === 'darwin' ? ['/opt/homebrew/bin/python3', '/usr/local/bin/python3'] : [];
    return (_a = candidates.find(function (candidate) { return fs_1.default.existsSync(candidate); })) !== null && _a !== void 0 ? _a : 'python3';
}
function replaceTemplatePlaceholdersAsync(root, replacements) {
    return __awaiter(this, void 0, void 0, function () {
        var _i, _a, entry, entryPath, contents, _b, _c, _d, placeholder, value;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _i = 0;
                    return [4 /*yield*/, fs_1.default.promises.readdir(root, { withFileTypes: true })];
                case 1:
                    _a = _e.sent();
                    _e.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 8];
                    entry = _a[_i];
                    entryPath = path_1.default.join(root, entry.name);
                    if (!entry.isDirectory()) return [3 /*break*/, 4];
                    return [4 /*yield*/, replaceTemplatePlaceholdersAsync(entryPath, replacements)];
                case 3:
                    _e.sent();
                    return [3 /*break*/, 7];
                case 4:
                    if (!/\.(?:cmake|ets|json|json5|ts|txt)$/.test(entry.name) && entry.name !== 'CMakeLists.txt') {
                        return [3 /*break*/, 7];
                    }
                    return [4 /*yield*/, fs_1.default.promises.readFile(entryPath, 'utf8')];
                case 5:
                    contents = _e.sent();
                    for (_b = 0, _c = Object.entries(replacements); _b < _c.length; _b++) {
                        _d = _c[_b], placeholder = _d[0], value = _d[1];
                        contents = contents.split(placeholder).join(value);
                    }
                    return [4 /*yield*/, fs_1.default.promises.writeFile(entryPath, contents, 'utf8')];
                case 6:
                    _e.sent();
                    _e.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 2];
                case 8: return [2 /*return*/];
            }
        });
    });
}
function runAppConfigGeneratorAsync(options) {
    return new Promise(function (resolve, reject) {
        var child = (0, child_process_1.spawn)(process.execPath, [options.scriptPath, options.projectRoot, options.destinationDir], { stdio: 'inherit' });
        child.once('error', reject);
        child.once('exit', function (code, signal) {
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error("expo-constants app config generator failed with ".concat(signal ? "signal ".concat(signal) : "exit code ".concat(code))));
            }
        });
    });
}
//# sourceMappingURL=nativeProject.js.map