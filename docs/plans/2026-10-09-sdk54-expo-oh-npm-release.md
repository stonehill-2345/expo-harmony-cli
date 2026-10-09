# Expo SDK54 鸿蒙适配包 @expo-oh 发布与仓库改造计划

更新日期：2026-10-09。状态：A → C 共 15 个运行时包已公开发布并完成 registry 核验。产品 CLI 沿用无 scope 包 `expo-harmony-cli`，不属于本发布集合，本轮不发布。执行证据见 [候选执行记录](../releases/2026-10-09-sdk54-expo-oh-candidate.md)。

本计划替代此前对话中的 scoped npm 发布方案，所有新发布包统一使用 `@expo-oh`。此前 SDK54 patch 产品化文档和 release evidence 仍作为历史基线；本计划定义新的 scoped-package 交付路径，不将历史验收结果当作新发布物的验收结果。

## 1. 目标与决策

- 发布 14 个 Expo 适配包和 1 个 screens 衍生包，共 15 个 `@expo-oh` 运行时包。
- 发布名使用 `@expo-oh/*`；用户项目保留原依赖键，通过 npm alias 安装。JS import、命令名、OHPM 名称和 C++ 符号不做全局改名。
- 运行时包采用上游普通数值版本，使用 `harmony` dist-tag 和精确依赖。产品 CLI 保持 `expo-harmony-cli` 包名，当前公开版本为 `1.5.1`，后续版本独立发布。
- 源码包保留上游 name/version 和 `private: true`。在隔离 staging 中生成发布清单、构建产物和 tgz，避免破坏 workspace、上游对比和历史 patch 生成。
- 新 SDK54 项目最终不依赖这 15 个运行时包的 patch-package 补丁；SDK52 和已存在 SDK54 patch 项目继续被正确识别，不自动迁移或删除用户文件。
- npm/pnpm 为首批验收包管理器；不扩大到未经验证的 SDK、模块或包管理器。
- 本文是实施计划，不是发布授权。实际 registry 写入按用户后续授权执行；不自动 git add。

## 2. 全部发布包及批次

| 批次 | 源码或基线 | 发布名称 | 首发候选版本 | 重点内容 |
| --- | --- | --- | --- | --- |
| A | packages/expo-modules-core | @expo-oh/expo-modules-core | 3.0.30 | 桥接、平台实现、C++/ArkTS、rnoh-compat |
| A | packages/expo-modules-autolinking | @expo-oh/expo-modules-autolinking | 3.0.27 | 模块发现、生成器、脚本、工程模板 |
| A | packages/@expo/metro-config | @expo-oh/expo-metro-config | 54.0.17 | withHarmony、Metro 配置及 serializer |
| A | packages/expo-constants | @expo-oh/expo-constants | 18.0.14 | Constants 原生实现 |
| A | packages/expo-font | @expo-oh/expo-font | 14.0.12 | 字体加载、config plugin |
| A | packages/expo-status-bar | @expo-oh/expo-status-bar | 3.0.9 | RNOH StatusBar 复用元数据 |
| A | packages/expo-system-ui | @expo-oh/expo-system-ui | 6.0.9 | 系统 UI 原生实现 |
| A | packages/expo-splash-screen | @expo-oh/expo-splash-screen | 31.0.13 | 生命周期、启动屏、overlay、plugin |
| A | packages/expo-web-browser | @expo-oh/expo-web-browser | 15.0.11 | 浏览器、生命周期、overlay |
| A | @react-native-ohos/react-native-screens@4.9.0 完整 npm 包 + 仓库 overlay | @expo-oh/react-native-screens | 4.9.0 | 完整 RNOH 包和 6 个修改文件 |
| B | packages/expo-asset | @expo-oh/expo-asset | 12.0.13 | 资源模块；依赖适配 Constants |
| B | packages/expo-linking | @expo-oh/expo-linking | 8.0.12 | Linking、生命周期；依赖适配 Constants |
| B | packages/@expo/cli | @expo-oh/expo-cli | 54.0.27 | Expo 鸿蒙命令、安装与版本策略 |
| C | packages/expo | @expo-oh/expo | 54.0.37 | SDK 主入口、依赖组合、兼容映射 |
| C | packages/expo-router | @expo-oh/expo-router | 6.0.24 | 鸿蒙入口、路由及 dismiss 修复 |
批次按普通依赖安排，peer 依赖存在环。A/B/C 已全部公开可下载，并通过真实安装验收。

