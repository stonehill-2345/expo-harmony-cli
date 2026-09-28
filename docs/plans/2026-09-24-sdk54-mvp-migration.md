# Expo SDK54 Harmony Fresh Create-App MVP Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从正式 monorepo 的十四个 SDK54 Harmony 包生成 fresh TGZ，并证明官方 `npx create-expo-app` 创建的 blank 与 default+Router 项目在 Harmony Debug 和 clean Release 均通过。

**Architecture:** `packages/` 是十四包源码唯一来源；每轮从当前工作树确定性生成十四包 TGZ，并与桌面只读的十一包外部 RNOH/navigation TGZ 组成二十五包 staging。Fresh blank/default 项目在仓库外创建，通过固定依赖接管后执行非设备门禁，再在单独授权后运行真实模拟器 Debug/Release。

**Tech Stack:** Node.js 22.20.0、pnpm 10.19.0、npm 10.9.3、Expo 54.0.37、React 19.1.1、React Native 0.82.1、RNOH 0.82.30、Node test runner、npm-packlist、tar、HarmonyOS SDK/DevEco/Hvigor/HDC。

**Spec:** `docs/designs/2026-09-24-sdk54-mvp-migration-design.md`

## Global Constraints

- 正式目标仓库是 `/Users/chensq/Desktop/2345/expo-harmony-cli`；临时来源仓库只读。
- 十四包来源固定为 `expo-harmony-template@2704a48cc52781f510b3996af17c882fb82e1090`。
- 官方 Expo 来源固定为 `expo/expo@5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`。
- 本任务不得修改 `apps/cli` compatibility table、injector、scanner、creator、patch 分发或 template 产品逻辑。
- Fresh 项目必须由官方 `npx create-expo-app@5.0.0` 创建，不复用桌面已有项目。
- 十四个 Expo TGZ 必须从当前正式仓库重新生成；十一外部 TGZ只读复用 `/Users/chensq/Desktop/expo-harmony-sdk54-tgz`。
- 不允许应用侧 `metro.config.js`、`index.harmony.js`、shim/polyfill、patch-package、postinstall 或手改 `harmony/`。
- Default fixture 仅允许两处 `expo-image` → React Native `Image` substitution，并删除 fixture 的 `expo-image` 依赖。
- 未获明确授权不得执行 HDC、HAP 安装/启动、模拟器或设备操作。
- 未获明确授权不得 stage、commit、push、publish 或写 registry。

---

## Completed Foundation

- [x] 十四包 catalog、版本、provenance 和 22 internal edges。
- [x] 十四个完整源码包迁入 `packages/`。
- [x] Router/WebBrowser/基础模块包级测试。
- [x] pnpm workspace、deterministic pack、package audit、repository check。

---

### Task 1: Reconcile the Current Change Set with the Approved Scope

