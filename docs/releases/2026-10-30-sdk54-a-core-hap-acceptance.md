# SDK54 A：Core HAP 与双包管理器验收

日期：2026-10-30。工作区 `/Users/zhansh/project/expo-harmony-cli-a`，分支 `feat/sdk54-a-modules`，基点 `19a0375cff7e0ef3bc62d54fd5ed57b913bb2000`。修改未暂存、提交或发布。

**Core 专项的 npm/pnpm × Debug/Release 四组合验收已完成。** 每个组合首次运行和三次 public reload 均完成 50 项断言，两种 Release 另通过离线冷启动。本轮修复了验收脚本可能误判通过、pnpm 下示例打包失败两个确定问题。

这是[双人规划](../superpowers/plans/2026-10-29-sdk54-ab-parallel-delivery.md)中 A-02 的功能与消费专项成果，补齐[上一轮](2026-10-30-sdk54-a-scope-core-acceptance.md)未执行的真实 HAP、Fabric/ArkUI、RNOH 错误桥接和应用 reload。A-01 的九包全量范围/生成物/正式发行组合闭环仍未完成；A-02 总任务还需据完整范围和正式组合复核，M4 台账仍为 0/7，未擅自关闭阶段。

## 1. 计划与结果

| 工作 | 验收方式 | 结果 |
| --- | --- | --- |
| 校验 Core 设备用例集合及每次 reload 的生命周期证据 | 先补重复/未知用例、畸形结果、错误 boot、遗漏某轮完成事件负例 | 旧实现 17/22；修复后 22/22，实际设备日志的重复用例负例也拒绝 |
| 生成本轮独立候选，核对双包管理器消费 | 从当前源代码打包；完整文件比较、依赖解析、公开类型检查 | npm/pnpm 均通过；遇到并修复 pnpm Metro 解析缺陷 |
| 真实 HAP 的首次运行、视图生命周期、reload 与 Release 冷启动 | 固定 HAP/bundle、单 PID 日志、准确用例集合、截图与窗口归属 | 四组合完成，独立进程重算通过；执行异常保留在第 5 节 |
| 交接与封存 | 明确候选身份、能力边界、剩余责任 | A 报告和交接单更新；总规划/台账由 B 接入 |

## 2. 两处修复

### 设备验收不能只数成功条数

原 `check-device-log.cjs` 只核对数量和 `passed`。同一成功用例重复替换另一用例，数量不变也会通过；多轮 reload 还可能借用最后一轮的原生完成标记。

现在通过 `core-test-cases.cjs` 明确六组共 50 个用例名，拒绝缺项、未知项、重复项和畸形结果；每一轮 public reload 都必须属于对应 boot，并有对应的 pending view、失效视图完成及 destroyed native rejection 证据。保留旧 runtime 回调、公开 reload 错误和 fatal signal 的拒绝条件。

改动：Core `harmony/example/tools/check-device-log.cjs`、`tools/core-test-cases.cjs`、`tests/device-log.test.cjs`。红绿日志在首轮证据目录的 `device-checker-red.log`、`device-checker-green.log`。

### pnpm 的 Metro 依赖解析

首轮 pnpm HAP 构建在 bundle 阶段真实失败：`Cannot find module '@expo/metro/metro'`。示例 `bundle.cjs` 从应用根目录读取这个传递依赖，npm 的依赖提升掩盖了问题。

修复为从已安装的 `@expo/metro-config` 入口建立解析器，因为该包直接声明了 `@expo/metro`。未增加应用依赖、未修改已安装的 node_modules/oh_modules。`tests/metro-config.test.cjs` 增加实际打包回归：旧代码 2/3，修复后 3/3；新候选安装到 pnpm 消费工程后再执行包内测试，同样 3/3。

修复后创建全新的 `20261030-core-v2-npm`、`20261030-core-v2-pnpm` 消费目录并重新构建四个 HAP。首轮失败和旧候选结果保留，不用旧 HAP 充当修复后的验收。

## 3. 固定候选与环境

