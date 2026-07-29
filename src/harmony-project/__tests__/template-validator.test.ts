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

    expect(manifest.expoSdk).toBe('52');
    expect(manifest.reactNative).toBe('0.77.1');
    expect(manifest.rnoh).toBe('0.77.71');
    expect(manifest.requiredFiles).toContain('entry/src/main/cpp/generated/RNOHGeneratedPackage.h');

    expect(() => validateHarmonyTemplate(getBundledTemplateDir(), manifest)).not.toThrow();
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
