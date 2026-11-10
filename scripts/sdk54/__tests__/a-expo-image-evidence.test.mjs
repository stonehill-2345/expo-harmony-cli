import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIXED_SOURCE,
  FROZEN_PUBLIC_CONTRACT,
  assertFailureBaseline,
  assertFixedSourceIdentity,
  assertFrozenPublicContract,
  extractDefaultPageUsage,
  extractPublicContract,
} from '../a-expo-image-evidence.mjs';

const clone = value => structuredClone(value);

function frozenContractFixture() {
  const props = FROZEN_PUBLIC_CONTRACT.imageProps.map(name => ({
    name,
    deprecated: FROZEN_PUBLIC_CONTRACT.deprecatedProps.includes(name),
  }));
  return {
    entry: { named: [...FROZEN_PUBLIC_CONTRACT.entryExports].sort(), exportAll: ['./Image.types'] },
    typeExports: [...FROZEN_PUBLIC_CONTRACT.typeExports].sort().map(name => ({ name })),
    imageProps: props,
    events: props.filter(row => row.name.startsWith('on')),
    imageClass: {
      staticMethods: [...FROZEN_PUBLIC_CONTRACT.staticMethods].sort(),
      instanceMethods: [...FROZEN_PUBLIC_CONTRACT.instanceMethods].sort(),
    },
    native: {
      commands: FROZEN_PUBLIC_CONTRACT.nativeCommands.map(name => ({ name })),
      moduleCalls: [['ExpoImage']], viewCalls: [['ExpoImage']],
    },
    imageRef: {
      heritage: ["extends SharedRef<'image'>"],
      properties: FROZEN_PUBLIC_CONTRACT.imageRefProperties.map(name => ({ name })),
    },
    dependencies: {
      expo: ['NativeModule', 'SharedRef', 'SharedRefType', 'requireNativeModule'],
      'expo-modules-core': ['Platform', 'createSnapshotFriendlyRef', 'requireNativeViewManager'],
      react: ['default'],
      'react-native': ['NativeSyntheticEvent', 'Platform', 'StyleSheet', 'View', 'ViewProps'],
    },
  };
}

test('fixed source identity rejects changed commit, version, and archive integrity', () => {
  assert.doesNotThrow(() => assertFixedSourceIdentity(clone(FIXED_SOURCE)));
  for (const [field, value] of [
    ['commit', '0'.repeat(40)],
    ['version', '3.0.12'],
    ['integrity', 'sha512-changed'],
  ]) {
    const identity = clone(FIXED_SOURCE);
    identity[field] = value;
    assert.throws(() => assertFixedSourceIdentity(identity), /Changed expo-image fixed source identity/);
  }
});

test('TypeScript AST extracts entry exports, props, payloads, methods, and native identities', () => {
  const contract = extractPublicContract({
    index: `export * from './Image.types'; export { Image } from './Image'; export { ImageBackground } from './ImageBackground'; export { useImage } from './useImage';`,
    types: `
      import type { NativeModule, SharedRef, SharedRefType } from 'expo';
      import type { ViewProps } from 'react-native';
      export interface ImageProps extends ViewProps { source?: number | SharedRefType<'image'>; onLoad?: (event: ImageLoadEventData) => void; }
      export type ImageLoadEventData = { source: string };
      export type ImageProgressEventData = { loaded: number; total: number };
      export type ImageErrorEventData = { error: string };
      export declare class ImageRef extends SharedRef<'image'> { readonly width: number; }
      export declare class ImageNativeModule extends NativeModule {}
    `,
    image: `
      import { Platform, createSnapshotFriendlyRef } from 'expo-modules-core';
      import React from 'react'; import { StyleSheet, type View } from 'react-native';
      export class Image { static Image: unknown; static prefetch(): void {} startAnimating(): void {} render(): null { return null; } }
    `,
    nativeView: `
      import { requireNativeViewManager } from 'expo-modules-core';
      import { NativeSyntheticEvent, Platform, StyleSheet } from 'react-native';
      const View = requireNativeViewManager('ExpoImage');
      class ExpoImage { startAnimating!: () => Promise<void>; render(): null { return null; } }
    `,
    nativeModule: `import { requireNativeModule } from 'expo'; export default requireNativeModule('ExpoImage');`,
    useImage: `import React from 'react'; export function useImage() { return null; }`,
  });
  assert.deepEqual(contract.entry, { named: ['Image', 'ImageBackground', 'useImage'], exportAll: ['./Image.types'] });
  assert.deepEqual(contract.imageProps.map(row => row.name), ['source', 'onLoad']);
  assert.deepEqual(contract.eventPayloads.ImageProgressEventData.map(row => row.name), ['loaded', 'total']);
  assert.deepEqual(contract.imageClass.staticMethods, ['prefetch']);
  assert.deepEqual(contract.native, {
    moduleCalls: [['ExpoImage']], viewCalls: [['ExpoImage']], moduleName: 'ExpoImage', viewName: 'default',
    expectedHarmonyComponentName: 'ViewManagerAdapter_ExpoImage', commands: [{ name: 'startAnimating', type: '() => Promise<void>' }],
  });
});

