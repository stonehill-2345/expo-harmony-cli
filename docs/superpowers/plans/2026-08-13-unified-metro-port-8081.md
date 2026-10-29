# 三端统一 8081 Metro 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Android / iOS / Harmony 三端对外统一使用 8081 端口，单 Metro 进程按请求级 `platform` 参数分流 resolver，支持三端同时联调。

**Architecture:** 废弃 metro.config.js 的进程级 `RN_BUNDLE_PLATFORM` if/else 分流，改为始终以 Expo 基线 + 字段级合并 RNOH 的 `platforms`/`sourceExts`/`resolveRequest`，在 `resolveRequest` 内按双保险条件 `platform === 'harmony' || process.env.RN_BUNDLE_PLATFORM === 'harmony'` 分流（开发态 start-harmony 不注入 RN_BUNDLE_PLATFORM，故三端靠 platform 参数分流、alias 只对 harmony 生效；离线 bundle 脚本注入 RN_BUNDLE_PLATFORM 作为 release 兜底，消除「bundle-harmony 是否传 platform」的未实证风险）。Harmony 端口从 8888 统一回 8081，hdc 转发简化为单条 `8081→8081`。

**Tech Stack:** TypeScript 5.3、Vitest 2.1、Metro 0.81.5、Expo SDK 52.0.49、@react-native-oh/react-native-harmony 0.77.71、React Native 0.77.1。

**Spec:** `docs/superpowers/specs/2026-08-13-unified-metro-port-8081-design.md`

## Global Constraints

- RNOH 锁定 `0.77.71`，RN `0.77.1`，Expo `52.0.49`（见 `src/version-matrix.ts`，不得改动版本号）。
- 三端对外端口统一 `8081`，全仓不得再出现开发态 `8888`。
- `metro.config.js` 必须保留 `// expo-harmony-cli:managed` 标记，供旧项目升级识别。
- 离线 bundle 脚本（`bundle-harmony-dev`/`bundle-harmony-release`）**必须保留** `RN_BUNDLE_PLATFORM: 'harmony'`。
- 开发态 Metro（`start-harmony.js`）**不得**再注入 `RN_BUNDLE_PLATFORM`。
- `alias-map`（shimAliases）只在 harmony 分支生效，android/ios 零污染。
- metro.config `resolveRequest` 用**双保险条件** `platform === 'harmony' || process.env.RN_BUNDLE_PLATFORM === 'harmony'`：开发态（无该环境变量）纯 platform 参数分流保证三端不串味，离线 bundle 脚本注入它作为 release bundle 兜底（Task 1 实证：bundle-harmony 是否传 platform 无 0.77.71 源码实证，兜底消除该风险）。
- `hdc` 缺失或 `rport` 失败时 `start-harmony.js` 硬失败（非零退出），不得 warning 后继续。
- 中文 commit message，遵循 Conventional Commits（项目惯例）。
- 未经主公指示不得 `git commit`/`git push`；计划内 commit 步骤需主公确认后执行。

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `src/injector/metro-config.ts` | 写出 `metro.config.js` 模板，请求级分流 | 改（核心） |
| `src/harmony-project/templates/EntryIndexTemplate.ts` | ArkTS `Index.ets` 模板，含 Metro bundle URL 默认地址 | 改（端口+platform） |
| `src/injector/start-harmony.ts` | 写出 `scripts/start-harmony.js`，启 Metro + hdc + 复用探测 | 改（端口/hdc/env/硬失败/复用） |
| `src/tips.ts` | `create.complete` 提示文案 | 改 |
| `content/docs/HARMONY.md`、`content/docs/TROUBLESHOOTING.md`、`README.md`、`docs/guide.md` | 端口文档 | 改 |
| `__tests__/injector.test.ts` | metro 分流 + start-harmony 字符串断言 | 改 |
| `src/harmony-project/templates/__tests__/templates.test.ts` | EntryIndexTemplate 断言 | 改 |
| `src/harmony-project/__tests__/pack-files.test.ts` | pack 产物 EntryIndex 断言（函数名+值） | 改 |
| `src/harmony-project/__tests__/standalone.test.ts` | Index.ets localhost 断言 | 改 |
| `__tests__/pack-files.test.ts` | pack 产物 start-harmony hdc 断言 | 改 |

---

## Task 1: 验证 gate — 读 RNOH metro.config 源码确认 resolver 字段

