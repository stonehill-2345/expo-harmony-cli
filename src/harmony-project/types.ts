/**
 * 鸿蒙原生包映射表条目。
 *
 * 每个条目显式存 6 字段，不依赖包自身的 harmony.autolinking 声明
 * （查证确认 safe-area/reanimated/camera-roll 等均未声明，扫包不可靠）。
 * 数据 ground truth 来自 ohrn 实物三件套：
 *   harmony/entry/src/main/cpp/CMakeLists.txt
 *   harmony/entry/src/main/cpp/PackageProvider.cpp
 *   harmony/entry/src/main/ets/RNPackagesFactory.ets
 *   harmony/entry/oh-package.json5
 */
export interface HarmonyEtsPackage {
  /** 一条完整 ArkTS import；同一 import 可导出多个 Package 类。 */
  importStatement: string;
  classNames: string[];
}

export interface HarmonyCppPackage {
  className: string;
  namespace: 'rnoh' | null;
}

export interface HarmonyPackageMappingEntry {
  /** node_modules 包名 = oh-package key（对齐 ohrn，用 @react-native-ohos/*） */
  npmPackageName: string;
  /** harmony/<harName> 文件名（oh-package.json5 的 file: 引用末段） */
  harName: string;
  /** 包内 CMakeLists.txt 相对路径；缺省时从 oh_modules 的 src/main/cpp 解析。 */
  cppSourcePath?: string;
  /** CMake target；纯 ETS/codegen 包可省略。 */
  cmakeLibraryTargetName?: string;
  /** 多个 ETS Package；空数组代表仅 C++ 注册。 */
  etsPackages?: HarmonyEtsPackage[];
  /** 多个 C++ Package；空数组代表纯 ETS/codegen 包。 */
  cppPackages?: HarmonyCppPackage[];

  /** 已发布映射的兼容字段，新条目应使用 etsPackages/cppPackages。 */
  etsPackageClassName?: string;
  cppPackageClassName?: string;
  cppPackageNamespace?: 'rnoh' | null;
  importStatement?: string;
}

/**
 * 鸿蒙工程生成选项（后续 Task create-harmony-app 使用，本任务仅定义类型）。
 */
export type HarmonyTemplateSource = 'bundled' | 'cdn' | 'auto';

export interface HarmonyGenerationOptions {
  bundleName?: string;
  appName?: string;
  rnohNpmPackageName?: string;
  rnohCliNpmPackageName?: string;
  force?: boolean;
  skipMetroConfig?: boolean;
  templateSource?: HarmonyTemplateSource;
}
