# B：工具链、统一候选与验收执行链

> 2026-11-13：先读 [B/C 两人收尾执行单](BC-20261113.md)。B 接管原 A 产品、夹具和采集，执行 B-R1～B-R4 与原任务。下文禁止 B 修改原 A 模块的旧边界已替换，C 验证器仍不可由 B 修改。已有入口先核实并复用，不按历史“待实现”描述重建。

先读 [COMMON.md](COMMON.md)。启动变量 `SDK54_ROLE=B`。顺序 B-31 → B-32；A/C 并行期间开展 B-33 的执行链与 B-34 复现准备；第 3 步门通过后执行 B-35。B 是集成候选与 registry 唯一写入负责人。

先执行，再运行 COMMON 的启动命令：

```sh
export SDK54_ROLE=B
```

## 修改范围

`apps/cli/`、`packages/@expo/{cli,metro-config}/`、`packages/expo-modules-autolinking/src/`、共享生成事务、候选打包/安装/benchmark、`scripts/sdk54/catalog.mjs`/`release-catalog.mjs`、根 package.json/pnpm-lock.yaml。进入 `apps/cli/content/docs` 或 `content/releases/sdk-54` 前先读各自 AGENTS.md。

B 管 ai-e2e 的 run/process/preflight/device/cases/registry/run+case schema 及对应测试；C 管 report/evidence/results schema，修改接口通过 requests.json 协调。A 管 Screens 转换器/policy 和 overlay，即使文件位于 autolinking 目录也不能由 B 同时写。

新入口用 `scripts/sdk54/abc/b-*`，测试 `__tests__/abc-b-*.test.mjs`，文档本目录 `b-*`。禁止直接改模块 native/plugin、C 的公开面/验收结论生成器。

## B-31：生成当前统一候选并保证可消费

先验证 COMMON 的输入包。材料缺失时继续源码/主机任务，不伪用旧候选；可以从官方固定包恢复已知输入，但必须匹配 inputs.json。

已有命令（输出为本轮新目录）：

```sh
node --test scripts/sdk54/__tests__/harmony-config.test.mjs scripts/sdk54/__tests__/harmony-config-pipeline.test.mjs scripts/sdk54/__tests__/harmony-generation-state.test.mjs scripts/sdk54/__tests__/harmony-generation-transaction.test.mjs scripts/sdk54/__tests__/harmony-resource-contributions.test.mjs scripts/sdk54/__tests__/harmony-drawer-resolution.test.mjs
corepack pnpm build
node scripts/sdk54/prepare-npm-release.mjs --output "$SDK54_OUT/candidates" --screens-archive "$SDK54_INPUTS/inputs/screens-4.9.0-upstream.tgz" --rnoh-har "$SDK54_INPUTS/inputs/rnoh-0.82.30.har" --worklets-har "$SDK54_INPUTS/inputs/worklets-1.0.0.har"
node scripts/sdk54/verify-npm-release.mjs "$SDK54_OUT/candidates"
corepack pnpm --dir apps/cli pack --pack-destination "$SDK54_OUT/candidates"
node scripts/sdk54/test-release-install.mjs --directory "$SDK54_OUT/candidates" --full
```

最后命令目前为禁用 lifecycle 的安装/锁文件重装验证，默认覆盖 blank-typescript/default × npm/pnpm；**不等于设备运行，更不证明 default/ExpoImage 已完成**。其日志在脚本打印的临时消费目录，必须复制到本轮证据并改用相对引用；不能只交 peer-install-report 中的临时绝对路径。CLI 独立 tgz 不属于 15 runtime 包，单列身份。

实现 `scripts/sdk54/abc/b-freeze-candidate.mjs`（待实现），参数 `--directory <候选目录> --source-root <集成源码根> --output <新目录>`，生成 `b-candidate.json` 和 runner candidate.json。记录源码提交/dirty/改动清单、原始输入及转换产物 hash、每包完整身份、插件 src/build/d.ts 对账、tar 成员集合、平台声明和消费图。若 CLI/Harmony 桥/插件构建产物过期，修生成链，不手修 tgz。输出候选的原版本可能与早期相同，必须 hash 区分。

