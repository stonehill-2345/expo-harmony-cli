# `link-harmony` 0.77.71 真实 fixture 契约锁定 + 23 包覆盖率报告（阶段 0 / Task 0）

> 日期：2026-09-09（计划日期 2026-09-08，执行跨日）。
> 依据：设计规范 `docs/superpowers/specs/2026-08-27-link-harmony-vs-custom-autolinking-design.md`（§4.5/§5/§6.2 修订版）、
> 计划 `docs/superpowers/plans/2026-08-27-link-harmony-official-first.md` Task 0。
> fixture 根：`.tmp/link-harmony-probe/`（gitignore，不入库）。本报告**不提交任何代码变更**，`.tmp/` 探针产物均不入库。
> 证据等级：A = 本 fixture 直接执行验证；B = 仓库/依赖源码或 registry 元数据直接证明；C = 旁证；D = 推测。

## §1 版本记录

| 项 | 值 |
| --- | --- |
| Node | v22.20.0 (darwin, macOS) |
| pnpm | 10.19.0（symlink 默认布局，fixture `project/`） |
| npm | 10.9.3（hoisted 布局对照，fixture `project-npm/`，`--legacy-peer-deps`） |
| registry | npmmirror（`~/.npmrc`） |
| CLI | `@react-native-oh/react-native-harmony-cli@0.77.71`（精确版本，dist 为 CJS） |
| RNOH 基线 | `src/version-matrix.ts` rnoh/rnohCli 均 `0.77.71`（B） |

23 个 mapping 包安装版本（pnpm latest 解析，全部安装成功、HAR 全部存在且与 mapping `harName` 一致，A）：

| mapping 包 | 版本 | harmony.autolinking |
| --- | --- | --- |
| @react-native-ohos/react-native-safe-area-context | 5.6.4 | **无**（仅 alias） |
| @react-native-ohos/react-native-gesture-handler | 2.30.2 | **无**（alias + redirectInternalImports） |
| @react-native-ohos/react-native-reanimated | 4.0.2 | **无**（alias + redirectInternalImports） |
| @react-native-ohos/camera-roll | 7.10.1 | **无**（仅 alias） |
| @react-native-ohos/react-native-screens | 4.9.0 | **无**（alias + redirectInternalImports） |
| @react-native-ohos/react-native-webview | 13.15.4 | **无**（仅 alias） |
| @react-native-ohos/react-native-mmkv | 4.0.0 | **有**：ets `ReactNativeMmkvPackage` / cpp `NativeMMKVPackage` / cmake `rnoh_native_mmkv` / ohPkg `@react-native-ohos/react-native-mmkv` |
| @react-native-ohos/react-native-pager-view | 6.7.4 | **无**（仅 alias） |
| @react-native-ohos/react-native-linear-gradient | 3.2.0 | **有**：ets `LinearGradientPackage` / cpp `LinearGradientPackage` / cmake `rnoh_linear_gradient` |
| @react-native-ohos/clipboard | 1.16.3 | **无**（仅 alias） |
| @react-native-ohos/react-native-svg | 15.13.0 | **无**（alias + redirectInternalImports） |
| @react-native-ohos/react-native-permissions | 5.3.2 | **无**（仅 alias） |
| @react-native-ohos/react-native-device-info | 14.0.7 | **无**（仅 alias） |
| @react-native-oh-tpl/react-native-fast-image | 8.6.3-0.4.17 | **无**（仅 alias） |
| @react-native-ohos/react-native-image-picker | 8.3.0 | **有**：ets `ImagePickerViewPackage` / cpp `RNImagePickerPackage` / cmake `rnoh_image_picker` |
| @react-native-ohos/react-native-video | 6.15.0 | **有**：ets `RNCVideoPackage` / cpp `RNCVideoPackage` / cmake `rnoh_video` |
| @react-native-ohos/react-native-sound | 0.12.0 | **无**（仅 alias） |
| @react-native-ohos/react-native-document-picker | 9.4.0 | **有**：ets `DocumentPickerPackage` / cpp `DocumentPickerPackage` / cmake `rnoh_document_picker` |
| @react-native-ohos/react-native-fs | 2.20.2-beta.2 | **有**：ets `FsPackage` / cpp `RNFSPackage` / cmake `rnoh_fs` |
| @react-native-ohos/lottie-react-native | 7.3.0 | **无**（仅 alias） |
| @react-native-ohos/slider | 5.1.2 | **无**（仅 alias） |
| @react-native-ohos/react-native-keyboard-controller | 1.16.8 | **无**（仅 alias） |
| @react-native-oh-tpl/react-native-blob-util | 0.19.7-rc.1 | **无**（alias + codegenConfig，无 autolinking） |