screens 的输入是完整上游 npm tarball，overlay 位于 `scripts/sdk54/external-overlays/react-native-screens-4.9.0/`，不能直接发布 overlay 目录。记录上游 integrity、合入文件和最终产物 hash，保留 HAR 和许可证。

产品 CLI 始终使用无 scope 包名 `expo-harmony-cli`，不进入 `@expo-oh` release catalog、tgz 清单或发布批次。CLI 后续版本沿用原包的独立发布流程。

## 3. 继续复用的依赖与能力边界

| 范围 | 策略 |
| --- | --- |
| @expo/config、@expo/config-plugins、@expo/prebuild-config | 复用上游，验证 alias 的配置与 plugin 解析 |
| @expo/metro、@expo/metro-runtime、babel-preset-expo | 复用上游，验证 Metro、peer 和运行时解析 |
| expo-file-system、expo-keep-awake | 保留现有上游依赖，不把依赖存在当作完整鸿蒙支持 |
| expo-image | 保留 default 模板中的既有替换策略，本轮不发布适配包 |
| React、React Native、RNOH | 保留已验证组合：React 19.1.1、RN 0.82.1、RNOH/RNOH CLI 0.82.30 |
| RNOH gesture/reanimated/safe-area/worklets | 沿用已验证上游版本 2.30.1 / 4.0.1 / 5.6.3 / 1.0.0 |
| 普通 RN 外部依赖 | 仍与 RNOH 配对包分别管理，不混淆名称和版本 |
| expo-module-scripts、TypeScript、Taskr | 构建依赖，不作为产品包发布 |
| fixture、示例、预留空目录 | 不发布 |

完整外部安装集合由现有 template/fixture contract 导出并锁定，不能只依赖本表节选。若发现额外必须修改的上游包，先记录具体失败和最小修复，再更新发布集合，不能默默扩大 fork 范围。

## 4. 发布清单与依赖规则

### 4.1 单一发布映射

新增 `scripts/sdk54/release-catalog.mjs`，引用现有 `catalog.mjs` 和 fixture contract，不手写重复上游版本表。每项包含：逻辑安装名、上游 name/version、source path 或 tarball integrity、publishName、publishVersion、installSpec、批次、模板适用范围、必需文件和运行探针。

例如 expo 对应：

```json
{
  "installName": "expo",
  "upstreamName": "expo",
  "upstreamVersion": "54.0.37",
  "publishName": "@expo-oh/expo",
  "publishVersion": "54.0.37",
  "installSpec": "npm:@expo-oh/expo@54.0.37"
}
```

由此生成 CLI runtime release manifest，以及适配 Expo CLI 使用的发布映射。运行期不依赖仓库 scripts 目录。

### 4.2 发布版 package.json

在 staging 重写 name/version/private/publishConfig；更新 repository、bugs、homepage 指向实际 fork 仓库，保留原作者、LICENSE、NOTICE 和上游来源。npm scope 变化不意味着 GitHub 仓库地址也要改名。

```json
{
  "name": "@expo-oh/expo",
  "version": "54.0.37",
  "private": false,
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  }
}
```

保留必要 main/module/types/exports/bin，审计生命周期脚本，不能让消费方依赖未随包发布的构建工具。tgz 发布前完成构建，不依赖发布 tarball 时触发源码构建。

### 4.3 全部内部普通依赖：10 条

| 依赖方 | 依赖键 | 发布版依赖值 |
| --- | --- | --- |
| expo | @expo/cli | npm:@expo-oh/expo-cli@54.0.27 |
| expo | @expo/metro-config | npm:@expo-oh/expo-metro-config@54.0.17 |
| expo | expo-asset | npm:@expo-oh/expo-asset@12.0.13 |
| expo | expo-constants | npm:@expo-oh/expo-constants@18.0.14 |
| expo | expo-font | npm:@expo-oh/expo-font@14.0.12 |
| expo | expo-modules-autolinking | npm:@expo-oh/expo-modules-autolinking@3.0.27 |
| expo | expo-modules-core | npm:@expo-oh/expo-modules-core@3.0.30 |
| @expo/cli | @expo/metro-config | npm:@expo-oh/expo-metro-config@54.0.17 |
| expo-asset | expo-constants | npm:@expo-oh/expo-constants@18.0.14 |
| expo-linking | expo-constants | npm:@expo-oh/expo-constants@18.0.14 |

