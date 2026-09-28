export const FIXTURE_TEMPLATES = Object.freeze(['blank-typescript', 'default']);

export const EXPO_ARCHIVE_VERSIONS = Object.freeze({
  '@expo/cli': '54.0.27',
  '@expo/metro-config': '54.0.17',
  expo: '54.0.37',
  'expo-asset': '12.0.13',
  'expo-constants': '18.0.14',
  'expo-font': '14.0.12',
  'expo-linking': '8.0.12',
  'expo-modules-autolinking': '3.0.27',
  'expo-modules-core': '3.0.30',
  'expo-router': '6.0.24',
  'expo-splash-screen': '31.0.13',
  'expo-status-bar': '3.0.9',
  'expo-system-ui': '6.0.9',
  'expo-web-browser': '15.0.11',
});

export const EXTERNAL_ARCHIVE_VERSIONS = Object.freeze({
  '@react-native-oh/react-native-harmony': '0.82.30',
  'react-native-gesture-handler': '2.30.0',
  '@react-native-ohos/react-native-gesture-handler': '2.30.1',
  'react-native-reanimated': '4.2.1',
  '@react-native-ohos/react-native-reanimated': '4.0.1',
  'react-native-safe-area-context': '5.6.2',
  '@react-native-ohos/react-native-safe-area-context': '5.6.3',
  'react-native-screens': '4.17.1',
  '@react-native-ohos/react-native-screens': '4.9.0',
  'react-native-worklets': '0.7.1',
  '@react-native-ohos/react-native-worklets': '1.0.0',
});

export const BLANK_EXPO_PACKAGES = Object.freeze(
  Object.keys(EXPO_ARCHIVE_VERSIONS).filter(
    (name) => name !== 'expo-router' && name !== 'expo-web-browser',
  ),
);

export const DEFAULT_EXPO_PACKAGES = Object.freeze(Object.keys(EXPO_ARCHIVE_VERSIONS));
export const DEFAULT_EXTERNAL_PACKAGES = Object.freeze(Object.keys(EXTERNAL_ARCHIVE_VERSIONS));

export const BLANK_PLAIN_DEPENDENCIES = Object.freeze({
  '@react-native-oh/react-native-harmony-cli': '0.82.30',
  react: '19.1.1',
  'react-native': '0.82.1',
});

export const DEFAULT_PLAIN_DEPENDENCIES = Object.freeze({
  '@expo/metro-runtime': '6.1.2',
  '@expo/vector-icons': '15.0.3',
  '@react-native-oh/react-native-harmony-cli': '0.82.30',
  '@react-navigation/bottom-tabs': '7.4.0',
  '@react-navigation/core': '7.12.4',
  '@react-navigation/elements': '2.6.3',
  '@react-navigation/native': '7.1.17',
  '@react-navigation/native-stack': '7.3.16',
  '@react-navigation/routers': '7.5.1',
  'expo-haptics': '15.0.8',
  'expo-symbols': '1.0.8',
  react: '19.1.1',
  'react-dom': '19.1.1',
  'react-native': '0.82.1',
  'react-native-web': '0.21.0',
});

export const BLANK_DEV_DEPENDENCIES = Object.freeze({
  '@types/react': '19.1.17',
  typescript: '5.9.2',
});

export const DEFAULT_DEV_DEPENDENCIES = Object.freeze({
  '@types/react': '19.1.17',
  eslint: '9.25.0',
  'eslint-config-expo': '10.0.0',
  typescript: '5.9.2',
});

export const DEFAULT_IMAGE_IMPORT = [
  "import { Image } from 'expo-image';",
  "import { Platform, StyleSheet } from 'react-native';",
].join('\n');

export const DEFAULT_REACT_NATIVE_IMAGE_IMPORT =
  "import { Image, Platform, StyleSheet } from 'react-native';";

export const DEFAULT_IMAGE_FILES = Object.freeze([
  'app/(tabs)/explore.tsx',
  'app/(tabs)/index.tsx',
]);
