# expo-harmony-cli

## 1.0.0

### Major Changes

- 稳定 Expo SDK 52 + React Native 0.77.1 + RNOH 0.77.71 的 HarmonyOS 创建基线。
- 完成 `create -> install -> prebuild --platform harmony -> sync` 主链路，支持 pnpm、npm、yarn 和 bun 的参数化命令执行。
- HarmonyOS Metro 默认端口统一为 `8081`，支持 `HARMONY_METRO_PORT` 覆盖，并增强真机 `hdc rport` 转发处理。
- `scan` 默认只读预览，使用 `scan --apply` 才写入依赖、patch 和适配资产。
- 增强 HarmonyOS 原生 autolinking、Expo 资源 shim、Metro 配置和 release JS bundle 的稳定性校验。
- npm 发布包包含内置 HarmonyOS 模板、patch、shim、开发文档和适配 skill，可离线生成项目。

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
