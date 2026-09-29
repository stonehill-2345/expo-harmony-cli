# Expo Harmony CLI 1.5.0 SDK54 Patch 产品化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not use subagents unless the user explicitly reauthorizes them. Track each checkbox in order, stop at every review gate, and do not commit, push, publish, tag, write a registry, or create a GitHub Release without separate explicit authorization.

**Goal:** 将 `expo-harmony-cli` 1.5.0 产品化为 SDK52 legacy 零回归、SDK54 fresh-create 使用官方 `create-expo-app@5.0.0` 与 package-level patch 的公开可分发 CLI，并从真实 `expo-harmony-cli-1.5.0.tgz` 完成 blank/default 的安装、prebuild、Debug、Release 与无 Metro cold-start 验收。

**Architecture:** `apps/cli/src/creator.ts` 只负责通用参数校验、SDK 选择和 SDK54 早期分流；SDK52 继续执行当前 injector/scanner/cleanup 主链路。SDK54 的模板契约、两文件替换、精确依赖、patch 安装、runtime probes、managed-state、文档和命令保护全部放在 `apps/cli/src/sdk54/`，patch 则由 `scripts/sdk54/` 从官方 npm 发布物与已验收十四包构建产物确定性生成。真实 packed CLI TGZ 是最终黑盒入口，设备验收结果写入可审计 release evidence，但不执行发布。

**Tech Stack:** Node.js 20.19.4+、TypeScript、Vitest、Node test runner、pnpm 10.19.0、npm、`patch-package@8.0.0`、Expo SDK 54、React Native 0.82.1、React Native OpenHarmony 0.82.30、HarmonyOS/DevEco/hdc。

**Spec:** `docs/designs/2026-09-28-sdk54-cli-patch-productization-design.md`

## Global Constraints

- 工作分支固定为 `feat/V1.5.0-chensq`；实施前再次确认 `git status --short --branch`，不得覆盖现有 `TASK_HANDOFF.md` 和设计文档。
- SDK52 的 `injectHarmonyBaseline()`、`scanAndAdapt()`、`cleanupHTemplateCode()`、自研 generator、shim 和文档流程保持原样；不得借本任务重构 SDK52。
- SDK54 只支持 fresh create；旧 SDK54 项目只诊断，不自动迁移或清理。
- SDK54 creator 固定调用 `npx create-expo-app@5.0.0`；blank 使用 `blank-typescript`，default 使用 `default@sdk-54`。
- SDK54 只支持 npm 和 pnpm；Yarn/Bun 必须在创建目录前失败关闭。
- SDK54 不生成 `index.harmony.js`、`shims/`、`scripts/postinstall-harmony.js`、SDK52 自定义 bundle/start 脚本或应用侧 Harmony Metro 绕行。
- SDK54 主命令固定为 `npx expo prebuild --platform harmony`、`npx expo run:harmony`、`npx expo start`；实际执行本地已打 patch 的 Expo npm 包。
- `create-expo-app=5.0.0`、`expo=54.0.37`、`@expo/cli=54.0.27`、`@expo/metro-config=54.0.17`、`expo-router=6.0.24`、`react=19.1.1`、`react-native=0.82.1`、RNOH/RNOH CLI=`0.82.30`。
- 十四个 Expo 包版本只以 `scripts/sdk54/fixture-contract.mjs` 的 `EXPO_ARCHIVE_VERSIONS` 为生成期事实来源；CLI 运行时读取生成的 patch manifest，不手写第三份表。
- 已验收 Harmony 外部版本固定为 gesture `2.30.1`、reanimated `4.0.1`、safe-area `5.6.3`、screens `4.9.0`、worklets `1.0.0`；compatibility table 不得采用本轮未验收的其他 patch 版本。
- SDK55 及更高版本明确拒绝；不得继续使用 `major >= 54` 归类。
- 生成 patch 的基线必须是 npm 实际发布物；正式 patch 必须覆盖运行时 `build/**`、必要 `harmony/**`、平台文件和 manifest 差异，不能只含 `src/**`。
- 外部十一包若无公开精确版本、存在不可 patch 的二进制差异或许可证不允许分发，整个任务失败关闭；不得复制本机 TGZ 进仓库或 CLI 包。
- patch、manifest、package.json 和 default 两文件替换必须先完整验证，再使用临时文件与原子 rename；失败时保留项目目录和诊断，不递归删除用户目录。
- 用户输入只通过参数化 `spawn`/`execFile` 传递，不拼接 shell。
- 不提交本机 TGZ、HAP、HAR、`node_modules`、`oh_modules`、签名文件、凭据、私有 registry、绝对本机路径或构建缓存。
- 每个任务严格执行 RED → 最小实现 → GREEN；RED 和 GREEN 命令的真实输出要记录在执行会话或 `TASK_HANDOFF.md`，不得把“已修改”当成“已通过”。
- 本计划不包含 commit 步骤；只有用户另行明确授权后才可提交、推送、发布、打 tag 或创建 Release。

## Planned File Structure

### CLI runtime

- `apps/cli/src/creator.ts`：通用 create 参数、SDK 选择、SDK54 早期返回；SDK52 旧主体保留。
- `apps/cli/src/sdk54/create-options.ts`：解析 template/包管理器并在创建目录前校验。
- `apps/cli/src/sdk54/create.ts`：SDK54 fresh-create 阶段编排，不生成 patch 内容。
- `apps/cli/src/sdk54/file-transaction.ts`：多文件同批写入、失败回滚和原子 rename。
- `apps/cli/src/sdk54/patch-manifest.ts`：读取、校验并类型化随包发布的 manifest。
- `apps/cli/src/sdk54/template-contract.ts`：校验官方 blank/default 模板结构和固定版本。
- `apps/cli/src/sdk54/default-image-substitution.ts`：只规划和写入两个已验收 `expo-image` 替换。
- `apps/cli/src/sdk54/package-json.ts`：按 manifest 生成精确 dependencies/devDependencies，不复用 SDK52 injector。
- `apps/cli/src/sdk54/install-patches.ts`：校验 checksum、复制 patch、合并 postinstall、保证幂等。
- `apps/cli/src/sdk54/verify-runtime.ts`：精确版本、关键文件、命令注册和平台 dispatch probes。
- `apps/cli/src/sdk54/project-state.ts`：SDK54 managed-state 写入与 legacy/new-mode 分类。
- `apps/cli/src/sdk54/docs.ts`：注入 SDK54 专用文档。
- `apps/cli/content/docs/sdk-54/*.md`：官方 Expo 命令、patch 生命周期、doctor 与能力边界。
- `apps/cli/content/patches/sdk-54/manifest.json`：patch-set、catalog、模板依赖、patch checksum、probe 和许可证引用。
- `apps/cli/content/patches/sdk-54/licenses/**`：随衍生 patch 分发的 LICENSE/NOTICE。

### Generation and audit

- `scripts/sdk54/generate-cli-patch-manifest.mjs`：从 fixture contract 和生成结果产出稳定 manifest。
- `scripts/sdk54/compare-external-packages.mjs`：公共 npm 与已验收外部十一包逐文件/hash 对比。
- `scripts/sdk54/generate-cli-patches.mjs`：十四包官方 npm baseline → 适配发布物 → `patch-package` patch。
- `scripts/sdk54/audit-cli-patches.mjs`：确定性、路径、凭据、二进制、运行入口、许可证和版本审计。
- `scripts/sdk54/blackbox-packed-cli.mjs`：从真实 1.5.0 TGZ 创建并验证 npm/pnpm fresh 项目。
- `scripts/sdk54/verify-cli-acceptance.mjs`：校验 packed CLI、blank/default 和设备 evidence 完整性。
- `docs/releases/2026-09-28-sdk54-cli-1.5.0*.json|md`：公开来源对比和最终验收证据，不记录私有路径。

### Tests

- CLI 单元测试放在 `apps/cli/__tests__/sdk54/*.test.ts`，packed 文件测试继续使用 `*.pack.test.ts`。
- Node 工具测试放在 `scripts/sdk54/__tests__/*.test.mjs`。
- SDK52 既有测试文件保持并继续全量运行；新增回归测试只锁行为，不重构实现。

---

### Task 1: 锁定 SDK52 legacy 行为并建立 create 参数契约

**Files:**
- Create: `apps/cli/src/sdk54/create-options.ts`
- Create: `apps/cli/__tests__/sdk54/create-options.test.ts`
- Modify: `apps/cli/__tests__/creator.test.ts`

**Interfaces:**
- Produces: `type Sdk54Template = 'blank-typescript' | 'default'`。
- Produces: `interface ParsedCreateArgs { projectName: string; requestedSdk: SdkVersion | null; template: Sdk54Template; packageManager: Pm; rawArgs: string[] }`。
- Produces: `parseCreateArgs(args: string[]): ParsedCreateArgs`，输入 CLI create argv，输出规范化项目名、SDK、模板和包管理器。
- Produces: `assertCreateSelectionSupported(parsed: ParsedCreateArgs, sdk: SdkVersion): void`，SDK52 只接受 default；SDK54 只接受 npm/pnpm。
- Preserves: SDK52 当前调用顺序 `create-expo-app → injectHarmonyBaseline → scanAndAdapt → cleanupHTemplateCode → injectContent` 和当前模板 `default@sdk-52`。

- [x] **Step 1: 写失败测试**

