import { useState } from 'react';
import { router } from 'expo-router';
import { Button, ScrollView, Text } from 'react-native';
import { sheetCases } from '../SheetCases';

export default function SheetCases() {
  const [presses, setPresses] = useState(0);
  return <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
    <Text>Sheet contract — select an explicit case</Text>
    <Text testID="parent-probe-count">Parent presses: {presses}</Text>
    <Button title="Parent probe" onPress={() => setPresses(value => value + 1)} />
    {Object.keys(sheetCases).map(name => <Button key={name} title={`Sheet ${name}`}
      onPress={() => router.push({ pathname: '/sheet', params: { case: name } })} />)}
    <Button title="Sheet prevent native dismiss" onPress={() => router.push({ pathname: '/sheet', params: { case: 'prevent' } })} />
  </ScrollView>;
}
