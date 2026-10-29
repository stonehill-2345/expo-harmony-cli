# 三端统一 8081 Metro — 设计规范（spec）

> 状态：已评审，待主公确认  
> 日期：2026-08-13  
> 方案：D（单 Metro :8081，请求级 platform 分流）  
> 关联：修正并取代 `docs/superpowers/plans/2026-08-13-unified-metro-port-plan.md` 中阶段一的字段合并写法，并将该计划阶段四拆出为独立 spec。

## 1. 背景与现状

| 端 | 当前 Metro 端口 | 实现位置 |
|---|---|---|
| Android / iOS | 8081 | Expo/RN 默认，CLI 不显式处理 |
| HarmonyOS | 8888 | `src/injector/start-harmony.ts`（启动参数 + hdc 转发）、`src/harmony-project/templates/EntryIndexTemplate.ts`（ArkTS 默认地址） |

Harmony 用独立 8888，是因为 metro 配置当前是**进程级分流**：`src/injector/metro-config.ts` 以 `process.env.RN_BUNDLE_PLATFORM === 'harmony'` 决定整个进程加载哪套 resolver（harmony 走 `createHarmonyMetroConfig`，其余走 `expo/metro-config`）。两个进程必须两个端口，才能同时双端联调。

commit `309c581` 刚把 Harmony 端口从 8081 改成 8888。本设计将其统一回 8081，但采用比「双进程互斥」更优的「单进程请求级分流」。

## 2. 目标与非目标

### 目标

- Android / iOS / Harmony 三端对外统一使用 `8081`。
- 支持三端**同时**联调：一个 Metro 进程，按请求的 `platform` 参数分流 resolver。
- Android/iOS 保持 Expo 原有 resolver / serializer / HMR / 虚拟入口行为不变。
- `pnpm start:harmony` 自动完成 Metro 启动与 Harmony 设备端口准备，用户无需手敲 `hdc rport`。

### 非目标（范围拆分）

- **不**在本设计内处理 Expo winter / FormData 等 Harmony 运行时能力补全（原计划阶段四）。它与端口正交，另起独立 spec，避免污染回滚面。
- **不**改 Android Gradle、iOS 原生工程、业务代码。
- **不**把 Harmony 改造成 Expo 官方平台插件。
- **不**引入额外 HTTP/WebSocket 代理服务。

## 3. 目标架构

```
        同一个 Metro :8081
        ├── platform=android ─► Expo 默认 resolver（不查 alias-map）
        ├── platform=ios     ─► Expo 默认 resolver（不查 alias-map）
        └── platform=harmony ─► 查 alias-map(shim) + @/ 别名 ─► RNOH resolver
```

平台判断**主要**基于 Metro 请求传入的 `platform` 参数（开发态三端共存的隔离关键），`process.env.RN_BUNDLE_PLATFORM` 作为**离线兜底**：resolveRequest 条件为 `platform === 'harmony' || process.env.RN_BUNDLE_PLATFORM === 'harmony'`。开发态 `start-harmony.js` 不注入该变量 → 三端靠 platform 参数分流、零串味；离线 bundle 脚本（`bundle-harmony-dev.ts` / `bundle-harmony-release.ts`）注入它 → release bundle 兜底（Task 1 实证：`bundle-harmony` 是否传 platform 无 0.77.71 源码实证，兜底消除该风险）。

## 4. 核心改动

### 4.1 `src/injector/metro-config.ts`（字段级合并 — 对原计划阶段一的修正）

原计划写「只提取 RNOH 的 resolveRequest，不整体合并」，**不正确**：`createHarmonyMetroConfig` 返回的 resolver 还含 `platforms`（注册 `'harmony'`）与 `sourceExts`（`.harmony.js/.ts`），缺它们则 Harmony 平台与平台文件无法识别。

正确写法是**按字段类别合并**：