目录布局：`project/{package.json,node_modules,harmony/{oh-package.json5,entry/src/main/{ets,cpp}}}`；root `oh-package.json5` 预置 1 条 unmanaged 依赖 `"libentry": "./libs/libentry.so"`。对照布局 `project-npm/`（npm hoisted，493 个顶层目录 vs pnpm 26 个 symlink）。

**版本口径注意（B，registry 元数据）**：上表为 latest 解析；生产链路按 `src/scanner/compat-table.ts` 钉版安装，钉版 metadata 与 latest 不同（详见 §5 末尾）。覆盖率结论在两种口径下均不变（§6）。

## §2 CLI 契约（0.77.71 实测）

### 2.1 导出形状（A）

- `dist/commands/link-harmony.js` 为 **CJS**（`exports.commandLinkHarmony = { name, description, options, func }`，`__esModule: true` 标记 + `exports` 赋值，`require` 直接可用）。
- `typeof commandLinkHarmony.func === 'function'`，**arity 3**：`func(_argv, _config, rawArgs)`，返回 Promise（TS 编译的 async 函数）。与 EHT 0.82.29 旁证一致。
- `options` 数组含 8 个 CLI 选项（见 2.2），仅作 shell 参数声明；程序化调用只消费 `rawArgs`。

### 2.2 rawArgs 键名（A：源码 `link-harmony.js:69-80` + 执行验证）

实测 `func` 读取的键（全部）：

| 键 | 生产 7 键协议中的键 | 结果 |
| --- | --- | --- |
| `harmonyProjectPath` | ✔ 同名 | 接受（`new AbsolutePath(v)`，相对路径按 cwd resolve） |
| `nodeModulesPath` | ✔ 同名 | 接受 |
| `cmakeAutolinkPathRelativeToHarmony` | ✔ 同名 | 接受 |
| `cppRnohPackagesFactoryPathRelativeToHarmony` | `cppRnohPackagesFactoryPathRelativeToHarmony`（Rnoh 同款） | ✔ 一致（2026-09-09 勘误：初版此行误记生产为 RNOH 全大写） |
| `etsRnohPackagesFactoryPathRelativeToHarmony` | `etsRnohPackagesFactoryPathRelativeToHarmony`（Rnoh 同款） | ✔ 一致（同上勘误） |
| `ohPackagePathRelativeToHarmony` | ✔ 同名 | 接受 |
| `includeNpmPackages` | ✔ 同名 | 接受（数组；**长度为 1 时按 `;` 拆分**——CLI 字符串解析遗留） |
| `excludeNpmPackages` | （7 键之外） | 可选第 8 键；与 include 同时非空 → DescriptiveError |

**键名拼写验证（2026-09-09 勘误后口径）**：初版报告称"用我方 buildRawArgs 原样键名调用 → TypeError"并归因为生产代码 RNOH 全大写——**该归因错误**。实际情况：探针脚本 `probe-run.cjs:62-63` 手写键名笔误为全大写导致 TypeError（该 TypeError 本身仍为 A 级证据，证实真实 CLI 只认 Rnoh 拼写）；生产代码 `src/harmony-project/official-autolinking.ts:129-130` 自引入提交 `5bfa746` 起即为 Rnoh 拼写（`git log -S` 证实），**与 0.77.71 契约相符，无缺陷**。commit `4b608ea` 仅在两键旁补充"勿改回全大写"契约注释。

**EHT 0.82.29 交叉旁证（B）**：本机 `/Users/wum/2345/Expo-Harmony-Toolkit/src/core/autolinking.ts:534-542` 的 rawArgs 恰用 `cppRnohPackagesFactoryPathRelativeToHarmony`/`etsRnohPackagesFactoryPathRelativeToHarmony`（Rnoh 混合大小写）——EHT、我方生产代码与真实 CLI 三方一致。

