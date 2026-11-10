# SDK54 A-05 发布一致性收口

日期：2026-11-01  
人员：A  
分支：`feat/sdk54-a-modules`  
基点：`19a0375cff7e0ef3bc62d54fd5ed57b913bb2000`

## 结论

A-05 的 **A 侧本地收口为 PASS**：当前模块源码、Router 发布 JS、Core 平台类型、
README 边界、测试和已安装 npm Release 候选可以相互追溯。固定主机矩阵在新增
Router 生成物门禁后为 **199/199 PASS**；Router 候选归档、安装目录与 A 工作区的
Harmony reload 运行时代码一致；消费安装清单检查 8 个包、2824 个文件，零 mismatch、
零 unexpected file。

这不是 M4-A07 或 M4 阶段的最终 PASS。正式 npm/pnpm x Debug/Release 组合、最终发布名
改写和候选生成由 B 的打包链路负责；Font 声明式嵌入/移除仍未实现，A-03/A-04 也仍有
已登记边界。因此 A-05 可交 B 继续集成，M4 仍保持未关闭。

## 本轮修复

核对发现 `packages/expo-router/src/fork/useLinking.native.ts` 已让 Harmony reload 读取
最新 Ability Want，但工作区的 `build/fork/useLinking.native.js` 和 JS source map 仍是
旧 iOS-only 逻辑。正式包入口是 `build/index`，因此只通过源码测试不足以证明发行物正确。

本轮完成：

- 同步 `build/fork/useLinking.native.js` 的 Harmony 分支。
- 更新 JS source map，使 `sourcesContent` 与当前 TypeScript 源码逐字一致。
- 扩展 `linking-reload.test.cjs`，同时检查源码、发布 JS 和 source map。
- 保持 `useLinking.native.d.ts` 不变；本次条件分支不改变公开签名。
- 未修改 Router 插件、包身份或锁文件。

现有 `expo-router-6.0.24-source.tgz` 在本轮修改前已经包含正确的发布 JS。去除工作区
JS 末尾的 source-map 注释并规范化尾部换行后，归档、安装目录和工作区三者逐字一致。

## 验收结果

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| Core `Platform.select({ harmony })` 类型 | PASS 2/2 | 真正消费工程可编译；伪造平台键被拒绝；声明重新 emit 与 `build/Platform.d.ts` 一致 |
| Font / Asset | PASS 35/35 | 格式、生命周期、缓存、render image 与失败清理 |
| Splash / SystemUI / Linking / Router / WebBrowser | PASS 74/74 | 包含新增的 Router 源码、build、map 双门禁 |
| Core / 安装验证 / M4 范围 / Screens | PASS 90/90 | 包含 fixture、生命周期、证据重建、范围与 Harmony boolean |
| Router 组合专项 | PASS 20/20 | `--experimental-vm-modules`，含 Linking/Router fixture |
| 消费安装清单 | PASS | 8 包、2824 文件；归档 hash、安装文件和 Core 单实例均通过 |
| `git diff --check` | PASS | 无空白错误 |

固定 Node：`/Users/zhansh/.nvm/versions/node/v22.20.0/bin/node`。

主机测试使用：

```sh
EXPO_HARMONY_TOOLING_ROOT=/Users/zhansh/project/sdk54-ab-a-consumers/20261030-core-v2-npm
EXPO_HARMONY_CONSUMER_NODE_MODULES=$EXPO_HARMONY_TOOLING_ROOT/node_modules
EXPO_CORE_DECLARATION_PACKAGE=$EXPO_HARMONY_TOOLING_ROOT/node_modules/expo-modules-core
```

`context.test.mjs` 在 Node 22 下还需 `--experimental-vm-modules`。未加该参数时的
`vm.SourceTextModule is not a constructor` 是调用环境错误，不是 Router 行为失败。

## 候选与文件身份

消费工程：
`/Users/zhansh/project/sdk54-ab-a-consumers/20261031-a04-router-v6-sheet-npm`

