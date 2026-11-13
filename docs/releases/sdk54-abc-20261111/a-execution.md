# A 入口与证据交接

先读 COMMON.md、A.md 和 a-sheet-contract.json。本轮入口提供独立专项；不表示 default/ExpoImage、M4/M5 或第 3 步已经关闭。B/C 尚未接受下面的采集契约，交接后由 C 审查、B 写入 registry。不能复制一份历史日志改身份字段来生成本轮证据。

## 1. 主机和原生验证

使用 Node 22.20.0、pnpm 10.19.0、Python 3。字体像素检查另需 Pillow（本轮 10.4.0；可在本轮独立 venv 安装，不改系统 Python）。在仓库根目录执行：

```sh
node --test scripts/sdk54/__tests__/abc-a-*.test.mjs \
  scripts/sdk54/__tests__/screens-harmony-boolean.test.mjs \
  scripts/sdk54/__tests__/released-compatibility.test.mjs \
  scripts/sdk54/__tests__/harmony-drawer-resolution.test.mjs
node --test packages/expo-router/harmony/tests/*.test.cjs
EXPO_HARMONY_TOOLING_ROOT="$PWD" node --test \
  packages/expo-font/harmony/tests/*.test.cjs \
  packages/expo-asset/harmony/tests/*.test.cjs
corepack pnpm check
```

`abc-a-upstream.test.mjs` 从显式 `SDK54_INPUTS` 读取已固定 SHA256 的 Screens 原始 tgz；缺此输入会明确 SKIP。不能把 SKIP 当 PASS。其余新测试不读旧消费者。合成证据仅用于校验器单元测试，不是设备结果。

新建原生编译工程（不是可运行的 Expo 验收 App）：

```sh
# SDK54_INPUTS、SDK54_OUT、SDK54_CONSUMERS 按 COMMON.md 设置，目标必须是新路径。
tar -xOf "$SDK54_INPUTS/inputs/screens-4.9.0-upstream.tgz" package/harmony/screens.har > "$SDK54_OUT/screens-upstream.har"
python3 packages/expo-modules-autolinking/scripts/harmony/prepare-screens.py \
  --input-har "$SDK54_OUT/screens-upstream.har" --output-har "$SDK54_OUT/screens.har"
python3 scripts/sdk54/abc/a-native-smoke.py \
  --screens-har "$SDK54_OUT/screens.har" --rnoh-har "$SDK54_INPUTS/inputs/rnoh-0.82.30.har" \
  --project "$SDK54_CONSUMERS/screens-native"
export DEVECO_HOME=/Applications/DevEco-Studio.app/Contents
export JAVA_HOME="$DEVECO_HOME/jbr/Contents/Home" DEVECO_SDK_HOME="$DEVECO_HOME/sdk"
(cd "$SDK54_CONSUMERS/screens-native/harmony/entry" && "$DEVECO_HOME/tools/ohpm/bin/ohpm" install)
(cd "$SDK54_CONSUMERS/screens-native/harmony" && "$DEVECO_HOME/tools/hvigor/bin/hvigorw" \
  --mode module -p product=default -p module=entry@default -p buildMode=release assembleHap --no-daemon --stacktrace)
```

正常 OHPM 解压后的 `RNSScreen.ets`、注册 ETS/C++ 文件须与转换 HAR 中对应成员逐字节相同。不能在 `oh_modules` 内修正后报通过。

## 2. 新消费者

B 转交含 `candidate.json`、`release.json` 和 15 个 tgz 的同一候选目录后：

```sh
# B 的产品包方案由 apps/cli 的已构建 release-manifest 模块提供。
corepack pnpm build
node scripts/sdk54/abc/a-prepare.mjs --help
node scripts/sdk54/abc/a-prepare.mjs --scenario navigation \
  --candidate "$SDK54_CANDIDATE" --project "$SDK54_CONSUMERS/navigation" \
  --output "$SDK54_OUT/navigation-prepare" --pm npm
node scripts/sdk54/abc/a-prepare.mjs --scenario resources \
  --candidate "$SDK54_CANDIDATE" --project "$SDK54_CONSUMERS/resources" \
  --output "$SDK54_OUT/resources-prepare" --pm npm
```

