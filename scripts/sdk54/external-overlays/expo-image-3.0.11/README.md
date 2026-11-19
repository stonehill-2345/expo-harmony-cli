# ExpoImage 3.0.11：Harmony 本地原生实现

这是 A 的初版 PNG 视图实现，尚未进入 B 的发行目录或统一候选。不能据此关闭 default GI、M4 或 M7。

从固定官方 tarball 添加 `harmony/` 与 `expo-module.config.json.harmony`，不修改官方 JS、类型、iOS、Android 文件。输入 SHA256 为 `e17879a4cc6cebdf50efadf3170956b2601363f1525f0426b10859a6154178bb`。

```sh
node scripts/sdk54/abc/a-prepare-expo-image.mjs --archive /absolute/path/expo-image-3.0.11.tgz --output /absolute/path/new-output
SDK54_IMAGE_ARCHIVE=/absolute/path/expo-image-3.0.11.tgz node --test scripts/sdk54/__tests__/abc-a-expo-image.test.mjs
```

输出为 `expo-image-3.0.11-harmony-local.tgz` 和包含源码 hash 的 `expo-image-local.json`。输出目录已存在或输入 hash 不符时拒绝执行。测试需要 Node 22、Python 3、C++20 编译器与 CMake。

## 当前范围

- 通过 Core 注册实际 `ExpoImage` 模块和 `ViewManagerAdapter_ExpoImage` 视图，ArkUI ImageNode 显示单一 PNG URI。
- URI 范围：`asset://`、`resource://RAWFILE/`、`file:///`、HTTP(S) 的 `.png` 路径，以及 Expo Metro `/assets/` 的 `unstable_path` PNG 查询路径。远程 URL 可带 query；bundled asset 禁止路径穿越和编码绕过。URI 后缀检查不代替实际解码，坏文件由原生错误事件报告。
- `cover`、`contain`、`fill`，居中定位；布局随 React Native view 尺寸更新。
- 更换 source / recyclingKey 会删除旧节点并创建新请求；清空 source 或卸载使请求失效。请求代数阻止替换、取消和重复完成后的事件进入新请求。
- `reloadAsync` 请求重新加载；Promise 表示命令已执行，图片完成由事件报告，与原版实例方法的语义一致。
- 原生发出 loadStart、load、error、progress；官方 JS 由 load/error 派生一次 loadEnd。display 当前取 ArkUI 解码完成事件；基本场景已有截图与事件证据，精确首帧时序仍待验证。
- load 的宽高取 ArkUI 原图像素；`mediaType` 为 null，未虚构 `isAnimated`。`cacheType` 目前固定 none，表示本模块没有 Expo 缓存实现，不能用于证明 ArkUI 内部未命中缓存；缓存观测契约仍未闭合。

## 明确限制

ImageRef、多 source 选择、placeholder/hash、headers/cacheKey、缓存策略、优先级、非居中 contentPosition、transition、tint、blur、动画与平台高级选项尚未实现；传入这些选项走 error。部分显式默认值也会拒绝，例如 transition=0 经官方 JS 转成对象后尚不接受。

prefetch、clearMemoryCache、clearDiskCache、getCachePathAsync、generateBlurhashAsync、generateThumbhashAsync、loadAsync，以及 startAnimating / stopAnimating / lockResourceAsync / unlockResourceAsync 会拒绝 `ERR_IMAGE_UNSUPPORTED`。不能把方法存在记为能力通过。没有完整网络、缓存、APNG、边框、辅助功能或方向设备回归。

## 独立验证夹具

`example/index.tsx` 是人工驱动的 LOCAL 夹具，必须正常安装上面的 tgz 和匹配的 Core/RNOH。将 example 复制到独立消费者，index.ts 导入它，再使用既有 Harmony Metro/原生项目生成与构建入口。不要改 node_modules 或 oh_modules。

first.png 为 80×40 红/白/蓝三色图（中间白带宽 20 像素），second.png 为 40×80 绿/黄两色图。视图为 240×180：contain 的首图为 240×120、上下各留 30；第二张为 90×180、左右各留 75。单位为布局 dp，截图须按实际设备密度换算。首图白带在 cover 下宽 90dp，在 fill 下宽 60dp，用于区分裁剪与拉伸。

依次验证首次显示、替换、坏路径、非法类型、恢复、contain/cover/fill、reload、卸载和不支持方法。结合像素、UI 几何、`A_IMAGE_EVENT` 日志及 HAP/PID 身份判断；不能只看按钮日志或 load 成功。此夹具不替代原始 default app 的 PNG/页面 GI。

## 后续交接

B 需接入正式打包身份与候选、生成原生宿主并执行 npm/pnpm × Debug/Release。C 需复核公开能力边界，尤其 cacheType、onDisplay、source 元数据和错误行为。当前仅能独立交付源码与 LOCAL 编译证据。

## 2026-11-12 模拟器回归入口

运行需要当前 Core 的 Harmony lazy view 安装修复（`NativeViewManagerAdapter.harmony.tsx`）及真实 ExpoAsset 注册；只注册 Core/Image 的独立宿主会缺少官方 JS 的 Asset 依赖。不要修改官方 ExpoImage JS 来绕过初始化。

`node scripts/sdk54/abc/a-verify-expo-image.mjs --run-dir <本轮证据目录>` 只读 `image-run.json`、安装日志、HAP、12组 layout/JPEG/hilog。它核对文件 hash、HAP 内测试图字节、同 target/PID/runtime boot、事件增量及像素。覆盖 initial/replace/missing/unsupported/recover/cover/fill/contain/reload/unmount/remount/prefetch；不包含网络在途取消、完整缓存或原 default GI。首次红测暴露 fit 更新重复加载；来源比较已从 JSON 文本改为结构值比较。

像素断言按40×30网格独立推算 object-fit，容许每通道24的 JPEG误差和预计边界2个物理像素的栅格取整，至少800点、98%一致。测试含拉伸冒充cover、裁剪冒充fill、白屏/卸载残图、重复loadEnd、旧boot及错误尺寸负例。

原始 default 模板的 LOCAL pnpm Release 也已通过首页 PNG、Explore PNG、Modal/链接返回/系统返回、Tabs 和冷启动观测；原页面、组件和图片未改写。只读入口为 `scripts/sdk54/abc/a-verify-default.mjs`，本轮材料见 `outputs/a-default-20261112/report.html`。完整 prebuild 要使用带兼容 HAR 的 Core 包及同策略自动链接包，不能直接沿用独立 Image 宿主的简化 Core 包。此结果不覆盖正式 B 候选、Debug、npm、完整 GI 或缓存/动画能力。

Debug 主机检查发现：已安装的 Harmony AssetSourceResolver 将 PNG 文件名放进 Metro `unstable_path` 查询值，并可能在该值后追加第二个 `?platform=`。原 URI 检查会拒绝服务器实际返回 200 的 PNG。现仅为 HTTP(S) `/assets/` 接受唯一的 `unstable_path` PNG 值，原样传递 URL；非 PNG、重复参数、错误端点和本地查询 URI 仍拒绝。两个原模板 URL 已用旧/新原生头文件对照复现，并核对 HTTP 字节与原图一致；这是主机验证，尚无修复后设备解码或 JS reload 结论。证据与修复包见 `outputs/a-default-debug-20261113/report.html`。
