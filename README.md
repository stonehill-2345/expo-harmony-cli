# expo-harmony-cli

Expo 鸿蒙适配 monorepo。现有 CLI 位于 `apps/cli`，示例应用和适配包目录按新版本规划预留。

## 目录结构

```text
expo-harmony-cli/
├── apps/
│   ├── example/                   # 预留：Router + Stack + Linking + SplashScreen
│   └── cli/                       # 现有 expo-harmony-cli 包
│       ├── src/
│       │   ├── config/            # 预留：统一配置
│       │   ├── prebuild/          # 现有预构建流程
│       │   ├── build/             # 预留：构建编排
│       │   ├── devices/           # 预留：安装与启动
│       │   └── …                  # 现有 commands、injector 等模块
│       ├── __tests__/
│       ├── templates/
│       ├── content/
│       ├── assets/
│       ├── docs/
│       └── package.json
├── packages/                      # 以下包目录均预留
│   ├── expo/
│   ├── expo-modules-core/
│   ├── expo-router/
│   ├── expo-constants/
│   ├── expo-linking/
│   ├── expo-splash-screen/
│   ├── expo-asset/
│   ├── @expo/
│   │   ├── metro-runtime/
│   │   ├── config/
│   │   ├── config-plugins/
│   │   ├── prebuild-config/
│   │   └── metro-config/
│   ├── babel-preset-expo/
│   ├── expo-modules-autolinking/
│   ├── expo-file-system/          # 以下为按需扩展
│   ├── expo-font/
│   ├── expo-keep-awake/
│   ├── expo-status-bar/
│   ├── expo-image/
│   ├── expo-haptics/
│   └── expo-web-browser/
├── scripts/                       # 预留：仓库辅助脚本
├── docs/                          # 仓库规划与设计资料
├── package.json                   # 私有根包，统一调度
├── pnpm-workspace.yaml
└── pnpm-lock.yaml                 # 全仓唯一锁文件
```

空目录通过 `.gitkeep` 保留。仅有目录不表示对应模块已经实现；新增源码包时再定义其 `package.json`、依赖和发布策略。工作区匹配 `apps/*`、`packages/*`、`packages/@expo/*`，当前只有 CLI 是实际工作区子包。

## 开发

使用 Node.js ≥ 20.19.4、pnpm 10.19.0，在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm check
```

根命令目前转发至 CLI：

| 命令 | 用途 |
| --- | --- |
| `pnpm test` | 源码测试，不需要先构建 |
| `pnpm test:watch` | 监听源码测试 |
| `pnpm test:pack` | 在临时目录构建、打包并验证实际安装包 |
| `pnpm type-check` | TypeScript 类型检查 |
| `pnpm check` | 类型检查 → 源码测试 → 产物测试；CI 使用相同入口 |
| `pnpm build` | 生成本地调试用的 `apps/cli/dist` |
| `pnpm pack:cli` | 自动清理、构建并生成 CLI 安装包 |

产物测试不复用或修改工作区的 `dist`，两组产物测试共享一次真实打包结果。`pnpm check` 不生成本地调试用的 `dist`。

运行本地 CLI 时先构建；单独打包会通过 `prepack` 自动构建：

```bash
pnpm build
pnpm --dir apps/cli exec node dist/index.js --help
pnpm pack:cli --pack-destination /tmp/expo-harmony-cli-pack
```

根包为私有工作区，CLI 保持 `expo-harmony-cli` 包名及原有命令。模板、补丁和文档随 CLI 发布，使用方无需获取整个 monorepo。

## 文档

- [CLI 简介与使用方式](apps/cli/README.md)
- [CLI 使用指南](apps/cli/docs/guide.md)
- [CLI 更新日志](apps/cli/CHANGELOG.md)
- [贡献指南](CONTRIBUTING.md)
- [许可证](LICENSE)