可用 `--pm pnpm`。每次调用都拒绝已存在的 project/output；失败目录保留，不在原地重试。候选先核对数量、版本、SHA256、sha512 integrity 和发行内容，再启动 B 的只读本地 registry，以单次安装完成全部候选别名及公开外部依赖。使用 B 的 `buildReleasePackageJson`，没有事后向 node_modules 注入模块。资源 oracle 是明确标记的测试依赖 `@expo-harmony/a-resource-oracle@0.0.1`，由 Git 内 A 的 native 夹具打包、同次 registry 安装；不混入产品 15 包候选身份。

registry 仅在安装期间开放。消费原安装目录进行构建；需要重新安装时从同一候选创建新消费者，不沿用已经关闭端口的旧锁文件。prepare 会保存 install stdout/stderr/命令、全依赖图和 installed identities；`PREPARED_NOT_ACCEPTED` 不等于验收通过。

导航消费者使用完整 `router/step3-app`：保留原 Home、Native Tabs、详情、Drawer、方向与 reload，并新增 Sheet 参数入口。这是 A 的专项夹具，不是把 default 首页替换后声称 default 通过。资源消费者使用 Font/Asset 公开插件和独立 native 观测模块。

生成和构建由候选自己的命令与 B runner 执行：

```sh
(cd "$SDK54_CONSUMERS/navigation" && npx --no-install expo prebuild --platform harmony --no-install)
(cd "$SDK54_CONSUMERS/resources" && npx --no-install expo prebuild --platform harmony --no-install)
```

## 3. 资源操作顺序

首次 HAP：公开插件输入为 `fixtures/EmbeddedIcons.ttf` 和 `fixtures/data.json`，JSON 字节为 `{ "embedded": "initial" }\n`。构建并正常安装、启动，采集 `R01.initial`。第一次必须没有 oracle 持久 marker，避免旧安装冒充新测试。点击 `Reload resources`，采集 `R01.reload`：同 PID/HAP、不同 boot UUID、marker 保留、同一缓存 URI。

```sh
node scripts/sdk54/abc/a-resource-phase.mjs --project "$SDK54_CONSUMERS/resources" --phase updated
# 同目录重新 prebuild/build；HDC install -r，不卸载、不清缓存。
# 采集 R02.updated，JSON 字节必须变为 { "embedded": "updated" }\n，URI 不变。
node scripts/sdk54/abc/a-resource-phase.mjs --project "$SDK54_CONSUMERS/resources" --phase removed
# 同目录重新 prebuild/build；HDC install -r，不卸载、不清缓存。
# 采集 R03.removed：fonts 不含 EmbeddedIcons，Asset 拒绝；HAP 不再含这两个原始资源。
```

每阶段保存原始 `harmony/.expo-harmony-resources.json`、本次 HAP、实际安装命令记录和 HDC 身份。撤销插件不会删除 JS 检查或把缓存当成功。首次/更新/reload 还需从应用 cache 取回日志中 `png.uri` 指向的实际 PNG。截图中的 Image 和取回 PNG 要匹配；Python 会用同一 HAP 内真实字体独立重算字形和度量。

## 4. 设备采集格式（待 C 审查、B 接入）

入口是只读的：

```sh
node scripts/sdk54/abc/a-verify-device.mjs --scenario navigation --run-dir "$SDK54_OUT/navigation-run"
node scripts/sdk54/abc/a-verify-device.mjs --scenario resources --run-dir "$SDK54_OUT/resources-run"
```

run-dir 内必须有 `a-device-evidence.json`。此文件是 A 的语义输入，不替代 B runner 的 `results.json` / `run-manifest.json`，也不把本轮设备命令管理移交给 A。

所有文件引用格式为 `{ "path": "相对 run-dir 路径", "sha256": "实际64位小写hash" }`。绝对路径、越界、symlink 逃逸、hash 不符均拒绝。候选包在其 candidate.json 同目录，包字段沿用 COMMON.md。

