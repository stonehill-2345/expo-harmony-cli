# C 下一轮开发与独立验收计划

> **历史参考，停止作为执行任务单。** 已由 [1.7.0 B/C 收敛开发执行计划](../../superpowers/plans/2026-11-14-v1.7.0-bc-execution.md) 取代。下文任务编号、人员限制、阶段前置及报告要求不得自动继续执行；仅按新计划按需引用技术事实、原契约与证据。

> 最新授权：B也已退出，人员归属与后续执行以 [C单人接管记录](C-TAKEOVER-20261113.md) 为准。以下为前轮计划与历史执行记录，不再等待B。

目标：关闭 C 自身公开关系接入缺口，复核语义验证器；取得 B 的统一候选后完成独立验收。
依据：BC-20261113.md、COMMON.md、C.md。
本计划不授权提交、发布、联系他人或修改产品；沿用当前会话顺序执行，不创建子代理。

## 当前证据与范围

- 历史 549,312 条 membership 已由原生成器重建，来源 blocker 为0，hash与历史原件一致。
- 当前范围包含5,407条 A-M4-REACHABILITY 成员身份，不能直接套用历史 membership/type 序号。
- Core NativeViewManagerAdapter.harmony.tsx 的5条范围记录与当前源码hash不同。
- 三个 a-verify-* 已接管。现有 Image 序号修复已独立红绿复现，但没有 B 的规则复核。
- B新候选、真实设备材料与完整同机性能原件未交付；不能据此宣称任何设备验收完成。

Must：当前关系接入、源漂移审查、真实缺陷最小修复、候选及独立运行验收。
Should：将已恢复历史输入按准确hash整理为便携材料，并提供失败定位。
Could：报告展示便利性，不能优先于关系闭合。
Won't：改产品、改采集器、重建通用验证平台、重写已有四项校验、补造历史证据、降低门槛。

## 1. 优先开发：接通当前公开图与完整来源关系（C-R2/C-31/C-32）

文件范围：scripts/sdk54/abc/c-public-closure.mjs；对应 abc-c-full-closure.test.mjs、abc-c-public-closure.test.mjs；必要时复用 m4-scope-inventory.mjs 的现有收集能力。

输入：已核验历史 capability/membership、当前便携来源图、scope-reviewed.json、固定Expo Git及当前产品源码。
输出：新的明确标记重建的来源关系、逐项映射依据、漂移与未决项；不改历史scope原件。

- [x] 比较声明路径、源hash、声明范围/类别、公开导出链；查清历史图与重建图的身份生成规则。TYPE序号、同名成员或所属包相同都不能单独作为映射依据。
- [x] 复用现有生成器产生当前图关系；只在现有c-public-closure入口补必要输入接入。不另建一套判定平台。
- [x] 对实际发现的缺陷先补失败测试：歧义声明映射、同名不同来源、丢失capability/use、遗漏membership、伪hash。预期为非零或显式未决，不允许默认通过。
- [x] 当前Core变更先读实际diff并重跑公开项收集，识别签名/导出/行为变化；生成带旧新hash和依据的新审查记录，保留原范围身份。涉及产品承诺的歧义列给B复核，不机械替换hash。
- [x] 逐条核对7,732条参考集合；保留M4必达、M7转交和源码上下文，合法新增项增量列出。
- [x] 在第二个绝对目录重放，比较规范化输出；对无法唯一确定的关系保留具体记录ID及阻塞原因。

专项命令：

```sh
node --test scripts/sdk54/__tests__/abc-c-full-closure.test.mjs scripts/sdk54/__tests__/abc-c-public-closure.test.mjs scripts/sdk54/__tests__/m4-scope-inventory.test.mjs scripts/sdk54/__tests__/m0-final-scope-relations.test.mjs scripts/sdk54/__tests__/m0-final-public-closure.test.mjs
```

验收：来源关系接入不再硬编码缺历史输入；完整关系无遗漏、无歧义映射，或逐条明确剩余未决。来源闭合不等于Harmony运行支持通过。最终candidate模式绑定B的只读源快照，不能用本地源码验证旧包。

## 2. 语义规则收尾（C-R1/C-34）

文件范围：三个a-verify-*及BC明确指定的四份证据测试。

- [x] 保留已完成四项设备语义修正和Image序号修复，不再凭合成夹具扩大改动。
- [x] 将规则差异、红绿日志及边缘情况放入requests.json，由用户/协调者转B复核；不自动发消息。
- [ ] 收到真实layout/hilog/screenshot/HAP后，只读复算原件；复现真实误拒绝/假PASS才补回归和最小修复。
- [ ] 明确LOCAL Image的reload按钮语义与JS runtime reload不同；default旧Release观察不替代Debug/reload/四组合。

