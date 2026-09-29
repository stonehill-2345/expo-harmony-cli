import fs from 'fs';
import path from 'path';

import { resolveEntryPoint } from '@expo/config/paths';

import { exportEmbedInternalAsync } from '../../export/embed/exportEmbedAsync';
import { bundleHarmonyReleaseAsync } from '../bundle';

jest.mock('@expo/config/paths', () => ({
  resolveEntryPoint: jest.fn(() => '/app/index.js'),
}));
jest.mock('../../export/embed/exportEmbedAsync', () => ({
  exportEmbedInternalAsync: jest.fn(async () => undefined),
}));

const mockResolveEntryPoint = resolveEntryPoint as jest.MockedFunction<typeof resolveEntryPoint>;
const mockExportEmbedInternalAsync = exportEmbedInternalAsync as jest.MockedFunction<
  typeof exportEmbedInternalAsync
>;

beforeEach(() => {
  mockExportEmbedInternalAsync.mockReset().mockResolvedValue(undefined);
});

describe(bundleHarmonyReleaseAsync, () => {
  it('stages Metro assets under the default RNOH assets directory', async () => {
    const projectRoot = '/app';
    const rawfile = path.join(projectRoot, 'harmony/entry/src/main/resources/rawfile');

    await expect(bundleHarmonyReleaseAsync(projectRoot)).resolves.toBe(
      path.join(rawfile, 'bundle.harmony.js')
    );

    expect(mockResolveEntryPoint).toHaveBeenCalledWith(projectRoot, { platform: 'harmony' });
    expect(mockExportEmbedInternalAsync).toHaveBeenCalledWith(
      projectRoot,
      expect.objectContaining({
        platform: 'harmony',
        bundleOutput: path.join(rawfile, 'bundle.harmony.js'),
        assetsDest: path.join(rawfile, 'assets'),
      })
    );
  });

  it('replaces stale assets and writes both ExpoAsset and RN Image Release layouts', async () => {
    const projectRoot = '/app';
    const rawfile = path.join(projectRoot, 'harmony/entry/src/main/resources/rawfile');
    const stale = path.join(rawfile, 'assets/assets/assets/images/stale.png');
    fs.mkdirSync(path.dirname(stale), { recursive: true });
    fs.writeFileSync(stale, 'stale');
    mockExportEmbedInternalAsync.mockImplementationOnce(async (_projectRoot, options) => {
      const stagedAssets = options.assetsDest!;
      const image = path.join(stagedAssets, 'assets/assets/images/partial-react-logo.png');
      const font = path.join(
        stagedAssets,
        'assets/node_modules/.pnpm/@expo+vector-icons@15.0.3/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf'
      );
      fs.mkdirSync(path.dirname(image), { recursive: true });
      fs.mkdirSync(path.dirname(font), { recursive: true });
      fs.writeFileSync(image, 'image');
      fs.writeFileSync(font, 'font');
      fs.writeFileSync(
        options.bundleOutput,
        'registerAsset({__packager_asset:!0,httpServerLocation:"/assets/node_modules/.pnpm/@expo+vector-icons@15.0.3/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts",scales:[1],hash:"font-hash",name:"MaterialIcons",type:"ttf",fileHashes:["font-hash"]})'
      );
    });

    await bundleHarmonyReleaseAsync(projectRoot);

    expect(fs.existsSync(stale)).toBe(false);
    expect(
      fs.readFileSync(path.join(rawfile, 'assets/assets/assets/images/partial-react-logo.png'), 'utf8')
    ).toBe('image');
    expect(
      fs.readFileSync(path.join(rawfile, 'assets/assets/images/partial-react-logo.png'), 'utf8')
    ).toBe('image');
    expect(fs.readFileSync(path.join(rawfile, 'assets/MaterialIcons.ttf'), 'utf8')).toBe(
      'font'
    );
    const bundle = fs.readFileSync(path.join(rawfile, 'bundle.harmony.js'), 'utf8');
    expect(bundle).toContain('httpServerLocation:"/assets"');
    expect(bundle).not.toContain('/assets/node_modules/.pnpm/');
  });

});
