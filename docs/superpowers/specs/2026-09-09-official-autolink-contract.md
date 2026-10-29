# 官方 link-harmony 0.77.71 真实契约记录（任务一产出）

- 日期：2026-09-09，fixture：/tmp/ehc-fixture（pnpm，node 22）
- 验证对象：`@react-native-oh/react-native-harmony-cli@0.77.71`（npmmirror，与 version-matrix rnohCli 一致）
- 佐证包：`@react-native-ohos/react-native-video`（带 autolinking metadata）、`@react-native-ohos/react-native-safe-area-context@5.6.3`（harmony 仅 alias，无 metadata）

## 调用契约

1. 入口：`<cliRoot>/dist/commands/link-harmony.js` 唯一导出 `commandLinkHarmony`，其 `.func(argv, config, rawArgs)` 为 async、**无返回值**——结果只能靠产物文件判定。
2. rawArgs 键（驼峰）：`harmonyProjectPath`、`nodeModulesPath`、`cmakeAutolinkPathRelativeToHarmony`、`cppRnohPackagesFactoryPathRelativeToHarmony`、`etsRnohPackagesFactoryPathRelativeToHarmony`、`ohPackagePathRelativeToHarmony`、`includeNpmPackages`。前两个必须显式传绝对路径。
3. `includeNpmPackages`：
   - `[]` = **全量**：链接所有「有 HAR 且 package.json 带 `harmony.autolinking`」的包（实测 video 被链接）。
   - 显式列表 = 白名单过滤；单元素含 `;` 会 `split(';')`；列表含不存在包名无副作用、不报错。
   - CLI 侧应传 `[]` 让官方自扫（候选不受 mapping 限制）。
4. 失败语义：`DescriptiveError`（预期错误）仅打日志**不抛出**；只有意外错误抛异常。不能以"未抛错"判成功，必须查产物。

## 识别与 skip 规则（源码 Autolinking.js 实证）

- 遍历项目依赖（pnpm symlink 下正常解析），读 package.json 的 `harmony.autolinking`。
- 无 HAR 文件 → 静默忽略；有 HAR 但 `harmony.autolinking` 缺失 → `[skip]`（日志黄字）。
- metadata 字段：`etsPackageClassName`、`cppPackageClassName`、`cmakeLibraryTargetName`、`ohPackageName`、`mainHarPath`。
- **产物统一以 `ohPackageName` 注册**（ETS import source、CMake `${OH_MODULES_DIR}` 路径、oh-package 依赖键），**与 npm 包名可能不同域**：
  - 默认规则 `npmPackageNameToOHPackageName`：`@scope/name` → `@rnoh/<kebab(scope)>--<kebab(name)>`；多 HAR 追加 `--<harBase>` 后缀。
  - 包可配置为其它域，实测 `react-native-gesture-handler`/`react-native-screens` 配置为 `@react-native-oh-tpl/...`，而其 npm 包名为 `@react-native-ohos/...`——**CLI 覆盖识别必须把产物名归一回 npm 名再与 node_modules 扫描结果比对**，否则同包被误判未覆盖而二次注册（CMake target 同名冲突）。
  - **CLI 合并产物时须把 ohPackageName 域整体改写回 npm 名**（oh-package 依赖键、ETS import source、CMake `${OH_MODULES_DIR}` 路径）：npm 包内 HAR 的实际 `name` 是 npm 名（`@react-native-ohos/...`），ohpm 以 `--strict_ssl` 严格校验依赖键与 HAR name 一致（`00604006 Inconsistent Dep Names`，2026-09-10 nice-app 实证），且 oh_modules 安装目录以 HAR name 命名——tpl 域的 import/路径在安装后必然断裂。entry oh-package 的受管合并须同时清除「上轮受管、本轮不再出现」的旧域键（名域迁移残留会形成同包双键）。
- **无 metadata 的有 HAR 包 = mapping 补充的目标集合**（如 5.6.3 的 safe-area-context）。

## 产物形状（锚点依据）

- 4 文件：ets/cpp/cmake 工厂 + oh-package.json5。
- ETS 骨架：`import type { RNPackageContext, RNOHPackage } from '@rnoh/react-native-openharmony';` 后接 import 区；`return [` … `];` 为实例区（注意官方用 `RNOHPackage`，自研模板是 `RNPackage`——合并时保留官方骨架）。
- CPP：`#include "RNOH/Package.h"` 后为 include 区；`return {` … `};` 为实例区。
- CMake：`function(autolink_libraries target)` 内先 `add_subdirectory("${OH_MODULES_DIR}/<pkg>/src/main/cpp" ./<target>)` 行，后 `set(AUTOLINKED_LIBRARIES` 集合。**官方用 `${OH_MODULES_DIR}`，自研用 `${NODE_MODULES}`，两形式可在同一函数内并存**。
- **oh-package 产物的 `file:` 路径是临时目录层级的深相对路径**（如 `file:../../../../../../../tmp/.../rn_video.har`）——合并进真实 harmony/ 时必须改写为项目相对路径。
- 基础 oh-package 拷入临时目录后，官方在其上合并（旧键保留）——覆盖识别必须以产物内容为准，不能把旧键当官方覆盖。

## 产物缺陷与 CLI 矫正（2026-09-10 nice-app 实证）

1. **合成类名**：包 metadata 缺 `etsPackageClassName`/`cppPackageClassName` 时（实测 gh 2.23.2-rc.1、screens 4.8.1-rc.7 仅有 target 与 ohPackageName），官方按包名合成类名（如 `ReactNativeOhosReactNativeGestureHandlerPackage`）——ETS default import 是别名可编译，**CPP `#include` 是具名头文件、包内实际为 `GestureHandlerPackage.h` 等，ninja fatal**。CLI 以 ETS default import 别名定位合成名，ETS 整行换 mapping.importStatement、实例与 CPP include/make_shared 换 mapping 真实类名。
2. **工厂返回类型**：官方签名 `): RNOHPackage[]`，而旧式包类 `extends RNPackage`（0.77.71 运行时 `RNOHPackage extends RNPackage` 并新增带默认实现的 `createWrappedCustomRNComponentBuilderByComponentNameMap()`）——放进 `RNOHPackage[]` 触发 ArkTS `10505001 missing`。CLI 改写返回类型为 `RNPackage[]` 并补 `RNPackage` 类型导入；运行时对该方法的调用有 `instanceof RNOHPackage` 守卫（EtsRNOHContext.ets:341），旧式包被安全跳过。
