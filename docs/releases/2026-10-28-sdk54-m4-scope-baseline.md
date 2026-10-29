# SDK54 M4 范围与基线

状态：进行中；M4 为 0/7，未关闭。本文是实施前的来源核对，不是完整范围清单或设备验收。

## 既定必达

| 验收项 | 必达行为 |
| --- | --- |
| M4-A01 | 字体声明式嵌入、运行时加载、图像渲染、格式、错误，以及配置移除后的无主资源清理。 |
| M4-A02 | 资源声明、Metro、rawfile、缓存、移除，以及 Release 断 Metro 后访问。 |
| M4-A03 | 启动屏、系统 UI 和状态栏配置及冷启动、前后台、主题和 reload。 |
| M4-A04 | Linking/Router 声明、冷/热深链、onNewWant、嵌套路由和系统返回。 |
| M4-A05 | 浏览器打开、取消、重复会话、关闭与销毁。 |
| M4-A06 | Core 错误、异步、事件、资源、视图和 runtime 隔离。 |
| M4-A07 | 源码、类型、文档、测试与候选发行物同步。 |

Native Tabs 按原计划关联 M7.4；具体条目、依赖及目标验收须在完整转交表中固定。生产 OAuth 保留单独能力边界；TTC 等格式必须记录实际结果，不以未实现冒充通过。

用户确认 M4-A01 的字体删除指配置移除及无主资源清理。`unloadAsync` 和 `unloadAllAsync` 是上游标注的 Web 测试用途接口，保留 M7.6 转交；这不替代 M4 的配置移除测试。

## 来源与待分类范围

`sdk54-first-runtime-api.json` 固定 Expo 来源版本的七个相关包，共 317 条按入口区分的导出记录：Asset 17、Font 56、Linking 92、Splash 18、StatusBar 84、SystemUI 4、WebBrowser 46。记录包含条件入口与类型，不能当作 317 项功能支持。Router 和 Core 不在此七包集合内，必须从完整公开面和当前候选另行核对。

`sdk54-first-plugin-surface.json` 的 Asset、Font、Splash、SystemUI、Router、WebBrowser 记录包含插件选项及源码位置。仅此静态索引并不证明 Harmony 适用性或完整覆盖；须逐选项核对当前源码、schema、嵌套类型及候选后确定 M4 必达或有依赖和验收条件的 M7 转交。平台专属选项不能因另一个平台的行为而算作 Harmony 功能通过。

实施前仍须完成逐 API、成员和插件选项的双向覆盖及范围决议，固定输入版本与哈希；不得在实现失败后改变必达范围。当前没有将上述未分类项记作转交或通过。

根据用户范围决策，原计划必达场景纳入 M4，其余能力明确关联后续 M7 批次。初步快照见 `outputs/sdk54/ai-e2e/20261028-m4-scope-baseline/scope-reviewed-21.json`，由 `node scripts/sdk54/m4-scope-inventory.mjs --check outputs/sdk54/ai-e2e/20261028-m4-scope-baseline/scope-reviewed-21.json --with-public --with-contracts --with-members --with-closure --with-current --with-current-public --seed --previous=outputs/sdk54/ai-e2e/20261028-m4-scope-baseline/scope-reviewed-19.json` 核验：7,711 条来源记录中，2,357 条关联 M4，2,601 条关联 M7 批次，1,767 条保留为源码上下文，986 条仍待裁定。Router 的 `navigate`、`goBack`、`canGoBack` 和 `linkTo` 关联 M4-A04；其 `exports.ts` 中 25 条已核对的再导出和 `hooks.ts`、`types.ts` 中 13 条来源记录与根入口分类一致。深链状态解析与序列化入口、直接调用的辅助导出及类型共 36 条关联 M4-A04。Core 根入口的旧事件发射器和模块代理关联 M4-A06，权限接口关联 M7.3。同文件其他导出仍须逐项核对。七个首批包旧索引的 317 条条件入口 API 和 189 条成员记录均已有初步划分。记录不等于独立公开 API 数；包含条件入口、旧索引、最终插件契约的不同来源 ID、公开/实现模块导出和 5,407 条 Router/Core 声明关联成员候选。最终公开关系将成员分为 3,853 条公开可达、252 条实现类型上下文和 1,302 条仅上下文；另有 213 条导出被最终处置判为实现模块。源码上下文不取消 M4 场景的行为验收，也不代表 Harmony 支持。当前发行物和源码变更还未完成双向核对，因此 `complete` 和 `ready` 均为 false。

