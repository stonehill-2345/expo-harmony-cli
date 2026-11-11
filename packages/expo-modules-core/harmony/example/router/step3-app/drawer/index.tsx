import { Button, Text, View } from 'react-native';
import { useNavigation, router } from 'expo-router';
import { useDrawerStatus } from '@react-navigation/drawer';
import { useEffect } from 'react';
export default function Page() { const navigation = useNavigation<any>(); const status = useDrawerStatus();
useEffect(() => console.log('STEP3_DRAWER=' + JSON.stringify({ page: 'home', status, dev: __DEV__ })), [status]);
return <View style={{ flex: 1, padding: 24 }}><Text>Drawer Home Content</Text><Text>Drawer state: {status}</Text><Button title="Open menu" onPress={() => navigation.openDrawer()} /><Button title="Leave Drawer" onPress={() => router.dismiss()} /></View>; }