普通、可选、开发依赖均扫描；仅对发布集合内的边按策略改写。开发工具依赖不机械套用产品映射。真实 npm 解析已确认：仅根 alias 会经传递 peer 拉入官方 Expo 57。新项目必须生成 npm overrides（使用完整版本声明，与直接依赖保持一致，避免 npm 虚拟 peer 上下文无法解析 $引用）及 pnpm.overrides，把适配包、外部版本组合及 React 相关版本固定到 release manifest。安装验收必须检查整棵依赖图，不只检查根 node_modules。

### 4.4 全部内部 peer：12 条

| 依赖方 | peer 键 |
| --- | --- |
| @expo/cli | expo、expo-router |
| @expo/metro-config | expo |
| expo-asset | expo |
| expo-constants | expo |
| expo-font | expo |
| expo-router | expo、expo-constants、expo-linking |
| expo-splash-screen | expo |
| expo-system-ui | expo |
| expo-web-browser | expo |

保留原始 peer 键、范围和 optional 元数据。当前 scoped 发布版本与对应上游数值版本相同，原始范围即可接纳；通过真实 semver 和包管理器解析验证。普通依赖仍精确锁定 scoped alias。

审计第三方 peer，包括未 fork 的 Expo 与 RN 包。2026-10-09 的 npm 严格解析已证实：`* || 预发布版本` 被 semver 简化，且 @expo/vector-icons 对 expo-font 的 >=14.0.4 范围排除预发布版本。因此首发取消版本预发布后缀，用独立 scope、harmony dist-tag 和 release ID 标识适配组合；不额外 fork vector-icons。后续修订显式递增 scoped 包版本，并在 upstreamVersion 中记录真实上游基线，不能假定两者永远相同。用真实 npm/pnpm 安装验证，禁止把 `--force`、`--legacy-peer-deps` 或关闭 peer 检查当作验收通过。如果必须调整版本方案或新增适配，先修订 catalog 和本计划，再生成候选物。

### 4.5 消费方示例

```json
{
  "dependencies": {
    "expo": "npm:@expo-oh/expo@54.0.37",
    "expo-router": "npm:@expo-oh/expo-router@6.0.24",
    "expo-font": "npm:@expo-oh/expo-font@14.0.12",
    "@react-native-ohos/react-native-screens": "npm:@expo-oh/react-native-screens@4.9.0"
  }
}
```

这是示例节选，完整 dependencies/devDependencies 从 template contract 生成。screens 保留 RNOH 依赖键，不能把普通 `react-native-screens` 的职责混入这个 alias。

## 5. 仓库代码改造清单

### 5.1 构建、产物与发布工具

| 文件 | 工作 |
| --- | --- |
| scripts/sdk54/catalog.mjs | 保留上游事实、内部边；由 release catalog 引用，检查 14 包完整性 |
| 新增 scripts/sdk54/release-catalog.mjs | 15 个运行时包的发布名称、版本、安装 spec、批次和来源 |
| 新增 scripts/sdk54/prepare-npm-release.mjs | staging 构建、清单重写、screens overlay、许可证、tgz、hash |
| 新增 scripts/sdk54/verify-npm-release.mjs | scoped 身份、依赖闭包、peer、入口和原生文件、无本机路径和 workspace/file spec 泄漏 |
| scripts/sdk54/pack-packages.mjs | 复用受控构建能力；区分旧上游基线 pack 和新 scoped release pack，旧 name/version 断言不能直接复用 |
| scripts/sdk54/audit-packages.mjs | 增加发布产物审计或抽取可复用检查，区分上游版本与发布版本 |
| scripts/sdk54/validate-catalog.mjs | 映射完整、无重复、依赖边无遗漏 |
| scripts/sdk54/check-repository.mjs | 保留源码私有限制；新增 staging 发布允许名单。当前“只有 expo-harmony-cli 可发布”断言不能用于否定合法 staging 包 |
| scripts/sdk54/generate-external-screens-patch.mjs、external-overlays/ | 复用既有 overlay 来源和差异检查，不把 patch 生成当完整 screens 构建 |
| scripts/sdk54/licenses/ | 保留并复制各包实际需要的许可证与第三方声明 |
| 根 package.json | 增加 release prepare/verify/pack/e2e 入口；明确旧 patch 检查与新发布检查的边界 |
| pnpm-workspace.yaml、pnpm-lock.yaml | 新工具直接依赖和锁文件；验证 workspace 链接不掩盖 registry 安装缺陷 |
| .github/workflows/ci.yml | 发布产物和 npm/pnpm 安装检查 |
| 新增 .github/workflows/publish.yml | 发布已验收的同一 tgz、明确批次和 dist-tag，配置发布身份，保存结果和 integrity |

