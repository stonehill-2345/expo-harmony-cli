---
name: harmony-plugin-integration
description: 鸿蒙 React Native 插件集成工作流。当用户要在 harmony 鸿蒙工程中集成 @react-native-ohos/* 类原生插件时，按本 skill 执行；以 react-native-pager-view 为例。适用于需要核对 npm 发布物、HAR、CMake target、ETS/C++ Package 和 autolinking 的场景。
---

# 鸿蒙 React Native 插件集成工作流

## 何时使用本 Skill

当用户要在 **React Native 鸿蒙工程（harmony）** 中集成 **@react-native-ohos/xxx** 类鸿蒙原生插件时，按本 Skill 执行。示例插件：**@react-native-ohos/react-native-pager-view**。

---

## 前置步骤（必须先做）

1. **下载并检查目标 npm 发布物**：以实际安装的 tarball 为准读取 `package.json`、`harmony/`、HAR、CMakeLists、ETS/C++ Package 和 JS 入口。
2. **确认 RN 0.82 适配版本**：发布物依赖、peerDependencies、源码分支和官方版本表必须能共同证明目标版本支持 React Native 0.82。
3. **再通读官方集成文档**，重点核对：
   - **推荐安装的版本**（如 `x.y.z` 或 `x.y.z-rc.n`）；
   - **手动 link 部分**：
     - 鸿蒙侧依赖的 **.har 路径**（如 `harmony/xxx.har`）；
     - **C++ 头文件 / 类名**（如 `ViewPagerPackage.h`、`ViewPagerPackage`）；
     - **CMake 子目录路径**（如 `src/main/cpp`）；
     - **CMake target 名称**（如 `rnoh_pager_view`，用于 `target_link_libraries`）；
     - **ArkTS 侧包名与路径**（如 `@react-native-ohos/react-native-pager-view/ts` 的 `ViewPagerPackage`）。

**未检查发布物源码、未确认 0.82 版本前不要改代码。**

4. **源码优先**：文档与 npm 发布物不一致时，以用户实际会安装的发布物为准，并在适配记录中写明差异。发布物本身存在互相冲突的入口、类型或原生注册信息时再停止并询问用户。

---

## 集成步骤（在已核对发布物源码和文档后执行）

### 1. 安装 npm 依赖

在项目根目录执行（使用已经过发布物和 peerDependencies 核验的精确版本）：

```bash
yarn add @react-native-ohos/<插件名>@<文档推荐版本>
```

例：`yarn add @react-native-ohos/react-native-pager-view@x.x.x`

---

### 2. 修改 `harmony/entry/oh-package.json5`

在 `dependencies` 中增加一条，**HAR 路径以 npm 发布物中的实际文件为准**（常见为 `harmony/包名.har`）：

```json5
"@react-native-ohos/<插件名>": "file:../../node_modules/@react-native-ohos/<插件名>/harmony/<har 文件名>.har"
```

例：`"@react-native-ohos/react-native-pager-view": "file:../../node_modules/@react-native-ohos/react-native-pager-view/harmony/pager_view.har"`

如果文档写的是其他 HAR 名或子路径（如 `reactNativeMMKV.har`、`gesture_handler.har`），先与发布物核对，使用实际存在的路径。

---

### 3. 修改 `harmony/entry/src/main/cpp/CMakeLists.txt`

- 在 **「添加第三方原生包的子目录」** 区域增加一行（路径与子目录名以包内 `CMakeLists.txt` 为准）：

```cmake
add_subdirectory("${OH_MODULE_DIR}/@react-native-ohos/<插件名>/src/main/cpp" ./<子目录名>)
```

例：`add_subdirectory("${OH_MODULE_DIR}/@react-native-ohos/react-native-pager-view/src/main/cpp" ./pager_view)`

- 在 **`target_link_libraries(rnoh_app PUBLIC ...)`** 中增加该插件对应的 target（**target 名以该插件自身 `CMakeLists.txt` 为准**）：

```cmake
target_link_libraries(rnoh_app PUBLIC <target 名>)
```

例：`target_link_libraries(rnoh_app PUBLIC rnoh_pager_view)`。不同插件的 target 可能不同（如 `rnoh_gesture_handler`、`rnoh_safe_area`、`rnoh_native_mmkv`），需从插件源码确认并用文档交叉检查。

---

### 4. 修改 `harmony/entry/src/main/cpp/PackageProvider.cpp`

- 在文件顶部增加头文件（**头文件名以发布物中的实际导出为准**）：

```cpp
#include "<Package 类名>.h"
```

例：`#include "ViewPagerPackage.h"`

- 在 `getPackages` 的 `return` 向量中增加（**类名以头文件中的实际定义为准**）：

```cpp
std::make_shared<Package类名>(ctx)
```

例：`std::make_shared<ViewPagerPackage>(ctx)`。保持与现有 Package 顺序一致，仅追加即可。

---

### 5. 修改 `harmony/entry/src/main/ets/RNPackagesFactory.ets`

- 增加 import（**路径与导出名以发布物中的 ArkTS 导出为准**，常见为 `.../ts`）：

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

- **源码优先、文档为辅**：发布物决定实际路径、命名和 API；官方文档用于发现候选版本和补充使用说明。
- **0.82 版本**：安装与配置前必须确认该插件的发布物与 React Native 0.82 版本闭环，避免把 0.77 包带入新项目。
- **业务代码 import**：若插件有 `harmony.alias`（如 `@shopify/flash-list`），Demo 与业务代码中 **import 一律用 alias 包名**，不用 `@react-native-ohos/xxx`。
- **HAR 路径**：不同插件可能为 `harmony/xxx.har` 或 `packages/xxx/harmony/xxx.har`，以 npm 发布物中的实际文件为准。
- **CMake target 名**：必须与插件内 `add_library` 的目标名一致，否则链接失败；不确定时查插件仓库中的 `CMakeLists.txt`。
- **ArkTS 导入路径**：有的包是 `@react-native-ohos/xxx/ts` 导出 Package，有的是默认导出，以文档或 `package.json` 的 `exports` 为准。
- 若文档要求修改 **harmony/oh-package.json5**（工程级）或 **RNPackagesFactory 的注册顺序**，也一并按文档执行。
