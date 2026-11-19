import { type ConfigPlugin, createRunOncePlugin } from 'expo/config-plugins';

import { withAssetsAndroid } from './withAssetsAndroid';
import { withAssetsIos } from './withAssetsIos';
import { withAssetsHarmony } from './withAssetsHarmony';

const pkg = require('expo-asset/package.json');

export type AssetProps = {
  assets?: string[];
};

const withAssets: ConfigPlugin<AssetProps | null> = (config, props) => {
  config = withAssetsHarmony(config, props?.assets ?? []);
  if (!props) {
    return config;
  }

  if (props.assets && props.assets.length === 0) {
    return config;
  }

  config = withAssetsIos(config, props.assets ?? []);
  config = withAssetsAndroid(config, props.assets ?? []);

  return config;
};

export default Object.assign(createRunOncePlugin(withAssets, pkg.name, pkg.version), {
  harmony: { platforms: ['harmony', 'ios', 'android'] },
});
