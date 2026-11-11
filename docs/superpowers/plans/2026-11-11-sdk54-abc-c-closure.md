# SDK54 ABC C Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不降低验收标准的前提下，将 C-32 从 FAIL 推进到可判定状态，并在 A 契约、B 冻结候选和设备到齐后完成 C-33/C-34 独立验收。

**Architecture:** 先增强 C 的 source orchestrator，使现有 finite declarations、derived provenance、export bindings、scope relations、plugin contracts 和 final closure 进入同一条可重放链。随后只读消费 A/B 交接，验证一个固定候选身份，再在 C 新消费者和真实设备上运行完整矩阵。任何来源、候选或用例集合漂移都使依赖链失败关闭。

**Tech Stack:** Node.js 22.20.0、pnpm 10.19.0、Node test runner、现有 `scripts/sdk54/m0-*` 构建器、ai-e2e runner、Harmony HDC、Playwright CLI。

**Spec:** `docs/releases/sdk54-abc-20261111/COMMON.md`、`docs/releases/sdk54-abc-20261111/C.md`

## Global Constraints

- 基点必须包含 `f3892fade4e3f93c89420f2580a94f362bb23d2d`。
- 固定 Expo revision 为 `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`，tree 为 `5457e824b21d968e55c8f533cdf1751860160a92`。
- C 不修改模块产品实现、B registry/run/preflight/device、打包版本或根锁文件。
- 新入口拒绝覆盖输出目录，缺输入或校验失败必须非零退出。
- 不执行 `git add`、commit、push、发布或联系他人；提交步骤仅作为经用户授权后的可选检查点。
- `GRAPH_RELATION_ONLY`、source closure、candidate membership 和 Harmony runtime acceptance 分开判断。

---

### Task 1: 完整 source closure orchestrator

**Files:**
- Modify: `scripts/sdk54/abc/c-public-closure.mjs`
- Modify: `scripts/sdk54/abc/c-evidence-lib.mjs`
- Create: `scripts/sdk54/__tests__/abc-c-full-closure.test.mjs`
- Read-only inputs: `scripts/sdk54/m0-finite-declarations.mjs`、`m0-derived-source-provenance.mjs`、`m0-export-source-bindings.mjs`、`m0-final-scope-relations.mjs`、`m0-final-plugin-contracts.mjs`、`m0-final-public-closure.mjs`

**Interfaces:**
- Consumes: reconstruction、`scope-reviewed.json`、固定 Git、当前源码树。
- Produces: `finite-declarations.json`、`derived-source-provenance.json`、`export-source-bindings.json`、`scope-relations.json`、`plugin-contracts.json`、`public-closure.json`。

- [x] **Step 1: 写失败测试**

```js
test('orchestrator rejects a scope member without finite or derived source evidence', async () => {
  const result = await buildSourceClosure(fixture({ dropFiniteAndDerived: true }));
  assert.match(result.blockers.join('\n'), /MISSING_SOURCE_EVIDENCE/);
});

test('orchestrator rejects omitted export bindings and dangling capabilities', async () => {
  await assert.rejects(() => buildSourceClosure(fixture({ dropExportBinding: true })));
  await assert.rejects(() => buildSourceClosure(fixture({ danglingCapability: true })));
});
```

- [x] **Step 2: 确认失败原因正确**

```sh
node --test scripts/sdk54/__tests__/abc-c-full-closure.test.mjs
```

Expected: FAIL，原因是 `buildSourceClosure` 尚未导出或尚未调用现有构建器。

- [x] **Step 3: 实现单一 orchestrator**

将每个现有构建器的实际输出直接传入 `buildFinalPublicClosure`，禁止生成第二份平行 PASS 摘要。每个输出写入输入 hash、固定 source identity、记录数、blockers，并保留 `stageClosable:false` 与 `harmonySupportAccepted:false`。

- [x] **Step 4: 验证 source 模式**

