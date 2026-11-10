# SDK54 A-03 Font / Asset 运行时专项

日期：2026-10-30。A 工作区 `/Users/zhansh/project/expo-harmony-cli-a`，分支 `feat/sdk54-a-modules`，基点 `19a0375cff7e0ef3bc62d54fd5ed57b913bb2000`。本记录仅覆盖 A-03 的运行时切片，A-03 保持 PARTIAL，M4 保持 0/7。正式资源插件、完整格式和发行组合仍未验收。

证据目录：`outputs/sdk54/ai-e2e/20261030-a03-font-asset/`。总规划/台账由 B 更新，本轮未改共享 CLI、Metro、生成器、catalog 或根锁文件，未暂存/提交/推送。

## 范围与实现

从已重建的固定 SDK54 范围提取 Font/Asset 共 349 条来源记录：M4_REQUIRED 130、M7_TRANSFER 120、SOURCE_CONTEXT 99。这是来源行数，不是 API 完成数；`font-asset-scope.json` 不代表成员闭包或全量完成。

- 新增 `ExpoFontUtils` 的 ArkTS/C++ 注册，通过原有 `Font.renderToImageAsync` 返回 PNG、dp 尺寸和 scale；支持颜色、透明度、字体、字号及字形外扩。编码失败、部分写入、写入停滞、模块销毁均释放资源并清理未交付文件。
- FontLoader 保留已注册字体的文件路径；渲染器显式将文件加载到原生 text.FontCollection，以每次渲染独有的内部别名交给 Paragraph 绘制，并在结束后卸载。公开字体名可含空格/引号，`getLoadedFonts()` 不暴露内部别名。当前原生字形边界和字体清理路径要求 Harmony API 20+，更早版本未承诺支持。
- Asset 产品实现未修改；补充真实模块宿主测试，覆盖缓存复用、损坏修复、MD5 不符、并发、HTTP 失败和部分写入清理。
- 更新旧 Font 夹具，不再把 `renderToImageAsync` 不可用视为当前成功。历史日志仅在显式 `EXPO_FONT_LEGACY_V1_EVIDENCE=1` 时可回放；本轮未运行缺失历史目录的旧设备回放测试。

## 失败证据与验收原则

首次 Release v4 在 nova 16 Pro 上 API 元数据 11/11，但两个自定义图标 PNG 全透明；系统字正常。`release-nova-initial-pixels.json` 明确为 FAIL，原始截图、HAP、日志及 PNG 均保留。不能将 API 数量当作实际渲染通过。

排查先怀疑 Canvas 字体表达式中的 JSON 引号。公开 OpenHarmony 实现按空格拆分并按原始名称匹配，不能按浏览器 CSS 字体语法推断；但 v5 改用无空格内部别名后，实际 PNG 仍为空白，证明该假设不足以解释设备失败。`release-nova-v5-initial-pixels.json` 及对应 HAP 保留为 FAIL。最终改用显式文件加载的原生 Paragraph/Canvas 绘制；不将 OffscreenCanvas 在当前 RNOH 调用上下文中的内部失败原因写成已完全定位。已保存源码诊断参考及内容 hash，它不是设备 SDK 的确切源码版本；固定提交下载超时也保留说明。

回归保存别名方案 RED 和原生文本方案 RED；最终 Font/Asset 宿主 33/33（`font-asset-host-v7.log`），包含绘制异常时字体/PixelMap 清理，以及设备实测行高的回归。独立 Pillow 门禁检查 PNG 的实际尺寸、非透明内容、颜色/alpha，并用同一官方 MaterialIcons.ttf 独立栅格化 home 字形，要求归一化掩码 IoU > 0.95；大字号图标覆盖含空格和引号的字体别名。透明文字应全透明。设备页面只报告 API 结果并明确还需 PNG 验证。

## 候选与设备结果

**最终 v7 在原有 nova 16 Pro（API 22，1320×2856，scale 3.5）通过本专项。** 候选消费者为 `/Users/zhansh/project/sdk54-ab-a-consumers/20261030-a03-font-v7-npm`，从源码生成 tgz、真实 npm 安装并逐文件核对；6 包共 1,922 个源文件与 manifest 一致，Font 原生 host 输入与源码一致，安装内容与归档一致。入口 `index.ts` 显式导入 `expo-entry.ts`，后者注册 `FontAssetApp`。未修补安装后的产品包。

| 验收项 | 实际结果 | 证据 |
| --- | --- | --- |
| npm 安装、归档/安装内容、源码一致性 | PASS | `verify-install-v7.log`、`source-reconciliation-v7.json` |
| Release ArkTS/C++ 编译与 HAP | PASS，hvigor 2 分 50.477 秒；这是本次独立构建，不是 prebuild 性能基准 | `release-build-v7.log`、`release-hap-v7.json` |
| 首次启动 | API 11/11 + 像素 24/24 | `release-nova-v7-initial-*` |
| 连续 3 次 public reload | 每次 API 11/11 + 像素 24/24；PID 相同、boot 每轮变化，无旧实例回调 | `release-nova-v7-reload-1/2/3-*` |
| Release 冷启动 | API 11/11 + 像素 24/24；PID 15173 → 15672、boot 更新；8081 无 Metro，HDC 无转发 | `release-nova-v7-cold-*`、`release-v7-lifecycle-completed.json` |
| 门禁负例 | 全透明图标、额外图片高度均被拒绝 | `pixel-gate-negative-results.json` |
| 宿主异常/清理测试 | 33/33 | `font-asset-host-v7.log` |

