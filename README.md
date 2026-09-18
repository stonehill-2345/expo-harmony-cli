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
pnpm type-check
pnpm build
pnpm test
```

根命令目前转发至 CLI。单独运行和打包：

```bash
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
