# SDK54 排障

先运行 `npx expo-harmony-cli doctor`。若 runtime probe 失败，请确认依赖安装没有使用 `--ignore-scripts`，然后重新安装。旧 SDK54 工程只诊断，不自动迁移；建议创建 fresh 项目后手工迁移业务代码。