在 `create-options.test.ts` 写出精确断言：未指定模板为 `default`；`--template blank-typescript` 和 `--template=default` 可解析；重复 template、缺值、未知模板、多个包管理器 flag、额外位置参数报错；`--sdk=55` 报“仅支持 52 或 54”；SDK54 的 `--yarn/--bun` 和 SDK52 的 blank template 在创建目录前报错。在 `creator.test.ts` 增加 SDK52 spy 序列断言，并断言 SDK52 不导入或调用任何 `sdk54/*` 编排函数。

- [x] **Step 2: 运行 RED**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/create-options.test.ts __tests__/creator.test.ts`

Expected: FAIL，至少包含 `Cannot find module '../../src/sdk54/create-options'`；现有 SDK52 测试保持原结果，证明失败来自新增契约而非旧链路。

- [x] **Step 3: 写最小实现**

只实现纯解析和校验，不移动 `creator.ts` 中 SDK52 主体。复用 `Pm` 与 `SdkVersion` 类型；项目名仍使用现有安全正则。所有校验在任何 `create-expo-app` 调用前完成。

- [x] **Step 4: 运行 GREEN**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/create-options.test.ts __tests__/creator.test.ts`

Expected: PASS；SDK52 spy 顺序与变更前一致。

- [x] **Step 5: 独立审查**

确认 `git diff -- apps/cli/src/creator.ts` 为空，且本任务没有修改 SDK52 injector/scanner/cleanup 实现。

### Task 2: 在 creator 中增加 SDK54 早期分流和官方 create argv

**Files:**
- Create: `apps/cli/src/sdk54/create.ts`
- Create: `apps/cli/__tests__/sdk54/create.test.ts`
- Modify: `apps/cli/src/creator.ts`
- Modify: `apps/cli/__tests__/creator.test.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: `apps/cli/__tests__/dispatch.test.ts`

**Interfaces:**
- Consumes: `ParsedCreateArgs`、`Sdk54Template`。
- Produces: `interface Sdk54CreateRequest { cwd: string; projectName: string; template: Sdk54Template; packageManager: 'npm' | 'pnpm' }`。
- Produces: `interface Sdk54CreateResult { projectRoot: string; template: Sdk54Template; packageManager: 'npm' | 'pnpm'; patchSet: string }`。
- Produces: `runSdk54Create(request: Sdk54CreateRequest): Promise<Sdk54CreateResult>`；本任务先只实现官方模板创建边界，其余阶段由后续任务补入。
- Produces: `createExpoTemplateArg('blank-typescript') === 'blank-typescript'`，`createExpoTemplateArg('default') === 'default@sdk-54'`。

- [x] **Step 1: 写失败测试**

测试 SDK54 creator 精确调用：`runFileQuiet('npx', ['create-expo-app@5.0.0', projectName, '--template', templateArg, '--no-install'], { cwd })`。测试 SDK54 分流调用 `runSdk54Create()` 后立即返回，且 `injectHarmonyBaseline`、`scanAndAdapt`、`cleanupHTemplateCode`、`injectContent` 均未调用。测试 SDK52 仍调用旧序列。帮助文本新增 `--template blank-typescript|default` 和 npm/pnpm 说明，但不改变 SDK52 示例。

- [x] **Step 2: 运行 RED**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/create.test.ts __tests__/creator.test.ts __tests__/dispatch.test.ts`

Expected: FAIL，显示 SDK54 仍调用未带版本的 `create-expo-app` 且继续进入 legacy injector。

- [x] **Step 3: 写最小实现**

`creator.ts` 在完成项目名、SDK、template、包管理器校验后：若 `sdk === 'sdk-54'`，调用 `runSdk54Create()` 并 `return`；否则原 SDK52 代码块原位继续。`create.ts` 只创建模板并保留底层 stdout/stderr 摘要，不添加 patch、依赖或文档逻辑。

- [x] **Step 4: 运行 GREEN**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/create.test.ts __tests__/creator.test.ts __tests__/dispatch.test.ts`

Expected: PASS；SDK54 early return 和 SDK52 legacy sequence 均被断言。

### Task 3: 生成并校验 SDK54 patch manifest contract

**Files:**
- Create: `scripts/sdk54/generate-cli-patch-manifest.mjs`
- Create: `scripts/sdk54/__tests__/generate-cli-patch-manifest.test.mjs`
- Create: `apps/cli/content/patches/sdk-54/manifest.json`
- Create: `apps/cli/src/sdk54/patch-manifest.ts`
- Create: `apps/cli/__tests__/sdk54/patch-manifest.test.ts`

**Interfaces:**
- Produces: manifest `schemaVersion: 1`、`patchSet: 'sdk54-mvp-1'`、`createExpoApp: '5.0.0'`、`patchPackageVersion: '8.0.0'`。
- Produces: manifest `catalog`，由 `EXPO_ARCHIVE_VERSIONS`、`EXTERNAL_ARCHIVE_VERSIONS`、plain/dev dependency maps 和模板包集合生成。
- Produces: `interface RuntimeProbeSpec { kind: 'file' | 'require' | 'command'; target: string; args?: string[]; expected?: string }`。
- Produces: `interface PatchDescriptor { name: string; version: string; file: string; sha256: string; templates: Sdk54Template[]; requiredFiles: string[]; probes: RuntimeProbeSpec[]; licenses: string[] }`。
- Produces: `interface Sdk54PatchManifest { schemaVersion: 1; patchSet: string; createExpoApp: string; patchPackageVersion: string; catalog: Record<string, unknown>; templates: Record<Sdk54Template, Record<string, unknown>>; patches: PatchDescriptor[] }`。
- Produces: `loadSdk54PatchManifest(packageRoot?: string): Sdk54PatchManifest`；读取随包内容、验证稳定排序、精确版本、相对安全路径和无重复包。

- [x] **Step 1: 写失败测试**

Node 测试断言 manifest catalog 与 `fixture-contract.mjs` 完全一致，并拒绝第三份手写版本、绝对路径、registry URL、重复 package、错误 schema、未知模板和非 64 位 sha256。Vitest 测试断言 CLI loader 对损坏/缺失 manifest 失败关闭，错误包含 patch-set 和字段路径。

- [x] **Step 2: 运行 RED**

Run: `node --test scripts/sdk54/__tests__/generate-cli-patch-manifest.test.mjs && pnpm --dir apps/cli exec vitest run __tests__/sdk54/patch-manifest.test.ts`

Expected: 第一条命令因生成器缺失失败；实现生成器但未实现 loader 后，第二条命令因模块缺失失败。

- [x] **Step 3: 写最小实现**

生成器从 fixture contract 构造稳定 JSON，不复制版本常量。初始 `patches` 可为空，后续生成任务填充；loader 必须允许“生成阶段空 patches”，但 SDK54 create 调用的 `assertManifestReadyForTemplate()` 必须拒绝缺 patch 的发布 manifest。

- [x] **Step 4: 运行 GREEN**

Run: `node scripts/sdk54/generate-cli-patch-manifest.mjs --output apps/cli/content/patches/sdk-54/manifest.json && node --test scripts/sdk54/__tests__/generate-cli-patch-manifest.test.mjs && pnpm --dir apps/cli exec vitest run __tests__/sdk54/patch-manifest.test.ts`

Expected: PASS；连续生成两次 `git diff --exit-code -- apps/cli/content/patches/sdk-54/manifest.json` 无第二次变化。

### Task 4: 实现 SDK54 多文件原子事务

**Files:**
- Create: `apps/cli/src/sdk54/file-transaction.ts`
- Create: `apps/cli/__tests__/sdk54/file-transaction.test.ts`

**Interfaces:**
- Produces: `interface TextFileChange { path: string; contents: string; mode?: number }`。
- Produces: `commitTextFileTransaction(changes: readonly TextFileChange[]): void`。
- Input: 同一项目内的绝对文件路径；Output: 所有文件均为新内容，或故障时全部恢复原内容。
- Uses: 现有 `renameAtomic()`；临时与备份文件必须位于目标同目录，成功和回滚后均清理。

- [x] **Step 1: 写失败测试**

覆盖：两文件成功写入；目标不存在时创建；第二次 rename 注入失败时第一文件恢复、第二文件未变；重复 path 拒绝；目录穿越由调用方预先解析后不接受空 path；临时/备份文件不残留。

- [x] **Step 2: 运行 RED**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/file-transaction.test.ts`

Expected: FAIL，模块不存在。

- [x] **Step 3: 写最小实现**

先为全部 change 写临时文件并 fsync/close，再把旧目标 rename 到备份，最后逐一 rename 临时文件；任一步失败按逆序恢复。不要引入通用事务框架或修改现有 SDK52 写文件逻辑。

- [x] **Step 4: 运行 GREEN**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/file-transaction.test.ts`

Expected: PASS，故障注入快照与调用前字节一致。

### Task 5: 实现官方 SDK54 template contract

**Files:**
- Create: `apps/cli/src/sdk54/template-contract.ts`
- Create: `apps/cli/__tests__/sdk54/template-contract.test.ts`

**Interfaces:**
- Consumes: `Sdk54PatchManifest`、`Sdk54Template`。
- Produces: `interface ValidatedSdk54Template { projectRoot: string; template: Sdk54Template; packageJson: Record<string, unknown>; appJson: Record<string, unknown>; appName: string; slug: string }`。
- Produces: `validateSdk54Template(projectRoot, template, manifest): ValidatedSdk54Template`。
- Validates: `package.json`、`app.json`、blank 入口 `App.tsx`；default 入口 `expo-router/entry` 及 `app/(tabs)/index.tsx`、`app/(tabs)/explore.tsx`、`app/_layout.tsx`、`app/modal.tsx`。

- [x] **Step 1: 写失败测试**

为 blank/default 建最小 fixture，断言 Expo/React/RN 与 manifest 固定基线匹配。逐项测试缺文件、错误 main、错误版本、版本范围而非精确版本、default import 漂移、已有 `harmony/`、`index.harmony.js`、`shims/`、`scripts/postinstall-harmony.js` 或应用侧 `metro.config.js` 时失败；失败前磁盘快照不变。

- [x] **Step 2: 运行 RED**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/template-contract.test.ts`