test('frozen public API rejects a missing prop, method, event, or exported type', () => {
  assert.doesNotThrow(() => assertFrozenPublicContract(frozenContractFixture()));
  for (const mutate of [
    contract => contract.imageProps.splice(1, 1),
    contract => contract.imageClass.staticMethods.pop(),
    contract => contract.events.shift(),
    contract => contract.typeExports.pop(),
  ]) {
    const contract = frozenContractFixture();
    mutate(contract);
    assert.throws(() => assertFrozenPublicContract(contract));
  }
});

test('each original default page must keep an expo-image local PNG usage', () => {
  const page = (asset, style) => `
    import { Image } from 'expo-image'; import { StyleSheet } from 'react-native';
    const styles = StyleSheet.create({ logo: { width: 290, height: 178 } });
    export default function Page() { return <Image source={require('${asset}')} style={${style}} />; }
  `;
  assert.deepEqual(extractDefaultPageUsage(page('@/assets/images/partial-react-logo.png', 'styles.logo'), 'index.tsx'), {
    source: '@/assets/images/partial-react-logo.png', display: { width: 290, height: 178 },
  });
  assert.deepEqual(extractDefaultPageUsage(page('@/assets/images/react-logo.png', "{ width: 100, height: 100 }"), 'explore.tsx'), {
    source: '@/assets/images/react-logo.png', display: { width: 100, height: 100 },
  });
  assert.throws(() => extractDefaultPageUsage(`import { Image } from 'expo-image'; export default () => null;`, 'explore.tsx'), /Missing local PNG Image usage/);
});

function failureFixture() {
  return {
    moduleConfig: { platforms: ['apple', 'android'] },
    acceptance: {
      overallAcceptance: 'FAIL', reason: 'Error reproduced after cold restart.',
      screens: ['default-debug-first-screen', 'default-cold-restart-recaptured'].map(capture => ({
        capture, expectedText: 'Native Harmony view is not registered: ExpoImage/default', passed: true,
      })),
    },
    log: 'Native Harmony view is not registered: ExpoImage/default\nNative Harmony view is not registered: ExpoImage/default',
  };
}

test('old failure baseline requires two captures, two errors, and no Harmony module config', () => {
  assert.equal(assertFailureBaseline(failureFixture()).occurrences, 2);
  for (const mutate of [
    value => value.moduleConfig.platforms.push('harmony'),
    value => value.moduleConfig.harmony = { modules: ['ExpoImage'] },
    value => value.acceptance.screens.pop(),
    value => value.log = 'Native Harmony view is not registered: ExpoImage/default',
  ]) {
    const value = failureFixture();
    mutate(value);
    assert.throws(() => assertFailureBaseline(value));
  }
});
