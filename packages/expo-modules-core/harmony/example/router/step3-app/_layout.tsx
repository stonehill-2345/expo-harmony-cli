import { RouterProbe } from '../RouterProbe';
import { Stack, usePathname, useRootNavigationState } from 'expo-router';
import { useEffect } from 'react';

export default function RootLayout() {
  const pathname = usePathname();
  const state = useRootNavigationState();
  useEffect(() => {
    if (state) console.info('LANE_B_ROUTER_STATE', JSON.stringify({ pathname, state }));
  }, [pathname, state]);
  return <><RouterProbe /><Stack screenOptions={{ fullScreenGestureEnabled: true, gestureEnabled: true }}><Stack.Screen name="(tabs)" options={{ headerShown: false }} /><Stack.Screen name="drawer" options={{ headerShown: false, fullScreenGestureEnabled: false, gestureEnabled: false }} /><Stack.Screen name="landscape" options={{ orientation: 'landscape' }} /><Stack.Screen name="sheet" options={{ headerShown: false, presentation: 'formSheet', sheetAllowedDetents: [0.35, 0.75], sheetInitialDetentIndex: 0, sheetGrabberVisible: true }} listeners={{ sheetDetentChange: (event) => console.info('A_SHEET_DETENT=' + JSON.stringify(event.data)) }} /></Stack></>;
}
