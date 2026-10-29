# 鸿蒙 InitializeCore 入口预热 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把鸿蒙入口模板的 `setUpXHR` require 升级为 `InitializeCore` require，预热整套 RN 核心模块图，消除 Image/PixelRatio 渲染期 `.default` undefined 白屏。

**Architecture:** CLI 的 `metro-config.ts` 叠加 RNOH 配置时只取 resolver、丢弃了 serializer（`getModulesRunBeforeMainModule → InitializeCore`）。iOS/Android 由 RN Metro 自动预热 InitializeCore，harmony 靠 RNOH serializer 显式做、CLI 丢了。`setUpXHR`（9e1f8d4）只是 InitializeCore 第 38 行的子集。修复在入口模板（`content/templates/index.harmony.js`）显式 require InitializeCore（内含 setUpXHR + 全套核心预热），替换原 setUpXHR。已 probe-metro 探针验证：入口 require InitializeCore → 白屏消失、Image 正常渲染。

**Tech Stack:** TypeScript（CLI 源）、Vitest（测试）、CLI 内容模板机制（`content/templates/` → `harmony-entry.ts` 注入项目 `index.harmony.js`）、RNOH 0.77.71（`@react-native-oh/react-native-harmony/Libraries/Core/InitializeCore`）。

## Global Constraints

- **替换非补充**：入口模板把 setUpXHR require **替换**为 InitializeCore require（InitializeCore 第 38 行 `require('./setUpXHR')` 内含 setUpXHR，Web 全局副作用等价）。**不**保留单独的 setUpXHR require（语义冗余）。
- **InitializeCore 路径（verbatim）**：`@react-native-oh/react-native-harmony/Libraries/Core/InitializeCore`
- **require 顺序约束**：InitializeCore require 必须在 `require('@expo/metro-runtime')` 之前（InitializeCore 内含 setUpXHR，Winter 兼容层引用全局 FormData，须先注入）。
- **setUpXHR 不再单独出现**：入口模板不得含 `require('@react-native-oh/react-native-harmony/Libraries/Core/setUpXHR')`（断言 `not.toContain`）。
- **iOS/Android 零影响**：`index.harmony.js` 是鸿蒙专属入口（iOS/Android 走 `index.ts` → registerRootComponent），三端 bundle 不含此 require。
- **规则⑦（不主动提交）**：实现者完成改动后 `git add` 暂存、**不 commit**，由 controller 转主公审；commit 时机由主公决定。
- **测试框架**：Vitest（`pnpm test` = `vitest run`）；type-check（`pnpm type-check` = `tsc --noEmit`）；build（`pnpm build` = `tsc -p tsconfig.json`）。
- **工作目录**：CLI repo `/Users/wum/2345/expo-harmony-cli`，分支 `feat/combine8081`（无 worktree；本 plan 在隔离分支执行）。

---

### Task 1: 入口模板 setUpXHR → InitializeCore + 回归测试 + setUpXHR spec 补注

**Files:**
- Modify: `content/templates/index.harmony.js:55-59`（setUpXHR require → InitializeCore require + 注释）
- Modify: `__tests__/injector.test.ts:178-189`（setUpXHR 回归用例 → InitializeCore 用例）
- Modify: `docs/superpowers/specs/2026-08-13-harmony-web-globals-init-design.md`（补注 InitializeCore 演进）

**Interfaces:**
- Consumes: `injectHarmonyBaseline(tmp, { slug, scheme })`（来自 `src/injector`，已有；写入 `index.harmony.js` 到 tmp）。`writeHarmonyEntry`（`src/injector/harmony-entry.ts:5`）从 `content/templates/index.harmony.js` 读模板、替换 `{{scheme}}` 后写出。
- Produces: 入口模板含 `require('@react-native-oh/react-native-harmony/Libraries/Core/InitializeCore')`，不含单独 setUpXHR require。下游（probe-metro/用户项目）经 prebuild 注入此入口，获得 InitializeCore 预热。