以上新增文件名是实施目标，并非当前已存在的命令。CI 发布认证采用组织实际可用的 npm trusted publishing 或受控凭据方式，不把 token 写入源码。

### 5.2 产品 CLI

| 文件 | 必须适配的行为 |
| --- | --- |
| apps/cli/src/sdk54/patch-manifest.ts | 保留旧模式；新增独立 release manifest 类型与加载器，避免字段混用 |
| 新增 apps/cli/src/sdk54/release-manifest.ts | 校验生成的发布映射、模板集合、发布身份、必需文件及探针 |
| 新增 apps/cli/content/releases/sdk-54/manifest.json | 从 release catalog 生成运行期事实来源 |
| apps/cli/content/patches/sdk-54/manifest.json | 保留历史 patch 模式输入，新模式不直接修改它来伪装发布映射 |
| apps/cli/src/sdk54/package-json.ts | 模板依赖写 alias，完整保留外部组合；无剩余补丁时不注入 patch-package |
| apps/cli/src/sdk54/install-patches.ts | 新模式不复制已内置补丁；如采用过渡方案，只处理 screens 补丁 |
| apps/cli/src/sdk54/create.ts | release manifest → 模板校验 → 依赖写入 → 安装 → runtime probes → 新状态 → 文档 |
| apps/cli/src/sdk54/project-state.ts | 增加 sdk54-scoped-packages 模式；正确解析 alias SDK；保留旧模式识别 |
| apps/cli/src/version-matrix.ts | detectSdkVersion 使用 npm spec 目标版本，不对 alias 执行简单 parseInt |
| apps/cli/src/lifecycle/managed-state.ts | 新状态记录 release 标识和版本组合；兼容旧状态读写 |
| apps/cli/src/sdk54/verify-runtime.ts | 校验真实 package.name/version 与映射，从实际使用方解析传递依赖；不再依赖 patch.version |
| apps/cli/src/sdk54/doctor.ts | 新模式验证身份、组合、产物，不要求 patch 文件或 patch postinstall |
| apps/cli/src/commands/doctor.ts | 路由新模式诊断 |
| apps/cli/src/commands/prebuild.ts | 新模式转发适配 Expo CLI |
| apps/cli/src/commands/scan.ts、sync.ts | 明确新模式行为，不落入旧 injector |
| apps/cli/src/installer/installer.ts、uninstaller.ts | 安装/卸载维护 alias 组合，或明确拒绝尚未实现的旧命令路径 |
| apps/cli/src/scanner/compat-table.ts | SDK54 从 package-patch 描述迁移到发布映射，SDK52 不受影响 |
| apps/cli/src/scanner/scan.ts、installer/adapt-package.ts | 新模式不重复打补丁或注入 shim |
| apps/cli/src/lib/pkg-manager.ts | npm/pnpm alias 安装和生命周期，不依赖旧 patch postinstall |
| apps/cli/src/sdk54/template-contract.ts | 区分官方模板输入与 alias 输出的契约 |
| apps/cli/src/sdk54/docs.ts | release 标识、版本和安装说明 |
| apps/cli/src/index.ts、creator.ts、tips.ts | 模式名、帮助和 `expo-harmony-cli` 命令 |
| apps/cli/package.json | 保持 npm 包名和 bin 为 `expo-harmony-cli`；CLI 发布与运行时包发布流程独立 |

SDK 解析使用标准 npm spec 解析器，声明直接依赖。虽然 `@expo-oh` 不含数字，旧实现仍不能可靠解析全部 alias；测试包含任意带数字 scope，防止退回“抓取字符串第一个数字”的实现。SDK53/55 的拒绝逻辑不得因 alias 默认为 SDK54 而失效。

### 5.3 适配版 Expo CLI：防止装回官方实现

