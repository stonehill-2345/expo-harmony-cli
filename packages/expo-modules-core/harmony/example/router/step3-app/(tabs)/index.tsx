import { Link, router } from 'expo-router';
import { Button, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Home() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: insets.top + 24, gap: 16 }}>
      <Text testID="router-home">Native Tabs Home</Text>
      <Button title="Open Drawer" onPress={() => router.push('/drawer')} />
      <Button title="Open landscape" onPress={() => router.push('/landscape')} />
      <Button title="Sheet contract cases" onPress={() => router.push('/sheet-cases')} />
      <Button title="Open form sheet" onPress={() => router.push('/sheet')} />
      <Link href={{ pathname: '/details/[id]', params: { id: '42', query: '资源 space' } }}>
        Open details 42
      </Link>
      <Button title="Push details 7" onPress={() => router.push('/details/7')} />
      <Link href="/missing-route">Open not-found page</Link>
    </View>
  );
}
