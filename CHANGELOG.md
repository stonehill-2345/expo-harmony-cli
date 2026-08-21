# expo-harmony-cli

## 1.1.0

### Minor Changes

- 修复 Windows 下 `ohpm` 命令未通过 shell 启动导致 HarmonyOS 原生依赖安装失败的问题。
- 修复 `prebuild --force` 透传给 `expo prebuild` 报未知参数的问题，现自动映射为 `--clean`。
- 修复 `HARMONY_METRO_HOST` 携带端口时被重复拼接 `:8081` 导致真机无法连接 Metro 的问题。
- 增强错误提示：`install` 在非项目根目录、`create` 模板生成不完整、`harmony/` 目录已存在三类场景给出可操作的下一步建议，替代裸异常。
- patch/shim 因用户本地修改被跳过覆盖时打印警告，避免后续构建失败无从排查。
- 未知选项与疑似拼错的子命令打印帮助与纠正提示；裸项目名搭配包管理器参数（如 `myapp --pnpm`）与近似命令拼写的项目名（如 `scanx`）均可正常创建。
- hvigor 插件 fallback 文件名改为引用版本矩阵，避免基线升级时生成损坏的 hvigor 配置。
- 文档修正：`scan` 默认只读预览、写入需显式 `--apply`；补充 `HARMONY_METRO_CLEAR=1` 清理 Metro 缓存的排障用法。
- 移除废弃的 `run`/`getOutput` 工具函数。

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
