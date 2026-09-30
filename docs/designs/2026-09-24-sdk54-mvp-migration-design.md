# Expo SDK54 Harmony MVP 正式 Monorepo 迁移设计

日期：2026-09-24
目标分支：`feat/V1.5.0`
目标仓库：`<repository-root>`
迁移来源：`expo-harmony-template@2704a48cc52781f510b3996af17c882fb82e1090`
官方 Expo 基线：`expo/expo@5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`

## 1. 目标

本次任务只负责将已在临时仓库验收的 Expo SDK54 Harmony MVP 源码迁入正式 monorepo，并重新证明以下 fresh 主链路成立：

```text
正式仓库十四包源码
→ 确定性生成十四个 Expo TGZ
→ 与十一个只读外部 RNOH/navigation TGZ 组成二十五包 staging
→ 官方 npx create-expo-app 创建 fresh blank/default 项目
→ 本地 TGZ 接管 SDK54 依赖
→ npx expo run:harmony
→ Debug 与 clean Release 在 Harmony 模拟器通过
```

当 fresh blank 和 fresh default+Router 两类项目均完成真实 Debug、Release 和对应页面/交互验收时，本次 MVP 迁移完成。

## 2. 明确排除范围

以下工作属于后续独立任务，不属于本次迁移：

- 修改 `apps/cli` compatibility table、injector、scanner 或 creator 产品逻辑；
- 将 SDK54 patch 写入 `apps/cli/content/patches/sdk-54`；
- 将 native template 同步到 `apps/cli/templates/harmony-sdk-54`；
- SDK52 legacy 流程与 SDK54 product flow 切换；
- `expo-harmony-cli` create 命令、help、upgrade diagnostics；
- npm publish、registry、dist-tag 或 template latest；
- 生产签名、混淆、商店发布和物理真机矩阵。

本次任务不得为通过验收修改 `apps/cli` 现有行为。

## 3. 十四包源码边界

正式仓库 `packages/` 是以下十四包的唯一源码来源：

| Package | Version |
| --- | --- |
| `@expo/cli` | `54.0.27` |
| `@expo/metro-config` | `54.0.17` |
| `expo` | `54.0.37` |
| `expo-asset` | `12.0.13` |
| `expo-constants` | `18.0.14` |
| `expo-font` | `14.0.12` |
| `expo-linking` | `8.0.12` |
| `expo-modules-autolinking` | `3.0.27` |
| `expo-modules-core` | `3.0.30` |
| `expo-router` | `6.0.24` |
| `expo-splash-screen` | `31.0.13` |
| `expo-status-bar` | `3.0.9` |
| `expo-system-ui` | `6.0.9` |
| `expo-web-browser` | `15.0.11` |

每个包保留官方 name/version 和源码结构，设置 `private: true`，并使用 `harmony-upstream.json` 固定两个来源 commit。十四包不独立发布。

## 4. 二十五包 TGZ staging

### 4.1 当前仓库生成的十四包

每轮 E2E 必须从当前工作树重新生成十四包 TGZ，执行两轮字节一致性检查，并记录：

- package name/version；
- archive filename；
- bytes；
- SHA-256；
- 14 packages；
- 22 internal dependency/peerDependency edges；
- zero audit failures。

不得直接复用桌面目录中的旧十四包 TGZ。

十四包中的发布型生成产物不能盲信迁移工作树现有 `build/`。打包流程必须在一次性目录中，对显式 allowlist 包执行固定、非 lifecycle 构建命令，再从一次性副本 pack：

- `@expo/cli`：`taskr release`，要求 `build/bin/cli` 和 Harmony CLI build 输出；
- `@expo/metro-config`：显式 TypeScript build，要求 `build/withHarmony.js`；
- `expo-modules-autolinking`：显式 TypeScript build，要求 `build/platforms/harmony/**` 和 Harmony platform dispatch；

构建不得修改正式源码工作树，不得执行任意 manifest lifecycle，不得把临时绝对路径写入 source map。A/B 两轮必须各自从独立 clean staging 完成 build+pack 后仍字节一致。Archive audit 必须检查 declared entrypoints 和上述 package-specific runtime outputs。

### 4.2 只读外部十一包

以下目录作为只读外部输入：

```text
<external-tgz-dir>
```

只复用：

```text
react-native-oh-react-native-harmony-0.82.30.tgz
react-native-gesture-handler-2.30.0.tgz
react-native-ohos-react-native-gesture-handler-2.30.1.tgz
react-native-reanimated-4.2.1.tgz
react-native-ohos-react-native-reanimated-4.0.1.tgz
react-native-safe-area-context-5.6.2.tgz
react-native-ohos-react-native-safe-area-context-5.6.3.tgz
react-native-screens-4.17.1.tgz
react-native-ohos-react-native-screens-4.9.0.tgz
react-native-worklets-0.7.1.tgz
react-native-ohos-react-native-worklets-1.0.0.tgz
```

不得修改该目录，不得把十一包复制进 Git，不得缺包时自动改用其他版本。staging manifest 必须记录十一包 bytes 和 SHA-256。