| 输入 | 身份 |
| --- | --- |
| Core | `3.0.30`，SHA-256 `8ea209c457f34f3dcc178387baded2fecb2dfd66a82a60c461f0a4579f652523` |
| Metro config | `54.0.17`，SHA-256 `e938bf483334761600e9c5412a2ec5b0a9699b84ea2f4812905fd84a655c8b65` |
| RNOH Core-v1-v3 兼容 HAR | SHA-256 `0e0cf3dbb5b2e510f49c819ff5db2f43ad5a5918d38e840cc2714055c9f6fd83` |
| 原始 RNOH HAR | `0.82.30`，锁定输入 `cac2b5d1b9ce7d306079218931db12489aaceb240002c9c32e6c13185c577011` |
| 工具 | Node 22.20.0；npm 10.9.3；pnpm 10.19.0；TypeScript 5.9.2；DevEco Native SDK 6.1.1.125 / API 24 |
| 设备 | nova 16 Pro，HDC `127.0.0.1:5555`；aarch64；`emulator 6.0.0.130(SP7DEVC00E130R4P11)`，API 22 |
| 应用 | `dev.expo.a02.npm`、`dev.expo.a02.pnpm`，本轮开始前均不存在 |

两消费目录复用相同候选归档的原字节，各自安装依赖和构建。Core 归档的 1,138 个来源文件均与当前源码一致，Platform 声明在组装时重新生成，结果也与当前声明一致。Metro runtime TS 按已有组装规则重新转译，删除过期 source maps；这不是全 monorepo 类型构建。

安装前后均通过 `verify-install.cjs`：归档与安装目录双向文件比较，无缺失、篡改或额外文件；Expo/Asset/Constants 解析到同一份 Core。两端分别通过 Platform 的正反类型检查和现有 `platform-types.ts` 严格消费者编译；后者使用 `skipLibCheck`，不等于所有依赖声明通过完整类型检查。

RNOH 兼容 HAR 从锁定原件重新生成；实际 OHPM 解包后的 `ArkTSTurboModule.cpp` 和 `RNApp.ets` 哈希与兼容配置逐项一致。未补丁修改消费端依赖。原生生成使用当前源码，CMake/Ninja 输入与构建日志均留存。

## 4. 设备结果

| 组合 | 首次启动 | Public reload | Release 离线冷启动 | HAP SHA-256 |
| --- | --- | --- | --- | --- |
| npm Debug | 50/50 | 三次；每个新 runtime 50/50 | 本项不计 | `d6e276eafc0f7ec4fe0fef901d7984e01e3748df51be1f855012196820c59e49` |
| npm Release | 50/50 | 三次；每个新 runtime 50/50 | 50/50，新 PID | `8f6314aa9b3ed66cde671210d6cab1e3e0c3ee8ec276bcc9fda09437b6ec7dda` |
| pnpm Debug | 50/50 | 三次；每个新 runtime 50/50；首轮点击有一次未触发，见下文 | 本项不计 | `fae35cae600b77bddcbca3ce49123d90151392acba17452fb16404f847584c7e` |
| pnpm Release | 50/50 | 三次；每个新 runtime 50/50 | 50/50，新 PID | `e401e98ecab274276180b66500dee9c5433c912d79635ee8e440be1e22771424` |

六组为基础原生调用 8、RNOH 互操作 16、上下文 7、UUID 9、错误/资源边界 5、原生视图边界 5。合计观察 18 个 runtime，每个 50 项；重复执行不算新增 API 覆盖。

设备直接验证了：默认/命名原生视图的属性、事件、ref 和原生文本读回；卸载撤销 tag/绑定；未完成读取在卸载后以 `ERR_VIEW_UNMOUNTED` 拒绝；旧引用即使拿到新 tag 也不能操作新实例；实际 RNOH 同步/异步、错误 code/message；重复资源释放、外部 owner；线程异步与取消；public reload 后旧 worker、view 和 ArkTS rejection 不回调到新 runtime。

所有 HAP 使用内嵌 `ResourceJSBundleProvider`，本轮未启动 Metro 服务或端口转发。HAP 内 bundle 与本轮生成文件哈希一致；Release 的 HAP 元数据为 `buildMode=release`、`debug=false`，boot 日志为 `dev=false`。冷启动经 force-stop 后重新启动，PID 和 boot 均改变。

`verify-round.py` 在独立进程重新核对四组合、每个 boot 的准确 50 项集合、每次 reload 的原生完成、候选哈希、源码身份、PNG、UI 文本，以及窗口 PID/焦点/window ID 与采集应用的对应关系，通过后生成 `verified-acceptance.json`。它不是另一位人员的交叉审查。

设备上的安装 HAP 原字节不可直接读取；身份由主机 HAP、安装成功记录、bundle、PID、窗口及运行内容共同绑定。这里只接受未签名模拟器结果，不接受真机签名或最低平台兼容性。