```sh
node --test scripts/sdk54/__tests__/abc-c-full-closure.test.mjs scripts/sdk54/__tests__/abc-c-public-closure.test.mjs
node scripts/sdk54/abc/c-public-closure.mjs \
  --source-root "$SDK54_REPO" \
  --reconstruction "$SDK54_SOURCE_EVIDENCE" \
  --scope "$SDK54_INPUTS/public-scope/scope-reviewed.json" \
  --mode source \
  --output "$SDK54_OUT/public-source-next"
```

Expected: 输入仍不完整时非零退出，但所有可独立重建关系均有原始 JSON；不能只得到 7,732 条 scope 投影。

- [x] **Step 5: 审查检查点**

检查 diff、失败 blocker 和原始输出；未经用户授权不提交。

### Task 2: 固化 A/B 交接契约与防伪负例

**Files:**
- Modify: `scripts/sdk54/abc/c-verify-handoff.mjs`
- Modify: `scripts/sdk54/__tests__/abc-c-handoff.test.mjs`
- Modify: `docs/releases/sdk54-abc-20261111/c-case-review.json`

**Interfaces:**
- Consumes: A `a-contract.json`；B `b-candidate.json`、`candidate.json`、`release.json`、tgz、case-set、run-manifest/results。
- Produces: `handoff-verification.json`、精确 requests.json 项。

- [x] **Step 1: 增加失败测试**

```js
test('rejects A assertion files whose hashes differ from a-contract', () => {
  assert.equal(verifyAContract(fixture({ changedAssertion: true })).valid, false);
});

test('rejects case-set missing required resource, Sheet, Drawer or orientation coverage', () => {
  assert.match(verifyHandoff(fixture({ preflightOnly: true })).errors.join('\n'), /full registry coverage/);
});
```

- [x] **Step 2: 实现精确身份检查**

验证 A 场景 ID、输入、预期、断言文件 hash；验证 B 源码 clean revision、candidate/release/tgz 双向 hash、case-set registry hash、原始命令与日志。禁止接受摘要中的 `passed:true` 代替原始 run。

- [x] **Step 3: 执行交接检查**

```sh
node --test scripts/sdk54/__tests__/abc-c-handoff.test.mjs
node scripts/sdk54/abc/c-verify-handoff.mjs \
  --handoff "$SDK54_HANDOFF/B/<run-id>" \
  --output "$SDK54_OUT/handoff-next"
```

Expected: 未交付时 BLOCKED；材料齐全且原始 run 自洽时才允许进入候选消费。

### Task 3: B 冻结候选到达后的 candidate closure

**Files:**
- Modify: `scripts/sdk54/abc/c-public-closure.mjs`
- Create: `scripts/sdk54/__tests__/abc-c-candidate-closure.test.mjs`

**Interfaces:**
- Consumes: Task 1 source closure、Task 2 已验证 candidate。
- Produces: 完整 `candidate-coverage.json`，逐条绑定包内入口、声明、实现、plugin build/native registration 与 hash。

- [ ] **Step 1: 写遗漏/额外导出负例**

```js
test('rejects a package missing its declared types entry', () => assert.throws(() => auditCandidate(fixture({ missingTypes: true }))));
test('rejects an extra public export absent from reviewed scope', () => assert.throws(() => auditCandidate(fixture({ extraExport: true }))));
test('rejects source revision drift between candidate and checkout', () => assert.throws(() => auditCandidate(fixture({ sourceDrift: true }))));
```

- [ ] **Step 2: 解包只读候选副本并双向核对**

检查 `exports/main/module/types`、平台入口、`src/build/plugin/build`、`.d.ts`、资源 mod、native 注册；所有公开项必须双向对应，不能只列 tar 成员。

- [ ] **Step 3: 运行 candidate 模式**

