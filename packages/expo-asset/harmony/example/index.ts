import { AppRegistry, TurboModuleRegistry } from 'react-native';

// Diagnostic entry: direct results remain visible if the real public imports fail.
// It does not install Core or substitute either module.
async function run() {
  const direct = TurboModuleRegistry.getEnforcing('ExponentConstants');
  console.info('LANE_B_DIRECT_CONSTANTS', JSON.stringify(direct.getConstants()));
  const directAsset = TurboModuleRegistry.getEnforcing('ExpoAsset');
  const directDownload = directAsset.downloadAsync(
    'rawfile://fixtures/lane-b-raw.txt', '8f32fe13044be60b42a4ada16b872d40', 'txt'
  ).then((uri: string) => {
    console.info('LANE_B_DIRECT_ASSET', uri);
    return true;
  }, (error: unknown) => {
    console.error('LANE_B_DIRECT_ASSET_FAIL', String(error));
    return false;
  });
  // These files are copied beside this entry by the host assembly step.
  const { checkConstants } = require('./constants-public-checks');
  const config = require('./app.json').expo;
  const build = require('./expected-build.json');
  const [constants, directAssetPassed] = await Promise.all([checkConstants(config, build.debugMode), directDownload]);
  if (!directAssetPassed) throw new Error('Direct Asset prerequisite failed');
  console.info('LANE_B_PUBLIC_CONSTANTS_PASS', JSON.stringify(constants));
  const { checkAssets } = require('./asset-public-checks');
  const assets = await checkAssets(
    'http://127.0.0.1:18080', build.runId, require('./fixtures/lane-b.svg')
  );
  console.info('LANE_B_PUBLIC_ASSET_PASS', JSON.stringify(assets));
}

function Fixture() { return null; }
AppRegistry.registerComponent('LaneBPublicFixture', () => Fixture);
run().catch((error) => {
  console.error('LANE_B_PUBLIC_FAIL', JSON.stringify({
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }));
});
