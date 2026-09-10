---
name: expo-harmony-adapter
description: Expo 插件鸿蒙(HarmonyOS)适配工作流。当适配 expo-image、expo-clipboard、expo-image-picker、expo-linear-gradient、expo-camera、expo-video、expo-av、expo-document-picker、expo-blur、expo-location、expo-file-system、expo-splash-screen 等 Expo 模块到 harmony 平台时使用此 skill。支持四种适配方式：patch-package 补丁、Metro alias 替换、本地包装包、业务层适配。输入 expo 插件名，自动发现对应鸿蒙插件。也适用于用户提到"鸿蒙适配"、"harmony 适配"、"expo 插件打 patch"等场景。
---

# Expo 插件鸿蒙化适配工作流

## 何时使用

当用户需要将 **Expo 官方插件**适配到 **HarmonyOS 平台**时，按本 Skill 执行。

使用方式：
- `/expo-harmony-adapter expo-image-picker` → 自动搜索发现鸿蒙插件
- `/expo-harmony-adapter expo-image @react-native-oh-tpl/react-native-fast-image` → 直接使用指定插件

核心思路：在 expo 插件中添加鸿蒙平台检测（`Platform.OS === 'harmony'`），转发到社区鸿蒙化插件实现。

## CLI 原生链接规则

CLI 会优先调用 RNOH 官方 `link-harmony`（识别 `package.json` 带 `harmony.autolinking` 声明的包）。官方未覆盖的插件再查询 CLI 自研 mapping；两者都未覆盖时不会自动修改原生注册。请以 `list` 输出、生成项目的 `docs/HARMONY.md` 和本 skill 为准，并按下文手动确认 HAR、ETS/C++ Package、CMake target 与 OHPM 依赖。

手动 `pnpm add` 原生依赖后必须运行 `pnpm dlx expo-harmony-cli sync` 更新注册；构建不会代替这一步。

---

## 执行原则

**先分析、再选方案、确认后才动手**：

1. 分析源码 → 发现鸿蒙插件 → 输出方案 → **等待用户确认** → 安装 → 实施
2. 方案必须包含适配方式选择（patch / Metro alias / 本地包装包）
3. 用户确认通过后才能修改源码

---

## 适配方式选择

分析完源码后，根据以下决策树选择适配方式，并在方案中向用户推荐：

### 决策树

**问 0**：关联项目（同公司/团队其他 RN 项目）是否已有该插件的大规模使用？
- 是 → 即使当前项目零引用，也选透明适配（方式 A/D2/D3）→ 直接**问 2**
- 否 → 继续**问 1**

**问 1**：业务代码中是否只用到该 expo 插件的部分 API（少量调用点）？
- 是，调用点少且可控 → **方式 D: 业务层适配**（最简单，不碰第三方代码）
- 否，全局大量使用 → **问 2**

**问 2**：适配范围是否仅限于 JS/TS 层（不涉及鸿蒙原生模块注册）？
- 是 → **问 3**
- 否 → **问 4**

**问 3**：需要完整替换组件，还是只做小范围 API 转发？
- 完整替换 → **方式 B: Metro alias**
- 小范围转发 → **方式 A: patch-package**

**问 4**：适配复杂度如何？
- 简单（1-2 个文件修改）→ **方式 A: patch-package**
- 复杂（多模块、独立类型、可复用）→ **方式 C: 本地包装包**

### 方式 A: patch-package（默认推荐）

适用：小范围外科手术式修改，加几个 `if/else` 转发 API。

- 参考：`patches/expo-clipboard+7.0.1.patch`（简单）、`patches/expo-image+2.0.7.patch`（复杂）
- 实施：修改 `node_modules/` → `npx patch-package <expo-plugin>` → 提交 patch 文件
- 优点：简单直接，diff 清晰
- 缺点：expo 插件升级时 patch 可能失效，需要重新生成

### 方式 B: Metro resolver alias

适用：JS 层组件完整替换，不需要修改原生模块注册。

- 参考：`metro.config.js` 中现有的 `resolveRequest` 和 `extraNodeModules`
- 实施：
  1. 创建 `shims/<expo-plugin>.harmony.tsx`，编写完整的鸿蒙适配组件
  2. 在 `metro.config.js` 的 `resolveRequest` 中添加平台检测，当 `RN_BUNDLE_PLATFORM === 'harmony'` 时重定向到 shim 文件
- 优点：代码直接在仓库中维护，无需 patch，类型安全，容易 code review
- 缺点：仅在 bundler 层生效，无法修改原生模块注册；需要在 shim 中完整实现组件逻辑

### 方式 C: 本地包装包

适用：复杂适配，需要完整包结构、类型定义、跨项目复用。

