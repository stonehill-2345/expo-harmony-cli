import { type ConfigPlugin, createRunOncePlugin } from 'expo/config-plugins';

import { withFontsAndroid } from './withFontsAndroid';
import { withFontsIos } from './withFontsIos';
import { withFontsHarmony } from './withFontsHarmony';

const pkg = require('expo-font/package.json');

export type FontObject = {
  fontFamily: string;
  fontDefinitions: {
    path: string;
    weight: number;
    style?: 'normal' | 'italic' | undefined;
  }[];
};

export type Font = string | FontObject;

export type FontProps = {
  fonts?: string[];
  android?: {
    fonts?: Font[];
  };
  ios?: {
    fonts?: string[];
  };
};

const withFonts: ConfigPlugin<FontProps> = (config, props) => {
  config = withFontsHarmony(config, props?.fonts ?? []);
  if (!props) {
    return config;
  }

  const iosFonts = [...(props.fonts ?? []), ...(props.ios?.fonts ?? [])];

  if (iosFonts.length > 0) {
    config = withFontsIos(config, iosFonts);
  }

  const androidFonts = [...(props.fonts ?? []), ...(props.android?.fonts ?? [])];

  if (androidFonts.length > 0) {
    config = withFontsAndroid(config, androidFonts);
  }

  return config;
};

export default Object.assign(createRunOncePlugin(withFonts, pkg.name, pkg.version), {
  harmony: { platforms: ['harmony', 'ios', 'android'] },
});
