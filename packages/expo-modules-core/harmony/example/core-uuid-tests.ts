import { uuid } from 'expo-modules-core';

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function rejects(body: () => unknown) {
  let rejected = false;
  try { body(); } catch { rejected = true; }
  check(rejected, 'Invalid namespace unexpectedly accepted');
}

export async function runCoreUuidTests() {
  const results: { name: string; passed: boolean; detail: string }[] = [];
  const test = async (name: string, body: () => void) => {
    try { body(); results.push({ name, passed: true, detail: 'PASS' }); }
    catch (error) { results.push({ name, passed: false, detail: String(error) }); }
  };
  await test('uuid.v4.native-random-format', () => {
    const values = Array.from({ length: 100 }, () => uuid.v4());
    check(new Set(values).size === values.length, 'Repeated UUID v4');
    check(values.every(v => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)), 'Invalid UUID v4');
  });
  await test('uuid.v5.known-vector', () => {
    check(uuid.v5('www.example.com', uuid.namespace.dns) === '2ed6657d-e927-568b-95e1-2665a8aea6a2', 'UUID v5 known vector differs');
  });
  await test('uuid.v5.namespace-array', () => {
    const bytes = [0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8];
    check(uuid.v5('www.example.com', bytes) === uuid.v5('www.example.com', uuid.namespace.dns), 'Namespace array differs');
  });
  await test('uuid.v5.utf8', () => {
    check(uuid.v5('鸿蒙 Expo 🚀', uuid.namespace.dns) === '4ded968f-7589-582d-8fa7-af47d834e0c1', 'UUID v5 UTF-8 encoding differs');
  });
  await test('uuid.v5.empty-name', () => {
    check(uuid.v5('', uuid.namespace.dns) === '4ebd0208-8328-5d69-8c44-ec50939c0967', 'UUID v5 empty input differs');
  });
  await test('uuid.v5.uppercase-namespace', () => {
    check(uuid.v5('www.example.com', uuid.namespace.dns.toUpperCase()) === '2ed6657d-e927-568b-95e1-2665a8aea6a2', 'Uppercase namespace differs');
  });
  await test('uuid.v5.invalid-namespace', () => rejects(() => uuid.v5('test', 'not-a-uuid')));
  await test('uuid.v5.invalid-namespace-length', () => rejects(() => uuid.v5('test', [1, 2, 3])));
  await test('uuid.v5.invalid-namespace-bytes', () => rejects(() => uuid.v5('test', Array(16).fill(256))));
  console.log('EXPO_CORE_UUID_RESULTS=' + JSON.stringify(results));
}