**错误语义（B，源码）**：`func` 内 catch 仅对"非 unexpected 的 `DescriptiveError`"记日志后**正常 return（不抛错）**（如 include/exclude 冲突）。此时 4 个产物一个都不写——我方包装层不能依赖异常检测执行失败，只能靠产物存在性校验（现行实现已如此，符合契约）。TypeError 等意外错误原样再抛。

### 2.3 产物写入行为（A）

- 写 4 个文件：ets factory、cpp factory、autolinking.cmake、root oh-package（`ohPackagePathRelativeToHarmony` 指向的那份）。**不产出 entry/oh-package.json5**（无对应键；自研的条件性第 5 文件官方无法生成）。
- 幂等（A）：同输入连续执行两次，4 文件字节级一致。
- 排序（A）：libraries 按 npm 包名字典序；输出确定。
- 越界：实测全部写入 `harmonyProjectPath` 之下，未触碰 fixture 真实 `harmony/`（护栏语义成立）。

## §3 能力矩阵（设计规范 §5 逐格）

| 维度 | 官方 link-harmony（0.77.71 实测） | 自研 autolinking | 差异/风险 | 等级 |
| --- | --- | --- | --- | --- |
| 包发现范围 | 扫描 `nodeModulesPath` 顶层全部目录/symlink（`.pnpm` 等点目录跳过，`@scope` 递归），**逐包读 package.json** | 静态 mapping 23 键 | 官方可发现任意新包，但必须带 metadata（见下） | A |
| 包元数据来源 | `package.json.harmony.autolinking`（无则跳过该包） | mapping 内置（ohrn ground truth） | 适配包未发布 metadata 即不可链接；**17/23 缺失** | A |
| HAR 文件解析 | 扫包内 `harmony/`（或 metadata `mainHarPath`），多 HAR 逐个生成依赖；支持 metadata `ohPackageName` 数组映射 | 固定 `harName` 单值 | 官方多 HAR/自定义包名能力强；本 fixture 各包均单 HAR，命名全部与 mapping 一致 | A |
| ETS 单 Package | **只能每包 1 个类**（metadata 单值 `etsPackageClassName`，缺省 `Pascal(scope)+Pascal(name)+Package`）；import 一律 **default**：`import X from '<ohPackageName>'`（包根，无 `/ts` 后缀） | 任意多条 `importStatement`（named/default/`/ts` 均可） | named import（safe-area 等 21 包）与多类包官方无法表达 | A |
| ETS 多 Package | 不支持（每包一个 import + 一个 `new`） | 支持（mmkv、keyboard-controller 双类） | mmkv 官方只注册 1 类（`ReactNativeMmkvPackage`），缺 `MmkvCxxPackage`/`MmkvPlatformContextPackage` | A |
| C++ namespace | **恒为 `rnoh::` 前缀**（模板写死） | 支持 `rnoh`/`null` | screens 的 `ScreensPackage`（无 namespace）官方形态无法生成（本 fixture 被 skip 未触发） | A（模板源码 B + 执行 A 于 6 包） |
| C++ only | 仍生成 1 条 ETS default import + `new <Cpp同名类>`（linear-gradient 实测多出 ETS 注册，ground truth 无） | `etsPackages: []` 不生成 ETS | 官方多出的 ETS 注册编译/运行影响未知（Task 6） | A |
| ETS only | 无 HAR→跳过；有 HAR 无 cpp 类→C++/CMake 仍生成 metadata 或同名缺省类（blob-util 因无 metadata 被 skip，未触发） | `cppPackages: []` 不生成 C++ | 官方对 ETS-only 包会产出多余 C++ 声明（本 fixture 未触发，B 级源码推断） | B |
| CMake 自定义源码路径 | **恒为 `${OH_MODULES_DIR}/<ohPackageName>/src/main/cpp`**（模板写死） | `cppSourcePath`（`${NODE_MODULES}/<pkg>/<cppSourcePath>`）或 `resolve_oh_package_cpp` | webview/mmkv 等 `harmony/<har目录>/src/main/cpp` 包，官方路径依赖 oh_modules 解析语义；两套机制语义不同，均需构建验证 | A |
| CMake target | metadata `cmakeLibraryTargetName`，缺省 `rnoh__<snake(scope)>__<snake(name)>` | mapping 指定（`rnoh_safe_area` 等实物提取值） | 6 个已链接包 target 全部与 mapping 一致；**缺省规则与 mapping 实物值不同**（如 device_info 实物 `device_info` vs 缺省 `rnoh__react_native_ohos__device_info`） | A |
| pnpm symlink / hoisted | 两种布局输出**字节级一致**（file: 路径归一后 diff 为空；symlink 经 `dirent.isSymbolicLink()` 分支跟进） | 直接 path 存在性检查，两种布局均 23/23 | 无差异风险 | A |
| `includeNpmPackages` | 白名单生效，但**不能挽救缺 metadata 的包**（skip 条件先判 metadata） | 无对应机制 | 我方传 mapping 全量 23 键，17 包仍 skip | A |
| unmanaged 依赖保留 | **保留**（`libentry` 实测保留）；规则：非 `file:`+`node_modules` 一律保留；`file:node_modules` 指向非 autolink 包时按 HAR 存在性决定 | 保留（非 mapping 键一律保留） | 官方对 file: 型 unmanaged 有"不存在即清理"行为（更激进） | A |
| alias-only 包 | 不在 mapping，无 HAR → 官方静默忽略（连 skip 名单都不进） | 不进 mapping | 口径一致 | B |
| codegen 包 | blob-util 有 `codegenConfig` 无 autolinking → 仍 skip；link 与 codegen 顺序本 fixture 未测 | compat/install 触发 | Task 6 或后续 | B |
| 缺 HAR/metadata | 缺 metadata → skip 名单（17 包）；缺 HAR → **静默忽略**（不在 skip 名单，无诊断） | skip 并记录原因 | 官方失败可诊断性弱于自研 | A（metadata）/ B（HAR 源码） |
| 部分输出 | `saveAndLogOutput` 顺序写 4 文件，无中断保护（逐文件 `writeTextSync`） | 结果对象统一落盘 | 官方中途失败可能留半成品（我方在临时目录执行 + 产物校验兜底） | B |
| 幂等与排序 | 字典序、去重，重跑字节级一致 | 字典序、去重 | 无差异 | A |
| 版本升级成本 | 0.77.71 基线记录；0.82.30 已存在（未测） | mapping/模板测试 | — | A |

