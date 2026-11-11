# C：公开面闭合与独立验收

先读 [COMMON.md](COMMON.md)。启动变量 `SDK54_ROLE=C`。先做 C-31/C-32，期间审查 A 契约与 B case-set；候选到达后做 C-33/C-34。C 是开发角色：必须实现可重放的核验与负例，不能只复制摘要做报告。

先执行，再运行 COMMON 的启动命令：

```sh
export SDK54_ROLE=C
```

## 修改范围

`a-m4-evidence.mjs`、`a-rebuild-source-evidence.mjs`、`m0-*.mjs`、`m4-scope-inventory.mjs` 及相应 source/public-scope 测试；ai-e2e 的 `report.mjs`、`evidence.mjs`、`schemas/results.schema.json`、`ai-e2e-report.test.mjs`；新增独立测试用 `abc-c-*.test.mjs`。

新入口 `scripts/sdk54/abc/c-*`，契约/结论本目录 `c-*`。不写 registry/run/preflight/device（归 B）、模块实现（归 A）、打包/版本/锁（归 B）、已有总台账（B 串行）。发现缺陷写 requests.json，附最小复现与原件，不能把期望改小或把必达改成可选。

## C-31：确认输入和补齐可移植来源关系

立即运行的现有主机命令：

```sh
node --test scripts/sdk54/__tests__/a-m4-evidence.test.mjs scripts/sdk54/__tests__/a-source-evidence.test.mjs scripts/sdk54/__tests__/m4-scope-inventory.test.mjs
node --test scripts/sdk54/__tests__/m0-finite-declarations.test.mjs scripts/sdk54/__tests__/m0-derived-source-provenance.test.mjs scripts/sdk54/__tests__/m0-export-source-bindings.test.mjs scripts/sdk54/__tests__/m0-final-public-closure.test.mjs scripts/sdk54/__tests__/m0-final-scope-relations.test.mjs
node --test scripts/sdk54/__tests__/ai-e2e-report.test.mjs
```

校验 COMMON 输入后，在新目录解开来源包：

```sh
mkdir "$SDK54_OUT/source-input"
tar -xzf "$SDK54_INPUTS/source-evidence-bundle.tar.gz" -C "$SDK54_OUT/source-input"
export SDK54_SOURCE_EVIDENCE="$SDK54_OUT/source-input/source-evidence"
```

现有 `a-m4-evidence.mjs` 用到 `expo-official.git`，历史重建目录还可能是 `expo-source.git`；历史输入引用旧根路径。这是要修的可移植性缺口，不应先运行旧命令反复碰缺路径。C 负责明确参数化 source Git/input root/path mapping，保留原字节和 hash；不得修改旧 JSON 路径后冒充原件恢复。固定 SDK54 Expo revision 为 catalog 的 `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`，还要核对 tree/blob 与归档完整性，不只看分支名。

现有生成器 `m0-final-public-closure.mjs` 是纯函数，没有可直接执行全量重建的 CLI。必须先提供 orchestrator；成员可达性与 source summary 均不能替代它的输入。

产物：`c-input-audit.json`，逐文件原 hash/本地位置/来源身份/完整性/缺失关系；显式区分新来源重建、恢复的原件、缺失历史证据。不因包里有源代码就宣布历史验收已恢复。

验收：另一个绝对目录可验证相同字节；校验失败停止依赖链，不能默用缓存；旧 B 三组缺失不反复索要；必要原始材料确实缺失时列精确任务 blocker，其余继续。

## C-32：完整公开面、当前实现与候选双向核对

范围基线：7,732 条（M4 必达 2,872，既有 M7 转交 3,093，源码上下文 1,767）；这是当前参考集合，新增合法记录要增量核对，不能为了维持数量删项。public member 的 GRAPH_RELATION_ONLY 不等于有限声明/能力/原生语义已闭合。

逐项生成并校验：memberships、types/members/typeEdges、publicDispositions、scopeRelations、finite declarations、derived source provenance、export source bindings、插件契约；调用现有构建与验证器，不能新增一份总是 PASS 的并行报告。M4 必达逐条绑定 API/参数/事件→实现与 native 能力→测试→当前包文件/类型；M7 转交保留原身份、批次、依赖与验收条件。转交不是已实现。

**待实现入口：** `scripts/sdk54/abc/c-public-closure.mjs`，支持下面两阶段（先实现并测再执行）：

```sh
node scripts/sdk54/abc/c-public-closure.mjs --source-root "$SDK54_REPO" --reconstruction "$SDK54_SOURCE_EVIDENCE" --scope "$SDK54_INPUTS/public-scope/scope-reviewed.json" --mode source --output "$SDK54_OUT/public-source"
# B 候选到达后执行；每次使用新的输出目录
node scripts/sdk54/abc/c-public-closure.mjs --source-root "$SDK54_REPO" --reconstruction "$SDK54_SOURCE_EVIDENCE" --scope "$SDK54_INPUTS/public-scope/scope-reviewed.json" --candidate "$SDK54_CANDIDATE" --mode candidate --output "$SDK54_OUT/public-candidate"
```