九包的 `package.json`、`src`、`plugin/src` 与 10 月 27 日固定来源索引双向比较得到 309 个一致、15 个变更、3 个仅当前侧存在、0 个缺失；排除测试目录和测试文件。当前侧新增 `NativeModulesProxy.harmony.ts`、`NativeViewManagerAdapter.harmony.tsx` 和 `global-state/harmony-native-dismiss.ts` 分别关联 M4-A06 的注册与视图，以及 M4-A04 的返回行为。比较只反映所列文件范围，不证明源码索引、打包内容或公开 API 已完整核对；每处差异仍需关联候选物和行为证据。第 20 版曾将测试文件误报新增，保留供追溯；筛选器已以负例复现并修复。

2026-10-29 对固定提交与当前九包清单逐字段比较：每个 `package.json` 均仅有 `private` 字段变化，入口、条件导出及 `files` 字段未变化。对六个变更源码文件的 TypeScript 顶层导出名称和声明种类比较，未发现新增或移除；这不覆盖签名、成员、条件解析或行为变化。Core 候选包中两个新增 Harmony 源码文件与工作区字节一致；Router 候选包中 `harmony-native-dismiss.js.map` 的嵌入源码与工作区一致。该检查未证明生成 JS 和声明语义等价，也未覆盖新增文件的全部成员、设备行为及其他发行文件，不能据此冻结范围。

第 23 版快照 `scope-reviewed-23.json` 相对第 21 版新增 1 条 M4、93 条 M7 关联，剩余 892 条待裁定。其中 83 条为 Router 静态渲染、服务端路由和浏览器历史来源，转入 M7.1；七包中 10 条平台专属源码导出按已有入口决议转交，Browser 认证重定向事件关联 M4-A05。混合来源成员未按单一来源自动转交。使用与第 21 版相同选项并指定 `--previous=outputs/sdk54/ai-e2e/20261028-m4-scope-baseline/scope-reviewed-22.json` 核验第 23 版。

第 24 版进一步将 23 条 Router iOS 链接菜单和预览导出关联 M7.1，当时剩余 869 条待裁定。第 32 版已对这 869 条全部给出初步决议：493 条关联 M4，376 条转入 M7（M7.1 314、M7.2 23、M7.5 8、M7.6 31）；所有转交记录均有批次、依赖与目标。链接触发器和与普通链接共享的 `href` 纳入 M4-A04，预览及共享预取按对应来源转交。Expo Go 专属解析关联 `DEFER-GO`，不计实现通过。

第 32 版快照 `outputs/sdk54/ai-e2e/20261028-m4-scope-baseline/scope-reviewed-32.json` 共 7,711 条固定来源记录：2,851 条关联 M4，3,093 条关联 M7，1,767 条为源码上下文，0 条待裁定。该版采用旧扫描范围，已由下述第 33 版替代。固定来源决议全部填写不代表当前候选的公开面、插件、成员及发行物双向核对完成；`complete` 和 `ready` 保持 false，M4 范围尚未冻结。

2026-10-29 扩展源码比较至九包根目录 JS/TS 入口和插件目录 JSON，新增 72 条文件比较；第 33 版 `scope-reviewed-33.json` 共比较 399 个文件，380 一致、15 变更、4 个仅当前侧存在。新增扫描发现 Router `_ctx.harmony.js` 不存在于固定提交，属于 M4-A04 的平台路由入口；候选包包含该文件且内容与当前工作区一致。原第 32 版的三项新增、15 项变更仍须完成公开契约与设备行为核对；扩展扫描不包括所有子路径、生成物或原生代码，不能据此冻结范围。使用第 32 版的校验参数，将文件名改为第 33 版并指定第 32 版为 `--previous` 可重放。