**目的：** spec 第 6 节强制要求。动手写 Task 2 前先拿到 `createHarmonyMetroConfig` 实际返回的 resolver 字段集合，精修字段级合并清单，避免漏字段导致 Harmony 平台/扩展名无法识别。

**Files:** 无代码改动，产出一份字段记录（写入本 plan 末尾「验证记录」区，或直接据其精修 Task 2 模板）。

- [ ] **Step 1: 定位一个已生成且装好依赖的项目**

在任意一个用本 CLI 创建、执行过 `prebuild --platform harmony` 且 `pnpm install` 的项目中操作。若手头没有，临时创建：

```bash
cd /tmp && npx expo-harmony-cli create probe-metro && cd probe-metro
pnpm install
pnpm dlx expo-harmony-cli prebuild --platform harmony
```

- [ ] **Step 2: 读取 createHarmonyMetroConfig 源码**

```bash
cat node_modules/@react-native-oh/react-native-harmony/metro.config.js
```

记录该函数返回 config 对象里 `resolver` 下的**全部字段**（重点关注：`platforms`、`sourceExts`、`resolveRequest`、`nodeModulesPaths`、`resolverMainFields`、`resolveRequest` 之外是否有 `extraNodeModules` 等）。

- [ ] **Step 3: 据发现精修 Task 2 的字段清单**

- 若返回值含 `platforms`、`sourceExts`、`resolveRequest` 之外的 resolver 字段，在 Task 2 模板的「resolver 级字段叠加」段补上对应合并行。
- 若 `resolveRequest` 为空（依赖配置对象其他字段实现 harmony 解析），记下并据此调整 Task 2 的兜底逻辑。
- 若发现 `createHarmonyMetroConfig` 内部已 `getDefaultConfig` 并返回完整 config（而非增量），确认叠加方式仍正确。

- [ ] **Step 4: 记录结论**

把实际字段清单写进本 plan 的「Task 1 验证记录」区（文末），作为 Task 2 的实现依据。无代码提交。

---

## Task 2: metro.config.js 请求级分流（核心）

**Files:**
- Modify: `src/injector/metro-config.ts`（`METRO_CONFIG_JS` 模板常量整体替换）
- Test: `__tests__/injector.test.ts`（`metro.config.js 使用 resolveRequest...` 用例改写）

**Interfaces:**
- Produces: 生成的 `metro.config.js` 导出单一 config，resolver.resolveRequest 按 `platform` 分流；不再读 `RN_BUNDLE_PLATFORM`。

- [ ] **Step 1: 改测试断言为「请求级分流」（先红）**

打开 `__tests__/injector.test.ts`，定位 `it('metro.config.js 使用 resolveRequest 应用 shim alias', ...)`（约 197 行），替换为：

```ts
  it('metro.config.js 请求级 platform 分流，alias 只对 harmony 生效，废弃进程级 RN_BUNDLE_PLATFORM', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    const metro = fs.readFileSync(path.join(tmp, 'metro.config.js'), 'utf8');
    // 请求级分流：platform 条件分支
    expect(metro).toContain("platform === 'harmony'");
    expect(metro).toContain('resolveRequest(context, moduleName, platform)');
    // alias 仅在 harmony 分支内
    expect(metro).toContain('shimAliases[moduleName]');
    expect(metro).toContain('resolveAliasTarget(aliasTarget)');
    // 字段级合并：叠加 platforms 与 sourceExts
    expect(metro).toContain('baseConfig.resolver.platforms');
    expect(metro).toContain('baseConfig.resolver.sourceExts');
    // harmony resolver 兜底
    expect(metro).toContain('harmonyConfig.resolver?.resolveRequest');
    expect(metro).toContain('resolveWithHarmony(context, moduleName, platform)');
    // @/ 别名
    expect(metro).toContain("moduleName.startsWith('@/')");
    expect(metro).toContain('path.resolve(__dirname, moduleName.slice(2))');
    // 双保险：platform 参数 + 离线 RN_BUNDLE_PLATFORM 兜底
    expect(metro).toContain("platform === 'harmony'");
    expect(metro).toContain("process.env.RN_BUNDLE_PLATFORM === 'harmony'");
    // 废弃进程级 if/else 分流
    expect(metro).not.toContain('isHarmonyBundle');
    expect(metro).not.toContain('alias: shimAliases');
  });
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm vitest run __tests__/injector.test.ts -t "请求级 platform 分流"`
Expected: FAIL（当前模板缺 `platform === 'harmony'` 分流分支、`baseConfig.resolver.platforms` 字段叠加；进程级 if/else 仍在）。

