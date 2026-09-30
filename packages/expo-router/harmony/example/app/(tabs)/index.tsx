import { Link, router } from 'expo-router';
import { Button, Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={{ flex: 1, padding: 24, gap: 16 }}>
      <Text testID="router-home">Lane B Router Home</Text>
      <Link href={{ pathname: '/details/[id]', params: { id: '42', query: '资源 space' } }}>
        Open details 42
      </Link>
      <Button title="Push details 7" onPress={() => router.push('/details/7')} />
      <Link href="/missing-route">Open not-found page</Link>
    </View>
  );
}