```js
const base = expoGetDefaultConfig(__dirname);              // 基线：保 serializer/HMR/虚拟入口
const harm = createHarmonyMetroConfig({ reactNativeHarmonyPackageName });
const harmonyResolveRequest = harm.resolver?.resolveRequest;

// ① resolver 级字段叠加（不碰 serializer）
base.resolver.platforms  = [...base.resolver.platforms,  ...(harm.resolver.platforms  ?? [])];
base.resolver.sourceExts = [...base.resolver.sourceExts, ...(harm.resolver.sourceExts ?? [])];

// ② resolveRequest 请求级分流（双保险）：alias 只对 harmony 生效（隔离关键）
//    开发态无 RN_BUNDLE_PLATFORM → 纯 platform 分流；离线脚本注入 → release 兜底
base.resolver.resolveRequest = (ctx, moduleName, platform) => {
  if (platform === 'harmony' || process.env.RN_BUNDLE_PLATFORM === 'harmony') {
    const aliasTarget = shimAliases[moduleName];
    if (aliasTarget) return ctx.resolveRequest(ctx, resolveAliasTarget(aliasTarget), platform);
    if (moduleName.startsWith('@/'))
      return ctx.resolveRequest(ctx, path.resolve(__dirname, moduleName.slice(2)), platform);
    return harmonyResolveRequest
      ? harmonyResolveRequest(ctx, moduleName, platform)
      : ctx.resolveRequest(ctx, moduleName, platform);
  }
  return ctx.resolveRequest(ctx, moduleName, platform);   // android/ios/未知 → 纯 Expo，零污染
};

// ③ transformer 级字段（svg-transformer / requireContext）叠加；serializer 保持 Expo 原样
```

保留 `// expo-harmony-cli:managed` 标记，供旧项目升级识别、拒绝静默覆盖非托管配置。

### 4.2 `src/harmony-project/templates/EntryIndexTemplate.ts`

- 默认地址 `localhost:8888` → `localhost:8081`。
- bundle URL 固定 `platform=harmony`：`http://<host>:8081/index.bundle?platform=harmony&dev=true&minify=false`。

### 4.3 `src/injector/start-harmony.ts`

- Metro 启动参数 `--port 8888` → `--port 8081`。
- hdc 转发从两条（`tcp:8888→tcp:8888`、`tcp:8081→tcp:8888`）简化为单条 `tcp:8081 → tcp:8081`。
- 不再向开发态 Metro 注入 `RN_BUNDLE_PLATFORM=harmony`（分流改为请求级）。
- `getMetroHostAndPort()` 返回 `host:8081`。

### 4.4 文档与提示

- `src/tips.ts`：提示文案「默认端口 8888，原生端口 8081」→「统一端口 8081」。
- `content/docs/HARMONY.md`、`content/docs/TROUBLESHOOTING.md`、`README.md`、`docs/guide.md`：8888 → 8081，更新 hdc 命令为单条 `hdc rport tcp:8081 tcp:8081`。

## 5. 隔离保证（回应「单进程串味」顾虑）

| 串味面 | 隔离机制 | 对 android/ios 影响 |
|---|---|---|
| alias-map | resolveRequest 内 `platform==='harmony'` 才查 | 零污染，单测锁定 |
| sourceExts 叠加 | Metro 按「请求 platform」匹配扩展名，android 只找 `.android.js/.native.js/.js` | 无害，不碰 `.harmony.js` |
| transformer 共享 | 当前 harmony 用 svg-transformer + requireContext，三端通用 | 无害（方案 D 前提，纳入验证 gate） |

「鸿蒙不支持的库」场景与进程数无关：无论单/双进程，Harmony 遇到无 harmony 实现的库，都靠 alias-map 换成 harmony 包/shim 或报错。方案 D 在此场景下与当前双进程行为等价。

## 6. 实施前验证 gate（动手写代码前先拿实证）

1. **读真实源码**：确认 `createHarmonyMetroConfig` 实际返回的 resolver 字段集合（锁定 `0.77.71`）。**已实证（2026-08-13）**：①本项目现有 `metro-config.ts:24/37` 已消费 `harmonyConfig.resolver?.resolveRequest` 且 `mergeConfig(base, harmonyConfig)` 生产跑通 → 返回 config 对象（非 curry）、resolver 含 resolveRequest；②WebSearch（OpenHarmony-SIG 文档）佐证注入 `resolver.platforms('harmony')` + `resolver.sourceExts` + `resolver.resolveRequest`。字段级合并清单（platforms/sourceExts/resolveRequest）确认无误。源码直读因企业网络策略拦截 unpkg/jsdelivr 未成，但运行时实证已足够。
2. **试验 Metro**：用修正后的 metro.config 起一个 Metro，`curl` 三平台验证分流与 alias 隔离：
   - `?platform=android` 不触发 harmony alias、不进 RNOH resolver；
   - `?platform=harmony` 走 RNOH resolver + alias，能解析 `.harmony` 平台文件。

拿到实证再进入全面实施。

## 7. 错误处理

- **hdc 缺失 / 设备离线 / `rport` 失败**：硬失败（非零退出 + 可执行诊断命令），不再 warning 后静默继续。
- **8081 复用语义**：`start:harmony` 先探测 8081 端口是否处于监听状态 —— 监听则视为已有 Metro，**复用**（不重复启动，只做 `hdc rport` + 打印 LAN 地址）；空闲则启动 `expo start --port 8081`（该 Metro 已具三端分流配置，能同时服务三端）。端口监听即复用，启动时不区分占用者类型（若占用者实际并非 Metro，bundle 请求阶段会暴露明确连接错误，可诊断）。核心语义：**一个 Metro 同时服务三端，无需重复启动**。