**Files:**
- Restore: `apps/cli/src/scanner/compat-table.ts`
- Restore: `apps/cli/__tests__/compat-table.test.ts`
- Modify: `scripts/sdk54/mvp-boundaries.mjs`
- Modify: `scripts/sdk54/__tests__/mvp-boundaries.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `assertMvpBoundaries(rootDir: string): string[]` that checks migration/catalog/fresh-fixture scope without inspecting `apps/cli` product compatibility metadata.
- Produces: a root `sdk54:check` command independent of `apps/cli` product-flow changes.

- [ ] **Step 1: Write the scope RED test**

Update `mvp-boundaries.test.mjs` so a repository with an unchanged SDK54 `apps/cli` compatibility table can still pass, while catalog `expo-image`, public fixture `expo-image`, multi-level Router claims, complete OAuth claims, and application bypass files still fail.

- [ ] **Step 2: Run RED**

Run:

```bash
node --test scripts/sdk54/__tests__/mvp-boundaries.test.mjs
```

Expected: FAIL because the current helper still requires changing `apps/cli` compatibility metadata.

- [ ] **Step 3: Restore out-of-scope CLI files**

Restore only the two files changed by this migration session to their current HEAD content. Do not restore unrelated files or use reset/clean.

- [ ] **Step 4: Implement the narrower boundary helper**

Remove the `apps/cli/src/scanner/compat-table.ts` inspection. Add explicit detection for fresh-fixture bypass files and dependencies:

```text
metro.config.js
index.harmony.js
shims/
patch-package
postinstall
```

- [ ] **Step 5: Separate the migration check command**

Add:

```json
{
  "sdk54:check": "pnpm test:sdk54-tools && pnpm sdk54:validate && pnpm sdk54:pack:check && pnpm sdk54:audit && pnpm sdk54:repo-check"
}
```

Do not make the migration completion depend on changing `apps/cli` product behavior.

- [ ] **Step 6: Run GREEN and regression**

```bash
pnpm test:sdk54-tools
pnpm sdk54:validate
pnpm sdk54:repo-check
git diff --check
```

Expected: zero failures and no `apps/cli` product source diff from this task.

- [ ] **Step 7: Stop before commit**

Report the suggested commit split; do not stage or commit without explicit authorization.

---

### Task 2: Build a Fresh Twenty-Five-Package E2E Staging Directory

**Files:**
- Create: `scripts/sdk54/stage-e2e-packages.mjs`
- Create: `scripts/sdk54/__tests__/stage-e2e-packages.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `packPackages({ rootDir, outputDir, round })` from `pack-packages.mjs`.
- Produces: `stageE2ePackages({ rootDir, externalDir, outputDir }): Promise<StageManifest>`.
- `StageManifest` is `{ expoPackages: PackageArchive[]; externalPackages: PackageArchive[]; packages: number; failures: string[] }`.
- `PackageArchive` is `{ name: string; version: string; file: string; bytes: number; sha256: string; source: 'workspace' | 'external' }`.

- [ ] **Step 1: Write staging RED tests**

Cover:

- fresh workspace archives override stale same-name Expo TGZ in the external directory;
- exactly eleven approved external filenames are copied;
- one missing external file is a failure;
- extra external files are ignored rather than silently included;
- final manifest contains 14 workspace + 11 external = 25 packages;
- every entry has bytes and a 64-character SHA-256;
- output `manifest.json` is stable and newline-terminated.

- [ ] **Step 2: Run RED**

```bash
node --test scripts/sdk54/__tests__/stage-e2e-packages.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `stage-e2e-packages.mjs`.

- [ ] **Step 3: Implement exact external package contract**

Hard-code only the eleven approved external filenames and versions from the design. Never glob all desktop TGZ files into staging.

- [ ] **Step 4: Generate fresh fourteen-package archives**

Call `packPackages` into a temporary workspace subdirectory, copy its fourteen archives into the final staging directory, then copy the exact eleven external archives. Record SHA-256 after final copy.

- [ ] **Step 5: Add CLI command**

Add:

```json
{
  "sdk54:e2e:stage": "node scripts/sdk54/stage-e2e-packages.mjs --external /Users/chensq/Desktop/expo-harmony-sdk54-tgz --output /private/tmp/expo-sdk54-migration-tgz"
}
```

The implementation must also support explicit `--external` and `--output` arguments so tests never depend on the desktop path.

- [ ] **Step 6: Run GREEN**

```bash
pnpm test:sdk54-tools
pnpm sdk54:e2e:stage
```

Expected: 25 packages and zero failures. Do not commit TGZ or staging output.

- [ ] **Step 7: Stop before commit**

Do not stage or commit without explicit authorization.

---

### Task 3: Prepare Blank and Default Fresh Fixtures Reproducibly

**Files:**
- Create: `scripts/sdk54/prepare-create-expo-fixture.mjs`
- Create: `scripts/sdk54/__tests__/prepare-create-expo-fixture.test.mjs`
- Create: `scripts/sdk54/fixture-contract.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `prepareCreateExpoFixture({ projectDir, template, tgzDir }): FixtureReport`.
- `template` is `'blank-typescript' | 'default'`.
- `FixtureReport` is `{ template: string; changedFiles: string[]; packageVersions: Record<string,string>; substitutions: string[]; failures: string[] }`.

