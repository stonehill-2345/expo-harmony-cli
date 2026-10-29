# expo-asset 鸿蒙 shim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 CLI 基线 shim 机制中注入 expo-asset 降级 shim，消除鸿蒙 dev/release bundle 因 Expo.fx 副作用 `import 'expo-asset'` 触发 `requireNativeModule('ExpoAsset')` 导致的红屏。

**Architecture:** 复用 CLI 现有 metro alias shim 机制：新增 `content/shims/expo-asset.ts`（no-op Asset 类），`harmony-entry.ts` 基线 copy + alias-map 加条目，metro resolveRequest 对 harmony 平台把 `expo-asset` 重定向到 shim。与 expo-metro-runtime 同款基线注入。

**Tech Stack:** TypeScript（CLI 源）、Vitest（测试）、Expo SDK52、Metro 0.81.5。

**Spec:** `docs/superpowers/specs/2026-08-14-expo-asset-harmony-shim-design.md`

## Global Constraints

- **shim 路径**（逐字）：`content/shims/expo-asset.ts` —— 单文件 no-op（与 `expo-metro-runtime.ts` 一致）。
- **alias-map 条目**（逐字）：`'expo-asset': './shims/expo-asset.ts'`。
- **注入点**（硬约束）：`src/injector/harmony-entry.ts` 的 `writeHarmonyEntry` —— 无条件 copy shim + alias-map 初始条目（**基线注入**，非 scanAndAdapt 按需）。
- **不动 metro.config**：复用现有 resolveRequest（shimAliases 机制已就绪，见 `src/injector/metro-config.ts:49`）。
- **不引新依赖**：纯 JS shim。
- **三端正交**：alias 仅 `platform === 'harmony'` 分支生效，iOS/Android 零影响。
- **测试框架**：Vitest。实现后须全量测试通过 + `pnpm type-check` 干净 + `pnpm build` 成功。
- **提交策略**：遵循主公 CLAUDE.md 规则⑦——**不主动提交**。task 内**不执行 `git commit`**，由 controller 呈主公确认。

---

## File Structure

| 文件 | 职责 | 本 plan 改动 |
|---|---|---|
| `content/shims/expo-asset.ts` | expo-asset 鸿蒙降级 shim（no-op Asset 类 + useAssets） | 新增（+约 35 行）|
| `src/injector/harmony-entry.ts` | 基线 copy shim + alias-map 初始条目 | copy + 条目（+约 3 行）|
| `__tests__/injector.test.ts` | 验证 `injectHarmonyBaseline` 注入产物 | 现有用例加断言（+约 4 行）|

无删除文件、无新增依赖。

---

## Task 1: expo-asset shim 基线注入 + 注入器测试

**Files:**
- Create: `content/shims/expo-asset.ts`
- Modify: `src/injector/harmony-entry.ts`
- Test: `__tests__/injector.test.ts`（现有 `Harmony shims copy 到 shims/ + .alias-map.json 初始条目` 用例追加断言）

**Interfaces:**
- Consumes: 无（本 task 是 plan 首个且唯一代码 task）。
- Produces: `harmony-entry` 生成的项目 `shims/` 含 `expo-asset.ts` + `.alias-map.json` 含 `'expo-asset'` 条目；metro resolveRequest 自动把 harmony 平台的 `require('expo-asset')` 重定向到 shim（现有机制，无需改 metro.config）。

- [ ] **Step 1: 改测试，追加 expo-asset 断言（RED）**

对 `__tests__/injector.test.ts` 的 `Harmony shims copy 到 shims/ + .alias-map.json 初始条目` 用例（约第 208 行）做精确替换。

`old_string`（用例中段断言块，作为唯一锚点）：

```ts
    expect(fs.existsSync(path.join(tmp, 'shims/expo-metro-runtime.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'shims/expo-modules-core/NativeModulesProxy.ts'))).toBe(false);
    const aliasMap = JSON.parse(fs.readFileSync(path.join(tmp, 'shims/.alias-map.json'), 'utf8'));
    expect(aliasMap['@expo/metro-runtime']).toBe('./shims/expo-metro-runtime.ts');
    expect(Object.keys(aliasMap).some(key => key.startsWith('expo-modules-core'))).toBe(false);
```

`new_string`（插入 expo-asset 存在性 + alias-map 条目断言）：

