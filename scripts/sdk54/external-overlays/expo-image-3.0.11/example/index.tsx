import React, {useRef, useState} from 'react';
import {AppRegistry, Button, ScrollView, Text, View} from 'react-native';
import {Image} from 'expo-image';

// Independent LOCAL fixture; this does not replace the original default app GI.
const first = require('./first.png');
const second = require('./second.png');
const boot = String(Date.now());
let sequence = 0;
console.log('A_IMAGE_BOOT ' + boot);
function App() {
  const image = useRef<Image>(null);
  const [source, setSource] = useState<any>(first);
  const [mounted, setMounted] = useState(true);
  const [fit, setFit] = useState<'cover' | 'contain' | 'fill'>('contain');
  const [events, setEvents] = useState<string[]>([]);
  function record(name: string, payload?: unknown) {
    const line = JSON.stringify({boot, sequence: ++sequence, name, payload});
    console.log('A_IMAGE_EVENT ' + line);
    setEvents(previous => [...previous.slice(-11), line]);
  }
  function select(next: any) { setMounted(true); setSource(next); }
  return <ScrollView contentContainerStyle={{padding: 20, paddingTop: 50, gap: 10}}>
    <Text>ExpoImage · LOCAL native fixture</Text>
    <View style={{width: 240, height: 180, backgroundColor: '#eeeeee'}}>
      {mounted && <Image ref={image} source={source} style={{width: 240, height: 180}}
        accessibilityLabel="a-image-pixels" contentFit={fit}
        onLoadStart={() => record('loadStart')} onLoad={event => record('load', event)}
        onLoadEnd={() => record('loadEnd')} onError={event => record('error', event)}
        onDisplay={() => record('display')} onProgress={event => record('progress', event)}/>}
    </View>
    <Button title="First PNG" onPress={() => select(first)}/>
    <Button title="Replace PNG" onPress={() => select(second)}/>
    <Button title="Missing PNG" onPress={() => select('asset://missing-image.png')}/>
    <Button title="Unsupported GIF" onPress={() => select('asset://unsupported.gif')}/>
    <Button title="Unmount" onPress={() => setMounted(false)}/>
    <Button title="Cycle fit" onPress={() => setFit(fit === 'contain' ? 'cover' : fit === 'cover' ? 'fill' : 'contain')}/>
    <Button title="Reload" onPress={() => image.current?.reloadAsync().catch(error => record('reloadRejected', String(error)))}/>
    <Button title="Unsupported prefetch" onPress={() => Image.prefetch('https://example.invalid/a.png').then(
      () => record('UNEXPECTED_PREFETCH_SUCCESS'), error => record('prefetchRejected', {code: error.code, message: error.message}))}/>
    {events.map((line, index) => <Text key={index} style={{fontSize: 11}}>{line}</Text>)}
  </ScrollView>;
}
AppRegistry.registerComponent('main', () => App);