同日第 34 版增加 Router 的 `link`、`node`、`rsc` 和 `types` 源码子路径，新增比较 11 个文件，均与固定来源索引一致。第 35 版将四个当前侧新增文件及其四个显式导出分别纳入范围记录，绑定当前文件 SHA-256 并关联 M4-A04 或 A06；共 7,719 条记录、0 条待裁定。未知新增导出保持待裁定；语法错误或 CommonJS 导出阻断自动枚举，已定当前来源哈希变化阻断跨快照复用。该枚举尚不覆盖成员、隐式导出、原生代码或发行物闭环，`ready` 和 `complete` 仍为 false。核验命令：`node scripts/sdk54/m4-scope-inventory.mjs --check outputs/sdk54/ai-e2e/20261028-m4-scope-baseline/scope-reviewed-35.json --with-public --with-contracts --with-members --with-closure --with-current --with-current-public --with-current-additions --seed --previous=outputs/sdk54/ai-e2e/20261028-m4-scope-baseline/scope-reviewed-34.json`。

六个变更源码文件相对固定提交的差异已逐段核对：Linking 的 `openURL` 成功值归一关联 A04；WebBrowser 的 Harmony 认证分支及平台说明关联 A05；Router 的平台路由识别与原生返回分支关联 A04；Core 的 `PlatformSelectOSType` 增加 Harmony 关联 A06/A07，global 类型文件仅增加平台文档标注。候选包内 Linking、WebBrowser 和 Router 两文件的 JS source map 内嵌源码均与当前文件一致，生成 JS 中也可看到相应分支。此检查不能证明生成代码完整等价或设备行为正确；Core 类型声明已发现与源码不一致，候选不得用作 A07 通过证据。

对固定提交 `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1` 的源码差异进行初审：Router `getRoutesCore.ts` 增加 Harmony 平台路由识别，`routing.ts` 接入单屏原生返回；Core `Platform.ts` 增加 Harmony 平台类型，`ts-declarations/global.ts` 增加平台文档标注。它们分别关联 M4-A04 和 A06/A07，仍需核验实际候选生成文件、消费解析和设备行为。

首次成员关联误用 10 月 23 日公开索引，对最终关系产生 3,840 条缺失；保存为 `scope-closure.json`。最终关系实际绑定 10 月 27 日索引，新增来源路径与哈希一致性检查后，`scope-final-source.json` 无缺失成员关系。此修正不改变历史 M0 证据。

跨快照使用 `--previous=outputs/sdk54/ai-e2e/20261028-m4-scope-baseline/scope-reviewed-13.json` 检查来源哈希、记录 ID 与已定决议的连续性；第 17 版已通过该检查。启用此检查时，待裁定记录可新增决议，已定项的归属和转交条件不可改变。此参数目前需显式指定，检查不证明范围清单完整或已经冻结。

固定来源七包的 73 个索引输入与当前工作区比较有 9 处变化：7 个 package.json、Linking 的 `src/Linking.ts` 和 WebBrowser 的 `src/WebBrowser.ts`。Linking 增加 RNOH 成功返回值归一；WebBrowser 增加 Harmony 认证会话分支及平台说明。WebBrowser 固定来源文件已按索引 SHA-256 `44010fb29fb95a897fc4bf356d8069877fdbe5885575a1205cc6b94e301e4d7a` 核对；这些是当前候选验证义务，不将旧索引视为当前发行物的完整证明。

## 当前观察

