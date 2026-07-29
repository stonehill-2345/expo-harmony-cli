# HarmonyOS 签名配置

{{appName}} 鸿蒙签名（debug / release）配置指南。

> 本文档在 prebuild 阶段注入到 `harmony/SIGNING.md`，模板源在 `expo-harmony-cli` 的 `content/docs/`。

## bundleName

```
{{bundleName}}
```

签名证书的 bundleName 必须与 `harmony/app.json5` 的 `bundleName` 一致。

## Debug 签名（开发）

DevEco Studio 自动生成调试证书：

1. DevEco Studio → File → Project Structure → Signing Configs
2. 勾选「Automatically generate signature」（默认开启）
3. DevEco 自动生成 `.p12` + `.cer` + `.p7b`

## Release 签名（发版）

### 1. 申请证书

- 登录 [华为 AGC](https://developer.harmonyos.com/cn/home/) → 用户与访问 → 证书管理
- 创建「调试/发布」证书 + Profile
- 下载 `.cer`（证书）+ `.p7b`（Profile）+ `.p12`（密钥库）

### 2. 配置 build-profile.json5

编辑 `harmony/build-profile.json5`：

```json5
{
  "app": {
    "signingConfigs": [
      {
        "name": "release",
        "type": "HarmonyOS",
        "material": {
          "certpath": "sign/release.cer",
          "storePassword": "$ENV{RELEASE_STORE_PASSWORD}",
          "keyAlias": "release",
          "keyPassword": "$ENV{RELEASE_KEY_PASSWORD}",
          "profile": "sign/release.p7b",
          "signAlg": "SHA256withECDSA",
          "storeFile": "sign/release.p12"
        }
      }
    ],
    "products": [
      {
        "name": "release",
        "signingConfig": "release"
      }
    ]
  }
}
```

> 密码用环境变量 `$ENV{...}` 注入，**勿入库**。

### 3. 放置签名材料

```
harmony/sign/
├── release.p12
├── release.cer
└── release.p7b
```

`sign/` 加入 `.gitignore`。

### 4. 生成离线 bundle 并构建发版

```bash
# macOS / Linux：设置环境变量
export RELEASE_STORE_PASSWORD=xxx
export RELEASE_KEY_PASSWORD=xxx

# Windows PowerShell：
$env:RELEASE_STORE_PASSWORD="xxx"
$env:RELEASE_KEY_PASSWORD="xxx"

# 必须在最后一次 HarmonyOS prebuild 后执行；会生成 rawfile/bundle.harmony.js 和 assets
pnpm bundle:harmony:release

# 然后在 DevEco Studio Build → Build APP(s)
```

构建后停止 Metro 并冷启动 release HAP，确认应用不依赖开发机服务。

## RNOH 版本

当前应用 RNOH 版本：`{{rnohVersion}}`（签名 Profile 创建时需匹配）。
