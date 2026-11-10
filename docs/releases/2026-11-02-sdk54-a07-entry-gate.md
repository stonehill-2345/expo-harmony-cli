# SDK54 A-07 进入门审计与 A→B 交接

日期：2026-11-02  
分支：`feat/sdk54-a-modules`  
基点：`19a0375cff7e0ef3bc62d54fd5ed57b913bb2000`

## 结论

A-07 当前为 **BLOCKED**，不能开始正式 M7.4 ExpoImage 包内实现，也不能进入组合或模拟器
验收。A-06 前期准备有效，但规划约定的 M6 前置尚未满足；本轮没有新增
`packages/expo-image/`，没有修改 B 管理的阶段台账、发行 catalog、锁文件或打包清单。

机器可重放结论见
[2026-11-02-sdk54-a07-entry-gate.json](2026-11-02-sdk54-a07-entry-gate.json)。进入门区分：

- `implementationReady=false`：尚不可开始正式包内实现。
- `integrationReady=false`：尚不可进入正式组合候选和 default 模拟器验收。
- `decision=BLOCKED`。

## 当前阻塞

| 阻塞 ID | 实际状态 | 解除责任 |
| --- | --- | --- |
| `STAGE_EVIDENCE_INVALID` | `stage-progress` 引用的 `outputs/sdk54/ai-e2e/20261027-m0a-creation/m0-ownership-baseline/scripts/sdk54/legacy-ownership.mjs` 在 A worktree 缺失，阶段接受证据不能重放 | B 汇总 / A 复核 |
| `M4_NOT_CLOSED` | 冻结台账 0/7，0%，未关闭 | A 提供结果，B 复核登记 |
| `M5_NOT_CLOSED` | 冻结台账 0/5，0%，未关闭 | B / A 复核 |
| `V_NOT_CLOSED` | 冻结台账 0/5，0%，未关闭 | B / A 复核 |
| `M6_NOT_CLOSED` | 冻结台账 0/5，0%，未关闭 | B 主集成 / A 配合复核 |
| `EXPO_IMAGE_RELEASE_IDENTITY_MISSING` | 当前 `sdk54-expo-oh-harmony.1` 只有 15 个包，没有 `expo-image@3.0.11` | B 提供机制，A 提供模块候选 |

缺失的阶段证据不是“文档路径不好看”，而是 `readStageProgress()` 无法核对接受记录的实际
哈希。进入门因此使用冻结台账列出未完成项，但额外标记 `STAGE_EVIDENCE_INVALID`，不会拿
未重放的百分比当作有效证明。

## 两层门槛

### 允许 A 开始正式包内实现

必须同时满足：

1. A-06 `preparationStatus=PASS`、`implementationStatus=NOT_STARTED`，固定版本仍为
   `expo-image@3.0.11`。
2. 阶段接受证据可从文件实际重放，不能只有手工编辑的 `sdk54-stage-progress.json`。
3. M6 的 5 个单元全部有 PASS 证据并正式关闭；其上游 M4、M5 和对应 V 门禁按总规划完成。

### 允许正式组合与模拟器验收

除上述条件外，发行机制还必须能表示 `expo-image@3.0.11`，并将同一个模块候选的源码、
JS/类型、TGZ、实际安装文件、HAP 和设备日志绑定为一个新鲜度身份。不能先用工作区源码跑
设备，再把另一个 TGZ 填进报告。

## B 交付接口

B 解除进入门时需要提供以下输入，A 不代替 B 修改：

1. 恢复或重新产生阶段接受记录引用的缺失证据，并确保
   `node scripts/sdk54/stage-progress.mjs --check docs/releases/sdk54-stage-progress.json` 通过。
2. 按实际验收结果登记 M4/M5/V/M6；部分专项 PASS 不能直接把整个单元或阶段改为 PASS。
3. 提供可扩展到新 M7 包的发行身份接口，使 `expo-image` 能声明上游版本、fork 名称/版本、
   依赖、归档和安装探针，而不是由 A 直接改写当前固定 15 包集合。
4. 保留 M6-A05 新鲜度负例：源码变更未重建、TGZ 替换、安装文件漂移或设备日志属于旧 HAP
   时必须失败。
5. 给出 A/B 都能执行的组合候选入口，不要求生产发布；本地真实 TGZ 即可。

## 门通过后的 A 首批工作

进入门通过后，A 按下列顺序执行，不扩大为一次性全模块实现：

1. 引入与 A-06 固定 Git/npm 来源一致的 `expo-image@3.0.11`，只增加 Harmony 平台所需文件，
   保留 Apple/Android/Web 和公开 JS/类型字节。
2. 实现 `ExpoImage/default` 注册及本地数字 PNG 的最小实际渲染；补注册名、属性映射、资源
   失败和卸载/reload 过期回调负例。
3. 生成同候选 TGZ，由 B 的正式机制安装到原始 default；重新 prebuild、Debug 构建、安装并
   在 nova16 验证两页真实图片像素与最小路由交互。
4. 只在上述结果全部绑定同一候选后判 GI；随后再补 33 个属性、6 个事件、静态/实例方法、
   缓存和 `ImageRef` 完整范围。GI、expo-image 模块完成和 M7.4 完成仍是三个结论。

## 自动化

```sh
node --test scripts/sdk54/__tests__/a-m7-entry-gate.test.mjs

node scripts/sdk54/a-m7-entry-gate.mjs \
  --check docs/releases/2026-11-02-sdk54-a07-entry-gate.json
```

专项 6/6 PASS，覆盖：M6 与发行身份同时满足、只有 M6 时仅允许包内实现、M6 未关闭时拒绝、
阶段证据不可重放时拒绝、上游阶段阻塞完整保留，以及 A-06/分母/ExpoImage 版本漂移失败。

本轮未执行 `git add`、提交、推送、发布或模拟器运行。
