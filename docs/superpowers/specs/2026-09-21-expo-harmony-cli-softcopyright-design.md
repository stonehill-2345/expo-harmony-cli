# Expo Harmony CLI 软件设计说明书重写设计规范

## 目标

以 `设计说明书（模板）.docx` 为唯一版式基准，以“基于模型上下文协议构建的AI服务系统V1.0软件设计说明书”为内容深度参考，为当前 `expo-harmony-cli` 项目重写一份 20 至 60 页、原生文字可编辑的 Word 软件设计说明书。软件名称为“基于 Expo 跨端体系的可复用标准化多端项目脚手架系统”，版本号统一为 `V1.4.0`。

最终纠错：模板与参考文档均无独立目录，模板第2–3页为正文占位章节。以 `softcopyright-output/rebuild/artifact.md` 的原件XML、实际run覆盖和完整渲染证据为最终版式契约；下文残留的目录相关验收仅指章节结构，禁止添加TOC或独立目录页。CLI运行记录图按原始输出生成并保留日志，不称为真实终端屏幕截图。最终正文使用 `manuscript.md`。

## 已核验的模板与参考文档规则

### 模板版式

- A4 纵向，封面与正文共两个节；封面独立页眉页脚，正文沿用页眉横线和页码。
- 封面保留模板的居中标题布局，替换软件全称与“V1.4.0 软件设计说明书”。
- 正文固定章节覆盖：`1.产品描述`、`1.1`、`1.2`、`1.3`、`2.产品需求概述`、`2.1`、`2.2`、`3.功能需求`、`4.性能需求`、`5.UI设计说明`；按内容自然扩展，不新增独立目录。
- 一级、二级、三级标题分别复用模板的 Heading 1、Heading 2、Heading 3；正文、首段、紧凑段、代码段沿用模板已有样式，不新建第二套视觉风格。
- 正文以原生 Word 段落、表格、列表和代码块承载，图仅用于结构图、流程图、终端输出和运行截图。严禁将整页正文栅格化为图片。

### 参考文档写法

- 以产品定位、核心价值、技术架构和应用场景补足“产品介绍”，而非仅填一段概述。
- 在“功能需求”下先给出总体架构和结构图，再逐模块给出职责、输入输出、处理流程、关键函数/数据结构和对应图例。
- 在“性能需求”中写出可验证的工具链、响应、稳定性、可维护性和安全性边界；不虚构未在项目中实现的性能指标。
- 在“UI设计说明”中以 CLI 帮助、创建过程、依赖扫描、环境诊断、HarmonyOS 运行效果为界面/交互证据，图题采用“图5-x”连续编号。

## 当前项目事实基线

本说明书只使用下列项目事实，不移植参考文档的 MCP、数据库或 Web 管理后台内容：

| 主题 | 可引用的项目事实 | 主要证据 |
| --- | --- | --- |
| 产品定位 | 为 Expo 项目注入 HarmonyOS/OpenHarmony 开发基线，同一 JS/TS 代码覆盖 HarmonyOS、iOS、Android | `apps/cli/README.md` |
| SDK 基线 | 支持 Expo SDK 52/RN 0.77/RNOH 0.77 与 SDK 54/RN 0.82/RNOH 0.82 | `src/version-matrix.ts`、README、guide |
| 命令入口 | `create`、`install`、`uninstall/remove`、`scan`、`sync`、`prebuild`、`env`、`doctor`、`list` | `src/index.ts`、`src/commands/*` |
| 创建流程 | 校验项目名和 SDK，调用 create-expo-app，注入基线，扫描默认依赖，写入文档/技能 | `src/creator.ts` |
| 兼容适配 | 兼容表策略包括 bump-native、native、alias-only、shim、patch-only、remove、replace、unsupported | `src/scanner/compat-table.ts`、`src/scanner/scan.ts` |
| 工程生成 | 平台分流，Expo 原生预构建与 Harmony 工程生成；`--force` 明确覆盖 `harmony/` | `src/prebuild/*`、`src/harmony-project/*` |
| 自动链接 | 官方 `link-harmony` 优先，内置 mapping 补齐，生成 ETS/C++ 注册与 oh-package 依赖 | `src/harmony-project/official-autolinking.ts`、`autolinking.ts`、`standalone.ts` |
| 状态保护 | `.expo-harmony/managed-state.json` 保存受管文件哈希和依赖条目；漂移默认阻断，事务写入可回滚 | `src/lifecycle/managed-state.ts`、`src/harmony-project/standalone.ts` |
| 运行支撑 | `env`/`doctor` 工具链检查、Metro 8081、hdc rport、release JS rawfile bundle | README、guide、`src/env-checks/*`、`src/injector/start-harmony.ts`、`bundle-harmony-release.ts` |
| 可验证性 | 单元与集成测试覆盖命令分发、版本矩阵、适配、预构建、自动链接、漂移、模板和打包产物 | `apps/cli/__tests__`、`src/harmony-project/__tests__` |

