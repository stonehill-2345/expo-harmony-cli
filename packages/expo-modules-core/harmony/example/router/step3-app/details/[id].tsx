import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Button, Text, View } from 'react-native';

export default function Details() {
  const params = useLocalSearchParams<{ id: string; query?: string }>();
  useEffect(() => { console.info('LANE_B_ROUTER_PARAMS', JSON.stringify(params)); }, [params]);
  return (
    <View style={{ flex: 1, padding: 24, gap: 16 }}>
      <Text testID="router-details">Details: {params.id}</Text>
      <Text testID="router-query">Query: {params.query ?? ''}</Text>
      <Button title="Replace with details 99" onPress={() => router.replace('/details/99')} />
      <Button title="Back" disabled={!router.canGoBack()} onPress={() => router.back()} />
    </View>
  );
}
