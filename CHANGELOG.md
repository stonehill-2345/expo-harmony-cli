# expo-harmony-cli

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
