# patch 说明

`expo-harmony-cli` 会为 {{appName}} 注入 HarmonyOS 运行所需的 patch。patch 文件位于项目根目录 `patches/`，由 `patch-package` 在 `pnpm install` 后自动应用。

## 当前基线

- Expo {{expoSdk}}
- React Native 0.77.1
- React Native OpenHarmony {{rnohVersion}}

## patch 的作用

| patch | 作用 |
| --- | --- |
| `@react-native-oh+react-native-harmony+{{rnohVersion}}.patch` | RNOH 核心包适配。 |
| `expo-modules-core+2.2.3.patch` | Expo NativeModulesProxy HarmonyOS 兼容。 |
| `expo-router+4.0.22.patch` | Expo Router HarmonyOS 路由适配。 |
| `expo-constants+17.0.8.patch` | Expo Constants HarmonyOS 兼容。 |
| `expo-linking+7.0.5.patch` | Expo Linking HarmonyOS 兼容。 |
| `expo-status-bar+3.0.9.patch` | Expo StatusBar HarmonyOS 兼容。 |

其它 patch 会在使用 CLI `install <pkg>` 命中兼容表时按需复制。

## 不要手动删除 patches/

`patches/` 是 CLI 管理的运行资产。手动删除可能导致：

- `pnpm install` 后 patch 没有生效。
- HarmonyOS Metro 或 DevEco 构建失败。
- JS 依赖版本和 patch 文件名不匹配。

如需新增、升级或卸载依赖，请使用：

```bash
pnpm dlx expo-harmony-cli install <pkg>
pnpm dlx expo-harmony-cli uninstall <pkg>
pnpm dlx expo-harmony-cli remove <pkg>
pnpm dlx expo-harmony-cli scan
```

## 升级依赖注意事项

patch 文件名包含依赖版本。升级原包后，旧 patch 可能不再匹配。

CLI 会尽量在兼容表内锁定经过验证的版本。如果确实需要手动升级，请先确认：

- 原包版本与 HarmonyOS 伴随包版本兼容。
- patch 文件已经重新生成或不再需要。
- `pnpm install` 后没有 patch-package 失败。
- `pnpm start:harmony` 和 DevEco 构建都能通过。