验收：真实证据回归与B规则复核均齐备，且像素、PID、boot、HAP、候选身份门不降低。

## 3. 新候选到达后的专项独立验收（C-R3/C-33）

复用c-verify-handoff、c-public-closure、verify-npm-release、test-release-install和B portable runner。

- [ ] 核对clean source、包集合、ExpoImage绑定、完整case-set和CORE-M4/OTHER-M4真实执行入口。
- [ ] 复制候选至C独立基准及工作副本，基准只读；候选公开面核验使用绑定的源快照。
- [ ] 在仓库外新消费者完成安装/锁重装；先跑资源、Sheet、Drawer、方向、原default专项。
- [ ] 只有明确空闲target后才操作设备；无设备继续主机项，并记录BLOCKED_DEVICE。
- [ ] 分开保存材料复算与C实际运行。调用只读a-verify不能当成设备重跑。

验收：同候选专项真实通过、公开关系闭合后，才进入正式全矩阵。

## 4. 完整矩阵与关闭意见（C-R4/C-34）

- [ ] 执行npm/pnpm × Debug/Release完整必达矩阵；blank/default分别记录。
- [ ] 性能核对同机同工具同场景，新旧各预热1次+正式5次交错采样；审查历史bypass差异，缺原件要求B重测。
- [ ] no-op≤30s且改善≥80%；配置变更≤45s且改善≥70%；首次/未构建重复回退≤max(20%,2s)；prebuild+增量构建回退≤max(10%,2s)。
- [ ] 跑受影响测试和完整pnpm check。安装链、B测试清理失败由B处理；单测重跑不覆盖完整check失败。
- [ ] 交付COMMON全套，分别判断第3步、M4、M5/V、性能、default/ExpoImage和M6入口。HTML呈现检查若仍被浏览器策略阻断，明确保留未完成。

完成状态分别记录：代码能力、安全边缘、真实输入/候选实跑、最终验收、阶段关闭。所有门满足之前不建议关闭。

## 2026-11-13 本轮实现记录

新增可选 `c-public-closure --relations <manifest>`，保留原入口。manifest 为 schemaVersion=1，inputs 必须有 seedFacts、sharedReview、review、census、semanticRelations；每项为相对 manifest 目录的 `{path, sha256}`，压缩 JSON 使用 `.gz`。输入只读，拒绝路径逃逸、hash 冲突和 revision/tree 不一致。

复用 buildCapabilityMap / buildFinalScopeRelations / buildFinalPublicClosure，在当前图命名空间重建；不能拿历史 TYPE 序号直接关联。逐条核验声明 path/hash/start/end。补入 M4 子集外无声明导出的来源，模板沿用已有同长度 EJS 投影规则并保留原始文件身份。

本轮真实来源重算：549,312 memberships、124,124 public reachable types、319 internal contexts，来源 blocker=0；5,407 当前成员全部建立精确关系；插件202/202。范围7,732条及 M4/M7 分类未改变。Core 5项重新收集后公开记录除源hash外一致，原 scope 未改，新 scope 保留 complete=false、runtimeAccepted=false，待 B 复核。

命令模板（输出目录必须不存在）：

```sh
node --max-old-space-size=8192 scripts/sdk54/abc/c-public-closure.mjs \
  --source-root "$SDK54_REPO" --reconstruction "$SDK54_SOURCE_EVIDENCE" \
  --scope "$SDK54_SCOPE" --relations "$SDK54_RELATIONS" \
  --mode source --output "$SDK54_NEW_OUTPUT"
```

source 模式当前仍非零：scope 审查未签收、未提供候选。来源 blocker=0 不等于所有 gate PASS。seedFacts 内历史规划引用不参与现有算法，明确列为 historicalSeedReferencesNotReplayed，不伪称历史材料全部恢复。capability map 未提供 specialist contracts 的提示保留；独立 plugin-contracts 202/202 不能冒充 capability map 的运行验收。

交付：outputs/sdk54-abc/20261113-101641-C-relations。新候选、设备原件与性能配对原件仍缺失；不等待 A，不替 B 修产品或清理测试。

异目录重放9份核心JSON与7,549个分片逐字节hash一致，无路径规范化。最终受影响测试211/211通过；完整check有B临时.git清理ENOTEMPTY失败，未签PASS。COMMON交付完成，HTML浏览器呈现仍BLOCKED_POLICY。
