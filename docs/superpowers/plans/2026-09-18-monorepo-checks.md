# Monorepo 检查流程 Implementation Plan

**Goal:** 单元测试不依赖构建产物，打包始终编译最新源码，CI 与本地共用检查入口。

**Architecture:** CLI 自有打包钩子；两套 Vitest 配置；产物测试共享一次隔离打包；根目录调度。

**Tech Stack:** 现有 pnpm 10.19.0、TypeScript、Vitest 2.1.0，无新依赖。

## Global Constraints

- 保留全部原有测试断言和 CLI 行为；不改用户暂存区、不提交。
- 临时副本不拷贝 dist，不操作真实工作区的 dist。
- 安装依赖声明保持不变。

## 执行步骤

- [x] 两个 pack-files 测试改为 *.pack.test.ts；增加隔离打包 setup 和共享结果读取助手；原测试读取实际 tarball 解包结果。
- [x] 在尚无 prepack 时运行独立产物测试，确认缺少 dist 和残留旧产物的断言失败。
- [x] 普通配置排除 *.pack.test.ts；独立配置仅包含产物测试并执行 globalSetup。
- [x] CLI 添加 prepack、test:pack、check；根添加 test:pack、check 转发。prepack = pnpm run clean && pnpm run build。
- [x] 恢复 CI：checkout → pnpm/node 设置 → frozen-lockfile 安装 → pnpm check。
- [x] 更新 README 和 CONTRIBUTING 的命令及测试边界。
- [x] 从无 dist 状态运行源码测试、运行完整 check，并检查独立打包及 diff。

## 验证记录

- 修改 prepack 前：实际打包缺少 dist/index.js，3 项产物断言失败，符合预期。
- 修改后：4 项产物测试通过，覆盖无编译入口的源码打包、旧产物清理、CLI 发布内容、元数据和原生模板。
- 临时移走工作区 dist 后，pnpm check 全部通过；结束后未生成工作区 dist，已恢复原有调试产物。
- 372 项源码测试与 4 项产物测试通过，类型检查通过。
- GitHub CI 配置已恢复；远端运行结果需提交后由 GitHub 验证。
