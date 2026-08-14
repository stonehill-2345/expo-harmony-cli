import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runAutolinking } from '../autolinking';
import { HARMONY_PACKAGE_MAPPING } from '../harmony-package-mapping';

describe('runAutolinking', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autolink-'));
    fs.mkdirSync(path.join(tmp, 'harmony', 'entry'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'harmony', 'oh-package.json5'),
      `{ "dependencies": { "@rnoh/react-native-openharmony": "0.77.71" } }\n`,
    );
    fs.writeFileSync(
      path.join(tmp, 'harmony', 'entry', 'oh-package.json5'),
      `{ "name": "entry", "dependencies": { "@rnoh/react-native-openharmony": "file:../../node_modules/@react-native-oh/react-native-harmony/react_native_openharmony.har" } }\n`,
    );
    fs.mkdirSync(
      path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context'),
      { recursive: true },
    );
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context', 'harmony'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context', 'harmony', 'safe_area.har'), 'har');
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('多 ETS、仅 C++ 与自定义 CMake 目录均可生成', () => {
    const multiPackage = '@react-native-ohos/react-native-mmkv';
    const cppOnlyPackage = '@react-native-ohos/react-native-linear-gradient';
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-mmkv'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-linear-gradient'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-mmkv', 'harmony'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-linear-gradient', 'harmony'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-mmkv', 'harmony', 'reactNativeMMKV.har'), 'har');
    fs.writeFileSync(path.join(tmp, 'node_modules', '@react-native-ohos', 'react-native-linear-gradient', 'harmony', 'linear_gradient.har'), 'har');

    const result = runAutolinking({
      projectRoot: tmp,
      harmonyDir: path.join(tmp, 'harmony'),
      mapping: {
        [multiPackage]: {
          npmPackageName: multiPackage,
          cmakeLibraryTargetName: 'rnoh_native_mmkv',
          etsPackages: [
            { importStatement: "import { MmkvCxxPackage, MmkvPlatformContextPackage } from '@react-native-ohos/react-native-mmkv/ts';", classNames: ['MmkvPlatformContextPackage', 'MmkvCxxPackage'] },
          ],
          cppPackages: [{ className: 'NativeMMKVPackage', namespace: 'rnoh' }],
          cppSourcePath: 'harmony/reactNativeMMKV/src/main/cpp',
          harName: 'reactNativeMMKV.har',
        },
        [cppOnlyPackage]: {
          npmPackageName: cppOnlyPackage,
          cmakeLibraryTargetName: 'rnoh_linear_gradient',
          etsPackages: [],
          cppPackages: [{ className: 'LinearGradientPackage', namespace: 'rnoh' }],
          cppSourcePath: 'harmony/linear_gradient/src/main/cpp',
          harName: 'linear_gradient.har',
        },
      },
    });

    const ets = result.files.find(f => f.path.endsWith('RNOHPackagesFactory.ets'))!.content;
    const cpp = result.files.find(f => f.path.endsWith('RNOHPackagesFactory.h'))!.content;
    const cmake = result.files.find(f => f.path.endsWith('autolinking.cmake'))!.content;
    expect(ets).toContain('new MmkvPlatformContextPackage(ctx)');
    expect(ets).toContain('new MmkvCxxPackage(ctx)');
    expect(ets).not.toContain('new LinearGradientPackage(ctx)');
    expect(cpp).toContain('#include "NativeMMKVPackage.h"');
    expect(cpp).toContain('#include "LinearGradientPackage.h"');
    expect(cmake).toContain('${NODE_MODULES}/@react-native-ohos/react-native-mmkv/harmony/reactNativeMMKV/src/main/cpp');
    expect(cmake).toContain('${NODE_MODULES}/@react-native-ohos/react-native-linear-gradient/harmony/linear_gradient/src/main/cpp');
  });

  it('只链接 node_modules 存在的包', () => {
    const result = runAutolinking({
      projectRoot: tmp,
      harmonyDir: path.join(tmp, 'harmony'),
      mapping: HARMONY_PACKAGE_MAPPING,
    });
    expect(result.linked).toEqual(['@react-native-ohos/react-native-safe-area-context']);
  });

  it('生成的 RNOHPackagesFactory.ets 含 SafeAreaViewPackage import + new', () => {
    const result = runAutolinking({
      projectRoot: tmp,
      harmonyDir: path.join(tmp, 'harmony'),
      mapping: HARMONY_PACKAGE_MAPPING,
    });
    const ets = result.files.find(f => f.path.endsWith('RNOHPackagesFactory.ets'))!.content;
    expect(ets).toContain(
      "import { SafeAreaViewPackage } from '@react-native-ohos/react-native-safe-area-context/ts';",
    );
    expect(ets).toContain(
      "import type { RNPackage, RNPackageContext } from '@rnoh/react-native-openharmony';",
    );
    expect(ets).toContain('export function createRNOHPackages(ctx: RNPackageContext): RNPackage[]');
    expect(ets).toContain('new SafeAreaViewPackage(ctx)');
    expect(ets).not.toContain('as RNOHPackage');
    expect(ets).toContain('export function createRNOHPackages');
  });

  it('生成的 RNOHPackagesFactory.h 含 #include + make_shared', () => {
    const result = runAutolinking({
      projectRoot: tmp,
      harmonyDir: path.join(tmp, 'harmony'),
      mapping: HARMONY_PACKAGE_MAPPING,
    });
    const h = result.files.find(f => f.path.endsWith('RNOHPackagesFactory.h'))!.content;
    expect(h).toContain('#include "SafeAreaViewPackage.h"');
    expect(h).toContain('std::make_shared<rnoh::SafeAreaViewPackage>(ctx)');
  });

  it('生成的 autolinking.cmake 含 add_subdirectory + target', () => {
    const result = runAutolinking({
      projectRoot: tmp,
      harmonyDir: path.join(tmp, 'harmony'),
      mapping: HARMONY_PACKAGE_MAPPING,
    });
    const cmake = result.files.find(f => f.path.endsWith('autolinking.cmake'))!.content;
    expect(cmake).toContain(
      'resolve_oh_package_cpp(AUTOLINKED_CPP_DIR "@react-native-ohos/react-native-safe-area-context")',
    );
    expect(cmake).toContain('add_subdirectory("${AUTOLINKED_CPP_DIR}" ./rnoh_safe_area)');
    expect(cmake).toContain('rnoh_safe_area');
  });

  it('oh-package.json5 合并：保留 @rnoh，新增 safe-area file: 引用', () => {
    const result = runAutolinking({
      projectRoot: tmp,
      harmonyDir: path.join(tmp, 'harmony'),
      mapping: HARMONY_PACKAGE_MAPPING,
    });
    const ohPkg = result.files.find(f => f.path.endsWith('oh-package.json5'))!.content;
    expect(ohPkg).toContain('"@rnoh/react-native-openharmony": "0.77.71"');
    expect(ohPkg).toContain(
      '"@react-native-ohos/react-native-safe-area-context": "file:../node_modules/@react-native-ohos/react-native-safe-area-context/harmony/safe_area.har"',
    );
  });

  it('entry/oh-package.json5 合并：保留 RNOH，新增 entry 可解析的三方 file 引用', () => {
    const result = runAutolinking({
      projectRoot: tmp,
      harmonyDir: path.join(tmp, 'harmony'),
      mapping: HARMONY_PACKAGE_MAPPING,
    });
    const entryOhPkg = result.files.find(f => f.path.endsWith('entry/oh-package.json5'))!.content;
    expect(entryOhPkg).toContain(
      '"@rnoh/react-native-openharmony": "file:../../node_modules/@react-native-oh/react-native-harmony/react_native_openharmony.har"',
    );
    expect(entryOhPkg).toContain(
      '"@react-native-ohos/react-native-safe-area-context": "file:../../node_modules/@react-native-ohos/react-native-safe-area-context/harmony/safe_area.har"',
    );
  });

  it('幂等：重复跑产出一致', () => {
    const a = runAutolinking({
      projectRoot: tmp,
      harmonyDir: path.join(tmp, 'harmony'),
      mapping: HARMONY_PACKAGE_MAPPING,
    });
    const b = runAutolinking({
      projectRoot: tmp,
      harmonyDir: path.join(tmp, 'harmony'),
      mapping: HARMONY_PACKAGE_MAPPING,
    });
    expect(a.files).toEqual(b.files);
  });

  it('空 libraries：node_modules 全未命中时产出空块（不含任何 @react-native-ohos 包）', () => {
    // 新 fixture：无任何 @react-native-ohos 包目录（只保留 harmony/oh-package.json5）
    const emptyTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autolink-empty-'));
    try {
      fs.mkdirSync(path.join(emptyTmp, 'harmony'), { recursive: true });
      fs.writeFileSync(
        path.join(emptyTmp, 'harmony', 'oh-package.json5'),
        `{ "dependencies": { "@rnoh/react-native-openharmony": "0.77.71" } }\n`,
      );
      // 不建 node_modules 下任何 @react-native-ohos 包目录

      const result = runAutolinking({
        projectRoot: emptyTmp,
        harmonyDir: path.join(emptyTmp, 'harmony'),
        mapping: HARMONY_PACKAGE_MAPPING,
      });

      // linked 为空
      expect(result.linked).toEqual([]);

      // ETS 仍含 createRNOHPackages，但 return [ 后无 new（libraries 块为空）
      const ets = result.files.find(f => f.path.endsWith('RNOHPackagesFactory.ets'))!.content;
      expect(ets).toContain('export function createRNOHPackages');
      // 空 libraries 块：return [ 后直接换行到 ]（无 new 行）
      expect(ets).not.toContain('new ');
      expect(ets).toContain('return [\n  ];');

      // oh-package 保留原 @rnoh 条目，无新增 file: 引用
      const ohPkg = result.files.find(f => f.path.endsWith('oh-package.json5'))!.content;
      expect(ohPkg).toContain('"@rnoh/react-native-openharmony": "0.77.71"');
      expect(ohPkg).not.toContain('file:../node_modules');
    } finally {
      fs.rmSync(emptyTmp, { recursive: true, force: true });
    }
  });

  it('多包命中 + 字典序排序（gesture-handler < safe-area-context）', () => {
    // 新 fixture：建 gesture-handler + safe-area-context 两个 node_modules 目录
    const multiTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autolink-multi-'));
    try {
      fs.mkdirSync(path.join(multiTmp, 'harmony'), { recursive: true });
      fs.writeFileSync(
        path.join(multiTmp, 'harmony', 'oh-package.json5'),
        `{ "dependencies": { "@rnoh/react-native-openharmony": "0.77.71" } }\n`,
      );
      fs.mkdirSync(
        path.join(multiTmp, 'node_modules', '@react-native-ohos', 'react-native-gesture-handler'),
        { recursive: true },
      );
      fs.mkdirSync(
        path.join(multiTmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context'),
        { recursive: true },
      );
      fs.mkdirSync(path.join(multiTmp, 'node_modules', '@react-native-ohos', 'react-native-gesture-handler', 'harmony'), { recursive: true });
      fs.writeFileSync(path.join(multiTmp, 'node_modules', '@react-native-ohos', 'react-native-gesture-handler', 'harmony', 'gesture_handler.har'), 'har');
      fs.mkdirSync(path.join(multiTmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context', 'harmony'), { recursive: true });
      fs.writeFileSync(path.join(multiTmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context', 'harmony', 'safe_area.har'), 'har');

      const result = runAutolinking({
        projectRoot: multiTmp,
        harmonyDir: path.join(multiTmp, 'harmony'),
        mapping: HARMONY_PACKAGE_MAPPING,
      });

      // linked 字典序：gesture-handler ('g') < safe-area-context ('s')
      expect(result.linked).toEqual([
        '@react-native-ohos/react-native-gesture-handler',
        '@react-native-ohos/react-native-safe-area-context',
      ]);

      // ETS import 顺序与 linked 一致（gesture-handler 在前）
      const ets = result.files.find(f => f.path.endsWith('RNOHPackagesFactory.ets'))!.content;
      const ghIdx = ets.indexOf('GestureHandlerPackage');
      const saIdx = ets.indexOf('SafeAreaViewPackage');
      expect(ghIdx).toBeGreaterThan(-1);
      expect(saIdx).toBeGreaterThan(-1);
      expect(ghIdx).toBeLessThan(saIdx);

      // cmake add_subdirectory 顺序一致（gesture-handler 在前）
      const cmake = result.files.find(f => f.path.endsWith('autolinking.cmake'))!.content;
      const cmakeGhIdx = cmake.indexOf('@react-native-ohos/react-native-gesture-handler');
      const cmakeSaIdx = cmake.indexOf('@react-native-ohos/react-native-safe-area-context');
      expect(cmakeGhIdx).toBeGreaterThan(-1);
      expect(cmakeSaIdx).toBeGreaterThan(-1);
      expect(cmakeGhIdx).toBeLessThan(cmakeSaIdx);
    } finally {
      fs.rmSync(multiTmp, { recursive: true, force: true });
    }
  });

  it('oh-package 无 dependencies 字段：不报错且 managed 段正常生成', () => {
    // 新 fixture：oh-package.json5 无 dependencies 字段
    const noDepsTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autolink-nodeps-'));
    try {
      fs.mkdirSync(path.join(noDepsTmp, 'harmony'), { recursive: true });
      fs.writeFileSync(
        path.join(noDepsTmp, 'harmony', 'oh-package.json5'),
        `{ "name": "entry" }\n`,
      );
      fs.mkdirSync(
        path.join(
          noDepsTmp,
          'node_modules',
          '@react-native-ohos',
          'react-native-safe-area-context',
        ),
        { recursive: true },
      );
      fs.mkdirSync(path.join(noDepsTmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context', 'harmony'), { recursive: true });
      fs.writeFileSync(path.join(noDepsTmp, 'node_modules', '@react-native-ohos', 'react-native-safe-area-context', 'harmony', 'safe_area.har'), 'har');

      // 不报错
      const result = runAutolinking({
        projectRoot: noDepsTmp,
        harmonyDir: path.join(noDepsTmp, 'harmony'),
        mapping: HARMONY_PACKAGE_MAPPING,
      });

      // linked 含 safe-area-context
      expect(result.linked).toEqual(['@react-native-ohos/react-native-safe-area-context']);

      // 输出 oh-package 含 managed 段（safe-area 的 file: 引用）；
      // 原 fixture 无 dependencies（无 @rnoh 条目），合并后仍无 @rnoh 条目
      const ohPkg = result.files.find(f => f.path.endsWith('oh-package.json5'))!.content;
      expect(ohPkg).not.toContain('"@rnoh/react-native-openharmony"');
      expect(ohPkg).toContain(
        '"@react-native-ohos/react-native-safe-area-context": "file:../node_modules/@react-native-ohos/react-native-safe-area-context/harmony/safe_area.har"',
      );
    } finally {
      fs.rmSync(noDepsTmp, { recursive: true, force: true });
    }
  });
});
