# SDK54 E2E 证据校验

`report.mjs --run-dir <目录>` 从保存的命令结果、候选和证据重新校验 `canClose`。
仅修改 `status: PASS` 不足以通过；旧的空候选、占位图片和文本 device-assertion 必须重新采集，不能改 hash 冒充有效证据。

- 每个 PASS 用例保存 `runCommand` 的完整 `command`，id 等于 caseId，exitCode 为 0、signal 为 null，timedOut/interrupted 均为 false。stdout/stderr 两个哈希引用也必须出现在 command-log 证据中，重算时逐一验 hash。
- candidate 引用支持 `pack-packages.mjs` 的 packages 数组，或 `stage-e2e-packages.mjs` 的 expoPackages/externalPackages 和 packages 数量。集合必须非空、failures 必须为空；每包 name/version/file/bytes/sha256 完整且无重复，tgz 必须在 manifest 目录内并与记录一致。这里验证候选身份与保存完整性；各阶段完整包集合、安装和运行能力仍需对应注册用例验收，workspace 候选不能替代正式集成。
- PNG/JPEG 使用固定开发依赖 pngjs/jpeg-js 实际解码，校验非零尺寸与像素；最多 3200 万像素，JPEG 解码内存上限 256 MiB。文件头或文件名不能代替有效截图，也不代替页面内容断言。
- V01-DEVICE-PREFLIGHT 的 device-assertion 是 `collectDeviceEvidence` 产生的 JSON：schemaVersion=1、kind=device-preflight、target、bundleName、pid、pidCommand、logCommand。target 必须匹配 run manifest；PID 命令必须针对该 bundle 且 stdout 为同一个唯一 PID；hilog 命令必须绑定此 PID、日志非空。两条命令及其日志引用按相同规则校验。它仅证明设备预检，不证明模块功能或 UI 正确。
- 超时或取消先向本次进程组发送 SIGTERM；1 秒内仍未结束则发送 SIGKILL。保留 stdout/stderr 与 timedOut/interrupted 标记。不会清理其他运行的进程。
