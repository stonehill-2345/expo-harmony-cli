# SDK54 B-31：统一候选冻结与消费安装

日期：2026-11-11。负责人：B。状态：**B-31 PASS；正式 runner 因源码 dirty 保持 BLOCKED。**

## 输入与候选

- 实现基点满足：`f3892fade4e3f93c89420f2580a94f362bb23d2d` 是当前 HEAD 的祖先。
- 输入包 `sdk54-abc-inputs-20261111.tar` 已通过 `verify-inputs.py`：222 个文件，外层 SHA-256 `48cbc6a922c1a46a0ba7c7e74e0bffc6375baf81ad60a7c40d2ae06d7300471c`。
- 候选来源：`outputs/sdk54-abc/20261111-113600-B-83243/candidates`。
- 冻结目录：`outputs/sdk54-abc/20261111-113600-B-83243/frozen-candidate-final`。
- `candidate.json`：15 个 runtime 包，`failures=[]`，已通过现有 runner candidate verifier。
- `release.json`：15 个正式命名包，`verify-npm-release.mjs` 输出 `failures: []`。
- 独立 CLI：`expo-harmony-cli@1.6.0`，SHA-256 `fa4867f5616cf0d08254a1d4b2ce793770458b8c5fb3d1399b0c52f531b0d2d0`。

候选冻结工具 `scripts/sdk54/abc/b-freeze-candidate.mjs` 记录：源码 revision `3b16a31fc58b1fcbc92978cf93d1bfb3cb64abb7`、15 包逐包身份、tar 成员、平台声明、依赖图及插件 `src/build/d.ts` 对账。机器记录见 `frozen-candidate-final/b-candidate.json`。

## 消费矩阵

`test-release-install.mjs --full` 真实结果：

| 模板 | 包管理器 | 首次安装 | 锁重装 | runtimeFailures |
| --- | --- | ---: | ---: | --- |
| blank-typescript | npm | 0 | 0 | `[]` |
| blank-typescript | pnpm | 0 | 0 | `[]` |
| default | npm | 0 | 0 | `[]` |
| default | pnpm | 0 | 0 | `[]` |

临时消费证据已复制到本轮 `install-evidence/`，未将临时绝对路径作为最终引用。Release 校验、CLI 构建、CLI pack 和安装日志均在本轮输出目录保存。

## 边界

冻结记录中的 `source.dirty=true`，原因是本轮 B-32 代码/测试和用户提供的输入 tar 尚未提交。该候选可以审计和供 C 做包审查，但不能进入正式 B02 runner：preflight 要求 `source.dirty=false`。本报告不把安装矩阵等同于设备运行、ExpoImage/default 或 M4/M5 阶段通过。

## 合并 A/C 后重冻结

2026-11-11 合并 `origin/feat/sdk54-a-modules` 后 HEAD 为 `a9d7e512834b4bf0264a1d013e94271b0bcfef32`。A 修改使四个包 hash 变化：`expo-font`、`expo-modules-autolinking`、`expo-modules-core`、`@react-native-ohos/react-native-screens`，旧候选设备结果因此不能直接沿用。

新候选目录：`outputs/sdk54-abc/20261111-153839-B-post-a-3038/frozen-candidate/`：

- runner candidate SHA-256：`9aa71586069dfbf90a0a79ac6bb65c7dfc8b2462a45192ff24c9f1a0f0d2f061`；
- B candidate SHA-256：`b78242d77e87ab234b0dc179d798b516ca74f06bd5450358ffac64da37fd22d4`；
- release SHA-256：`0902fd9d71f05c0060ba045b3ece91851ab53b938c0a749f33fe6219d5f4a2ab`；
- blank/default × npm/pnpm 首次安装与锁重装仍全部 0/0，`runtimeFailures=[]`；
- fresh blank/npm Release HAP 构建、安装、启动通过，HAP SHA-256 `b090dfc016f843007036a0de6a6fdf811a444a62bdd06091492d4395d33e3951`，hilog 使用 `bundle.harmony.js` 并 `Running "main"`，截图文案正确。

随后补齐新 candidate 的 blank 四组合设备自测：

| 包管理器 | 配置 | HAP SHA-256 | 结果 |
| --- | --- | --- | --- |
| npm | Debug | `fe13129bf69ccdce5b4103e8d098ee210bda1c09f680b65d884ec2282b0f36dc` | PASS，Metro 8094，`Running "main"` |
| npm | Release | `b090dfc016f843007036a0de6a6fdf811a444a62bdd06091492d4395d33e3951` | PASS，内嵌 bundle |
| pnpm | Debug | `6155cdd96aa02736b08840679d9570719ef9ec63c857aacdd7ea8593000d073d` | PASS，Metro 8094，`Running "main"` |
| pnpm | Release | `ace03326e3b00fb541e471e29ee812a973bd85c817ba83550d182fefbf464c60` | PASS，内嵌 bundle |

机器汇总：`outputs/sdk54-abc/20261111-153839-B-post-a-3038/blank-four-matrix.json`，SHA-256 `1cfed35ac7ba70ddf68d2bcf4d81bda6fb0eaf311ed3216a43d9381cd87aec10`。四格均绑定 candidate `9aa715...`；测试应用、8094 和 reverse 均已清理。

新冻结记录仍如实为 `source.dirty=true`，正式 B02 preflight 继续等待 clean source。

## 2026-11-12 合并 A `037844c` 后重冻结

当前分支 fast-forward 合入 A 的契约导出/runner 绑定与 Router AppState 观测提交，HEAD 为
`037844c4c44353cd216d96762cb77e3ec01e934e`。重新从固定输入生成 15 个 runtime 包并执行
`verify-npm-release.mjs`，结果 `failures=[]`；独立 CLI 仍为 `expo-harmony-cli@1.6.0`，SHA-256
`fa4867f5616cf0d08254a1d4b2ce793770458b8c5fb3d1399b0c52f531b0d2d0`。

新冻结目录：`outputs/sdk54-abc/20261112-112755-B-post-a-037844c/frozen-candidate/`：

- `candidate.json` SHA-256：`ffc8edaded548367d56b1e07b8f127f99372b7319bed15ddf2d2e398160317a3`；
- `b-candidate.json` SHA-256：`30e40765406f7e735c7ed1d7e61c534ed1bbc36e871ce293f842992a8e53c9f7`；
- `release.json` SHA-256：`be8d824e8742d1ad4ef21bf1f2bd128a390bc9e5a172637a64fc88c7776862e6`；
- blank/default × npm/pnpm 四格首次安装和锁重装全部 `0/0`，`runtimeFailures=[]`；
- 机器矩阵 `install-matrix.json` SHA-256：`6983f3f0e3a81052715340a8d25b623706255b4c8d9fa3a12cee5ce49e0d5776`。

冻结记录只因用户输入 `sdk54-abc-inputs-20261111.tar` 未跟踪而 `source.dirty=true`。不得传入
`sourceDirty=false` 绕过；清洁提交后还需按新 revision 再冻结正式候选。