顶层字段：

- `schemaVersion:1`、`scenario`、`scope:"LOCAL"|"CANDIDATE"`、`runId`、ISO `startedAt` / `endedAt`。
- `device:{target,systemVersion,bundle}`，来自本次设备发现与查询。
- `candidate`：候选清单引用；15 个包及各自原件必须随 run 可访问。
- `builds`：`[{id,candidateSha256,hap,generatedState,install}]`。`generatedState` 必须是原始 `.expo-harmony-resources.json`，不是人工填的 PASS。HAP 必须可完整解压，module.json bundle 与设备一致；生成资源 hash 必须与 HAP 成员一致。
- `cases`：对象，键为 caseId，值为按语义角色命名的 captures 对象。导航全部必需键见 `a-sheet-contract.json` 中非空 captures；S06/S07 是主机公开输入/native 边界负例，不靠按钮拍照证明。资源键为 `R01:{initial,reload}`、`R02:{updated}`、`R03:{removed}`。

每个 capture：

```json
{
  "id": "本次唯一标识",
  "buildId": "对应 builds.id",
  "at": "本次实际采集时间 ISO",
  "target": "真实目标", "systemVersion": "真实版本", "bundle": "真实包名",
  "pid": 123, "boot": "日志中真实 runtime UUID",
  "hapSha256": "实际HAP hash", "candidateSha256": "实际候选清单 hash",
  "identity": {"path":"capture/identity.json","sha256":"实际hash"},
  "screenshot": {"path":"capture/screenshot.png","sha256":"实际hash"},
  "layout": {"path":"capture/layout.json","sha256":"实际hash"},
  "hilog": {"path":"capture/hilog.txt","sha256":"实际hash"},
  "glyph": {"path":"capture/actual-font.png","sha256":"仅资源非移除阶段需要"}
}
```

`identity.json` 需含相同 target/systemVersion/bundle/pid/boot/hapSha256/candidateSha256，由 B 将实际安装、PID、日志观测绑定后保存，不能仅复制旧值。HDC 原始命令/stdout/stderr 一并交 C 独立复算；A 的一致性检查不声称能鉴别人为伪造的整套证据。

`layout.json` 为 HDC 原始树 `{attributes:{bounds:"[x,y][r,b]",...},children:[...]}`。PNG 截图尺寸与根 bounds 一致，节点 bundle 对应真实 App。hilog 保留原始 PID 前缀和完整 JSON 行，不改写历史时间、PID 或 UUID。

资源更新/移除的 `install` 引用文件包含 `{argv:["hdc","-t",target,"install","-r",hapPath],target,hapSha256,exitCode:0}`，另保存原始 stdout/stderr 供 C 审查。命令必须恰为这 6 个参数（可使用实际 hdc 绝对路径），不能把 echo、缺少 HAP 或附加 shell 命令当安装记录。可选 `cwd` 相对 run-dir，缺省为 run-dir；`hapPath` 相对此 cwd。验证器读取命令指向的实际 HAP，核对其 SHA256 与 capture/build；该文件须随 run 归档，不能通过 symlink 越界。B 应在本轮目录执行并保存相对路径记录，以支持搬移重放；原始完整命令和日志仍保留，不改旧日志来适配格式。

首次、reload、更新的 `cacheUri` 必须是非空 `file:///` 本地文件 URI，不含远程主机、query 或 fragment，再比较三次 URI 是否相同。null/缺字段/网络地址不能证明缓存保持。marker、同 URI、真实更新字节共同校验缓存保留；仅一条“install 成功”不够。

## 5. 导航动作与断言

严格按 `a-sheet-contract.json` 的 actions/captures 顺序采集。日志需包含本次 PID 的 `A_ROUTER_PROBE`；Sheet 拖动要有稳定 `A_SHEET_DETENT`，按钮/系统关闭要有 `A_SHEET_TRANSITION` closing/end；内容自适应要有 `A_SHEET_LAYOUT`；Drawer 要有 `STEP3_DRAWER`。