### 4.3 Staging 位置

在 `/private/tmp` 创建本轮独立目录：

```text
/private/tmp/expo-sdk54-migration-<run-id>/tgz
```

该目录必须恰好包含 fresh 十四包和只读十一包，共二十五包。所有 fresh 项目只引用该目录。

## 5. Fresh blank 验收

使用官方命令创建未占用的新项目：

```bash
npx create-expo-app@5.0.0 <blank-name> --template blank-typescript
```

依赖接管后固定：

- Expo `54.0.37`；
- Expo CLI `54.0.27`；
- React `19.1.1`；
- React Native `0.82.1`；
- RNOH `0.82.30`。

`App.tsx`、`index.ts` 和 `app.json` 必须保持 create-expo-app 原样。不得增加应用 `metro.config.js`、`index.harmony.js`、shim、polyfill、patch-package 或 postinstall。

Debug：

```bash
npx expo run:harmony
```

必须显示官方 blank 文本，Debug HAP 无 embedded bundle，`dev:true`。

Release：

```bash
npx expo run:harmony --configuration Release --no-build-cache
```

必须生成 clean Release，embedded bundle 与源 bundle SHA-256 一致，`dev:false`，停止 Metro 后仍能从模拟器桌面冷启动。

## 6. Fresh default + Router 验收

创建：

```bash
npx create-expo-app@5.0.0 <default-name> --template default@sdk-54
```

必须确认 `package.json.main` 为 `expo-router/entry`，且原模板包含 Tabs、Home、Explore、Modal 路由文件。

### 6.1 唯一允许的 fixture substitution

由于 `expo-image` Harmony backend 不在 MVP，只允许在临时 default fixture 中：

- 将 `app/(tabs)/index.tsx` 的 `expo-image` Image 替换为 React Native `Image`；
- 将 `app/(tabs)/explore.tsx` 的 `expo-image` Image 替换为 React Native `Image`；
- 删除 fixture 的 `expo-image` 依赖。

`app/modal.tsx`、`app/_layout.tsx` 和 `app.json` 必须保持原样。该替换不表示 `expo-image` 已适配。

### 6.2 Debug

运行：

```bash
npx expo run:harmony
```

并使用双终端模式验证 reload：

```bash
EXPO_HARMONY_METRO=1 npx expo start --dev-client --localhost --port 8081
npx expo run:harmony --no-bundler --port 8081
```

必须通过：Welcome/Home/Explore、Tabs、MaterialIcons、RN Image、Modal、单层 `dismissTo`、物理 Back、ArkWeb open/close、终端 `r` reload。

### 6.3 Release

运行：

```bash
npx expo run:harmony --configuration Release --no-build-cache
```

必须通过页面、图片、字体、Tabs、Modal、物理 Back、单层 `dismissTo`、WebBrowser 连续两轮 open/close、embedded bundle 校验和无 Metro 冷启动。

## 7. 禁止的应用侧绕行

两个 fresh fixture 均不得加入：

- `index.harmony.js`；
- 自定义 `metro.config.js`；
- Harmony shim/polyfill；
- patch-package/postinstall；
- 假模块、固定成功结果或假事件；
- 手工修改生成的 `harmony/` 冒充 SDK 能力。

## 8. 非设备门禁

设备前必须通过：

- SDK54 tool tests；
- 14 packages / 22 edges catalog validation；
- A/B deterministic package archives；
- archive/source audit；
- repository check；
- CLI Harmony、autolinking、Router、Splash、SystemUI、WebBrowser 相关源码测试；
- fresh blank/default 安装版本检查；
- 禁止应用绕行扫描；
- prebuild 输出和生成注册检查。

## 9. 设备授权边界

以下操作必须在执行前再次取得用户明确授权：

- `hdc start -r`；
- `hdc list targets`；
- HAP build/install/start 中涉及真实模拟器或设备的步骤；
- 模拟器控制；
- Debug/Release 页面与交互验收。

未获授权时可以完成 TGZ、fresh project、依赖安装、静态检查和非设备 prebuild，但不得声明运行验收通过。

## 10. Evidence

不得复制临时仓库旧 evidence 作为新结果。正式仓库的新报告至少记录：

- 目标 HEAD 与工作区状态；
- 14 fresh TGZ 与 11 external TGZ 的 SHA-256；
- 两个 create-expo-app 精确命令；
- fixture package versions；
- default 两处 RN Image substitution；
- Debug/Release 命令与真实结果；
- HAP/bundle SHA-256；
- 页面和交互清单；
- 未执行项和能力边界；
- `published: false`。

## 11. 当前工作区 reconciliation

保留十四包、provenance、catalog、deterministic pack、audit、repository check 和 pnpm workspace。

撤回本轮对以下 `apps/cli` 产品逻辑的修改：

```text
apps/cli/src/scanner/compat-table.ts
apps/cli/__tests__/compat-table.test.ts
```

`mvp-boundaries.mjs` 不再读取或要求修改 `apps/cli` compatibility table。后续 `apps/cli` patch/template/product flow 由独立任务处理。