- [ ] **Step 3: 替换 METRO_CONFIG_JS 模板（据 Task 1 字段清单，默认按 platforms/sourceExts/resolveRequest；若 Task 1 发现更多字段在此补行）**

打开 `src/injector/metro-config.ts`，把整个 `const METRO_CONFIG_JS = ...;`（第 5–59 行）替换为：

```ts
const METRO_CONFIG_JS = `${METRO_CONFIG_MARKER}
const path = require('path');
const { mergeConfig } = require('@react-native/metro-config');

process.env.EXPO_ROUTER_APP_ROOT = path.resolve(__dirname, 'app');

const { getDefaultConfig } = require('expo/metro-config');
const {
  createHarmonyMetroConfig,
} = require('@react-native-oh/react-native-harmony/metro.config');

// 始终以 Expo 基线为准，保住 serializer / HMR / 虚拟入口；Harmony 只叠加 resolver 级字段。
const baseConfig = getDefaultConfig(__dirname);

const harmonyConfig = createHarmonyMetroConfig({
  reactNativeHarmonyPackageName: '@react-native-oh/react-native-harmony',
});

const shimAliases = require('./shims/.alias-map.json');
const harmonyResolveRequest = harmonyConfig.resolver?.resolveRequest;

// resolver 级字段叠加（不碰 serializer）
baseConfig.resolver.platforms = Array.from(
  new Set([...(baseConfig.resolver.platforms || []), ...(harmonyConfig.resolver?.platforms || [])]),
);
baseConfig.resolver.sourceExts = Array.from(
  new Set([...(baseConfig.resolver.sourceExts || []), ...(harmonyConfig.resolver?.sourceExts || [])]),
);

function resolveAliasTarget(target) {
  return target.startsWith('.') ? path.resolve(__dirname, target) : target;
}