- S01～S05：截图白色 SheetPage 与 HDC 高度交叉检查，按 SheetWrapper 可用高度算比例；不能只核对 index。
- S08：内容固定 280vp；检查真实内容、Sheet 高度和 DPI 比例，不接受全屏 flex 高度。
- S09～S13：拖动条像素、父按钮计数、遮罩、关闭前后路由、顶部圆角和阴影像素均需观察。S11/S12 从 Sheet cases 页面启动，最终关闭返回 `/sheet-cases`。
- S14：Sheet 内按钮切方向两次，保持路由、PID/boot，横竖屏截图宽高真实改变。
- S15/S16：从主页 `Open form sheet` 启动，关闭返回 `/`，路由不能仍残留 sheet。
- S17：Sheet 内点击 `Reload sheet` 重载，同 PID/HAP、不同 boot、主页可见。
- N01：Drawer 打开/关闭/选页/内部划动/返回全部保留；关闭与返回是两个动作。N02 是前后台恢复。N03 是 Native Tabs Home→Settings→Home。

N02 必须从 Sheet two 的 35% 档位开始采集 `before`，实际切到后台再返回，采集 `foreground`。后者的原始 hilog 必须覆盖这次完整切换，含由 RouterProbe 的原生 AppState change 订阅产生的 `A_ROUTER_APP_STATE={boot,from,to,at}`；挂载组件不会自动生成“已切后台”事件，卸载时移除订阅。事件链须从 active 连续进入 background，再回到 active，允许经过 inactive；只切 inactive（如短暂遮挡）不算进入后台。

事件须来自同一 PID/boot，时间按记录顺序不倒退，且位于 `(before.at, foreground.at]`。B 的 capture.at 与事件 at 须采用同一设备时钟基准，保留原始设备时间和采集命令供 C 复核。旧切换日志、另一 runtime、断开的状态链或两张没有切换日志的前台截图均拒绝。原有截图、Sheet 高度、路由、PID/HAP 一致性要求继续生效；AppState 观测不能代替 B 的实际设备操作和 C 的独立证据审查。

`a-verify-device` 不读任何 `passed:true` 来决定成功，也不写回原始证据。退出 0 仅表示这份材料满足 A 的语义断言；仍需 C 独立复验和 B 的统一矩阵。拿不到设备、候选或 C case review 时记录明确 BLOCKED，不填空截图、不移除必达用例。

### 2026-11-12 真实输出差异的校验规则

- `A_SHEET_DETENT` 使用 Screens 公开事件的 `stable:true`；原生内部的 `isStable` 不能替代公开字段。
- 白色 Sheet 实体在实测 bounds 内去掉四周 5%，均匀采样 20×20 点，至少 60% 为 RGB 各通道 >240 的白色。按钮可以覆盖部分背景；黑屏或仅有日志仍失败。
- Grabber 必须位于 Sheet 顶部 25% 内，节点下方背景为白色；节点内至少 2%（且不少于 2 个）像素各通道比背景暗至少 24。系统灰色 RGB 204 可以通过，全白截图不能通过。
- 资源 Image 优先使用 `embedded-font-glyph` 标签；HDC 未导出标签时，要求应用所属节点中仅有一个可见 Image 与 oracle PNG 宽高比匹配（投影宽度误差 ≤2px）。所属 bundle 从真实布局祖先继承，系统状态栏节点排除，多个候选拒绝。随后继续执行截图像素比对与 HAP 字体独立重算；几何匹配本身不构成成功。

上述规则需由 C 复核，并用 B 的原始 layout/event/screenshot 重放。主机合成负例仅证明校验器行为，不替代本轮真实设备回归；当前没有改写历史证据，也没有关闭 S08/S10/S12/S15。

Screens 转换器 v14 将 Sheet 内容与屏幕全高 RNViewBase 分开；Harmony formSheet 的 JS wrapper 不再保留全屏 Fabric hit area。undimmed 外部触摸使用静态页面栈映射找到前一屏 RN tag 并转发原始 TouchEvent，同时保持 sheet 可见。JS wrapper 继续幂等转发生命周期并在程序化卸载时补发 closing transition。系统返回使用同一关闭守卫，普通 Stack 保留原生命周期。必须使用新包/候选/HAP 重跑这些行为，不能沿用 v11 或更早 HAP 结果。

