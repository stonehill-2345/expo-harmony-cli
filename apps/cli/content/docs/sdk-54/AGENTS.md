# SDK54 Agent Guide

项目 `{{slug}}` 使用 `sdk54-package-patch`。依赖必须保持精确版本；重装后确认 postinstall 成功，再运行 doctor。

主路径是 `npx expo prebuild --platform harmony`、`npx expo run:harmony` 和 `npx expo start`。额外原生模块不在 1.5.0 fresh-create 范围内，应失败关闭。
