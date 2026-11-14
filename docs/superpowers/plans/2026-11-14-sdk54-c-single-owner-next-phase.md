# SDK54 C 单人接管收尾实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 每个任务先写失败测试，再做最小实现；不自动提交。

**Goal:** 在 C 单人接管下修复消费者发行链路，完成 M4 证据契约接入，并在可用候选与设备出现后完成独立验收。

**Architecture:** 保留现有发行目录、registry、M4 runner、a-verify-* 和 C report 作为唯一入口。先解决主机可重现缺陷，再生成 clean candidate；设备与性能证据继续由现有 runner 采集，C 只增加身份绑定和语义重放，不放宽现有像素、PID、boot、HAP、候选 hash 门槛。

**Tech Stack:** Node.js 22.20.0、pnpm 10.19.0、TypeScript、Node test、Vitest、HDC、现有 `scripts/sdk54/abc` 工具链。

**Spec:** `docs/releases/sdk54-abc-20261111/BC-20261113.md`、`docs/releases/sdk54-abc-20261111/C-TAKEOVER-20261113.md`、`outputs/sdk54-abc/20261113-C-takeover/internal-todo.json`。

## Global Constraints

- 不修改历史输入、历史结果或产品门槛；所有新输出使用新目录。
- 不自动 git add、commit、push、发布或联系他人；dirty source 不得伪造为 clean candidate。
- 材料重算、消费者安装、设备实跑、性能测量分别记录，不能互相替代。
- 真实缺陷必须先有失败测试，再做最小修复。
- 设备不可用时保留 BLOCKED/NOT_RUN，不用主机测试替代设备验收。

### Task 1: 修复并确认消费者发行链路

**Files:**
- Modify: `scripts/sdk54/test-release-install.mjs`
- Modify: `apps/cli/src/sdk54/release-runtime.ts`（仅当新失败测试证明解析逻辑有缺陷）
- Test: `scripts/sdk54/__tests__/release-install-proxy.test.mjs`
- Evidence: `outputs/sdk54-abc/20261113-C-takeover/pack-check/`

- [ ] 保留并重跑 registry 上游响应中断的红绿测试。
- [ ] 以全新临时目录执行 `node scripts/sdk54/test-release-install.mjs --directory <runtime-packages> --cli-package <cli> --full --scripts`。
- [ ] 四格均要求 `status=0`、`reinstallStatus=0`、`runtimeFailures=[]`；若仅 pnpm probe 失败，读取安装后的真实 `require.resolve`、目标文件 hash 与异常堆栈后再决定是否改代码。
- [ ] 对 16 个 runtime 包和 CLI 重新执行 `verify-npm-release.mjs`、CLI pack，并保存 stdout/stderr。

### Task 2: 完成 M4 证据契约的严格接入

**Files:**
- Modify: `scripts/sdk54/abc/b-run-m4.mjs`
- Modify: `scripts/sdk54/abc/b-complete-v02-commands.mjs`
- Modify: `scripts/sdk54/ai-e2e/evidence.mjs` 或 `scripts/sdk54/ai-e2e/report.mjs`（仅在失败测试证明需要共享契约适配时）
- Test: `scripts/sdk54/__tests__/abc-b-m4-runner.test.mjs`
- Test: `scripts/sdk54/__tests__/ai-e2e-report.test.mjs`

- [ ] 写失败测试：`m4-device-assertion` 仅凭自报 PASS 和任意文件 hash 时，report 必须拒绝。
- [ ] 写失败测试：设备断言的 `candidateSha256`、`hapSha256`、target、bundle、PID 与 run-manifest 不一致时拒绝。
- [ ] 为 Core 七项和 Other 六项分别定义已有 oracle 的输入和输出：Core 使用 `check-device-log.cjs`/`check-i0-log.cjs`；Other 复用 linking、status-bar、navigation 等现有 checker，缺 checker 时状态为 BLOCKED。
- [ ] 让 `b-run-m4.mjs` 输出真实语义结果及逐项 evidence 引用；只验证文件存在和 hash 不得返回 PASS。
- [ ] 让 report 复用同一断言函数，保留 `device-preflight` 与 M4 断言的类型边界，不通过新增 kind 白名单绕过校验。
- [ ] 运行 M4 主机回归；无设备时必须产生 BLOCKED 原件，不得生成 PASS。