```sh
node scripts/sdk54/abc/c-public-closure.mjs \
  --source-root "$SDK54_REPO" \
  --reconstruction "$SDK54_SOURCE_EVIDENCE" \
  --scope "$SDK54_INPUTS/public-scope/scope-reviewed.json" \
  --candidate "$SDK54_CANDIDATE_COPY/candidate.json" \
  --mode candidate \
  --output "$SDK54_OUT/public-candidate-next"
```

Expected: 全部双向关系闭合才 `relationClosed:true`；runtime acceptance 仍为 false。

### Task 4: 独立主机消费

**Files:**
- Output only: `$SDK54_OUT/consumer-*`
- Modify only if verifier has reproducible bug: `scripts/sdk54/abc/c-verify-handoff.mjs` and corresponding test first。

- [ ] **Step 1: 复制候选到 C 只读基准与工作副本**

```sh
cp -R "$SDK54_HANDOFF/B/<run-id>/candidate" "$SDK54_CONSUMERS/candidate-baseline"
chmod -R a-w "$SDK54_CONSUMERS/candidate-baseline"
cp -R "$SDK54_CONSUMERS/candidate-baseline" "$SDK54_CONSUMERS/candidate-work"
```

- [ ] **Step 2: 验证发布与四种安装/锁重装**

```sh
node scripts/sdk54/verify-npm-release.mjs "$SDK54_CONSUMERS/candidate-work"
corepack pnpm build
node scripts/sdk54/test-release-install.mjs --directory "$SDK54_CONSUMERS/candidate-work" --full
```

- [ ] **Step 3: 归档真实临时日志和依赖图**

保存命令 argv、退出码、stdout/stderr、peer-install-report、lockfile 和候选 hash；任一失败退回 B，不编辑消费者 `oh_modules`。

### Task 5: 独立设备矩阵

**Files:**
- Output only: `$SDK54_C_RUN_DIR`
- Read-only: A contract、B case-set、portable runner。

- [ ] **Step 1: 确认唯一设备目标**

```sh
"$HDC" list targets
```

Expected: 无目标则 `BLOCKED_DEVICE`；多目标则先由用户指定；不得自动选第一个。

- [ ] **Step 2: 运行 npm/pnpm × Debug/Release**

每种组合必须覆盖资源首次/更新/移除/reload、A Sheet 全契约、Drawer 真手势、物理方向变化、CLI/原 M4 必达。

- [ ] **Step 3: 独立重算报告**

```sh
node scripts/sdk54/ai-e2e/report.mjs --run-dir "$SDK54_C_RUN_DIR"
```

Expected: 相同 candidate hash、完整 required case 集合、每个 PASS 有真实成功命令和所需证据；任何 FAIL/BLOCKED/NOT_RUN 均阻止阶段关闭。

### Task 6: 最终关闭建议与交付

**Files:**
- Output: `$SDK54_OUT/result.json`、`changes.json`、`requests.json`、`commands.json`、`artifacts.json`、`report.html`、`replay.md`、`c-acceptance.json`
- Modify: `scripts/sdk54/abc/c-finalize.mjs`

- [ ] **Step 1: 运行全部验证**

```sh
node --test scripts/sdk54/__tests__/ai-e2e-*.test.mjs scripts/sdk54/__tests__/abc-c-*.test.mjs
corepack pnpm check
git diff --check
```

- [ ] **Step 2: 分门判断阶段**

分别记录 step3、M4、M5/V、性能、default/ExpoImage、M6；只有必达集合无 FAIL/BLOCKED/NOT_RUN 才建议关闭。

- [ ] **Step 3: 浏览器检查完整 HTML**

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory "$SDK54_OUT"
"$PWCLI" open http://127.0.0.1:8765/report.html --headed
"$PWCLI" snapshot
```

- [ ] **Step 4: 交付审查检查点**

校验 artifacts hash、确认 worktree 仅含 C 责任范围文件；未经用户授权不执行暂存或提交。
