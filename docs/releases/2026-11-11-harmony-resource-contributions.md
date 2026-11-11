# Harmony 插件资源事务契约

`expo/harmony-config` 的 `withHarmonyResources` 在 `mods.harmony.resources` 中收集资源，交由 prebuild 原生生成事务统一写入。插件回调不直接改动 `harmony/`。

```ts
import { withHarmonyResources } from 'expo/harmony-config';

export default config => withHarmonyResources(config, async mod => {
  mod.modResults.push({
    owner: 'my-plugin',
    packageName: 'my-plugin',
    packageVersion: '1.0.0',
    source: 'assets/data.json',
    target: 'data.json',
    sha256: '按实际文件字节计算的 64 位小写 SHA-256',
  });
  return mod;
});
```

- `source` 为项目根目录内规范相对路径；也可提供 UTF-8 `contents`。两者必须且只能提供一个。
- 目标固定为 `entry/src/main/resources/rawfile/<owner>/<target>`；owner 使用小写字母开头的字母、数字、连字符。
- 插件必须提供真实包名、版本和字节哈希。空资源、重复目标、路径越界、符号链接、哈希失配拒绝生成。
- `.expo-harmony-resources.json` 保存贡献清单；`.expo-harmony-state.json` 保存所有权与字节指纹。rawfile 内 JSON 按原字节保存，不进行 JSON 字段合并。
- 配置变更、文件改名和插件移除会更新或删除旧资源。用户修改过的受管文件、无主文件和其他 owner 的文件拒绝覆盖或接管。
- 写入只发生在事务 stage，失败恢复旧文件与所有权。用户显式 `--clean` 的整体重建语义保持不变。

Font 使用共享 `fonts` 配置，接受 TTF/OTF；family 为文件名去扩展名。原生模块启动读取 `expo-font/fonts.json`，验证文件哈希和字体解码后同步注册。Asset 使用共享 `assets` 配置，访问 URI 为 `rawfile://expo-asset/<basename>`。

本契约是第 3 步实现交接内容，不代表 M4/M5 阶段关闭；统一候选的 npm/pnpm、Debug/Release 矩阵和受影响 B 验收由第 4 步执行。