Expected: FAIL，模块不存在。

- [x] **Step 3: 写最小实现**

只读验证，不写文件。错误文本包含阶段 `template-contract`、目标字段、实际值和预期值；不得用宽泛正则接受未知 default 模板形态。

- [x] **Step 4: 运行 GREEN**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/template-contract.test.ts`

Expected: PASS，所有漂移用例失败关闭且 fixture hash 不变。

### Task 6: 实现 default 两文件 expo-image 确定性替换

**Files:**
- Create: `apps/cli/src/sdk54/default-image-substitution.ts`
- Create: `apps/cli/__tests__/sdk54/default-image-substitution.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_IMAGE_FILES`、`DEFAULT_IMAGE_IMPORT`、`DEFAULT_REACT_NATIVE_IMAGE_IMPORT` 的 manifest 生成结果或等价 manifest 字段；不得在 CLI 再手写版本表。
- Produces: `planDefaultImageSubstitution(projectRoot): readonly TextFileChange[]`。
- Produces: `applyDefaultImageSubstitution(projectRoot): readonly string[]`，输出精确变更路径数组。
- Modifies only: `app/(tabs)/index.tsx`、`app/(tabs)/explore.tsx`；依赖删除由 Task 7 的 package-json planner 完成。

- [x] **Step 1: 写失败测试**

断言两文件各只替换一次已知 import，应用 JSX 和其余文件字节不变。任一文件 import 缺失、重复、额外 `expo-image` 用法或读取失败时，两个文件均不修改。注入第二个 rename 失败时事务回滚。

- [x] **Step 2: 运行 RED**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/default-image-substitution.test.ts`

Expected: FAIL，模块不存在。

- [x] **Step 3: 写最小实现**

先读取并验证两个文件，把完整新内容放入内存，再用 `commitTextFileTransaction()` 一次提交。禁止目录扫描、全局正则或修改第三个文件。

- [x] **Step 4: 运行 GREEN**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/default-image-substitution.test.ts`

Expected: PASS；变更路径稳定排序且恰好为两个文件。

### Task 7: 生成 SDK54 精确 package.json 并限制包管理器

**Files:**
- Create: `apps/cli/src/sdk54/package-json.ts`
- Create: `apps/cli/__tests__/sdk54/package-json.test.ts`
- Modify: `apps/cli/src/lib/pkg-manager.ts`
- Modify: `apps/cli/__tests__/pkg-manager.test.ts`

**Interfaces:**
- Produces: `buildSdk54PackageJson(current, template, manifest): Record<string, unknown>`。
- Produces: `sdk54InstallCommand(pm: 'npm' | 'pnpm'): CommandParts`，分别为 `npm install` 和 `pnpm install`。
- Preserves: package `name`、template `main`、非冲突 scripts 和 app metadata。
- Replaces: dependencies/devDependencies 为 manifest 的精确模板集合，default 删除 `expo-image`，并加入 `patch-package@8.0.0`。

- [x] **Step 1: 写失败测试**

断言 blank/default 的精确 package set 与 fixture contract 一致；所有版本无 `^`/`~`；default 不含 `expo-image`；blank 不含 Router/WebBrowser；RNOH CLI、React、RN 和 devDependencies 精确。断言 npm/pnpm 命令；SDK54 Yarn/Bun 校验在目录创建前失败，SDK52 现有 `resolvePm()` 行为不变。

- [x] **Step 2: 运行 RED**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/package-json.test.ts __tests__/pkg-manager.test.ts`

Expected: FAIL，SDK54 planner 不存在；既有 package-manager 测试继续通过。

- [x] **Step 3: 写最小实现**

只从 manifest catalog 读取版本。不要修改 SDK52 `installCmd()`、`uninstallCmd()`、`runScriptCmd()`；新增 SDK54 专用 helper。

- [x] **Step 4: 运行 GREEN**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/package-json.test.ts __tests__/pkg-manager.test.ts`

Expected: PASS，生成 JSON 经稳定 stringify 后两轮字节一致。

### Task 8: 安装 patch、校验 checksum 并安全合并 postinstall

**Files:**
- Create: `apps/cli/src/sdk54/install-patches.ts`
- Create: `apps/cli/__tests__/sdk54/install-patches.test.ts`

**Interfaces:**
- Produces: `mergePatchPostinstall(existing: unknown): string`。
- Produces: `prepareSdk54PatchInstall(projectRoot, template, manifest): { patchFiles: string[]; packageJsonChanged: boolean }`。
- Exact command: `patch-package --error-on-fail --error-on-warn`。
- Input patches: 仅 manifest 对当前 template 声明且 sha256 匹配的文件；Output: 项目 `patches/`、原子更新的 `package.json` 和复制的公开许可证引用。

- [x] **Step 1: 写失败测试**

覆盖：无 postinstall 时写 exact command；已有 `echo ready` 时变为 `echo ready && patch-package --error-on-fail --error-on-warn`；已含 exact command 时幂等；包含不同 patch-package 参数、`pnpm.patchedDependencies`、Yarn patch 协议或其他冲突 patch manager 时失败；source patch 缺失/checksum 错误/版本错时 package.json 与 patches 均不改；重复执行字节不变。

- [x] **Step 2: 运行 RED**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/install-patches.test.ts`

Expected: FAIL，模块不存在。

- [x] **Step 3: 写最小实现**

先校验全部 source、checksum、目标安全相对路径和冲突，再构造所有文件变化，用 Task 4 事务提交。不得写 `scripts/postinstall-harmony.js`。

