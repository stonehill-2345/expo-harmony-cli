# C M4 原件重放契约（2026-11-14）

此修复仅改变验收工具，不改变产品或必达集合。合成测试通过不代表设备验收。

## 信任边界

`b-run-m4.mjs --run-manifest <独立 run-manifest.json>` 必须显式传入本轮执行清单；
`b-complete-v02-commands.mjs` 自动传入 planned run 下的清单。
设备断言内的 `runManifest` 和 `semantic.oracle/result` 不作为校验依据，不执行输入指定的命令或脚本。
report 按注册的 case ID 选择 core/other 校验，不能以伪造 kind 或 preflight 替代 M4。

所有原件引用相对于独立 run-manifest 所在目录；搬迁目录时保留原件内容及采集 cwd。
断言位于 captures 子目录时不改变引用基准。原件路径拒绝绝对路径、越界、逃逸符号链接和 hash 不符。

## 独立清单附加字段

已有 candidate/device/tools/runId 字段保持原义。tools.hdc 必须是实际采集工具路径。
`m4.core` 或 `m4.other` 是采集计划和实际运行身份，不从待验收断言复制：

```json
{
  "captureCwd": "/absolute/original/run-directory",
  "bundle": "dev.example.core",
  "pid": 1234,
  "mode": "release",
  "bootIds": [100, 200],
  "hap": { "path": "builds/release.hap", "sha256": "实际HAP的SHA256" }
}
```

清单与原始 PID/安装/hilog 回执必须一起封存；不能为接受失败断言反向修改清单。
真实系统版本取 device.platformVersion，候选取 candidate.sha256。HAP 和候选实际文件均重算 hash。

## 设备断言输入

`schemaVersion=1`、`kind=m4-device-assertion`、`status=PASS`、scope、runId、candidateSha256、
target、systemVersion、bundle、pid、hapSha256、mode 必须匹配独立清单。
每个既有 case 必须保留，引用该次 PID 定向日志；不允许漏项或额外替代 ID。

必须携带既有 command-result 格式的 pidCommand、logCommand、installCommand：

- `[hdc, '-t', target, 'shell', 'pidof', bundle]`：stdout 精确为单个 PID。
- `[hdc, '-t', target, 'shell', 'hilog', '-x', '-P', pid]`：日志供真实 checker 重放。
- `[hdc, '-t', target, 'install', '-r', hap.path]`：相对于原始 captureCwd 安装；回执必须成功。

三条命令的 cwd 都必须匹配 captureCwd，退出码为零、无超时/中断/信号，stdout/stderr 引用完整且 hash 一致。
日志中的 EXPO_CORE_BOOT 序列、模式与独立 bootIds/mode 一致。

## 语义重放

Core 固定调用仓库既有 `check-i0-log.cjs <log> <mode> --reload`，后者复用
`check-device-log.cjs` 与 `core-test-cases.cjs`。复查完整 case identities、资源、启动、
reload 各次 boot、晚 native completion 和旧 runtime 回调；失败不生成 PASS。
runner 生成重放结果，report 再用原件重算，不信任先前的语义结果。

Other 仍保留完整六项要求。仓库 Linking 和 StatusBar checker 不能证明 Splash、SystemUI、
Browser、Router 组合与 package-sync 全部通过，因此完整 Other 输入仍返回 BLOCKED。
需恢复历史专用校验脚本及对应原件后按实际语义接入；禁止用主机单测、任意 PASS 字段
或只有日志存在代替。当前不宣称 M4 全部实现或阶段关闭。