- 参考：`<your-project>/packages/<plugin>-harmony/`（本地包装包范式）
- 实施：
  1. 在 `packages/` 下创建 `<plugin>-harmony/` 目录
  2. 编写 `package.json`、TypeScript 源码、harmony/ 原生代码
  3. 在根 `package.json` 中添加 `"file:./packages/<plugin>-harmony"` 依赖
- 优点：正式的包结构，可类型检查、可测试、可跨项目复用
- 缺点：初始搭建成本高

### 方式 D: 业务层适配（共 3 个子模式）

适用：不修改第三方库，在业务代码层解决平台差异。

| 子模式 | 场景 | 示例 | 推荐度 |
|--------|-----|------|---------|
| **D1: inline 平台判断** | 只有 1-2 个调用点 | `if (Platform.OS === 'harmony') { ... }` | 简单场景优先 |
| **D2: .harmony.tsx 平台扩展名** | UI 组件 API 风格差异大，需完全不同的实现 | VideoPlayerContent.harmony.tsx | ✅ 推荐，最干净 |
| **D3: Metro shim 重定向** | API 层透明替换，要业务零改动 | expo-av Audio.Sound | ✅ 推荐，无侵入 |

---

#### D1: inline 平台判断（最简）

适用：只有少量调用点，封装为工具函数即可。

```typescript
async function copyToClipboard(text: string) {
  if (Platform.OS === 'harmony') {
    const Clipboard = require('@react-native-ohos/clipboard').default;
    return Clipboard.setString(text);
  }
  const ExpoClipboard = require('expo-clipboard');
  return ExpoClipboard.setStringAsync(text);
}
```

- 优点：最简单，零配置
- 缺点：调用点多会重复

---

#### D2: .harmony.tsx 平台扩展名（视频模式）

适用：**UI 组件两平台 API 风格差异大**（如 expo-video hook 式 vs react-native-video ref 式），需要完全不同的实现。

**零 Metro 配置**：当 `RN_BUNDLE_PLATFORM=harmony` 时，Metro 鸿蒙 resolver 自动优先选择 `.harmony.tsx` 文件。

**三层组件架构模板**：

```
components/player/
├── VideoPlayer.tsx              # 平台无关 Wrapper（统一 Props + Ref 接口）
├── VideoPlayerContent.tsx       # Android/iOS → expo-video
└── VideoPlayerContent.harmony.tsx  # Harmony → react-native-video
```

**Wrapper (VideoPlayer.tsx)**：

```typescript
import { forwardRef, memo, useCallback } from 'react';
import VideoPlayerContent from './VideoPlayerContent';

export interface VideoPlayerCompRef {
  play: () => void;
  pause: () => void;
  setMuted: (isMuted: boolean) => void;
  seekTo: (seconds: number) => void;
}

export interface IVideoPlayerProps {
  uri: string;
  nativeControls?: boolean;
  contentFit?: 'contain' | 'cover' | 'fill';
  autoPlay?: boolean;
  onLoadFinished?: () => void;
  onLoadError?: (error: Error) => void;
}

const VideoPlayer = memo(
  forwardRef<VideoPlayerCompRef, IVideoPlayerProps>((props, ref) => {
    const handleLoadFinished = useCallback(() => {
      props.onLoadFinished?.();
    }, [props.onLoadFinished]);
    return (
      <VideoPlayerContent
        ref={ref}
        uri={props.uri}
        nativeControls={props.nativeControls}
        contentFit={props.contentFit}
        autoPlay={props.autoPlay}
        onLoadFinished={handleLoadFinished}
        onLoadError={props.onLoadError}
      />
    );
  }),
  (prev, next) => prev.uri === next.uri
);

export default VideoPlayer;
```

**关键：Wrapper 内不包含任何平台判断**，完全靠 Metro 文件扩展名自动分发。

**属性映射示例**：expo-video `contentFit: 'fill'` → react-native-video `resizeMode: 'stretch'`

- 优点：完全隔离平台差异，代码各自独立，零配置，类型安全
- 缺点：需要写两份组件实现
- 典型案例：`expo-video` → `@react-native-ohos/react-native-video`

---

#### D3: Metro shim 重定向（音频模式）

适用：**API 层透明替换**，业务代码 `import from 'expo-av'` 零改动。

与 D2 的区别：D2 是文件粒度分发，D3 是模块粒度重定向。

**实施步骤**：

1. 创建 `shims/expo-av/index.ts` shim，完整实现 expo 插件的所有 API
2. 在 `metro.config.js` 中添加模块重定向（代码模板见下文）

```typescript
// shims/expo-av/index.ts
import HarmonySound from 'react-native-sound';

class ExpoSoundShim {
  static async createAsync(source, initialStatus) {
    // 实现与 expo-av 完全兼容的 API
  }
  async playAsync() { /* ... */ }
  async pauseAsync() { /* ... */ }
  async stopAsync() { /* ... */ }
  async setPositionAsync(ms) { /* ... */ }
  async unloadAsync() { /* ... */ }
}

export const Audio = { Sound: ExpoSoundShim };
```

