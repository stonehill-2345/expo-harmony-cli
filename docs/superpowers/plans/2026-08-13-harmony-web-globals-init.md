# 鸿蒙运行时 Web 全局对象补全 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在鸿蒙入口模板 `index.harmony.js` 显式触发 RNOH 的 `setUpXHR`，注入 FormData/Blob/File 等 Web 标准全局，消除 Expo SDK52 Winter 兼容层引用全局 FormData 导致的红屏。

**Architecture:** iOS/Android 由 RN Metro 的 `runBeforeMainModule` 自动执行 `InitializeCore.js`→`setUpXHR` 注入 Web 全局；鸿蒙 RNOH 无此自动机制，入口也未 require，故全局 FormData 等缺失。修复 = 在 CLI 模板入口的 `window.location` polyfill 之后、`require('@expo/metro-runtime')` 之前插入一行 `require('@react-native-oh/react-native-harmony/Libraries/Core/setUpXHR')`。setUpXHR 一次性 polyfill 全部 Web 标准全局，职责单一、实测安全，优于整包 require InitializeCore。

**Tech Stack:** TypeScript（CLI 源）、Vitest（测试）、Expo SDK52、@react-native-oh/react-native-harmony@0.77.71、Metro 0.81.5。

**Spec:** `docs/superpowers/specs/2026-08-13-harmony-web-globals-init-design.md`

## Global Constraints

- **setUpXHR 路径**（逐字）：`@react-native-oh/react-native-harmony/Libraries/Core/setUpXHR` —— 子路径 require，RNOH 0.77.71 无 `exports` 字段，已 `require.resolve` 验证可解析。
- **插入位置**（硬约束）：`content/templates/index.harmony.js` 的 `window.location` polyfill（§2）之后、`require('@expo/metro-runtime')`（§3）**之前**。setUpXHR 必须先于 metro-runtime/expo-router 执行（Winter 引用全局 FormData）。
- **不引新依赖**：`@react-native-oh/react-native-harmony@0.77.71` 已是 CLI 注入依赖。
- **不动 metro.config、不加 shim 文件**：改动仅收敛在 `index.harmony.js` 模板 + 测试。
- **三端正交**：`index.harmony.js` 是 `.harmony.js` sourceExt 专属入口，iOS/Android 走 `index.ts`，零影响。
- **测试框架**：Vitest。实现后须全量测试通过 + `pnpm type-check` 干净 + `pnpm build` 成功。
- **提交策略**：遵循主公 CLAUDE.md 规则⑦——**不主动提交**。subagent 实现完成后由 controller 呈主公确认是否提交，task 内**不执行 `git commit`**。

---

## File Structure

| 文件 | 职责 | 本 plan 改动 |
|---|---|---|
| `content/templates/index.harmony.js` | 鸿蒙 dev/release bundle 入口模板；聚合早期全局 polyfill（expo globals / window.location / setUpXHR）后委托 expo-router | 插入 §2.5 setUpXHR require（+5 行） |
| `__tests__/injector.test.ts` | 验证 `injectHarmonyBaseline` 注入产物正确性 | 新增 1 用例（setUpXHR 存在 + 顺序） |

无新增文件、无删除文件。

---

## Task 1: 模板注入 setUpXHR + 注入器测试

**Files:**
- Modify: `content/templates/index.harmony.js`（在 `window.location` polyfill 之后、`// ===== 3. Metro runtime` 之前插入 §2.5）
- Test: `__tests__/injector.test.ts`（在 `index.harmony.js {{scheme}} 替换` 用例之后新增用例，即第 176 行 `});` 之后）

**Interfaces:**
- Consumes: 无（本 task 是 plan 的首个且唯一代码 task）。
- Produces: `content/templates/index.harmony.js` 含 `require('@react-native-oh/react-native-harmony/Libraries/Core/setUpXHR')`，位置先于 `require('@expo/metro-runtime')`。

- [ ] **Step 1: 写失败测试**

在 `__tests__/injector.test.ts` 第 176 行（`index.harmony.js {{scheme}} 替换` 用例的闭合 `});`）之后、第 178 行（`默认模板移除 Expo Vector Icons` 用例）之前，插入新用例：

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

- [ ] **Step 2: 跑测试确认 RED**

Run: `pnpm test -- injector`
Expected: 新用例 FAIL（`expect(entry).toContain(...setUpXHR...)` 失败，模板尚无 setUpXHR），其余用例仍 PASS。

- [ ] **Step 3: 改模板，插入 §2.5 setUpXHR require**

对 `content/templates/index.harmony.js` 做精确替换。

`old_string`（window.location polyfill 闭合 + §3 注释开头，作为唯一锚点）：

```js
  };
}

// ===== 3. Metro runtime + expo-router bootstrap =====
```

`new_string`：

```js
  };
}

// ===== 2.5 RN Harmony 全局初始化：注入 FormData/Blob/File/Headers/fetch/XMLHttpRequest/URL 等 Web 全局 =====
// RNOH 的 setUpXHR 一次性 polyfill 这些全局；鸿蒙入口需显式触发
// （iOS/Android 由 RN Metro runBeforeMainModule 自动注入 InitializeCore→setUpXHR）。
// 必须在 require expo/expo-router（其触发 Winter 兼容层、引用全局 FormData）之前执行。
require('@react-native-oh/react-native-harmony/Libraries/Core/setUpXHR');

// ===== 3. Metro runtime + expo-router bootstrap =====
```

- [ ] **Step 4: 跑测试确认 GREEN + 全量回归**