| 文件 | 工作 |
| --- | --- |
| packages/@expo/cli/src/harmony/dependencies.ts | 将当前 expo-splash-screen 官方版本常量拆成安装 spec、发布身份、真实版本，安装时使用映射 |
| packages/@expo/cli/src/start/index.ts | 同时识别旧 patch 和新 scoped managed-state，标准 expo start 自动启用 Harmony Metro |
| packages/@expo/cli/src/start/doctor/dependencies/getVersionedPackages.ts | Harmony release 映射优先，远程官方版本不能覆盖适配 spec |
| 同目录 bundledNativeModules.ts | 提供 Harmony 版本来源，保留普通项目逻辑 |
| 同目录 validateDependenciesVersions.ts | 比较真实版本及身份，不能对 npm: alias 字符串做 semver 比较 |
| 同目录 ensureDependenciesAsync.ts | 自动补依赖路径也遵守 release 映射 |
| packages/@expo/cli/src/install/installAsync.ts | expo install expo-font 生成对应 alias；显式不同版本需有明确兼容行为 |
| packages/@expo/cli/src/install/checkPackages.ts | --check/--fix 不把适配包还原为官方包 |
| packages/@expo/cli/src/install/installExpoPackage.ts | 更新 expo 自身后继续执行适配 CLI |
| packages/@expo/cli/src/install/applyPlugins.ts | 验证 alias 参数能正确解析原逻辑名的 config plugin，失败时最小修复 |
| packages/expo/bundledNativeModules.json | 对齐兼容版本；semver 数据和 alias 安装映射分别表达 |
| 新增随 expo 或 Expo CLI 发布的元数据文件 | 从同一 release catalog 生成，install/doctor/prebuild 共同使用；加入 files 白名单 |

检查所有自动安装调用点，不能只修正常 install 分支。验证在线及离线版本来源、expo 自更新、显式版本安装和缺依赖补装。

### 5.4 原生与运行入口：验证后精准修复

