# SDK54 @expo-oh 项目约束

- 项目使用 sdk54-scoped-packages，发布组合 {{release}}。
- 保留 npm alias 和精确版本。不要全局改写 import、OHPM 名称或原生符号。
- 使用 npx expo install / prebuild --platform harmony / run:harmony。
- 不调用旧 scan/sync/injector，不向适配包重复应用历史补丁。
- 模块支持范围以本发布组合已验收能力为准，不把安装成功视作原生能力已实现。
