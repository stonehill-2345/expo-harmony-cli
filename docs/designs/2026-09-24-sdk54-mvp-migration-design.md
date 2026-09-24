# Expo SDK54 Harmony MVP 迁移设计

日期：2026-09-24
目标分支：`feat/V1.5.0`
目标仓库：`expo-harmony-cli`
迁移来源：`expo-harmony-template@2704a48cc52781f510b3996af17c882fb82e1090`

## 1. 背景

`expo-harmony-template` 是为 Expo SDK54 Harmony 集成验证临时建立的独立 Expo 源码快照仓库。它已经完成 SDK54 Harmony MVP 的源码实现、包级测试、blank/tabs/default 模板 Debug 与 Release E2E，但不适合作为长期公开产品仓库：其中包含上游源码快照、历史 evidence、临时验证工程和团队协作文档。

`expo-harmony-cli` 的 `feat/V1.5.0` 已完成 monorepo 骨架迁移，当前 `apps/cli` 是唯一实际工作区包，`apps/example` 和 `packages` 为 SDK 源码及示例预留。本设计将临时仓库中的已验收 MVP 迁入该正式开源 monorepo，并建立后续版本的源码、构建、测试和分发边界。

## 2. MVP 定义

v1.5.0 定位为：

> Expo SDK54 Harmony Toolchain MVP 第一版。

已纳入 MVP：

- Expo 54.0.37、React 19.1.1、React Native 0.82.1、RNOH 0.82.30；
- Harmony autolinking、native template、prebuild、`run:harmony`；
- Debug Metro 与 Release embedded bundle；
- blank、tabs/Router、default Welcome/Home/Explore 三类模板；
- Constants、Asset、Linking、Font、StatusBar、SplashScreen、SystemUI；
- Router 基础导航、Modal 物理 Back、单层 `dismissTo` 原生退场动画；
- WebBrowser 普通 ArkWeb 打开和关闭；
- HDC server 初次设备发现的一次性恢复；
- deterministic package build、内部依赖边审计及 Debug/Release E2E。

不纳入 v1.5.0：

- `expo-image` Harmony 原生后端；default E2E 只允许在验证 fixture 将两处 `expo-image` 用法替换为 React Native `Image`；
- WebBrowser 完整 OAuth、外部认证应用 Want 回跳、系统浏览器 Cookie/SSO；
- 多层 `dismissTo` 的 native-first 动画；
- 生产签名、混淆、商店流程、物理真机矩阵；
- 十四个 Expo Harmony 包的独立 npm 发布；
- 完整 Android/iOS 回归。

## 3. 核心决策

### 3.1 Monorepo 保存真实源码

十四个 MVP 包的真实源码进入 `packages/`，作为 Harmony 实现、包级测试和后续维护的唯一 source of truth：

```text
packages/
├── @expo/
│   ├── cli/                 # @expo/cli
│   └── metro-config/        # @expo/metro-config
├── expo/
├── expo-asset/
├── expo-constants/
├── expo-font/
├── expo-linking/
├── expo-modules-autolinking/
├── expo-modules-core/
├── expo-router/
├── expo-splash-screen/
├── expo-status-bar/
├── expo-system-ui/
└── expo-web-browser/
```

每个包保留上游 package name 和 SDK54 对应版本，但在 v1.5.0 中设置为不可独立发布。包目录必须保留原 Expo MIT 许可证头和上游文件结构，不以重新格式化或无关重构制造额外 diff。

### 3.2 v1.5.0 只发布 CLI

v1.5.0 唯一公开 npm 包仍是：

```text
apps/cli -> expo-harmony-cli
```

十四个源码包只作为开发和生成输入。CLI 继续向用户项目安装 Expo 官方同版本包，并应用仓库生成的 SDK54 Harmony patch、模板和配置。这样避免占用 Expo 官方包名，也不要求用户直接消费整个 monorepo。

### 3.3 源码生成 patch，禁止双重手工维护

`apps/cli/content/patches/sdk-54` 继续作为 CLI 发布物的一部分，但不再是手工实现的唯一来源。

根级生成流程必须：

