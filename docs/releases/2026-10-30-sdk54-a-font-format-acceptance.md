# SDK54 A-03 字体格式与错误处理专项

日期：2026-10-30。工作区 `/Users/zhansh/project/expo-harmony-cli-a`，分支 `feat/sdk54-a-modules`。本轮承接 [Font/Asset 运行时专项](2026-10-30-sdk54-a-font-asset-acceptance.md)，A-03 保持 PARTIAL，M4 保持 0/7；不将格式边界检查写成支持该格式。

证据目录：`outputs/sdk54/ai-e2e/20261030-a03-font-formats/`。旧专项证据包保持独立。本轮修改仅在 expo-font 包及 A 的报告/证据；未修改 B 所有的 CLI、生成器、catalog 或锁文件，未暂存/提交/推送。

## 固定范围与修复

从已恢复的官方 Git 对象库读取 Expo commit `5b42e3d21e0ac5e086752361ca8a5cb4de53bec1`。其字体指南明确保证跨平台 TTF/OTF；WOFF/WOFF2 是 iOS plugin 额外支持，不是 Harmony 运行时自动承诺。当前设备 API 22，不能使用 API 23 才提供的 `loadFontSyncWithCheck`。文档原文、Git blob 身份、SHA-256 及本地 SDK 声明均已保存。

原加载器只检查非空文件、sfnt 头和表目录，结构合法不等于可解码。新增 `drawing.Typeface.makeFromFile` 原生解码检查，失败后不调用 RNOH 注册、不记录 loaded 状态。宿主 RED 证明旧实现会接受此输入，新实现通过相应回归；最终相关宿主测试为 35/35。

TTC 仍明确拒绝，并保留为未支持项；WOFF/WOFF2 现在给出明确不支持信息。更新包根 README 与 Harmony README，区分源码候选新增能力与已发布版本，纠正仍声称 renderToImageAsync 未实现的旧说明。

## 夹具与门禁

`harmony/example/formats/create-fixtures.py` 用固定 fonttools 4.60.1、brotli 1.1.0 生成原始几何字体：TTF 的 U+E001 是 L，CFF-OTF 是三角形；另外生成双字体 TTC、真实 WOFF/WOFF2、空文件、截断文件及结构合法但无法解码的 sfnt。两次生成逐字节一致；FontTools 核对容器和 outlines，Pillow 独立解码 TTF/OTF/TTC，确认损坏样例无法解码。初次默认 pip 源安装失败，改用官方 PyPI 后成功，日志保留。

公共夹具包含 13 个精确用例：6 类拒绝、失败后重试、同名并发加载、OTF 加载、已加载别名幂等，以及 TTF/OTF/重试的三张图片。捕获实际错误 message 并按原因校验，不能仅凭 Promise 被拒绝就通过。

像素门禁检查三张 PNG 的颜色、尺寸、字形，并检查截图中的 TTF/OTF 原生 Text 与 Image，共 21 项。使用私用区码点和不同几何形状防止系统字体回退冒充成功；PNG 字形与独立参考的 IoU 须大于 0.95，截图须大于 0.94。

首轮 v1 API 13/13 和所有字形检查通过，但尺寸门禁预期 210px，实际是 211px。隔离 host 原生探针测得 advance 为 `210.0000457763672`，产品 `ceil` 为 211 是正确的取整行为。只将门禁调整为允许最多多一列，高度和字形仍严格校验；空 PNG、额外三列 padding、缺失原生 Text 的反例全部拒绝。原失败、探针 HAP/日志与原输入均保存，不覆盖失败记录。

## 最终候选与结果

**最终 v2 在 nova 16 Pro（API 22，scale 3.5）通过本专项。** 消费者：`/Users/zhansh/project/sdk54-ab-a-consumers/20261030-a03-formats-v2-npm`。6 包共 1,926 条源码记录与源 manifest 一致，Font host ETS 与当前源码一致；真实 npm 安装和逐文件归档核对已通过，未修补安装后的产品包。v2 包含全部本轮夹具/门禁源码。

