import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Asset } from 'expo-asset';
import * as Font from 'expo-font';
import { requireNativeModule } from 'expo-modules-core';
import React, { useEffect, useRef, useState } from 'react';
import { Text, TurboModuleRegistry, View } from 'react-native';
import BaseApp from '__BASE_APP__';

const materialSource = MaterialIcons.font.material;
const boot = Date.now();
const server = 'http://127.0.0.1:18081';
const direct = TurboModuleRegistry.getEnforcing<any>('ExpoFontLoader');
const native = requireNativeModule<any>('ExpoFontLoader');
const report = (kind: string, value: object = {}) => console.log('I0_FONT=' + JSON.stringify({ boot, kind, ...value }));
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const waitFor = async (condition: () => boolean, message: string) => {
  const deadline = Date.now() + 10000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 40));
  }
};
const topLevel = Font.getLoadedFonts();
check(JSON.stringify(topLevel) === JSON.stringify(native.getLoadedFonts()), 'Top-level Core font state mismatch');
check(JSON.stringify(topLevel) === JSON.stringify(direct.getLoadedFonts()), 'Top-level direct font state mismatch');
report('top-level', { fonts: topLevel, materialLoaded: Font.isLoaded('material'), dev: __DEV__ });

function HookProbe({ family, source, label }: { family: string; source: any; label: string }) {
  const [loaded, error] = Font.useFonts({ [family]: source });
  useEffect(() => {
    report('hook', { family, label, loaded, error: error ? String(error) : null });
    return () => report('hook-effect-cleanup', { family, label, loaded });
  }, [loaded, error]);
  useEffect(() => () => report('hook-unmount', { family, label }), []);
  return <Text accessibilityLabel={`font-hook-${label}`}>{label}: {loaded ? 'loaded' : error ? 'error' : 'loading'}</Text>;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  try { return JSON.stringify(error); } catch { return String(error); }
}

async function expectReject(family: string, source: any, pattern: RegExp) {
  let error: unknown;
  try { await Font.loadAsync(family, source); } catch (caught) { error = caught; }
  const message = errorText(error);
  check(error !== undefined && pattern.test(message), `${family} rejection mismatch: ${message}`);
  check(!Font.isLoaded(family), `${family} was marked loaded after failure`);
  check(!Font.getLoadedFonts().includes(family), `${family} leaked into native loaded fonts`);
  report('expected-rejection', { family, error: message });
}

async function runFontChecks() {
  const runId = `${boot}-${Date.now()}`;
  try {
    report('material-before-explicit-load', { loading: Font.isLoading('material'), loaded: Font.isLoaded('material') });
    const staticOne = MaterialIcons.loadFont();
    const staticTwo = MaterialIcons.loadFont();
    report('material-after-explicit-request', { loading: Font.isLoading('material'), loaded: Font.isLoaded('material') });
    await Promise.all([staticOne, staticTwo]);
    check(Font.isLoaded('material'), 'material not loaded');
    const staticFonts = Font.getLoadedFonts();
    check(staticFonts.includes('material'), 'native list missing material');
    check(JSON.stringify(staticFonts) === JSON.stringify(native.getLoadedFonts()), 'Core/public font list mismatch');
    check(JSON.stringify(staticFonts) === JSON.stringify(direct.getLoadedFonts()), 'Direct/public font list mismatch');
    report('static-pass', { fonts: staticFonts });

    const asset = Asset.fromModule(materialSource);
    await asset.downloadAsync();
    check(asset.localUri?.startsWith('file://'), 'MaterialIcons did not produce a local file URI');
    const fileOne = Font.loadAsync('MaterialFileAlias', asset.localUri!);
    const fileTwo = Font.loadAsync('MaterialFileAlias', asset.localUri!);
    await Promise.all([fileOne, fileTwo]);
    check(Font.isLoaded('MaterialFileAlias'), 'file alias not loaded');
    report('file-pass', { localUri: asset.localUri });

    const remoteUrl = `${server}/MaterialIcons.ttf?run=${encodeURIComponent(runId)}`;
    const remote = Font.loadAsync('MaterialRemoteAlias', remoteUrl);
    check(Font.isLoading('MaterialRemoteAlias'), 'remote load was not pending');
    await remote;
    check(Font.isLoaded('MaterialRemoteAlias'), 'remote alias not loaded');
    report('remote-pass', { remoteUrl });

    await expectReject('MissingFont', 'file:///data/storage/el2/base/haps/entry/cache/missing-font-v1.ttf', /does not exist|Unable to download/);
    await expectReject('EmptyFont', `${server}/empty.ttf?run=${encodeURIComponent(runId)}`, /empty|register|font/i);
    await expectReject('CorruptFont', `${server}/corrupt.ttf?run=${encodeURIComponent(runId)}`, /font|register|query|invalid/i);
    await expectReject('', asset.localUri!, /Font family|empty name|ERR_FONT_FAMILY/);

    let imageError: unknown;
    try { await Font.renderToImageAsync('home', { fontFamily: 'material', size: 40 }); }
    catch (caught) { imageError = caught; }
    check(/unavailable|ExpoFontUtils/i.test(errorText(imageError)), 'FontUtils unsupported boundary was not explicit');
    report('font-utils-unsupported', { error: errorText(imageError) });

    await waitFor(() => Font.isLoaded('UnmountedHookMaterial'), 'unmounted hook font did not finish native load');
    report('unmounted-hook-finished', { loaded: Font.isLoaded('UnmountedHookMaterial') });
    report('public-pass', { fonts: Font.getLoadedFonts(), runId });
  } catch (error) {
    report('failure', { error: String(error) });
  }
}

export default function FontApp() {
  const [ready, setReady] = useState(Font.isLoaded('material'));
  const [showSlowHook, setShowSlowHook] = useState(true);
  const started = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowSlowHook(false), 250);
    if (!started.current) {
      started.current = true;
      void runFontChecks().then(() => setReady(Font.isLoaded('material')));
    }
    return () => clearTimeout(timer);
  }, []);
  return <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
    <View style={{ paddingTop: 34, paddingHorizontal: 24, minHeight: 108, flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff' }}>
      <MaterialIcons testID="font-material-icon" accessibilityLabel="font-material-icon" name="home" size={48} color="#0057b8"
        onLayout={({ nativeEvent }) => report('material-layout', nativeEvent.layout)} />
      <Text testID="font-fallback-glyph" accessibilityLabel="font-fallback-glyph" style={{ fontSize: 48, marginLeft: 32, color: '#b42318' }}>{'\ue88a'}</Text>
      <View style={{ marginLeft: 20 }}>
        <Text accessibilityLabel="font-material-state">{ready ? 'Material loaded' : 'Material loading'}</Text>
        <HookProbe family="HookMaterial" source={materialSource} label="normal" />
        {showSlowHook && <HookProbe family="UnmountedHookMaterial" source={`${server}/slow/MaterialIcons.ttf?boot=${boot}`} label="slow" />}
      </View>
    </View>
    <View style={{ flex: 1 }}><BaseApp /></View>
  </View>;
}