## 文档目录与内容映射

### 1.产品描述

- 1.1 编写目的：面向软著审查与项目维护，说明文档边界。
- 1.2 产品名称：全称、简称、版本、分类。
- 1.3 产品介绍：产品定位、解决的人工配置问题、核心价值、技术架构、适用场景与创新点。

### 2.产品需求概述

- 2.1 功能简介：以命令能力和工程能力为维度列出模块。
- 2.2 版本兼容：Node.js、pnpm、DevEco、Expo、React Native、RNOH、HarmonyOS 工具链及 SDK 52/54 的对应关系；列明未支持范围。

### 3.功能需求

- 3.1 总体架构与命令分发：CLI 入口、流程编排、适配注入、Harmony 工程、运行支撑五层架构图。
- 3.2 项目创建与基线注入：`runCreate`、SDK 选择、配置/资料注入流程图。
- 3.3 版本矩阵与模板选择：`getVersionMatrix`、`detectSdkVersion` 和模板来源。
- 3.4 依赖兼容扫描：`scanAndAdapt`、策略表、依赖输入到改写结果的逻辑图。
- 3.5 安装与卸载：`runInstall`、`runUninstall`、受管包对账与清理。
- 3.6 预构建与 Harmony 工程生成：`resolveTasks`、preflight/postflight、`runHarmonyGeneration`。
- 3.7 自动链接与原生注册：官方优先、mapping 补齐、ETS/C++/oh-package 产物。
- 3.8 受管状态、漂移保护与事务回滚：`ManagedState`、`collectDrift`、原子替换及恢复。
- 3.9 环境诊断和开发运行：工具检查、退出码、Metro/hdc/DevEco 协作。
- 3.10 Release 打包和使用边界：rawfile bundle、签名交接、强制重建风险。

### 4.性能需求

- 工具链检测、命令错误提示、配置幂等、依赖版本收敛、文件保护、可恢复性和跨平台边界。
- 所有表述以现有实现和测试覆盖为依据；对“未覆盖或需人工适配”的原生模块保持明确限制，不给出未经验证的吞吐量或时延承诺。

### 5.UI设计说明

- 5.1 CLI 命令帮助与参数提示。
- 5.2 项目创建的阶段性输出与后续指引。
- 5.3 兼容表查询、依赖安装/扫描输出。
- 5.4 环境检查与 doctor 诊断输出。
- 5.5 HarmonyOS 工程与实际运行效果截图。

## 图、表和截图规划

- 图3-1：系统总体结构图；图3-2：命令分发流程图。
- 图3-3 至图3-9：创建、兼容扫描、安装/卸载、预构建、Harmony 工程生成、自动链接、漂移保护与回滚流程图。
- 图3-10：SDK/兼容策略/受管状态数据关系图；图3-11：Metro 与设备加载逻辑图。
- 图5-1 至图5-6：V1.4.0 命令帮助、创建、list/scan、install/sync、env/doctor、HarmonyOS 运行效果截图。
- 表格：版本兼容表、命令接口表、关键函数表、兼容策略数据字典、受管状态字段表、环境检查结果定义表。

所有图均使用完整图题、图号、来源说明。截图只保留与 V1.4.0 一致的版本信息；无法保证对应的区域应裁剪或隐去版本文本。

## 交付和验收标准

- Word 正文可选择、复制和编辑；正文不以图片替代。
- 版本号、封面、正文、图题和截图中的版本信息一致为 V1.4.0。
- 页数目标 28 至 36 页，绝不低于 20 页、不超过 60 页；原生文本不少于 2,000 字。
- 使用模板真实页眉、页脚、页码、边距、目录及标题样式；目录与正文标题层级逐项对应。
- 最终对 Word 文档进行原生文本提取、样式/节审计、图像审计和逐页渲染检查；如 LibreOffice 在当前环境无法渲染中文字体，以 Word 原生可编辑性和 macOS 字体可用性为准，并不得以整页图片规避。

## 变更边界

- 不修改项目功能代码、测试、模板原文件或参考文档原文件。
- 不提交 Git 变更，除非用户单独要求。
- 最终只覆盖桌面上的同名设计说明书；中间稿留在项目 `softcopyright-output` 目录供核验。