source 模式可在等 B 时完成来源/范围关系，但不声称候选通过；candidate 模式读取 B 固定包真实成员及源码基点，源码 checkout 与候选来源不一致先报告漂移，禁止拿 C 修改后的源码比旧包强行通过。允许 B 的源清单只读快照；不覆盖本工作区。

双向要求：每个公开项都能找到包内入口与声明/实现或带依据的既定边界；包内新增公开项也能反向找到清单。检查 exports/main/module/types、平台入口、src/build/plugin/build、d.ts、资源 mod 和 native 注册；仅 tar 文件存在或 21 个关键文件一致不够。

输出 `public-closure.json`、`candidate-coverage.json`、`scope-review.json`、`blockers.json`、HTML；每条有 ID、来源引用/hash、范围、实现状态、验收链接、候选成员及 hash。源关系闭合与运行支持接受分开，保留现有生成器防止越级关闭的 stageClosable/harmonySupportAccepted 语义。

验收：完整必达关系无悬空、未知归属、漏项；缺声明/假 hash/遗漏导出/额外公开导出/缺原生注册/过期 build/错误候选均被负例拒绝。相同输入在另一个目录可重算相同规范化内容。若语义不明，给 A 具体记录 ID 与问题，不自己编造承诺。

## C-33：独立候选消费与真实设备复验

收到 B 转交的完整候选、A 的 a-contract 和 B 的 case-set 后，先写 `c-case-review.json`：要求的 case IDs、输入、预期、证据类型、覆盖缺口。交 B 更新 registry，C 不直接写 B 文件。凡缺完整必达集合，不能给“预检通过即可关闭”的结论。

独立消费现有命令：

```sh
node scripts/sdk54/verify-npm-release.mjs "$SDK54_CANDIDATE"
corepack pnpm build
node scripts/sdk54/test-release-install.mjs --directory "$SDK54_CANDIDATE" --full
```

必须复制候选到 C 自己的只读基准/工作副本，再运行会生成 peer-install-report 的安装测试，不能污染 B 原交付。安装脚本开启本地只读 registry，不发布。复制其真实临时日志/依赖图到 C 输出目录。`--full` 仅证明四种安装/锁重装，不代表设备全矩阵。

**待实现入口：** `scripts/sdk54/abc/c-verify-handoff.mjs --handoff <B本轮包目录> --output <新目录>`：拒绝缺包/漂移/伪造结果/路径逃逸，检查 source clean、case set 完整、tgz/HAP/设备日志一致、每个必达命令真实成功。C 不修改 B 的结果；复验产生新的 C run，引用相同候选 hash。

B 的 portable runner 就绪后，从 C 新消费者重跑资源首次/更新/移除/reload、Sheet A 全契约、Drawer 实际手势、方向变化及 CLI/原 M4 必达。npm/pnpm × Debug/Release 分开记录。系统 dock 不当 Drawer，图片文件非空不当渲染正确，路线尺寸变化不当物理传感器旋转。保留失败截图/布局/日志，图像真实解码并核对内容。

已有独立重算命令：

```sh
node scripts/sdk54/ai-e2e/report.mjs --run-dir "$SDK54_C_RUN_DIR"
```

`SDK54_C_RUN_DIR` 是 B 新入口在 C 本机创建并实际执行后的完整目录；不能指向旧 PASS 摘要。不能只使用 B 自报 closure-report，必须重算 command/log/hash/候选/场景集合。

验收：B 自验与 C 复验均有相同候选身份，关键场景真实独立执行，无必达缺失。缺设备时设备项 BLOCKED，主机和源码项继续；不同机器的性能不能拼成提升比例。

## C-34：证据负例与关闭建议

检查并补齐 verifier 对假 PASS、缺必达、重复 ID、零命令、超时/中断、错误退出码、损坏 PNG/JPEG、空候选、候选漂移、错误 bundle/PID、旧 HAP、旧源码、非预期跳过的拒绝能力。C 修改 gate/verifier 后交 B 复核，不能自己放宽规则再自己签通过。

运行 `node --test scripts/sdk54/__tests__/ai-e2e-*.test.mjs` 及 `corepack pnpm check`。全检查中出现 B/A 文件缺陷应交对应负责人；不删测试或直接降低阈值。

提交 COMMON 全套及 `c-acceptance.json`：按第 3 步、M4、M5/V、性能、default/ExpoImage、M6 入口分别判断，不只给一个总 PASS。记录 C 独立执行与仅核对材料的区别；关闭建议逐条引用原件。存在 M4 必达 FAIL/BLOCKED/NOT_RUN 或完整公开关系缺口时，不建议阶段关闭。

完成定义：C-31/32 来源与公开面工作可先交；C-33 依赖 B 候选/runner 和 A 契约；C-34 负例可先实现，最终结论等待真实矩阵。C 不承担产品修复、候选打包或历史总台账写入，不自动推进 M6/M7/M8。
