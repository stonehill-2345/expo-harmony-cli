import React, { useEffect, useState } from 'react';
import { Button, Image, ScrollView, Text } from 'react-native';
import { Asset } from 'expo-asset';
import * as Font from 'expo-font';
import { reloadAppAsync } from 'expo-modules-core';

const boot = Date.now();
const report = (value: object) => console.log('A03_FONT_FORMATS=' + JSON.stringify({ boot, dev: __DEV__, ...value }));
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const source = (file: string) => Asset.fromURI('rawfile://font-formats/' + file);
report({ kind: 'boot' });

export default function FontFormatsApp() {
  const [status, setStatus] = useState('Running');
  const [images, setImages] = useState<Font.RenderToImageResult[]>([]);
  useEffect(() => {
    let active = true;
    const run = async () => {
      const results: { name: string; passed: boolean }[] = [];
      const pass = (name: string) => results.push({ name, passed: true });
      for (const file of ['probe.ttc', 'probe.woff', 'probe.woff2', 'empty.ttf', 'truncated.ttf', 'undecodable.ttf']) {
        const alias = 'Rejected-' + file;
        let message = '';
        try { await Font.loadAsync(alias, source(file)); } catch (error) {
          message = (error as { message?: string })?.message || String(error);
        }
        const expected = file.endsWith('.ttc') ? /collection.*TTC/ : file.includes('woff') ? /WOFF.*not supported/
          : file === 'empty.ttf' ? /empty/i : file === 'truncated.ttf' ? /table directory/ : /decode|typeface|parameter/i;
        check(expected.test(message), 'Unexpected rejection for '+file+': '+message);
        check(message && !Font.isLoaded(alias) && !Font.isLoading(alias) && !Font.getLoadedFonts().includes(alias), 'Invalid font reported loaded: '+file);
        report({ kind: 'rejection', file, message }); pass('reject-' + file);
      }
      // A failed public request must release the namespace for a later valid load.
      await Font.loadAsync('Rejected-undecodable.ttf', source('probe.ttf'));
      check(Font.isLoaded('Rejected-undecodable.ttf'), 'Retry after rejection failed'); pass('retry-after-decode-failure');
      await Promise.all([Font.loadAsync('Format TTF', source('probe.ttf')), Font.loadAsync('Format TTF', source('probe.ttf'))]);
      check(Font.isLoaded('Format TTF') && !Font.isLoading('Format TTF') && Font.getLoadedFonts().filter(n => n === 'Format TTF').length === 1, 'Concurrent load failed');
      pass('concurrent-ttf-load');
      await Font.loadAsync('Format OTF', source('probe.otf'));
      check(Font.isLoaded('Format OTF'), 'OTF load failed'); pass('otf-load');
      // SDK54 public loadAsync preserves an already-loaded alias; it does not replace it.
      await Font.loadAsync('Format TTF', source('probe.otf')); pass('loaded-alias-idempotent');
      const ttf = await Font.renderToImageAsync('\ue001', { fontFamily: 'Format TTF', size: 60, color: '#0057b8' });
      const otf = await Font.renderToImageAsync('\ue001', { fontFamily: 'Format OTF', size: 60, color: '#16803c' });
      const retry = await Font.renderToImageAsync('\ue001', { fontFamily: 'Rejected-undecodable.ttf', size: 60, color: '#0057b8' });
      for (const value of [ttf, otf, retry]) check(value.uri.startsWith('file:///') && value.width > 0 && value.height > 0, 'Missing image');
      report({ kind: 'images', ttf, otf, retry });
      pass('ttf-image'); pass('otf-image'); pass('retry-image');
      report({ kind: 'results', results });
      if (active) { setImages([ttf, otf]); setStatus(`API ${results.length}/${results.length}; pixels verified separately`); }
    };
    run().catch(error => { report({ kind: 'failure', error: String(error) }); if (active) setStatus(String(error)); });
    return () => { active = false; };
  }, []);
  return <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 52, backgroundColor: 'white' }}>
    <Text style={{ fontSize: 22, color: 'black' }}>Font formats acceptance</Text>
    <Text style={{ fontSize: 16, color: 'black', marginVertical: 10 }}>{status}</Text>
    {images.map((image, index) => <React.Fragment key={image.uri}>
      <Text style={{ fontSize: 16, color: 'black' }}>{index === 0 ? 'TTF' : 'CFF OTF'}</Text>
      <Text accessibilityLabel={index === 0 ? 'ttf-native' : 'otf-native'} style={{ fontFamily: index === 0 ? 'Format TTF' : 'Format OTF', fontSize: 60, color: index === 0 ? '#0057b8' : '#16803c' }}>{'\ue001'}</Text>
      <Image source={image} style={{ width: image.width, height: image.height, marginVertical: 8 }} />
    </React.Fragment>)}
    <Button title="Reload font formats" onPress={() => { report({ kind: 'reload-request' });
      reloadAppAsync('A03 formats').catch(error => report({ kind: 'failure', error: String(error) })); }} />
  </ScrollView>;
}