最终图标图片为 168×168 / 336×336 px，即 48×48 / 96×96 dp；最大 alpha 分别为 255 / 128。与独立字体参考的字形 IoU 分别为 1.0 / 0.9818，高于 0.95 门槛。检查器绑定当前 nova 固定夹具，字体尺寸常量不能直接用作其他密度设备的门禁。截图仅显示 API 检查结果，完整 PASS 由落盘 PNG 验证给出。

v6 已显示图标但图片高度额外变大。隔离的原生 host 诊断保留在 `bounds-probe-*`，证明不能把 TextLine image bounds 的纵坐标直接加到 paragraph baseline 上；改用行 ascent/descent 后完成上述 v7 验收。诊断未修改 npm 安装包，不作为最终产品候选，原 v6 输入和 HAP 已保留/恢复。

冷启动自动化第一次错误使用 `aa force-stop -b <bundle>`，设备返回 package 信息错误；保留 `release-v7-lifecycle.json` 和 `exercise-a03-initial-error.py`。读取设备帮助后按 `aa force-stop <bundle>` 重做冷启动，正确结果独立记录，未覆盖失败。

固定身份（完整 SHA-256）：

| 工件 | SHA-256 |
| --- | --- |
| expo-font tgz | `5161a4fbc905aadc4ec182c38da29e0e773f1f446c932433bd49e557ae8faa14` |
| expo-asset tgz | `16676c76082a681a576703d54f1cb9461426b5d5cae9693d0a342739d5315323` |
| expo-modules-core tgz | `a89de11ec321790e8c4a3b9dddf5c35f54abbac47c8d54405857fa08379381cf` |
| Core-v1-v3 HAR | `0e0cf3dbb5b2e510f49c819ff5db2f43ad5a5918d38e840cc2714055c9f6fd83` |
| 最终 Release HAP | `36b7a5f2c9590584ddc63328abf20d27ce11aff8243b1c03d7bebd2a9de7e148` |

最终候选、锁文件、入口、原生 host 输入、MaterialIcons 参考字体存于 `candidate-v7/`；失败候选存于 `prior-candidates/`。测试应用 `dev.expo.a03.font` 已停止并保留用于复验；本轮 16 个临时设备采集文件已清理，模拟器已停止，HDC `[Empty]`，无转发。

## 保留的边界与后续

1. 声明式 Font/Asset plugin 均被现有 Harmony 插件校验拒绝；资源增加、修改、删除和插件移除需 B 的资源生成事务接口。具体接口及验收条件见 [A→B 交接 A-B-05～07](2026-10-29-sdk54-a-to-b-handoff.md)。当前 fixture 的内嵌资源不能替代正式 prebuild 证明。
2. TTC 被现实现明确拒绝，WOFF/WOFF2 等格式未达到设备验收；TTF MaterialIcons 专项不能外推全格式。网络、重名/重载、复杂排版和所有公开成员也不能由当前切片推出完整 PASS。
3. 本轮 Font/Asset 候选尚无 npm/pnpm × Debug/Release 全组合证明。此前 Core 四组合证据属于另一固定候选，不能复用为本次 A-03 的完整证明。
4. `ExpoImage/default` 未修复；本专用测试页不证明原样 default 首页可用。A-01/A-02 总任务及 A-05 正式发行收口仍遵守原前置。
5. 准备/构建/运行曾出现工具依赖缺失、ArkTS 任意类型 throw 编译失败、错误 bundle 入口、临时模拟器存储不足等失败，均保留；HDC 退出 0 不等于安装成功。临时模拟器已删除，最终复验使用原有 nova 16 Pro，未重置用户模拟器数据。

## 后续 A 可独立继续的工作

- 补齐 Font 格式和错误/并发/重载语义；先确认固定 SDK54 的逐格式期望，再实现和验证，不能把 TTC 当前拒绝改写为完成。
- 推进 A-04 的模块内确定行为：Splash/SystemUI/StatusBar、Linking/Router、WebBrowser 的生命周期与异常分支，继续按独立候选保存实际设备证据。
- A-06 可先整理 ExpoImage 固定公开面、注册依赖及 default 失败断言；正式 M7 实施仍遵守原 M6 前置。
- 声明式资源插件闭环等待 A-B-05/06；正式 npm/pnpm × Debug/Release 和 A-05 收口等待 B 的发行/runner 接入。A-03 部分通过已可交接，不能登记为任务完成。

## 证据封存

完整证据包：`outputs/sdk54/ai-e2e/20261030-a03-font-asset-evidence.tar.gz`。逐文件从压缩包读取并验证 451 个文件及清单，SHA-256：`060b6089a158d80014f4e0a7e36feceb14676a0e72aa340f493879db4f9d0afa`。包内报告为封存前快照；本节为封存后追加的身份记录。校验回执为同目录 `20261030-a03-font-asset-evidence.json`，不依赖测试消费者目录长期保留。
