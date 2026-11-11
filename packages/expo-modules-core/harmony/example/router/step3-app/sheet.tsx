import { router } from 'expo-router';
import { Button, Text, View } from 'react-native';

export default function Sheet() {
  return (
    <View style={{ flex: 1, padding: 24, gap: 16, backgroundColor: '#ffffff' }}>
      <Text testID="sheet-title">Harmony Form Sheet</Text>
      <Text>Drag between the small and large detents.</Text>
      <Button title="Close sheet" onPress={() => router.back()} />
    </View>
  );
}
