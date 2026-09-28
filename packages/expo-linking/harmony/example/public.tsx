// Use only with A's accepted Core/Metro build and real ExpoLinking host wiring.
import React, { useEffect } from 'react';
import { Text } from 'react-native';
import * as Linking from 'expo-linking';
import { requireNativeModule } from 'expo-modules-core';

export default function LinkingPublicProbe() {
  const url = Linking.useLinkingURL();
  useEffect(() => {
    const native = requireNativeModule('ExpoLinking');
    console.log('LANE_B_LINKING_PUBLIC_READY', JSON.stringify({
      latest: Linking.getLinkingURL(), nativeLatest: native.getLinkingURL(),
    }));
    Linking.getInitialURL().then((initial) => console.log('LANE_B_LINKING_PUBLIC_INITIAL', initial));
    const subscription = Linking.addEventListener('url', (event) => {
      console.log('LANE_B_LINKING_PUBLIC_EVENT', JSON.stringify(event));
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => { console.log('LANE_B_LINKING_PUBLIC_HOOK', url); }, [url]);
  return <Text>{url ?? 'No incoming URL'}</Text>;
}
