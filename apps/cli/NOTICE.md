# NOTICE

`expo-harmony-cli` is a community CLI for creating Expo projects with HarmonyOS support.

This project integrates with the Expo, React Native, React Native OpenHarmony, OpenHarmony and HarmonyOS ecosystems, but it is not an official release of Expo, React Native, OpenHarmony or Huawei.

The CLI includes templates, patches, shims and compatibility metadata to help generated projects run on HarmonyOS. These assets are provided to make the generated project reproducible and should be reviewed when upgrading Expo, React Native or React Native OpenHarmony versions.

## SDK54 package patches

The SDK54 files under `content/patches/sdk-54/` are derivative diffs against the exact upstream npm package versions declared by `manifest.json`. Applicable upstream license texts are shipped under `content/patches/sdk-54/licenses/`. The patches add community HarmonyOS support and are not official Expo releases.
