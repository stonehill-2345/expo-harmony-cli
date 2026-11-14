# 三方公共执行规则

> **历史参考，停止作为执行任务单。** 已由 [1.7.0 B/C 收敛开发执行计划](../../superpowers/plans/2026-11-14-v1.7.0-bc-execution.md) 取代。下文任务编号、人员限制、阶段前置及报告要求不得自动继续执行；仅按新计划按需引用技术事实、原契约与证据。

> **最新版本范围（2026-11-14，用户已确认）：** 先读 [1.7.0 支持范围与收敛交付计划](../../superpowers/plans/2026-11-14-v1.7.0-delivery-scope.md)。1.7.0 交付完整标准开发流程与明确首批能力；全量 M7/M8 转为后续路线。新计划覆盖本文冲突的范围、执行顺序及报告要求；范围内质量门槛不降，历史失败与阶段状态不改。下文旧全量要求不再直接作为 1.7.0 发布门槛。

> 2026-11-13：A 已退出，先读 [B/C 两人收尾执行单](BC-20261113.md)。新文件覆盖下文人员归属和执行顺序；原环境、证据及验收门槛继续有效。

## 1. 目标与已知状态

当前源码基点 `f3892fade4e3f93c89420f2580a94f362bb23d2d` 已包含资源贡献事务、Font/Asset 更新与移除修复、Sheet 核心双档、Drawer 手势解析与横竖屏样例。上轮 `pnpm check` 成功（CLI 473、打包 5、SDK 工具 1,154 通过 / 20 跳过）；这些是历史结果，新修改必须再验证。

仍有两个第 3 步必达缺口：A 的 Sheet 扩展参数与组合；C 的完整公开接口/声明/能力/发行物关系闭合。B 同时补齐集成入口。允许现在按新职责开发，**第 4 步正式统一验收要等第 3 步门满足**。完整 M4/M5、M6、M7、M8 不因本次分工而自动关闭。ExpoImage/default 阻塞保留，不删首页、不换模块、不把 blank 成功当 default 成功。

## 2. 启动与环境（现有可执行命令）

在各自 checkout 根目录执行。Node 22.20.0、pnpm 10.19.0、Python 3；设备步骤还需要 Harmony SDK / DevEco / HDC。macOS 原生验证优先使用 DevEco Studio 自带 JBR 与 SDK。若工具不存在，Codex 先检查已安装版本和原有配置，不猜其他人的绝对路径，不回写根锁文件来绕过安装问题。

```sh
git merge-base --is-ancestor f3892fade4e3f93c89420f2580a94f362bb23d2d HEAD
git status --short
node --version
corepack pnpm --version
python3 --version
corepack pnpm install --frozen-lockfile
```

基点命令非零：错误 checkout，停止依赖实现基点的工作。已存在无关改动：保留并记录；不 reset/stash/覆盖。Node/pnpm 版本不符：使用本机版本管理器切到上述版本。`pnpm` 在后续外部脚本子进程也必须可执行；只有 `corepack pnpm` 可用时，在本次 `$SDK54_OUT/tools/pnpm` 写入 `exec corepack pnpm "$@"` 包装器并加入 PATH，不改系统工具。

每个 Codex 用自己的字母设置一次（A/B/C 文件给出对应值），此后在同一 shell 使用；新 shell 从自己的 `session.env` 恢复。若工具每次调用独立 shell，应在命令开头 `source` 该文件。

