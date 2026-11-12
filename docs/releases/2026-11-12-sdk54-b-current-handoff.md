# SDK54 B 当前候选交接

日期：2026-11-12。负责人：B。分支：`feat/v1.7.0-chensq`。当前远端提交：
`24692db31b3d3b8c9b006d76bd5599d4bbac2f`。

本文件用于向 A、C 和协调者交接 B 在候选 `ffc8edad...317a3` 上完成的设备、CLI、性能和
runner 准备结果。它不是阶段关闭声明；机器原件位于本地 `outputs/`，不将 HAP、截图、日志或
`node_modules` 提交到 Git。

## 当前候选

- candidate SHA-256：`ffc8edaded548367d56b1e07b8f127f99372b7319bed15ddf2d2e398160317a3`。
- B candidate SHA-256：`30e40765406f7e735c7ed1d7e61c534ed1bbc36e871ce293f842992a8e53c9f7`。
- release SHA-256：`be8d824e8742d1ad4ef21bf1f2bd128a390bc9e5a172637a64fc88c7776862e6`。
- 15 个 runtime 包完整，blank/default × npm/pnpm 安装和锁重装 4/4 通过。
- 候选冻结源码为 `037844c4c44353cd216d96762cb77e3ec01e934e`，`source.dirty=true`；当前工作树
  只剩用户输入 `sdk54-abc-inputs-20261111.tar` 未跟踪。正式 runner 不得覆盖 dirty 标记。

## B 已完成

### 候选与 blank 四组合

当前候选 blank npm/pnpm × Debug/Release 已全部重跑：

| 单元 | HAP SHA-256 | 运行方式 | 结果 |
| --- | --- | --- | --- |
| npm Release | `5ac98dbcffa86a7ffa64c401a919532f6ce112575999e2a6724b2d4a636f6b46` | embedded bundle | PASS |
| pnpm Release | `7c5bdd24c4c4c9fdd1c9a0453461373286226ae47b28994464e4c9edd5b71881` | embedded bundle | PASS |
| npm Debug | `83b41b277cdb63644ac91f6f8d371dde0c61fb1583a4e64bc07364e23546934f` | Metro 8094 | PASS |
| pnpm Debug | `96ca5788182ea6eeb0a1c281a51a24e3c0ee977bf408141035c02ea07dafbf14` | Metro 8094 | PASS |

四格均完成 build/install/start、`Running "main"` 和 1320×2856 JPEG 页面核对。测试应用、8094
和 HDC reverse 已清理，用户 8081 未停止。机器汇总 `blank-four-current.json` SHA-256：
`c654dcf5040dda35a302c612fa34e8c337d43db2c2af1043449ff319ea237752`。

### B-03 CLI 回归

- npm/pnpm config 和 `install --check` 通过。
- Harmony-only export 只包含 `harmony`；all export 均包含 `android,harmony,ios`。
- 自定义 Metro resolver 和 serializer 均真实观察到 `android,harmony,ios`，没有被 Harmony 包装丢失。
- 无 overrides 的真实 React 19.0.0 漂移：check exit 1，fix exit 0，最终 check exit 0；declared、
  installed 和 override 均恢复为 19.1.1。
- overrides 冲突和 strict peer 拒绝原件保留；错误 target `not-connected` 明确 exit 1，没有误选设备。

机器汇总 `b03-current.json` SHA-256：
`9fa057b53494861ad938b8fbdad184ddb33d133a8fc8ef5a1729368e1a671b70`。

### B-34 当前侧性能

| 场景 | 当前中位数 | 当前最大值 | 旧基线中位数 | 改善 |
| --- | ---: | ---: | ---: | ---: |
| built-noop | 1.906 s | 2.055 s | 102.517 s | 98.14% |
| config-change | 2.295 s | 2.489 s | 111.034 s | 97.93% |

12 次预热/正式命令全部 exit 0，Harmony 根 inode 保持。机器汇总
`b34-current-ffc8-summary.json` SHA-256：
`2c6a74f25966f1c071f59601f2fedc4909544fa82ebf6c54b37117db004a31e6`。
旧基线选择和历史 verifier bypass 边界仍需 C 接受。

### V-02 资源与导航设备证据

