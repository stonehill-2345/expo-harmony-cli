# Expo Harmony CLI 1.5.0 SDK54 Patch 产品化设计

日期：2026-09-28
工作分支：`feat/V1.5.0-chensq`
基线分支：`feat/V1.5.0`
正式仓库：`<repository-root>`

## 1. 背景

`feat/V1.5.0` 已迁入并验收 Expo SDK54 Harmony MVP 的十四个 Expo 包。验收使用官方 `create-expo-app@5.0.0` 创建 fresh blank/default 项目，再以十四个正式仓库 TGZ 和十一个固定外部 TGZ 接管依赖，完成 Debug、clean Release 和设备交互验证。

现有 `apps/cli` 仍是迁移前产品逻辑：SDK52/SDK54 共用 injector、shim、自定义入口、旧 compatibility table 和旧 Harmony generator。当前 `content/patches/sdk-54` 仅覆盖早期局部兼容，不包含迁移后完整的 `@expo/cli`、Metro、Autolinking 和 Expo Module Harmony 能力，不能直接作为 1.5.0 产品基线。

本设计选择过渡性的 package-level patch 分发：先让 CLI 1.5.0 无私有制品服务器即可公开分发；后续再将 SDK54 切换为公开 TGZ 或公开 npm 包。

## 2. 目标与完成标准

CLI 1.5.0 必须满足：

1. SDK52 继续使用现有 patch/injector/shim/generator 流程，行为和产物不变。
2. SDK54 调用官方 `npx create-expo-app@5.0.0` 创建 `blank-typescript` 或 `default@sdk-54` 项目。
3. SDK54 Harmony 支持进入安装包级 patch，不生成应用运行时 shim、polyfill、自定义 Harmony 入口或 Metro 绕行。
4. SDK54 项目通过官方命令入口执行：
   - `npx expo prebuild --platform harmony`
   - `npx expo run:harmony`
   - `npx expo start`
5. SDK54 patch 对应精确版本，错误版本、缺失 patch、patch 应用失败和模板漂移必须失败关闭。
6. 从真实 `expo-harmony-cli-1.5.0.tgz` 安装 CLI 后，fresh blank/default 均完成 install、prebuild、Debug、clean Release 和无 Metro cold start 验收。
7. SDK54 fresh 项目不存在：
   - `index.harmony.js`
   - `shims/`
   - `scripts/postinstall-harmony.js`
   - SDK52 自定义 bundle/start 脚本
   - 为 Harmony 绕行而新增的应用侧 `metro.config.js`
8. patch 分发模式允许保留 `patches/`、`patch-package` 和安全合并的 `postinstall`，用于删除 `node_modules` 后重装时恢复 package-level Harmony 支持。

## 3. 非目标

本任务不包含：

- 自动迁移 CLI 1.4 或更早版本创建的 SDK54 项目；
- SDK55 及更高 Expo SDK；
- Yarn/Bun 的 SDK54 产品承诺；
- `expo-image` Harmony backend；
- 14+11 包的 GitHub Release、GitHub Packages、私有 registry 或公共 npm 分发；
- npm publish、Git tag、GitHub Release、registry 写入；
- 生产签名、商店发布、完整真机矩阵；
- SDK52 重构、清理或版本升级。

## 4. 固定版本基线

### 4.1 Expo 与 React Native

| Package | Version |
| --- | --- |
| `create-expo-app` | `5.0.0` |
| `expo` | `54.0.37` |
| `@expo/cli` | `54.0.27` |
| `@expo/metro-config` | `54.0.17` |
| `expo-router` | `6.0.24` |
| `react` | `19.1.1` |
| `react-native` | `0.82.1` |
| `@react-native-oh/react-native-harmony` | `0.82.30` |
| `@react-native-oh/react-native-harmony-cli` | `0.82.30` |

十四个 Expo 包的完整版本集合以 `scripts/sdk54/fixture-contract.mjs` 的 `EXPO_ARCHIVE_VERSIONS` 为唯一事实来源，不在 `apps/cli` 维护第二份手写版本表。

### 4.2 已验收外部包

| JS package | Version | Harmony package | Version |
| --- | ---: | --- | ---: |
| `react-native-gesture-handler` | `2.30.0` | `@react-native-ohos/react-native-gesture-handler` | `2.30.1` |
| `react-native-reanimated` | `4.2.1` | `@react-native-ohos/react-native-reanimated` | `4.0.1` |
| `react-native-safe-area-context` | `5.6.2` | `@react-native-ohos/react-native-safe-area-context` | `5.6.3` |
| `react-native-screens` | `4.17.1` | `@react-native-ohos/react-native-screens` | `4.9.0` |
| `react-native-worklets` | `0.7.1` | `@react-native-ohos/react-native-worklets` | `1.0.0` |

