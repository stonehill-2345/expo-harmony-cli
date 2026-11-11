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

资源更新/移除的 `install` 引用文件包含 `{argv:["hdc","-t",target,"install","-r",hapPath],target,hapSha256,exitCode:0}`，另保存原始 stdout/stderr 供 C 审查。marker、同 URI、真实更新字节共同校验缓存保留；仅一条“install 成功”不够。

## 5. 导航动作与断言

严格按 `a-sheet-contract.json` 的 actions/captures 顺序采集。日志需包含本次 PID 的 `A_ROUTER_PROBE`；Sheet 拖动要有稳定 `A_SHEET_DETENT`，按钮/系统关闭要有 `A_SHEET_TRANSITION` closing/end；内容自适应要有 `A_SHEET_LAYOUT`；Drawer 要有 `STEP3_DRAWER`。

- S01～S05：截图白色 SheetPage 与 HDC 高度交叉检查，按 SheetWrapper 可用高度算比例；不能只核对 index。
- S08：内容固定 280vp；检查真实内容、Sheet 高度和 DPI 比例，不接受全屏 flex 高度。
- S09～S13：拖动条像素、父按钮计数、遮罩、关闭前后路由、顶部圆角和阴影像素均需观察。S11/S12 从 Sheet cases 页面启动，最终关闭返回 `/sheet-cases`。
- S14：Sheet 内按钮切方向两次，保持路由、PID/boot，横竖屏截图宽高真实改变。
- S15/S16：从主页 `Open form sheet` 启动，关闭返回 `/`，路由不能仍残留 sheet。
- S17：Sheet 内点击 `Reload sheet` 重载，同 PID/HAP、不同 boot、主页可见。
- N01：Drawer 打开/关闭/选页/内部划动/返回全部保留；关闭与返回是两个动作。N02 是前后台恢复。N03 是 Native Tabs Home→Settings→Home。

`a-verify-device` 不读任何 `passed:true` 来决定成功，也不写回原始证据。退出 0 仅表示这份材料满足 A 的语义断言；仍需 C 独立复验和 B 的统一矩阵。拿不到设备、候选或 C case review 时记录明确 BLOCKED，不填空截图、不移除必达用例。
