import { Button, Text, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { useDrawerStatus } from '@react-navigation/drawer';
import { useEffect } from 'react';
export default function Page() { const navigation = useNavigation<any>(); const status = useDrawerStatus();
useEffect(() => console.log('STEP3_DRAWER=' + JSON.stringify({ page: 'second', status, dev: __DEV__ })), [status]);
return <View style={{ flex: 1, padding: 24 }}><Text>Drawer Second Content</Text><Button title="Open menu" onPress={() => navigation.openDrawer()} /></View>; }