CLI 1.5.0 不采用当前 compatibility table 中未经本轮验收的 Harmony 版本 `2.30.2`、`4.0.2`、`5.6.4`、`1.0.1`。

## 5. 总体架构

```text
expo-harmony-cli create
        |
        +-- sdk-52 --> 现有 runCreate legacy 主链路（保持原样）
        |
        +-- sdk-54 --> runSdk54Create
                         |
                         +-- 官方 create-expo-app@5.0.0 --no-install
                         +-- 验证官方模板契约与精确版本
                         +-- default 两文件 expo-image 确定性替换
                         +-- 写入精确 14+11 依赖集合
                         +-- 复制版本化 package patches
                         +-- 安全合并 postinstall
                         +-- npm/pnpm install
                         +-- 显式验证 patch 标记、运行入口与版本
                         +-- 写入 SDK54 managed-state 和 SDK-aware 文档
```

`creator.ts` 只增加 SDK54 早期分流；现有 SDK52 主体不搬迁、不重构，降低回归风险。SDK54 新逻辑放入独立目录，不能调用完整 `injectHarmonyBaseline()`、`scanAndAdapt()` 或 `cleanupHTemplateCode()`。

## 6. 组件设计

### 6.1 创建分流

- `apps/cli/src/creator.ts`
  - 保留现有参数解析和 SDK 选择。
  - SDK54 调用 `runSdk54Create()` 后立即返回。
  - SDK52 继续执行当前代码。
- `apps/cli/src/sdk54/create.ts`
  - 编排 SDK54 fresh create。
  - 不包含 patch 内容生成逻辑。
  - 对每个阶段提供可定位的中文错误。

SDK54 新增模板参数：

```text
--template blank-typescript
--template default
```

未指定时保持现有产品默认值 `default`。SDK52 暂不扩展模板矩阵。

实际命令固定为：

```bash
npx create-expo-app@5.0.0 <name> --template blank-typescript --no-install
npx create-expo-app@5.0.0 <name> --template default@sdk-54 --no-install
```

### 6.2 模板契约与 expo-image 替换

- `apps/cli/src/sdk54/template-contract.ts`
  - 验证 `package.json`、`app.json` 和入口文件存在。
  - 验证 Expo/React/React Native 版本与固定基线一致。
  - default 模板验证两个目标文件仍包含已知 `expo-image` import 和已验收的简单 Image 用法。
- `apps/cli/src/sdk54/default-image-substitution.ts`
  - 只修改：
    - `app/(tabs)/index.tsx`
    - `app/(tabs)/explore.tsx`
  - 将已知 `expo-image` import 替换为 React Native `Image` import。
  - 删除 fixture 的 `expo-image` 依赖。
  - 任一预期不满足时不做部分替换，创建流程失败。

不得使用宽泛正则修改未知模板，不得声称 `expo-image` 已适配。

### 6.3 Patch manifest

- `apps/cli/src/sdk54/patch-manifest.ts`
  - 声明 patch-set id、目标包名、精确版本、patch 文件名和安装后探针。
  - 版本值从共享 SDK54 catalog/contract 生成或导入，不能复制为第三份独立常量。
- `apps/cli/content/patches/sdk-54/manifest.json`
  - 随 CLI npm 包发布。
  - 使用稳定排序。
  - 不包含本机路径、凭据、registry 或临时 TGZ 地址。

每个 patch 只针对一个 npm 包。不存在把十四包拼接成单文件的巨型 patch。

### 6.4 Patch 生成

- `scripts/sdk54/generate-cli-patches.mjs`
  1. 在一次性目录生成正式仓库十四包发布型 TGZ。
  2. 从公共 npm 获取相同 name/version 的官方发布包作为 patch 基线。
  3. 在隔离 fixture 中安装官方发布包。
  4. 将适配包发布内容覆盖到对应 `node_modules/<package>`。
  5. 排除仅用于仓库 provenance 的 `private: true` 和 `harmony-upstream.json`，保留运行时 manifest 差异。
  6. 使用固定 patch-package 版本生成规范化 patch。
  7. 删除时间戳、本机绝对路径和非运行时噪声。
  8. 对生成结果执行确定性 A/B 比较。

