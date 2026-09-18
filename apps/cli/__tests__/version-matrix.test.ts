import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { detectSdkVersion } from '../src/version-matrix';

describe('detectSdkVersion', () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-detect-')); });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it.each(['dependencies', 'devDependencies'])('%s 中 SDK 53 明确拒绝，不回落到 54', field => {
    for (const expo of ['53.0.0', '~53.0.20', '^53.0.0']) {
      fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ [field]: { expo } }));
      expect(() => detectSdkVersion(tmp)).toThrow(/不支持 Expo SDK 53.*52.*54/);
    }
  });

  it.each([
    ['~52.0.49', 'sdk-52'], ['^54.0.37', 'sdk-54'],
  ])('%s → %s', (expo, sdk) => {
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ dependencies: { expo } }));
    expect(detectSdkVersion(tmp)).toBe(sdk);
  });

  it('缺少或无法读取 expo 版本时保留原有 SDK 54 兜底', () => {
    expect(detectSdkVersion(tmp)).toBe('sdk-54');
    for (const content of ['{}', '{ invalid json']) {
      fs.writeFileSync(path.join(tmp, 'package.json'), content);
      expect(detectSdkVersion(tmp)).toBe('sdk-54');
    }
  });
});