function resolveWithHarmony(context, moduleName, platform) {
  if (harmonyResolveRequest) {
    return harmonyResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
}

// 请求级分流（双保险）：platform=harmony 或离线 RN_BUNDLE_PLATFORM=harmony 走 RNOH + alias；其余走 Expo 默认，零污染。
// 开发态 start-harmony 不注入 RN_BUNDLE_PLATFORM → 三端靠 platform 参数分流；离线 bundle 脚本注入 → release 兜底。
baseConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'harmony' || process.env.RN_BUNDLE_PLATFORM === 'harmony') {
    const aliasTarget = shimAliases[moduleName];
    if (aliasTarget) {
      return context.resolveRequest(context, resolveAliasTarget(aliasTarget), platform);
    }
    if (moduleName.startsWith('@/')) {
      return context.resolveRequest(context, path.resolve(__dirname, moduleName.slice(2)), platform);
    }
    return resolveWithHarmony(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = mergeConfig(baseConfig, {
  transformer: {
    unstable_allowRequireContext: true,
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
});
`;
```

> 注：若 Task 1 发现 `harmonyConfig.resolver` 还含 `nodeModulesPaths`/`extraNodeModules` 等 Harmony 必需字段，在 `sourceExts` 叠加段之后补对应合并行（如 `baseConfig.resolver.nodeModulesPaths = Array.from(new Set([...(baseConfig.resolver.nodeModulesPaths||[]), ...(harmonyConfig.resolver?.nodeModulesPaths||[])]))`）。

- [ ] **Step 4: 跑测试，确认通过**

Run: `pnpm vitest run __tests__/injector.test.ts -t "请求级 platform 分流"`
Expected: PASS。

- [ ] **Step 5: type-check**

Run: `pnpm type-check`
Expected: 无错误。

- [ ] **Step 6: 等主公确认后提交**

```bash
git add src/injector/metro-config.ts __tests__/injector.test.ts
git commit -m "refactor(metro): metro.config.js 改为请求级 platform 分流，离线 RN_BUNDLE_PLATFORM 兜底"
```

---

## Task 3: EntryIndexTemplate 端口 8081 + platform 参数

**Files:**
- Modify: `src/harmony-project/templates/EntryIndexTemplate.ts:19`（默认地址）
- Modify: `src/harmony-project/templates/__tests__/templates.test.ts:37-51`（断言）
- Modify: `src/harmony-project/__tests__/standalone.test.ts:254`（Index.ets 断言）
- Modify: `src/harmony-project/__tests__/pack-files.test.ts:35-41,72`（函数名 + 值）

**Interfaces:**
- Produces: ArkTS `Index.ets` 默认 Metro 地址 `localhost:8081`，bundle URL 固定 `platform=harmony`（已有，保留）。

- [ ] **Step 1: 改 EntryIndexTemplate 默认地址**

`src/harmony-project/templates/EntryIndexTemplate.ts` 第 19 行：

```ts
  const hostAndPort = address.toString() ? address.toString() : 'localhost:8888';
```
改为：
```ts
  const hostAndPort = address.toString() ? address.toString() : 'localhost:8081';
```

- [ ] **Step 2: 改 templates.test.ts 断言（先红）**

`src/harmony-project/templates/__tests__/templates.test.ts` 第 37 行用例标题与第 43 行断言：

```ts
  it('EntryIndexTemplate 注入 appName，并固定 Expo appKey 为 main + Metro 8081', () => {
```
```ts
    expect(out).toContain("'localhost:8081'");
```

- [ ] **Step 3: 改 standalone.test.ts 断言**

`src/harmony-project/__tests__/standalone.test.ts` 第 254 行：

```ts
    expect(indexEts).toContain("'localhost:8081'");
```

- [ ] **Step 4: 改 harmony-project/pack-files.test.ts（函数名 + 断言）**

`src/harmony-project/__tests__/pack-files.test.ts`：
- 第 35 行函数名 `assertPackedDistContainsMetro8888Provider` → `assertPackedDistContainsMetro8081Provider`
- 第 38 行 `expect(content).toContain('localhost:8888')` → `expect(content).toContain('localhost:8081')`
- 第 72 行调用处同步改名

- [ ] **Step 5: 跑测试，确认通过**

Run: `pnpm vitest run src/harmony-project/templates/__tests__/templates.test.ts src/harmony-project/__tests__/standalone.test.ts src/harmony-project/__tests__/pack-files.test.ts`
Expected: PASS。

- [ ] **Step 6: 等主公确认后提交**

```bash
git add src/harmony-project/templates/EntryIndexTemplate.ts src/harmony-project/templates/__tests__/templates.test.ts src/harmony-project/__tests__/standalone.test.ts src/harmony-project/__tests__/pack-files.test.ts
git commit -m "feat(harmony): ArkTS Index 默认 Metro 地址统一为 8081"
```

---

## Task 4: start-harmony 端口 8081 + 单 hdc + 去 RN_BUNDLE_PLATFORM + hdc 硬失败

**Files:**
- Modify: `src/injector/start-harmony.ts`（`START_HARMONY_JS` 模板）
- Modify: `__tests__/injector.test.ts`（`start-harmony.js 使用独立的 8888 Metro...` 用例改写）
- Modify: `__tests__/pack-files.test.ts:65-66`（hdc 断言）

**Interfaces:**
- Produces: `scripts/start-harmony.js` 用 `--port 8081`，单条 `hdc rport tcp:8081 tcp:8081`，env 不含 `RN_BUNDLE_PLATFORM`，hdc 缺失/rport 失败时 `process.exit(1)`。

- [ ] **Step 1: 改 injector.test.ts 的 start-harmony 用例（先红）**

`__tests__/injector.test.ts`，把 `it('start-harmony.js 使用独立的 8888 Metro，并转发设备侧 8081 到 8888', ...)`（约 60 行）整体替换为：

```ts
  it('start-harmony.js 统一使用 8081 Metro，单条 hdc 转发，不注入开发态 RN_BUNDLE_PLATFORM', () => {
    injectHarmonyBaseline(tmp, { slug: 'myapp', scheme: 'myapp' });
    const script = fs.readFileSync(path.join(tmp, 'scripts/start-harmony.js'), 'utf8');
    // 端口统一 8081
    expect(script).toContain("'--port'");
    expect(script).toContain("'8081'");
    expect(script).not.toContain("'8888'");
    // 单条 hdc 转发
    expect(script).toContain("runHdcRport(hdc, 'tcp:8081', 'tcp:8081')");
    expect(script).not.toContain("'tcp:8888'");
    // 启动 expo
    expect(script).toContain("spawn('expo'");
    expect(script).toContain("'start'");
    expect(script).toContain("'--offline'");
    expect(script).toContain('HARMONY_METRO_CLEAR');
    expect(script).toContain("metroArgs.push('--clear')");
    // 开发态不注入 RN_BUNDLE_PLATFORM（分流已改为请求级）
    expect(script).not.toContain('RN_BUNDLE_PLATFORM');
    // LAN 探测与提示
    expect(script).toContain('os.networkInterfaces');
    expect(script).toContain('HARMONY_METRO_HOST');
    expect(script).toContain("process.platform === 'win32'");
    expect(script).toContain('process.env.ProgramFiles');
    expect(script).toContain('hdc.exe');
    expect(script).toContain('EXPO_PACKAGER_HOSTNAME');
    expect(script).toContain('REACT_NATIVE_PACKAGER_HOSTNAME');
    expect(script).toContain('Metro LAN URL');
    expect(script).toContain('RNOH Dev Settings');
  });
```

- [ ] **Step 2: 改根 pack-files.test.ts hdc 断言**

`__tests__/pack-files.test.ts` 第 65–66 行：

```ts
  expect(writer).toContain("runHdcRport(hdc, 'tcp:8081', 'tcp:8081')");
```
删除原 `tcp:8888` 两行（65、66 行），替换为上面这一行。

- [ ] **Step 3: 跑测试，确认失败**

Run: `pnpm vitest run __tests__/injector.test.ts -t "统一使用 8081 Metro" __tests__/pack-files.test.ts`
Expected: FAIL（start-harmony.ts 仍是 8888/双 hdc/含 RN_BUNDLE_PLATFORM）。

- [ ] **Step 4: 改 START_HARMONY_JS 模板**

打开 `src/injector/start-harmony.ts`，做四处替换：

(a) 第 29 行 `getMetroHostAndPort` 返回端口：
```js
  return host.includes(':') ? '[' + host + ']:8888' : host + ':8888';
```
→
```js
  return host.includes(':') ? '[' + host + ']:8081' : host + ':8081';
```

(b) `runHdcRport` 失败改为硬失败（约第 149–157 行），把 `if (message) console.warn(...)` 之后追加退出：
```js
function runHdcRport(hdc, remote, local) {
  const result = spawnSync(hdc, ['rport', remote, local], { encoding: 'utf8' });
  if (result.status === 0) {
    console.log('[harmony] hdc rport ' + remote + ' ' + local + ' ready');
    return;
  }
  const message = ((result.stderr || '') + (result.stdout || '')).trim();
  console.error('[harmony] hdc rport ' + remote + ' ' + local + ' failed' + (message ? ': ' + message : ''));
  console.error('[harmony] 请确认 Harmony 设备已通过 USB/无线连接并开启调试。若仍失败，可手动执行：hdc rport ' + remote + ' ' + local);
  process.exit(1);
}
```

(c) `setupHarmonyPortForwarding`（约第 159–168 行）改为单条 hdc + hdc 缺失硬失败：
```js
function setupHarmonyPortForwarding() {
  const hdc = findHdc();
  if (!hdc) {
    console.error('[harmony] 未找到 hdc。请安装 DevEco Studio，或设置 HDC_PATH 环境变量后重试：pnpm start:harmony');
    process.exit(1);
  }
  // 三端共用 8081：设备侧 8081 转发到开发机 8081 Metro。
  runHdcRport(hdc, 'tcp:8081', 'tcp:8081');
}
```

(d) env（约第 180–186 行）删除 `RN_BUNDLE_PLATFORM`，metroArgs（约第 188 行）端口改 8081：
```js
const env = {
  ...process.env,
  EXPO_OFFLINE: '1',
  EXPO_PACKAGER_HOSTNAME: metroHost,
  REACT_NATIVE_PACKAGER_HOSTNAME: metroHost,
};

const metroArgs = ['start', '--offline', '--port', '8081'];
```

- [ ] **Step 5: 跑测试，确认通过**

Run: `pnpm vitest run __tests__/injector.test.ts __tests__/pack-files.test.ts`
Expected: PASS。

- [ ] **Step 6: type-check + 语法检查**

Run: `pnpm type-check`
Expected: 无错误。

- [ ] **Step 7: 等主公确认后提交**

```bash
git add src/injector/start-harmony.ts __tests__/injector.test.ts __tests__/pack-files.test.ts
git commit -m "feat(harmony): start-harmony 统一 8081 端口、单条 hdc 转发、hdc 失败硬退出"
```

---

## Task 5: start-harmony 8081 复用探测

**Files:**
- Modify: `src/injector/start-harmony.ts`（`START_HARMONY_JS` 增加 `isMetroRunningOnPort` 与复用分支）
- Modify: `__tests__/injector.test.ts`（增断言）

**Interfaces:**
- Produces: `start:harmony` 启动前探测 8081 是否已有 Metro 监听；有则复用（不重复 spawn，只做 hdc），无则启动。

- [ ] **Step 1: 增测试断言（先红）**

在 `__tests__/injector.test.ts` 的 start-harmony 用例里追加：

```ts
    // 8081 复用探测
    expect(script).toContain('isMetroRunningOnPort');
    expect(script).toContain('isMetroRunningOnPort(8081)');
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm vitest run __tests__/injector.test.ts -t "统一使用 8081 Metro"`
Expected: FAIL（模板尚无 `isMetroRunningOnPort`）。

- [ ] **Step 3: 在 START_HARMONY_JS 增加探测函数与复用分支**

`src/injector/start-harmony.ts`，在 `getMetroHostAndPort` 函数之后插入同步端口探测函数：

```js
function isMetroRunningOnPort(port) {
  const result = spawnSync(process.execPath, ['-e',
    "const net=require('net');const s=net.connect(" + port + ",'127.0.0.1');" +
    "s.on('connect',function(){s.end();process.exit(0)});" +
    "s.on('error',function(){process.exit(1)});" +
    "setTimeout(function(){process.exit(1)},1000);"
  ], { stdio: 'ignore' });
  return result.status === 0;
}
```

把原 Metro 启动段（`const metroArgs = ...` 到 `const child = spawn(...)`）改为：

```js
const metroArgs = ['start', '--offline', '--port', '8081'];
if (process.env.HARMONY_METRO_CLEAR === '1' || process.env.HARMONY_METRO_CLEAR === 'true') {
  metroArgs.push('--clear');
}

if (isMetroRunningOnPort(8081)) {
  console.log('[harmony] 检测到 8081 已有 Metro 运行，复用，仅完成 hdc 转发。');
} else {
  const child = spawn('expo', metroArgs, {
    stdio: 'inherit',
    shell: true,
    env,
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `pnpm vitest run __tests__/injector.test.ts`
Expected: PASS。

- [ ] **Step 5: type-check**

Run: `pnpm type-check`
Expected: 无错误。

- [ ] **Step 6: 等主公确认后提交**

```bash
git add src/injector/start-harmony.ts __tests__/injector.test.ts
git commit -m "feat(harmony): start-harmony 复用已运行的 8081 Metro，避免重复启动"
```

---

## Task 6: tips 文案 + 文档 8888→8081

**Files:**
- Modify: `src/tips.ts:50`
- Modify: `content/docs/HARMONY.md`（约 35、123 行）
- Modify: `content/docs/TROUBLESHOOTING.md`（约 25、28–29、32 行）
- Modify: `README.md`
- Modify: `docs/guide.md`

- [ ] **Step 1: 改 tips.ts 文案**

`src/tips.ts` 第 50 行：
```ts
      { cmd: startCommand(pm), desc: '启动 HarmonyOS Metro（默认端口 8888，原生端口 8081）' },
```
→
```ts
      { cmd: startCommand(pm), desc: '启动 HarmonyOS Metro（与 Android/iOS 统一端口 8081）' },
```

- [ ] **Step 2: 全量替换文档中的开发态 8888**

```bash
# 先查看所有残留
grep -rn "8888" content/docs/HARMONY.md content/docs/TROUBLESHOOTING.md README.md docs/guide.md
```

逐处改为 8081，并把 hdc 示例从两条改为单条 `hdc rport tcp:8081 tcp:8081`。关键改写：
- HARMONY.md：端口描述 8888→8081；双 hdc→单 hdc。
- TROUBLESHOOTING.md：`hdc rport tcp:8081 tcp:8888` → `hdc rport tcp:8081 tcp:8081`；端口排查文案 8888→8081。

- [ ] **Step 3: 确认无开发态 8888 残留**

Run: `grep -rn "8888" src content README.md docs/guide.md | grep -v node_modules`
Expected: 空输出（除非有刻意保留的历史记录，需人工确认）。

- [ ] **Step 4: 等主公确认后提交**

```bash
git add src/tips.ts content/docs/HARMONY.md content/docs/TROUBLESHOOTING.md README.md docs/guide.md
git commit -m "docs: 三端端口统一为 8081，更新提示与文档"
```

---

## Task 7: 试验 Metro 集成验证（curl 三平台）

**目的：** spec 第 6/8 节的 Metro 集成测试，实证请求级分流与 alias 隔离，消除「单进程串味」顾虑。这是手动验证 task，无单测。

**Files:** 无源码改动，产出验证记录。

- [ ] **Step 1: 在 probe 项目重建 metro.config 并起 Metro**

```bash
cd /tmp/probe-metro   # Task 1 创建的项目
pnpm dlx expo-harmony-cli prebuild --platform harmony   # 用新 CLI 重新注入 metro.config.js
pnpm start:harmony &   # 后台起 Metro（或 pnpm start -- --port 8081）
```

- [ ] **Step 2: curl 三平台验证分流**

```bash
curl -sS -o /dev/null -w 'android:%{http_code}\n' 'http://127.0.0.1:8081/.expo/virtual-metro-entry.bundle?platform=android'
curl -sS -o /dev/null -w 'ios:%{http_code}\n'     'http://127.0.0.1:8081/.expo/virtual-metro-entry.bundle?platform=ios'
curl -sS -o /dev/null -w 'harmony:%{http_code}\n' 'http://127.0.0.1:8081/index.bundle?platform=harmony'
```
Expected: 三个均非 404（200 或带 bundle 内容）。

- [ ] **Step 3: 确认 alias 隔离（可选强证）**

在 Metro 日志或 resolver 层加临时日志，确认：
- `?platform=android` 请求 `@expo/metro-runtime` 不进 harmony alias 分支（加载真实包）。
- `?platform=harmony` 请求 `@expo/metro-runtime` 命中 alias（no-op shim）。

若不方便加日志，至少确认三平台 bundle 均能成功生成且 android 端 HMR 正常。

- [ ] **Step 4: 记录结论**

把 curl 结果写入本 plan「Task 7 验证记录」区。若任一平台 404 或串味，回到 Task 2 排查字段级合并。无代码提交。

---

## Task 8: 全量回归 + 旧项目幂等

**Files:** 无新增，运行已有测试与构建。

- [ ] **Step 1: 全量单测**

Run: `pnpm test`
Expected: 全绿。

- [ ] **Step 2: type-check + build**

Run: `pnpm type-check && pnpm build`
Expected: 无错误，`dist/` 生成。

- [ ] **Step 3: 旧项目幂等（若手头有旧项目）**

对一个已存在的（仍用 8888 的）项目执行 `pnpm dlx expo-harmony-cli prebuild --platform harmony`（或 `sync`），确认：
- `metro.config.js` 被更新为请求级分流（含 managed 标记）。
- 重复执行不重复追加 resolver/alias。
- 非托管（无 managed 标记）的 metro.config.js 不被覆盖。

- [ ] **Step 4: 发布前验收清单核对**

对照 spec 第 11 节清单逐项打勾。

- [ ] **Step 5: 等主公确认后提交（如有残余改动）**

```bash
git add -A
git commit -m "test: 三端统一 8081 全量回归通过"
```

---

## Self-Review（计划自检结论）

- **Spec 覆盖**：spec §3 架构 → Task 2；§4.1 字段级合并 → Task 2；§4.2 EntryIndex 端口 → Task 3；§4.3 start-harmony → Task 4/5；§4.4 文档 → Task 6；§5 隔离保证 → Task 2 alias 分支 + Task 7 实证；§6 验证 gate → Task 1/7；§7 错误处理（硬失败/复用）→ Task 4/5；§8 测试 → 各 Task 的 TDD 步骤；§10 回滚 → 文件粒度，每个 Task 独立可回滚。✅
- **Placeholder**：无 TBD/TODO；每步含实际代码或命令。Task 1/7 为调研/验证 task，已说明产出形式而非占位。✅
- **类型一致**：函数名 `isMetroRunningOnPort`、`assertPackedDistContainsMetro8081Provider`、`resolveWithHarmony` 在各 Task 间一致。✅
- **范围**：Expo winter / FormData 已拆出，不在本 plan。✅

---

## Task 1 验证记录（实施时填写）

> `createHarmonyMetroConfig` 返回的 resolver 字段：__________

## Task 7 验证记录（实施时填写）

> curl android:__  ios:__  harmony:__