- resources initial/reload/updated/removed 产品行为通过：同 PID reload、同 URI 更新、removed 清理、
  截图像素匹配率 1.0、字体 `glyphIoU=0.998482`。
- navigation 已采集 18 个语义场景、46 份 capture；HAP SHA-256
  `a1c3be1789df6e5be47a7506f533c87dc63b1675e0b7474c38f3ef931b465469`。
- navigation 行为通过：S01-S05、S09、S11、S13、S14、S16、S17、N01、N02、N03。
- 17/19 个 V-02 case 已有真实 argv/cwd/timeout/evidence 映射；没有为缺失项填写占位命令。

机器结果：

- `navigation-current-result.json` SHA-256：
  `a3324771f7d12ab9f90ddcded3e3608d22e5da78e559707cc843e180e0bc46fa`。
- navigation `a-device-evidence.json` SHA-256：
  `05ffd92a920ba7c8443dd50e555e886113684626b0f7ab68e0eb50f3c327a962`。
- B 总结果 `b-current-result.json` SHA-256：
  `5a455dde6fe29c2bd1e1b80797f78e63c6ee126f14faed41f0e658046da3385c`。

## A 需要处理

### 当前候选产品失败

1. **S08 fitToContents**：应用内容报告 280vp，真实内容为 980px，但 SheetPage 高达 2692px。
2. **S10 largestUndimmed**：35% 小档点击 Parent probe 时 Sheet 被关闭，父计数没有增加。
3. **S12 gestureEnabled=false**：系统 Back 使应用进入后台/黑屏，没有保持 Sheet 前台。
4. **S15 按钮关闭**：路由被移除，但没有产生 `closing:true` transition；S16 系统返回能产生。
5. **ExpoImage/default**：原始 default 仍报 `Native Harmony view is not registered: ExpoImage/default`。

修复后必须提供新 package/candidate/HAP 身份，并重跑受影响的 Sheet/default 设备场景。

### A/C 共同审查 verifier

真实设备暴露四个 synthetic fixture 未覆盖的差异：

1. Resource Image 有真实 bounds，但 HDC 不把 React Native `accessibilityLabel` 暴露到 `id/description`。
2. Sheet 白色实体检查固定取 `(92%,65%)`，小档时该点落在蓝色 Close sheet 按钮上。
3. 真实 `A_SHEET_DETENT` 字段为 `stable:true`，verifier 固定读取 `isStable`。
4. Grabber 节点和截图均真实可见，最暗 RGB 为 204，verifier 阈值固定要求 `<200`。

要求使用真实 HDC layout/event/screenshot 增加回归夹具，不能删除像素、PID、HAP、boot 或候选身份门禁。

### 缺失执行入口

- `V02-CORE-M4`
- `V02-OTHER-M4`

A/协调者需提供完整 current-candidate argv/cwd/evidence producer；A 的 23 个资源/导航语义场景不能替代
原 M4 完整覆盖。

## C 需要处理

- C 远端 `1a63207` 已实现 installName/publishName 双向候选核验；B 尚未合入和针对新 clean candidate
  重跑。旧的“publishName 映射未实现”请求可视为代码侧已响应，仍需集成结果。
- 复核上述真实设备 verifier 规则，确认修复没有放宽证据门禁。
- 复核 B-34 旧基线来源和临时历史 verifier bypass 边界。
- capability/use relations 和完整 membership ledger 未在便携输入包中恢复；需补充准确输入 hash，或在
  C 最终意见中保留不可关闭边界。
- default/ExpoImage 和四个 Sheet 产品失败未修复前，不得用公开面核验覆盖运行时 FAIL。

## 协调与停止边界

- A/C/协调者完成上述依赖前，B-32、B-33、B-35 和正式 V-02/V-03 保持 BLOCKED/PARTIAL。
- 当前工作树只有输入 tar 未跟踪；正式 run 前需明确 tar 的仓库策略，形成 clean source revision。
- A/C 改动导致产品包 hash 变化时，B 重新生成并冻结 candidate，重跑受影响的 resources、navigation、
  default 和统一矩阵。
- 本轮未执行 publish、tag、registry 写入或阶段关闭。

## 验证

- A/B/C/AI-E2E：189 tests，187 pass、2 skip、0 fail。
- 资源事务：8/8 通过。
- `git diff --check` 通过。
