# SDK54 B-34：合并 A/C 后当前候选性能

日期：2026-11-11。负责人：B。状态：**B 配对自验 PASS；等待 C 复核旧基线选择。**

候选：`outputs/sdk54-abc/20261111-153839-B-post-a-3038/frozen-candidate/candidate.json`，SHA-256 `9aa71586069dfbf90a0a79ac6bb65c7dfc8b2462a45192ff24c9f1a0f0d2f061`。

环境为同机 Release built snapshot；每个场景预热 1 次、正式 5 次，计时仅包含 CLI prebuild，快照恢复和安装不计时。

| 场景 | 正式样本中位数 | 最大值 | 绝对门槛 | 当前结论 |
| --- | ---: | ---: | ---: | --- |
| built-noop | 2.90 s | 3.14 s | ≤30 s | PASS |
| config-change | 2.31 s | 2.54 s | ≤45 s | PASS |

12 次命令均 exit 0；每次 prebuild 前后 Harmony 根 inode 保持不变。机器汇总：`outputs/sdk54-abc/20261111-153839-B-post-a-3038/b34-current-summary.json`，SHA-256 `dc93feb2dd9fee4658773f9d893c61ead224bce9b25a11ba6c6d4fa8ab469953`。

## 同机旧候选配对

固定旧候选使用 `outputs/sdk54/b01-baseline-release-20261102/`，Autolinking SHA-256 `77963ae3dde5f2bf797cec2eb0206c5225d7c0735bd37f714447b5cb7c2e1212`。旧候选按同机、同 Node、同 npm、同 benchmark 脚本重新安装、构建和采样；每景同样预热 1 次、正式 5 次。

| 场景 | 旧候选中位数 / 最大值 | 当前中位数 / 最大值 | 改善 | 要求 | B 结论 |
| --- | ---: | ---: | ---: | ---: | --- |
| built-noop | 102.52 / 157.11 s | 2.90 / 3.14 s | 97.17% | ≥80% 且 ≤30 s | PASS |
| config-change | 111.03 / 119.38 s | 2.31 / 2.54 s | 97.92% | ≥70% 且 ≤45 s | PASS |

旧候选每次替换 Harmony 根 inode，当前候选每次保持 inode，符合全树事务与稀疏事务的行为差异。12 个旧命令和 12 个当前命令均 exit 0。

机器配对汇总：`outputs/sdk54-abc/20261111-153839-B-post-a-3038/b34-paired-summary.json`，SHA-256 `59064ac6abbf30974a3806703dcd9421bb7806ae0074865195452474477cca6c`。

边界：旧候选在当前 verifier 下存在 Font README 和 Core compatibility 元数据漂移。为重建性能消费者，仅在临时历史源码副本中跳过安装前的新版文档/compat verifier；旧 tgz 字节、integrity、本地 registry 和安装/锁重装未修改。B 自验判定性能门槛 PASS，正式阶段接受仍需 C 确认该旧基线选择与临时 verifier 边界。
