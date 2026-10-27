# SDK54 Harmony 配置与插件

## 配置入口

使用标准 `app.json`、`app.config.js` 或 `app.config.ts`。动态配置和环境变量在一次 Harmony prebuild 中只求值一次；工程身份、媒体和 Constants 消费该次快照。

```ts
import type { HarmonyExpoConfig } from 'expo/harmony-config';

export default (): HarmonyExpoConfig => ({
  name: 'Example',
  slug: 'example',
  icon: './assets/icon.png',
  harmony: {
    name: process.env.APP_NAME ?? 'Example',
    bundleName: 'com.example.application',
    version: '1.0.0',
    versionCode: 1,
    scheme: ['example'],
    querySchemes: ['https'],
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    splash: { image: './assets/splash.png', backgroundColor: '#FFFFFF' },
  },
  plugins: [['example-harmony-plugin', { vendor: 'example' }]],
});
```

| 字段 | 优先级或产物 |
| --- | --- |
| `bundleName` | CLI 参数 > `harmony.bundleName` > `dev.expo.<slug规范化值>` |
| `name/version/icon/splash/scheme/orientation/userInterfaceStyle` | Harmony 显式值 > Expo 通用值 > 默认值 |
| `versionCode` | Harmony 值，默认 `1`；写入 AppScope |
| `foregroundImage` | Harmony 前景 > Harmony icon > Android adaptiveIcon 前景 > 通用 icon |
| `querySchemes/permissions` | 写入 module；保留模板 INTERNET/VIBRATE，同名权限用配置替换 |
| `orientation` | EntryAbility 的 `orientation`；default 映射 unspecified |
| `userInterfaceStyle` | EntryAbility 启动时调用系统 `setColorMode`；automatic 跟随系统 |
| `extensions.app/module` | 递归合并目标系统 JSON；abilities 按 name 合并，其余数组替换 |

媒体必须是项目内真实文件，拒绝缺失文件和目录/软链逃逸。应用名允许引号、反斜杠和换行。默认版本为 `1.0.0`，默认 orientation 为 `default`，默认主题为 `light`。版本名、bundleName、协议、权限与资源字段按公开 [schema](../packages/expo/harmony-config.schema.json) 校验。

`Constants.expoConfig` 保存清理后的公开 Expo 快照，保留用户的 `harmony` 覆盖；不把 Harmony 名称回写为通用 `name`。配置中的 `mods/_internal/hooks`、平台私有 `config` 和 updates 签名/请求凭据不会写入原生资源。`resolveHarmonyConfig` 同时返回 `expoConfig` 与规范化后的 `harmony`，用于区分公开原值与原生有效值。

## 第三方包

插件通过标准 `expo.plugins` 模块请求加载。包提供 `app.plugin.js`，声明 Expo 为 peer；需要额外的上游 config-plugins helper 时将其声明为自己的依赖。公共 helper 和类型均从 `expo/harmony-config` 导入。

```js
const { defineHarmonyPlugin, withHarmonyApp, withHarmonyModule } = require('expo/harmony-config');

module.exports = defineHarmonyPlugin((config, options = {}) => {
  config = withHarmonyApp(config, mod => {
    mod.modResults.vendor = options.vendor ?? 'example';
    return mod;
  });
  return withHarmonyModule(config, async mod => {
    mod.modResults.metadata = [{ name: 'example.plugin', value: 'enabled' }];
    return mod;
  });
});
```

注册函数必须同步，只注册 mod；异步操作放在 mod callback。声明 Harmony 支持的每个插件必须新增或修改 app/module mod，空实现和异步注册均报出定义来源。`modResults` 分别是完整 AppScope `app` 和模块 `module` 内部 JSON 对象，不含外层键；`modRequest.platform` 为 `harmony`。同一次编译仅运行 Harmony mod。

只提供其他平台实现的插件显式使用：

```js
module.exports = defineHarmonyPlugin(withOtherPlatformMods, { platforms: ['ios', 'android'] });
```

该声明会输出定位诊断，iOS/Android mod 不在 Harmony 编译中执行。插件应通过公共 helper 声明支持，不手写 metadata 绕过逐插件实现检查。

## 失败行为

缺包、未声明平台、解析到同一真实文件的重复请求、空实现、非法配置、mod 失败和应用身份/版本漂移均使 prebuild 失败。配置、注册、模块发现、内存计划与源资源校验通过后才开始 `--clean` 和原生同步。插件只能产生可序列化 JSON，不能在注册或 mod 中自行写原生工程文件。

这保证上述校验失败不删除既有工程。完整写入事务、并发保护和所有用户扩展字段归属在 M2 实现；M1 底座通过不代表所有内置模块插件或 default 模板原生能力已验收。

可复跑验收：`node scripts/sdk54/prepare-m1-config.mjs`，随后 `node scripts/sdk54/test-m1-config.mjs`。后者在仓库外安装真实候选和独立第三方 tgz，覆盖 npm/pnpm、TS 环境配置、产物一致性及失败时旧工程保护。
