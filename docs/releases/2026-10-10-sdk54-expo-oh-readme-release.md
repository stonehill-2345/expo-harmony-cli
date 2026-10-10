# SDK54 @expo-oh README 补丁发布

发布组合：`sdk54-expo-oh-harmony.1`。15 个 `@expo-oh` 运行时包均已公开发布，主包 `expo-harmony-cli` 保持现有版本和默认依赖组合，之后独立发布。

## 修改内容

- 15 个包的 README 补齐鸿蒙安装、使用示例、支持范围、限制、构建步骤、问题反馈和上游许可证说明。
- npm homepage 指向本仓库对应包的 README；上游 Expo 文档保留为通用 API 参考。
- 发布时复制完整鸿蒙 README，并校验产物内容与文档源一致。
- 发布版本独立于上游源码版本；包间依赖 alias 和 Expo 内嵌运行时清单同步升级。
- Core 包新增两份已有 Harmony 适配源码的生成类型声明及其映射文件；JS、原生代码和其余运行时文件与首轮发布逐字节一致。

## 版本

| npm 包（均为 @expo-oh scope） | 原版本 | 新版本 |
| --- | --- | --- |
| expo-cli | 54.0.27 | 54.0.28 |
| expo-metro-config | 54.0.17 | 54.0.18 |
| expo | 54.0.37 | 54.0.38 |
| expo-asset | 12.0.13 | 12.0.14 |
| expo-constants | 18.0.14 | 18.0.15 |
| expo-font | 14.0.12 | 14.0.13 |
| expo-linking | 8.0.12 | 8.0.13 |
| expo-modules-autolinking | 3.0.27 | 3.0.28 |
| expo-modules-core | 3.0.30 | 3.0.31 |
| expo-router | 6.0.24 | 6.0.25 |
| expo-splash-screen | 31.0.13 | 31.0.14 |
| expo-status-bar | 3.0.9 | 3.0.10 |
| expo-system-ui | 6.0.9 | 6.0.10 |
| expo-web-browser | 15.0.11 | 15.0.12 |
| react-native-screens | 4.9.0 | 4.9.1 |

## 发布与验证

- 15 个包的 `harmony` 和 `latest` 标签均已更新并核验为上表新版本。
- 发布清单独立保存在 `docs/releases/sdk54-expo-oh-harmony.1.json`；`sdk54:release:manifest` 默认生成运行时清单，不再自动改写产品 CLI 的清单。
- 产物及验收证据目录：`outputs/sdk54/npm-release-harmony-1/`。上一轮产物目录不覆盖。
- 已完成 15 包重新构建/打包及完整性检查；按既有构建规则重新编译 CLI、Metro 与 Autolinking，其余包收集已有运行时文件。
- `runtime-comparison.json` 记录新旧产物逐文件对比及 integrity。设备行为证据来自首轮验收，本轮不声称重新执行了设备测试；只有运行时代码等价成立且新依赖安装验证通过时才沿用设备行为结论。
- SDK 工具测试 238 项通过；发布工具测试 7 项通过。
- 四组 `blank-typescript/default × npm/pnpm` 严格安装、锁文件重装、依赖图和运行探针全部通过，见 `peer-install-report.json`。
- 15 个包的 npm publish dry-run 均通过，产物 integrity 与发布清单一致，见 `dry-run.json`。
- `baseline-registry-verification.json` 已将 15 个基线包的 integrity 与公开 npm 核对；`acceptance.json` 绑定新产物哈希并显式标明设备证据沿用方式。
- 正式发布完成：`public-registry-report.json` 逐包核验了新版本、`harmony/latest` 标签、homepage 和 SHA512 integrity。
- 已从 npm 公开下载全部 15 个 tgz；包内 README 与本仓库文档源逐字节一致（`publicTarballReadmeMatches: true`）。
- registry 顶层 `readme` 字段为空，官方 `expo-constants` 包亦如此，因此该字段不用于判定文档发布成败。npm 网站对自动请求返回 403 访问校验页，本轮未声称已验证网页渲染效果。

## 产品 CLI 边界

`expo-harmony-cli@1.6.0` 仍默认安装 `sdk54-expo-oh-harmony.0`。本次不修改 `apps/cli/` 下的版本、源码或发布清单。后续 CLI 发布时再显式更新它的内置清单和相关验证。

旧项目升级需要一起更新已使用的 alias、npm overrides 和 pnpm overrides，保留模板原有依赖键。新运行时组合的 `expo install` 读取新版 `expo/harmony-release.json`；旧产品 CLI 的 doctor/repair 仍按旧组合校验，不应据此回退新组合。

README 中指向 GitHub 新增文档的链接在对应文档合入远端后可访问；npm 包内 README 正文随本次发布更新。

## 已知工具表现

- `@expo-oh/expo-cli@54.0.28` 的 `expo --version` 仍输出构建时内嵌的上游基线 `54.0.27`；判断实际 fork 版本应读取 `node_modules/@expo/cli/package.json` 的 `name` 和 `version`。本轮保持可执行代码与首轮一致。
- default 模板的 `expo install --check` 会误报 `@react-navigation/bottom-tabs@7.4.0`（期望 `^7.4.0`）、`@react-navigation/native@7.1.17`（期望 `^7.1.8`）、`@react-navigation/native-stack@7.3.16`（期望 `^7.3.16`）。旧组合与新组合均已实际复现，属于已有区间校验问题。本次四组严格安装、重装与运行探针全部通过，但不声称 default 模板的全量 `install --check` 无告警。
