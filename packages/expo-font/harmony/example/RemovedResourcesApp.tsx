import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Asset } from 'expo-asset';
import * as Font from 'expo-font';
const boot = Date.now();
export default function App() {
  const [status,setStatus] = useState('Checking removed resources');
  useEffect(() => { (async () => {
    const fonts = Font.getLoadedFonts();
    if (fonts.includes('EmbeddedIcons')) throw new Error('Removed font still registered');
    let rejected = false;
    try { await Asset.fromURI('rawfile://expo-asset/data.json').downloadAsync(); } catch { rejected = true; }
    if (!rejected) throw new Error('Removed asset returned stale cache');
    console.log('STEP3_RESOURCE_REMOVAL=' + JSON.stringify({ boot, dev: __DEV__, fonts, removedAssetRejected: rejected, passed: true }));
    setStatus('Removed font and asset: PASS');
  })().catch(error => {setStatus(String(error)); console.log('STEP3_RESOURCE_REMOVAL=' + JSON.stringify({boot, passed: false, error:String(error)})); }); },[]);
  return <View style={{padding:40,paddingTop:100}}><Text>{status}</Text></View>;
}