## §4 语义 diff 摘要（按设计规范 §4.5 分类）

输入：23 包 fixture，官方（修正键名后）vs 自研（dist `runAutolinking`，同 projectRoot/mapping）。

1. **包集合差异**：官方 6 链接 / 17 skip；自研 23 链接 / 0 skip。官方缺口 17 包（§5）。
2. **ETS import 集合与实例序列**：
   - 类型导入：官方 `import type { RNPackageContext, RNOHPackage }`（旧类型 `RNOHPackage`）；自研 `RNPackage`。我方 `normalizeOfficialEts`（RNOHPackage→RNPackage）规则**与实测吻合，无需调整**（A）。
   - import 形态：官方全部 default import 自包根（`import DocumentPickerPackage from '@react-native-ohos/react-native-document-picker'`）；ground truth/自研为 named + `/ts`（21 处）。6 个已链接包中 5 个仅 import 形态差异（类名相同）；mmkv 类集合不同（官方 1 类 vs 自研 2 类）；linear-gradient 官方多出 1 条 ETS 注册（ground truth 为 C++-only）。
3. **C++ include/namespace/实例**：6 个已链接包 include 与 `std::make_shared<rnoh::X>(ctx)` 与自研**完全一致**（A）。官方恒 `rnoh::` 前缀，无 null-namespace 能力（screens 场景未触发）。
4. **CMake 集合**：6 包 target（`rnoh_document_picker`/`rnoh_fs`/`rnoh_image_picker`/`rnoh_linear_gradient`/`rnoh_native_mmkv`/`rnoh_video`）与 AUTOLINKED_LIBRARIES 块和自研一致；`add_subdirectory` 路径机制不同（官方 `${OH_MODULES_DIR}/<pkg>/src/main/cpp` vs 自研 `${NODE_MODULES}/<pkg>/harmony/<har目录>/src/main/cpp`）。**我方 L4 校验正则（`add_subdirectory\([^)]*\.\/<target>\s*\)` + AUTOLINKED_LIBRARIES 整词）对官方两种形态均兼容，6/6 通过，无需调整**（A）。
5. **oh-package.json5**：
   - 官方 managed 键 = metadata `ohPackageName`（本 fixture 6 包恰等于 npm 名）；自研键 = npm 名。ohPackageName 与 npm 名不同的包（钉版 screens/gesture-handler 的 `@react-native-oh-tpl/...`）官方会产生**不同键名**（B，registry 元数据）。
   - 官方 specifier 为 `file:` + `path.relative(harmonyProject, har)`（正斜杠化）：同盘临时目录产出深层相对路径，实测 os.tmpdir 场景 `file:../../../../../../Users/wum/.../node_modules/<pkg>/harmony/<har>`（A）。**跨盘（Windows 不同盘符）行为未测**（C）；macOS 同盘为相对路径。我方 `HAR_SPECIFIER_RE` 提取规则对该形态命中（A）。
   - unmanaged 保留：双方一致保留 `libentry`（A）。
   - 格式：官方 JSON5Writer（AST 保留注释、双引号、尾逗号）；自研 JSON5.stringify（丢注释）。注释保留官方更优，但本架构不采用官方 oh-package 内容，无影响（A）。
