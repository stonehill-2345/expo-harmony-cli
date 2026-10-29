# Monorepo 高优先级开发流程优化

用户已授权打包自动构建、单元与产物测试分离、统一检查与 CI 三项改动。

- CLI 使用 prepack 执行 clean/build，替换 prepublishOnly，避免发布时重复构建。
- pnpm test 和 test:watch 仅运行源码测试，无需 dist；产物测试采用 *.pack.test.ts 和独立 Vitest 配置。
- 产物测试的 globalSetup 将 CLI 源码及发布物料复制至临时目录，复用已安装开发依赖；不复制 dist。执行一次真实 pnpm pack，解包后向全部产物测试提供相同只读结果；结束后删除临时目录。
- 产物测试断言入口与模板存在、元数据正确，增加旧产物清理验证。构建失败或缺少 prepack 时必须失败，不允许使用仓库旧 dist 掩盖问题。
- 根 check 串联 type-check、test、test:pack；产物测试期间在临时副本编译，不更新工作区 dist。日常构建仍用 pnpm build。
- 恢复 .github/workflows/ci.yml，使用 frozen-lockfile 安装并执行 pnpm check。不恢复其他被用户删除的 GitHub 模板。
- 不修改业务逻辑、不升级依赖、不提交代码。

验收：prepack 缺失时新产物测试失败；无 dist 的源码测试通过；加入 prepack 后产物测试和完整 check 通过；独立 pack:cli 在旧产物存在时清理并重新生成。