1. 根据每个包的上游元数据取得官方同版本基线；
2. 将 `packages/<name>` 与官方基线做确定性 diff；
3. 生成 `apps/cli/content/patches/sdk-54/<package>+<version>.patch`；
4. 与仓库已提交 patch 逐字节比较；
5. 若源码和 patch 不一致，CI 失败。

每个迁入包新增 `harmony-upstream.json`：

```json
{
  "packageName": "expo-router",
  "version": "6.0.24",
  "expoCommit": "5b42e3d21e0ac5e086752361ca8a5cb4de53bec1",
  "publish": false
}
```

需要 npm tarball integrity 的包在该文件中增加 `tarballIntegrity`。不得记录本机路径、内网 registry 或凭据。

### 3.4 Native template 单一来源

Harmony native project 的正式模板来源为：

```text
packages/expo-modules-autolinking/templates/harmony/
```

`apps/cli/templates/harmony-sdk-54` 是 CLI 发布阶段生成或同步的消费副本，不允许两边独立手改。根级模板同步命令生成 CLI 副本、manifest 和文件 hash；CI 重新生成并比较。

### 3.5 示例项目只保留公共源码

`apps/example` 保存一个公开可运行的 SDK54 default 风格 fixture，覆盖：

- Welcome/Home/Explore；
- React Native Image 静态 PNG；
- Tabs 和 Router Modal；
- 单层 `dismissTo`、物理 Back；
- WebBrowser 普通打开/关闭；
- SplashScreen、SystemUI、Asset、Font、Linking。

示例仓库不提交 `harmony/`、`node_modules`、`oh_modules`、HAP、HAR、TGZ、设备日志、截图或本机配置。CI 和本机验收必须从无 native 工程状态重新生成。

## 4. 构建与命令

根 `package.json` 增加以下命令：

```text
pnpm sdk54:build
pnpm sdk54:test
pnpm sdk54:patch
pnpm sdk54:pack
pnpm sdk54:audit
pnpm sdk54:e2e
pnpm check
```

职责：

- `sdk54:build`：按拓扑构建十四个包，验证生成文件完整；
- `sdk54:test`：运行 CLI、Autolinking、Router、Splash/SystemUI、WebBrowser 和包级 Harmony 定向测试；
- `sdk54:patch`：从真实源码生成 CLI SDK54 patches 和 native template 副本；
- `sdk54:pack`：双次构建本地 TGZ，要求逐字节一致；
- `sdk54:audit`：检查包数、版本、内部依赖边、绝对路径、凭据和禁止制品；
- `sdk54:e2e`：创建 fresh blank、tabs、default 工程并执行可用的主机级验证；
- `check`：类型检查、单元测试、产物测试、patch/template drift、包审计。

DevEco/HDC 设备测试不能在普通 Linux CI 冒充通过。CI 分为：

1. portable gate：类型、测试、build、patch/template、pack/audit；
2. macOS Harmony gate：DevEco/Hvigor Debug/Release；
3. device evidence gate：模拟器或真机，由受控 runner 或发布前人工执行。

## 5. 迁移规则

### 5.1 迁入

- 十四个包的生产源码、必要 build 产物、Harmony README 和测试；
- native template、HAR transform、RNOH compatibility patch 生成逻辑；
- CLI `prebuild`、`run:harmony`、HDC 恢复和 Release asset layout；
- M2-02 最终结果中明确的公共边界；
- 公开可复现的示例源码和测试命令。

### 5.2 不迁入

- `docs/harmony-sdk54/evidence` 历史设备日志、截图和中间失败产物；
- `/private/tmp`、本机 PID、绝对路径和旧工作区路径；
- HAP、HAR、TGZ、`node_modules`、`oh_modules`、`.hvigor`、`.cxx`；
- 团队 A/B/C 分工过程文档；
- 临时诊断日志和被撤回的实现；
- 未经最终 E2E 证明的 `expo-image` Harmony 实现。

历史结论只在公开迁移报告中摘要，不复制海量内部 evidence。

## 6. 与 v1.4.0 的兼容处理

