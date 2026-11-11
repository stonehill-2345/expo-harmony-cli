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
