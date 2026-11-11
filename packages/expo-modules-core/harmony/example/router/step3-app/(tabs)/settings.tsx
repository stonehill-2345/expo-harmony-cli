import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Settings() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: insets.top + 24 }}>
      <Text testID="router-settings">Native Tabs Settings</Text>
    </View>
  );
}
