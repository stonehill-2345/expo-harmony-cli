# C 单人接管执行记录

用户最新授权：A、B 均退出，后续实现由 C 承担。本记录覆盖 BC-20261113.md 与旧 C 计划的人员归属限制，不改变验收门槛。

## 职责与验收

C 负责产品修复、CLI/打包/安装、runner/采集、语义验证、公开关系、候选交付及验收。旧 requests 中 to=B 的开发项转为 C 内部待办，不再标为等待 B。

实现验证、只读材料重算、外部消费者实跑、设备实跑和阶段签收分开记录。原 B 复核不能由 C 冒充完成；当前为单人复核，不称为第二人独立复核。自动化证据验证仍在隔离消费者和候选副本执行。

不自动 git add/commit/push、合入、发布或联系他人。产品修改后工作树 dirty 必须如实记录；不能绕过 clean-source 冻结门。需要提交时先交付可审查 patch，提交由用户决定。

## 当前最小范围

Must：

1. 修复 Debug 默认/重复端口误拒绝，配置缺失时避免先写入部分配置。
2. M4 命令集合必须逐项匹配 registry，不能只验证19个不同ID。
3. 修复发行升级遗留的测试身份，跑完整检查，继续处理真实失败。
4. 完成 M4 设备语义证据链，复用既有逐模块 oracle；不能把 host parser tests 或任意文件hash加自报PASS当设备证明。
5. 正常准备16个runtime包及CLI、校验公开面与安装；同候选做专项、矩阵、性能及最终意见。

Should：保留红绿测试、原始命令/输出、候选及源hash、逐项状态和完整HTML。
Could：报告便利性优化。
Won't：降低像素/PID/boot/HAP/候选身份门、合成设备原件、新建通用验证框架、伪造clean source。

## M4 接入审查发现

- b-run-m4 当前 definitions 运行 Core/Other 主机测试，其中 device-log.test.cjs 本身生成合成日志；这些是 parser 回归，不是本次设备采集。
- validateM4DeviceEvidence 仅检查字段、逐case自报PASS和文件hash，未重算设备语义、未绑定期望候选，不能独立签收。
- 输出 kind=m4-device-assertion；现有 report 的 verifyDeviceAssertion 只验证 device-preflight，两者不兼容。
- 不采用“只增加kind白名单”的修复。先核对已有 check-device-log.cjs、check-i0-log.cjs、Linking/StatusBar/导航等 oracle 与完整必达集合，再对真实原件绑定进行重放。尚无覆盖全部Other必达的统一语义重放，该部分是C内部未完成开发，不是等待B。
- 没有真实原件或空闲设备时明确记录NOT_RUN/BLOCKED；不把单人接管变成签收豁免。

## 下一阶段顺序

先关闭主机测试和M4证据契约缺口；正常打包并审查产物。获得可冻结源身份后，生成新候选与只读源快照，再在外部消费者执行安装/锁重装及设备专项。专项门通过后做npm/pnpm × Debug/Release矩阵和同机配对性能。任何产品修复改变包hash，都重新分析影响与重跑。
