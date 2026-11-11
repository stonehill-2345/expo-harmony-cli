# A：运行时与第 3 步导航收尾

先读 [COMMON.md](COMMON.md)。启动变量 `SDK54_ROLE=A`。任务顺序 A-31 → A-32 → A-33 → A-34；B/C 未交付不能阻止前三项的源码、主机与本机原生开发。不能独自关闭第 3 步或 M4。

先执行，再运行 COMMON 的启动命令：

```sh
export SDK54_ROLE=A
```

## 修改范围

允许修改：`packages/expo-{modules-core,router,font,asset,linking,splash-screen,status-bar,system-ui,web-browser}/` 内的运行时、Harmony native/tests/example、模块 plugin；本轮重点只动相关缺口，不趁机重构所有模块。

Screens 专属范围：`packages/expo-modules-autolinking/scripts/harmony/prepare-screens.py`、`released-compatibility.json`；`packages/expo-modules-core/harmony/example/router/prepare-screens.py`；`scripts/sdk54/external-overlays/react-native-screens-4.9.0/`；`scripts/sdk54/__tests__/screens-harmony-boolean.test.mjs`、`released-compatibility.test.mjs`。两份转换器必须保持一致，固定上游输入 hash，输出 hash 随真实内容更新。

新任务入口放 `scripts/sdk54/abc/a-*`，测试放 `scripts/sdk54/__tests__/abc-a-*.test.mjs`，契约文档放本目录 `a-*`。禁止改 CLI/Metro、autolinking TS、根依赖/锁文件、release-catalog、runner、公开面生成器。需改时写 requests.json 交 B/C。

## A-31：冻结 Sheet 属性与失败场景

输入：当前 `prepare-screens.py`、Screens 上游类型/JS/native、`router/step3-app`、当前公开参数及原 M4-A04 要求。不要只按方法名认定实现。

操作：逐项追踪“Router option → Screens JS prop → ArkTS 原始属性 → ArkUI 行为/事件”。至少纳入：1～3 个合法 detents、初始 index 0/1/2、越界/NaN/0/负值/超过 1、fitToContents、grabber、largestUndimmed、阻止 native dismiss、gestureEnabled、cornerRadius/elevation、展示中方向改变、按钮/系统返回/reload、Drawer 与父 Stack 手势冲突。

产物：仓库内 `a-sheet-contract.json`，每条包含稳定 caseId、公开入口/参数、对应原生字段、输入与期望、平台依据、M4 必达/既定延后身份、测试定位；另在本轮输出 `a-contract.json` 中引用文件/hash。把原有两档通过标为历史专项，未验证参数明确 NOT_RUN。

验收：所有目标参数均有来源和可观察断言；无静默忽略或任意改名。已定义的 M4 必达失败不能重新标为 M7。平台无等价能力时提供官方依据、用户可观察拒绝/限制及负例，交 C 核对；不能由 A 单方删场景。先保存可重复失败，再修实现。

## A-32：实现导航缺口与回归

操作：按 A-31 最小修复；保持普通 Stack、Tabs、iOS/Android 分支不退化。百分比档位与 fitToContents 正确区分；校验 index、事件和真实窗口尺寸，不能仅用日志宣称布局正确。Sheet 关闭后路由状态和生命周期一致，阻止关闭不能只隐藏按钮。Drawer 继续使用已修复的真实手势桥，不手改 node_modules。

已有基线命令（仓库根目录；适用于安装依赖后）：

```sh
node --test scripts/sdk54/__tests__/screens-harmony-boolean.test.mjs scripts/sdk54/__tests__/released-compatibility.test.mjs scripts/sdk54/__tests__/harmony-drawer-resolution.test.mjs
node --test packages/expo-router/harmony/tests/*.test.cjs
EXPO_HARMONY_TOOLING_ROOT="$SDK54_REPO" node --test packages/expo-font/harmony/tests/*.test.cjs packages/expo-asset/harmony/tests/*.test.cjs
```

失败时保留原日志；基线可能暴露新增问题，不修改测试期望来强行通过。已使用的类型工具依赖必须从当前 workspace 或本次明确安装的固定工具环境加载。

