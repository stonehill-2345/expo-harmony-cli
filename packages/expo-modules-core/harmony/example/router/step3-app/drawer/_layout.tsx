import { Drawer } from 'expo-router/drawer';
export default function Layout() { return <Drawer screenOptions={{ swipeEnabled: true, swipeEdgeWidth: 48 }}><Drawer.Screen name="index" options={{ title: 'Drawer Home' }} /><Drawer.Screen name="second" options={{ title: 'Drawer Second' }} /></Drawer>; }