验收：15 runtime 全集和独立 CLI；全部 verify 无失败；四种安装及锁重装退出码 0、runtimeFailures=[]；无 workspace/file 依赖污染正式包、无丢失插件构建/声明/资源接口；截图/设备结果暂时缺失不允许填 PASS。交 C 冻结包审查。

## B-32：接入完整 B02 场景与参数化入口

事实：当前 registry 仅 `V01-CREATE-BLANK-NPM` 与 `V01-DEVICE-PREFLIGHT` 两个用例。run/report/preflight 已实现，不需要另建空壳；要补真实执行内容。A 给语义契约，C 给覆盖和证据要求，B 写 registry/case-set 与命令映射。

至少注册资源插件增改删/回滚/所有权、Font/Asset 加载更新移除/reload、Sheet 契约、Drawer、方向变化、Core/其他 M4 既定必达、CLI config/install/export/run、安装矩阵、性能与错误路径。保留稳定 caseId、required、requiresDevice、requiredEvidence；不得漏记未运行项来让集合通过。未到的 A/C 场景先占待办身份并标 NOT_RUN，不能只在聊天说明。

**待实现入口：** `scripts/sdk54/abc/b-prepare-run.mjs`：

```sh
# 入口完成、A/C 交接文件真实存在且校验后执行
node scripts/sdk54/abc/b-prepare-run.mjs --candidate "$SDK54_CANDIDATE" --a-contract "$SDK54_A_CONTRACT" --case-review "$SDK54_C_CASE_REVIEW" --consumer-root "$SDK54_CONSUMERS" --target "$SDK54_TARGET" --stage V-01 --output "$SDK54_OUT/run-v01"
```

`SDK54_CANDIDATE` 是本轮已冻结目录；两个 CONTRACT/REVIEW 变量从 inbox 的真实文件解析，不用占位字符串。该入口按当前 schemas 生成 run-manifest、case-set、候选副本与真实 argv：自动发现可执行工具、记录显式 target/系统版本、source revision/dirty；证据引用位于 run 目录内，消费者位于源码外。其他已登记 stage 用新的输出目录。公共设备预检不能替代模块行为。

已有 runner 命令（仅生成真实 manifest 后）：

```sh
node scripts/sdk54/ai-e2e/run.mjs --manifest "$SDK54_OUT/run-v01/run-manifest.json" --stage V-01
node scripts/sdk54/ai-e2e/report.mjs --run-dir "$SDK54_OUT/run-v01"
```

验收：新 checkout 可以从输入生成、安装、编译、采集并重算，不依赖旧进程/消费者；A 的断言执行失败导致对应 case 失败；一个必达缺失即不可关闭。负例至少覆盖缺场景、重复、候选漂移、坏图、错误 PID、超时/中断、非零命令、错误设备；不修改 C 的 verifier 放水。基线 `node --test scripts/sdk54/__tests__/ai-e2e-*.test.mjs` 必须通过。

## B-33：资源事务与受影响 B03/B04 复验

资源链路：新增/改变/改名/撤销 Font/Asset 插件 → prebuild → ownership/state/receipt → 编译 HAP → 设备效果。覆盖无资源插件、与其他 mods 组合、删除旧 owner 文件、byte hash/原路径、非法路径、symlink、目标碰撞、手改保护、失败恢复、并发锁；纯配置文件 JSON 与原始 JSON 资源字节不能混淆。

B03：config、install check/fix、Harmony/all export，npm/pnpm；自定义 resolver/serializer 保留，iOS/Android/Harmony 同进程平台隔离；实际输出 bundle/assets 可核查。标准命令先运行**本轮消费者安装的** `node node_modules/expo/bin/cli <命令> --help` 核对参数，再按旧报告真实案例重跑，不编造新的 CLI flag。

B04：blank × npm/pnpm × Debug/Release；冷启动、离线 Release、刷新/reload、已有 Metro、不占用他人的端口、空格路径、签名/HAP 定位、缺设备/多设备/HDC 假成功。原始 default 单独尝试并记录真实错误，已知 ExpoImage 缺口交 A，不删模块或换页面。模拟器 unsigned 不证明签名真机。