```sh
# 先执行本人任务单中的 export SDK54_ROLE 命令
: "${SDK54_ROLE:?先在本人任务单设置 SDK54_ROLE}"
export SDK54_REPO="$(git rev-parse --show-toplevel)"
export SDK54_RUN="$(date +%Y%m%d-%H%M%S)-${SDK54_ROLE}-$$"
export SDK54_OUT="$SDK54_REPO/outputs/sdk54-abc/$SDK54_RUN"
mkdir -p "$SDK54_OUT"
export SDK54_CONSUMERS="$(mktemp -d "${TMPDIR:-/tmp}/sdk54-${SDK54_ROLE}-consumers.XXXXXX")"
export SDK54_CONSUMERS="$(python3 -c 'import os; print(os.path.realpath(os.environ["SDK54_CONSUMERS"]))')"
export EXPO_HARMONY_TOOLING_ROOT="$SDK54_REPO"
export SDK54_INPUTS="$SDK54_REPO/outputs/sdk54-abc-inputs"
export SDK54_HANDOFF="$SDK54_REPO/outputs/sdk54-abc-inbox"
mkdir -p "$SDK54_HANDOFF"
export SDK54_OUT SDK54_CONSUMERS SDK54_RUN SDK54_ROLE
python3 - <<'PY'
import os, shlex
from pathlib import Path
keys=['SDK54_REPO','SDK54_RUN','SDK54_OUT','SDK54_CONSUMERS','SDK54_ROLE','EXPO_HARMONY_TOOLING_ROOT','SDK54_INPUTS','SDK54_HANDOFF']
Path(os.environ['SDK54_OUT'],'session.env').write_text(''.join('export '+k+'='+shlex.quote(os.environ[k])+'\n' for k in keys))
PY
git rev-parse HEAD > "$SDK54_OUT/source-revision.txt"
git status --porcelain=v1 > "$SDK54_OUT/source-status.txt"
```

设备步骤先发现工具和目标；不能写死 `5555`：

```sh
export DEVECO_HOME="${DEVECO_HOME:-/Applications/DevEco-Studio.app/Contents}"
export JAVA_HOME="$DEVECO_HOME/jbr/Contents/Home"
export DEVECO_SDK_HOME="$DEVECO_HOME/sdk"
export HDC="$DEVECO_SDK_HOME/default/openharmony/toolchains/hdc"
"$HDC" list targets
```

没有目标：记录 `BLOCKED_DEVICE`，继续主机任务；多目标且无本人分配目标：必须澄清目标，不选第一个。单目标也先确认未被其他会话占用。把选定目标保存为 `SDK54_TARGET`，所有后续 HDC 命令带 `-t "$SDK54_TARGET"`。同机不同 checkout 共享设备：设备操作必须串行；正式性能采样时其他人暂停编译/测试，只做编辑阅读。只关闭本次创建的进程、设备转发和模拟器；不能全局 kill、清别人的缓存。

## 3. 补充材料与可移植性

`outputs/`、tgz、HAR、HAP 被 Git 忽略。不要假设克隆代码即获得这些文件。发布给三人的材料名固定为 `sdk54-abc-inputs-20261111.tar`；协调者将它放在 checkout 父目录，Codex 自动使用下面的命令。另有明确路径时可使用该路径。该包不是已验收发行物。

```sh
python3 docs/releases/sdk54-abc-20261111/verify-inputs.py ../sdk54-abc-inputs-20261111.tar
# 只有前条校验成功才解压；若目标已存在，先验证现有目录，不覆盖
mkdir -p outputs
tar -xf ../sdk54-abc-inputs-20261111.tar -C outputs
python3 docs/releases/sdk54-abc-20261111/verify-inputs.py "$SDK54_INPUTS"
```

仅启动源码/主机任务不依赖此包；缺包时继续独立工作，写明缺文件和受阻任务。B 也可从官方 npm 的固定版本重新获取 HAR/Screens 输入，但必须逐一匹配 `inputs.json` 的 SHA256；不能接受同版本不同字节。C 可使用随包的 `source-evidence-bundle.tar.gz` 新解压到自己的工作目录，不能要求恢复 `/Users/zhansh` 或旧 `/var/folders`。

历史 JSON 中的原路径与 hash 是原始证据，保持不变。新流程使用显式本地根目录和原路径→本地路径映射验证相同字节；不得改历史 hash 冒充恢复。旧 B 三组证据不在包中，是已知缺失，相关验收必须生成新的证据。

## 4. 唯一写入负责人

