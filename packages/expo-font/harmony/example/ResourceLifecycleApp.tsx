import React, { useEffect, useState } from 'react';
import { Button, Image, ScrollView, Text } from 'react-native';
import { Asset } from 'expo-asset';
import * as Font from 'expo-font';
import { reloadAppAsync, requireNativeModule, uuid } from 'expo-modules-core';
import phase from './resource-state.json';

const boot = uuid.v4();
const oracle = requireNativeModule<any>('LaneBAssetOracle');
export default function ResourceLifecycleApp() {
  const [status, setStatus] = useState('Collecting resource observations');
  const [image, setImage] = useState<Font.RenderToImageResult | null>(null);
  useEffect(() => {
    (async () => {
      const markerBefore = oracle.hasReloadMarker();
      const fonts = Font.getLoadedFonts();
      let text: string | null = null;
      let cacheUri: string | null = null;
      let rejected = false;
      try {
        const asset = await Asset.fromURI('rawfile://expo-asset/data.json').downloadAsync();
        cacheUri = asset.localUri;
        text = oracle.readText(cacheUri);
      } catch { rejected = true; }
      const png = phase.phase === 'removed' ? null : await Font.renderToImageAsync('\ue88a', { fontFamily: 'EmbeddedIcons', size: 48, color: '#0057b8' });
      oracle.markReload();
      console.info('A_RESOURCE_PROBE=' + JSON.stringify({ boot, phase: phase.phase, markerBefore, fonts, text, cacheUri, rejected, png }));
      setImage(png);
      setStatus(`Resource phase: ${phase.phase}`);
    })().catch(error => { setStatus(String(error)); console.error('A_RESOURCE_FAILURE=' + String(error)); });
  }, []);
  return <ScrollView contentContainerStyle={{ padding: 32, paddingTop: 60, backgroundColor: 'white' }}>
    <Text>{status}</Text>
    {image && <Image source={image} accessibilityLabel="embedded-font-glyph" style={{ width: image.width, height: image.height }} />}
    <Button title="Reload resources" onPress={() => reloadAppAsync('A resource lifecycle')} />
  </ScrollView>;
}
