# Contributing

感谢你关注 `expo-harmony-cli`。

## 开发流程

```bash
pnpm install
pnpm test
pnpm build
```

## Pull Request 要求

- 保持 Expo SDK、React Native 和 RNOH 版本矩阵一致。
- 修改 CLI 行为时补充或更新测试。
- 修改生成项目内容时同步更新 `content/docs/` 和相关测试。
- 不提交内网 registry、私有域名、本机路径、token、证书或签名文件。

## Commit 建议

推荐使用简洁的 conventional commit：

```text
feat: add ...
fix: resolve ...
chore: update ...
docs: improve ...
```