原生编译已有标准命令（`SDK54_PROJECT` 必须是本次正常安装并生成的消费者）：

```sh
cd "$SDK54_PROJECT/harmony"
"$DEVECO_HOME/tools/hvigor/bin/hvigorw" --mode module -p product=default -p module=entry@default -p buildMode=release assembleHap --no-daemon --stacktrace
```

Debug 改 buildMode=debug 并走消费者实际 `run:harmony` 支持流程，记录 Metro 地址/端口。HAP 路径从本轮构建产物及元数据定位，不复用历史固定输出。HDC 安装与启动必须显式 target、bundle、ability，并验证 PID/日志/页面，不能只看 shell 退出码。

验收：输出新的 `b03-validation.json`、`b04-validation.json`，逐项真假与原件 hash；B 旧三组原件不可得，新结果不得覆盖/伪造旧 receipts。所有四组合分别绑定候选和 HAP；保留失败、限制和 skipped 原因。

## B-34：性能与增量构建复验

沿用旧规划第 8 节门槛：编译后 no-op 中位数 ≤30s 且较同环境固定旧基线改善 ≥80%；配置变更 ≤45s 且改善 ≥70%；首次/未构建重复回退 ≤max(20%,2s)；prebuild+增量构建合计回退 ≤max(10%,2s)。新旧同机同工具、每景各预热 1 次+正式 5 次，交错测量，保留全部样本/中位数/最大值。不能拿旧报告单次耗时或跨机器值当基线。

已有命令示例，变量由本轮真实消费者设置；三个路径互不嵌套，workspace 必须不存在：

```sh
node scripts/sdk54/benchmark-prebuild.mjs --prepare-from "$SDK54_PROJECT" --workspace "$SDK54_BENCH"
# 在 $SDK54_BENCH/project 完成真实 prebuild 后保存 generated 快照
node scripts/sdk54/benchmark-prebuild.mjs --workspace "$SDK54_BENCH" --snapshot generated-snapshot
# 同一消费者完成对应 Debug 或 Release 编译后保存 built 快照
node scripts/sdk54/benchmark-prebuild.mjs --workspace "$SDK54_BENCH" --snapshot snapshot
node scripts/sdk54/benchmark-prebuild.mjs --workspace "$SDK54_BENCH" --output "$SDK54_OUT/benchmark-release" --samples 5 --scenarios first,generated-noop,built-noop,config-change,module-remove,clean --label current-release
```

执行前读脚本确认快照参数；每种模式/候选独立 workspace。当前脚本不自动完成全部后续构建/跨卷/内存/模块增加指标，B 负责补齐并测试，不宣称上述一条命令已覆盖所有要求。完整性能 task 还需记录 Ninja 失效原因、RSS/external/arrayBuffers、复制逻辑/物理字节、真实跨文件系统回退及故障恢复；不能把成本移出计时或削弱人工修改保护。

验收：原安全负例通过，完整新旧配对证据和门槛逐项结论。固定旧 baseline 原件缺失时从可确认源码重建同机旧候选，C 核对基线选择；无法重建则只记录当前性能，改善比例=BLOCKED，不猜 PASS。

## B-35：冻结、交接和阶段提议

运行 `corepack pnpm check`。将 A/B/C 已获授权的改动整合到独立 checkout 后生成新候选，确认 C 接受 A 场景和公开面、所有第 3 步必达关闭再启动第 4 步正式矩阵。收到 C 的独立复验意见后修本方问题、重发新身份，不能继续使用旧包 hash。

交付 COMMON 全套，外加 candidate/CLI tgz、所有输入 hash、B02 case-set、每 stage 的 run-manifest/results/closure-report、B03/B04/性能新证据、`b-stage-proposal.json`。关闭提议引用具体必达集合与 A/C 复核，不由 B 单独改历史台账为已完成。正式 run 源码不干净时请求获授权的提交，不伪写 dirty=false。

完成定义：B-31/32 可独立先交付；B-33/34 真实复验不足保持 FAIL/BLOCKED；B-35 只有完整统一候选矩阵和 C 复核通过才 PASS。后续 M6/M7/M8 不在本次“自动开始”范围。