| 工件 | SHA-256 |
| --- | --- |
| Router source tgz | `0284bc9958f0b18a1d59a5b3895b10cbd1bf3c2239fe1745246d4c90808ab9d3` |
| 消费工程 `source-manifest.json` | `afa0583c3693b1ec92ec20a11628ae21e48fc6d38f637e1406d37e461615b6ed` |
| 候选/安装目录 `useLinking.native.js` | `eded73c62f8c1ffb10d696be6c85b68eaa157238938e9253b85bb5f63d915a72` |
| A 源码 `useLinking.native.ts` | `22c0ed8c0be42e2432dbfc28b6020fe4a3bf8c37eda9295589d5e2ed13f1ac43` |
| A build JS（含 source-map 注释） | `84811456e90985b75d7ff6983c1ff15777b7b79fa0be7b9f52b94c36eaaf362e` |
| A build JS map | `583383a14409f5bce91239d3a2b0d3f93f496cabb0d8deddcf514c7f455f1315` |
| A Core `Platform.d.ts` | `408a937723a206cada6df96386f902ec6c2d943c8ac8333d389073aae523f0e6` |

Router 的上游源码身份为 `expo-router@6.0.24`，发行清单明确映射为
`@expo-oh/expo-router@6.0.25`。README 的安装版本与发行清单一致，不是旧版本误写。

## README 与插件边界

- Font README 已明确：Harmony 运行时支持 TTF/OTF 和 `renderToImageAsync`；TTC 仍开放，
  WOFF/WOFF2 运行时拒绝；声明式字体嵌入与移除尚未实现。
- 当前 Harmony 插件接口仅提供 app/module JSON mods，字体资源事务需交 B 的工具链任务；
  不能把 Android/iOS `expo-font` plugin 的能力当作 Harmony 已完成。
- WebBrowser README 只声明本地 npm Release 专项；Debug、pnpm、TLS/renderer 失败、生产
  OAuth 及 Splash 真实叠层仍未正式验收。
- Router README 把 Native Tabs、Drawer、Sheet 和服务端专属能力列为当前组合边界；
  Native Tabs/Sheet 的现有失败或阻塞仍按 M7.4 处理。
- 本轮没有插件源码变化。消费清单已证明候选中的插件文件与安装目录一致，但没有证明
  Harmony 尚未实现的字体资源插件能力。

## 风险与未完成项

1. A 隔离工作区没有可由包脚本直接解析的 `expo-module` bin；直接调用单文件构建器又会
   脱离完整 tsconfig，触发 React Native/DOM 重复声明和缺失 peer 类型。此次 JS/map 使用
   锁定的 TypeScript 5.9.3 按 Router 编译选项转译，并与候选 JS 对齐。B 在最终打包链路中
   必须重跑正式 build/pack，不能把这次最小转译当作完整发布构建通过。
2. 扩大到整个 Core example 目录的非门禁诊断为 221 项中 207 通过、14 失败；失败用例要求
   当前工作树未保存的历史 `docs/harmony-sdk54/evidence/...` 日志，或未提供
   `EXPO_I0_FIXTURE_ROOT` / `EXPO_HARMONY_EXAMPLE_ROOT`。固定 A-05 矩阵不依赖这些输入，
   但 B 若要纳入最终 runner，必须先恢复并绑定相应证据/fixture，不能把缺输入记为 PASS。
3. A-04 的设备矩阵仍为 PARTIAL：旋转被模拟器 debug 开关阻塞，sheet detents 失败；
   WebBrowser 正式四组合和生产 OAuth 未覆盖。
4. Font 声明式嵌入/移除未完成，因此 M4-A01 和整个 M4 不能关闭。
5. 当前候选不是 B 冻结的最终发布组合；任何 tgz、依赖或 build 变化都会使本报告的候选
   对比结论失效，并要求重跑受影响检查。

## A -> B 交接

B 可继续执行最终候选打包和 npm/pnpm x Debug/Release 验收，至少需要：

1. 从 A 当前源码重新生成 Router build，确认 JS/map 门禁仍为 PASS。
2. 对正式改名后的 `@expo-oh` tgz 重跑安装清单和 Core 单实例检查。
3. 在 npm、pnpm 的 Debug/Release 项目中复跑 Platform 类型、Router reload 和已登记设备路径。
4. 保留 Font 插件、WebBrowser 生产边界、旋转与 sheet detents 的开放状态。
5. 由 B 更新总规划和阶段台账；A 不在本报告中将 M4-A07 或 M4 改为 PASS。