- [x] **Step 4: 运行 GREEN**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/install-patches.test.ts`

Expected: PASS；第二次运行无 diff，故障用例项目快照不变。

### Task 9: 实现安装后 runtime probes

**Files:**
- Create: `apps/cli/src/sdk54/verify-runtime.ts`
- Create: `apps/cli/__tests__/sdk54/verify-runtime.test.ts`

**Interfaces:**
- Produces: `interface RuntimeFailure { stage: 'version' | 'file' | 'probe' | 'bypass'; packageName?: string; expected?: string; actual?: string; detail: string }`。
- Produces: `collectSdk54RuntimeFailures(projectRoot, manifest): RuntimeFailure[]`。
- Produces: `assertSdk54Runtime(projectRoot, manifest): void`。
- Required files include `@expo/cli/build/bin/cli`、`@expo/metro-config/build/withHarmony.js`、`expo-modules-autolinking/build/platforms/harmony/**` and manifest-declared core Expo Harmony entries.

- [x] **Step 1: 写失败测试**

构造 node_modules fixture，断言精确版本、关键 build/harmony 文件、CLI Harmony command registration、Metro platform dispatch、autolinking Harmony platform export 均被实际 require/执行探测，而非文本注释匹配。删除 patch marker 或使用 `--ignore-scripts` 形态时 probe 明确失败。断言旧 bypass 文件存在时失败。

- [x] **Step 2: 运行 RED**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/verify-runtime.test.ts`

Expected: FAIL，模块不存在。

- [x] **Step 3: 写最小实现**

使用 `require.resolve`/参数化 `node -e` 无副作用 probe，设置短超时并捕获 stdout/stderr。错误包含包名、预期版本、失败 probe 和恢复操作 `重新安装并确认 postinstall 未被禁用`。

- [x] **Step 4: 运行 GREEN**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/verify-runtime.test.ts`

Expected: PASS；comment-only、dead branch 和未应用 patch fixture 均被拒绝。

### Task 10: 扩展 SDK54 managed-state 并识别 legacy SDK54

**Files:**
- Create: `apps/cli/src/sdk54/project-state.ts`
- Create: `apps/cli/__tests__/sdk54/project-state.test.ts`
- Modify: `apps/cli/src/lifecycle/managed-state.ts`
- Modify: `apps/cli/__tests__/managed-state.test.ts`

**Interfaces:**
- Extends: `ManagedState` 增加可选 `sdk54`，值为 `{ sdk: 'sdk-54'; mode: 'sdk54-package-patch'; template: Sdk54Template; patchSet: string; expo: '54.0.37'; rnoh: '0.82.30' }`。
- Produces: `writeSdk54ManagedState(projectRoot, input): void`，合并而非覆盖 `packages/generatedFiles/managedEntries` 和未知用户字段。
- Produces: `classifyHarmonyProject(projectRoot): 'sdk52-legacy' | 'sdk54-package-patch' | 'sdk54-legacy' | 'unknown'`。

- [x] **Step 1: 写失败测试**

断言写入设计中的 exact JSON；已有 state 字段保留；重复写幂等；损坏/越界 state 不用于删除。存在 SDK54 expo 版本且有 `index.harmony.js`、`shims/` 或旧 state 时分类为 `sdk54-legacy`；新 mode 即使 harmony 尚未 prebuild 也分类为 package-patch。

- [x] **Step 2: 运行 RED**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/project-state.test.ts __tests__/managed-state.test.ts`

Expected: FAIL，新 schema/helper 不存在；既有 managed-state 清理测试继续通过。

- [x] **Step 3: 写最小实现**

沿用 version 2 schema 和原子 writer，只增加可选字段及严格验证。分类函数只读，不迁移、不删除。

- [x] **Step 4: 运行 GREEN**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/project-state.test.ts __tests__/managed-state.test.ts`

Expected: PASS，旧 version 1/2 state 兼容测试不回归。

### Task 11: 注入 SDK-aware 文档且保持 SDK52 文档不变

**Files:**
- Create: `apps/cli/src/sdk54/docs.ts`
- Create: `apps/cli/__tests__/sdk54/docs.test.ts`
- Create: `apps/cli/content/docs/sdk-54/README.md`
- Create: `apps/cli/content/docs/sdk-54/AGENTS.md`
- Create: `apps/cli/content/docs/sdk-54/HARMONY.md`
- Create: `apps/cli/content/docs/sdk-54/PATCHES.md`
- Create: `apps/cli/content/docs/sdk-54/TROUBLESHOOTING.md`
- Modify: `apps/cli/__tests__/content-injector.test.ts`

**Interfaces:**
- Produces: `injectSdk54Docs(projectRoot, { appName, slug, template, patchSet, expo, rnoh }): void`。
- Preserves: `injectContent()` 及 `apps/cli/content/docs/*.md` 作为 SDK52 legacy 内容，不改其输出。
- SDK54 docs output: 根 `README.md`、`AGENTS.md` 和 `docs/HARMONY.md|PATCHES.md|TROUBLESHOOTING.md`。

- [x] **Step 1: 写失败测试**

断言 SDK54 docs 包含官方 Expo prebuild/run/start、精确版本、patch 重装、doctor、`expo-image` 两文件替换、单层 Router `dismissTo` 和普通 ArkWeb 边界；不含 `index.harmony.js`、`shims/`、`pnpm start:harmony`、自定义 bundle 脚本和“不要使用 npx expo prebuild”。同时 snapshot/hash 锁定 SDK52 注入输出不变。

- [x] **Step 2: 运行 RED**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/docs.test.ts __tests__/content-injector.test.ts`

Expected: FAIL，SDK54 docs/helper 不存在；SDK52 既有测试保持通过。

- [x] **Step 3: 写最小实现**

独立复制 SDK54 模板并替换明确占位符；不调用或修改 SDK52 `copySkills()` 逻辑，不声称 Expo upstream 已原生发布 Harmony 支持。

- [x] **Step 4: 运行 GREEN**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/docs.test.ts __tests__/content-injector.test.ts`

Expected: PASS，forbidden phrase 扫描为零命中。

### Task 12: 完成 runSdk54Create 阶段编排与失败诊断

**Files:**
- Modify: `apps/cli/src/sdk54/create.ts`
- Modify: `apps/cli/__tests__/sdk54/create.test.ts`

**Interfaces:**
- Consumes: Tasks 3–11 全部接口。
- Pipeline: validate request → official create → template contract → default substitution → package JSON plan/patch copy → npm/pnpm install → runtime probes → managed-state → SDK54 docs。
- Output: `Sdk54CreateResult`；失败保留 `projectRoot` 并报告 `stage`、目标包/文件、预期版本和恢复操作。

- [x] **Step 1: 写失败测试**

用 mock 阶段记录器断言顺序；blank 不调用 image substitution；default 调用且只返回两文件。对 create-expo-app、contract、patch copy、install、probe、state、docs 各注入一次故障，断言后续阶段不执行，目标目录不被递归删除，底层 stderr 摘要保留。断言成功项目不存在所有 legacy bypass 文件。

- [x] **Step 2: 运行 RED**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/create.test.ts`

Expected: FAIL，当前 create 只完成模板拉取，缺少后续阶段调用。

- [x] **Step 3: 写最小实现**

按固定顺序接线，不在 orchestrator 内复制各组件逻辑。package.json、patch、替换在 install 前完成；runtime probe 通过后才写 managed-state/docs，失败时不伪造完成状态。

- [x] **Step 4: 运行 GREEN**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/create.test.ts __tests__/creator.test.ts`

Expected: PASS；SDK54 不触发任何 legacy mock，SDK52 回归仍通过。

### Task 13: SDK54 后续命令跳过旧 injector/scanner/generator

**Files:**
- Modify: `apps/cli/src/commands/prebuild.ts`
- Modify: `apps/cli/src/commands/sync.ts`
- Modify: `apps/cli/src/commands/scan.ts`
- Modify: `apps/cli/src/installer/installer.ts`
- Modify: `apps/cli/src/installer/uninstaller.ts`
- Modify: `apps/cli/__tests__/prebuild.test.ts`
- Modify: `apps/cli/__tests__/sync.test.ts`
- Modify: `apps/cli/__tests__/scan.test.ts`
- Modify: `apps/cli/__tests__/install.test.ts`
- Modify: `apps/cli/__tests__/uninstall.test.ts`

**Interfaces:**
- Consumes: `classifyHarmonyProject()`。
- SDK54 prebuild: 参数化转发本地 `npx --no-install expo prebuild --platform harmony`，保留用户允许的 Expo args。
- SDK54 sync: 失败并提示官方 prebuild/autolinking。
- SDK54 scan/install/uninstall: fresh 1.5.0 范围外的额外适配失败关闭，不调用 SDK52 scanner/shim/injector/cleanup。
- SDK52: 所有当前行为与命令保持。

- [x] **Step 1: 写失败测试**

为每个命令建立 package-patch fixture，spy 旧函数并断言未调用。prebuild 断言 exact argv；sync/scan/install/uninstall 断言范围说明和非零失败。为 SDK52 保留原测试并增加调用序列快照。

- [x] **Step 2: 运行 RED**

Run: `pnpm --dir apps/cli exec vitest run __tests__/prebuild.test.ts __tests__/sync.test.ts __tests__/scan.test.ts __tests__/install.test.ts __tests__/uninstall.test.ts`

Expected: FAIL，SDK54 当前仍进入自研 generator/scanner/installer。

- [x] **Step 3: 写最小实现**

在各命令最早可安全位置按 project kind 分支并 return/throw；不要搬动 SDK52 主体。legacy SDK54 统一交由 doctor/诊断错误，不做自动清理。

- [x] **Step 4: 运行 GREEN**

Run: 同 Step 2。

Expected: PASS；所有 SDK52 既有测试通过，SDK54 spy 证明旧路径零调用。

### Task 14: SDK-aware doctor 与 legacy SDK54 诊断

**Files:**
- Create: `apps/cli/src/sdk54/doctor.ts`
- Create: `apps/cli/__tests__/sdk54/doctor.test.ts`
- Modify: `apps/cli/src/commands/doctor.ts`
- Modify: `apps/cli/src/env-checks/project-checks.ts`
- Modify: `apps/cli/__tests__/env-doctor.test.ts`

**Interfaces:**
- Produces: `runSdk54DoctorChecks(projectRoot, manifest): CheckResult[]`。
- Checks: exact versions、patch-set、postinstall exact command、patch files/checksum、runtime probes、forbidden bypass files、managed-state/template 一致性。
- Legacy result: label `legacy SDK54 project`，status `fail`，提示 fresh recreate/手工迁移边界，不修改磁盘。

- [x] **Step 1: 写失败测试**

覆盖 healthy package-patch、缺 patch、版本漂移、postinstall 被删、lifecycle 禁用导致 probe 未生效、legacy bypass、SDK55 项目。运行 doctor 前后比较目录 hash，保证只读。保持 SDK52 doctor 三段式输出和退出码测试。

- [x] **Step 2: 运行 RED**

Run: `pnpm --dir apps/cli exec vitest run __tests__/sdk54/doctor.test.ts __tests__/env-doctor.test.ts`

Expected: FAIL，SDK54 专用检查不存在，legacy 项目被旧 baseline/drift 逻辑误判。

- [x] **Step 3: 写最小实现**

doctor 根据 project kind 选择 SDK54 或 legacy SDK52 checks；复用 `collectSdk54RuntimeFailures()`，不复制 probe。失败提示包含恢复命令，不自动修复。

- [x] **Step 4: 运行 GREEN**

Run: 同 Step 2。

Expected: PASS；healthy 返回 0、警告返回 2、缺 patch/legacy/SDK55 返回 1，SDK52 原测试不变。

### Task 15: 对齐 compatibility table 与 SDK 版本检测

**Files:**
- Modify: `apps/cli/src/version-matrix.ts`
- Modify: `apps/cli/__tests__/version-matrix.test.ts`
- Modify: `apps/cli/src/scanner/compat-table.ts`
- Modify: `apps/cli/__tests__/compat-table.test.ts`

**Interfaces:**
- `detectSdkVersion()`: Expo major 54 → `sdk-54`；major 52 及以下按既有规则；53 拒绝；55 及更高明确拒绝。
- SDK54 compatibility data: gesture `2.30.1`、reanimated `4.0.1`、safe-area `5.6.3`、screens `4.9.0`、worklets `1.0.0`。
- SDK54 migrated Expo packages: `expo-font`、`expo-system-ui`、`expo-web-browser` 不再 `remove`；`expo-splash-screen` 不再旧 `unsupported`；旧空实现/假模块/早期 patch 声明移除。
- SDK52 table bytes/semantic snapshot unchanged。

- [x] **Step 1: 写失败测试**

新增 55/56/99 拒绝用例；断言已验收外部版本且四个 Expo 包状态不为 remove/unsupported；断言 SDK54 table 只出现本计划批准的 Harmony 版本集合；保存 SDK52 table stable JSON hash。

- [x] **Step 2: 运行 RED**

Run: `pnpm --dir apps/cli exec vitest run __tests__/version-matrix.test.ts __tests__/compat-table.test.ts`

Expected: FAIL，当前 `major >= 54` 接受 SDK55，且 table 含四个未验收 Harmony 版本与旧 remove/unsupported。

- [x] **Step 3: 写最小实现**

只改 SDK54 分支和 detect 条件；不整理、重排或格式化 SDK52 table。SDK54 package-patch 项目不会调用 scanner，compat table 仅保留已验收诊断信息。

- [x] **Step 4: 运行 GREEN**

Run: 同 Step 2。

Expected: PASS；SDK52 hash 与 RED 前记录一致。

### Task 16: 对比外部十一包的公共可获得性与内容

**Files:**
- Create: `scripts/sdk54/compare-external-packages.mjs`
- Create: `scripts/sdk54/__tests__/compare-external-packages.test.mjs`
- Create: `docs/releases/2026-09-28-sdk54-external-package-comparison.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `interface ExternalPackageComparison { name: string; version: string; publicAvailable: boolean; publicSha256?: string; approvedSha256: string; manifestDiff: string[]; textDiff: string[]; binaryDiff: string[]; decision: 'public-identical' | 'public-text-patch' | 'fail-closed' }`。
- Produces: `interface ExternalComparisonReport { schemaVersion: 1; packages: ExternalPackageComparison[]; failures: string[] }`。
- Produces: `compareExternalPackages({ approvedDir, outputFile, npmClient }): Promise<ExternalComparisonReport>`。
- Report per package: name/version、public availability、public tgz sha256、approved tgz sha256、manifest diff、text file diff、binary diff、decision `public-identical | public-text-patch | fail-closed`。
- CLI: `node scripts/sdk54/compare-external-packages.mjs --approved-dir "$SDK54_APPROVED_EXTERNAL_DIR" --output docs/releases/2026-09-28-sdk54-external-package-comparison.json`。
- npm fetch must use `npm pack --ignore-scripts --json name@version` in a disposable directory.

- [x] **Step 1: 写失败测试**

以本地 fake registry pack fixtures 覆盖：完全相同、仅文本差异、缺公开版本、版本错、二进制差异、缺 LICENSE、TGZ 内绝对路径/凭据。断言报告不含 approvedDir 的绝对路径或 registry URL，稳定排序且两轮字节一致。

- [x] **Step 2: 运行 RED**

Run: `node --test scripts/sdk54/__tests__/compare-external-packages.test.mjs`

Expected: FAIL，模块不存在。

- [x] **Step 3: 写最小实现**

复用现有 tar/hash 工具模式；不执行包 lifecycle；只把审计结果写入 JSON，不复制 approved TGZ。真实运行时若任一 decision 为 `fail-closed`，停止后续 patch 生成。

- [x] **Step 4: 运行 GREEN（fixture）**

Run: `node --test scripts/sdk54/__tests__/compare-external-packages.test.mjs`

Expected: PASS。

- [x] **Step 5: 运行真实对比**

Run: `test -d "$SDK54_APPROVED_EXTERNAL_DIR" && node scripts/sdk54/compare-external-packages.mjs --approved-dir "$SDK54_APPROVED_EXTERNAL_DIR" --output docs/releases/2026-09-28-sdk54-external-package-comparison.json`

Expected: 11 个精确包都有 public decision；无 `fail-closed`，报告无私有路径。若出现失败关闭，停止实施并向用户报告具体包与差异，不绕过。

### Task 17: 从十四包发布物和官方 npm baseline 生成 package patches

**Files:**
- Create: `scripts/sdk54/generate-cli-patches.mjs`
- Create: `scripts/sdk54/__tests__/generate-cli-patches.test.mjs`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `interface PatchGenerationReport { round: string; patches: Array<{ name: string; version: string; file: string; sha256: string }>; failures: string[] }`。
- Produces: `generateCliPatches({ rootDir, outputDir, workDir, round }): Promise<PatchGenerationReport>`。
- Uses: `packPackages()` 生成十四个已适配发布型 TGZ；官方基线通过 `npm pack --ignore-scripts --json name@version` 获取。
- Uses: 固定 `patch-package@8.0.0`；每个 patch 只对应一个 package。
- Normalization: 排除适配仓库 provenance 的 `private: true`、`harmony-upstream.json`，保留运行时 package manifest 差异；移除时间戳、绝对路径和非运行时噪声。

- [x] **Step 1: 写失败测试**

本地 fixture 覆盖：baseline 确来自 npm pack 目录而非 Git 工作树；生成 patch 含 `build/**`、必要 `harmony/**` 和 package manifest；未修改包不产噪声 patch；错误版本应用失败；生成时只执行 catalog allowlist build 和 `npm pack --ignore-scripts`；源目录 hash 不变。

- [x] **Step 2: 运行 RED**

Run: `node --test scripts/sdk54/__tests__/generate-cli-patches.test.mjs`

Expected: FAIL，生成器不存在。

- [x] **Step 3: 写最小实现**

在一次性 workDir：生成适配 TGZ、获取官方 TGZ、分别解包、把适配发布内容覆盖到 baseline `node_modules/name`、运行固定 patch-package、规范化 patch。所有命令使用 argv 数组；拒绝 shell 字符串和未 allowlist lifecycle。

- [x] **Step 4: 运行 GREEN（fixture）**

Run: `node --test scripts/sdk54/__tests__/generate-cli-patches.test.mjs`

Expected: PASS；两轮 fixture patch 字节一致。

### Task 18: 建立 patch、许可证和安全审计

**Files:**
- Create: `scripts/sdk54/audit-cli-patches.mjs`
- Create: `scripts/sdk54/__tests__/audit-cli-patches.test.mjs`
- Modify: `scripts/sdk54/check-repository.mjs`
- Modify: `scripts/sdk54/__tests__/check-repository.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `interface PatchAuditReport { ok: boolean; packages: string[]; failures: string[] }`。
- Produces: `auditCliPatches({ patchDir, manifestPath, expectedPackages }): PatchAuditReport`。
- Validates: manifest/package 精确对应、sha256、stable order、14 包完整性、错误版本应用失败、无绝对路径/凭据/私有 registry、无 HAP/HAR/TGZ/cache/binary payload、LICENSE/NOTICE 引用存在。
- Critical runtime coverage: `@expo/cli/build/bin/cli`、`@expo/metro-config/build/withHarmony.js`、`expo-modules-autolinking/build/platforms/harmony/` 必须在相应 patch 中有实际 hunk。

- [x] **Step 1: 写失败测试**

逐一注入缺 patch、checksum 错、重复 package、旧 early patch、只含 `src/**`、关键 build hunk 缺失、二进制块、`/Users/`、`/private/tmp`、token、私有 IPv4、TGZ/HAP/HAR、缺许可证，断言失败信息定位文件和规则。

- [x] **Step 2: 运行 RED**

Run: `node --test scripts/sdk54/__tests__/audit-cli-patches.test.mjs scripts/sdk54/__tests__/check-repository.test.mjs`

Expected: FAIL，新审计模块和仓库规则缺失。

- [x] **Step 3: 写最小实现**

复用现有 repository scanner 的文本/路径规则；manifest 是唯一允许 patch 文件集合。公开 npm URL 不写入 manifest，生成报告只记录包名、版本和 hash。

- [x] **Step 4: 运行 GREEN**

Run: 同 Step 2。

Expected: PASS，所有故障 fixture 失败关闭。

### Task 19: 生成正式 14 包 patch-set 并移除早期 SDK54 patch

**Files:**
- Create: `scripts/sdk54/__tests__/materialize-cli-patches.test.mjs`
- Replace: `apps/cli/content/patches/sdk-54/@expo+cli+54.0.27.patch`
- Replace: `apps/cli/content/patches/sdk-54/@expo+metro-config+54.0.17.patch`
- Replace: `apps/cli/content/patches/sdk-54/expo+54.0.37.patch`
- Replace: `apps/cli/content/patches/sdk-54/expo-asset+12.0.13.patch`
- Replace: `apps/cli/content/patches/sdk-54/expo-constants+18.0.14.patch`
- Replace: `apps/cli/content/patches/sdk-54/expo-font+14.0.12.patch`
- Replace: `apps/cli/content/patches/sdk-54/expo-linking+8.0.12.patch`
- Replace: `apps/cli/content/patches/sdk-54/expo-modules-autolinking+3.0.27.patch`
- Replace: `apps/cli/content/patches/sdk-54/expo-modules-core+3.0.30.patch`
- Replace: `apps/cli/content/patches/sdk-54/expo-router+6.0.24.patch`
- Replace: `apps/cli/content/patches/sdk-54/expo-splash-screen+31.0.13.patch`
- Replace: `apps/cli/content/patches/sdk-54/expo-status-bar+3.0.9.patch`
- Replace: `apps/cli/content/patches/sdk-54/expo-system-ui+6.0.9.patch`
- Replace: `apps/cli/content/patches/sdk-54/expo-web-browser+15.0.11.patch`
- Modify: `apps/cli/content/patches/sdk-54/manifest.json`
- Create: `apps/cli/content/patches/sdk-54/licenses/@expo__cli/LICENSE`
- Create: `apps/cli/content/patches/sdk-54/licenses/@expo__metro-config/LICENSE`
- Create: `apps/cli/content/patches/sdk-54/licenses/expo/LICENSE`
- Create: `apps/cli/content/patches/sdk-54/licenses/expo-asset/LICENSE`
- Create: `apps/cli/content/patches/sdk-54/licenses/expo-constants/LICENSE`
- Create: `apps/cli/content/patches/sdk-54/licenses/expo-font/LICENSE`
- Create: `apps/cli/content/patches/sdk-54/licenses/expo-linking/LICENSE`
- Create: `apps/cli/content/patches/sdk-54/licenses/expo-modules-autolinking/LICENSE`
- Create: `apps/cli/content/patches/sdk-54/licenses/expo-modules-core/LICENSE`
- Create: `apps/cli/content/patches/sdk-54/licenses/expo-router/LICENSE`
- Create: `apps/cli/content/patches/sdk-54/licenses/expo-splash-screen/LICENSE`
- Create: `apps/cli/content/patches/sdk-54/licenses/expo-status-bar/LICENSE`
- Create: `apps/cli/content/patches/sdk-54/licenses/expo-system-ui/LICENSE`
- Create: `apps/cli/content/patches/sdk-54/licenses/expo-web-browser/LICENSE`
- Create: `docs/releases/2026-09-28-sdk54-cli-patch-generation.json`

**Interfaces:**
- Input: 十四包 catalog、Task 16 通过的外部报告、官方 npm。
- Output: manifest 声明的正式 patch files、license files 和 generation report；不存在未声明 patch。
- Explicitly removes current early set, including `expo-image`、`expo-document-picker`、`expo-linear-gradient`、`@react-navigation/bottom-tabs` 和其他非正式基线 patch；不能复制或改名复用它们。

- [x] **Step 1: 写失败测试**

在 `materialize-cli-patches.test.mjs` 读取仓库正式目录，断言 manifest 声明十四个 Expo patch、每个文件 checksum/license 有效、关键 runtime hunk 存在、目录中无未声明 early patch。

- [x] **Step 2: 运行 RED**

Run: `node --test scripts/sdk54/__tests__/materialize-cli-patches.test.mjs && node scripts/sdk54/audit-cli-patches.mjs --patch-dir apps/cli/content/patches/sdk-54 --manifest apps/cli/content/patches/sdk-54/manifest.json`

Expected: FAIL，当前约 52 KB 早期 patch 集缺少十四包、关键 build/harmony 入口和正式 manifest/checksum/license。

- [x] **Step 3: 写最小实现**

只生成并物化 manifest 要求的正式 patch/license/report；不手工编辑 patch hunk，不保留未声明兼容文件。

- [x] **Step 4: 生成 A/B 两轮**

Run: `node scripts/sdk54/generate-cli-patches.mjs --round A --output /private/tmp/sdk54-cli-patches-a && node scripts/sdk54/generate-cli-patches.mjs --round B --output /private/tmp/sdk54-cli-patches-b && diff -ru /private/tmp/sdk54-cli-patches-a /private/tmp/sdk54-cli-patches-b`

Expected: `diff` exit 0；两个目录字节一致。

- [x] **Step 5: 原子替换仓库 patch-set**

先在仓库外完成审计，再把完整目录一次性替换到 `apps/cli/content/patches/sdk-54/`；不得边生成边覆盖现有目录。生成 report 只记录 commit、包版本、文件 hash、工具版本和公开来源结论。

- [x] **Step 6: 运行 GREEN**

Run: `node --test scripts/sdk54/__tests__/materialize-cli-patches.test.mjs scripts/sdk54/__tests__/generate-cli-patch-manifest.test.mjs scripts/sdk54/__tests__/generate-cli-patches.test.mjs scripts/sdk54/__tests__/audit-cli-patches.test.mjs && node scripts/sdk54/audit-cli-patches.mjs --patch-dir apps/cli/content/patches/sdk-54 --manifest apps/cli/content/patches/sdk-54/manifest.json`

Expected: PASS；manifest 有 14 个 Expo patch descriptor，外部包按 Task 16 decision 为公共直装或独立文本 patch，零 early patch 残留。

### Task 20: 修复 test:pack 临时 node_modules symlink

**Files:**
- Modify: `apps/cli/__tests__/helpers/setup-pack.ts`
- Modify: `apps/cli/__tests__/helpers/packed-cli.ts`
- Create: `apps/cli/__tests__/helpers/setup-pack.test.ts`
- Modify: `apps/cli/vitest.pack.config.ts`

**Interfaces:**
- `PackedCli` 增加 `archivePath: string`、`archiveName: string`。
- Pack source: 直接从真实 `apps/cli` 工作区执行 `pnpm pack --pack-destination`，依赖 prepack 自行 clean/build；不复制临时 source，不创建 node_modules symlink/junction。
- Output: 解包目录和原始真实 TGZ 路径。

- [x] **Step 1: 写失败测试**

测试 helper 不调用 `fs.symlinkSync`，pack command cwd 为真实 package root，TGZ 名来自 package version，旧 stale dist 在 prepack 后不进入包；失败时仅清理自己的 temp output，不删除仓库 dist/source。

- [x] **Step 2: 运行 RED**

Run: `pnpm --dir apps/cli exec vitest run __tests__/helpers/setup-pack.test.ts`

Expected: FAIL，当前 helper 明确调用 `fs.symlinkSync(...node_modules...)`。

- [x] **Step 3: 写最小实现**

删除 temp source copy/symlink 流程；保留 temp output/extract。调用继续使用 `resolveCommandInvocation('pnpm')` 和 `execFileSync` argv。

- [x] **Step 4: 运行 GREEN**

Run: `pnpm --dir apps/cli exec vitest run __tests__/helpers/setup-pack.test.ts && pnpm --filter expo-harmony-cli test:pack`

Expected: PASS；`test:pack` 从真实源码 prepack，archivePath 指向真实 TGZ。

### Task 21: 设置 1.5.0 发布候选元数据但不发布

**Files:**
- Modify: `apps/cli/package.json`
- Modify: `apps/cli/CHANGELOG.md`
- Modify: `CHANGELOG.md`
- Modify: `pnpm-lock.yaml` only if package metadata causes a lockfile importer change
- Modify: `apps/cli/__tests__/dispatch.test.ts`

**Interfaces:**
- Package version: exact `1.5.0`，因此 pack 文件名为 `expo-harmony-cli-1.5.0.tgz`。
- Changelog: 只记录 SDK52 legacy 保持、SDK54 package-patch fresh create、npm/pnpm、known limits 和未发布状态；不声明 registry/GitHub Release 已完成。

- [x] **Step 1: 写失败测试**

断言 `dispatch(['--version'])` 输出 `1.5.0`，pack helper archiveName exact，CHANGELOG 包含 SDK54 package-patch 和 `expo-image` known limit。

- [x] **Step 2: 运行 RED**

Run: `pnpm --dir apps/cli exec vitest run __tests__/dispatch.test.ts && pnpm --filter expo-harmony-cli test:pack`

Expected: FAIL，当前版本为 1.4.0，TGZ 名不匹配。

- [x] **Step 3: 写最小实现**

只更新版本和 changelog，不添加 publishConfig、dist-tag、provenance、token 或 registry 操作。

- [x] **Step 4: 运行 GREEN**

Run: 同 Step 2。

Expected: PASS，输出 TGZ 名 exact；`npm publish` 从未执行。

### Task 22: 验证 packed CLI 包含完整 SDK54 runtime/content

**Files:**
- Modify: `apps/cli/__tests__/pack-files.pack.test.ts`
- Modify: `apps/cli/src/harmony-project/__tests__/pack-files.pack.test.ts` only where shared pack expectations require SDK-aware branching

**Interfaces:**
- Packed TGZ must include: `dist/sdk54/**`、`content/patches/sdk-54/manifest.json`、manifest 声明的全部 patch/license、`content/docs/sdk-54/**`、1.5.0 metadata。
- Packed TGZ must exclude: tests、local reports not listed in `files`、TGZ/HAP/HAR、private paths、node_modules、old early SDK54 patches。
- SDK52 dist/content/templates remain present.

- [x] **Step 1: 写失败测试**

从 `readPackedCli()` 读取真实 TGZ，加载 packed manifest，逐个断言 patch sha256/license；检查 dist 中有 create/template/install/probe/state/docs 模块；检查 SDK52 legacy dist 与 content 仍存在；扫描文本和 tar entry 禁止本机状态。

- [x] **Step 2: 运行 RED**

Run: `pnpm --filter expo-harmony-cli test:pack`

Expected: FAIL，当前包缺 SDK54 新 dist、正式 manifest、14 patch 和 SDK54 docs。

- [x] **Step 3: 写最小实现**

只修正 `package.json.files` 或 `.npmignore` 中实际阻挡的路径；不要扩大到整个仓库 `docs/` 或 release evidence。content 子目录应由现有 `files: ['content']` 自动包含。

- [x] **Step 4: 运行 GREEN**

Run: `pnpm --filter expo-harmony-cli test:pack`

Expected: PASS，真实 `expo-harmony-cli-1.5.0.tgz` 自包含且无本机泄漏。

### Task 23: 从真实 1.5.0 TGZ 做 packed CLI 黑盒 create/reinstall

**Files:**
- Create: `scripts/sdk54/blackbox-packed-cli.mjs`
- Create: `scripts/sdk54/__tests__/blackbox-packed-cli.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `interface BlackboxReport { cliTgzSha256: string; template: Sdk54Template; packageManager: 'npm' | 'pnpm'; commands: Array<{ file: string; args: string[]; exitCode: number }>; checks: Record<string, boolean>; failures: string[] }`。
- Produces: `runPackedCliBlackbox({ cliTgz, workDir, template, packageManager, lifecycle }): Promise<BlackboxReport>`。
- Installs CLI from exact TGZ into isolated harness；create 只能通过 harness 的 `node_modules/.bin/expo-harmony-cli`。
- Scenarios: blank/default；npm/pnpm；normal lifecycle；删除 node_modules 后 reinstall；禁用 lifecycle 后 doctor/probe 失败。
- Report contains commands, exit codes, relative paths and hashes，not local absolute paths.

- [x] **Step 1: 写失败测试**

使用 fake create-expo-app/npm packages fixture 验证 harness 确实从 TGZ 安装、不会 import 仓库 src、不会复用仓库 node_modules。覆盖正常 reinstall 恢复 patch、`--ignore-scripts` 后 probe fail、错误 patch version fail 和模板漂移 fail。

- [x] **Step 2: 运行 RED**

Run: `node --test scripts/sdk54/__tests__/blackbox-packed-cli.test.mjs`

Expected: FAIL，runner 不存在。

- [x] **Step 3: 写最小实现**

所有安装与 CLI 调用通过 `execFile` argv；runner 接受显式 TGZ 路径但报告只写 basename/hash。失败保留 workDir 供诊断，由调用者决定清理。

- [x] **Step 4: 运行 GREEN（fixture）**

Run: `node --test scripts/sdk54/__tests__/blackbox-packed-cli.test.mjs`

Expected: PASS。

- [x] **Step 5: 真实 TGZ 非设备黑盒**

Run:

```bash
PACK_DIR=$(mktemp -d /private/tmp/expo-harmony-cli-pack.XXXXXX)
pnpm --dir apps/cli pack --pack-destination "$PACK_DIR"
CLI_TGZ="$PACK_DIR/expo-harmony-cli-1.5.0.tgz"
node scripts/sdk54/blackbox-packed-cli.mjs --cli-tgz "$CLI_TGZ" --work-dir /private/tmp/expo-harmony-cli-blackbox --template all --package-manager all --no-device
```

Expected: blank/default × npm/pnpm create/install/prebuild contract 全通过；reinstall 自动恢复 patch；ignore-scripts case 明确失败而非假通过。

### Task 24: 完成 npm/pnpm fresh install 与 official prebuild 双链路

**Files:**
- Create: `docs/releases/2026-09-28-sdk54-cli-1.5.0-install-prebuild.json`
- Modify: `scripts/sdk54/verify-cli-acceptance.mjs`
- Create: `scripts/sdk54/__tests__/verify-cli-acceptance.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Evidence matrix: template `blank-typescript|default` × packageManager `npm|pnpm`。
- Required fields: TGZ sha256、create argv、install exit、patch probe、official prebuild exit、forbidden file scan、reinstall exit、ignore-scripts expected failure。
- Verifier rejects missing matrix cells, false success fields, private paths and unrecognized versions.

- [x] **Step 1: 写失败测试**

先写 verifier fixture tests，断言缺少任一 template/package-manager cell、false success、私有路径或未批准版本时失败；然后对尚不存在的真实 evidence 运行 verifier。

- [x] **Step 2: 运行 RED**

Run: `node --test scripts/sdk54/__tests__/verify-cli-acceptance.test.mjs && node scripts/sdk54/verify-cli-acceptance.mjs --install-prebuild docs/releases/2026-09-28-sdk54-cli-1.5.0-install-prebuild.json`

Expected: fixture tests PASS；真实 evidence 命令 FAIL，明确列出 4 个缺失 matrix cells。

- [x] **Step 3: 写最小实现**

实现 verifier 的最小 schema 校验，然后使用 Task 23 runner 运行四组合，不增加范围外包管理器或模板。

- [x] **Step 4: 运行四组合**

使用 Task 23 runner 的真实 TGZ，分别执行 npm/pnpm blank/default；每个项目运行 `npx expo prebuild --platform harmony`，扫描 forbidden files，删除 node_modules 后重装并重跑 probes，再做 ignore-scripts negative case。

- [x] **Step 5: 写入证据**

只写版本、命令 argv、相对文件、exit code、hash 和 pass/fail；不写本机 TGZ 目录或设备私有信息。

- [x] **Step 6: 运行 GREEN**

Run: `node scripts/sdk54/verify-cli-acceptance.mjs --install-prebuild docs/releases/2026-09-28-sdk54-cli-1.5.0-install-prebuild.json`

Expected: PASS，4 个组合全部完整；Yarn/Bun negative evidence 显示在 create 目录出现前被拒绝。

### Task 25: 加强 repository/patch/license/security 总审计

**Files:**
- Modify: `scripts/sdk54/check-repository.mjs`
- Modify: `scripts/sdk54/__tests__/check-repository.test.mjs`
- Modify: `apps/cli/NOTICE.md`
- Modify: `NOTICE.md`
- Modify: `SECURITY.md` only if patch-distribution reporting guidance is absent
- Modify: `package.json`

**Interfaces:**
- Root commands add: `sdk54:patch:generate`、`sdk54:patch:audit`、`sdk54:external:compare`、`sdk54:e2e:packed`、`sdk54:acceptance:verify`。
- `pnpm check` includes unit/type/pack/tool/catalog/package audit/repository/patch audit；不自动运行网络或设备 E2E。
- NOTICE explicitly identifies patch files as third-party derivative material and points to shipped license directory.

- [x] **Step 1: 写失败测试**

仓库 checker fixture 注入：TGZ/HAP/HAR、签名材料、credential、private registry、绝对路径、patch 缺 license、manifest 引用越界、未声明 publishable package、危险 lifecycle 和 shell 拼接。断言现有允许的 local evidence ignore 规则不扩大。

- [x] **Step 2: 运行 RED**

Run: `node --test scripts/sdk54/__tests__/check-repository.test.mjs scripts/sdk54/__tests__/audit-cli-patches.test.mjs`

Expected: FAIL，新 release content/license/security 规则未全部覆盖。

- [x] **Step 3: 写最小实现**

仅增加本设计需要的扫描与 NOTICE 文案；不引入 publish、registry 或 GitHub 自动化。

- [x] **Step 4: 运行 GREEN**

Run: `pnpm sdk54:patch:audit && pnpm sdk54:repo-check && pnpm --filter expo-harmony-cli test:pack`

Expected: PASS；`git ls-files` 中不存在 TGZ/HAP/HAR/signing/node_modules/oh_modules/private path。

### Task 26: 从 packed CLI 验收 blank Debug、Release 与 cold start

**Files:**
- Create: `docs/releases/2026-09-28-sdk54-cli-1.5.0-blank-device.json`
- Create: `docs/releases/2026-09-28-sdk54-cli-1.5.0-device-acceptance.md`
- Modify: `scripts/sdk54/verify-cli-acceptance.mjs`
- Modify: `scripts/sdk54/__tests__/verify-cli-acceptance.test.mjs`

**Interfaces:**
- Required environment: `CLI_TGZ` 指向真实 `expo-harmony-cli-1.5.0.tgz`，`HARMONY_DEVICE_ID` 来自 `hdc list targets`。
- Blank evidence: fresh create、应用文件零修改、official prebuild、Debug install/launch/dev、clean Release、bundle 与 embedded bundle sha256 相同、Metro 停止后 cold start、官方 blank 文本。

- [x] **Step 1: 写失败测试**

扩展 verifier fixture，要求 blank 所有字段和 hash，并断言缺少 Debug、Release、bundle hash 或 cold-start 任一字段时失败。

- [x] **Step 2: 运行 RED**

Run: `node scripts/sdk54/verify-cli-acceptance.mjs --blank-device docs/releases/2026-09-28-sdk54-cli-1.5.0-blank-device.json`

Expected: FAIL，列出 blank Debug/Release/cold-start 缺失项。

- [x] **Step 3: 写最小实现**

实现 blank evidence 的最小 verifier 分支，并仅创建一个 packed-CLI blank/pnpm 设备 fixture。

- [x] **Step 4: 创建设备 fixture**

Run: `test -f "$CLI_TGZ" && test -n "$HARMONY_DEVICE_ID" && node scripts/sdk54/blackbox-packed-cli.mjs --cli-tgz "$CLI_TGZ" --work-dir /private/tmp/expo-harmony-cli-device-blank --template blank-typescript --package-manager pnpm --device "$HARMONY_DEVICE_ID" --keep`

Expected: 从 packed CLI fresh create/install/prebuild 成功，应用源文件 hash 与官方模板基线一致。

- [x] **Step 5: Debug 验收**

Run in generated project: `npx expo run:harmony --device "$HARMONY_DEVICE_ID"`，随后 `npx expo start`；验证安装、启动、dev bundle 和官方 blank 文本。

Expected: Debug pass；无 legacy bypass files。

- [x] **Step 6: clean Release 与 cold start**

Run: `npx expo run:harmony --configuration Release --no-build-cache --device "$HARMONY_DEVICE_ID"`；记录生成 bundle/HAP hash；停止 Metro，强制停止并重新启动应用。

Expected: Release `dev=false`，embedded bundle hash 等于生成 bundle hash，Metro 停止后仍显示官方 blank 文本。

- [x] **Step 7: 写 evidence 并运行 GREEN**

Run: `node scripts/sdk54/verify-cli-acceptance.mjs --blank-device docs/releases/2026-09-28-sdk54-cli-1.5.0-blank-device.json`

Expected: PASS；evidence 不包含 HAP 文件本身、签名材料、设备序列号原文或本机路径。

### Task 27: 从 packed CLI 验收 default Debug、Release 与 cold start

**Files:**
- Create: `docs/releases/2026-09-28-sdk54-cli-1.5.0-default-device.json`
- Modify: `docs/releases/2026-09-28-sdk54-cli-1.5.0-device-acceptance.md`
- Modify: `scripts/sdk54/verify-cli-acceptance.mjs`
- Modify: `scripts/sdk54/__tests__/verify-cli-acceptance.test.mjs`

**Interfaces:**
- Default evidence: fresh create、只允许两文件 image substitution 和依赖调整、Tabs、MaterialIcons、RN Image、Modal、单层 `dismissTo`、物理 Back、自定义 animation、ArkWeb open/close、Debug reload、clean Release、无 Metro cold start。
- Protected files: `app/modal.tsx`、`app/_layout.tsx`、`app.json` 字节不变。

- [x] **Step 1: 写失败测试**

扩展 verifier fixture，要求 default 全部交互与 hash 字段，拒绝 `expo-image backend supported=true`，并断言缺少任一 protected-file hash 时失败。

- [x] **Step 2: 运行 RED**

Run: `node scripts/sdk54/verify-cli-acceptance.mjs --default-device docs/releases/2026-09-28-sdk54-cli-1.5.0-default-device.json`

Expected: FAIL，列出 default UI/Debug/Release/cold-start 缺失项。

- [x] **Step 3: 写最小实现**

实现 default evidence 的最小 verifier 分支，并仅创建一个 packed-CLI default/pnpm 设备 fixture。

- [x] **Step 4: 创建设备 fixture 并核对变更集合**

Run: `test -f "$CLI_TGZ" && test -n "$HARMONY_DEVICE_ID" && node scripts/sdk54/blackbox-packed-cli.mjs --cli-tgz "$CLI_TGZ" --work-dir /private/tmp/expo-harmony-cli-device-default --template default --package-manager pnpm --device "$HARMONY_DEVICE_ID" --keep`

Expected: 应用源 diff 仅为 `app/(tabs)/index.tsx`、`app/(tabs)/explore.tsx` 的 import replacement；package.json 为精确依赖/patch lifecycle 调整。

- [x] **Step 5: Debug 交互验收**

Run: `npx expo run:harmony --device "$HARMONY_DEVICE_ID"` 和 `npx expo start`。

Expected: Tabs、MaterialIcons、RN Image、Modal、单层 dismissTo、物理 Back、自定义 animation、ArkWeb open/close、reload 全通过。

- [x] **Step 6: clean Release 与 cold start**

Run: `npx expo run:harmony --configuration Release --no-build-cache --device "$HARMONY_DEVICE_ID"`；重复核心交互，停止 Metro 后冷启动。

Expected: Release `dev=false`，bundle/embedded hash 一致，核心 UI 与 ArkWeb 能力在无 Metro 冷启动后可用。

- [x] **Step 7: 写 evidence 并运行 GREEN**

Run: `node scripts/sdk54/verify-cli-acceptance.mjs --default-device docs/releases/2026-09-28-sdk54-cli-1.5.0-default-device.json`

Expected: PASS；明确记录单层 Router 和普通 ArkWeb 边界，不扩大 MVP 声明。

### Task 28: 最终全量验证、范围审计与交接

**Files:**
- Modify: `TASK_HANDOFF.md`
- Create: `docs/releases/2026-09-28-sdk54-cli-1.5.0.json`
- Create: `docs/releases/2026-09-28-sdk54-cli-1.5.0.md`

**Interfaces:**
- Final evidence aggregates: patch generation、external comparison、install/prebuild matrix、blank/default device evidence、CLI TGZ sha256、test counts 和 known limits。
- No publication side effects.

- [x] **Step 1: 写失败测试**

在 verifier fixture 中增加 final aggregation case，断言缺少任一 patch/external/install/device evidence、TGZ hash、test count 或 `published: false` 时失败。

- [x] **Step 2: 运行 RED**

在汇总 evidence 尚不存在时运行：

Run: `node scripts/sdk54/verify-cli-acceptance.mjs --final docs/releases/2026-09-28-sdk54-cli-1.5.0.json`

Expected: FAIL，列出尚未聚合的 evidence 文件，而不是默认成功。

- [x] **Step 3: 写最小实现**

实现 final evidence 聚合与最小 schema 校验，只读取前序已验证 JSON，不推断或伪造缺失结果。

- [x] **Step 4: 运行完整自动化 gate**

Run: `pnpm type-check && pnpm test && pnpm test:pack && pnpm test:sdk54-tools && pnpm sdk54:validate && pnpm sdk54:pack:check && pnpm sdk54:audit && pnpm sdk54:patch:audit && pnpm sdk54:repo-check`

Expected: 全部 exit 0；记录实际 test file/test 数量，不复制旧 release 的 372/144 数字。

- [x] **Step 5: 运行 packed CLI 与 evidence gate**

Run: `pnpm sdk54:e2e:packed && pnpm sdk54:acceptance:verify`

Expected: npm/pnpm blank/default、reinstall、ignore-scripts negative、blank/default device evidence 全通过。

- [x] **Step 6: 生成 final evidence**

写入 exact 版本、commit、TGZ sha256、manifest patchSet、14+11 结论、测试真实数量、Debug/Release/cold-start 结果、known limits 和 `published: false`。不得写 registry、tag 或 Release URL。

- [x] **Step 7: 运行 GREEN**

Run: `node scripts/sdk54/verify-cli-acceptance.mjs --final docs/releases/2026-09-28-sdk54-cli-1.5.0.json && git diff --check && git status --short --branch`

Expected: verifier PASS、`git diff --check` exit 0；status 只含本计划范围内文件和原有设计/交接文件，无 TGZ/HAP/HAR/node_modules/oh_modules/signing/cache。

- [x] **Step 8: 更新交接并停在用户确认点**

`TASK_HANDOFF.md` 记录已完成任务、真实命令/结果、未验证项、当前 branch/status、release evidence 和下一步。未获明确授权时不 commit、不 push、不 publish、不 tag、不创建 GitHub Release。

## Acceptance Matrix

| Requirement | Tasks |
| --- | --- |
| SDK52 legacy 零回归 | 1, 2, 11, 13, 15, 22, 28 |
| SDK54 creator 早期分流 | 2, 12 |
| blank-typescript/default + create-expo-app@5.0.0 | 1, 2, 5, 12 |
| SDK54 template contract | 5 |
| default 两文件 expo-image 替换 | 6, 7, 27 |
| 14 包 npm baseline patch | 17, 19 |
| build/**、harmony/**、manifest patch | 17, 18, 19 |
| 外部 11 包公共可获得性/内容对比 | 16, 19 |
| patch manifest | 3, 19 |
| patch 安装、postinstall 合并、幂等 | 8, 12, 23 |
| npm/pnpm；Yarn/Bun 失败关闭 | 1, 7, 23, 24 |
| runtime probes | 9, 12, 14, 23 |
| SDK54 managed-state | 10, 12 |
| compatibility table 已验收版本 | 15 |
| SDK55+ 拒绝 | 1, 14, 15 |
| 跳过旧 injector/scanner/cleanup | 2, 12, 13 |
| SDK-aware docs | 11, 12, 22 |
| doctor/legacy SDK54 诊断 | 10, 14 |
| CLI test:pack 修复 | 20, 22 |
| 真实 1.5.0 TGZ 黑盒 | 20–24 |
| blank/default Debug/Release/cold-start | 26, 27 |
| repository/patch/license/security 审计 | 18, 19, 25, 28 |

## Self-Review Checklist

- [x] 设计文档第 2–12 节每个完成标准、非目标、版本、错误处理、安全、测试和发布边界均映射到上表任务。
- [x] 计划全文不含未决占位标记；所有命令、路径、接口、版本和预期结果已明确。
- [x] `Sdk54Template`、`ParsedCreateArgs`、`Sdk54CreateRequest/Result`、`Sdk54PatchManifest`、`PatchDescriptor`、`RuntimeFailure` 和 project kind 名称前后一致。
- [x] Task 19 明确重新生成并替换 current early SDK54 patch，未把旧 patch 当正式输入或直接复用。
- [x] 外部 Harmony 版本仅为 2.30.1/4.0.1/5.6.3/4.9.0/1.0.0，未写入未验收版本。
- [x] Task 20–24 明确从真实 `expo-harmony-cli-1.5.0.tgz` 安装和执行，不从仓库源码偷跑。
- [x] SDK52 文件只在回归测试或最小分流位置触碰，未安排 SDK52 重构。
- [x] 网络/设备任务失败时停止并保留诊断，不以内置私有 TGZ、跳过 probes 或伪造 evidence 绕过。