6. **输出排序、重复、空输出、错误信息**：官方字典序、无重复、空依赖时仍写 4 文件（模板骨架）；skip 名单仅含"有 HAR 缺 metadata"的包。官方错误两态：DescriptiveError 吞掉（日志 + 正常返回）vs 意外错误再抛（§2.2）。

## §5 官方跳过清单及原因（17/23）

全部 17 包的跳过原因同为：**package.json.harmony.autolinking 字段缺失**（`harmony` 字段仅含 alias / alias+redirectInternalImports / alias+codegenConfig）。skip 判定先于 includeNpmPackages 白名单（`providedAutolinkingConfig === undefined || null → skip`，源码 `Autolinking.js:130-138`），白名单无法挽救（A）。

| 包 | harmony 字段实际内容（版本见 §1） |
| --- | --- |
| react-native-safe-area-context | `{alias}` |
| react-native-gesture-handler | `{alias, redirectInternalImports}` |
| react-native-reanimated | `{alias, redirectInternalImports}` |
| react-native-screens | `{alias, redirectInternalImports}` |
| react-native-webview | `{alias}` |
| camera-roll | `{alias}` |
| pager-view | `{alias}` |
| clipboard | `{alias}` |
| svg | `{alias, redirectInternalImports}` |
| permissions | `{alias}` |
| device-info | `{alias}` |
| fast-image | `{alias}` |
| sound | `{alias}` |
| lottie-react-native | `{alias}` |
| slider | `{alias}` |
| keyboard-controller | `{alias}` |
| blob-util | `{alias, codegenConfig}`（有 codegen 配置但无 autolinking，仍 skip） |

**钉版口径补充（B，registry `npm view` 元数据）**：生产按 compat-table 钉版安装时，4 个关键包中：
- `screens@4.8.1-rc.7`、`gesture-handler@2.23.2-rc.1`：**有** autolinking（仅 `cmakeLibraryTargetName` + `ohPackageName: @react-native-oh-tpl/...`，**无类名**）→ 官方会链接，但 ETS/C++ 类名走缺省推导（`ReactNativeOhTplReactNativeScreensPackage` 等），与 ground truth（`RNOHScreensPackage`/`GestureHandlerPackage`）不符，且 import 源变为 `@react-native-oh-tpl/...`；
- `reanimated@3.18.1-rc.1`、`safe-area@5.1.1-rc.1`：仍无 autolinking → 仍 skip。

即钉版口径下关键包"或被跳过、或以错误类名/导入源被链接"，两种口径均无法通过 §6.2 关键包要求。

## §6 覆盖率与门槛判定