- Font Harmony 后端已有文件 URI、TTF/OTF 结构验证、加载和生命周期实现。其 README 明确记录声明式插件及 `renderToImageAsync` 未实现，不能满足 M4-A01。
- 2026-10-28 执行 `EXPO_HARMONY_TOOLING_ROOT="$PWD" node --test packages/expo-font/harmony/tests/font-file.test.mjs packages/expo-font/harmony/tests/font-lifecycle.test.cjs`：7/7 通过。首次未设置工具路径的运行中，4 项文件测试通过、生命周期测试因缺少环境变量失败；它不是产品行为结论。上述宿主测试不替代原生构建或设备验收。
- 六模块宿主回归首次 56/62：5 项 Linking 测试缺 Node `--experimental-vm-modules` 参数，WebBrowser 原生检查夹具因缺少 M3 校验所需 `packageRoot` 而失败。补齐夹具真实包根与版本，并加 Node 参数后 62/62 通过；日志分别为 `outputs/sdk54/ai-e2e/20261028-m4-scope-baseline/host-red.log`、`host-green.log`。这不计设备或发行验收。
- `hdc list targets` 返回 `127.0.0.1:5555`；设备在线不代表 M4 已运行。M3 设备结果可用于追溯，不直接替代最终 M4 候选的 A06/A07 验收。
- 2026-10-29 根据用户要求启动已有 Pura 90 模拟器（保留数据，coldboot），HDC 检测到 `127.0.0.1:5555`，系统版本为 `emulator 6.1.0.115(SP11DEVC00E115R4P11)`。设备存在历史 M3 与 blank 应用，未绑定本次 M4 候选；本次仅确认设备可连接，M4 设备断言仍未执行。
- 2026-10-28 隔离打包器生成 14 个候选包（含 M4 九包），`outputs/sdk54/ai-e2e/20261028-m4-scope-baseline/candidate-pack/manifest.json` 记录哈希，打包失败数为 0。此为范围核对候选，不是最终验收候选；模块包未配置重新编译，打包成功不证明生成物新鲜或行为通过。
- 对九包现有 `build` 下带嵌入源码的 JS source map 做初步比对：七包共 238 条映射与当前文件内容一致；StatusBar 和 Core 没有此类映射。该检查未覆盖类型、插件构建及无映射文件，也未证明生成代码正确，A07 的完整双向核对仍未完成。
- 直接运行 `npm pack --dry-run --ignore-scripts` 时，Font 与 Core 的 `prepare` 仍被触发并因包级 React Native 等依赖缺失失败；本次产生的六个跟踪类型文件改动已恢复。隔离打包器不触发这些包的 `prepare`，其成功不能作为这两次构建失败的修复证据。
- 2026-10-28 Router Harmony 宿主测试 15/15 通过。Core 示例测试全量运行首次 28/47，通过数不代表设备验收；失败包含缺失 CMake、React Native 类型、独立示例路径和历史设备日志。指定 DevEco CMake 与 `/tmp/sdk54-m3-emulator-consumers/pnpm` 工具依赖后，Core/Router 构建和版本夹具 5/5、Font/I0/Linking/StatusBar 组装夹具 4/4 通过；历史日志和独立示例测试未重跑或未满足前置条件。上述测试不绑定本轮候选 HAP。
- 候选 `expo-modules-core+3.0.30.tgz`（SHA-256 `963358a013a31b40290ca72cf60847c3083f638ea8b15d8a256c492a55aa1f11`）的 `build/Platform.d.ts` 缺少 `PlatformSelectOSType` 的 `harmony` 分支，和当前 `src/Platform.ts` 不一致。对 tar 内声明断言包含该分支实际失败；A07 未通过。上面的夹具会在临时目录重生成声明，其通过不能证明此候选包类型正确。须在范围冻结后修复生成/打包流程，重打包并使用真实消费者验证。
- 2026-10-29 从上述候选 tar 解包并以 TypeScript 实际检查 `Platform.select({ harmony: 1, default: 0 })`，得到 `TS2353`，错误为 `harmony` 不存在于允许的属性中；这是候选类型失败，非设备验收。
- 当前候选、现有未提交改动及 M3 历史证据必须保留。M4 只在全部原验收项和退出产物满足后关闭。
