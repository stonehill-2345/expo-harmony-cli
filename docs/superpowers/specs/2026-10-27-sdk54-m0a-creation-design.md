# SDK54 Harmony M0A 创建与最小运行设计

依据已授权的 SDK54 新架构总计划第 4 节持续实施，保持 M0A 原五单元及验收定义。M0 已关闭；M0 的固定来源与证据作为历史基线，不回写为当前代码快照。

## 来源与交付边界

- 同源 `create-expo@3.5.11`、`expo-template-default@54.0.63`、`expo-template-blank-typescript@54.0.47` 均从 Expo `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1` 的各自 subtree 纳入，保留许可证、上游测试、资源和源码 hash。registry wrapper 及其可变执行依赖不作为来源。
- 候选身份分别为 `@expo-oh/create-expo@3.5.12`、`@expo-oh/expo-template-default@54.0.64`、`@expo-oh/expo-template-blank-typescript@54.0.48`。源码工作区 private，独立 staging 构建、打包，禁止自行发布。
- 保留上游 `--template`、`--no-install`、`--yes` 及 `npm_config_user_agent` 包管理器选择；帮助与真实执行一致。本地 template tgz 是上游已有接口，用于未发布候选验证。

## 创建与安装

模板直接声明 `npm:@expo-oh/...@固定版本` 及 React 19.1.1 / RN 0.82.1 / RNOH 0.82.30；版本沿用既有真实目标组合。构建模板时进行发行映射，创建后只执行上游项目命名、包管理器配置和安装。不注入 HAR、源码替换、补依赖、managed-state 或独立 CLI。默认模板保留 expo-image 及原有页面，未适配模块按 M7 原 ID 登记。

## 运行与旧入口

从项目本地安装的适配 Expo、release metadata 和 RNOH 真实身份识别 Harmony；声明或 managed-state 不能授权。Metro 的直接配置入口及 start 均采用安装身份，防止不同项目复用进程环境造成误判。prebuild/run 使用适配 Expo 标准入口，复用已存在的原生生成与工具链；遇到配置/插件/Core 的具体前置缺陷保存真实失败并按原计划推进前置条目。

新创建器可独立执行后，移除独立 CLI 的 SDK54 创建分流，保留 SDK52 legacy 及必要拒绝诊断；删除仅按调用图核实的无消费者 SDK54 创建实现，SDK52 共用模块保持。

## 验收

真实构建及打包创建器和两模板；以仓库外四目录执行 default/blank × npm/pnpm 创建、安装和依赖身份检查。候选依赖需本地 registry 或受控 registry 固定解析，不能事后改项目 manifest。逐命令保存退出码、日志、tarball 完整性及应用文件对照。blank 执行 prebuild/start/run、Harmony bundle 请求、删除 state 后重启和设备首屏断言；default 的模块阻塞保持 BLOCKED 并关联 M7。只有整个原单元交付和验收完成才增加 20%，不能按内部测试数量计进度。

边缘情况：安装失败必须非零；未知/官方包身份不能凭旧状态启用 Harmony；损坏适配 metadata 给出错误；npm/pnpm 均不得依赖 workspace 链接；空目录、名称替换、本地 tgz、缺包、重复运行及环境泄漏均有针对验证。用户未授权提交、推送或发布。
