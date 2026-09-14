# RNOH 0.82.30 非空官方 autolinking 产物

## 来源与边界

2026-09-14，在桌面 `expo-harmony-sdk54-test` 项目内的独立验证目录生成：

- 实际命令实现：`@react-native-oh/react-native-harmony-cli@0.82.30` 的 `commandLinkHarmony`。
- 命令宿主：项目已安装的 `@react-native-community/cli@20.1.1`，执行 `link-harmony`，不是手写生成器或 fake CLI。
- 实际原生包：`@react-native-ohos/react-native-gesture-handler@2.30.2`，完整复制已安装包，HAR 字节未修改。
- **原发布包没有 `harmony.autolinking`**。仅在隔离副本的 package.json 中补充 `adapter-package.json` 所列配置；这不代表发布包已原生支持官方自动注册。
- `adapter-package.json` 仅保留测试需要的 name/version/harmony 字段；`input-oh-package.json5` 是官方执行前的完整输入。
- 四份产物直接来自官方命令。仅统一文件末尾为一个换行，没有手工添加注册内容。
- 单元测试回放这些捕获产物，验证本地适配器的读取、返回类型改写及覆盖识别；**单元测试本身不执行真实官方 CLI，也不做原生编译**。

## 实测结果

1. 未添加 metadata：`linked 0 libraries, skipped 1 libraries`。
2. 添加 metadata 后：`linked 1 libraries, skipped 0 libraries`。
3. ETS 默认导出、C++ 类和头文件、`rnoh_gesture_handler` CMake target 均已从真实 HAR 内核对。
4. oh-package 的 file 引用存在，指向与原包 SHA-256 一致的 HAR。
5. 重跑后 ETS/C++/CMake 字节一致，依赖语义一致；官方 JSON5 writer 每次额外增加一个末尾换行，因此不声称四文件严格字节幂等。
6. 额外以当前仓库本地构建的 `runOfficialAutolinking` + `patchOfficialArtifacts` 验证：官方注册 Gesture Handler，mapping 补充另一个真实的 `react-native-screens@4.9.0` 副本；官方注册保留一次、RNPackage 返回类型改写生效、补充锚点匹配、两个 HAR 引用均有效。

这不等于 DevEco/Hvigor 编译或真机运行通过，也不等于其余 SDK 54 适配包均已被官方 CLI 识别。

## 校验值（生成时的本地实物）

- `gesture_handler.har` SHA-256：`f1bc323f118a64dab7d7f7a2674f59999227fa1087f29516ba6a88ad4b0df549`
- 官方 `dist/commands/link-harmony.js` SHA-256：`f4c41a225578cb54b15efb1e6915d19567af03692fc6ae078cedb1f93903d672`
- 官方 `dist/autolinking/Autolinking.js` SHA-256：`45e9ed76adbd5e76906a68baa6bf6873c2ea16dd3e49f57633a933b64dcb381d`

## 复现非空捕获

在本仓库根目录执行。项目须已安装上述版本；不下载依赖、不改项目原有 node_modules 和 harmony。每次创建新的独立目录。

```bash
PROJECT="$HOME/Desktop/expo-harmony-sdk54-test"
FIXTURE="$PWD/src/harmony-project/__tests__/fixtures/rnoh-0.82.30"
VERIFY="$(mktemp -d "$PROJECT/rnoh-08230-repro-XXXXXX")"

node - "$PROJECT" "$FIXTURE" "$VERIFY" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const [project, fixture, out] = process.argv.slice(2);
const name = '@react-native-ohos/react-native-gesture-handler';
const cli = path.join(project, 'node_modules/@react-native-oh/react-native-harmony-cli');
assert.equal(require(path.join(cli, 'package.json')).version, '0.82.30');
const source = fs.realpathSync(path.join(project, 'node_modules', name));
assert.equal(require(path.join(source, 'package.json')).version, '2.30.2');
const dest = path.join(out, 'node_modules', name);
fs.cpSync(source, dest, { recursive: true, dereference: true });
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ name: 'rnoh-autolinking-verification', private: true }));
fs.writeFileSync(path.join(out, 'react-native.config.js'), `module.exports = {
  reactNativePath: ${JSON.stringify(path.join(project, 'node_modules/react-native'))},
  commands: [require(${JSON.stringify(path.join(cli, 'dist/commands/link-harmony.js'))}).commandLinkHarmony]
};\n`);
for (const dir of ['ets', 'cpp']) fs.mkdirSync(path.join(out, 'harmony/entry/src/main', dir), { recursive: true });
fs.copyFileSync(path.join(fixture, 'input-oh-package.json5'), path.join(out, 'harmony/oh-package.json5'));
NODE

cd "$VERIFY"
# 对照：原发布包被 skip。
node "$PROJECT/node_modules/@react-native-community/cli/build/bin.js" link-harmony \
  --harmony-project-path ./harmony --node-modules-path ./node_modules

# 仅给副本补 metadata，恢复相同的 oh-package 输入。
node - "$FIXTURE" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const fixture = process.argv[2];
const file = 'node_modules/@react-native-ohos/react-native-gesture-handler/package.json';
const pkg = JSON.parse(fs.readFileSync(file));
pkg.harmony.autolinking = JSON.parse(fs.readFileSync(path.join(fixture, 'adapter-package.json'))).harmony.autolinking;
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
fs.copyFileSync(path.join(fixture, 'input-oh-package.json5'), 'harmony/oh-package.json5');
NODE

node "$PROJECT/node_modules/@react-native-community/cli/build/bin.js" link-harmony \
  --harmony-project-path ./harmony --node-modules-path ./node_modules
```

非空产物位于 `$VERIFY/harmony`。原始桌面验证目录还保留 `before.log`、`after.log`、`repeat.log`、`report.json`、`verify.cjs` 和 `local-adapter-report.json`，包括实际输出哈希与原工程未改校验。