**背景（给无上下文的实现者）：**
- `content/templates/index.harmony.js` 是 CLI 注入到鸿蒙项目的入口模板。`src/injector/harmony-entry.ts` 的 `writeHarmonyEntry` 读取它、替换 `{{scheme}}` 后写入项目根。
- 当前第 59 行 `require('@react-native-oh/react-native-harmony/Libraries/Core/setUpXHR')` 只预热 Web 全局（FormData/Blob/fetch 等）。`InitializeCore`（同目录上一级 `Core/InitializeCore.js`）按序 require setUpGlobals/setUpDOM/setUpTimers/**setUpXHR**/setUpPlatform/AppRegistry 等，预热整套核心模块图——它的第 38 行就是 `require('./setUpXHR')`，所以替换 setUpXHR 后 Web 全局仍被注入，无回归。
- 根因（已探针验证，详见 spec `docs/superpowers/specs/2026-08-14-harmony-initializecore-design.md`）：CLI metro-config 丢 RNOH serializer 的 InitializeCore 预热，导致核心模块求值顺序异常、渲染期 PixelRatio/Dimensions `.default` undefined → Image 白屏。入口显式 require InitializeCore 已在 probe-metro 验证可消除白屏。

- [ ] **Step 1: 写失败测试（改 injector.test.ts setUpXHR 用例 → InitializeCore）**

在 `__tests__/injector.test.ts`，定位第 178-189 行现有用例：

```ts
  it('index.harmony.js 在 require @expo/metro-runtime 之前触发 RNOH setUpXHR（注入 Web 全局）', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    const entry = fs.readFileSync(path.join(tmp, 'index.harmony.js'), 'utf8');
    // setUpXHR require 必须存在
    expect(entry).toContain("require('@react-native-oh/react-native-harmony/Libraries/Core/setUpXHR')");
    // 且必须在 require('@expo/metro-runtime') 之前：Winter 兼容层引用全局 FormData，setUpXHR 须先执行
    const setUpXHRIdx = entry.indexOf('@react-native-oh/react-native-harmony/Libraries/Core/setUpXHR');
    const metroRuntimeIdx = entry.indexOf("require('@expo/metro-runtime')");
    expect(setUpXHRIdx).toBeGreaterThan(-1);
    expect(metroRuntimeIdx).toBeGreaterThan(-1);
    expect(setUpXHRIdx).toBeLessThan(metroRuntimeIdx);
  });
```

替换为（注意：`not.toContain` setUpXHR 锁定"替换非补充"语义）：

```ts
  it('index.harmony.js 在 require @expo/metro-runtime 之前预热 RNOH InitializeCore（核心初始化，含 setUpXHR）', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    const entry = fs.readFileSync(path.join(tmp, 'index.harmony.js'), 'utf8');
    // InitializeCore 预热 RN 核心模块图（含 setUpXHR 注入 Web 全局），消除 Image/PixelRatio 渲染期 .default undefined
    expect(entry).toContain("require('@react-native-oh/react-native-harmony/Libraries/Core/InitializeCore')");
    // setUpXHR 不再单独 require（InitializeCore 第38行内含 setUpXHR，替换非补充）
    expect(entry).not.toContain("require('@react-native-oh/react-native-harmony/Libraries/Core/setUpXHR')");
    // 且必须在 require('@expo/metro-runtime') 之前：InitializeCore 含 setUpXHR，Winter 引用全局 FormData 须先注入
    const initCoreIdx = entry.indexOf('@react-native-oh/react-native-harmony/Libraries/Core/InitializeCore');
    const metroRuntimeIdx = entry.indexOf("require('@expo/metro-runtime')");
    expect(initCoreIdx).toBeGreaterThan(-1);
    expect(metroRuntimeIdx).toBeGreaterThan(-1);
    expect(initCoreIdx).toBeLessThan(metroRuntimeIdx);
  });
```

- [ ] **Step 2: 跑测试验证 RED**

Run: `pnpm test -- __tests__/injector.test.ts`
Expected: FAIL。失败原因：模板仍是 setUpXHR，新断言 `toContain('.../Core/InitializeCore')` 不满足；`not.toContain('.../Core/setUpXHR')` 也不满足（当前含 setUpXHR）。

- [ ] **Step 3: 实现模板改动（setUpXHR → InitializeCore + 注释）**

在 `content/templates/index.harmony.js`，定位第 55-59 行：

```js
// ===== 2.5 RN Harmony 全局初始化：注入 FormData/Blob/File/Headers/fetch/XMLHttpRequest/URL 等 Web 全局 =====
// RNOH 的 setUpXHR 一次性 polyfill 这些全局；鸿蒙入口需显式触发
// （iOS/Android 由 RN Metro runBeforeMainModule 自动注入 InitializeCore→setUpXHR）。
// 必须在 require expo/expo-router（其触发 Winter 兼容层、引用全局 FormData）之前执行。
require('@react-native-oh/react-native-harmony/Libraries/Core/setUpXHR');
```

