import React, { useEffect, useState } from 'react';
import { Button, Image, ScrollView, Text } from 'react-native';
import { Asset } from 'expo-asset';
import * as Font from 'expo-font';
import { reloadAppAsync, requireNativeModule } from 'expo-modules-core';

const boot = Date.now();
const oracle = requireNativeModule<any>('LaneBAssetOracle');
const assetNative = requireNativeModule<any>('ExpoAsset');
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const report = (value: object) => console.log('STEP3_FONT_ASSET=' + JSON.stringify({ boot, dev: __DEV__, ...value }));
report({ kind: 'boot' });

export default function FontAssetApp() {
  const [status, setStatus] = useState('Running');
  const [images, setImages] = useState<Font.RenderToImageResult[]>([]);
  useEffect(() => {
    let active = true;
    const run = async () => {
      const results: { name: string; passed: boolean }[] = [];
      const pass = (name: string) => results.push({ name, passed: true });
      check(Font.isLoaded('EmbeddedIcons') && Font.getLoadedFonts().includes('EmbeddedIcons'), 'Embedded font missing before JS load');
      report({ kind: 'embedded-startup', fonts: Font.getLoadedFonts() });
      pass('plugin-font-registered-before-js-load');
      const rawEmbedded = Asset.fromURI('rawfile://expo-asset/data.json');
      await rawEmbedded.downloadAsync();
      check(oracle.readText(rawEmbedded.localUri) === '{ "embedded": "updated" }\n', 'Plugin asset bytes differ');
      pass('plugin-asset-rawfile');
      const icon = await Font.renderToImageAsync('\ue88a', { fontFamily: 'EmbeddedIcons', size: 48, color: '#0057b8' });
      const large = await Font.renderToImageAsync('\ue88a', { fontFamily: 'EmbeddedIcons', size: 96, color: '#0057b880' });
      const text = await Font.renderToImageAsync('Ågj中文', { size: 32, color: '#b42318' });
      const transparent = await Font.renderToImageAsync('hidden', { color: 'transparent' });
      const fallback = await Font.renderToImageAsync('Default');
      for (const result of [icon, large, text, transparent, fallback]) {
        check(result.uri.startsWith('file:///') && result.width > 0 && result.height > 0 && result.scale > 0, 'Invalid image metadata');
        check(oracle.listCache().includes(decodeURIComponent(result.uri.split('/').pop()!)), 'PNG file missing');
      }
      check(large.width >= icon.width * 1.9 && large.height >= icon.height * 1.9, 'Size option ignored');
      report({ kind: 'images', icon, large, text, transparent, fallback, fontUri: 'embedded-plugin' });
      pass('custom-font-render'); pass('scaled-translucent-render'); pass('unicode-render'); pass('transparent-render'); pass('default-render');
      for (const size of [0, -1]) {
        let rejected = false;
        try { await Font.renderToImageAsync('bad', { size }); } catch { rejected = true; }
        check(rejected, 'Invalid size accepted');
      }
      pass('invalid-size-rejected');
      let emptyRejected = false;
      try { await Font.renderToImageAsync(''); } catch { emptyRejected = true; }
      check(emptyRejected, 'Empty text accepted'); pass('empty-text-rejected');
      const raw = Asset.fromURI('rawfile://fixtures/lane-b-raw.txt');
      await raw.downloadAsync();
      check(oracle.readText(raw.localUri) === 'lane-b-raw-fixture-v1\n', 'Rawfile bytes differ');
      pass('embedded-rawfile');
      // Fixed fixture MD5 is independently recorded in the acceptance inputs.
      const hash = '8f32fe13044be60b42a4ada16b872d40';
      const verified = await assetNative.downloadAsync('rawfile://fixtures/lane-b-raw.txt', hash, 'txt');
      oracle.overwriteText(verified, 'corrupt');
      const repaired = await assetNative.downloadAsync('rawfile://fixtures/lane-b-raw.txt', hash, 'txt');
      check(oracle.readText(repaired) === 'lane-b-raw-fixture-v1\n', 'Corrupt cache reused');
      pass('hashed-cache-repair');
      let mismatchRejected = false;
      try { await assetNative.downloadAsync('rawfile://fixtures/lane-b-raw.txt', '00000000000000000000000000000000', 'txt'); }
      catch { mismatchRejected = true; }
      check(mismatchRejected && !oracle.listCache().some((name: string) => name.includes('.tmp-')), 'Invalid hash or temporary file leak');
      pass('hash-mismatch-cleanup');
      report({ kind: 'results', results });
      if (active) { setImages([icon, large, text, fallback]); setStatus(`API checks ${results.length}/${results.length}; PNG verification required`); }
    };
    run().catch(error => { report({ kind: 'failure', error: String(error) }); if (active) setStatus(String(error)); });
    return () => { active = false; };
  }, []);
  return <ScrollView contentContainerStyle={{ padding: 32, paddingTop: 60, backgroundColor: 'white' }}>
    <Text style={{ fontSize: 24, color: 'black' }}>Font / Asset acceptance</Text>
    <Text style={{ fontSize: 20, color: 'black', marginVertical: 12 }}>{status}</Text>
    {images.map((source, i) => <Image key={source.uri} source={source} accessibilityLabel={`font-render-${i}`}
      style={{ width: source.width, height: source.height, marginVertical: 12 }} />)}
    <Button title="Reload Font / Asset" onPress={() => { report({ kind: 'reload-request' });
      reloadAppAsync('A03 acceptance').catch(error => report({ kind: 'failure', error: String(error) })); }} />
  </ScrollView>;
}
