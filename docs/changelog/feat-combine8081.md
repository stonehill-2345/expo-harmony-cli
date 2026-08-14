# Changelog: feat/combine8081 → main

## 基本信息

| 项目 | 内容 |
|------|------|
| 当前分支 | feat/combine8081 |
| 对比分支 | main |
| 提交数量 | 9 |
| 变更文件 | 30 |
| 更新时间 | 2026-08-14 |

## ✨ 新增功能 (Features)

- 三端统一 Metro 端口为 8081，HarmonyOS 与 Android/iOS 共用同一端口；`start-harmony` 改为单条 hdc 转发，新增 8081 复用探测与冲突旧转发规则清理 (`src/injector/start-harmony.ts`)
- 新增 expo-asset 鸿蒙降级 shim，解决 Expo.fx 启动时在鸿蒙环境崩溃 (`content/shims/expo-asset.ts`、`src/injector/harmony-entry.ts`)
- `scan` 命令默认只读预览（临时目录模拟），新增 `--apply` 参数才真正修改项目 (`src/commands/scan.ts`)
- autolinking 校验 HAR 完整性，自动跳过缺少有效 HAR 的包并返回 skipped 列表 (`src/harmony-project/autolinking.ts`)
- 完善 1.0.0 创建链路与 HarmonyOS 构建流程，命令执行统一为 file+args 形式，覆盖 pnpm/npm/yarn/bun (`src/installer/installer.ts`、`src/installer/uninstaller.ts`、`src/commands/prebuild.ts`)

## 🐛 修复问题 (Bug Fixes)

- 鸿蒙入口由单独 `setUpXHR` 升级为 `InitializeCore` 预热 RN 核心模块图，消除 Image/PixelRatio 白屏 (`content/templates/index.harmony.js`)
- expo-asset shim 对齐真实 API，`loadAsync`/`fromMetadata` 返回数组，避免解构崩溃 (`content/shims/expo-asset.ts`)
- `metro.config.js` 改为请求级 platform 分流，废弃进程级 `RN_BUNDLE_PLATFORM`，alias 只对 harmony 生效，零污染 Android/iOS (`src/injector/metro-config.ts`)
- hdc rport 成功判定改为依据输出（端口冲突时 exit code 仍为 0），缺失/失败时硬退出避免误判 ready (`src/injector/start-harmony.ts`)
- 优化未自动适配 HarmonyOS 的警告信息格式，保持包名与换行连续，便于日志消费方解析 (`src/installer/installer.ts`、`src/tips.ts`)

## ♻️ 重构 (Refactor)

- 命令执行层 `run` → `runFile`（file+args 数组），避免 shell 解析用户参数；pkg-manager 的 `installCmd`/`uninstallCmd` 返回 `CommandParts` 结构，新增 `runScriptCmd` 统一 codegen 脚本命令 (`src/utils/exec.ts`、`src/lib/pkg-manager.ts`、`src/installer/installer.ts`、`src/installer/uninstaller.ts`)

## 💥 破坏性变更 (Breaking Changes)

- ⚠️ HarmonyOS Metro 端口从 8888 改为 8081（三端统一）。迁移：已生成的鸿蒙工程需重新执行 `pnpm dlx expo-harmony-cli prebuild --platform harmony --force`，或手动将 RNOH Dev Settings 地址端口改为 8081；旧的 8888 hdc 转发规则会被 `start-harmony` 自动清理。
- ⚠️ `scan` 命令默认行为从「直接修改项目」改为「只读预览」。迁移：需应用变更请改用 `pnpm dlx expo-harmony-cli scan --apply`。

## 📦 其他变更

- `.gitignore` 忽略 `docs/superpowers/` 目录 (`.gitignore`)

## 变更文件清单

### 命令层 (src/commands)
- ✏️ `src/commands/scan.ts` — scan 默认只读预览，新增 `--apply`
- ✏️ `src/commands/prebuild.ts` — `run` 替换为 `runFile`

### 注入器 (src/injector)
- ✏️ `src/injector/start-harmony.ts` — 端口统一 8081、单条 hdc、8081 复用探测、清理冲突转发、rport 输出判定
- ✏️ `src/injector/metro-config.ts` — 请求级 platform 分流、托管标记
- ✏️ `src/injector/harmony-entry.ts` — 注入 expo-asset shim 并注册 alias-map

### 安装器 (src/installer)
- ✏️ `src/installer/installer.ts` — `runFile` 化、警告格式、codegen 统一
- ✏️ `src/installer/uninstaller.ts` — `runFile` 化、codegen 统一

### 鸿蒙工程生成 (src/harmony-project)
- ✏️ `src/harmony-project/autolinking.ts` — HAR 完整性校验 + skipped 返回
- ✏️ `src/harmony-project/templates/EntryIndexTemplate.ts` — 默认地址改 8081

### 工具库 (src/lib, src/utils)
- ✏️ `src/lib/pkg-manager.ts` — `CommandParts` 结构 + `runScriptCmd`
- ✏️ `src/utils/exec.ts` — `run` 标记 deprecated，Windows 命令集补充 yarn/bun
- ✏️ `src/tips.ts` — 提示端口统一 8081、警告文本适配

### 模板与文档 (content, docs, README)
- 🆕 `content/shims/expo-asset.ts` — expo-asset 鸿蒙降级 shim
- ✏️ `content/templates/index.harmony.js` — 入口预热 InitializeCore
- ✏️ `content/docs/HARMONY.md` — 端口改 8081
- ✏️ `content/docs/TROUBLESHOOTING.md` — 端口改 8081
- ✏️ `docs/guide.md` — 端口改 8081
- ✏️ `README.md` — 端口改 8081

### 配置
- ✏️ `.gitignore` — 忽略 `docs/superpowers/`

### 测试
- ✏️ `__tests__/injector.test.ts` — 端口/InitializeCore/请求级分流/expo-asset/冲突清理用例
- ✏️ `__tests__/install.test.ts` — 适配 runFile
- ✏️ `__tests__/pack-files.test.ts` — 端口断言改 8081
- ✏️ `__tests__/pkg-manager.test.ts` — `CommandParts` + `runScriptCmd` 断言
- ✏️ `__tests__/prebuild.test.ts` — 适配 runFile
- ✏️ `__tests__/scan-list.test.ts` — 只读/`--apply` 用例
- ✏️ `__tests__/uninstall.test.ts` — 适配 runFile
- ✏️ `src/harmony-project/__tests__/autolinking.test.ts` — 补充 HAR 文件夹具
- ✏️ `src/harmony-project/__tests__/pack-files.test.ts` — 端口改 8081
- ✏️ `src/harmony-project/__tests__/standalone.test.ts` — 端口改 8081、补充 HAR 夹具
- ✏️ `src/harmony-project/templates/__tests__/templates.test.ts` — 端口改 8081
