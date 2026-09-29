# Package patches

当前 patch-set：`{{patchSet}}`。patch 位于 `patches/`，由 `patch-package --error-on-fail --error-on-warn` 在安装后恢复。删除 `node_modules` 后重新执行 npm 或 pnpm install，并运行：

```bash
npx expo-harmony-cli doctor
```

版本漂移、patch 缺失、checksum 错误或 lifecycle 被禁用都会失败关闭。