业务代码 `import { Audio } from 'expo-av'` 保持不变，鸿蒙 bundle 自动走 shim。

##### Metro resolveRequest 正确代码模板（关键！）

**⚠️ 必须在所有 mergeConfig 完成后，对 finalConfig 进行包装。过早插入会被 createHarmonyMetroConfig 覆盖。**

```javascript
const finalConfig = mergeConfig(
  mergeConfig(getDefaultConfig(__dirname), baseConfig),
  harmonyConfig,
  config
);

// ✅ 正确方式：在最终合并的 config 上包装 resolveRequest
const originalResolveRequest = finalConfig.resolver?.resolveRequest;
if (originalResolveRequest) {
  finalConfig.resolver.resolveRequest = (context, moduleName, platform) => {
    // expo-av → 鸿蒙适配层（业务代码 import 'expo-av' 无感知重定向）
    if (moduleName === 'expo-av' || moduleName.startsWith('expo-av/')) {
      return {
        filePath: path.resolve(__dirname, 'shims/expo-av/index.ts'),
        type: 'sourceFile',
      };
    }
    return originalResolveRequest(context, moduleName, platform);
  };
}

module.exports = finalConfig;
```

**三种失败尝试记录**：

| 尝试方式 | 失败原因 |
|---------|---------|
| ❌ 直接在 config.resolver.resolveRequest 中写逻辑 | 被后续 `createHarmonyMetroConfig` 的 merge 操作覆盖 |
| ❌ 用 extraNodeModules 指向 shim | node_modules 中真实存在的 expo-av 包优先级更高，不会走 alias |
| ❌ 在 baseConfig 中添加 resolveRequest | 同样会被 harmonyConfig 覆盖 |

---

**方式 D 三种子模式如何选择**：

| 需求 | 推荐模式 |
|------|---------|
| 1-2 个调用点，不需要复用 | D1 |
| 自定义 UI 组件，两平台 API 风格差异大 | D2 |
| Expo API 层替换，要业务代码零改动 | D3 |

---

## 适配流程

### 步骤 0：发现鸿蒙化插件（当用户未指定鸿蒙插件时执行）

#### 0.1 确定对应的 RN 社区底层插件

Expo 插件通常是对 RN 社区插件的封装。常见映射：

| Expo 插件 | 底层 RN 社区插件 |
|-----------|-----------------|
| `expo-image` | `react-native-fast-image` |
| `expo-image-picker` | `react-native-image-picker` |
| `expo-clipboard` | `@react-native-clipboard/clipboard` |
| `expo-linear-gradient` | `react-native-linear-gradient` |
| `expo-camera` | `react-native-camera` |
| `expo-video` | `react-native-video` |
| `expo-location` | `react-native-geolocation` |
| `expo-file-system` | `react-native-fs` |
| `expo-splash-screen` | `react-native-bootsplash` |
| `expo-blur` | `@react-native-community/blur` |
| `expo-media-library` | `@react-native-camera-roll/camera-roll`（复用已有） |

> 不在上表中？阅读 expo 插件源码的 import 语句和原生模块注册来推断底层插件。

#### 0.2 按优先级搜索鸿蒙化插件

**渠道 1：Gitee 官方文档（最高优先级）**
读取 https://gitee.com/react-native-oh-library/usage-docs/blob/master/zh-cn/README.md 中的「RNOH 三方库总览」表格，搜索底层 RN 插件名称。关注 `HarmonyOSReleases` 列（`@react-native-oh-tpl/*` 或 `@react-native-ohos/*` 表示已适配）。

**渠道 2：npm 验证**
- `@react-native-ohos/<plugin>` — 新版（RN 0.77+，优先选择）
- `@react-native-oh-tpl/<plugin>` — 旧版（RN 0.72 时代，多数已 deprecated）

**渠道 3：Web 搜索（兜底）**
`"<plugin-name>" harmony react-native-oh openharmony`

#### 0.3 版本选择

优先级：`@react-native-ohos/*@latest` > `@react-native-oh-tpl/*@latest`。**必须确认 RN 0.77 兼容性**（检查 `peerDependencies`）。

#### 0.4 输出发现结果

向用户报告：

```
## 发现结果

Expo 插件 `<expo-plugin>` → 底层 RN 插件 `<rn-plugin>`

| 渠道 | 包名 | 版本 | RN 兼容 | 状态 |
|------|------|------|---------|------|
| Gitee | @react-native-ohos/xxx | x.x.x | 0.77 ✅ | 推荐 |
| npm | @react-native-oh-tpl/xxx | x.x.x | 0.72 ⚠️ | 已过期 |

推荐使用：`@react-native-ohos/<plugin>@<version>`
```

