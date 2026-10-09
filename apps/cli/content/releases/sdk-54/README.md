# {{appName}}

本项目使用 Expo SDK54 的 @expo-oh 鸿蒙适配包，发布组合为 `{{release}}`。
依赖通过 npm alias 安装，业务代码继续使用 `expo`、`expo-router` 等原始包名。

## 开发

```bash
npx expo prebuild --platform harmony
npx expo run:harmony
npx expo start
```

使用创建项目时选择的 npm 或 pnpm，提交并保留对应锁文件。
新增已适配 Expo 包使用 `npx expo install <包名>`；诊断使用
`npx expo-harmony-cli@{{cliVersion}} doctor`。
`npx expo install --check` 和 `--fix` 使用本发布组合的兼容版本。

## 支持边界

运行环境：React 19.1.1、React Native 0.82.1、RNOH 0.82.30。
仅 blank-typescript 和 default 模板属于本组合验收范围。
Default 使用 React Native Image 替换 expo-image；依赖中包含某个包不代表其全部原生 API 已适配鸿蒙。

不要把 alias 改回官方包或混装另一套 SDK；升级应整体更新发布组合。
新模式不需要这批适配包的 patch-package 补丁，也不使用旧 scan/sync/injector。
原生配置由 Expo Harmony prebuild/autolinking 生成；修改配置后重新 prebuild。
已有旧 SDK54 patch 项目不自动迁移，请保留项目文件并另行安排迁移验证。

## 排查

安装失败时保留包管理器日志，检查 scope 权限、版本是否已发布和 peer 冲突。
不要使用 --force 或 --legacy-peer-deps 隐藏依赖冲突。
Doctor 报包身份错误时，检查 package.json alias 和锁文件；重装后再次诊断。
设备构建需要本机 HarmonyOS SDK、DevEco 构建工具和可用的签名配置。
