# Contributing

感谢你关注 `expo-harmony-cli`。

## 开发流程

```bash
pnpm install --frozen-lockfile
pnpm check
```

`pnpm test` 和 `pnpm test:watch` 只执行源码测试，无需 `dist`。`pnpm test:pack` 在临时副本执行一次真实打包，两组产物测试读取同一解包结果。新增产物测试使用 `*.pack.test.ts` 命名；其他测试使用 `*.test.ts`。

`pnpm check` 串联类型检查、源码测试和产物测试；CI 调用同一命令。调试本地 CLI 前使用 `pnpm build`；`pnpm pack:cli` 会自动清理旧产物并构建。

## Pull Request 要求

- 保持 Expo SDK、React Native 和 RNOH 版本矩阵一致。
- 修改 CLI 行为时补充或更新测试。
- 修改生成项目内容时同步更新 `apps/cli/content/docs/` 和相关测试。
- 不提交内网 registry、私有域名、本机路径、token、证书或签名文件。

## Commit 建议

推荐使用简洁的 conventional commit：

```text
feat: add ...
fix: resolve ...
chore: update ...
docs: improve ...
```

## 仓库组织

- `apps/cli/`：现有 CLI，依赖和发布配置归该包维护。
- `apps/example/`、`packages/`：规划目录；空目录通过 `.gitkeep` 保留。
- 根目录执行统一命令；单独操作 CLI 可用 `pnpm --dir apps/cli <命令>`。
- 新增工作区包时添加自己的 `package.json`，并更新根锁文件；不要提交子包锁文件。
- 发布验证：`pnpm pack:cli --pack-destination /tmp/expo-harmony-cli-pack`。
