# expo-harmony-cli 版本路线图

> 状态：1.0.0 发布准备中，后续规划待实施
> 更新日期：2026-08-27
> 目标版本：1.0.0
> 当前基线：Expo SDK 52 / React Native 0.77.1 / RNOH 0.77.71
> 对标项目：[Expo-Harmony-Toolkit](https://github.com/BlackishGreen33/Expo-Harmony-Toolkit)（EHT：RN 0.82.1 / RNOH 0.82.29）

---

## 1. 产品定位

`expo-harmony-cli` 的核心职责是：**从 0 创建带 HarmonyOS 基线的 Expo 项目，并管理鸿蒙依赖适配**。

当前主链路：

```text
create -> install -> prebuild --platform harmony -> sync -> DevEco Studio
```

CLI 已具备：

- `create / install / uninstall / prebuild / scan / sync / list` 命令；
- Expo SDK 52、RN 0.77.1、RNOH 0.77.71 的锁定基线；
- compat-table、HarmonyOS 包映射、patch 和 content 注入体系；
- 内置 HarmonyOS 模板，`prebuild` 通过本地复制生成 `harmony/`；
- `bundle:harmony:release` 生成 rawfile JS bundle，HAP/APP 签名和最终构建仍由 DevEco Studio 完成。

EHT 的定位不同：EHT 更适合存量项目迁移、环境准入、HAP 构建和结构化诊断。本路线图只借鉴 EHT 中能直接提高“新项目创建成功率”的能力，不机械复制全部命令。

## 2. 规划原则

1. **围绕 1.0.0 核心承诺**：优先保证新项目创建、依赖适配和 HarmonyOS prebuild 可重复成功。
2. **先修真实问题，再做新能力**：命令参数、端口、配置覆盖、autolinking 和包管理器兼容优先于架构重构。
3. **版本小而具体**：每个版本只承载一条用户可感知的主线，并写明验收条件。
4. **新项目优先，存量项目后置**：migrate、plan/apply 和完整回滚属于后续产品边界扩展。
5. **不把环境依赖伪装成 CLI 能力**：npm registry、Gitee 镜像、DevEco 签名等由用户环境或 DevEco 管理，CLI 只做必要提示和校验。

---

## 3. 1.0.0 基线与已纳入事项

1.0.0 的成功标准是：用户从零执行 create，完成依赖安装和 HarmonyOS prebuild 后，可以在 DevEco Studio 打开 `harmony/` 继续开发和构建；普通 Expo 配置不被破坏，失败不会显示为成功。

### 1.0.0 已纳入的事项

| # | 事项 | 结果 |
|---:|---|---|
| 1 | 外部命令参数化 | install、uninstall、prebuild 等不再拼接 shell 字符串 |
| 2 | Metro 配置安全合并 | 共享 `metro.config.js`，按 HarmonyOS 条件启用 resolver，普通配置不被覆盖 |
| 3 | autolinking 真实性校验 | HAR、ArkTS、C++、CMake 缺失时明确失败 |
| 5 | release bundle 稳定化 | 清理旧产物并校验本次生成的非空 bundle |
| 11 | scan 默认只读 | `scan --apply` 才执行修改 |
| 23 | TurboModule codegen 使用实际包管理器 | pnpm/npm/yarn/bun 均执行对应 codegen 命令 |

### 1.0.0 主链路验收

```text
create
  -> install
  -> prebuild --platform harmony
  -> sync
  -> start:harmony（默认 Metro 端口 8081）
  -> bundle:harmony:release
```

必须覆盖：

- `pnpm / npm / yarn / bun` 安装和 TurboModule codegen；
- macOS、Windows 命令启动器和路径处理；
- HarmonyOS 默认端口与 Expo 默认端口统一为 `8081`，并支持 `HARMONY_METRO_PORT` 覆盖；
- 用户自定义 `metro.config.js` 不被静默覆盖，HarmonyOS resolver 以安全方式合并；
- 缺失原生入口、codegen 无输出、bundle 为空时均返回失败；
- 重复 `prebuild`、`sync`、`scan --apply` 不产生非预期脏状态；
- npm 包发布物包含 `dist/`、`templates/`、`content/` 和 `patches/`。

---

## 4. 待办事项池

状态说明：待办按版本分组；同一版本内按 P0、P1、P2、P3 排列，`#` 为全局连续编号。

### 1.0.0：创建链路稳定

| # | 待办 | 优先级 | 参考来源 | 结论 |
|---:|---|:---:|---|---|
| 1 | 参数化命令执行 | P0 | 当前 CLI 真实 bug | 已纳入 |
| 2 | Metro 配置安全合并（共享 `metro.config.js`，按 HarmonyOS 条件启用 resolver） | P0 | 当前 CLI 配置覆盖风险；EHT 独立 Metro 仅作实现参考 | 已纳入 |
| 3 | autolinking 校验 HAR/ArkTS/C++/CMake | P0 | 当前 CLI 真实 bug；RNOH 文件约束 | 已纳入 |
| 4 | scan 默认只读 | P0 | 当前 CLI 修改风险 | 已纳入 |
| 5 | TurboModule codegen 按实际包管理器执行 | P0 | 当前 CLI 的真实兼容性 bug | 已纳入 |
| 6 | 统一 Metro 默认端口（Android/iOS/HarmonyOS 均为 `8081`） | P0 | 当前 CLI 端口不一致；Expo 默认约定 | 已纳入 |
| 7 | 稳定 `bundle:harmony:release` 脚本（共享 Metro、清理旧产物、校验 bundle/assets） | P1 | 当前 CLI 已有能力；EHT 仅作产物校验参考 | 只稳定现有脚本 |

### 1.1.0（实际发布：排障修复）

| # | 待办 | 优先级 | 参考来源 | 结论 |
|---:|---|:---:|---|---|
| 8 | 删除 Xcode 宽泛承诺、补版本提示 | P1 | 当前 CLI 文档问题 | 文档和轻量检查 |
| 9 | `env` 环境检查 | P1 | EHT env 检查 | 诊断增强 |
| 10 | `doctor` 只读检查 | P1 | EHT doctor 思路 | 依赖 env 和报告 |
| 11 | sidecar manifest/hash | P1 | 当前 CLI 覆盖风险；本地设计 | 先保护受管文件，hash 后置 |

> 诊断与变更保护主题整体顺延至 1.2.0。

### 1.3.0：构建辅助与链接工具

| # | 待办 | 优先级 | 参考来源 | 结论 |
|---:|---|:---:|---|---|
| 12 | `build-hap` | P1 | EHT `hvigor assembleHap` | 有价值但不阻塞创建 |
| 13 | 官方 `link-harmony` 自动化 | P1 | EHT 官方 link-harmony | 先对比，逐步替换 |
| 14 | JSON 报告和稳定退出码 | P2 | EHT 结构化报告 | CI 需要时再做 |
| 15 | 统一 bundle 命令（debug/release）、产物 hash 和 stale 检测 | P2 | EHT bundle 流程作实现参考 | 在现有脚本稳定后再抽象 |

### （并行预研，不占版本号）：基线升级预研与生态原型

| # | 待办 | 优先级 | 参考来源 | 结论 |
|---:|---|:---:|---|---|
| 16 | Expo 55 / RNOH 0.82 基线升级预研 | P0 | EHT 已验证 RNOH 0.82 | 先做兼容性预研 |
| 17 | config plugin 原型 | P1 | Expo 生态集成方向 | 不改变默认流程 |

### 2.0.0：存量项目与多基线

| # | 待办 | 优先级 | 参考来源 | 结论 |
|---:|---|:---:|---|---|
| 18 | `migrate` 存量项目迁移 | P1 | EHT 核心场景 | 产品边界扩展 |
| 19 | 多版本矩阵并行 | P1 | 当前 CLI 产品规划；暂无 EHT 直接依据 | 与基线升级配套 |
| 20 | plan/apply、fingerprint、回滚 | P2 | 原设计方案；暂无 EHT 直接依据 | 先 dry-run，再评估事务回滚 |
| 21 | Capability Registry 重构 | P2 | 当前 CLI 技术债；暂无 EHT 直接依据 | 技术债，不阻塞交付 |

### 暂不排期

| # | 待办 | 优先级 | 参考来源 | 结论 |
|---:|---|:---:|---|---|
| 22 | supportTier 三层标注 | P2 | EHT 能力分层思路 | 当前 status 已够用 |
| 23 | 完整 Xcode 构建 Gate | P3 | 原设计；非 EHT 鸿蒙主链路 | 与核心鸿蒙目标弱相关 |
| 24 | CDN 模板分发 | P3 | EHT 部分思路；当前模板已随 npm 包内置 | 暂不排期 |
| 25 | Hermes HBC bundle | P3 | EHT/生态方向；当前无性能证据 | 暂不排期 |

### 1.0.0 端口统一交付内容

- `start:harmony` 默认端口从 `8888` 改为 `8081`；
- HarmonyOS `EntryIndex.ets` 默认 Metro 地址改为 `localhost:8081`；
- `hdc rport` 默认使用 `tcp:8081 -> tcp:8081`，不再把 `8888` 作为主路径；
- 启动日志、Dev Settings 提示、bundle 脚本和相关文档统一使用 `8081`；
- 保留 `HARMONY_METRO_PORT` 覆盖能力，用于端口冲突场景；
- 验证开发包通过 8081 加载 Metro，Release bundle 在关闭 Metro 后仍可启动。

---

## 5. 后续版本规划

### 1.1.0 —— 诊断和变更保护

**目标**：让用户能在构建前知道环境和项目状态是否满足条件，降低误覆盖风险。

**具体范围**：

- `env`：检查 Node、Expo/RN/RNOH、DevEco、SDK、ohpm、hvigor、hdc；
- `doctor`：只读汇总兼容性、环境和 blocker；
- 删除文档中无法证明的 Xcode 版本承诺；
- 受管文件清单和 drift 提示；
- 对 `prebuild`、`sync`、`scan --apply` 增加用户修改保护；
- 统一错误分类，但暂不承诺完整 JSON 报告。

**验收**：缺工具、版本不匹配、受管文件被修改时，输出具体原因和下一步操作；只读命令不改项目。

**不做**：migrate、事务式回滚、完整 Xcode Gate。

### 1.2.0 —— 构建辅助和官方链接工具评估

**目标**：减少 DevEco 手工步骤，同时降低自研 autolinking 的长期维护成本。

**具体范围**：

- `build-hap --mode debug`：调用本地 hvigor，发现并报告 HAP；
- release 模式只做签名存在性阻断，不托管密钥；
- `link-harmony` 与当前自研 autolinking 的能力对比；
- 若官方工具覆盖现有场景，再提供兼容开关并逐步替换；
- 评估统一 `bundle --mode debug/release` 命令，增加产物 hash 和 stale 检测；
- 按需要补 JSON 报告和稳定 CI 退出码。

**验收**：debug 项目可由 CLI 生成 HAP；失败能区分环境、签名和产物问题；现有原生包注册不回归。

**不做**：存量迁移、基线升级、多版本矩阵。

### 1.3.0 —— 生态接入和基线升级预研

**目标**：为下一代基线和 Expo 生态集成降低风险，不把未经验证的升级直接混入稳定版本。

**具体范围**：

- Expo 55 / RNOH 0.82 独立兼容性预研；
- patch、compat-table、模板和默认依赖差异清单；
- config plugin 原型（不改变 1.0.0 默认流程）；
- 单版本基线升级的回滚和迁移策略；
- 多版本矩阵的配置格式设计。

**验收**：形成可运行的实验分支或 beta 项目、兼容性报告和升级成本评估；未通过时不影响 1.0.0/1.1.x。

### 2.0.0 —— 存量项目和多基线

**目标**：扩展到已有 Expo/CNG/bare 项目，并正式支持多版本基线。

**具体范围**：

- `migrate --dry-run` / `migrate --apply`；
- fingerprint 漂移检测和有限回滚；
- Expo 55 / RNOH 0.82 基线（以前置预研通过为条件）；
- 多版本矩阵；
- config plugin 正式接入；
- Capability Registry 渐进重构。

**验收**：存量项目保留 iOS、Android、业务源码和主 Metro；迁移可重复、可诊断；不同基线可明确选择并通过兼容性检查。

**不做**：没有真实需求和性能数据前，不加入 CDN 模板和 Hermes HBC 作为强制能力。

---

## 6. 明确暂不排期的事项

### CDN 模板分发

当前 HarmonyOS 模板已经随 npm 包发布，`prebuild` 使用本地 `fs.cpSync`。远程 CDN 会引入版本、缓存、完整性和离线失败问题，除非 npm 包体积或模板更新频率成为实际瓶颈，否则不做。

### Hermes HBC

当前 release 流程使用 JS rawfile bundle，已满足可发布链路。只有实测包体、启动速度或性能无法接受时，才单独立项验证 HBC 与 RNOH 0.77/后续基线的兼容性。

### 完整 Xcode Gate

CLI 的主目标是 HarmonyOS 基线创建，完整 iOS pod、模拟器、archive 和 smoke gate 会显著扩大维护范围，暂不纳入主路线。

---

## 7. 依赖与风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| RNOH 0.77 能力上限 | 新版 RN/RNOH 能力不可用 | 1.3.0 先预研，2.0.0 再升级 |
| DevEco/ohpm/hvigor 缺失 | 无法完成原生安装或 HAP 构建 | 1.1.0 env/doctor 提前诊断 |
| 默认端口调整 | 真机 Dev Settings 和旧脚本不一致 | 提供 `HARMONY_METRO_PORT`，同步模板和文档 |
| scan 只读行为变化 | 旧用户习惯被改变 | 保留 `scan --apply`，错误提示给出迁移方式 |
| 包管理器差异 | codegen 或安装命令失败 | 1.0.0 统一使用 `resolvePm` 和参数化命令 |
| 自研 autolinking 与官方工具差异 | 替换后可能丢原生注册 | 1.2.0 先对比，保留兼容开关 |
| 单版本范围膨胀 | 短周期无法交付 | 每版只接受本文件列出的范围，新增需求进入待办池 |

## 8. 发布策略

- `1.0.0`：当前基线稳定版，完成从 0 创建和 HarmonyOS prebuild 主链路；
- `1.1.0`：以 beta 形式验证 env/doctor 和变更保护；
- `1.2.0`：以 beta 形式验证 debug HAP 构建和官方 link-harmony 对比；
- `1.3.0`：只发布预研或实验性 beta，不影响稳定默认基线；
- `2.0.0`：涉及存量迁移、多版本或基线升级时再引入破坏性变更。

每个版本都必须具备：全量单测、type-check、create→install→prebuild 冒烟；涉及构建时再增加真实 DevEco/HAP 验收。除非主公明确要求，不主动提交代码或文档变更。