### 6.1 数字（分母 = mapping 23 个应进入 native autolinking 的包；alias-only 包不进分母）

| 口径 | 数值 | 说明 |
| --- | --- | --- |
| 官方链接数 | **6/23 = 26.1%**（A） | document-picker、fs、image-picker、linear-gradient、mmkv、video |
| **官方直接覆盖率（无需 normalization/补丁即正确）** | **0/23 = 0%**（A） | 6 个已链接包全部存在与 ground truth 的偏差：5 包 ETS import 形态不同（default@包根 vs named+/ts，构建可用性未验证）；mmkv ETS 类集合错误（1 类 vs 2 类，缺 `MmkvPlatformContextPackage` 注册）；linear-gradient 多出 ETS 注册。即便宽限"假定 default import 可构建"（C 级未验证），上限也仅 4/23 = 17.4% |
| 需 normalization 的包数 | 5（A） | document-picker/fs/image-picker/video：仅 import 形态归一；linear-gradient 另需决策多余 ETS 注册 |
| normalization 无法修复 | 1（A） | mmkv：官方单类模型无法表达双类注册 |
| 仅自研覆盖 | 17（A） | §5 清单 |
| 仅官方覆盖 | 0（A） | — |
| 两者都不覆盖 | 0（A） | — |
| alias-only（不进分母） | native-stack、flash-list（B） | 口径一致 |

四层校验模拟（用生产 dist `validateOfficialCoverage`，修正键名场景）：**121 项失败** = L1×17（链接集合缺口）+ L2×40（17 包 import+注册缺失、mmkv 类缺失、6 包 import 形态）+ L3×32 + L4×32（均由 L1 缺包连带）。即使键名修正，`auto` 在本 fixture 上必然整批回退（A）。

### 6.2 关键包缺口清单

`react-native-screens`、`react-native-gesture-handler`、`react-native-reanimated`、`react-native-safe-area-context` —— latest 口径全部被官方 skip（缺 metadata）；钉版口径 2 包 skip、2 包以错误类名链接（§5）。**关键包存在缺口，且为不可通过 normalization 修复的集合级缺口。**

### 6.3 预期 fallback 率（按默认模板依赖集估算）

默认模板依赖集（compat-table B 类 4 包：screens/reanimated/gesture-handler/safe-area + 可选默认 webview）**全部落在官方缺口清单内**（5/5）。因此：

- 装有 ≥1 缺口包的项目占比 ≈ **100%**（默认模板即命中 4 个关键缺口包）；
- 即 `auto` 策略下官方链路对所有真实项目预期整批回退，官方优先无实际收益。

### 6.4 门槛判定（对照设计规范 §6.2 修订版）

| 条件 | 实测 | 结论 |
| --- | --- | --- |
| 直接覆盖率 ≥90% 且无关键包缺口 → 允许默认 auto | 0%（≤17.4% 宽限口径），关键包 4 缺口 | 不满足 |
| 覆盖率 <90% 或任一关键包缺口 → 默认 custom | **命中** | **`DEFAULT_AUTOLINKING_STRATEGY` 维持 `'custom'`；`auto`/`official` 仅作诊断与实验开关** |

附带结论（供后续任务记账）：
1. ~~生产 rawArgs 键名 bug~~ **（2026-09-09 撤回）**：初版此条系探针脚本自身键名笔误的误归因——生产代码自 `5bfa746` 起即为 Rnoh 拼写，无缺陷（§2.2 勘误口径；`4b608ea` 仅加契约注释）。
2. 覆盖率随适配包发布 metadata 而变（0.82.x CLI + 新版适配包可能改善），但 0.77.71 基线下不成立；翻案需重新跑本 fixture 流程。
3. 我方 L4 cmake 校验正则与 ETS 归一化规则经实测无需调整（§4.2/§4.4）。

## §7 构建结果（Task 6 占位，待补）

> 本节预留给 Task 6（真实工程构建验证）填写：官方 6 包 default import 形态与 `${OH_MODULES_DIR}` 路径能否通过 hvigor/cmake 构建；linear-gradient 多余 ETS 注册的编译影响。当前全部为文件级证据，无 runtime verified 结论。
