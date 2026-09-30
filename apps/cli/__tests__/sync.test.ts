import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('../src/harmony-project', () => ({
  syncHarmonyAutolinking: vi.fn(() => ({ linked: ['@react-native-ohos/react-native-webview'] })),
}));
vi.mock('../src/utils/log', () => ({
  log: { step: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const { syncHarmonyAutolinking: mockSyncHarmonyAutolinking } = await import('../src/harmony-project');
const { log } = await import('../src/utils/log');

describe('sync 命令', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-'));
    fs.writeFileSync(path.join(tmp, 'package.json'), '{}');
    process.chdir(tmp);
    mockSyncHarmonyAutolinking.mockClear();
    log.step.mockClear();
    log.success.mockClear();
    log.info.mockClear();
  });

  afterEach(() => {
    process.chdir(__dirname);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('已有 harmony/ 时增量同步并提示 ohpm install', async () => {
    fs.mkdirSync(path.join(tmp, 'harmony'));
    const { sync } = await import('../src/commands/sync');

    await sync([]);

    expect(mockSyncHarmonyAutolinking).toHaveBeenCalledWith(fs.realpathSync(tmp), { force: false });
    expect(log.success).toHaveBeenCalledWith('HarmonyOS 原生注册已同步（1 个包）');
    expect(log.info).toHaveBeenCalledWith('下一步：cd harmony && ohpm install，再在 DevEco Studio 重新构建');
  });

  it('缺少 harmony/ 时提示首次 prebuild', async () => {
    const { sync } = await import('../src/commands/sync');
    await expect(sync([])).rejects.toThrow(/harmony.*prebuild/i);
  });
});
