# B Other 多应用原件交接契约（2026-11-14）

依据同分支计划；B 写采集/封装，C 写语义与独立验收。新增入口复用既有原件和 hash，
解决单 bundle/PID 无法表达六项历史多应用的问题；不创建合并应用或新验证平台。

## 输入与身份

独立 run-manifest 保留原 candidate、runId、device，增加可选
`m4.other.caseCaptures`，六个键必须恰好为：

- M4-A03-splash
- M4-A03-system-ui
- M4-A03-status-bar
- M4-A04-linking-router
- M4-A05-browser
- M4-A07-package-sync

每项形状如下（示例值不是设备证据）：

```json
{
  "bundle": "dev.example.browser",
  "pid": 1234,
  "mode": "release",
  "bootIds": [100, 200],
  "captureCwd": "/original/run-directory",
  "hap": {"path": "builds/browser.hap", "sha256": "实际64位SHA256"},
  "capture": {"path": "captures/browser.json", "sha256": "实际64位SHA256"}
}
```

capture 必须是 JSON 对象，文件名可为 `.json`、`.JSON` 或无 JSON 后缀。
旧 `m4.other.captures` 五项内嵌形式不再作为此多应用接口；不能省略 package-sync。
`bootIds` 必须是非空、不重复的数组；每项为非空且不含 NUL 的字符串，或正安全整数。
保留原 marker 的值与类型，不将 Router UUID 转成数字，不将数字转成字符串。
各 case 从自身 marker 绑定 boot 身份：

| case | 原始 marker |
| --- | --- |
| Splash / StatusBar | `A04_SPLASH_STATUS` |
| SystemUI | `A04_SYSTEM_UI` |
| Linking / Router | `A_ROUTER_PROBE` |
| Browser | `A04_WEB_BROWSER` |

RouterProbe 的 `boot` 可为 UUID 字符串；其他应用的数值 `boot` 保持原值。
package-sync capture 引用各成员身份、各自 marker 及来源，不把多个应用归并成单一 boot。
Other 不以 `EXPO_CORE_BOOT` 代替这些 marker，禁止为了满足验收伪造 Core 日志。
可选 `m4` / `m4.other` 缺失合法，存在时必须为对象。
身份目录 `captureCwd` 必须为绝对路径，文件引用拒绝绝对路径、反斜杠、空段及 `.`/`..` 段。

capture 原件保留 `candidateSha256`、`target`、`systemVersion` 及上述应用身份，
并包含固定 `pidCommand`、`logCommand`、`installCommand` 和截图、layout、hilog 引用。
命令 `argv` 固定为 `[hdc, "-t", target, ...args]`，参数分别为
`["shell", "pidof", bundle]`、`["shell", "hilog", "-x", "-P", String(pid)]`、
`["install", "-r", hap.path]`。每条回执保留真实 `cwd`、退出码、signal、超时、
中断状态及 `{path,sha256}` stdout/stderr 原件；C 独立核验语义及身份一致性。

所有文件引用相对独立 run-manifest 所在目录，包括 capture 内的命令 stdout/stderr、
图像/layout 引用。保持原始字节及 captureCwd，不为便携性改写历史记录。
同一采集可供 Splash/StatusBar 两项引用；C 必须检查两项真实身份一致。
package-sync 如需组合多个应用，capture 原件必须引用各成员身份与来源，不得仅凭六个键存在判完成。

## 已实现入口

```sh
node scripts/sdk54/abc/b-export-other-captures.mjs \
  --run-manifest /absolute/run/run-manifest.json \
  --output /absolute/new-handoff
```

先校验六项身份和递归引用完整性，再封装。复制 candidate manifest、HAP、capture
及其中显式 `{path,sha256}` 原件；递归解析 JSON 内容，不因大小写或非标准后缀漏收嵌套引用，输出 `other-captures.json` 和原始
`source-run-manifest.json`。拒绝越界、越界 symlink、hash 不符、缺 case、非法身份、
覆盖已有目录。候选 manifest 以 file 字段引用的 tgz 不由此工具补打包，正式候选
仍使用原 b-freeze-candidate 交付。

状态只能是 `CAPTURED_NOT_VERIFIED`。封装成功不证明输入来自真实设备，也不证明
PID/安装/hilog 命令与身份一致；这些由 C 对原件重新核验。输入的 PASS 字段不升级状态。
该入口不是动作驱动器，不负责自动点击全部场景。生产采集/动作覆盖及 C 接合未完成。

## 基础采集器修复

既有 collectDeviceEvidence 在截图获取并解码后再次执行同 target/bundle 的 pidof，
若进程更换、消失或变为多 PID，不写成功回执。原命令日志及截图保留以供诊断；
新增 pidAfterCommand，不改已有 pidCommand/logCommand 字段。
它仍是 device-preflight，不可当作 M4 语义证据或前台窗口归属证明。

## 接合与责任

- B 的 run schema 已支持上述可选字段；旧 Core 单应用路径保留。
- C 的 b-run-m4/report 不由 B 修改。接合前完整 Other 保持 BLOCKED。
- B 本轮只读复核认可 C 三项修复：StatusBar phase 属于单 runtime；Browser 启动基线
  不等于交互场景；公开 API 并发结果是 second.type。认可仅针对三项修复，不是完整 Other 签收。
- Metro 继续保留四条 build/src 差异；不换候选、不改产品，修复方案需按既有决定处理。
- 无设备时只记录合成正反例和封装测试，不生成真实运行 PASS。