### Task 3: 修复当前代码与发行契约漂移

**Files:**
- Modify: `docs/releases/sdk54-abc-20261111/a-sheet-contract.json`
- Modify: `scripts/sdk54/abc/a-verify-device.mjs`
- Modify: `scripts/sdk54/creation-catalog.mjs`
- Modify: `templates/expo-template-default/package.json`
- Test: `scripts/sdk54/__tests__/abc-a-contract.test.mjs`
- Test: `scripts/sdk54/__tests__/creation-templates.test.mjs`

- [ ] 所有源码快照 hash 以当前提交后的实际字节更新，历史原件不改。
- [ ] 发行包数量由 `createReleaseManifest().packages.length` 驱动，禁止恢复 15 的硬编码。
- [ ] default 模板使用 `expo-image` 的 Harmony 发布 alias；blank 模板不隐式增加 expo-image。
- [ ] 运行受影响测试并确认不支持的 upstream 版本仍被拒绝。

### Task 4: 生成 clean candidate 并做公开面/安装验收

**Files:**
- Use: `scripts/sdk54/prepare-npm-release.mjs`
- Use: `scripts/sdk54/abc/b-freeze-candidate.mjs`
- Use: `scripts/sdk54/abc/c-public-closure.mjs`
- Use: `scripts/sdk54/abc/c-finalize.mjs`
- Output: 新建 `outputs/sdk54-abc/<run-id>/`

- [ ] 先运行 `pnpm check`、`verify-npm-release`、16 包 pack 和四格消费者安装；所有结果为零失败后再冻结。
- [ ] 在 clean source 上冻结 candidate，记录 source revision、dirty=false、16 包/CLI hash、ExpoImage pin 和 release manifest hash。
- [ ] 用同一 candidate 执行 C source 与 candidate 两种公开面检查；candidate 模式必须绑定只读 source snapshot。
- [ ] 在仓库外消费者中执行 npm/pnpm × default/blank 的安装和锁重装，保存完整命令、cwd、工具版本及依赖图。

### Task 5: 设备专项与完整矩阵

**Files:**
- Use: `scripts/sdk54/abc/a-bind-runner.mjs`
- Use: `scripts/sdk54/abc/b-run-m4.mjs`
- Use: `scripts/sdk54/abc/a-verify-device.mjs`
- Use: `scripts/sdk54/abc/a-verify-default.mjs`
- Use: `scripts/sdk54/abc/a-verify-expo-image.mjs`
- Output: candidate run directory中的 `run-manifest.json`、`results.json`、HAP、layout、hilog、截图和 HTML

- [ ] 发现 HDC target；无 target 时记录 BLOCKED_DEVICE 并停止设备写操作。
- [ ] 在明确空闲 target 上执行 Core/Other M4、Sheet、resource、Drawer、orientation、default、ExpoImage 和 Debug reload 专项。
- [ ] 每项绑定 candidate hash、HAP hash、target、systemVersion、bundle、PID、boot 和原始命令；材料重算与实际重跑分目录保存。
- [ ] 专项通过后执行 npm/pnpm × Debug/Release 完整矩阵；任一候选 hash 变化都重新冻结并重跑受影响项。

### Task 6: 性能与阶段关闭

**Files:**
- Use: 现有 B-34 性能命令和 C report
- Create: 本轮 `performance-paired.json`、`c-acceptance.json`、`result.json`、`report.html`、`replay.md`

- [ ] 同机、同工具、同场景，新旧版本各预热1次、正式5次交错采样。
- [ ] 核验 built-noop、config-change、首次/未构建重复、prebuild+增量构建四项门槛及历史 bypass 边界。
- [ ] 只有第3步、M4、M5/V、性能、default/ExpoImage、M6 全部满足时才建议关闭；否则逐项保留 BLOCKED/FAIL。
- [ ] 运行 HTML 静态链接检查；浏览器策略阻断时如实记录，不绕过。

## 当前停止条件

1. 消费者四格安装仍有任一 `runtimeFailures`：停止 candidate freeze，继续 Task 1。
2. M4 证据无法绑定真实语义或设备不存在：停止设备 PASS，继续主机契约开发并记录 BLOCKED。
3. source dirty：不能生成正式 candidate；只允许主机测试和材料审查。
4. 任何性能原件缺少同机/同工具/逐样本信息：不计算改善率，不关闭性能门。