```ts
    expect(fs.existsSync(path.join(tmp, 'shims/expo-metro-runtime.ts'))).toBe(true);
    // expo-asset 基线 shim（Expo.fx 启动硬依赖，所有 expo 鸿蒙项目都崩）
    expect(fs.existsSync(path.join(tmp, 'shims/expo-asset.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'shims/expo-modules-core/NativeModulesProxy.ts'))).toBe(false);
    const aliasMap = JSON.parse(fs.readFileSync(path.join(tmp, 'shims/.alias-map.json'), 'utf8'));
    expect(aliasMap['@expo/metro-runtime']).toBe('./shims/expo-metro-runtime.ts');
    expect(aliasMap['expo-asset']).toBe('./shims/expo-asset.ts');
    expect(Object.keys(aliasMap).some(key => key.startsWith('expo-modules-core'))).toBe(false);
```

- [ ] **Step 2: 跑测试确认 RED**

Run: `pnpm test -- injector`
Expected: `Harmony shims copy 到 shims/` 用例 FAIL（`shims/expo-asset.ts` 不存在 + `aliasMap['expo-asset']` 为 undefined），其余用例仍 PASS。

- [ ] **Step 3: 新增 `content/shims/expo-asset.ts`**

逐字写入（采用 spec §4.2 探针验证版）：

```ts
/**
 * expo-asset 鸿蒙降级 shim
 *
 * 根因：Expo SDK52 Expo.fx 聚合初始化顶层 `import 'expo-asset'`（副作用），
 * 触发入口 build/ExpoAsset.js 顶层 `requireNativeModule('ExpoAsset')`，
 * 鸿蒙 RNOH 无该原生模块 → 崩。
 *
 * 本 shim 提供 JS 层空实现，让 import 'expo-asset' 不触发原生模块调用。
 * 鸿蒙 app 用 react-native Image + require() 加载本地图片，不依赖 expo-asset
 * 的 Asset 类下载能力，故 no-op 降级不影响启动。
 */
export class Asset {
  uri = '';
  localUri?: string;
  width?: number;
  height?: number;
  downloaded = false;

  static async loadAsync(): Promise<Asset> {
    return new Asset();
  }
  static async fromMetadata(): Promise<Asset> {
    return new Asset();
  }
  async downloadAsync(): Promise<Asset> {
    this.downloaded = true;
    return this;
  }
}

// useAssets 返回空数组（而非 undefined），避免解构后 .map 二次崩溃
export const useAssets = (): [Asset[], null] => [[], null];

export default Asset;
```

- [ ] **Step 4: 改 `src/injector/harmony-entry.ts`（copy shim + alias-map 条目）**

两处精确替换。

替换一（copy shim，在 expo-metro-runtime copy 之后插入 expo-asset copy）：

`old_string`：

```ts
  fs.copyFileSync(
    path.join(shimsSrc, 'expo-metro-runtime.ts'),
    path.join(shimsDir, 'expo-metro-runtime.ts'),
  );
```

`new_string`：

```ts
  fs.copyFileSync(
    path.join(shimsSrc, 'expo-metro-runtime.ts'),
    path.join(shimsDir, 'expo-metro-runtime.ts'),
  );
  fs.copyFileSync(
    path.join(shimsSrc, 'expo-asset.ts'),
    path.join(shimsDir, 'expo-asset.ts'),
  );
```

替换二（alias-map 初始条目加 expo-asset）：

`old_string`：

```ts
  const aliasMap = {
    '@expo/metro-runtime': './shims/expo-metro-runtime.ts',
  };
```

`new_string`：

```ts
  const aliasMap = {
    '@expo/metro-runtime': './shims/expo-metro-runtime.ts',
    'expo-asset': './shims/expo-asset.ts',
  };
```

- [ ] **Step 5: 跑测试确认 GREEN + 全量回归**

Run: `pnpm test`
Expected: 全量通过（198 用例不回归，本 task 更新的 `Harmony shims copy` 用例 GREEN）。重点确认：
- `Harmony shims copy 到 shims/ + .alias-map.json 初始条目` 用例 PASS（expo-asset.ts 存在 + aliasMap['expo-asset'] === './shims/expo-asset.ts'）。
- setUpXHR 用例 `index.harmony.js 在 require @expo/metro-runtime 之前触发 RNOH setUpXHR` 仍 PASS（不回归）。

- [ ] **Step 6: type-check + build**

Run: `pnpm type-check && pnpm build`
Expected: type-check 干净（无报错）；build 成功（dist 重建）。

- [ ] **Step 7: 不提交（主公规则⑦）**

本 task 实现完成，**不执行 `git commit`**。工作树变动仅为 `content/shims/expo-asset.ts`（新增）+ `src/injector/harmony-entry.ts` + `__tests__/injector.test.ts`（+ dist 由 build 生成）。由 controller 呈主公确认提交方案。

---

## Task 2: 鸿蒙 dev / release bundle 实测 gate（主公环境，非自动化）