生成对象必须以 npm 实际发布内容为基线，而不是以 Expo Git 工作树为基线。patch 必须包含运行时使用的 `build/**`、必要的 `harmony/**`、平台文件和 manifest 字段；只修改 `src/**` 不算完成。

外部十一包先将公共 npm `npm pack` 结果与已验收 TGZ 做 manifest/file/hash 对比：

- 相同：直接安装公共精确版本；
- 仅有明确、可审计的文本差异：生成独立 package patch；
- 无公开精确版本、包含无法 patch 的二进制差异或许可证不允许重新分发：本任务失败关闭，不以内置私有 TGZ绕过。

### 6.5 Patch 安装与重装

- `apps/cli/src/sdk54/install-patches.ts`
  - 复制 manifest 声明的 patch 到项目 `patches/`。
  - 添加精确版本 `patch-package`。
  - 保留用户原有 `postinstall`，按 `existing && patch-package --error-on-fail --error-on-warn` 合并。
  - 已含同一命令时保持幂等。
  - 检测冲突的 patch 管理方式时失败，不静默覆盖。

SDK54 1.5.0 验收 npm 和 pnpm。Yarn/Bun 在创建开始前给出明确不支持错误。使用 `--ignore-scripts` 或禁用 lifecycle 后，安装后探针必须检测出 patch 未生效并失败。

### 6.6 安装后探针

- `apps/cli/src/sdk54/verify-runtime.ts`
  - 检查全部精确包版本。
  - 检查：
    - `@expo/cli/build/bin/cli`
    - `@expo/metro-config/build/withHarmony.js`
    - `expo-modules-autolinking/build/platforms/harmony/**`
  - 执行无副作用 probe，确认 Harmony platform dispatch 和 CLI command registration 存在。
  - 检查核心 Expo Harmony native/source 入口存在。
  - 检查项目不存在 SDK52 shim/入口绕行文件。

不能只以 patch-package 退出码判定成功。

### 6.7 Managed state 与后续命令

新 SDK54 项目记录模式：

```json
{
  "sdk": "sdk-54",
  "mode": "sdk54-package-patch",
  "template": "default",
  "patchSet": "sdk54-mvp-1",
  "expo": "54.0.37",
  "rnoh": "0.82.30"
}
```

具体 schema 与现有 managed-state 兼容扩展，不覆盖用户手工字段。

对于 `sdk54-package-patch` 项目：

- `expo-harmony-cli prebuild --platform harmony` 可兼容性转发到本地 `npx expo prebuild --platform harmony`，但文档主路径使用官方命令；
- `sync` 不调用旧自研 generator，提示使用官方 prebuild/autolinking；
- `scan/install/uninstall` 不得落入 SDK52 shim/injector 逻辑；本任务只保证 fresh 基线，额外原生模块在 1.5.0 中失败关闭并给出范围说明；
- `doctor` 检查精确版本、patch-set、postinstall、runtime probes 和旧 bypass 文件。

旧 SDK54 项目若存在 `index.harmony.js`、`shims/` 或旧 managed-state，CLI 只报告“legacy SDK54 project”，不自动清理或迁移。

### 6.8 Compatibility table

SDK52 table 不变。

SDK54 table 必须：

- 使用已验收外部包版本；
- 不再将 `expo-font`、`expo-system-ui`、`expo-web-browser` 删除；
- 不再将已迁移的 `expo-splash-screen` 视为旧 unsupported；
- 移除空实现、假模块和已经由十四包真实 Harmony backend 取代的旧 patch；
- SDK55 及更高版本明确拒绝，不能继续由 `major >= 54` 自动归入 SDK54。

## 7. 官方 Expo 命令语义

SDK54 demo 使用官方命令入口，但执行的是安装后已应用 Harmony patch 的 Expo npm 包：

```bash
npx expo prebuild --platform harmony
npx expo run:harmony --device <device>
npx expo run:harmony --configuration Release --no-build-cache --device <device>
npx expo start
```

“官方命令”不等于未经修改的 upstream npm 内容；Harmony 参数和实现由 package-level patch 添加。CLI 文档必须明确这一点，不能让用户误以为 Expo upstream 已原生发布 Harmony 支持。

## 8. 文档设计

SDK52 继续注入现有 legacy 文档。

SDK54 使用单独文档模板，主命令为官方 Expo 命令，不出现：

- `index.harmony.js`
- `shims/`
- `pnpm start:harmony`
- 自定义 bundle 脚本
- “不要使用 npx expo prebuild”

SDK54 文档说明：精确版本、patch 生命周期、重新安装、doctor、已知 `expo-image` 替换、单层 Router `dismissTo` 和普通 ArkWeb 能力边界。

