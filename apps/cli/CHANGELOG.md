# expo-harmony-cli

## 1.6.0 - 2026-10-10

### Minor Changes

- 新建 SDK54 项目改用 15 个已公开发布的 `@expo-oh` 运行时包，通过 npm alias 保留 `expo`、`expo-router`、`@expo/cli` 等原始依赖键和 import。
- SDK54 新项目不再复制本地 patch，不再安装 `patch-package`，也不再添加 patch postinstall；npm 和 pnpm 均直接从公开 registry 安装固定版本。
- 增加 release manifest、实际安装包身份校验、alias SDK 解析及 `expo install --check/--fix` 版本保护，避免命令将适配包替换回官方 Expo 包。
- SDK54 的 create、doctor、prebuild、start 和 run:harmony 已接入 scoped-package 项目模式；scan、sync 及旧 injector 不用于该模式。
- 保留 SDK52 legacy 流程，以及旧 SDK54 package-patch 项目的识别、诊断和 prebuild 兼容路径；不会自动迁移或删除旧项目 patch。
- 14 个 Expo 适配包和 `@expo-oh/react-native-screens` 已使用 `harmony` dist-tag 发布并完成 npm/pnpm 安装、锁文件重装及 HarmonyOS 设备验收。
- 产品 CLI 继续使用已有无 scope 包名 `expo-harmony-cli`，不属于 `@expo-oh` 运行时包发布集合，随本版本独立发布到 npm。

## 1.5.1 - 2026-10-09

### Patch Changes

- 重写仓库根 README：快速开始按 SDK 版本重组（SDK54 优先、编号步骤式），前置环境提示与 npm 包链接；环境与支持范围前移，新增社区与支持（Issues）；移除版本号叙事，聚焦使用者动线。
- CONTRIBUTING 仓库组织新增目录架构树（`apps/cli` 展开至子目录），修正 `packages/` 为预留空目录的过时描述——现为 14 个 SDK54 源码包基线，禁止独立发布。
- npm 包 README 改为发布时从仓库根 README 自动同步（`prepack` 复制并改写仓库相对路径为包内/GitHub 链接），不再单独维护 `apps/cli/README.md`。

## 1.5.0 - 2026-09-30

### Minor Changes

- Expo SDK52 继续使用 legacy patch/injector/generator 流程。
- Expo SDK54 fresh blank/default 使用 `create-expo-app@5.0.0`、精确依赖和 package-level patch。
- SDK54 支持 npm/pnpm，主路径为官方 Expo prebuild/run/start 命令。
- Default 模板只替换两处 `expo-image` Image；本版本不提供 expo-image Harmony backend。
- 旧 SDK54 项目只诊断不迁移，SDK55 及更高版本拒绝。
- 修复 RN 0.82 iOS JSI 头文件兼容：`expo-modules-core` patch 显式引入 CallInvoker 与 CallbackWrapper 头文件，iOS 端可正常编译。
- Metro 初始化模块按平台选择，避免非 Harmony 平台加载鸿蒙专属初始化逻辑。
- 修复 Harmony Release 构建初始化与应用图标问题。

## 1.4.0

### Minor Changes

- 支持 Expo SDK 52（RN 0.77 / RNOH 0.77.x）和 SDK 54（RN 0.82 / RNOH 0.82.x）双版本创建，`create` 新增 `--sdk=52|54` 参数，不指定时交互选择。
- Patches 按 SDK 版本分目录管理（`content/patches/sdk-52/` 与 `content/patches/sdk-54/`），创建时按所选基线注入。
- HarmonyOS 原生模板按 SDK 版本分目录（`templates/harmony-sdk-52/` 与 `templates/harmony-sdk-54/`），prebuild 时按项目基线选择对应模板。
- 新增 `harmony-form-data.js` ESM shim，修复 HarmonyOS 运行时 `FormData` 兼容问题。
- 新增 `@expo/metro-runtime/error-overlay` Metro alias，修复运行时错误遮罩加载。
- 更新 `version-matrix.ts` 为双 SDK 版本矩阵，compat-table 按 SDK 版本分表维护。
- 更新 README 与使用指南，覆盖双 SDK 选择说明与版本矩阵。

## 1.3.0

### Minor Changes

- 原生插件链接改为「官方优先」：`sync` / `prebuild` / `install` / `uninstall` 共用统一链路，优先调用项目内安装的 RNOH 官方 `link-harmony`（识别 `package.json` 带 `harmony.autolinking` 声明的包），官方注册结果原样保留；候选不再受内置映射表限制。
- 官方未覆盖的插件自动查询内置映射表补充注册：以锚点方式插入官方产物，不改写已成功的官方注册；两者均未覆盖的插件逐包报告原因并给出适配指引，不再静默丢失。
- 官方 CLI 不可用或产物合并冲突时自动回退内置批量生成；跨插件同名 Package / CMake target 冲突时报错并保留原工程，不以去重掩盖。
- 官方产物中的临时目录相对路径自动改写为项目相对路径，root 与 entry 两级 `oh-package.json5` 受管合并，npm 包名与 OHPM 包名差异自动归一比对。
- `install` 未列入适配表但携带有效 HarmonyOS 原生痕迹（autolinking 声明或 harmony 目录）的包不再直接跳过，仍尝试原生注册并按「官方 / 自研补充 / 未覆盖」归类报告。
- `prebuild` 前置校验项目依赖：未安装 expo 时前置拦截，避免 npx 拉取与项目 SDK 版本不符的最新 expo 接管构建；内部调用统一加 `--no-install`。
- 修复 `uninstall` 后受管状态残留：包档案与两级 `oh-package.json5` 受管条目随卸载清除；指向已卸载包的悬空 `file:` HAR 引用在下次同步时自动清理，修复由此导致的 `ohpm install` 拉取失败。
- oh-package 依赖归属改按「本轮受管集」判定（原先按映射表键集）：历史受管项仅在确认卸载时清除，扫描异常不再影响用户依赖。
- 生成的 `RNOHPackagesFactory.ets` 返回类型对齐旧式适配包（`RNPackage[]`），避免 ArkTS 严格类型检查下旧式包缺少新接口方法导致编译失败。
- 文档：生成项目的 `docs/HARMONY.md` 新增「原生注册机制」章节（官方优先流程、手动安装原生依赖后需执行 `sync`、Hvigor 插件注册注意事项），adapter skill 同步更新链接规则。

