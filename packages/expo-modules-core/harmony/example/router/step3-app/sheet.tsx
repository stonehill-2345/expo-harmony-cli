import { reloadAppAsync } from 'expo-modules-core';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { useState } from 'react';
import { Button, Text, View } from 'react-native';

export default function Sheet() {
  const { case: name = 'two' } = useLocalSearchParams<{ case?: string }>();
  const [allowClose, setAllowClose] = useState(false);
  const [landscape, setLandscape] = useState(false);
  usePreventRemove(name === 'prevent' && !allowClose, () => console.info('A_SHEET_PREVENTED'));
  const fit = name === 'fit';
  return <>
    <Stack.Screen options={{ orientation: landscape ? 'landscape' : 'portrait' }} />
    <View testID="sheet-content" onLayout={event => console.info('A_SHEET_LAYOUT=' + JSON.stringify({ caseId: name, ...event.nativeEvent.layout }))}
      style={{ ...(fit ? { height: 280 } : { flex: 1 }), padding: 24, gap: 16, backgroundColor: '#ffffff' }}>
      <Text testID="sheet-title">Harmony Form Sheet: {name}</Text>
      <Button title="Toggle sheet orientation" onPress={() => setLandscape(value => !value)} />
      {name === 'prevent' && <Button title="Allow sheet close" onPress={() => setAllowClose(true)} />}
      <Button title="Reload sheet" onPress={() => reloadAppAsync('A sheet reload')} />
      <Button title="Close sheet" onPress={() => router.back()} />
    </View>
  </>;
}
