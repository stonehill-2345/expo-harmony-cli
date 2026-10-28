# M3 Harmony Author Fixture

独立第三方作者包：Core 公共 C++ API、事件、真实 Fabric/ArkUI view 与自动 reload 探针。安装本地 tgz 后把包名加入 Expo plugins，应用默认导出 `require('@expo-harmony/m3-author-fixture').FixtureProbe`；插件无 options，写入模块 metadata `expo.m3.author-fixture=1`。

```bash
npm pack --pack-destination /tmp
# 在已有 SDK54 Harmony 宿主中
npm install /tmp/expo-harmony-m3-author-fixture-0.0.1.tgz
npx expo prebuild --platform harmony
npx expo run:harmony
hdc hilog > /tmp/m3-device.log
node node_modules/@expo-harmony/m3-author-fixture/check-device.cjs /tmp/m3-device.log
```

完整安装、卸载、重装与线程/资源/视图契约见仓库 `docs/harmony-module-authoring.md`。运行前使用全新应用数据，日志必须覆盖两个真实 runtime；源码和宿主测试不代替设备结果。阶段状态见仓库验收记录。

原生实现复用本仓库 Core example 模式，保留 Expo MIT 来源；Core 和 RNOH 由宿主提供。无需修改 EntryAbility 或 CLI，也无需加入固定发行包列表。

## Native compile check

`CORE_ROOT` 指向安装的 `expo-modules-core`，`RNOH_PACKAGE_DIR` 指向兼容 RNOH HAR 解包后的 `package`。此检查使用真实 DevEco arm64 工具链编译 Module、View 和 Package 调用方，不代替 HAP 或设备验证。

```bash
OH_NATIVE_SDK=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/native
CMAKE="$OH_NATIVE_SDK/build-tools/cmake/bin/cmake"
"$CMAKE" -S harmony/tests/native -B /tmp/m3-author-native -G Ninja \
  -DCMAKE_MAKE_PROGRAM="$OH_NATIVE_SDK/build-tools/cmake/bin/ninja" \
  -DCMAKE_TOOLCHAIN_FILE="$OH_NATIVE_SDK/build/cmake/ohos.toolchain.cmake" \
  -DOHOS_ARCH=arm64-v8a -DCMAKE_BUILD_TYPE=Debug \
  -DCORE_ROOT="$CORE_ROOT" -DRNOH_PACKAGE_DIR="$RNOH_PACKAGE_DIR"
"$CMAKE" --build /tmp/m3-author-native \
  --target rnoh_m3_author_fixture m3_author_package_check -j 4
```
