import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { injectContent } from '../src/content-injector';
import { printTip } from '../src/tips';

describe('injectContent', () => {
  let tmp: string;
  beforeEach(() => (tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cinj-'))));
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('注入用户文档（根 2 + docs/ 3），占位符替换', () => {
    injectContent(tmp, { appName: 'MyApp', slug: 'myapp', bundleName: 'com.example.myapp' });
    for (const doc of ['README.md', 'AGENTS.md']) {
      const c = fs.readFileSync(path.join(tmp, doc), 'utf8');
      expect(c).not.toMatch(/\{\{appName\}\}|\{\{slug\}\}|\{\{bundleName\}\}/);
      expect(c).toContain('MyApp');
    }
    for (const doc of ['HARMONY.md', 'PATCHES.md', 'TROUBLESHOOTING.md']) {
      expect(fs.existsSync(path.join(tmp, 'docs', doc))).toBe(true);
    }
    for (const oldDoc of ['CLAUDE.md', 'HARMONY_DEV_GUIDE.md', 'PATCHES.md', 'docs/PLUGIN_INTEGRATION_GUIDE.md']) {
      expect(fs.existsSync(path.join(tmp, oldDoc))).toBe(false);
    }
  });

  it('I-5: 版本占位符 {{rnohVersion}} / {{expoSdk}} 已替换为 version-matrix 值', () => {
    injectContent(tmp, { appName: 'MyApp', slug: 'myapp', bundleName: 'com.example.myapp' });
    const c = fs.readFileSync(path.join(tmp, 'README.md'), 'utf8');
    // 不应残留任何占位符
    expect(c).not.toMatch(/\{\{rnohVersion\}\}|\{\{expoSdk\}\}/);
    // 应含 version-matrix 的真实值（0.77.71 / sdk-52）
    expect(c).toContain('0.77.71');
    expect(c).toContain('sdk-52');
  });

  it('README 强调依赖和 HarmonyOS 工程必须通过 CLI 管理，并统一 pnpm 命令', () => {
    injectContent(tmp, { appName: 'MyApp', slug: 'myapp', bundleName: 'com.example.myapp' });
    const c = fs.readFileSync(path.join(tmp, 'README.md'), 'utf8');
    expect(c).toContain('依赖和 HarmonyOS 工程必须通过 CLI 管理');
    expect(c).toContain('pnpm dlx expo-harmony-cli install <pkg>');
    expect(c).toContain('pnpm dlx expo-harmony-cli uninstall <pkg>');
    expect(c).toContain('pnpm dlx expo-harmony-cli prebuild --platform harmony');
    expect(c).toContain('pnpm expo run:android');
    expect(c).toContain('pnpm expo run:ios');
    expect(c).not.toContain('npx expo run:android');
    expect(c).not.toMatch(/\bnpm dlx\b/);
  });

  it('对外文档只暴露 expo-harmony-adapter 一个 skill 入口', () => {
    injectContent(tmp, { appName: 'MyApp', slug: 'myapp', bundleName: 'com.example.myapp' });
    const readme = fs.readFileSync(path.join(tmp, 'README.md'), 'utf8');
    const agents = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
    expect(readme).toContain('.agent/skills/expo-harmony-adapter/SKILL.md');
    expect(agents).toContain('.agent/skills/expo-harmony-adapter/SKILL.md');
    expect(readme).not.toContain('harmony-plugin-integration');
    expect(agents).not.toContain('harmony-plugin-integration');
  });

  it('注入 2 skill 到 .agent/skills/', () => {
    injectContent(tmp, { appName: 'X', slug: 'x', bundleName: 'com.x.app' });
    expect(fs.existsSync(path.join(tmp, '.agent/skills/expo-harmony-adapter/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, '.agent/skills/harmony-plugin-integration/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, '.claude'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, '.claude/skills/expo-harmony-adapter/SKILL.md'))).toBe(false);
  });

  it('清理 create-expo-app 或旧 CLI 遗留的 Claude 专属文件', () => {
    fs.mkdirSync(path.join(tmp, '.claude', 'skills', 'legacy'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.claude', 'settings.json'), '{}');
    fs.writeFileSync(path.join(tmp, '.claude', 'skills', 'legacy', 'SKILL.md'), '# legacy');
    fs.writeFileSync(path.join(tmp, 'CLAUDE.md'), '# legacy claude');

    injectContent(tmp, { appName: 'X', slug: 'x', bundleName: 'com.x.app' });

    expect(fs.existsSync(path.join(tmp, 'CLAUDE.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, '.claude'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, '.agent/skills/expo-harmony-adapter/SKILL.md'))).toBe(true);
  });
});

describe('printTip', () => {
  it('create.complete 渲染不抛错', () => {
    expect(() => printTip('create.complete')).not.toThrow();
  });

  it('排障文档说明 HARMONY_METRO_CLEAR 缓存清理', () => {
    const docTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cinj-doc-'));
    injectContent(docTmp, { appName: 'X', slug: 'x', bundleName: 'com.x.app' });
    const troubleshooting = fs.readFileSync(path.join(docTmp, 'docs/TROUBLESHOOTING.md'), 'utf8');
    expect(troubleshooting).toContain('HARMONY_METRO_CLEAR=1 pnpm start:harmony');
    fs.rmSync(docTmp, { recursive: true, force: true });
  });
  it('create.complete 按完成真机验收的依赖顺序输出命令', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    printTip('create.complete', { pm: 'pnpm', projectName: 'my-harmony-app' });
    const output = spy.mock.calls.flat().join('\n');
    expect(output).toContain('cd my-harmony-app && pnpm install');
    expect(output).toContain('pnpm dlx expo-harmony-cli prebuild --platform harmony');
    expect(output).not.toContain('pnpm dlx expo-harmony-cli prebuild --platform harmony --force');
    expect(output).toContain('cd harmony && ohpm install');
    expect(output).toContain('pnpm start:harmony');
    expect(output).toContain('README.md');
    expect(output).toContain('docs/HARMONY.md');
    expect(output.indexOf('pnpm install')).toBeLessThan(output.indexOf('prebuild --platform harmony'));
    expect(output.indexOf('prebuild --platform harmony')).toBeLessThan(output.indexOf('ohpm install'));
    expect(output.indexOf('ohpm install')).toBeLessThan(output.indexOf('pnpm start:harmony'));
    expect(output).not.toContain('npx expo-harmony-cli');
    spy.mockRestore();
  });
  it('未知 key 不抛错（优雅降级）', () => {
    expect(() => printTip('unknown.key')).not.toThrow();
  });
});
