import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getBundledTemplateManifestPath, loadTemplateManifest } from '../template-manifest';
import { getBundledTemplateDir } from '../template-source';
import { validateHarmonyTemplate } from '../template-validator';

function copyTemplateToTemp(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harmony-template-'));
  fs.cpSync(getBundledTemplateDir(), tmp, { recursive: true });
  return tmp;
}

describe('HarmonyOS bundled template validation', () => {
  it('loads the bundled manifest and validates the template', () => {
    const manifest = loadTemplateManifest(getBundledTemplateManifestPath());

    expect(manifest.expoSdk).toBe('54');
    expect(manifest.reactNative).toBe('0.82.1');
    expect(manifest.rnoh).toBe('0.82.30');
    expect(manifest.requiredFiles).toContain('entry/src/main/cpp/generated/RNOHGeneratedPackage.h');
    expect(manifest.requiredFiles).toContain('entry/src/main/ets/workers/RNOHWorker.ets');

    expect(() => validateHarmonyTemplate(getBundledTemplateDir(), manifest)).not.toThrow();
  });

  it('rejects templates without the RNOH project and module Hvigor plugins', () => {
    const tmp = copyTemplateToTemp();
    const manifest = loadTemplateManifest(getBundledTemplateManifestPath());
    const hvigorPath = path.join(tmp, 'hvigorfile.ts');
    fs.writeFileSync(hvigorPath, fs.readFileSync(hvigorPath, 'utf8').replace('createRNOHProjectPlugin({', 'createMissingProjectPlugin({'));

    expect(() => validateHarmonyTemplate(tmp, manifest)).toThrow(/createRNOHProjectPlugin/);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('requires the project plugin to leave release bundling to the CLI', () => {
    const tmp = copyTemplateToTemp();
    const manifest = loadTemplateManifest(getBundledTemplateManifestPath());
    const hvigorPath = path.join(tmp, 'hvigorfile.ts');
    const hvigor = fs.readFileSync(hvigorPath, 'utf8');
    fs.writeFileSync(hvigorPath, hvigor.replace('bundler: { enabled: false }', 'bundler: {}'));

    expect(() => validateHarmonyTemplate(tmp, manifest)).toThrow(/bundling.*CLI/i);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('requires the module plugin to leave Metro and autolinking to the CLI', () => {
    const tmp = copyTemplateToTemp();
    const manifest = loadTemplateManifest(getBundledTemplateManifestPath());
    const hvigorPath = path.join(tmp, 'entry/hvigorfile.ts');
    const hvigor = fs.readFileSync(hvigorPath, 'utf8');

    fs.writeFileSync(hvigorPath, hvigor.replace('      metro: null,\n', ''));
    expect(() => validateHarmonyTemplate(tmp, manifest)).toThrow(/metro.*CLI/i);

    fs.writeFileSync(hvigorPath, hvigor.replace('      autolinking: null,\n', ''));
    expect(() => validateHarmonyTemplate(tmp, manifest)).toThrow(/autolinking.*CLI/i);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('requires the RNPackage return type used by mixed legacy and RNOHPackage libraries', () => {
    const tmp = copyTemplateToTemp();
    const manifest = loadTemplateManifest(getBundledTemplateManifestPath());
    const packageProviderPath = path.join(tmp, 'entry/src/main/ets/PackageProvider.ets');
    fs.writeFileSync(packageProviderPath, fs.readFileSync(packageProviderPath, 'utf8').replace('RNPackage[]', 'RNOHPackage[]'));

    expect(() => validateHarmonyTemplate(tmp, manifest)).toThrow(/RNPackage\[\]/);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('requires the 0.82 worker URL and Linking/Metro module capabilities', () => {
    const tmp = copyTemplateToTemp();
    const manifest = loadTemplateManifest(getBundledTemplateManifestPath());
    const abilityPath = path.join(tmp, 'entry/src/main/ets/entryability/EntryAbility.ets');
    fs.writeFileSync(abilityPath, fs.readFileSync(abilityPath, 'utf8').replace('getRNOHWorkerScriptUrl', 'getMissingWorkerScriptUrl'));

    expect(() => validateHarmonyTemplate(tmp, manifest)).toThrow(/getRNOHWorkerScriptUrl/);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('requires the 0.82 native compiler and network permission', () => {
    const tmp = copyTemplateToTemp();
    const manifest = loadTemplateManifest(getBundledTemplateManifestPath());
    const buildProfilePath = path.join(tmp, 'build-profile.json5');
    fs.writeFileSync(buildProfilePath, fs.readFileSync(buildProfilePath, 'utf8').replace('"nativeCompiler": "BiSheng"', '"nativeCompiler": "missing"'));

    expect(() => validateHarmonyTemplate(tmp, manifest)).toThrow(/nativeCompiler/);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('reports missing required files with the missing relative path', () => {
    const tmp = copyTemplateToTemp();
    const manifest = loadTemplateManifest(getBundledTemplateManifestPath());
    fs.rmSync(path.join(tmp, 'entry/src/main/cpp/generated/RNOHGeneratedPackage.h'));

    expect(() => validateHarmonyTemplate(tmp, manifest)).toThrow(
      /Missing Harmony template required file: entry\/src\/main\/cpp\/generated\/RNOHGeneratedPackage\.h/,
    );

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('rejects stale AppScope app_icon references', () => {
    const tmp = copyTemplateToTemp();
    const manifest = loadTemplateManifest(getBundledTemplateManifestPath());
    const appJsonPath = path.join(tmp, 'AppScope/app.json5');
    const appJson = fs.readFileSync(appJsonPath, 'utf8');
    fs.writeFileSync(appJsonPath, appJson.replace('$media:layered_image', '$media:app_icon'));

    expect(() => validateHarmonyTemplate(tmp, manifest)).toThrow('AppScope/app.json5 must reference $media:layered_image');

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('guards CMake fallback for ohpm .ohpm package layout', () => {
    const tmp = copyTemplateToTemp();
    const manifest = loadTemplateManifest(getBundledTemplateManifestPath());
    const cmakePath = path.join(tmp, 'entry/src/main/cpp/CMakeLists.txt');
    const cmakeContent = fs.readFileSync(cmakePath, 'utf8');
    fs.writeFileSync(cmakePath, cmakeContent.replaceAll('resolve_oh_package_cpp', 'resolve_missing_package_cpp'));

    expect(() => validateHarmonyTemplate(tmp, manifest)).toThrow(/CMakeLists\.txt must resolve RNOH through resolve_oh_package_cpp/);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('rejects local machine paths and local LAN IPs in template files', () => {
    const tmp = copyTemplateToTemp();
    const manifest = loadTemplateManifest(getBundledTemplateManifestPath());
    fs.writeFileSync(path.join(tmp, 'entry/src/main/ets/pages/Index.ets'), '/' + 'Users/example/tmp 172.17.108.243');

    expect(() => validateHarmonyTemplate(tmp, manifest)).toThrow(/forbidden local pattern/);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