## 9. 错误处理与原子性

- 项目名、SDK、模板和包管理器在创建目录前完成校验。
- `create-expo-app` 失败时保留底层 stdout/stderr 摘要。
- 官方模板契约失败时不继续安装或修改未知文件。
- default 两文件替换先验证后一次性写入，避免半完成状态。
- patch 复制、manifest 和 package.json 更新使用临时文件加原子 rename。
- install 或 patch probe 失败时保留项目目录和诊断，不自动递归删除用户目录。
- 错误信息给出失败阶段、目标包、预期版本和恢复操作。

## 10. 安全、许可证与公开分发边界

- patch 文件视为第三方源码衍生物，随 CLI 打包时必须保留适用的 LICENSE/NOTICE。
- 生成流程拒绝凭据、私有 registry、本机路径、签名材料、HAP/HAR/TGZ 和构建缓存进入 Git 或 CLI 包。
- 生成 patch 不执行未 allowlist 的 package lifecycle。
- 用户输入不拼接 shell；继续使用参数化 `spawn`/`execFile`。
- 外部包无公开合法来源时停止，不将本机 TGZ复制进开源仓库。

## 11. 测试策略

### 11.1 单元与契约测试

- SDK 参数和 template 参数解析；
- SDK52 调用序列不变；
- SDK54 不调用 legacy injector/scanner/cleanup；
- blank/default 官方 create 命令精确 argv；
- default 模板契约和原子 image substitution；
- 版本矩阵与 fixture contract 一致；
- SDK55 拒绝；
- postinstall 合并、幂等和冲突；
- patch manifest 完整性；
- 安装后 runtime probes；
- legacy SDK54 项目只诊断不清理；
- SDK54 docs 不含 forbidden legacy 指引。

### 11.2 Patch 生成测试

- 基线为 npm 发布包；
- 两轮生成字节一致；
- patch 无绝对路径、凭据和二进制泄漏；
- patch 包含三个关键发布型运行入口；
- 对未修改官方包不生成噪声 patch；
- 外部公共包与已验收 TGZ 差异报告完整；
- 错误版本应用 patch 必须失败。

### 11.3 CLI 包黑盒测试

修复现有 `test:pack` 临时 symlink 问题后：

1. `pnpm pack:cli` 生成真实 TGZ；
2. 在隔离目录安装 TGZ；
3. 只从 packed CLI 执行 create；
4. 验证 patch、manifest、dist 和 SDK-aware docs 均包含；
5. 删除 `node_modules` 后重新 install，patch 自动恢复；
6. 禁用 lifecycle 后 runtime probe 明确失败。

### 11.4 设备验收

对 npm 和 pnpm 至少各完成安装链路；设备主验收固定一套包管理器并记录另一套的 install/prebuild 结果。

Blank：

- fresh create；
- 应用文件不修改；
- official prebuild；
- Debug；
- clean Release；
- embedded bundle 一致；
- Metro 停止后 cold start；
- 官方 blank 文本。

Default：

- fresh create；
- 只允许两处 image substitution 和依赖调整；
- Tabs、MaterialIcons、RN Image；
- Modal、单层 `dismissTo`、物理 Back 与 custom animation；
- ArkWeb open/close；
- Debug reload；
- clean Release 和无 Metro cold start。

## 12. 发布设计边界

代码完成后先生成 CLI 1.5.0 发布候选 TGZ，不执行 publish。发布候选必须通过：

```text
type-check
CLI unit tests
CLI pack tests
SDK54 patch generation/audit
SDK54 repository check
blank/default packed-CLI E2E
```

版本升级为 `1.5.0`、CHANGELOG、npm provenance、2FA/OIDC、dist-tag 和 GitHub Release 属于发布收尾阶段；只有用户再次明确授权后才执行 commit、push、tag 或 publish。

## 13. 决策摘要

- 先 patch，后公开 TGZ/npm 制品；
- SDK52 legacy，SDK54 package-patch；
- SDK54 无 shim/polyfill/自定义入口；
- patch 基于 npm 发布物并覆盖 build/runtime 输出；
- default 沿用已验收的两文件 image substitution；
- 外部包版本锁定为 2026-09-28 MVP 验收集合；
- npm+pnpm 首发，Yarn/Bun 不承诺；
- fresh create 优先，旧 SDK54 项目不自动迁移；
- 官方 Expo 命令入口，patched Expo 实现；
- 不发布、不上传 registry、不写私有地址。