> 此 task 为端到端验证 gate，依赖主公本地鸿蒙设备/模拟器环境，subagent 无法自动执行。对应 spec §6（dev/release 实测）与 §7 R1（release 风险）。controller 在 Task 1 代码通过后，把本 task 交主公在 probe-metro 或新建注入项目执行。

**Files:** 无代码改动（验证 gate）。

**Prerequisites:** Task 1 已完成且全量测试/type-check/build 通过。鸿蒙设备已连接并开启调试（probe-metro 已具备）。

- [ ] **Step 1: dev bundle 实测（ExpoAsset 红屏应消失）**

主公在 probe-metro 验证：probe-metro 的 `shims/expo-asset.ts` + `.alias-map.json` 已含等效探针改动（探针阶段已加）。若用 CLI 重新注入 probe-metro，确认 `shims/expo-asset.ts` 与 `.alias-map.json` 含 `expo-asset` 条目。
Run: `pnpm start:harmony`，鸿蒙应用 reload。
Expected: 红屏**不再是** `Cannot find native module 'ExpoAsset'`。允许出现下一层 `Image: Cannot read property 'get' of undefined`（PixelRatio，spec §3 非目标，另起 spec）。只要 ExpoAsset 类原生模块缺失错误消失，即判定 dev gate 通过。（探针阶段已验证 ✅）

- [ ] **Step 2: release bundle 实测（R1 关键风险）**

验证 shim 在 offline release bundle 下生效（探针仅 dev 实测）。
在 probe-metro 或用 CLI 新建注入项目执行：
Run: `pnpm bundle:harmony:release`
Expected: bundle 生成成功，无 expo-asset 相关构建错误。把生成的 offline bundle 部署到鸿蒙设备运行，确认：
- 不出现 expo-asset 相关新红屏（如 `Cannot find native module 'ExpoAsset'` 再次出现，说明 release 下 alias 未生效）。
- 若出现 shim 在 release 下不可用的情况，记录具体错误，触发回退评估（spec §7 R1）。

- [ ] **Step 3: 三端正交确认**

确认 android/ios bundle 不受影响（alias 仅 harmony 分支）：
Run: `pnpm start`（普通 Expo 三端）+ 分别请求 android/ios bundle。
Expected: android/ios 正常加载原 expo-asset 包（其有原生实现），不报 shim 相关错误。

- [ ] **Step 4: 记录实测结论**

主公把 dev/release/三端实测结果反馈 controller，controller 记入 SDD ledger，据此决定是否呈主公提交。

---

## Self-Review

**1. Spec coverage:**
- spec §2 根因（Expo.fx 副作用 import → requireNativeModule）→ Task 1 shim 注释 + Task 2 Step 1 体现 ✅
- spec §3 目标（expo-asset 崩溃消除、复用 shim 机制、三端零影响）→ Task 1 改动 + Global Constraints ✅
- spec §3 非目标（Image/PixelRatio、真实下载）→ Task 2 Step 1 明确"允许 Image" ✅
- spec §4.1（基线注入非按需）→ Global Constraints + File Structure ✅
- spec §4.2（shim 内容 + harmony-entry copy + alias-map + 测试）→ Task 1 Step 3/4/1 逐字覆盖 ✅
- spec §4.3（alias 生效路径，复用 resolveRequest）→ Global Constraints"不动 metro.config" ✅
- spec §5 改动文件（shim + harmony-entry + test）→ File Structure + Task 1 ✅
- spec §6 验证策略（根因/alias 已过；单测/dev/release/三端）→ Task 1 Step 5/6（单测）+ Task 2（dev/release/三端）✅
- spec §7 R1（release 实测）→ Task 2 Step 2 ✅；R2（Asset.loadAsync 降级）/R3（子路径）→ Global Constraints + spec 已注 ✅
- spec §8 测试用例（shim 存在 + alias-map 条目）→ Task 1 Step 1 测试代码逐字覆盖 ✅
- spec §10 验收标准 → Task 1（前 3 项）+ Task 2（后 3 项）全覆盖 ✅

**2. Placeholder scan:** 无 TBD/TODO；shim 代码、harmony-entry old/new_string、测试 old/new_string、验证命令均逐字给出。Task 2 是手动 gate，步骤为可执行命令 + 明确 expected，非占位。✅

**3. Type consistency:** Task 1 测试中 `aliasMap`（JSON.parse 对象）、键名字符串 `'expo-asset'` 与 harmony-entry.ts 的 aliasMap 键名逐字一致；shim 文件路径 `content/shims/expo-asset.ts` 与 copy 目标 `expo-asset.ts`、alias-map 值 `'./shims/expo-asset.ts'` 三处一致。✅

无 gap、无占位符、路径/键名一致。Plan 完成。