| 文件或范围 | 写入方 | 复核方 |
| --- | --- | --- |
| Expo 模块、Core、Router 的运行时、Harmony native、模块 plugin、模块内 tests/example | A | C |
| 两份 prepare-screens.py、Screens JS overlay、screens-harmony-boolean/released-compatibility 测试、released-compatibility.json | A（本轮明确例外） | B 校验打包、C 独立验收 |
| @expo/cli、@expo/metro-config、autolinking 的 TS/事务、apps/cli（不含受控内容目录规则覆盖）、共享打包/安装/benchmark、根 package/lock、catalog/release-catalog | B | C；模块语义由 A 复核 |
| ai-e2e/run.mjs、process.mjs、preflight.mjs、device.mjs、cases/registry.json、run/case schema 及相应测试 | B | C |
| ai-e2e/report.mjs、evidence.mjs、results.schema.json、ai-e2e-report.test.mjs、独立 evidence 测试 | C | B |
| a-m4-evidence、a-rebuild-source-evidence、m0-*、m4-scope-inventory、相关源码/公开面测试 | C | A 核对语义、B 核对发行物 |
| scripts/sdk54/abc/a-*、docs/releases/sdk54-abc-20261111/a-* | A | C |
| scripts/sdk54/abc/b-*、docs/releases/sdk54-abc-20261111/b-* | B | C |
| scripts/sdk54/abc/c-*、docs/releases/sdk54-abc-20261111/c-* | C | A/B |
| 本任务包 COMMON/README/inputs.json/verify-inputs.py/index.html，既有总规划与阶段登记 | B 在交接轮串行维护 | A/C |

广泛目录规则服从上表具体文件例外。不确定归属的文件不先改；写入自己的 requests.json，给出目标文件、最小修改与复现。模块 package.json 由 A 管；涉及共享依赖版本、根锁、发行版本由 B 管。禁止 A 为改 Sheet 同时修改 Metro，禁止 B 修改模块 native 来让用例通过，禁止 C 改产品实现绕过失败。

## 5. 任务单、执行入口与统一交接

“已有命令”可立即运行。“待实现入口”是分配给该角色的具体开发任务；先编写有效失败测试，再实现该入口与帮助文档，验收通过后才发布为可用命令。所有新入口要求：命名参数显式传根目录，不用旧机器路径；输出目录拒绝覆盖；错误/缺输入非零退出；只操作本次拥有的临时目录。

每个角色按依赖顺序持续执行。依赖阻塞时继续不依赖该输入的后续任务，不能编造候选、随意删除必达用例或提前结束为“等别人”。真实外部缺失保留 BLOCKED，不将耗时或尚未开发写成外部阻塞。

每轮交付目录最少包含：

- `result.json`：见下方公共字段；每个任务一条，精确 PASS / FAIL / BLOCKED / NOT_RUN。
- `changes.json`：相对基点的实际文件清单与 SHA256；source revision、dirty 状态，未提交时另附 patch 和新文件，不冒充已提交。
- `requests.json`：跨职责需求数组；每条包含 id/from/to/blockedTaskId/files/reproduction/expected/requiredEvidence；没有需求写空数组。
- `commands.json` + stdout/stderr：argv、cwd、工具版本、开始结束时间、退出码/信号/超时及日志路径/hash。
- `artifacts.json`：相对路径、字节数、SHA256；设备证据额外绑定 target、系统版本、bundle、PID、HAP hash、候选 hash；图像真实解码。
- `report.html`：完整中文结果、依据、未完成项；无外部 CDN，链接有效；完成浏览器呈现检查。
- `replay.md`：从新目录开始的全部命令；不得依赖本机旧 node_modules 或直接编辑消费者 oh_modules。

```json
{
  "schemaVersion": 1,
  "role": "A",
  "runId": "实际运行ID",
  "baseRevision": "f3892fade4e3f93c89420f2580a94f362bb23d2d",
  "sourceRevision": "实际HEAD",
  "dirty": true,
  "candidate": null,
  "tasks": [{"id":"A-31","status":"NOT_RUN","evidence":[],"blockers":[]}],
  "stageClaims": {"step3":false,"M4":false,"M5":false,"V":false,"M6":false}
}
```

candidate 有值时使用 `{path, sha256}`，指向冻结的统一候选清单；null 表示尚无候选，不支持正式消费验收。此 `result.json` 是协调记录，**不能替代现有 runner 的 results.json / run-manifest.json**。