Run: `pnpm test`
Expected: 全量通过（本 task 新增 1 用例 GREEN，原 197 用例不回归 → 198 用例全过）。重点确认：
- 新用例 `index.harmony.js 在 require @expo/metro-runtime 之前触发 RNOH setUpXHR` PASS。
- 原 `index.harmony.js {{scheme}} 替换 + 含 globalThis.expo polyfill` 用例仍 PASS（未破坏模板其余结构）。

- [ ] **Step 5: type-check + build**

Run: `pnpm type-check && pnpm build`
Expected: type-check 干净（无报错）；build 成功（dist 重建，产物含 setUpXHR）。

- [ ] **Step 6: 产物核验（可选但推荐）**

确认 dist 产物模板已含改动：
Run: `grep -n "setUpXHR" dist/content/templates/index.harmony.js* 2>/dev/null || grep -rn "setUpXHR" dist/ | head`
Expected: 命中 setUpXHR（build 已把模板打包进 dist）。

- [ ] **Step 7: 不提交（主公规则⑦）**

本 task 实现完成，**不执行 `git commit`**。工作树变动仅为 `content/templates/index.harmony.js` + `__tests__/injector.test.ts`（+ dist 由 build 生成）。由 controller 呈主公确认提交方案。

---

## Task 2: 鸿蒙 dev / release bundle 实测 gate（主公环境，非自动化）

> 此 task 为端到端验证 gate，依赖主公本地鸿蒙设备/模拟器环境，subagent 无法自动执行。对应 spec §6（dev/release 实测）与 §7 R1（release 风险）。controller 在 Task 1 代码通过后，把本 task 交主公在 probe-metro 或新建注入项目执行。

**Files:** 无代码改动（验证 gate）。

**Prerequisites:** Task 1 已完成且全量测试/type-check/build 通过。鸿蒙设备已 USB/无线连接并开启调试（probe-metro 已具备）。

- [ ] **Step 1: dev bundle 实测（FormData 红屏应消失）**

主公在 probe-metro（其 `index.harmony.js` 已含等效 setUpXHR 探针）执行：
Run: `pnpm start:harmony`，鸿蒙应用 reload。
Expected: 红屏**不再是** `ReferenceError: Property 'FormData' doesn't exist`。允许出现下一层 `Cannot find native module 'ExpoAsset'`（spec §3 非目标，另起 spec）。只要 FormData 类全局缺失错误消失，即判定 dev gate 通过。

- [ ] **Step 2: release bundle 实测（R1 关键风险）**

验证 setUpXHR 在 offline release bundle 下可执行（探针仅在 dev 实测过）。
在 probe-metro 或用 CLI 新建注入项目执行：
Run: `pnpm bundle:harmony:release`
Expected: bundle 生成成功，无 setUpXHR 相关构建错误。把生成的 offline bundle 部署到鸿蒙设备运行，确认：
- 不出现 setUpXHR 内部依赖缺失导致的新红屏（如 `XXX is not defined` 指向 setUpXHR 注入路径）。
- 若出现 setUpXHR 在 release 下不可用的情况，记录具体错误，触发回退评估（spec §7 R1：改用更细粒度的 FormData 单点 polyfill），不强行合并。

- [ ] **Step 3: 三端正交确认**

确认 android/ios bundle 不受影响（入口文件隔离）：
Run: `pnpm start`（普通 Expo 三端）+ 分别请求 android/ios bundle。
Expected: android/ios 正常加载，不报 setUpXHR 相关错误（`index.harmony.js` 不被 android/ios 加载）。

- [ ] **Step 4: 记录实测结论**

主公把 dev/release/三端实测结果反馈 controller，controller 记入 SDD ledger，据此决定是否呈主公提交。

---

## Self-Review

**1. Spec coverage:**
- spec §2 根因 → Task 1 注释 + 插入位置体现 ✅
- spec §3 目标（Web 全局补全、收敛在模板、无新依赖、三端零影响）→ Task 1 改动 + Global Constraints ✅
- spec §3 非目标（ExpoAsset/release 原生实现）→ Task 2 Step 1 明确"允许 ExpoAsset" ✅
- spec §4 方案（§2 与 §3 之间插入 setUpXHR）→ Task 1 Step 3 精确 old/new_string ✅
- spec §4.3（用 setUpXHR 非 InitializeCore）→ Global Constraints + Architecture ✅
- spec §5 改动文件（模板 + 测试）→ File Structure + Task 1 ✅
- spec §6 验证策略（根因/子路径已过；单测/dev/release/三端）→ Task 1 Step 4-6（单测）+ Task 2（dev/release/三端）✅
- spec §7 R1（release 实测）→ Task 2 Step 2 ✅；R2（exports 残余）→ Global Constraints 已注 ✅
- spec §8 测试用例（存在 + 顺序 + 不回归）→ Task 1 Step 1 测试代码逐字覆盖 ✅
- spec §10 验收标准 → Task 1（前 2 项）+ Task 2（后 3 项）全覆盖 ✅

**2. Placeholder scan:** 无 TBD/TODO；测试代码、模板 old/new_string、验证命令均逐字给出。Task 2 是手动 gate，步骤为可执行的具体命令 + 明确 expected，非占位。✅

**3. Type consistency:** Task 1 测试中 `entry`（string）、`indexOf` 比较与现有用例（`fs.readFileSync(..., 'utf8')`）一致；模板插入字符串与 Global Constraints 的 setUpXHR 路径逐字一致。✅

无 gap、无占位符、类型一致。Plan 完成。
