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
exports.resolveModuleAsync = resolveModuleAsync;
exports.generatePackageListAsync = generatePackageListAsync;
exports.resolveExtraBuildDependenciesAsync = resolveExtraBuildDependenciesAsync;
var fs_1 = require("fs");
var path_1 = require("path");
var GENERATED_NATIVE_KINDS = new Set(['turbo-module', 'view', 'ability-lifecycle']);
function resolveModuleAsync(packageName, revision) {
    return __awaiter(this, void 0, void 0, function () {
        var config, identity, hars, hars, primaryHars, primaryHar, cpp_1, ets_1, lifecycleDependencies_1, cpp, ets, lifecycleDependencies;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    config = (_a = revision.config) === null || _a === void 0 ? void 0 : _a.harmonyConfig();
                    if (!config) {
                        return [2 /*return*/, null];
                    }
                    identity = {
                        packageName: packageName,
                        packageVersion: revision.version,
                        packageRoot: revision.path,
                    };
                    if (config.kind === 'rnoh-reuse') {
                        if (!((_b = config.reason) === null || _b === void 0 ? void 0 : _b.trim())) {
                            throw configError(packageName, 'rnoh-reuse requires a non-empty reason');
                        }
                        return [2 /*return*/, __assign(__assign({}, identity), { kind: config.kind, reason: config.reason, lifecycleDependencies: [] })];
                    }
                    if (!(config.kind === 'har')) return [3 /*break*/, 2];
                    return [4 /*yield*/, resolveHarConfigsAsync(packageName, revision.path, config.har)];
                case 1:
                    hars = _e.sent();
                    return [2 /*return*/, __assign(__assign({}, identity), { kind: config.kind, hars: hars, lifecycleDependencies: [] })];
                case 2:
                    if (!(config.kind === 'rnoh-package')) return [3 /*break*/, 4];
                    return [4 /*yield*/, resolveHarConfigsAsync(packageName, revision.path, config.har)];
                case 3:
                    hars = _e.sent();
                    primaryHars = hars.filter(function (har) { return har.primary; });
                    if (hars.length === 1 && primaryHars.length === 0) {
                        hars[0] = __assign(__assign({}, hars[0]), { primary: true });
                    }
                    else if (primaryHars.length !== 1) {
                        throw configError(packageName, 'rnoh-package with multiple HARs requires exactly one primary HAR');
                    }
                    primaryHar = hars.find(function (har) { return har.primary; });
                    cpp_1 = resolvePrebuiltCppConfig(packageName, config);
                    ets_1 = resolvePrebuiltEtsConfig(packageName, config);
                    if (ets_1.importPath !== primaryHar.packageName &&
                        !ets_1.importPath.startsWith("".concat(primaryHar.packageName, "/"))) {
                        throw configError(packageName, "rnoh-package ETS importPath \"".concat(ets_1.importPath, "\" must match primary HAR packageName \"").concat(primaryHar.packageName, "\""));
                    }
                    lifecycleDependencies_1 = (_c = config.lifecycleDependencies) !== null && _c !== void 0 ? _c : [];
                    validateLifecycleDependencies(packageName, lifecycleDependencies_1);
                    return [2 /*return*/, __assign(__assign({}, identity), { kind: config.kind, cpp: cpp_1, ets: ets_1, hars: hars, lifecycleDependencies: lifecycleDependencies_1 })];
                case 4:
                    if (!GENERATED_NATIVE_KINDS.has(config.kind)) {
                        throw configError(packageName, "unsupported Harmony module kind \"".concat(config.kind, "\""));
                    }
                    return [4 /*yield*/, resolveCppConfigAsync(packageName, revision.path, config)];
                case 5:
                    cpp = _e.sent();
                    return [4 /*yield*/, resolveEtsConfigAsync(packageName, revision.path, config)];
                case 6:
                    ets = _e.sent();
                    lifecycleDependencies = (_d = config.lifecycleDependencies) !== null && _d !== void 0 ? _d : [];
                    if (config.kind === 'ability-lifecycle' && lifecycleDependencies.length === 0) {
                        throw configError(packageName, 'ability-lifecycle requires lifecycleDependencies');
                    }
                    validateLifecycleDependencies(packageName, lifecycleDependencies);
                    return [4 /*yield*/, validateLifecycleExportsAsync(packageName, ets.entrypoint, lifecycleDependencies)];
                case 7:
                    _e.sent();
                    return [2 /*return*/, __assign(__assign({}, identity), { kind: config.kind, cpp: cpp, ets: ets, lifecycleDependencies: lifecycleDependencies })];
            }
        });
    });
}
function resolveHarConfigsAsync(packageName, packageRoot, config) {
    return __awaiter(this, void 0, void 0, function () {
        var rawHars, packageNames, packagePaths, hars, _i, rawHars_1, har, packagePath;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    rawHars = config ? (Array.isArray(config) ? config : [config]) : [];
                    if (rawHars.length === 0) {
                        throw configError(packageName, 'har metadata requires packageName and packagePath');
                    }
                    packageNames = new Set();
                    packagePaths = new Set();
                    hars = [];
                    _i = 0, rawHars_1 = rawHars;
                    _c.label = 1;
                case 1:
                    if (!(_i < rawHars_1.length)) return [3 /*break*/, 4];
                    har = rawHars_1[_i];
                    if (!((_a = har.packageName) === null || _a === void 0 ? void 0 : _a.trim()) || !((_b = har.packagePath) === null || _b === void 0 ? void 0 : _b.trim())) {
                        throw configError(packageName, 'har metadata requires packageName and packagePath');
                    }
                    if (packageNames.has(har.packageName)) {
                        throw configError(packageName, "duplicate HAR packageName \"".concat(har.packageName, "\""));
                    }
                    packageNames.add(har.packageName);
                    packagePath = path_1.default.resolve(packageRoot, har.packagePath);
                    if (packagePaths.has(packagePath)) {
                        throw configError(packageName, "duplicate HAR packagePath \"".concat(har.packagePath, "\""));
                    }
                    packagePaths.add(packagePath);
                    return [4 /*yield*/, assertFileAsync(packageName, packagePath, "HAR \"".concat(har.packagePath, "\""))];
                case 2:
                    _c.sent();
                    hars.push(__assign(__assign({}, har), { packagePath: packagePath }));
                    _c.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, hars];
            }
        });
    });
}
function resolvePrebuiltCppConfig(packageName, config) {
    var cpp = config.cpp;
    if (!(cpp === null || cpp === void 0 ? void 0 : cpp.packageClass) || !cpp.header || !cpp.cmakeTarget || !cpp.cmakePath) {
        throw configError(packageName, 'rnoh-package requires complete cpp metadata');
    }
    assertPackageRelativePath(packageName, 'CMake path', cpp.cmakePath);
    return cpp;
}
function resolvePrebuiltEtsConfig(packageName, config) {
    var ets = config.ets;
    if (!(ets === null || ets === void 0 ? void 0 : ets.packageClass) || !ets.importPath || !ets.entrypoint) {
        throw configError(packageName, 'rnoh-package requires complete ets metadata');
    }
    assertPackageRelativePath(packageName, 'ETS entrypoint', ets.entrypoint);
    return ets;
}
function assertPackageRelativePath(packageName, label, value) {
    if (path_1.default.isAbsolute(value) || value.split(/[\\/]/).includes('..')) {
        throw configError(packageName, "".concat(label, " must be relative to the primary HAR package"));
    }
}
function resolveCppConfigAsync(packageName, packageRoot, config) {
    return __awaiter(this, void 0, void 0, function () {
        var cpp, cmakePath, headerPath, cmakeFile, cmakeContents, targetPattern;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cpp = config.cpp;
                    if (!(cpp === null || cpp === void 0 ? void 0 : cpp.packageClass) || !cpp.header || !cpp.cmakeTarget || !cpp.cmakePath) {
                        throw configError(packageName, "".concat(config.kind, " requires complete cpp metadata"));
                    }
                    cmakePath = path_1.default.resolve(packageRoot, cpp.cmakePath);
                    headerPath = path_1.default.join(cmakePath, cpp.header);
                    cmakeFile = path_1.default.join(cmakePath, 'CMakeLists.txt');
                    return [4 /*yield*/, assertFileAsync(packageName, headerPath, "C++ header \"".concat(cpp.header, "\""))];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, assertFileAsync(packageName, cmakeFile, 'CMakeLists.txt')];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, fs_1.default.promises.readFile(cmakeFile, 'utf8')];
                case 3:
                    cmakeContents = _a.sent();
                    targetPattern = new RegExp("\\badd_library\\s*\\(\\s*".concat(escapeRegExp(cpp.cmakeTarget), "(?:\\s|\\))"));
                    if (!targetPattern.test(cmakeContents)) {
                        throw configError(packageName, "CMake target \"".concat(cpp.cmakeTarget, "\" is not declared"));
                    }
                    return [2 /*return*/, __assign(__assign({}, cpp), { cmakePath: cmakePath })];
            }
        });
    });
}
function resolveEtsConfigAsync(packageName, packageRoot, config) {
    return __awaiter(this, void 0, void 0, function () {
        var ets, entrypoint, contents;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ets = config.ets;
                    if (!(ets === null || ets === void 0 ? void 0 : ets.packageClass) || !ets.importPath || !ets.entrypoint) {
                        throw configError(packageName, "".concat(config.kind, " requires complete ets metadata"));
                    }
                    entrypoint = path_1.default.resolve(packageRoot, ets.entrypoint);
                    return [4 /*yield*/, assertFileAsync(packageName, entrypoint, "ETS entrypoint \"".concat(ets.entrypoint, "\""))];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, fs_1.default.promises.readFile(entrypoint, 'utf8')];
                case 2:
                    contents = _a.sent();
                    assertEtsExport(packageName, contents, ets.packageClass);
                    return [2 /*return*/, __assign(__assign({}, ets), { entrypoint: entrypoint })];
            }
        });
    });
}
function validateLifecycleExportsAsync(packageName, entrypoint, dependencies) {
    return __awaiter(this, void 0, void 0, function () {
        var contents, _i, dependencies_1, dependency;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (dependencies.length === 0) {
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, fs_1.default.promises.readFile(entrypoint, 'utf8')];
                case 1:
                    contents = _a.sent();
                    for (_i = 0, dependencies_1 = dependencies; _i < dependencies_1.length; _i++) {
                        dependency = dependencies_1[_i];
                        assertEtsExport(packageName, contents, dependency.className);
                        if (dependency.arkUIOverlay) {
                            assertEtsExport(packageName, contents, dependency.arkUIOverlay.className);
                        }
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function validateLifecycleDependencies(packageName, dependencies) {
    var localNames = new Set();
    for (var _i = 0, dependencies_2 = dependencies; _i < dependencies_2.length; _i++) {
        var dependency = dependencies_2[_i];
        if (!dependency.localName ||
            !dependency.className ||
            !dependency.importPath ||
            !dependency.appStorageKey) {
            throw configError(packageName, 'lifecycleDependencies entries must be complete');
        }
        if (localNames.has(dependency.localName)) {
            throw configError(packageName, "duplicate lifecycle localName \"".concat(dependency.localName, "\""));
        }
        if (dependency.arkUIOverlay &&
            (!dependency.arkUIOverlay.className ||
                !dependency.arkUIOverlay.importPath ||
                !dependency.arkUIOverlay.controllerProperty)) {
            throw configError(packageName, 'arkUIOverlay entries must be complete');
        }
        localNames.add(dependency.localName);
    }
}
function assertEtsExport(packageName, contents, exportName) {
    var exportPattern = new RegExp("\\bexport\\s*\\{[^}]*\\b".concat(escapeRegExp(exportName), "\\b[^}]*\\}"), 'm');
    if (!exportPattern.test(contents)) {
        throw configError(packageName, "ETS export \"".concat(exportName, "\" is not declared"));
    }
}
function assertFileAsync(packageName, filePath, description) {
    return __awaiter(this, void 0, void 0, function () {
        var stats, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fs_1.default.promises.stat(filePath)];
                case 1:
                    stats = _b.sent();
                    if (!stats.isFile()) {
                        throw new Error('not a file');
                    }
                    return [3 /*break*/, 3];
                case 2:
                    _a = _b.sent();
                    throw configError(packageName, "".concat(description, " does not exist at \"").concat(filePath, "\""));
                case 3: return [2 /*return*/];
            }
        });
    });
}
function configError(packageName, message) {
    return new Error("Invalid Harmony autolinking config for \"".concat(packageName, "\": ").concat(message));
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function generatePackageListAsync(modules, targetDirectory, _namespace) {
    return __awaiter(this, void 0, void 0, function () {
        var sortedModules, nativeModules, skippedModules, cpp, ets, cmake;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    sortedModules = __spreadArray([], modules, true).sort(function (a, b) { return a.packageName.localeCompare(b.packageName); });
                    nativeModules = sortedModules.filter(hasGeneratedNativePackage);
                    skippedModules = sortedModules.filter(function (module) { return !hasGeneratedNativePackage(module); });
                    cpp = renderCpp(nativeModules, skippedModules);
                    ets = renderEts(nativeModules, skippedModules);
                    cmake = renderCmake(nativeModules, skippedModules);
                    return [4 /*yield*/, fs_1.default.promises.mkdir(targetDirectory, { recursive: true })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, Promise.all([
                            fs_1.default.promises.writeFile(path_1.default.join(targetDirectory, 'ExpoModulesPackages.cpp'), cpp, 'utf8'),
                            fs_1.default.promises.writeFile(path_1.default.join(targetDirectory, 'ExpoModulesPackages.ets'), ets, 'utf8'),
                            fs_1.default.promises.writeFile(path_1.default.join(targetDirectory, 'expo-modules.cmake'), cmake, 'utf8'),
                        ])];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function hasGeneratedNativePackage(module) {
    return module.cpp != null && module.ets != null;
}
function renderCpp(modules, skippedModules) {
    var includes = modules.map(function (module) { return "#include \"".concat(module.cpp.header, "\""); }).join('\n');
    var packages = modules
        .map(function (module) { return "    std::make_shared<".concat(module.cpp.packageClass, ">(ctx)"); })
        .join(',\n');
    return ("// @generated by expo-modules-autolinking. Do not edit.\n" +
        "#include \"RNOH/PackageProvider.h\"\n" +
        (includes ? "".concat(includes, "\n") : '') +
        "\nusing namespace rnoh;\n\n" +
        "std::vector<std::shared_ptr<Package>> PackageProvider::getPackages(Package::Context ctx) {\n" +
        "  return {".concat(packages ? "\n".concat(packages, "\n  ") : '', "};\n") +
        "}\n" +
        renderSkippedComments(skippedModules, '//'));
}
function renderEts(modules, skippedModules) {
    var imports = modules
        .flatMap(function (module) { return __spreadArray([
        {
            className: module.ets.packageClass,
            importPath: module.ets.importPath,
            importKind: module.ets.importKind,
        }
    ], module.lifecycleDependencies.map(function (dependency) { return ({
        className: dependency.className,
        importPath: dependency.importPath,
        importKind: 'named',
    }); }), true); })
        .sort(function (a, b) {
        var importPathComparison = a.importPath.localeCompare(b.importPath);
        return importPathComparison || a.className.localeCompare(b.className);
    })
        .map(function (_a) {
        var className = _a.className, importPath = _a.importPath, importKind = _a.importKind;
        return importKind === 'default'
            ? "import ".concat(className, " from '").concat(importPath, "';")
            : "import { ".concat(className, " } from '").concat(importPath, "';");
    })
        .join('\n');
    var lifecycleSetup = modules
        .flatMap(function (module) {
        return module.lifecycleDependencies.flatMap(function (dependency) { return [
            "  const ".concat(dependency.localName, " = AppStorage.get<").concat(dependency.className, ">('").concat(escapeEtsString(dependency.appStorageKey), "');"),
            "  if (!".concat(dependency.localName, ") {"),
            "    throw new Error('Missing required Harmony lifecycle dependency \"".concat(escapeEtsString(dependency.appStorageKey), "\" for ").concat(escapeEtsString(module.packageName), "');"),
            "  }",
        ]; });
    })
        .join('\n');
    var packages = modules
        .map(function (module) {
        var argumentsList = __spreadArray([
            'ctx'
        ], module.lifecycleDependencies.map(function (_a) {
            var localName = _a.localName;
            return localName;
        }), true);
        return "    new ".concat(module.ets.packageClass, "(").concat(argumentsList.join(', '), ")");
    })
        .join(',\n');
    return ("// @generated by expo-modules-autolinking. Do not edit.\n" +
        "import type { RNPackage, RNPackageContext } from '@rnoh/react-native-openharmony';\n" +
        (imports ? "".concat(imports, "\n") : '') +
        "\nexport function getExpoModulesPackages(ctx: RNPackageContext): RNPackage[] {\n" +
        (lifecycleSetup ? "".concat(lifecycleSetup, "\n") : '') +
        "  return [".concat(packages ? "\n".concat(packages, "\n  ") : '', "];\n") +
        "}\n" +
        renderSkippedComments(skippedModules, '//'));
}
function renderCmake(modules, skippedModules) {
    var cmakeEntries = deduplicateCmakeEntries(modules);
    var addSubdirectories = cmakeEntries
        .map(function (_a) {
        var packageName = _a.packageName, cmakeSource = _a.cmakeSource;
        return "add_subdirectory(\"".concat(cmakeSource, "\" ").concat(cmakeBuildDirectory(packageName), ")");
    })
        .join('\n');
    var targets = cmakeEntries.map(function (_a) {
        var cmakeTarget = _a.cmakeTarget;
        return "  ".concat(cmakeTarget);
    }).join('\n');
    return ("# @generated by expo-modules-autolinking. Do not edit.\n" +
        (addSubdirectories ? "".concat(addSubdirectories, "\n\n") : '\n') +
        "target_link_libraries(rnoh_app PUBLIC".concat(targets ? "\n".concat(targets, "\n") : '', ")\n") +
        renderSkippedComments(skippedModules, '#'));
}
function deduplicateCmakeEntries(modules) {
    var _a;
    var entries = new Map();
    for (var _i = 0, modules_1 = modules; _i < modules_1.length; _i++) {
        var module_1 = modules_1[_i];
        var cmakeSource = getCmakeSource(module_1);
        var existing = entries.get(module_1.cpp.cmakeTarget);
        if (existing && existing.cmakeSource !== cmakeSource) {
            throw configError(module_1.packageName, "CMake target \"".concat(module_1.cpp.cmakeTarget, "\" resolves to multiple source directories"));
        }
        entries.set(module_1.cpp.cmakeTarget, {
            packageName: (_a = existing === null || existing === void 0 ? void 0 : existing.packageName) !== null && _a !== void 0 ? _a : module_1.packageName,
            cmakeSource: cmakeSource,
            cmakeTarget: module_1.cpp.cmakeTarget,
        });
    }
    return __spreadArray([], entries.values(), true);
}
function getCmakeSource(module) {
    var _a;
    if (module.kind !== 'rnoh-package') {
        return module.cpp.cmakePath;
    }
    var primaryHar = (_a = module.hars) === null || _a === void 0 ? void 0 : _a.find(function (har) { return har.primary; });
    if (!primaryHar) {
        throw configError(module.packageName, 'rnoh-package primary HAR is missing');
    }
    return "${OH_MODULES_DIR}/".concat(primaryHar.packageName, "/").concat(module.cpp.cmakePath);
}
function cmakeBuildDirectory(packageName) {
    return "expo_modules_".concat(packageName.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, ''));
}
function renderSkippedComments(modules, commentPrefix) {
    if (modules.length === 0) {
        return '';
    }
    return "\n".concat(modules
        .map(function (module) {
        var _a;
        var reason = (_a = module.reason) !== null && _a !== void 0 ? _a : (module.kind === 'har'
            ? 'provided by a prebuilt HAR'
            : "kind ".concat(module.kind, " has no generated package"));
        return "".concat(commentPrefix, " ").concat(module.packageName, ": skipped native package generation (").concat(reason, ")");
    })
        .join('\n'), "\n");
}
function escapeEtsString(value) {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function resolveExtraBuildDependenciesAsync(_projectNativeRoot) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, null];
        });
    });
}
//# sourceMappingURL=harmony.js.map