#### 0.5 未找到时停下来

如果三渠道均未找到 RN 0.77 兼容的鸿蒙插件，**必须停下来向用户报告**，给出可选方案：

1. **终止适配** — 当前暂不适配鸿蒙
2. **尝试 RN 0.72 版本** — 可能存在兼容问题
3. **寻找替代插件** — 如 `expo-image-picker` → `@react-native-ohos/react-native-image-crop-picker`
4. **复用项目中已有的鸿蒙插件** — 分析已有鸿蒙插件的 API 覆盖范围，看是否能满足业务需求。如 `expo-media-library` → 复用已有的 `@react-native-ohos/camera-roll`
5. **自行实现鸿蒙原生模块** — 参考 harmony-plugin-integration skill

**等待用户选择后再决定是否继续。**

---

### 步骤 1：安装依赖

为了能阅读源码做分析，需要先将插件安装到 `node_modules/`。

```bash
# Expo 插件（必须用 npx expo install，自动匹配当前 SDK 版本）
npx expo install <expo-plugin-name>

# 鸿蒙插件（用 yarn add 指定版本）
yarn add <harmony-plugin-name>@<version>
```

> **注意**：不要用 `yarn add expo-xxx`，否则会装到不兼容的最新大版本。`npx expo install` 会根据当前 Expo SDK 版本自动选择兼容版本。

> **如果 expo 插件已经安装过**（项目已有依赖），只需安装鸿蒙插件即可。

---

### 步骤 2：分析源码，确定适配方案

#### 2.1 阅读 Expo 插件源码

```bash
ls node_modules/<expo-plugin>/src/   # 或 build/ 目录
```

关注：主要组件、原生模块（`requireNativeModule`）、类型定义、工具函数。

**⚠️ 2.1.1 原生模块 import 链检查（必检项）**

**严重问题**：Expo 插件的 JS 文件可能在**顶层**执行 `requireNativeModule('ExpoXXX')`。即使所有 API 调用都被 harmony 分支拦截，import 语句本身就会触发原生模块加载，导致 `Cannot find native module` 崩溃。

**检查步骤**：
1. 找到 expo 插件的所有 `build/` 或 `src/` 下的 JS 文件
2. 检查是否存在顶层 `requireNativeModule()` 或 `import NativeX from './NativeX'`（NativeX 内部调用 requireNativeModule）
3. 如果存在：**必须同时 patch 这个文件**，在 harmony 平台返回 mock 对象

**patch 模板（ExpoMediaLibrary.js 示例）**：
```javascript
import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
const IS_HARMONY = Platform.OS === 'harmony';

let NativeModule;
if (IS_HARMONY) {
  // HarmonyOS: mock 所有被引用的静态属性和方法
  NativeModule = {
    MediaType: { audio: 'audio', photo: 'photo', video: 'video', unknown: 'unknown' },
    SortBy: { default: 'default', creationTime: 'creationTime' },
    CHANGE_LISTENER_NAME: 'onMediaLibraryChange',
    addListener: () => ({ remove: () => {} }),
    removeListeners: () => {},
    removeAllListeners: () => {},
  };
} else {
  NativeModule = requireNativeModule('ExpoMediaLibrary');
}
export default NativeModule;
```