A 向 B/C 提供 `a-contract.json`（场景 ID/输入/预期/夹具及断言文件 hash/原生能力边界）。C 向 B 提供 `c-case-review.json`（覆盖集合/证据要求/负例），B 是 registry 唯一写入者。B 向 A/C 提供 `b-candidate.json`（源码与包身份/命令/输入/完整性）、`release.json`、15 个 tgz、产品 CLI tgz、可移植 runner 材料。三方文件通过协调者转交到各自 `$SDK54_HANDOFF/<role>/<run-id>/`；Codex 读取已转交材料，不自动发送消息。

B 的候选清单还需生成 runner 接受的 `candidate.json`：每包 name/version/file/bytes/sha256，packages 非空，failures=[]，包文件与 manifest 在同一候选目录。`release.json` 只有 integrity，不可不经转换直接充当 runner candidate。每个正式 run 自带 case-set、候选及必要相对路径证据，preflight 要求源树干净、消费者在仓库外、显式设备和工具路径。不能把 dirty 伪填 false。

## 6. 三轮交接，避免互相等待

| 轮次 | A | B | C | 退出条件 |
| --- | --- | --- | --- | --- |
| 第一轮：立即并行 | A-31～A-33 契约、实现、断言和本机验证 | B-31 候选准备、B-32 runner 与负例；B-33/34 准备 | C-31、C-32 source 模式、A 场景覆盖审查与 verifier 负例 | 契约/入口可用；不等待完整阶段通过 |
| 第二轮：第 3 步冻结 | 修复反馈，在冻结候选 npm Release 复验第 3 步资源/Sheet/Drawer/方向必达场景 | 获授权后整合，产出冻结候选并运行上述场景 | C-32 candidate 模式；独立核对上述场景和实际证据 | 第 3 步实现、公开关系、同身份候选和必达专项通过 |
| 第三轮：第 4 步统一验收 | A-34 全组合配合与模块修复 | B-33/34 正式新证据、B-35 统一矩阵 | C-33 全组合独立复验、C-34 最终建议 | 原阶段全量必达与性能要求满足后再提议关闭 |

第二轮的关键场景验证与第三轮的完整矩阵不是同一门槛。A-34/C-33 的完整四组合不作为第一轮交付前置；B 不等待它们通过才构建候选。C 的 source 模式不等待候选，candidate 模式才依赖 B。发生真实实现失败即退回对应负责人修复，不能把剩余任务转走。

## 7. 合入、验收与停止边界

1. A、B、C 从共同基点并行实现。此轮 A/C 先关闭第 3 步欠项，B 做候选/runner准备。
2. A 提交契约和场景；C 先复核覆盖。B 合入已获授权的改动到独立集成 checkout，解决本方文件冲突，重新构建候选。没有 Git 合入授权则准备可审查文件/patch 和命令，等待协调者操作，继续可独立工作。
3. C 针对冻结候选做最终公开面和独立消费核验。A 的目标场景全部通过、C 的公开关系闭合、B 的同身份候选就绪后，B 提议第 3 步通过，A/C 复核；不得仅依据任务数量或历史测试总数。
4. 第 4 步：B 在该候选运行完整矩阵和受影响 B01/B03/B04；C 独立重算并复验，A 修模块失败。任何修改造成候选 hash 变化，重新冻结并重跑受影响项；跨模块不能证明影响范围时重跑全矩阵。
5. M4/M5/V 必达集合无 FAIL/BLOCKED/NOT_RUN 且性能门满足，才按原路线判断阶段关闭和 M6 入口。default/ExpoImage 等仍阻塞时保持对应阶段开放，允许已经通过的独立改动交接。不得越级宣布 M7/M8 完成。

本任务授权开发、测试、生成本地证据；**不授权自动 git add、commit、push、发布、发送消息或全局设备清理**。需要暂存时列出确切文件等用户确认。不要调用会内部执行 git add 的 patch-package 生成流程绕过规则；B 如需补丁生成先说明具体文件/行为再取得授权，其他不涉及暂存的构建可继续。
