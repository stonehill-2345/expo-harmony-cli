import { Button, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useEffect } from 'react';
export default function Page() { const {width,height} = useWindowDimensions();
useEffect(() => console.log('STEP3_ROTATION=' + JSON.stringify({ width, height, dev: __DEV__ })), [width,height]);
return <View style={{ flex: 1, padding: 24 }}><Text>Landscape dimensions {width} x {height}</Text><Button title="Return portrait" onPress={() => router.back()} /></View>; }