v1.5.0 不是在旧 SDK54 patch 上继续叠加，而是以已验收 MVP 源码重新生成 SDK54 适配内容。

迁移时必须逐项处理：

- 旧 `expo-image@3.0.11` patch 标为 `experimental-not-in-mvp` 或从自动适配表移除；
- 已由 SDK-owned 实现替代的应用 `index.harmony.js`、Metro shim、postinstall 绕行不得在 SDK54 新路径重复注入；
- SDK52 保持现有路径和行为，不因 SDK54 迁移被重写；
- 同一包只能有一个 SDK54 自动适配来源；发现旧 patch 与新源码重复时，以新源码生成结果替换旧 patch；
- CLI upgrade/scan 必须能识别 v1.4 managed state，并给出迁移或重建提示。

## 7. 许可证与开源要求

- 根仓库继续使用 MIT；
- 迁入的 Expo 文件保留原版权头；
- `NOTICE.md` 记录 Expo、Meta/RN、RNOH 及第三方来源；
- 新增 `docs/sdk54-upstream.md`，列出十四个包、版本、上游 commit 和修改范围；
- 生成 patch 不删除上游许可证；
- 发布包内容测试禁止包含私有域名、token、证书、签名材料和本机路径；
- Git 历史中不提交二进制设备制品和依赖缓存。

## 8. 验收标准

v1.5.0 迁移完成必须同时满足：

1. 十四个包全部进入 workspace，并有上游元数据；
2. `pnpm check` 通过；
3. patch/template 从源码重新生成后 Git 无 diff；
4. 两轮 SDK54 package pack 逐字节一致；
5. 包审计为 14 packages、22 internal edges、0 failures；
6. CLI 实际 pack、解包、安装和 `--help` 通过；
7. fresh blank Debug/Release 通过；
8. fresh tabs Router Debug/Release 通过；
9. fresh default Debug/Release 通过，fixture 两处 `expo-image` 替换清晰记录；
10. Release Home PNG、MaterialIcons、embedded bundle、`dev:false` 通过；
11. WebBrowser 两轮打开/关闭，Modal `dismissTo` 与物理 Back 动画通过；
12. 无应用 shim、伪模块、固定成功或手改依赖目录冒充 SDK 能力；
13. 发布包中无 HAP/HAR/TGZ 嵌套制品、依赖目录、缓存、凭据和本机绝对路径；
14. `apps/cli` 是唯一 publishable workspace package。

## 9. 版本规划

### v1.5.0 — SDK54 MVP 迁移与等价验收

- 迁入十四包源码；
- 建立 source-to-patch/template 流程；
- CLI 兼容表以当前 MVP 为准；
- blank/tabs/default E2E；
- deterministic build/pack/audit；
- 完成许可证、NOTICE 和上游来源清单；
- 不新增 MVP 之外的模块。

### v1.5.1 — 稳定性

- WebBrowser 公共 API 和认证 redirect 设备矩阵；
- reload、前后台、runtime destroy；
- HDC/DevEco 多版本回归；
- 物理真机和 Android/iOS smoke；
- 多层 `dismissTo` 行为评估与错误诊断改进。

### v1.6.0 — 正式 SDK 分发

- scoped package 或团队 registry 方案；
- package provenance、checksum、SBOM；
- 自动 changelog 和 release pipeline；
- 确立 CLI 与 SDK 包的版本兼容协议；
- 决定十四包是否独立发布。

### v1.7.0 — 模块扩展

- `expo-image` Harmony 原生后端；
- expo-haptics、expo-symbols；
- WebBrowser 外部认证应用回跳；
- 按需求扩展其他 Expo 原生模块。

## 10. 迁移完成后的仓库关系

完成 parity 前：

- `expo-harmony-template` 保持只读迁移来源和最终证据基线；
- `expo-harmony-cli/feat/V1.5.0` 是迁移目标。

完成 parity 后：

- 新开发只进入 `expo-harmony-cli` monorepo；
- 临时仓库标记 archived/read-only；
- 不在两边并行修复同一缺陷；
- 后续版本以 monorepo 的 package source、CLI 生成物和公开 E2E 为权威。
