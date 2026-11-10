# SDK54 B-03：标准 export Harmony 命令面

日期：2026-11-02，最终复验 2026-11-10。负责人：B。状态：**B-03 全矩阵自验 PASS，等待 A 复核。**

## 问题

架构计划要求标准 `npx expo export --platform harmony`。此前 CLI 存在三处缺口：

- export help 仅列出 android、ios、web、all。
- `resolvePlatformOption` 将 `harmony` 判为未知平台。
- `getPlatformBundlers` 无 Harmony 项，无法从已安装 release 身份启用标准 Metro export。

## 实现

- `getPlatformBundlers` 复用已安装 release identity 检查，仅对完整的 `@expo-oh/expo` + RNOH 组合增加 `harmony: metro`；官方 Expo 项目不增加该键。
- export 平台类型加入 `harmony`；显式 `--platform harmony` 可用，`all` 在适配项目中包含 Harmony。
- export bundle/metadata 类型加入 Harmony，help 同步列出 `android, ios, web, harmony, all`。
- Android/iOS/Web 的已有解析与 bundler 选择不变。

## 验证

- Jest 29 目标测试：2 suites、11 tests 全部通过。
- 覆盖：适配身份增加 Harmony bundler、官方身份不增加、显式 Harmony、`all` 展开和无 Harmony bundler 时拒绝。
- 受控 release 打包完成 TypeScript 编译、runtime probe 和 source map 校验。
- CLI 候选：`outputs/sdk54/b03-cli-export-harmony-20261102/expo-oh-expo-cli-54.0.28.tgz`
- SHA-256：`d1ee47d3dd1c86ad90c3ae6e31a4f765f1a5b7d10a6912af5dd7cb3037bad2bc`
- 包内构建产物已核对：help、knownPlatforms、release identity bundler 均包含 Harmony。

## 2026-11-05 真实消费复验

首次真实 `expo export --platform harmony` 发现 `ManifestMiddleware.ts` 仍将入口平台硬编码为 `ios/android/web/none`，在 Metro 启动后报错 `The platform "harmony" is not supported`。新增失败回归后，仅把 `harmony` 加入该入口解析白名单；Jest 29 对应文件 10/10 通过。

最终 CLI 候选：

- `outputs/sdk54/b03-cli-export-harmony-20261105/expo-oh-expo-cli-54.0.28.tgz`
- SHA-256：`3b42e91ec18bec26582fe9a841025bab0d56b00b02707a26b25337b3005821dc`

在独立 pnpm blank 工程中安装真实 tgz 后执行：

```text
./node_modules/.bin/expo export --platform harmony \
  --output-dir /Users/chensq/Desktop/2345/expo-harmony-cli/outputs/sdk54/b03-export-live-20261105/artifacts
```

结果为 PASS：最终候选 Metro 在 6.623 s 内打包 612 modules，输出一个 1,146,799 bytes 的 Harmony bundle；`metadata.json` 的唯一平台键为 `harmony`，bundle 路径位于 `_expo/static/js/harmony/`，且 bundle 包含 blank 应用文案。

- bundle SHA-256：`ce154b83178720658549bf465f07ae2f0dfbfee3355069ccd3d86cc4c80b85f4`
- metadata SHA-256：`23cc9426c5064e2e67841ecd0b430b06ec50a947438d5db1ac19d481f20db813`
- 结构化验证：`outputs/sdk54/b03-export-live-20261105/final-validation.json`
- 验证 JSON SHA-256：`2efd00de60a8be1ae0c381dd2d904bf0d69476b690222d82d92a810bc4f383d0`

同一消费工程随后完成 Debug 构建、安装、启动和页面截图，证明 B-03 CLI 候选与适配 release identity 可共同工作；最终 B-01 候选的设备证据另见 B-01 报告。

## 2026-11-10 最终矩阵

最终 CLI 候选更新为：

- `outputs/sdk54/b03-cli-export-harmony-20261110/expo-oh-expo-cli-54.0.28.tgz`
- SHA-256：`2474adcd5bc8c9a52819d6763a44f733328b284291207f69eba40b58555b5e9e`

同一候选在 pnpm 与 npm blank 消费工程中均完成：

- `expo config --type public --json`；
- `expo install --check`；
- `expo export --platform harmony`，metadata 唯一平台为 `harmony`；
- `expo export --platform all`，metadata 平台精确为 `android`、`harmony`、`ios`；
- npm 工程将 React 强制降为 19.0.0 后，`expo install --check --json` 识别期望 19.1.1，`expo install --fix --npm -- --force` 恢复 19.1.1；
- 自定义 Metro resolver 与 serializer 包装原始实现后，三平台均真实调用。最终专用日志计数为 resolver：Android 1337、Harmony 1448、iOS 1340；serializer：三平台各 1 次。

最终自定义配置输出为 `npm-custom-all-final`；此前 `npm-custom-all` 使用了绕过原始 Harmony resolver 的错误测试配置，`npm-custom-all-fixed` 未保存隔离后的平台调用日志，两者均由本轮最终证据取代。

机器可重算汇总：`outputs/sdk54/b03-export-final-20261110/validation.json`，SHA-256 `bd1d2a7321ad3505253477ff810ef7df64d57cbcfe40a2c72173f4642d7d9b1a`。汇总内八项断言全部为 `true`，pnpm/npm 锁文件、自定义配置及平台日志均已复制到同一证据目录。

B-03 自验结论为 PASS；GB/M5 阶段关闭仍需 A 复核，并受 default 模块候选阻塞。
