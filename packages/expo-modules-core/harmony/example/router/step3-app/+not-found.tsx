import { Link } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFound() {
  return <View><Text testID="router-not-found">Route not found</Text><Link href="/" replace>Home</Link></View>;
}
