---
name: harmony-plugin-integration
description: 鸿蒙 React Native 插件集成工作流。当用户要在 harmony 鸿蒙工程中集成 @react-native-ohos/* 类原生插件时，按本 skill 执行；以 react-native-pager-view 为例。必须先拿到并阅读该插件的集成文档后再改代码；若文档与 skill 步骤不一致，须先向用户询问再继续。
---

# 鸿蒙 React Native 插件集成工作流

## 何时使用本 Skill

当用户要在 **React Native 鸿蒙工程（harmony）** 中集成 **@react-native-ohos/xxx** 类鸿蒙原生插件时，按本 Skill 执行。示例插件：**@react-native-ohos/react-native-pager-view**。

---

## 前置步骤（必须先做）

1. **拿到并打开该插件的「鸿蒙集成文档」**（用户提供链接或正文）：
   - **优先用浏览器 MCP 打开文档链接**；若打不开或超时，**必须向用户索要文档的具体内容**（粘贴全文或关键章节），**一定要看到文档内容后再改代码**。
2. **确认 RN 0.77 适配版本**：在文档或 npm 上**明确确认**该插件标注支持 React Native 0.77 的版本号（如 `x.y.z-rc.n`），安装与配置均按该版本执行。
3. **通读文档**，重点确认：
   - **推荐安装的版本**（如 `x.y.z` 或 `x.y.z-rc.n`）；
   - **手动 link 部分**：
     - 鸿蒙侧依赖的 **.har 路径**（如 `harmony/xxx.har`）；
     - **C++ 头文件 / 类名**（如 `ViewPagerPackage.h`、`ViewPagerPackage`）；
     - **CMake 子目录路径**（如 `src/main/cpp`）；
     - **CMake target 名称**（如 `rnoh_pager_view`，用于 `target_link_libraries`）；
     - **ArkTS 侧包名与路径**（如 `@react-native-ohos/react-native-pager-view/ts` 的 `ViewPagerPackage`）。

**未读完文档、未确认 0.77 版本前不要改代码。**

4. **文档与本 Skill 不一致时必须询问用户**：若用户提供的集成文档中的步骤、路径、类名、target 名等与下述「集成步骤」中的描述或示例**有任何不一致**，**必须先向用户说明差异并询问**：「文档中写的是 ……，本 Skill 中写的是 ……，应以哪一方为准？」在用户明确答复后再继续执行，不得自行择一执行。

---

## 集成步骤（在已读文档且已处理不一致项后执行）

### 1. 安装 npm 依赖

在项目根目录执行（版本以文档为准）：

```bash
yarn add @react-native-ohos/<插件名>@<文档推荐版本>
```

例：`yarn add @react-native-ohos/react-native-pager-view@x.x.x`

---

### 2. 修改 `harmony/entry/oh-package.json5`

在 `dependencies` 中增加一条，**har 路径以文档为准**（常见为 `harmony/包名.har`）：

```json5
"@react-native-ohos/<插件名>": "file:../../node_modules/@react-native-ohos/<插件名>/harmony/<har 文件名>.har"
```

例：`"@react-native-ohos/react-native-pager-view": "file:../../node_modules/@react-native-ohos/react-native-pager-view/harmony/pager_view.har"`

若文档写的是其他 har 名或子路径（如 `reactNativeMMKV.har`、`gesture_handler.har`），按文档改。

---

### 3. 修改 `harmony/entry/src/main/cpp/CMakeLists.txt`

- 在 **「添加第三方原生包的子目录」** 区域增加一行（路径与子目录名以文档为准）：

```cmake
add_subdirectory("${OH_MODULE_DIR}/@react-native-ohos/<插件名>/src/main/cpp" ./<子目录名>)
```

例：`add_subdirectory("${OH_MODULE_DIR}/@react-native-ohos/react-native-pager-view/src/main/cpp" ./pager_view)`

- 在 **`target_link_libraries(rnoh_app PUBLIC ...)`** 中增加该插件对应的 target（**target 名以文档或该插件自身 CMakeLists.txt 为准**）：

```cmake
target_link_libraries(rnoh_app PUBLIC <target 名>)
```

例：`target_link_libraries(rnoh_app PUBLIC rnoh_pager_view)`。不同插件的 target 可能不同（如 `rnoh_gesture_handler`、`rnoh_safe_area`、`rnoh_native_mmkv`），需从文档或插件源码确认。

---

### 4. 修改 `harmony/entry/src/main/cpp/PackageProvider.cpp`

- 在文件顶部增加头文件（**头文件名以文档为准**）：

```cpp
#include "<Package 类名>.h"
```

例：`#include "ViewPagerPackage.h"`

- 在 `getPackages` 的 `return` 向量中增加（**类名以文档为准**）：

```cpp
std::make_shared<Package类名>(ctx)
```

例：`std::make_shared<ViewPagerPackage>(ctx)`。保持与现有 Package 顺序一致，仅追加即可。

---

### 5. 修改 `harmony/entry/src/main/ets/RNPackagesFactory.ets`

- 增加 import（**路径与导出名以文档为准**，常见为 `.../ts`）：

```ts
import { <Package 类名> } from '@react-native-ohos/<插件名>/ts';
```

例：`import { ViewPagerPackage } from '@react-native-ohos/react-native-pager-view/ts';`

- 在 `createRNPackages` 的返回数组中增加：

```ts
new <Package 类名>(ctx)
```

例：`new ViewPagerPackage(ctx)`

---

### 6. 在 Demo 页增加使用示例

在 **`app/DemoPage.tsx`**（或用户指定的 Demo 页）中，按文档的 API 增加该插件的**最小可运行示例**（如引入组件、渲染、必要 props），便于验证集成是否成功。

- **JS/TS 侧 import 的库名**：若插件的 `package.json` 里配置了 `"harmony": { "alias": "xxx" }`，则**业务代码里必须按 alias 的包名 import**，不要用 `@react-native-ohos/xxx`。例如 flash-list 的 alias 是 `@shopify/flash-list`，应写：`import { FlashList } from "@shopify/flash-list";`，**不要**写 `import { FlashList } from '@react-native-ohos/flash-list';`。未配置 alias 的插件则仍用 `@react-native-ohos/xxx`。

---

## 收尾

1. **与文档逐项核对**：版本、har 路径、CMake 路径、头文件/类名、ArkTS 包路径、target 名、Demo 用法是否与文档一致（若此前曾因文档与 Skill 不一致而询问过用户，以用户确认的为准）。
2. **确认无误后告知用户**：「鸿蒙侧已按文档完成配置，请在本机执行 **`ohpm install`**（在 `harmony/entry` 或文档指定目录）同步依赖，然后重新编译运行鸿蒙应用。」

---

## 注意事项

- **文档优先，不一致必问**：先用浏览器 MCP 打开用户提供的文档链接；打不开则向用户要文档正文，**必须看到文档内容**再执行集成。执行过程中若发现**文档与本 Skill 的步骤、路径、命名等不一致**，**必须先向用户询问并以用户确认为准**，再继续改代码。
- **文档必须可见**：未拿到、未阅读到文档正文前不要改代码。
- **0.77 版本**：安装与配置前**务必确认**该插件标明支持 React Native 0.77 的版本号，避免版本不匹配。
- **业务代码 import**：若插件有 `harmony.alias`（如 `@shopify/flash-list`），Demo 与业务代码中 **import 一律用 alias 包名**，不用 `@react-native-ohos/xxx`。
- **har 路径**：不同插件可能为 `harmony/xxx.har` 或 `packages/xxx/harmony/xxx.har`，以文档为准。
- **CMake target 名**：必须与插件内 `add_library` 的目标名一致，否则链接失败；不确定时查插件仓库中的 `CMakeLists.txt`。
- **ArkTS 导入路径**：有的包是 `@react-native-ohos/xxx/ts` 导出 Package，有的是默认导出，以文档或 `package.json` 的 `exports` 为准。
- 若文档要求修改 **harmony/oh-package.json5**（工程级）或 **RNPackagesFactory 的注册顺序**，也一并按文档执行。
