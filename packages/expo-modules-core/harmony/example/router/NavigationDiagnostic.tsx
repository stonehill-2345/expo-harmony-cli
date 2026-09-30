// A-owned diagnostic screen, never installed by the normal Router fixture builder.
import React, { useEffect, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, NavigationIndependentTree } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Screen, ScreenStack, ScreenStackItem, ScreenContentWrapper } from 'react-native-screens';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const Native = createNativeStackNavigator();
const modes = ['view', 'screen', 'stack', 'wrapper', 'stack-wrapper', 'stack-item', 'native-stack', 'router'] as const;
type Mode = typeof modes[number];

function Content({ label }: { label: string }) {
  useEffect(() => {
    console.info('A_NAV_MOUNT=' + label);
    return () => console.info('A_NAV_UNMOUNT=' + label);
  }, [label]);
  return <View style={{ flex: 1, backgroundColor: '#e0f2fe' }}
    onLayout={event => console.info('A_NAV_LAYOUT=' + JSON.stringify({ label, ...event.nativeEvent.layout }))}>
    <Text style={{ fontSize: 24, color: '#111827' }}>DIAGNOSTIC CONTENT {label}</Text>
  </View>;
}

function NativeContent() { return <Content label="native-stack" />; }

function Case({ mode }: { mode: Mode }) {
  if (mode === 'view') return <Content label={mode} />;
  if (mode === 'wrapper') return <ScreenContentWrapper style={{ flex: 1 }}><Content label={mode} /></ScreenContentWrapper>;
  if (mode === 'screen') return <Screen enabled activityState={2} style={{ flex: 1 }}><Content label={mode} /></Screen>;
  if (mode === 'stack') return <ScreenStack style={{ flex: 1 }}>
    <Screen enabled isNativeStack activityState={2} style={StyleSheet.absoluteFill}><Content label={mode} /></Screen>
  </ScreenStack>;
  if (mode === 'stack-wrapper') return <ScreenStack style={{ flex: 1 }}>
    <Screen enabled isNativeStack activityState={2} style={StyleSheet.absoluteFill}>
      <ScreenContentWrapper style={{ flex: 1 }}><Content label={mode} /></ScreenContentWrapper>
    </Screen>
  </ScreenStack>;
  if (mode === 'stack-item') return <ScreenStack style={{ flex: 1 }}>
    <ScreenStackItem screenId="diagnostic" activityState={2} stackPresentation="push"
      headerConfig={{ hidden: true }} style={StyleSheet.absoluteFill}><Content label={mode} /></ScreenStackItem>
  </ScreenStack>;
  if (mode === 'native-stack') return <NavigationIndependentTree><NavigationContainer>
    <Native.Navigator screenOptions={{ headerShown: false }}><Native.Screen name="Diagnostic" component={NativeContent} /></Native.Navigator>
  </NavigationContainer></NavigationIndependentTree>;
  return <Stack><Stack.Screen name="(tabs)" options={{ headerShown: false }} /></Stack>;
}

export default function NavigationDiagnostic() {
  const [mode, setMode] = useState<Mode>('view');
  const insets = useSafeAreaInsets();
  return <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
    <Text>A NAV DIAGNOSTIC: {mode}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {modes.map(item => <Button key={item} title={'Test ' + item} onPress={() => {
        console.info('A_NAV_CASE=' + item);
        setMode(item);
      }} />)}
    </View>
    <View style={{ flex: 1 }} onLayout={event => console.info('A_NAV_HOST_LAYOUT=' + JSON.stringify(event.nativeEvent.layout))}>
      <Case key={mode} mode={mode} />
    </View>
  </View>;
}