| 文件或范围 | 验证内容 |
| --- | --- |
| packages/expo-modules-autolinking/src/dependencies/resolution.ts | 逻辑依赖名、实际 scoped package.name、解析路径 |
| 同目录 scanning.ts、CachedDependenciesLinker.ts、utils.ts | npm/pnpm 布局、去重、include/exclude |
| src/autolinking/findModules.ts | 模块配置发现、不重复注册 |
| src/platforms/harmony/harmony.ts | CMake、ETS、模块身份和 HAR 配置 |
| src/platforms/harmony/rnohConfig.ts | 识别 @expo-oh/react-native-screens@4.9.0；继续使用原 OHPM 名称、ScreensPackage 和 ETS 导入路径，避免漏注册原生组件 |
| src/platforms/harmony/nativeProject.ts | OHPM、原生工程、生命周期、overlay 和生成结果稳定性 |
| packages/@expo/metro-config/src/withHarmony.ts、ExpoMetroConfig.ts | alias 解析到适配实现；对 pnpm 实际包名与逻辑安装名不同的 Harmony 包补充 extraNodeModules 路径映射 |
| packages/expo/bin/cli、bin/autolinking | 原始逻辑名解析到 scoped 包，bin 保留 |
| 各 expo-module.config.json、harmony/** | 元数据、跨模块路径、C++ target、ETS import 与真实安装目录一致 |
| Router app.plugin.js、entry.js、_ctx.harmony.js 等 | 子路径、config plugin、运行入口及白名单 |

这些不是全部已确认存在 bug 的文件。先用真实 alias 产物重现，再修改身份假设；原始 import、OHPM 名和原生符号不机械替换为 npm scope。

## 6. 各包产物验收

| 包 | 必须验证 |
| --- | --- |
| expo-cli | build/bin/cli 可执行；build/src/harmony/**、run/prebuild/start 及新增安装策略编译产物 |
| expo-metro-config | build/withHarmony.js/.d.ts、ExpoMetroConfig、serializer |
| expo | bin、src、类型、bundledNativeModules、发布映射、各子路径入口 |
| expo-modules-autolinking | build、scripts/harmony、templates/harmony、命令入口 |
| expo-modules-core | .harmony.ts/.tsx、harmony/src、rnoh-compat、模块配置 |
| expo-asset、expo-constants、expo-font、expo-system-ui | JS/声明、harmony/index.ets、C++/ArkTS/CMake、模块配置；font plugin |
| expo-linking | 更新后的 build/Linking.js、源文件、原生和生命周期 |
| expo-splash-screen | 原生、生命周期、overlay、plugin |
| expo-web-browser | build/WebBrowser.js/.d.ts、原生、生命周期、overlay |
| expo-router | _ctx.harmony.js、getRoutesCore/routing、harmony-native-dismiss、入口及 plugin |
| expo-status-bar | JS 和 rnoh-reuse 元数据，不额外要求不存在的自有 HAR |
| react-native-screens | 完整上游内容、原 HAR/配置、6 个 overlay 文件、许可证 |
| expo-harmony-cli（独立验收，不进入本次发布） | dist、release manifest、模板、内容资源、文档 |

当前受控 pack 只对部分包定义显式重建配方；实施时逐包列明“重建”或“继承已核验上游构建结果”的来源。所有本轮修改必须体现在实际执行的 JS、声明或原生文件中，不以只改 src 作为完成标准。

全包检查 main/types/exports/bin 指向存在的文件，files/.npmignore 不遗漏运行文件、不包含不必要的示例和构建缓存，许可证完整，源码映射不泄漏本机绝对路径。

## 7. 测试、工具和文档同步

| 范围 | 工作 |
| --- | --- |
| apps/cli/__tests__/sdk54/ | create、package-json、project-state、verify-runtime、doctor、command-routing、template-contract、docs；旧 patch 模式回归 |
| apps/cli/__tests__/version-matrix.test.ts | 普通/带数字 scope alias、SDK52/53/54/55、无法解析版本 |
| apps/cli/__tests__/managed-state.test.ts | 新旧模式读写与分类 |
| apps/cli/__tests__/install.test.ts、uninstall.test.ts、prebuild.test.ts | 路由、alias 保留及失败路径 |
| apps/cli/__tests__/pack-files.pack.test.ts、helpers/packed-cli.ts | 真实 CLI 包含新 manifest，保留无 scope 安装入口 |
| scripts/sdk54/__tests__/ | 发布映射、10 普通边/12 peer 边、产物、许可证、确定性和批次 |
| scripts/sdk54/stage-e2e-packages.mjs | 新 scoped 产物模式，不能仅用 workspace symlink 证明安装成功 |
| scripts/sdk54/prepare-create-expo-fixture.mjs、fixture-contract.mjs | 官方模板输入、alias 输出和完整外部组合 |
| scripts/sdk54/blackbox-packed-cli.mjs | 无 scope CLI 真包入口，blank/default × npm/pnpm |
| scripts/sdk54/verify-cli-acceptance.mjs | 新 release 版本、标识和证据，不复用历史成功结论 |
| scripts/sdk54/generate-cli-patches.mjs、generate-cli-patch-manifest.mjs、audit-cli-patches.mjs | 保留历史 patch 用途，从新包发布主路径分离 |
| Expo CLI install/doctor/harmony 对应测试 | install/check/fix、自更新、远程优先级、自动补依赖 |
| Autolinking/Metro/Harmony 对应测试 | alias、严格 pnpm 布局、去重、链接、生命周期 |
| README.md、docs/guide.md | 实际结构、安装入口、发布包和支持边界 |
| apps/cli/README.md、docs/guide.md、CHANGELOG.md、NOTICE.md | 新版本、命令、来源与许可证 |
| apps/cli/content/docs/sdk-54/README.md、HARMONY.md、PATCHES.md、TROUBLESHOOTING.md、AGENTS.md | 新旧交付模式说明，修改前读取对应目录约束 |
| 各适配包 README | alias 安装、上游基线、鸿蒙能力边界 |
| docs/releases/ 新记录 | 每包 integrity、来源、安装矩阵和设备验收，保留历史记录 |

## 8. 分阶段执行清单

### 阶段 1：发布契约

- [x] 核对 @expo-oh 权限、15 个运行时包名称及候选版本是否可发布。
- [x] 建立 release catalog，自动校验 14 包与源码 catalog 一致、screens 来源可追溯。
- [x] 确认 CLI 沿用无 scope 包名 `expo-harmony-cli`，并与本发布流程分离。
- [x] 完成 peer 风险验证；普通数值版本方案已通过四组真实安装及锁文件重装验收。

验收：无遗漏映射、无身份混用，完整依赖图可以表达并安装。

### 阶段 2：运行期改造

- [x] 先编写 alias SDK 解析、依赖回退、peer、状态分类的失败测试。
- [x] 实现新 release manifest、create/install/doctor/prebuild 路径。
- [x] Expo CLI install/check/fix/自更新使用相同映射。
- [x] 保留旧模式识别及 SDK52 回归。

验收：针对性测试通过，新增包不会被常规命令装回官方实现。

### 阶段 3：构建与打包

- [x] 准备 staging，逐包构建与重写发布清单，合入 screens overlay。
- [x] 校验许可证、入口、原生文件、依赖和 peer。
- [x] 生成 15 个运行时包 tgz、发布清单和 integrity；需要确定性检查的产物进行双轮对比。

验收：发布输入是已审计的不可变 tgz，不在 publish 时临时重新构建。

### 阶段 4：真实安装与设备验收

- [x] 使用本地测试 registry 验证 scoped alias 的真实依赖图；file: 安装仅用于初步 smoke test。
- [x] blank-typescript/default × npm/pnpm，首次安装和锁文件重装均通过。
- [x] 校验逻辑依赖解析到预期 scoped name/version，无意外官方副本及 peer 冲突。
- [x] 验证 expo install、--check、--fix、prebuild、start、run:harmony、产品 doctor。
- [ ] 验证 autolinking 去重、配置插件、字体/资源/Constants、Linking、SplashScreen、SystemUI、WebBrowser、Router/screens 的已支持场景。
- [x] Debug、clean Release、无 Metro 冷启动；记录设备与工具链及实际命令结果。
- [x] 新模式未注入旧 shim/bypass，最终方案未依赖该批包的 patch postinstall。

验收：测试成功记录绑定到本轮 tgz hash；未覆盖能力不得标记支持。

### 阶段 5：公开发布

- [x] 在实际发布授权下，按 A → B → C 发布并核对 registry name/version/integrity。
- [x] 从公开 registry 在干净环境重新安装，验证关键流程。
- [x] 从 `@expo-oh` 发布清单中排除产品 CLI；本轮不发布 CLI。
- [x] 记录版本、dist-tag、时间、来源和验收报告，更新用户文档。

发布非原子操作。部分包失败时记录已成功项，修复后继续；不覆盖已有版本，不以 unpublish 作为常规回滚。整组未齐全前不发布用户入口。回退依赖组合使用上一组明确版本，标签调整不能替代精确依赖的回退。

## 9. 命令示例

以下是后续复核和维护发布时的操作示例。

```bash
# 在准备好的 staging 包目录检查并生成产物
npm pack --dry-run
npm pack

# 验收完成并获得实际发布授权后，发布同一个 tgz
npm publish ./expo-oh-expo-54.0.37.tgz \
  --access public \
  --tag harmony \
  --registry=https://registry.npmjs.org/

# 发布后核对
npm view @expo-oh/expo@54.0.37 \
  name version dependencies peerDependencies dist.integrity \
  --json \
  --registry=https://registry.npmjs.org/

# 用户显式安装适配包
npm install --save-exact expo@npm:@expo-oh/expo@54.0.37

# 产品 CLI 用户入口；CLI 沿用独立的无 scope 包
npx expo-harmony-cli@1.5.1 create

# 生成项目中使用原命令名
npx expo prebuild --platform harmony
npx expo run:harmony
```

`harmony` dist-tag 只用于版本选择，不保证整组版本一致，不解决 peer 约束。整组一致性由发布 catalog、精确 alias、锁文件及真实安装验收共同保证。

## 10. 最终完成标准

- [x] 15 个运行时包名称全部为 @expo-oh，发布清单与 registry 实际版本一致；其中不包含产品 CLI。
- [x] 14 个 Expo 包及 screens 的适配内容完整进入产物，许可证齐全。
- [x] 内部依赖、外部 peer、自动安装和版本检查均不会绕过 release 组合。
- [x] npm/pnpm 两种包管理器和两种模板验收通过，设备证据对应本轮产物。
- [x] 新项目采用 scoped-package 模式，旧 SDK52/SDK54 patch 项目不被误判或自动破坏。
- [x] 文档与实际 CLI 入口一致，错误候选的纠正有明确记录，最终发布报告可追溯。