## 6. 聚合契约与 B runner 绑定

先导出可搬移的审查快照；`--evidence-root` 可选，指向含 `sources/` 的原始证据目录。提供的源文件必须匹配 Sheet 契约固定 hash；缺少外部源字节会明确列为 blocker，不会自动下载或编造。

```sh
node scripts/sdk54/abc/a-export-contract.mjs --source-root "$SDK54_REPO" \
  --evidence-root "$A_SOURCE_EVIDENCE" --output "$SDK54_OUT/a-handoff"
```

`a-handoff/a-contract.json` 的 `cases` 是 C 审查用的 23 个语义场景：原 S01～S17、N01～N03 加 R01～R03。原 actions/captures 保留，所有设备状态仍为 NOT_RUN；`files` 记录夹具、断言、固定源文件和 B/C schema 快照的字节数与 SHA256，其中包含设备验证器调用的 `a-check-font.py` 字体像素检查脚本，并将其列为资源场景的 sourceIds。此包是审查快照，不是完整独立项目；执行入口须在新 checkout 安装固定依赖后运行。

`runnerCases` 映射当前 V-02 的 19 个注册用例，包含 capture 选择和补充要求，不附带占位命令。R01 分别提供 initial/reload；R02 是 Asset JSON 同 URI 更新、字体保持加载，不能替代 FONT-UPDATE 的字体字节更新证据。S14 是应用请求横竖屏，不能替代 C 要求的物理旋转证据。CORE-M4/OTHER-M4 及六项资源事务需要独立完整命令。SHEET-CONTRACT 同时携带 N02/N03 回归。B 负责采集/进程管理，A 的验证器只支持完整 navigation 或 resources 输入，不提供单 case 验证参数。

B 提供 `commands.json`，要求 `schemaVersion:1`、`stage:"V-02"`、`cases` 恰好覆盖 `runnerCases` 的 19 个 ID。每项格式如下（示意字段不可直接执行）：

```json
{
  "id": "V02-SHEET-CONTRACT",
  "semanticCaseIds": ["按 runnerCases 对应项原序列完整填写"],
  "command": {
    "argv": ["实际可执行文件", "实际采集与断言入口", "实际参数"],
    "cwd": "navigation",
    "timeoutMs": 300000,
    "evidence": [
      {"type":"device-assertion","path":"captures/navigation/assertions.json"},
      {"type":"screenshot","path":"captures/navigation/final.png"}
    ]
  }
}
```

`cwd` 相对 consumer-root，或绝对指向 consumer-root / 计划 run-dir 内；证据路径相对计划 run-dir。`command-log` 由 runner 生成，其余 requiredEvidence 必须显式提供。禁止 shell 属性、路径逃逸、重复/未知 ID、遗漏语义或缺失命令。绑定仅校验结构与输入完整性，不证明命令实际覆盖语义；命令内容及新增补充证据仍需 C 复核。

```sh
node scripts/sdk54/abc/a-bind-runner.mjs \
  --contract "$SDK54_OUT/a-handoff/a-contract.json" --commands "$B_COMMANDS" \
  --consumer-root "$SDK54_CONSUMERS" --run-dir "$SDK54_OUT/v02-run" \
  --output "$SDK54_OUT/a-runner-binding"
# 以下仅在干净源提交、真实设备与 B 冻结候选齐备后执行，不传 source-dirty 覆盖值。
node scripts/sdk54/abc/b-prepare-run.mjs --candidate "$SDK54_CANDIDATE" \
  --a-contract "$SDK54_OUT/a-runner-binding/a-contract.json" \
  --case-review "$SDK54_OUT/a-runner-binding/c-case-review.json" \
  --consumer-root "$SDK54_CONSUMERS" --target "$SDK54_TARGET" \
  --platform-version "$SDK54_PLATFORM_VERSION" --stage V-02 --output "$SDK54_OUT/v02-run"
```