- [ ] **Step 1: Write blank fixture RED test**

Create a minimal blank fixture with `App.tsx`, `index.ts`, `app.json`, and `package.json`. Assert the helper pins SDK54/RN/RNOH dependencies without changing the three application files and without creating forbidden bypass files.

- [ ] **Step 2: Write default fixture RED test**

Create a minimal default fixture with Router files. Assert exactly two Expo Image import replacements, deletion of `dependencies.expo-image`, preservation of `app/modal.tsx`, `app/_layout.tsx`, and `app.json`, and exact Router/navigation/native dependency pins.

- [ ] **Step 3: Run RED**

```bash
node --test scripts/sdk54/__tests__/prepare-create-expo-fixture.test.mjs
```

Expected: FAIL because the helper is absent.

- [ ] **Step 4: Implement shared dependency pins**

Encode the exact versions from the design and guide. Resolve TGZ dependencies as relative `file:` paths from each fresh project to the staging directory. Do not execute npm install inside the helper.

- [ ] **Step 5: Implement the default-only substitution**

Require the exact two expected import shapes. Fail rather than applying a broad search/replace when template source differs.

- [ ] **Step 6: Add forbidden bypass scan**

Reject fixture-created `metro.config.js`, `index.harmony.js`, `shims`, patch-package, postinstall, or pre-existing generated `harmony/` before fresh installation.

- [ ] **Step 7: Run GREEN**

```bash
pnpm test:sdk54-tools
git diff --check
```

- [ ] **Step 8: Stop before commit**

Do not stage or commit without explicit authorization.

---

### Task 4: Reconcile Repository Check with Approved Local Evidence

**Files:**
- Modify: `scripts/sdk54/check-repository.mjs`
- Modify: `scripts/sdk54/__tests__/check-repository.test.mjs`

**Interfaces:**
- Preserves: `checkRepository(rootDir: string): RepositoryReport`.
- Produces: fail-closed scanning of tracked/unignored repository files while excluding only ignored local evidence under `.superpowers/sdd/` and `.tmp/`.

- [ ] **Step 1: Write Git-aware evidence RED tests**

Create real temporary Git repositories. Assert ignored/untracked SDD and `.tmp` evidence is excluded, while force-tracked or explicitly unignored files in those directories are scanned and credential/path matches are reported.

- [ ] **Step 2: Write exact staging-command RED tests**

Assert the exact approved root script value passes:

```text
node scripts/sdk54/stage-e2e-packages.mjs --external /Users/chensq/Desktop/expo-harmony-sdk54-tgz --output /private/tmp/expo-sdk54-migration-tgz
```

A changed path, appended shell operation, or another manifest field containing `/Users/` or `/private/tmp` must still fail.

- [ ] **Step 3: Run RED**

```bash
node --test scripts/sdk54/__tests__/check-repository.test.mjs
```

Expected: ignored SDD evidence is reported, unignored `.tmp` is skipped, and the exact approved root command is reported.

- [ ] **Step 4: Implement scoped Git-aware filtering**

Use `git -C <root> ls-files --cached --others --exclude-standard` only for `.superpowers/sdd` and `.tmp`. On Git failure, scan rather than skip. Preserve filesystem scanning everywhere else so ignored HAP/HAR/TGZ/cache artifacts remain detectable.

- [ ] **Step 5: Implement exact command exemption**

Parse root `package.json`, verify the exact approved `sdk54:e2e:stage` value, remove only that single serialized value from text scanning, and scan every other manifest value normally.

- [ ] **Step 6: Run GREEN**

```bash
node --test scripts/sdk54/__tests__/check-repository.test.mjs
pnpm sdk54:repo-check
git diff --check
```

- [ ] **Step 7: Stop before commit**

Do not stage or commit without explicit authorization.

---

### Task 5: Build Runtime-Complete Deterministic Archives