## 8. 测试策略

### 单元测试

- android / ios / 未知平台请求：不触发 harmony alias、不进 RNOH resolver。
- harmony 请求：触发 harmony alias、进 RNOH resolver。
- 生成的 harmony bundle URL 含 `platform=harmony` 与 `:8081`。
- `metro.config.js` resolveRequest 含双保险条件 `platform === 'harmony'` 与 `process.env.RN_BUNDLE_PLATFORM === 'harmony'` 兜底。
- `scripts/start-harmony.js` 不含开发态 `RN_BUNDLE_PLATFORM=harmony`（隔离关键：开发态纯 platform 分流）。
- 离线 harmony bundle 脚本仍含 `RN_BUNDLE_PLATFORM=harmony`（release 兜底）。
- hdc 缺失 / 设备离线 / rport 失败时，启动脚本非零退出并输出明确原因。
- `prebuild --platform harmony` / `sync` 重复执行结果稳定，不重复追加 resolver/alias。

### Metro 集成测试

```bash
curl 'http://127.0.0.1:8081/.expo/virtual-metro-entry.bundle?platform=android'
curl 'http://127.0.0.1:8081/.expo/virtual-metro-entry.bundle?platform=ios'
curl 'http://127.0.0.1:8081/index.bundle?platform=harmony'
```

验收：三请求均不因 resolver 分流返回 404；android/ios 不进 harmony resolver；harmony 解析 shim 与 `.harmony` 文件。

### 端到端

1. Android `pnpm android`，原流程不变。
2. iOS `pnpm ios`，原流程不变。
3. Harmony `pnpm start:harmony`，不手敲 `hdc rport`，设备加载 `:8081` bundle。
4. 同一 Metro 连续处理 android / ios / harmony 请求。
5. 停掉 harmony 后，android/iOS 仍可单独使用 8081。
6. 清空 Metro 缓存后重复验证。

## 9. 影响范围与风险

### 预计改动

约 6–10 个源码/模板/测试文件，约 150–300 行有效代码与测试。主要在注入器（metro-config、start-harmony）、Harmony 模板（EntryIndex）、文档与测试。

### 明确不影响

Android Gradle、iOS 原生工程、android/iOS 入口与默认 Expo resolver、业务页面与依赖、Harmony 原生 C++/ArkTS 包注册结构（bundle URL 配置除外）。

### 风险

1. **Expo CLI 包装/覆盖 serializer**：对策 — 只合并 resolver 级字段，不整体 mergeConfig，serializer 保持 Expo 原样。
2. **RNOH resolver 接口随版本变化**：对策 — 锁定 `0.77.71`，第 6 节验证 gate 读源码确认字段，补契约测试。
3. **Expo 基线 sourceExts 与 harmony sourceExts 叠加**：对策 — 第 6 节 gate 对比两者，确认无丢失/冲突。
4. **旧项目非托管 Metro 配置**：对策 — 保留 managed 标记，拒绝静默覆盖。
5. **transformer 未来引入 platform 专属 babel 插件**：当前不成立（前提验证通过），列为演进风险。

## 10. 回滚方案（按文件粒度）

1. 恢复 `src/injector/metro-config.ts` 的进程级分流。
2. 恢复 `src/injector/start-harmony.ts` 的 8888 端口与双 hdc 转发。
3. 恢复 `src/harmony-project/templates/EntryIndexTemplate.ts` 的 8888 默认地址。
4. 恢复文档与提示文案。
5. android/iOS 原生无需回滚（本方案不碰它们）。

回滚验证：`pnpm android` / `pnpm ios` / `pnpm start:harmony` 三者恢复原行为。

## 11. 发布前验收清单

- [ ] android/ios 仍使用 Expo 默认 Metro 配置（零回归）。
- [ ] harmony 请求显式带 `platform=harmony`。
- [ ] 三端对外端口均为 8081。
- [ ] 单 Metro 进程连续处理三端请求，alias 不串味（集成测试实证）。
- [ ] 用户只执行 `pnpm start:harmony` 即完成 `hdc rport`。
- [ ] hdc 失败时 CLI 明确失败，不再静默跳过。
- [ ] 离线 bundle 脚本仍用 `RN_BUNDLE_PLATFORM=harmony`。
- [ ] 全量单元测试通过。
- [ ] Metro 集成测试通过。
- [ ] android / ios / harmony 真机或模拟器验收通过。
- [ ] 旧项目重复 `prebuild/sync` 不产生重复配置。