绑定产物的根 `a-contract.json` 是 B command schema，完整语义快照在 `semantic/a-contract.json`，C 应审查后者。`c-case-review.json` 从 C 原文件逐字节复制，A 不改 C 的 BLOCKED 状态或批准声明。registry/review 漂移、快照 hash 不符会拒绝绑定，需重新导出。输出目录拒绝覆盖。`BOUND_NOT_EXECUTED` 只表示命令已绑定；A-34 和阶段门仍需同候选真实运行及 C 独立复验。

## 2026-11-12 ExpoImage 初版 LOCAL 实现

继续开发轮新增固定官方 `expo-image@3.0.11` 的 Harmony 外部 overlay：入口 `scripts/sdk54/abc/a-prepare-expo-image.mjs`，说明与独立夹具见 `scripts/sdk54/external-overlays/expo-image-3.0.11/README.md`。保留官方 JS 字节，只新增原生实现和 Harmony 模块配置；不改 B 的发行目录、根依赖或锁文件。

当前验证限于 PNG URI/请求代数主机测试、官方 JS 终结事件测试、自动链接/CMake 顺序、正常安装和本机原生编译。完整设备像素、首帧 display、缓存信息、原始 default GI 尚未通过；静态缓存/动画/ImageRef 方法明确拒绝。此增量不关闭 A-34、M4、M7。完整命令、失败记录和边界见本轮 `outputs/a-expo-image-20261112/report.html`。

### 后续模拟器复验（2026-11-12）

磁盘清理后在 nova 16 Pro 模拟器 OpenHarmony 6.0.2.130 实际安装、启动并验证。设备暴露两处缺口：Core 在 RNOH 全局 binder 完成前查询视图会抛未注册；Image 将 source 序列化为 JSON 比较导致字段顺序变化时误重载。已分别补同步 lazy install 与结构值比较，保留红测、失败设备日志及修复后的同 HAP 回归。

新增只读入口 `scripts/sdk54/abc/a-verify-expo-image.mjs --run-dir <证据目录>`；12 项 LOCAL 场景同时核对像素/几何、事件增量、HAP 资源字节与 target/PID/runtime boot。依赖真实 ExpoAsset 注册，不能只注册 Core/Image。完整设备记录见 `outputs/a-expo-image-device-20261112/report.html`。本轮只关闭这组基础 PNG 夹具问题，原始 default GI、网络在途取消、完整缓存/显示时序与 A-34/M4/M7 仍开放。

### 原始 default 的 LOCAL Release 复验（2026-11-12）

独立消费者保留 `templates/expo-template-default` 的全部页面、组件和图片，38 个非配置文件逐字节一致。使用 B 的包计划/候选 registry 安装其余依赖；Core、自动链接与 Image 为本地 tgz，经过正常 pnpm 安装、prebuild 自动注册、CLI 的正式 Harmony Release bundle 和原生构建。Core 包必须经 `prepareReleasedCompatibility` 加入兼容 HAR，并配套同策略版本的自动链接包；此前独立 Image 宿主使用的简化 Core tgz 不适用于完整 prebuild。

同一 Release HAP 在 OpenHarmony 6.0.2.130 模拟器通过首次首页、Modal、链接返回、Explore、展开 Images、返回 Home、再次 Modal、系统返回和冷启动共 9 项观测。首次 8 项 PID 相同，冷启动 PID 改变；原模板未加入 runtime boot 探针，因此不据此声称覆盖 JS reload 或过期回调。两张实际 PNG 与 HAP 字节、截图像素匹配，未出现 ExpoImage 未注册错误；RNOH 的窗口初始化告警仍保留。

只读重放入口：`node scripts/sdk54/abc/a-verify-default.mjs --run-dir <证据目录>`。同时校验 HAP/安装记录、截图/布局/原始 hilog 的 hash 和 PID、页面标题的实际渲染、Modal 移除与图片透明背景/实体像素；含白屏、残图、错误透明背景及旧 Modal 负例。报告与完整命令见 `outputs/a-default-20261112/report.html`。这只证明 LOCAL pnpm Release 的原模板基本显示与导航；正式 GI 所需同一 B 候选、Debug/Release × npm/pnpm、错误/卸载/reload 组合与 C 独立复验仍未完成，A-34/M4/M7 不关闭。

