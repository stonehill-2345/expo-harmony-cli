import React, { useEffect, useState } from 'react';
import { AppRegistry, ScrollView, Text, TurboModuleRegistry } from 'react-native';

const assetModule = TurboModuleRegistry.get('ExpoAsset');
const oracleModule = TurboModuleRegistry.get('LaneBAssetOracle');
const devSettingsModule = TurboModuleRegistry.get('DevSettings');

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  try {
    const serialized = JSON.stringify(error);
    return serialized === undefined ? String(error) : serialized;
  } catch (_) {
    return String(error);
  }
}

async function expectFailure(label, action, pattern) {
  try {
    await action();
  } catch (error) {
    const message = formatError(error);
    if (!pattern.test(message)) {
      throw new Error(`${label} returned unexpected error: ${message}`);
    }
    return message;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

function App() {
  const [result, setResult] = useState('RUNNING');

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        if (assetModule == null) {
          throw new Error('ExpoAsset was not found');
        }
        if (oracleModule == null) {
          throw new Error('LaneBAssetOracle was not found');
        }
        if (!oracleModule.hasReloadMarker()) {
          if (devSettingsModule == null) {
            throw new Error('DevSettings was not found');
          }
          oracleModule.markReload();
          assetModule.downloadAsync(
            'http://127.0.0.1:18080/slow?run=rn-instance-reload-20260918',
            null,
            'bin'
          ).catch(() => {});
          console.info('LANE_B_ASSET_DESTROY_STARTED');
          setTimeout(() => devSettingsModule.reload(), 1000);
          return;
        }
        console.info('LANE_B_ASSET_DESTROY_RELOADED');

        const fileUri = await assetModule.downloadAsync(
          'file:///data/storage/el2/base/files/a%20b-%E8%B5%84%E6%BA%90.txt',
          null,
          'txt'
        );
        const embeddedUri = await assetModule.downloadAsync(
          'asset://fixtures/lane-b-asset.txt',
          'cfa317abe4191b5da9ebdf27d80bd28a',
          'txt'
        );
        const rawfileUri = await assetModule.downloadAsync(
          'rawfile://fixtures/lane-b-raw.txt',
          '8f32fe13044be60b42a4ada16b872d40',
          'txt'
        );
        const httpUriFirst = await assetModule.downloadAsync(
          'http://127.0.0.1:18080/asset',
          '57da15c96e6521318434ca4b11b840cb',
          'bin'
        );
        const httpUriSecond = await assetModule.downloadAsync(
          'http://127.0.0.1:18080/asset',
          '57da15c96e6521318434ca4b11b840cb',
          'bin'
        );
        const noHashFirst = await assetModule.downloadAsync(
          'http://127.0.0.1:18080/nohash',
          null,
          'dat'
        );
        const noHashSecond = await assetModule.downloadAsync(
          'http://127.0.0.1:18080/nohash',
          null,
          'dat'
        );
        const bytes = {
          embedded: oracleModule.readText(embeddedUri),
          rawfile: oracleModule.readText(rawfileUri),
          http: oracleModule.readText(httpUriFirst),
          noHash: oracleModule.readText(noHashFirst),
        };
        oracleModule.overwriteText(httpUriFirst, 'corrupted-cache');
        const repairedHttpUri = await assetModule.downloadAsync(
          'http://127.0.0.1:18080/asset',
          '57da15c96e6521318434ca4b11b840cb',
          'bin'
        );
        const repairedHttpBytes = oracleModule.readText(repairedHttpUri);
        const errors = {
          notFound: await expectFailure(
            '404',
            () => assetModule.downloadAsync('http://127.0.0.1:18080/missing', null, 'txt'),
            /HTTP 404/
          ),
          md5Mismatch: await expectFailure(
            'MD5 mismatch',
            () => assetModule.downloadAsync(
              'http://127.0.0.1:18080/mismatch',
              '00000000000000000000000000000000',
              'bin'
            ),
            /MD5 mismatch/
          ),
          traversal: await expectFailure(
            'asset traversal',
            () => assetModule.downloadAsync('asset://../secret.txt', null, 'txt'),
            /Invalid embedded asset path/
          ),
          invalidType: await expectFailure(
            'type traversal',
            () => assetModule.downloadAsync('rawfile://fixtures/lane-b-raw.txt', null, '../txt'),
            /Invalid asset type/
          ),
        };
        const output = {
          nativeName: 'ExpoAsset',
          sameProcessReloadCompleted: true,
          fileUri,
          embeddedUri,
          rawfileUri,
          httpUriFirst,
          httpUriSecond,
          httpCacheHit: httpUriFirst === httpUriSecond,
          noHashFirst,
          noHashSecond,
          noHashCacheHit: noHashFirst === noHashSecond,
          bytes,
          repairedHttpUri,
          repairedHttpBytes,
          cacheFiles: oracleModule.listCache(),
          errors,
        };
        const serialized = JSON.stringify(output);
        console.info(`LANE_B_ASSET_RESULT ${serialized}`);
        if (active) {
          setResult(serialized);
        }
      } catch (error) {
        const message = formatError(error);
        console.error(`LANE_B_ASSET_ERROR ${message}`);
        if (active) {
          setResult(`ERROR: ${message}`);
        }
      }
    }

    run();
    return () => {
      active = false;
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 24 }}>
      <Text selectable>{result}</Text>
    </ScrollView>
  );
}

AppRegistry.registerComponent('AwesomeProject', () => App);