| 项目 | 实际结果 | 证据 |
| --- | --- | --- |
| 宿主回归 | 35/35 | `host-green.log`；解码与 WOFF 的 RED 单独保留 |
| Release 原生编译 | PASS，hvigor 2 分 9.901 秒 | `release-build-v2.log` |
| 首次启动 | API 13/13，PNG/原生 Text 21/21 | `release-v2-initial-*` |
| 连续 3 次 reload | 每轮 API 13/13，PNG/原生 Text 21/21；同一 PID、新 boot，无观测到旧实例回调 | `release-v2-reload-1/2/3-*` |
| Release 离线冷启动 | API 13/13，PNG/原生 Text 21/21；PID 19718 → 20174、新 boot；8081 无 Metro、无 HDC 转发 | `release-v2-cold-*`、`lifecycle-v2.json` |
| 像素门禁负例 | 空图、额外 padding、缺失原生文字均拒绝；合理取整通过 | `gate-regression-results.json` |

三张 PNG 与参考字形 IoU 均为 1.0。原生 Text 的 TTF/CFF-OTF 字形也分别通过 0.94 门槛；截图展示每种字体的原生文字与 PNG 两份结果，不能只看下方图片就判 Text 正常。最终图片宽 211、高 210px，属于已实测确认的单列取整，非字形拉伸。

设备实际错误分别为 `Font collection files (TTC) are not supported on Harmony`、`WOFF/WOFF2 font files are not supported on Harmony`、空字体、非法表目录、`could not be decoded`；拒绝后 `isLoaded`/`isLoading` 为 false，且未出现在 `getLoadedFonts()`。同一失败别名随后加载有效 TTF 并渲染成功。并发同名加载只报告一个家族；已加载别名再次传入 OTF 后仍呈现原 TTF，符合固定 SDK54 JS 的幂等语义。

| 工件 | SHA-256 |
| --- | --- |
| expo-font tgz | `5a50084119bfa647214b1ac352b55063bb406217f27311c243d988f94ad934c0` |
| expo-modules-core tgz | `00e59332b198ccea9317a63bc82d8b85107a475e3ae6d18bec95af0264c22e10` |
| Core-v1-v3 HAR | `0e0cf3dbb5b2e510f49c819ff5db2f43ad5a5918d38e840cc2714055c9f6fd83` |
| 最终 Release HAP | `0c81ff6ebe9b0537a4117b3145cfc0220f01831ce07278f58231a83a33dbb111` |

`candidate-v2/` 保存最终包、HAR、HAP、锁文件、入口及原生 host 输入；`prior-candidate-v1/` 保留旧候选和尺寸诊断 HAP。诊断只修改隔离的生成 host，未修改 npm 安装包，且已恢复 v1 源输入；最终 v2 未带诊断修改。v1 仅记录 rejection 字符串为 `[object Object]`，不能证明具体错误；v2 已读取并校验实际 message，以上错误结论只来自 v2。

本轮应用 `dev.expo.a03.formats` 已停止并保留，12 个设备临时采集文件已清理；本轮启动的 nova 模拟器已释放。下一项 A 可独立推进 A-04 模块生命周期与异常处理。


## 尚未完成

- TTC 仍不支持；WOFF/WOFF2 为明确不支持边界，不算格式功能通过。变体字体、其他字体家族/复杂文字等未由当前几何字体专项覆盖。
- 声明式 Font/Asset 资源增删、插件移除与无主文件清理仍等待 B 的 A-B-05/06 接口。
- 正式 npm/pnpm × Debug/Release 组合、A-05 最终候选收口仍需 B 接入。当前几何字体夹具不替代原有 MaterialIcons/Asset 专项，也不复用旧候选结果冒充新候选全量回归。
- `ExpoImage/default` 未解阻；A-04 模块生命周期和 A-06 准备仍可按原分工继续。

## 证据封存

完整证据包：`outputs/sdk54/ai-e2e/20261030-a03-font-formats-evidence.tar.gz`。从包中逐文件复核 298 个文件及清单，SHA-256：`a5cff41a1fbc232ff216e39d2bdb86e56a2e971830b4c739fd794901c6422768`。包内报告为封存前快照，本节为封存后身份追加；同目录 `.json` 和 `.sha256` 保存校验回执。