**Files:**
- Modify: `scripts/sdk54/catalog.mjs`
- Modify: `scripts/sdk54/pack-packages.mjs`
- Modify: `scripts/sdk54/audit-packages.mjs`
- Modify: `scripts/sdk54/__tests__/catalog.test.mjs`
- Modify: `scripts/sdk54/__tests__/pack-packages.test.mjs`
- Modify: `scripts/sdk54/__tests__/audit-packages.test.mjs`

**Interfaces:**
- Extends package descriptors with explicit allowlisted build recipes and required runtime outputs.
- Preserves: `packPackages({ rootDir, outputDir, round }): Promise<PackManifest>`.
- Build-backed packages are compiled in disposable package copies before npm-packlist/tar creation.

- [ ] **Step 1: Write runtime archive RED tests**

Assert fresh archives contain and can resolve:

```text
@expo/cli/build/bin/cli
@expo/cli/build/src/run/harmony/runHarmonyAsync.js
@expo/cli/build/src/prebuild/harmony/prebuildHarmonyAsync.js
@expo/metro-config/build/withHarmony.js
expo-modules-autolinking/build/platforms/harmony/index.js
expo-modules-autolinking/build/platforms/harmony/nativeProject.js
```

Assert the CLI entrypoint has executable mode and reports version `54.0.27`. Assert autolinking installed-runtime resolve accepts `--platform harmony`.

- [ ] **Step 2: Write source-isolation and build determinism RED tests**

Fingerprint source package files, modes, symlinks, mtimes and SHA-256 before/after success and failure. Assert source is unchanged, generated outputs exist only in disposable staging, two independent clean build roots produce byte-identical TGZ, and source maps contain no repository or temporary absolute paths.

- [ ] **Step 3: Write audit RED tests**

Archive audit must fail when declared main/bin/types targets or package-specific required outputs are missing or semantically stale.

- [ ] **Step 4: Run RED**

```bash
node --test scripts/sdk54/__tests__/pack-packages.test.mjs scripts/sdk54/__tests__/audit-packages.test.mjs
```

Expected: current direct-source pack lacks CLI, Metro Harmony and Autolinking Harmony runtime outputs.

- [ ] **Step 5: Add explicit build metadata**

Allow only fixed argv recipes:

```text
@expo/cli -> pnpm --dir <stage> exec taskr release
@expo/metro-config -> pnpm --dir <stage> exec expo-module tsc --project tsconfig.json --pretty false
expo-modules-autolinking -> pnpm --dir <stage> exec expo-module tsc --project tsconfig.json --pretty false
```

Set `CI=1`, `EXPO_NONINTERACTIVE=1`, `TZ=UTC`, `LC_ALL=C`, `LANG=C`, and `SOURCE_DATE_EPOCH=946684800`. Do not execute arbitrary package scripts, `prepare`, `prepublishOnly`, or install scripts.

- [ ] **Step 6: Implement disposable build-before-pack**

Copy each build-backed package to a fresh OS temporary directory, exclude root installed dependencies while preserving tracked canary fixtures, attach only the already pinned build-tool dependencies, remove the staged old build, run the allowlisted command with `shell: false`, validate required outputs and source maps, then run npm-packlist/tar from the staged package. Always clean only the temporary directories created by the packer.

- [ ] **Step 7: Strengthen archive audit**

Validate generic declared entrypoints plus required CLI/Metro/Autolinking runtime outputs inside every generated archive.

- [ ] **Step 8: Run GREEN**

```bash
pnpm test:sdk54-tools
pnpm sdk54:pack:check
pnpm sdk54:audit
pnpm sdk54:e2e:stage
```

Expected: build+pack deterministic, source unchanged, 14/22/0, fresh 25-package staging, runtime entrypoints present.

- [ ] **Step 9: Stop before commit**

Do not stage or commit without explicit authorization.

---

### Task 6: Create Fresh Official Projects and Complete Non-Device Gates

