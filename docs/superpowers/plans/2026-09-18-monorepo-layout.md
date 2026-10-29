# Monorepo 目录迁移 Implementation Plan

> 使用本会话逐项执行；用户已要求建立完整目录骨架并迁入当前 CLI。

**Goal:** 建立完整规划目录，并保持 CLI 构建、测试与发布物料可用。

**Architecture:** 根工作区统一调度，apps/cli 保持包内布局。未来应用和适配包用 .gitkeep 预留。

**Tech Stack:** pnpm 10.19.0、TypeScript、Vitest。

## Global Constraints

- 不升级依赖、不实现后续适配功能、不提交代码。
- 工作区包括 apps/*、packages/*、packages/@expo/*。
- CLI 包名 expo-harmony-cli、版本 1.4.0 不变。

## 任务 1：保存基线并迁移 CLI

- [x] 运行 `pnpm test`，记录基线。
- [x] 将 src、__tests__、templates、content、assets、package.json、tsconfig.json、vitest.config.ts、.npmignore、CHANGELOG.md、docs/guide.md 移至 apps/cli；复制 README、LICENSE、NOTICE 到 CLI 包。
- [x] 保持 CLI 内相对布局；添加 repository.directory = apps/cli。

## 任务 2：工作区与完整骨架

- [x] 根 package.json 使用 private: true；build、type-check、test、test:watch、clean 转发 `pnpm --filter expo-harmony-cli`；pack:cli 使用 `pnpm --dir apps/cli pack`。
- [x] workspace 添加三种路径；锁文件将原根 importer 迁至 apps/cli，根 importer 为空。
- [x] 按设计逐个创建目录和 .gitkeep。
- [x] 更新 CI 打包命令、根 README、CONTRIBUTING，以及移动影响的仓库文档链接。

## 任务 3：验证

- [x] 执行 `pnpm install --offline --frozen-lockfile`，必要时通过正常安装获取缓存缺失的依赖。
- [x] 执行 `pnpm type-check`、`pnpm build`、`pnpm test`。
- [x] 执行 `pnpm pack:cli --pack-destination /private/tmp/expo-harmony-monorepo-pack`，解包验证 CLI 帮助入口和模板路径。
- [x] 检查 diff、占位目录和锁文件；记录未覆盖的原生运行验证。

## 执行结果

- 迁移前后均为 36 个测试文件、375 项测试通过；发布断言调整为 repository.directory = apps/cli。
- 离线 frozen-lockfile 安装、类型检查、构建、CLI 打包全部通过。
- 解包后在含中文和空格路径执行帮助命令，校验 SDK 52/54 模板并生成入口和 shim；复用已安装依赖。
- 26 个新增占位文件均可被 Git 跟踪；21 个预留包目录尚未声明 package.json。
- 原生构建和设备运行未执行，本次未修改运行时行为。