## 5. 保留的异常与限制

1. 初次使用系统 Python 缺少 `hashlib.file_digest`，改用文档要求的 Python 3.11 后生成成功。Homebrew `node@22` 路径实际报告 Node 23.5.0，因此使用本机确实为 22.20.0 的 Node。npm 首次远端元数据响应慢，仅中断本轮安装进程，改为 prefer-offline；未换包版本或跳过完整性检查。
2. pnpm Debug 首次日志采集早于六组结果输出，校验正确失败；随后同一 PID 的完整日志通过。reload 第 2 轮也曾在新 runtime 测试完成、旧原生延迟完成尚未输出时采集，严格校验拒绝。两份早期记录均保留。采集程序改为限时等待用例和对应原生完成数量，任何已出现的失败用例立即中止。
3. **pnpm Debug 首轮注入点击没有触发 public API**：当时没有请求/新 boot 标记，截图显示按钮处于按下样式。第二次点击同一 HAP 才触发；其后三轮实际 API 调用的生命周期均通过。未确定是输入注入、模拟器调度还是应用触摸链路原因，未擅自归因环境。记录在 `pnpm-debug-reload1-no-request/` 和 `execution-exceptions.json`；本报告不宣称单次点击可靠性问题已修复。
4. 构建仍有上游 ArkTS/deprecation/资源重名警告、缺可选 gflags/jsvmtooling 提示，以及未签名/未混淆提示。实际构建通过，警告原文保留；不据此给出生产签名、混淆或通用平台兼容结论。
5. Core/Metro 是本轮源码组装候选，完整 npm/pnpm 消费和 HAP 均绑定它们；尚不是 B 的最终 SDK 发行组合。原样 default 的 `ExpoImage/default` 问题未处理，其他 M4 模块也未因本轮 Core 通过而自动通过。

## 6. A/B 后续分工

| 负责人 | 项目 | 状态 / 完成条件 |
| --- | --- | --- |
| A | A-02 Core HAP 专项 | 本文固定范围已执行完成；保留一次未触发点击，后续真实集成需复核输入可靠性 |
| A | A-01 全量范围冻结 | PARTIAL。继续九包当前公开签名、原生面、生成物与正式候选的双向核对；本轮只补齐 Core 消费与设备证据，不能把有限成员图冒充旧完整闭包 |
| B | A-B-02/03 发行链路 | 将 Core 新鲜度检查和本次包内修复接入正式候选生成，复核兼容 HAR/完整依赖组合，重放受影响消费/设备用例 |
| B，A 复核 | A-B-04 总规划/台账 | 接入本报告、准确 hash 和失败记录；交叉审查后按原门槛登记，不将专项 PASS 写成 M4 全部完成 |
| A | A-03/A-04 | 后续 Font/Asset、系统 UI、Linking/Router/WebBrowser 的实现和设备验收仍需逐项推进 |

本轮保留两款已验收的 Release 测试应用供复验；已停止应用和本轮启动的模拟器，清除本轮截图/布局临时文件，没有残留端口转发。保存 HAP 与原生构建输入后回收本轮 v2 的可再生成 CMake 对象缓存，不删除源码、候选、日志或失败证据。

## 7. 证据与复验

- 首轮及红测：[20261030-a02](../../outputs/sdk54/ai-e2e/20261030-a02/)。
- 最终候选与四组合：[20261030-a02-v2](../../outputs/sdk54/ai-e2e/20261030-a02-v2/)。入口为 `verified-acceptance.json`、`candidate-inputs.json`、`execution-exceptions.json`、`evidence-manifest.json` 和 `evidence-bundle.json`。
- [npm Release 冷启动截图](../../outputs/sdk54/ai-e2e/20261030-a02-v2/npm-release-cold.png)、[pnpm Release 冷启动截图](../../outputs/sdk54/ai-e2e/20261030-a02-v2/pnpm-release-cold.png)。页面的 `8/8` 仅是基础组，其余五组以逐用例设备日志核验。

在 A 工作区执行 `python3 outputs/sdk54/ai-e2e/20261030-a02-v2/verify-round.py` 可重算当前落盘结果；依赖本轮两个消费目录。重新部署时使用归档内指定哈希的 HAP，启动 `EntryAbility`，点击 `Reload through Expo public API`；按 `run-hap-acceptance.py` 的命令记录在新证据目录执行，避免覆盖本轮工件。
