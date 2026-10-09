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

目录架构：

```text
expo-harmony-cli/
├── apps/
│   ├── cli/                    # expo-harmony-cli，唯一 npm 发布物
│   │   ├── src/                # CLI 源码：sdk54、injector、installer、scanner、prebuild、lifecycle 等
│   │   ├── __tests__/          # 源码测试（*.test.ts）+ 打包产物测试（*.pack.test.ts）
│   │   ├── templates/          # 鸿蒙原生工程模板
│   │   ├── content/            # 分发内容：patches/sdk-54（补丁、manifest、许可证）等
│   │   ├── assets/             # 截图等静态资源
│   │   └── docs/               # 使用指南（guide.md）
│   └── example/                # 预留：Router + Stack + Linking + SplashScreen 示例应用
├── packages/                   # 14 个 Expo SDK54 Harmony 源码包，禁止独立发布
│   ├── expo/ · expo-router/ · expo-modules-core/ · expo-asset/ · expo-constants/ …
│   └── @expo/                  # @expo/cli、@expo/metro-config
├── scripts/
│   └── sdk54/                  # 确定性构建与验收工具链（.mjs 工具 + __tests__）
└── docs/                       # designs（设计）、plans（实施计划）、releases（验收证据）
```

各目录约定：

- `apps/cli/`：CLI 唯一发布物，依赖和发布配置归该包维护。
- `packages/`：SDK54 Harmony 适配的确定性源码基线，用于生成与上游版本精确对应的 package patch；固定来源信息，不构建、不发布到 npm。
- 根目录执行统一命令；单独操作 CLI 可用 `pnpm --dir apps/cli <命令>`。
- 新增工作区包时添加自己的 `package.json`，并更新根锁文件；不要提交子包锁文件。
- 发布验证：`pnpm pack:cli --pack-destination /tmp/expo-harmony-cli-pack`。
