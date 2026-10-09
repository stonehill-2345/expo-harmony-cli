jest.unmock('fs');
jest.unmock('node:fs');
import fs from 'fs';
import os from 'os';
import path from 'path';

import { enableHarmonyMetroForManagedProject } from '../index';

describe(enableHarmonyMetroForManagedProject, () => {
  let root: string;
  const previous = process.env.EXPO_HARMONY_METRO;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-harmony-start-')); delete process.env.EXPO_HARMONY_METRO; });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); if (previous === undefined) delete process.env.EXPO_HARMONY_METRO; else process.env.EXPO_HARMONY_METRO = previous; });

  it.each(['sdk54-package-patch', 'sdk54-scoped-packages'])('enables Harmony Metro for %s managed state', (mode) => {
    fs.mkdirSync(path.join(root, '.expo-harmony'), { recursive: true });
    fs.writeFileSync(path.join(root, '.expo-harmony/managed-state.json'), JSON.stringify({ version: 2, packages: {}, sdk54: { sdk: 'sdk-54', mode } }));
    expect(enableHarmonyMetroForManagedProject(root)).toBe(true);
    expect(process.env.EXPO_HARMONY_METRO).toBe('1');
  });

  it('does not change Metro for legacy, missing, or malformed state', () => {
    for (const value of [undefined, '{ invalid', JSON.stringify({ version: 2, packages: {} })]) {
      fs.rmSync(path.join(root, '.expo-harmony'), { recursive: true, force: true });
      if (value !== undefined) { fs.mkdirSync(path.join(root, '.expo-harmony'), { recursive: true }); fs.writeFileSync(path.join(root, '.expo-harmony/managed-state.json'), value); }
      delete process.env.EXPO_HARMONY_METRO;
      expect(enableHarmonyMetroForManagedProject(root)).toBe(false);
      expect(process.env.EXPO_HARMONY_METRO).toBeUndefined();
    }
  });
});
