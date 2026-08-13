# 常见问题

适用于 `{{appName}}`，当前基线为 Expo {{expoSdk}} / RNOH {{rnohVersion}}。

## `ohpm: command not found`

确认 DevEco Studio 已安装，并将 `ohpm` 加入 `PATH`。

macOS 示例：

```bash
echo 'export PATH="/Applications/DevEco-Studio.app/Contents/tools/ohpm/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
ohpm --version
```

## 真机无法加载 bundle

确认 Metro 正在运行：

```bash
pnpm start:harmony
```

该命令启动独立的 8888 端口，并自动尝试执行：

```bash
hdc rport tcp:8888 tcp:8888
hdc rport tcp:8081 tcp:8888
```

如果真机仍无法加载，在 RNOH Dev Settings 中填写终端输出的 `<局域网 IP>:8888`，然后 Reload。

也可以显式指定地址：

```bash
HARMONY_METRO_HOST=<局域网 IP> pnpm start:harmony
```

## 安装依赖后 HarmonyOS 不生效

请确认安装依赖使用的是 CLI：

```bash
pnpm dlx expo-harmony-cli install <pkg>
```

不要优先使用：

```bash
expo install <pkg>
pnpm add <pkg>
```

如果已经手动安装，请执行：

```bash
pnpm install
pnpm dlx expo-harmony-cli scan
pnpm dlx expo-harmony-cli sync
```

随后执行：

```bash
cd harmony && ohpm install
```

并在 DevEco Studio 中重新构建。

## `patch-package` 失败

通常原因是依赖版本和 patch 文件名不匹配。

处理方式：

1. 不要手动升级已由 CLI 锁定的依赖版本。
2. 重新执行 `pnpm dlx expo-harmony-cli scan`。
3. 如果仍失败，检查 `patches/` 中的文件名是否与 `node_modules` 中实际版本一致。

## DevEco 构建失败

优先检查：

- 是否执行过 `cd harmony && ohpm install`。
- 是否通过 CLI 安装或卸载原生包。
- 是否需要执行 `pnpm dlx expo-harmony-cli sync`。
- 是否误用 `expo prebuild` 覆盖了 HarmonyOS 生成器管理文件。

只有工程需要整体重建时才使用：

```bash
pnpm dlx expo-harmony-cli prebuild --platform harmony --force
```

## Release 包仍访问 Metro

Release 验收前执行：

```bash
pnpm bundle:harmony:release
```

然后关闭 Metro、移除端口转发，冷启动安装包。

Release 包应该加载：

```text
harmony/entry/src/main/resources/rawfile/bundle.harmony.js
harmony/entry/src/main/resources/rawfile/assets/
```

如果仍访问 Metro，请确认 DevEco 使用的是 release signing profile，并重新构建安装包。