**Files:**
- Create outside repository: `/private/tmp/expo-sdk54-migration-<run-id>/blank-app/**`
- Create outside repository: `/private/tmp/expo-sdk54-migration-<run-id>/default-app/**`
- Create outside repository: `/private/tmp/expo-sdk54-migration-<run-id>/tgz/**`
- Create ignored run manifest: `.tmp/sdk54/e2e/<run-id>/preflight.json`

**Interfaces:**
- Consumes: the 25-package staging and fixture preparation helper.
- Produces: a preflight report containing exact commands, versions, checksums, changed fixture files, install result, forbidden bypass scan, and prebuild/source-test results.

- [ ] **Step 1: Run portable gates**

```bash
pnpm sdk54:check
```

Expected: 14 packages, 22 edges, deterministic archives, zero audit/repository failures.

- [ ] **Step 2: Create a unique run directory**

Use `/private/tmp/expo-sdk54-migration-YYYYMMDD-HHMMSS`. Refuse to reuse an existing directory.

- [ ] **Step 3: Create official blank project**

```bash
npx create-expo-app@5.0.0 blank-app --template blank-typescript
```

Network access requires sandbox approval. Record the exact generated package versions before modification.

- [ ] **Step 4: Create official default project**

```bash
npx create-expo-app@5.0.0 default-app --template default@sdk-54
```

Record `package.json.main` and the five expected Router files before modification.

- [ ] **Step 5: Apply fixture preparation**

Run the helper for blank and default. Record checksums proving blank app files and protected default files are unchanged.

- [ ] **Step 6: Clean fixture dependencies only**

Inside each fresh project remove only:

```text
node_modules
package-lock.json
harmony/
```

Never run these removals in the source or target repository.

- [ ] **Step 7: Install dependencies**

Run `npm install` in both fresh projects using the local TGZ references. Network access is permitted only for non-TGZ public dependencies and requires sandbox approval.

- [ ] **Step 8: Verify installed versions**

Check Expo, CLI, Router, WebBrowser, React, RN, RNOH, Screens, SafeArea, Gesture Handler, Reanimated, Worklets, and all fourteen local Expo archives against the manifest.

- [ ] **Step 9: Run non-device prebuild/source checks**

Run the existing package tests and non-device Harmony prebuild/generation checks that do not call HDC. Verify generated registration includes the expected Core/modules/lifecycle/overlay packages and no application bypass files.

- [ ] **Step 10: Write preflight report**

Record all real results. Do not copy old evidence.

- [ ] **Step 11: Stop for device authorization**

Do not call HDC, install HAP, start the simulator, or run device acceptance until the user explicitly authorizes it.

---

### Task 7: Run Fresh Blank Debug and Release Acceptance

**Files:**
- Modify outside repository: fresh blank project build outputs only
- Create ignored evidence: `.tmp/sdk54/e2e/<run-id>/blank-result.json`

**Interfaces:**
- Consumes: Task 4 blank fixture and explicit device authorization.
- Produces: real Debug/Release HAP, bundle hashes, and page acceptance results.

- [ ] **Step 1: Request and record device authorization**

Authorization must explicitly cover HDC discovery, HAP build/install/start, and simulator interaction.

- [ ] **Step 2: Verify one target**

Run `hdc start -r` and `hdc list targets`. Stop on zero or ambiguous multiple targets unless the user selects one.

- [ ] **Step 3: Run Debug**

```bash
npx expo run:harmony
```

Verify official blank text, Debug `dev:true`, no embedded bundle, and no forbidden app-side workaround.

- [ ] **Step 4: Run clean Release**

```bash
npx expo run:harmony --configuration Release --no-build-cache
```

Verify HAP exists, embedded/source bundle hashes match, `dev:false`, and the same blank UI appears.

- [ ] **Step 5: Verify no-Metro cold start**

Stop Metro and cold launch from the simulator. Record the real result.

- [ ] **Step 6: Write blank result**

Include commands, target, HAP/bundle hashes, UI result, warnings, and limits.

---

### Task 8: Run Fresh Default + Router Debug and Release Acceptance

**Files:**
- Modify outside repository: fresh default project build outputs only
- Create ignored evidence: `.tmp/sdk54/e2e/<run-id>/default-result.json`

