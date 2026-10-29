# SDK54 分支风险修复与当前验收边界

本轮针对代码审查发现的安装、工程文件权限、默认模板插件、证据可移交性和仓库检查问题。它不是 M4 或完整产品验收，不替代 M0～M3 的历史设备证据。

## 修复与验证要求

| 问题 | 修复 | 验证要求 |
| --- | --- | --- |
| Autolinking 的 json5 依赖缺少锁边 | 复用锁文件已有的 json5 2.2.3，补齐 importer | 冻结锁文件安装成功，锁文件无漂移 |
| 上游 prepare 在安装时覆盖已跟踪构建文件 | CI/开发安装显式使用 `--ignore-scripts`；构建仍由 staging 执行 | 工作区源码、打包测试及 14 包双轮确定性构建 |
| 重生成丢失文件权限 | 保留现存文件 mode，事务内容指纹包含 mode；旧日志仍按旧指纹恢复 | 私有/可执行/受管文件权限保留，权限变化提交与并发 chmod 冲突 |
| default 插件未声明平台 | Router 显式声明其原生 mod 仅用于 iOS/Android，保留通用 JS 配置；Splash 注册 Harmony mod，并将插件选项写入同次快照 | 原样插件列表通过校验、编译；iOS/Android mod 仍注册 |
| Splash 配置未进入原生产物 | 生成启动图、颜色及暗色资源、宽度和缩放资源，Splash overlay 消费资源 | 默认配置及 Harmony 覆盖的资源字节检查；设备视觉验收仍待执行 |
| 历史证据不可访问 | 增加独立可用性审计，保留原始 acceptance 和 progress | 缺失/篡改导致非零退出，不以摘要替代证据 |

Splash 的 `imageWidth` 和 `resizeMode` 作用于加载期 overlay；系统启动窗口的图标尺寸仍由 HarmonyOS 控制。iOS 专属 `enableFullScreenImage_legacy` 不改变 Harmony 行为。Harmony 显式 splash 配置优先于插件通用选项，`ios`、`android` 专属选项不混入 Harmony。

## 历史报告的可移植路径修订

只将 `sdk54-m0-export-patterns-summary.json` 的 `semanticInput.path` 从开发机绝对路径改为仓库相对 `outputs/...` 路径；语义输入、产物 SHA256 和原始统计全部不变，不重新宣称验收通过。

- 修订前报告 SHA256：`a7020eebdbd9939f10e4adae9a73adb1e4f22d231780eb5b6e7fa1ae58a54b69`。
- 修订后报告 SHA256：`424538a539359e18aa2c90663f5ffabd1264e3a9a91b7c8d7c849b0ff0b03e86`。
- 原始报告可从提交 `ecc9619` 读取；本次修订不修改阶段接受记录中的 hash。

## 证据缺口与恢复

当前 [证据可用性报告](sdk54-evidence-availability.json) 是历史工件的存在性与 SHA256 检查，不是设备重跑。80 个不同工件中有 60 个缺失，M0～M3 的历史 PASS 仍保留，但当前证据状态为 UNVERIFIED。

```sh
pnpm sdk54:evidence:check
node scripts/sdk54/stage-progress.mjs --check docs/releases/sdk54-stage-progress.json
```

两条命令在缺证据时必须失败。恢复方式：从原验收环境或工件存储取回报告中列出的相对路径，保持原始字节；先通过 SHA256 审计，再运行阶段进度检查。若原始工件无法找回，必须用当前候选重新执行对应验收并新建记录，不能制造同名文件或删掉缺失引用来关闭问题。

架构设计、覆盖清单、AI 验证设计和阶段计划已由 `733e395` 纳入版本管理。最终真机、签名 Release、完整 default 和跨平台验收仍按计划推进。

## 本轮实际结果

验证环境：本机 macOS、Node 23.5.0、pnpm 10.19.0；CI 配置使用 Node 20.19.4 和 macOS 15，本轮未运行远端 CI。

| 检查 | 结果 |
| --- | --- |
| 冻结安装（禁用上游 prepare） | PASS，锁文件未漂移 |
| `pnpm check` | exit 0：产品 CLI 类型检查、49 文件/471 测试、2 文件/5 打包测试；工具测试 1,026 PASS、0 FAIL、20 SKIP；catalog、14 包确定性构建、包审计、补丁审计、仓库检查全部通过 |
| `pnpm sdk54:release:check` | PASS |
| 权限缺陷回归 | 修复前两个新增用例实际失败；修复后权限、并发、旧格式中断日志恢复全部通过 |
| default 配置与生成专项 | 63 PASS、0 FAIL、1 SKIP；包括真实插件导出、默认模板配置、暗色资源、显式覆盖及非法输入 |
| Splash 原生编译 | 隔离的最小 Harmony 应用，使用本轮 View/Controller 原文件和实际资源生成函数；OHPM/Hvigor exit 0，CompileArkTS/CompileResource/assembleHap 通过，产出未签名 Debug HAP。未加载 RNOH/default 全模块，未安装到设备，不证明视觉效果或完整应用闭环 |
| 历史证据可用性 | 预期 exit 1：80 个工件中 20 个 hash 匹配，60 个缺失；接受记录原字节保持 |

首次全量工具回归出现解析器缺失、共享缓存并发写入竞争和一个已存在的 M4 默认函数枚举失败。已提供 `sdk54:tools:setup`：固定 Kotlin/Groovy/ProGuard/shfmt 版本与 SHA256、CMake Python 包版本，消除开发机路径依赖；测试改为串行执行，保留所有用例。M4 枚举补齐默认函数参数，并继续拒绝尚未支持的箭头函数导出，既有红测已通过。ProGuard 调用同步到固定的 6.0.3 接口。

20 项跳过与未执行的设备、完整上游测试不能记为通过。原生编译仍有已有 definite-assignment、animateTo 弃用及可能抛异常的 ArkTS 警告，不将编译成功解释为无警告。

本轮日志保存在 `outputs/sdk54/risk-remediation-20261029/`，包括首次失败日志和最终检查日志；这些仍是本机原始工件，需要随候选验收归档移交，不能用本说明替代它们。