替换为：

```js
// ===== 2.5 RN Harmony 核心初始化：预热 RN 核心模块图（含 Web 全局）=====
// InitializeCore = RN 核心初始化（setUpGlobals/setUpDOM/setUpTimers/setUpXHR/setUpPlatform/AppRegistry 等），
// 按序预热核心模块，建立稳定求值顺序（iOS/Android 由 Metro runBeforeMainModule 自动执行）。
// 鸿蒙 CLI 的 metro-config 仅叠加 RNOH resolver、未带 RNOH serializer(InitializeCore)，故入口显式预热。
// 必须在 require expo/expo-router 之前：InitializeCore 内含 setUpXHR，注入 Winter 引用的全局 FormData。
require('@react-native-oh/react-native-harmony/Libraries/Core/InitializeCore');
```

- [ ] **Step 4: 跑测试验证 GREEN**

Run: `pnpm test -- __tests__/injector.test.ts`
Expected: PASS（全量 injector.test 用例通过，含新 InitializeCore 用例）。

- [ ] **Step 5: type-check + build 干净**

Run: `pnpm type-check && pnpm build`
Expected: 两者均无报错退出（type-check 无 TS 错误；build 产出 dist/）。注：dist/ 与 docs/superpowers/ 均 gitignored，不进版本库。

- [ ] **Step 6: setUpXHR spec 补注（InitializeCore 演进）**

在 `docs/superpowers/specs/2026-08-13-harmony-web-globals-init-design.md` 文件**末尾**追加一节（保留 setUpXHR spec 原文，仅追加演进说明）：

```markdown

---

## 演进记录（2026-08-14）

本 spec 的 setUpXHR 入口预热已**升级为 InitializeCore**（见 `docs/superpowers/specs/2026-08-14-harmony-initializecore-design.md`）。

- `InitializeCore`（`@react-native-oh/react-native-harmony/Libraries/Core/InitializeCore`）按序 require setUpGlobals/setUpDOM/setUpTimers/**setUpXHR**/setUpPlatform/AppRegistry 等，预热整套核心模块图。
- setUpXHR（本 spec 主题）是 InitializeCore 第 38 行的**子集**。CLI 入口模板已把 `require('.../Core/setUpXHR')` 替换为 `require('.../Core/InitializeCore')`（替换非补充），Web 全局仍由 setUpXHR 覆盖，且额外消除 Image/PixelRatio 渲染期 `.default` undefined 白屏（CLI metro-config 丢 RNOH serializer 的 InitializeCore 预热所致）。
```

- [ ] **Step 7: 暂存（规则⑦：不主动提交）**

Run: `git add content/templates/index.harmony.js __tests__/injector.test.ts docs/superpowers/specs/2026-08-13-harmony-web-globals-init-design.md`

**不执行 `git commit`**（规则⑦）。报告改动文件 + 测试结果，由 controller 转主公审，commit 时机由主公决定。

---

## Self-Review（writing-plans 自检）

**1. Spec coverage**（对照 spec `2026-08-14-harmony-initializecore-design.md`）：
- §4.2 A（模板 setUpXHR→InitializeCore）→ Task 1 Step 3 ✓
- §4.2 B（injector.test 断言升级）→ Task 1 Step 1 ✓
- §4.2 C（setUpXHR spec 补注）→ Task 1 Step 6 ✓
- §8 测试用例（RED→GREEN，含 not.toContain setUpXHR + 顺序断言）→ Task 1 Step 1/2/4 ✓
- §10 验收（type-check/build）→ Task 1 Step 5 ✓
- 记忆更新（spec §5 C 提及 `harmony-runtime-winter-formdata.md`）→ 非实现者职责（记忆在 `~/.claude/`，非 repo），由 controller 在实现完成后更新，不写入本 plan 的实现 task ✓
- §6 release 实测（R3）→ 非本 plan 范围（与 expo-asset release gate 合并做，主公环境），spec §6 已标注"待实现" ✓

**2. Placeholder scan**：无 TBD/TODO；每步含具体代码块或命令 ✓

**3. Type consistency**：`InitializeCore` 路径字符串、`not.toContain(setUpXHR)`、`{{scheme}}` 占位、`injectHarmonyBaseline` 签名在各步一致 ✓

无遗留问题。