验收：A-31 每个必达项具有失败→修复→通过记录；测试包含行为，不只检查代码字符串；两份 HAR 转换器输出一致，未知上游输入拒绝；生成 HAR 正常 OHPM 安装并编译，安装后的文件 hash 匹配转换结果。禁止复制“修正源码”到 oh_modules 后计为候选通过。

## A-33：把本机资源/导航样例变成可重放入口

当前的 `EmbeddedResourcesApp.tsx`、`RemovedResourcesApp.tsx` 与 `router/step3-app/` 已在 Git；旧 `outputs/m4-step3-20261110/*.mjs` 不是可移植执行链。需把必要行为移入 A 所有的夹具/入口，不复制旧机器绝对路径。

**待实现入口：** `scripts/sdk54/abc/a-prepare.mjs`，开发完才运行以下命令：

```sh
node scripts/sdk54/abc/a-prepare.mjs --scenario resources --candidate "$SDK54_CANDIDATE" --project "$SDK54_CONSUMERS/resources" --output "$SDK54_OUT/resources-prepare"
node scripts/sdk54/abc/a-prepare.mjs --scenario navigation --candidate "$SDK54_CANDIDATE" --project "$SDK54_CONSUMERS/navigation" --output "$SDK54_OUT/navigation-prepare"
```

约定：`SDK54_CANDIDATE` 指向 B 转交且已校验的候选目录（含 release.json、runner candidate.json、tgz）；未到时只实现入口、测试负例，可使用本轮本机构建包调试但写 LOCAL。入口只从候选安装/组装和加入明确测试夹具，不改已安装依赖；独立消费者位于仓库外，存在则拒绝覆盖。调用 B 的安装能力或提供固定候选本地 registry 接入契约，不建立另一套官方/本地混装方案。

资源夹具：Font 字体与 Asset JSON 由公开插件生成；首次加载、同 PID reload、相同 URI 字节更新且保留缓存、撤销插件/移除资源后 fonts 不再加载和 asset 读取拒绝；检查生成状态与 HAP rawfile 字节。改名、hash 不符、重复目标、越界、symlink、手改文件/回滚的生成事务场景由 B 主测，A 提供语义断言并配合。

导航夹具：原始主页与 Native Tabs 保留，Sheet 全契约场景、Drawer 按钮/手势/选页/返回、方向变化、前后台、reload。新增场景使用显式路由/控制项，不能启动即自动把状态伪设为成功。

**待实现入口：** `scripts/sdk54/abc/a-verify-device.mjs`，读取落盘结果而不修改结果；CLI 为 `--scenario resources|navigation --run-dir <本轮目录>`。接受 B 采集的截图、布局、hilog、HAP/candidate/device identity；逐场景断言，缺失/旧 PID/旧 HAP/错误 hash/只有按钮事件无实际布局变化都非零。A 提供采集动作序列，B 负责设备命令与通用进程管理。

验收：新目录、非原机器路径可重放；真实图片像素、UI 布局、路由状态与日志一起证明行为；资源更新不卸载清缓存，移除不以旧缓存成功蒙混；设备所有必达失败保留可定位原件。

## A-34：候选复验与交接

依赖：B 的同一候选、C 的 case review。获得后按 B 的 runner 执行路径重跑受影响 Debug/Release × npm/pnpm。A 的本机源码宿主结果只能叫 LOCAL，不能充当这个矩阵。

最终现有检查：

```sh
corepack pnpm check
```

如果全检查暴露其他职责文件问题，提交 requests.json，不越界改。完成后交付 COMMON 的六类记录、a-contract.json、Sheet 属性清单、全部失败/修复记录、HAP/hash；明确所有待办与依赖。正式设备 run 要求干净提交；没有暂存/提交授权时交付审查结果与具体文件，不能自动 git add。

完成定义：A-31～A-33 必达实现和独立可执行断言齐备；A-34 统一候选矩阵均通过才能记 PASS。尚等 B 候选时 A-34=BLOCKED，前三项可单独交接。不得顺手开始 ExpoImage/M7 全量开发；后续任务按原阶段门另开。
