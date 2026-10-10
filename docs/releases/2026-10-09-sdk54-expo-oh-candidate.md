# SDK54 @expo-oh 候选执行记录

对应计划：[`2026-10-09-sdk54-expo-oh-npm-release.md`](../plans/2026-10-09-sdk54-expo-oh-npm-release.md)。15 个运行时包已公开发布。产品 CLI 沿用无 scope 包 `expo-harmony-cli`，不属于本发布集合，本轮不发布。

## 已完成

- 14 个 Expo 适配包和 screens overlay，共 15 个运行时包 tgz 已生成；清单及 integrity 位于 `outputs/sdk54/npm-release/release.json`。
- `verify-npm-release.mjs` 校验通过（`failures: []`），包括包身份、入口、原生文件、依赖声明及运行期元数据。
- 全量 `pnpm check` 通过：产品 CLI 500 项、打包 CLI 4 项、SDK 工具 237 项，另包含 TypeScript、打包确定性、包审计、patch 审计和仓库检查；release 工具测试 6 项单独通过。
- npm 已完成浏览器登录，并按用户授权创建免费公共包组织 `@expo-oh`；`npm org ls expo-oh --json` 已确认账号 `qazwsx111` 为 owner。
- 已连接用户启动的 HarmonyOS 模拟器，读取系统版本为 `emulator 6.0.0.130(SP7DEVC00E130R4P11)`。

## 安装验证发现及修正

1. `-harmony.0` prerelease 不能满足部分上游 peer 区间（包括 `expo-font >=14.0.4`）。候选改用普通数值版本，以 `harmony` dist-tag 分发。
2. 只有根 npm alias 会在传递 peer 中引入官方 Expo 副本。新项目生成 npm/pnpm overrides，固定适配包与外部兼容组合。
3. npm 11 在虚拟 peer 上下文无法解析 `$react` override。改用完整版本声明，直接依赖的 override 与其 spec 保持完全一致，并增加回归测试。
4. 本地验收 registry 曾将上游 tarball 当文本转发，导致 `TAR_BAD_ARCHIVE`；已改为原始二进制转发。这次失败属于验收工具，不能当作发布包验收结果。

5. 标准 `expo start` 原先只识别旧 managed-state，已支持 scoped 模式并通过回归测试。
6. RNOH 在 pnpm 布局下按 screens 真实发布名重定向，Metro 已补充别名安装路径映射。
7. screens 改名后原生兼容配置未被识别，导致缺少 ScreensPackage 和白屏；自动链接现识别新 npm 名称并保留旧 OHPM/ETS/C++ 身份，默认模板首页和 Modal 已恢复。

## 最终验收

- 四组 `blank-typescript/default × npm/pnpm` 严格安装、锁文件重装、依赖图检查和运行探针全部通过，最终候选 integrity 与 `peer-install-report.json` 一致。
- 从仓库构建的无 scope `expo-harmony-cli` 候选执行 create，完成 npm blank 和 pnpm default 创建，均生成 `sdk54-scoped-packages` 状态。该验证不代表发布了新的 CLI 版本。
- `expo install expo-font`、`expo install --check`、`expo install --fix` 通过，保留准确 scoped alias；prebuild、标准 start、run:harmony 和产品 doctor 已执行。doctor 项目检查通过，环境 5 项通过、1 项 hvigor 路径提示；实际 DevEco HAP 构建成功。
- 两模板 Debug 实际画面、clean Release 构建、停止 Metro 后强制停止并冷启动均通过。默认模板 Debug 的 Modal、dismissTo、Explore、WebBrowser 页面已观察；最终 Release 的 Modal 和系统 Back 返回首页已截图确认。
- 两个最终 Release HAP 内嵌 bundle 的 SHA256 均与构建资源一致。
- 设备：`127.0.0.1:5555`，`emulator 6.0.0.130(SP7DEVC00E130R4P11)`；OpenHarmony SDK 20，DevEco Studio 自带 ohpm/hvigor。
- 设备 fixture 在修复过程中替换过候选包，最终 27 个已安装包已逐文件与当前 tgz 比对。设备 fixture 的旧锁文件不作为最终重装证据；重装证据来自四组新建 fixture。blank Debug 早于最后的 CLI/Metro/autolinking 修复，最终 blank clean Release 和冷启动使用最终包文件。
- 本轮未复用 CLI 1.5.0 的历史设备证据。

## 证据位置

本地完整证据保存在 `outputs/sdk54/npm-release/`：

- `release.json`：15 个运行时包版本、tgz 和 integrity。
- `peer-install-report.json`：四组最终安装与重装结果。
- `device-package-file-check.json`：设备依赖与最终 tarball 文件比对。
- `candidate-evidence.json`：设备观察、截图 SHA256、HAP/bundle SHA256、限制说明。
- `acceptance.json`：绑定当前 15 个运行时包 integrity 的发布门禁。
- `registry-availability.json`：发布前对 15 个运行时包名完成可用性查询，owner 权限另经 `npm org ls expo-oh --json` 确认。
- `evidence/`：截图与构建、命令日志。

## 发布预检

- 15 个运行时包 npm dry-run 发布预检已全部通过（exit 0），日志：`outputs/sdk54/npm-release/evidence/expo-oh-publish-dry-run.log`。

## 公开发布结果

- 14 个 Expo 适配包和 `@expo-oh/react-native-screens` 已公开发布，统一使用 `harmony` dist-tag。
- `public-registry-report.json` 已逐包确认公开版本、`harmony` tag 和 `dist.integrity` 与候选清单一致。
- 从公开 registry 在全新默认模板项目执行 `npm install` 和 `npm ci` 均通过；15 个原依赖键全部解析到预期 `@expo-oh` 名称和精确版本，无对应官方包副本。结果见 `public-install-report.json`。
- 产品 CLI 保持已有无 scope 包名 `expo-harmony-cli`；错误的 scoped CLI 候选已从最终 release catalog 和发布证据中移除。
- 已公开的 `@expo-oh/expo@54.0.37` tgz 内嵌候选 metadata 曾记录 CLI 版本 `1.6.0`。该字段不再属于运行时包验收契约；运行时映射仍为已核验的 15 包，仓库当前生成的项目文档使用已发布的无 scope CLI `1.5.1`。

## CLI 发布边界

- 本轮不发布新的 `expo-harmony-cli` 版本。后续 CLI 发布沿用原包名和独立发布流程。

本记录仅声明已经实际观察到的模板场景，不代表各模块所有 API 均经设备测试。