**验证方法**：grep node_modules/<expo-plugin>/build/*.js -l "requireNativeModule"

#### 2.2 分析鸿蒙插件 API（四层分析）

**层 1：JS 层 TypeScript 类型**
```bash
cat node_modules/<harmony-plugin>/src/index.ts
cat node_modules/<harmony-plugin>/src/types.ts
```

**层 2：鸿蒙原生 ArkTS 实现（关键！）**

必须阅读原生实现来验证哪些 API **真正**可用（而非仅在类型中声明）：
```bash
cat node_modules/<harmony-plugin>/harmony/<plugin>/src/main/ets/*TurboModule.ts
```

**层 3：C++ 桥接层**
```bash
cat node_modules/<harmony-plugin>/harmony/<plugin>/src/main/cpp/*TurboModule.cpp
```

**层 4：JS 入口可行性验证（关键！）**

检查鸿蒙插件的 JS 入口文件能否在 harmony 平台正常加载，避免运行时崩溃：
```bash
cat node_modules/<harmony-plugin>/src/index.tsx   # 或 index.ts
```

重点检查：
1. **内部是否 `import` 了原始 RN 包**：如 `import docPicker from 'react-native-document-picker'`。原始包的 `perPlatformTypes` 等平台相关逻辑通常不包含 `harmony` 键，会导致运行时 `undefined` 错误。
2. **是否有 `perPlatformTypes[Platform.OS]` 模式**：如果鸿蒙插件直接复用原始包的类型定义（如 `fileTypes.ts`），确认 `harmony` 键是否存在。
3. **是否有 `TurboModuleRegistry.getEnforcing()` 在顶层调用**：即使不调用方法，某些 RN 版本的 `getEnforcing` 可能在 import 时就抛异常。

**如果层 4 发现风险**：
- 不通过 `require('harmony-plugin').default` 加载 JS 入口
- 改用 **TurboModule 直调模式**（见方式 A 补充说明），直接调用原生模块
- 在 patch 中自行处理参数转换和结果映射

**验证原则**：
- **以源码为准**：Gitee 文档可能过时，源码是 ground truth
- **不能仅凭 TypeScript 类型判定**：有些字段声明了但原生未使用
- **检查 `harmony.alias`**：鸿蒙插件 `package.json` 中可能有 alias（如 `@react-native-ohos/react-native-image-picker` 的 alias 是 `react-native-image-picker`），patch 中 `require()` 时应使用 alias
- **JS 入口不是总能用**：当鸿蒙插件的 JS 入口内部依赖原始包且原始包不支持 harmony 时，需要绕过 JS 层

**原生层 bug 检查清单**（阅读 ArkTS 实现时重点关注）：

| 检查点 | 反例（react-native-sound） |
|--------|--------------------------|
| **状态是否实例级共享** | `isPlaying` 是类单字段，多个播放器共用同一个状态 |
| **关键回调可靠性** | `play(onEnd)` 的 onEnd 在 stop/pause 时不会触发 |
| **stop/pause 实现差异** | `stop()` 守卫条件为 `if (this.isPlaying)`，状态上报延迟时会跳过执行 |
| **异常中断处理** | 播放中被系统中断（如来电），是否有恢复机制 |

⚠️ **发现 stop 不可靠时，在适配层改用 pause + setCurrentTime(0) 模拟 stop**

#### 2.3 构建 API 映射表

| Expo API | 鸿蒙 API | 映射方式 | 源码验证 |
|----------|----------|----------|---------|
| `source` | `source` | 直接映射 | `TurboModule.ts:334` ✅ |
| `contentFit` | `resizeMode` | 需转换 | `ExpoImageHarmony()` ✅ |
| `exif` | — | — | 无对应 ❌ |

状态标注：✅ 已验证 / ⚠️ 声明未实现 / ❌ 不支持

---

### 步骤 3：输出适配方案并等待确认

**必须向用户展示方案并获得确认后才能继续。** 方案应包含：

1. **基本信息**：Expo 插件版本 + 鸿蒙插件版本
2. **推荐适配方式**（A/B/C/D）及理由
3. **需要修改的文件**清单
4. **API 映射关系**表
5. **不支持的功能**及替代方案
6. **鸿蒙原生模块配置**（4 个文件）
7. **测试计划**

向用户展示后等待回复「确认」→ 继续步骤 4；用户提出修改 → 调整方案重新输出；用户取消 → 终止。

---

### 步骤 4：实施适配

根据步骤 3 确认的适配方式执行：

#### 方式 A: patch-package

**子模式：JS 封装层转发 vs TurboModule 直调**

鸿蒙插件的 JS 入口文件可能内部依赖原始 RN 包（见步骤 2.2 层 4 分析），导致运行时崩溃。根据分析结果选择子模式：

| 子模式 | 适用场景 | 说明 |
|--------|---------|------|
| JS 封装层转发 | 鸿蒙插件 JS 入口可正常加载 | `require('harmony.alias').default` 加载鸿蒙插件的 JS API |
| TurboModule 直调 | 鸿蒙插件 JS 入口不可用（层 4 发现风险） | `TurboModuleRegistry.getEnforcing('NativeModuleName')` 直调原生模块 |

**TurboModule 直调模式示例**：

```javascript
import { Platform, TurboModuleRegistry } from 'react-native';

// 直接获取原生模块，绕过可能有问题的 JS 封装层
let NativePicker = null;
if (Platform.OS === 'harmony') {
  NativePicker = TurboModuleRegistry.getEnforcing('RNDocumentPicker');
}

async function getDocumentAsyncHarmony({ type, multiple }) {
  const results = await NativePicker.pick({
    type: extensions,
    allowMultiSelection: multiple,
  });
  // 自行处理参数转换和结果映射
  return { canceled: false, assets: results.map(...) };
}
```

优点：完全绕过 JS 层兼容问题，最可靠。
缺点：需要自行处理所有参数转换和结果映射，无法复用鸿蒙插件的 JS 层校验逻辑。

1. **参考现有 patch 学习模式**：

   ```bash
   # 简单示例（API 转发）
   cat patches/expo-clipboard+7.0.1.patch

   # 复杂示例（组件替换 + 事件映射 + 静态方法）
   cat patches/expo-image+2.0.7.patch
   ```

2. **修改 `node_modules/` 中的源码**，关键修改点：

   - **平台检测**：`const IS_HARMONY = Platform.OS === 'harmony';`
   - **懒加载鸿蒙插件**：用 `require()` 动态加载，包名使用 `harmony.alias`
   - **API 映射转换**：属性名、事件格式、方法签名的差异处理
   - **条件导出**：`export default IS_HARMONY ? ExpoPluginHarmony : ExpoPluginNative;`
   - **React Hook 适配**：如果 expo 插件导出 Hook（如 `usePermissions`、`useCameraRoll`），harmony 替代实现也必须是合法 Hook（内部可以使用 `useState`）。不能在非组件上下文中调用。

     **Hook 适配模板**（usePermissions 示例）：
     ```javascript
     // 模块顶层：动态获取 React.useState
     let __harmonyUseState;
     try { __harmonyUseState = require('react').useState; } catch(e) { __harmonyUseState = (v) => [v, () => {}]; }

     function _harmonyUsePermissions(options) {
       const [response, setResponse] = __harmonyUseState(null);
       const getPermission = async () => {
         const r = { status: 'granted', granted: true, expires: 'never', canAskAgain: true };
         setResponse(r);
         return r;
       };
       const requestPermission = async () => {
         const r = { status: 'granted', granted: true, expires: 'never', canAskAgain: true };
         setResponse(r);
         return r;
       };
       return [response, requestPermission, getPermission];
     }

     // 条件导出 Hook
     export const usePermissions = IS_HARMONY ? _harmonyUsePermissions : createPermissionHook({...});
     ```

   - **缓存查找模式**：当鸿蒙插件缺少单个资源查询 API（如 `getAssetInfoAsync`）时，在列表查询（如 `getAssetsAsync`）调用时缓存结果到模块级 Map，单个查询从缓存中查找：

     ```javascript
     // 模块顶层缓存
     let _harmonyAssetCache = new Map();

     // 列表查询时缓存
     async function _harmonyGetAssetsAsync(options) {
       const result = await CameraRoll.getPhotos(params);
       const assets = (result.edges || []).map(edge => {
         const asset = _harmonyPhotoNodeToAsset(edge.node);
         _harmonyAssetCache.set(asset.id, edge.node);  // 缓存原始节点
         return asset;
       });
       return { assets, ... };
     }

     // 单个查询时读缓存
     async function _harmonyGetAssetInfoAsync(assetId) {
       const cachedNode = _harmonyAssetCache.get(assetId);
       if (cachedNode) return _harmonyPhotoNodeToAssetInfo(cachedNode);
       // 缓存未命中时返回 fallback
       return { id: assetId, ...fallback };
     }
     ```

3. **生成 patch**：

   ```bash
   npx patch-package <expo-plugin-name>
   ```

4. **验证 patch**：检查 `patches/<expo-plugin>+*.patch` 内容是否完整

#### 方式 B: Metro alias

1. **创建 shim 文件** `shims/<expo-plugin>.harmony.tsx`：

   ```typescript
   import { Platform } from 'react-native';
   // 导入鸿蒙插件，实现完整的 expo API 兼容层
   import HarmonyPlugin from '<harmony-plugin>';

   // 实现 expo 插件导出的所有 Props 和方法
   export default function ExpoPluginShim(props: ExpoPluginProps) {
     // API 映射 + 组件渲染
   }

   // 导出静态方法
   export const staticMethod = HarmonyPlugin.staticMethod;
   ```

2. **在 `metro.config.js` 添加重定向**：

   在已有的 `resolveRequest` 逻辑中，当 `RN_BUNDLE_PLATFORM === 'harmony'` 时，将 `<expo-plugin>` 的导入重定向到 `shims/<expo-plugin>.harmony.tsx`。

3. **无需生成 patch**，代码直接在仓库中维护。

#### 方式 C: 本地包装包

1. **创建包目录**：参考本地包装包范式 `packages/<plugin>-harmony/` 的结构

   ```
   packages/<expo-plugin>-harmony/
   ├── package.json
   ├── src/
   │   └── index.ts
   └── harmony/
       └── <plugin>.har
   ```

2. **编写适配代码**：TypeScript 源码中实现 expo API → 鸿蒙 API 的完整映射

3. **注册依赖**：在根 `package.json` 中添加 `"file:./packages/<expo-plugin>-harmony"`

4. **配置原生模块**：参考步骤 5

#### 方式 D: 业务层适配

1. **定位所有调用点**：搜索业务代码中对 expo 插件的引用

   ```bash
   grep -rn "from '<expo-plugin>'" app/ src/
   grep -rn "import.*<expo-plugin>" app/ src/
   ```

2. **在调用点添加平台判断**：根据调用方式选择适配模式

   - **方法调用**：封装为工具函数，内部按平台分发
   - **组件使用**：封装为业务组件，内部按平台渲染不同实现
   - **文件级拆分**：创建 `.harmony.ts` 后缀文件，通过 Metro 平台扩展自动解析

3. **无需修改第三方代码**，也无需配置原生模块（鸿蒙插件的原生模块配置仍需执行步骤 5）。

---

### 步骤 5：配置鸿蒙原生模块

> 详细步骤参考 `harmony-plugin-integration` skill，以下为快速清单。

鸿蒙原生模块分两类，注册方式不同：

| 类型 | 说明 | 示例 |
|------|------|------|
| **TurboModule（纯 JS API 调用）** | 只有原生方法，无 UI 渲染，不继承 `ViewManager` | react-native-sound、react-native-document-picker |
| **UI 组件（ViewManager）** | 需要在 RN 视图树中渲染，继承 `ViewManager` | react-native-fast-image、react-native-linear-gradient |

---

#### 5.1 两类插件的注册方式差异

**TurboModule 类**（纯 API，无 UI）：
- CMakeLists.txt：**只链接** `rnoh_<plugin>`，**不需要** `add_subdirectory`
- PackageProvider.cpp：`#include <plugin>/TurboModulePackage.h`
- RNPackagesFactory.ets：`import { <Plugin>Package } from "<plugin>"`

**UI 组件类**（有 ViewManager）：
- CMakeLists.txt：**需要** `add_subdirectory` + `target_link_libraries`
- PackageProvider.cpp：`#include <plugin>/Package.h`
- RNPackagesFactory.ets：`import { <Plugin>Package } from "<plugin>"`

---

#### 5.2 修改 4 个文件（通用模板）

1. **`harmony/entry/oh-package.json5`** — 添加 `.har` 依赖（两类相同）
   ```json5
   "<harmony-plugin-name>": "file:../../node_modules/<harmony-plugin-name>/harmony/<har-file>.har"
   ```

2. **`harmony/entry/src/main/cpp/CMakeLists.txt`**

   **UI 组件类**（需要完整编译）：
   ```cmake
   set(<PLUGIN>_CPP_DIR "${NODE_MODULES}/<harmony-plugin-name>/harmony/<plugin>/src/main/cpp")
   add_subdirectory("${<PLUGIN>_CPP_DIR}" ./<plugin>)
   target_link_libraries(rnoh_app PUBLIC rnoh_<plugin>)
   ```

   **TurboModule 类**（har 预编译，仅需链接）：
   ```cmake
   # 不需要 add_subdirectory，直接链接
   target_link_libraries(rnoh_app PUBLIC rnoh_<plugin>)
   ```

3. **`harmony/entry/src/main/cpp/PackageProvider.cpp`** — 注册 C++ Package
4. **`harmony/entry/src/main/ets/RNPackagesFactory.ets`** — 注册 ArkTS Package

> 具体代码模板见 `harmony-plugin-integration` skill 或参考 `docs/expo-image-harmony-adapter.md` 的「HarmonyOS 原生模块配置」章节。

> **验证提示**：修改完 CMakeLists.txt 后，在 DevEco Studio 中执行 `Sync Project` → `Build` → 检查是否有链接错误。无错误再继续。

---

### 步骤 6：测试与文档

#### 6.1 添加测试示例

在 `app/DemoPage.tsx` 中添加测试代码。参考现有测试模式：

- 基础功能测试
- 事件回调测试（onLoad、onError 等）
- 不同配置选项测试
- 错误处理测试

每个测试区段用 `Platform.OS` 标注当前平台和使用的适配插件。

#### 6.2 创建适配文档

在 `docs/` 目录创建 `<expo-plugin>-harmony-adapter.md`，参考 `docs/expo-linear-gradient-harmony-adapter.md`（最简洁的适配文档模板）。

文档应包含的章节：概述 → 补丁文件 → 原生模块配置 → API 映射表 → 不支持的功能 → 使用示例 → 测试示例 → 故障排查 → 版本兼容性 → 维护说明

更新 `docs/README.md` 索引。

---

## 故障排查

### patch 未生效

```bash
rm -rf node_modules && yarn install
grep "IS_HARMONY" node_modules/<expo-plugin>/src/<file>
```

### patch 后编译报错

1. patch 文件名中的版本号与 `package.json` 不一致 → 重新生成 patch
2. `require()` 路径未使用 `harmony.alias` → 检查鸿蒙插件 package.json 的 `harmony.alias` 字段
3. expo-modules-core 引用问题 → 确认已用 `react-native` 的 `Platform` 替代

### 回滚

```bash
git checkout patches/<expo-plugin>+*.patch
rm -rf node_modules && yarn install
```

### Metro alias 不生效

确认 `RN_BUNDLE_PLATFORM=harmony` 环境变量已设置，且 `resolveRequest` 中重定向逻辑优先级正确。

### `Cannot read property 'xxx' of undefined`

**原因**：鸿蒙插件的 JS 入口内部 `import` 了原始 RN 包，原始包的 `perPlatformTypes` 等平台相关对象没有 `harmony` 键，导致 `perPlatformTypes[Platform.OS]` 返回 `undefined`。

**解决方案**：不通过 `require('harmony-plugin').default` 加载 JS 入口，改用 `TurboModuleRegistry.getEnforcing('NativeModuleName')` 直接调用原生模块（见方式 A 的 TurboModule 直调模式）。

### 模拟器上文件选择器打开无文件

HarmonyOS 系统文件选择器默认显示「最近」页，如果近期没有操作过文件则为空，需手动切换到「浏览」页。

可通过 `hdc` 推送测试文件到模拟器的用户目录：
```bash
hdc file send test.txt /mnt/user/100/sharefs/docs/currentUser/Documents/test.txt
hdc file send test.pdf /mnt/user/100/sharefs/docs/currentUser/Download/test.pdf
```

---

## 验收标准

- [ ] 适配方式已选择并说明理由
- [ ] Patch 文件已生成（方式 A）/ shim 文件已创建（方式 B）/ 包装包已搭建（方式 C）
- [ ] **Expo 插件的原生模块 import 链已检查并 mock**（不仅是主 JS 文件，包括所有顶层调用 requireNativeModule 的文件）
- [ ] **React Hook 类 API 有合法的 Hook 实现**（不是普通函数，内部使用 useState 等 Hook）
- [ ] 鸿蒙原生模块已正确配置（4 个文件）
- [ ] `app/DemoPage.tsx` 中有测试示例
- [ ] 适配文档已创建并添加到 `docs/README.md` 索引
- [ ] 三端（iOS/Android/Harmony）代码无冲突
- [ ] 事件回调、错误处理正常

---

## 注意事项

1. **版本锁定**：`package.json` 中的 expo 插件版本必须与 patch 文件名版本一致
2. **降级处理**：鸿蒙插件加载失败时，应降级到 RN 原生实现
3. **事件格式适配**：expo 和鸿蒙插件的事件格式可能不同，需转换
4. **版本优先级**：`@react-native-ohos/*`（RN 0.77）> `@react-native-oh-tpl/*`（RN 0.72，多数已 deprecated）
5. **harmony.alias 规则**：`require()` 时使用 alias 而非原始包名

---

## 示例参考

| 复杂度 | Expo 插件 | 适配方式 | 关键技术点 | 文档 | Patch / 位置 |
|--------|-----------|---------|-----------|------|-------------|
| 简单 | expo-linear-gradient | A (patch) | UI 组件，属性映射 | `docs/expo-linear-gradient-harmony-adapter.md` | `patches/expo-linear-gradient+14.0.2.patch` |
| 简单 | expo-clipboard | A (patch) | TurboModule，API 转发 | — | `patches/expo-clipboard+7.0.1.patch` |
| 简单 | expo-status-bar | A (patch) | 全局 ViewManager，无方法 | `docs/expo-status-bar-harmony-adapter.md` | `patches/expo-status-bar+2.0.1.patch` |
| 复杂 | expo-image | A (patch) | 组件替换 + 事件映射 + 静态方法 | `docs/expo-image-harmony-adapter.md` | `patches/expo-image+2.0.7.patch` |
| 复杂 | expo-image-picker | A (patch) | Promise 封装 + 结果映射 | `docs/expo-image-picker-harmony-adapter.md` | `patches/expo-image-picker+16.0.6.patch` |
| 简单 | expo-document-picker | A (patch) | TurboModule 直调，绕过 JS 入口 | `docs/expo-document-picker-harmony-adapter.md` | `patches/expo-document-picker+13.0.3.patch` |
| 中等 | expo-av | D3 (Metro shim) | 完整 API 兼容，业务零改动 | `docs/expo-av-harmony-adapter.md` | `shims/expo-av/index.ts` |
| **复杂** | **expo-media-library** | **A (patch)** | **顶层 NativeModule mock + Hook 适配 + 缓存模式** | `docs/expo-media-library-harmony-adapter.md` | `patches/expo-media-library+17.0.6.patch` |
| 本地包 | expo-constants | C (包装包) | 独立包结构，可跨项目复用 | — | `packages/<plugin>-harmony/`（示例范式） |
| 本地包 | expo-linking | C (包装包) | 独立包结构，可跨项目复用 | — | `packages/<plugin>-harmony/`（示例范式） |