### default 证据一致性补强（2026-11-13）

`a-verify-default` 新增 HAP 内 `module.json.app.bundleName` 核对，布局节点按祖先继承所属 bundle；系统或其他应用的同名文字/图片不再参与断言。布局根尺寸须匹配 JPEG。安装必须为 `hdc -t <target> install <hap>`，参数数量固定，并读取 stdout/stderr，拒绝退出码为0却含失败输出的记录。

每项观测要求采集前后两次 `pidof <bundle>` 与记录PID相同；原始hilog行的PID一致，不能用空日志代替。layout和截图各须有成功生成→对应远端路径的file recv，传输字节数匹配归档文件；这些动作位于两次PID查询之间。命令时间及各项观测的时间顺序须连续不倒退；文件引用不得重名，四个必要原件必须齐备。应用hilog中的非致命RNOH告警仍保留，不能将其当成HDC命令执行失败。

新增独立合成证据测试 `abc-a-default-evidence.test.mjs`，包含错误包名、伪装命令、丢失采集步骤、PID变化、失败但exit0、传输路径/字节数不符、时间倒退、错误应用布局/尺寸和重复引用。修复前17个负例被误接受，修复后拒绝；原有2026-11-12的9项真实观测只读复算仍通过，并在新目录按原字节复制后复算。新报告为 `outputs/a-default-evidence-20261113/report.html`，没有生成新的设备运行结论，也未修改旧证据。

此校验仅证明落盘材料的内部一致性，不能鉴别整套人为伪造的HDC工具/输出、同名HAP安装来源或未记录的设备操作；冷启动和动作因果仍需结合原始采集过程由C复核，不代表JS reload与过期回调验收。A-34、正式GI及统一候选矩阵继续等待B/C。

## 2026-11-13：原 default Debug 主机检查与 Metro PNG 修复（LOCAL）

原消费者的 38 个模板文件不变，已安装 Core/自动链接/Image 分别 1048/275/227 个文件与上轮 tgz 匹配。Debug HAP 构建成功，module.json 标记 debug=true，未携带 Release JS bundle 或 default 的 React PNG。独立 Metro 8097 返回完整 Debug bundle；执行其中实际 Harmony AssetSourceResolver 的模块工厂（屏幕 scale=3.5 为主机输入）得到首页/Explore URL，实际 HTTP PNG 字节与模板对应原图一致。

主机复现一个 A 原生缺口：`/assets/?unstable_path=.../logo.png?platform=harmony&hash=...` 在服务端成功返回 PNG，却被旧 resolvePngUri 的路径后缀检查拒绝。新增红测后修复为识别 HTTP(S) `/assets/` 的唯一 `unstable_path` PNG 查询值，保留原 URL；负例覆盖非 PNG、重复参数、错误端点、本地查询 URI 与 fragment。两条实际 URL 分别编译旧/新头文件对照：旧版拒绝，新版原样接受。此证明 URI 入口，不证明设备解码、首帧、网络生命周期或 reload。

模拟器启动日志明确报 `No enough space to start Emulator`。清理 A 自有可重建 C++ 缓存及已归档 Debug 构建中间文件后约 6.2 GiB 可用，重试仍失败，HDC 无目标。Debug 设备/同 PID JS reload 保持 NOT_RUN；不得将命令退出 0 或模拟器 GUI 进程存在当成设备就绪。

证据、主机验证和修复 tgz：`outputs/a-default-debug-20261113/report.html`。其中 `native/default.hap` 是修复前构建，明确不含本轮 URI 修复；`image-pack/expo-image-3.0.11-harmony-local.tgz` 含修复但尚未重建 HAP/设备验收。恢复消费者原 Index 与 Release rawfile，保留历史证据。后续需正常安装修复包、重新 prebuild/build，再做原 default Debug 图片、导航和同进程 reload；A-34/GI/M4/M7 不关闭。
