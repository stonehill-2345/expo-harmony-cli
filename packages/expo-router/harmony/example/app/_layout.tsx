import { Stack, usePathname, useRootNavigationState } from 'expo-router';
import { useEffect } from 'react';

export default function RootLayout() {
  const pathname = usePathname();
  const state = useRootNavigationState();
  useEffect(() => {
    if (state) console.info('LANE_B_ROUTER_STATE', JSON.stringify({ pathname, state }));
  }, [pathname, state]);
  return <Stack><Stack.Screen name="(tabs)" options={{ headerShown: false }} /></Stack>;
}