**Interfaces:**
- Consumes: Task 4 default fixture and the existing explicit device authorization.
- Produces: real Debug/Release Router/WebBrowser/page acceptance results.

- [ ] **Step 1: Run Debug**

```bash
npx expo run:harmony
```

Verify Welcome/Home/Explore, Tabs, MaterialIcons, RN Images, Modal, physical Back, one-level `dismissTo`, and one WebBrowser open/close.

- [ ] **Step 2: Run reload mode**

```bash
EXPO_HARMONY_METRO=1 npx expo start --dev-client --localhost --port 8081
npx expo run:harmony --no-bundler --port 8081
```

Press `r` in the Metro terminal and verify the application reloads.

- [ ] **Step 3: Run clean Release**

```bash
npx expo run:harmony --configuration Release --no-build-cache
```

Verify page/assets/fonts/Tabs, Modal, physical Back, one-level `dismissTo`, and two WebBrowser open/close rounds.

- [ ] **Step 4: Verify no-Metro cold start**

Stop Metro and cold launch. Verify Release still loads.

- [ ] **Step 5: Write default result**

Record exact interaction results and documented MVP limits. Do not claim expo-image, multi-level native dismiss, or complete OAuth support.

---

### Task 9: Seal the Migration Result

**Files:**
- Create: `docs/releases/2026-09-24-sdk54-create-app-mvp.md`
- Create: `docs/releases/2026-09-24-sdk54-create-app-mvp.json`
- Modify: `docs/designs/2026-09-24-sdk54-mvp-migration-design.md` only if measured limits require clarification

**Interfaces:**
- Consumes: staging manifest, preflight, blank result, and default result.
- Produces: the public migration acceptance report.

- [ ] **Step 1: Run final source gates**

```bash
pnpm sdk54:check
pnpm --filter expo-harmony-cli type-check
pnpm --filter expo-harmony-cli test
git diff --check
```

The CLI commands are regression-only; they do not authorize product-flow changes.

- [ ] **Step 2: Check repository cleanliness**

Verify no HAP/HAR/TGZ, fixture project, `node_modules`, `oh_modules`, build cache, local path, private registry, credential, or signing material is staged or unignored in the repository.

- [ ] **Step 3: Write JSON result**

Include `published: false`, 14/22/0/deterministic results, 25-package staging identity, both template results, HAP/bundle hashes, fixture substitutions, and documented limits.

- [ ] **Step 4: Write Markdown report**

Describe only evidence collected in this monorepo run. Reference the old guide as procedure background, not as new evidence.

- [ ] **Step 5: Report Git status and stop**

Keep the index empty. Do not commit or push without explicit authorization.

---

## Acceptance Matrix

| Requirement | Owning task | Evidence |
| --- | --- | --- |
| Current repository produces fresh fourteen Expo TGZ | Task 2 | Staging manifest with SHA-256 |
| Eleven external packages are exact and read-only | Task 2 | External archive manifest |
| Fresh official blank project | Task 4 | create-expo-app command and pre-modification manifest |
| Fresh official default Router project | Task 4 | create-expo-app command, entry and route files |
| No app-side bypass | Tasks 3, 6 | Fixture contract and filesystem scan |
| Blank Debug + clean Release | Task 7 | Device result and HAP/bundle hashes |
| Default Debug + reload + clean Release | Task 8 | UI/interaction result and hashes |
| Expo Image remains excluded | Tasks 3, 8, 9 | Two recorded RN Image substitutions only |
| `apps/cli` product behavior unchanged | Tasks 1, 9 | Git diff and regression tests |
| No publish or repository artifacts | All | `published: false`, final cleanliness scan |

## Execution Checkpoints

- Checkpoint A: after Task 3, review scope reconciliation, staging, and fixture transformation.
- Checkpoint B: after Task 6, review fresh project install/preflight before requesting device authorization.
- Checkpoint C: after Tasks 7–8, review blank/default Debug/Release results.
- Checkpoint D: after Task 9, review final report and Git status before any commit decision.