## 1.2.0

### Minor Changes

- 新增 `env` 命令：检查 node、hvigor、ohpm、hdc 等工具链的版本与可用性，逐项输出结果与修复建议。
- 新增 `doctor` 命令：汇总环境检查计数，明细输出项目级诊断（受管文件漂移、依赖基线等），末尾按优先级给出"下一步"建议。
- `env` / `doctor` 退出码分级：0 全部通过、1 存在失败、2 仅有警告，便于 CI 与脚本集成。
- 新增受管文件漂移保护：`sync` 生成的 3 个 autolinking 文件（`RNOHPackagesFactory.ets/.h`、`autolinking.cmake`）与 `oh-package.json5` 中 CLI 托管的依赖条目被手动修改后，重新 `sync` 将保护性阻断；还原修改或 `sync --force` 可继续。
- `install` / `uninstall` 增加前置预检：检测到漂移时在写入任何文件前阻断，避免产生半完成状态；同样支持 `--force` 跳过。
- 受管文件写入升级为五阶段事务（暂存 → 备份 → 替换 → 状态原子落账 → 清理），任一阶段失败自动回滚，磁盘不残留半成品。
- `sync` 启动时自动处理上次中断的遗留产物：`.cli-tmp` 暂存自动清理、`.cli-bak` 备份自动还原；备份与目标并存时阻断并给出手动恢复指引。
- 明确自定义 Package 扩展点：`PackageProvider.ets` / `PackageProvider.cpp` 归用户管理，CLI 不会覆盖；模板内附注册示例，漂移阻断提示中附带该指引。
- `prebuild --force` 警告强化：明确将删除整个 `harmony/` 目录并重置其中的自定义代码（含 `PackageProvider`），请依赖 git 恢复或先手动备份。
- Windows 兼容：`hvigor` 命令改经 shell 启动，与 `ohpm` 一致，修复直接调用失败的问题。

## 1.1.0

### Minor Changes

- 修复 Windows 下 `ohpm` 命令未通过 shell 启动导致 HarmonyOS 原生依赖安装失败的问题。
- 修复 `prebuild --force` 透传给 `expo prebuild` 报未知参数的问题，现自动映射为 `--clean`。
- 修复 `HARMONY_METRO_HOST` 携带端口时被重复拼接 `:8081` 导致真机无法连接 Metro 的问题。
- 增强错误提示：`install` 非项目根、`create` 模板生成不完整、`harmony/` 目录已存在等场景给出可操作的下一步建议。
- 文档修正：`scan` 默认只读预览、写入需显式 `--apply`；补充 `HARMONY_METRO_CLEAR=1` 清理 Metro 缓存的排障用法。

## 1.0.0

### Major Changes

- 修复 create -> install -> prebuild -> sync 创建主链路中的依赖注入、原生工程生成和增量同步问题。
- 优化三端 Metro 开发体验，统一 Android、iOS、HarmonyOS 默认端口为 8081，并增强真机 hdc rport 转发、旧规则清理和已有 Metro 复用。
- 优化 HarmonyOS 原生 autolinking、Metro 配置、Expo 资源 shim 和 release JS bundle，增加关键文件与配置校验。
- 增加 pnpm、npm、yarn、bun 的参数化命令执行支持，降低 Windows 和特殊路径下的命令解析风险。
- 优化 scan 工作流：默认只读预览，只有显式使用 scan --apply 才写入依赖、patch 和适配资产。

## 0.2.5

### Patch Changes

- 优化 README 文档内容与排版，同步刷新 npm 包页面展示。
- 在 package.json 中补充 `keywords` 与 `packageManager` 元信息，改善 npm 页面可发现性。
- 完善 `.npmignore`
- 新增完整使用指南 `docs/guide.md`，并随 npm 包分发，npm 用户可离线查阅命令清单、环境配置与排障。

## 0.2.4

### Patch Changes

- 优化生成项目文档结构，统一本地调试命令为 pnpm 风格，并强调依赖安装、卸载、扫描、同步和 HarmonyOS prebuild 需要通过 CLI 管理。
- 将对外 Agent skill 入口收敛为 `.agent/skills/expo-harmony-adapter/SKILL.md`，内部集成资料由该 skill 引导使用。
- 清理旧版 Claude 专属入口，CLI 注入阶段会移除 `CLAUDE.md` 和 `.claude`，生成项目改用 `AGENTS.md` 与 `.agent/skills`。
- 将 CLI 对外 Node.js 要求调整为 `>=18.18.0`，避免误用 monorepo 本地开发环境的 Node 22.20.0 约束。

## 0.2.3

### Patch Changes

- 升级 RNOH 基线到 `0.77.71`，同步 `@react-native-oh/react-native-harmony` 与 `@react-native-oh/react-native-harmony-cli` 版本，并保持 React Native 固定为 `0.77.1`。

## 0.2.1

### Patch Changes

- 修复 iOS 默认模板中已移除 Expo 依赖的遗留文件，并升级 screens 兼容版本。
