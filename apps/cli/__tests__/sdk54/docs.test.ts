import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { injectSdk54Docs } from '../../src/sdk54/docs';

describe('injectSdk54Docs', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-docs-')); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('writes SDK-aware official-command documentation and limits', () => {
    injectSdk54Docs(root, { appName: 'My App', slug: 'my-app', template: 'default', patchSet: 'sdk54-mvp-1', expo: '54.0.37', rnoh: '0.82.30' });
    const files = ['README.md', 'AGENTS.md', 'docs/HARMONY.md', 'docs/PATCHES.md', 'docs/TROUBLESHOOTING.md'];
    const contents = files.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
    expect(contents).toContain('npx expo prebuild --platform harmony');
    expect(contents).toContain('npx expo run:harmony');
    expect(contents).toContain('npx expo start');
    expect(contents).toContain('54.0.37');
    expect(contents).toContain('sdk54-mvp-1');
    expect(contents).toContain('expo-image');
    expect(contents).toContain('单层');
    expect(contents).toContain('ArkWeb');
    for (const forbidden of ['index.harmony.js', 'shims/', 'pnpm start:harmony', 'bundle:harmony', '不要使用 npx expo prebuild']) {
      expect(contents).not.toContain(forbidden);
    }
  });

  it('is byte-idempotent', () => {
    const options = { appName: 'Blank', slug: 'blank', template: 'blank-typescript' as const, patchSet: 'sdk54-mvp-1', expo: '54.0.37', rnoh: '0.82.30' };
    injectSdk54Docs(root, options);
    const first = fs.readFileSync(path.join(root, 'docs/HARMONY.md'), 'utf8');
    injectSdk54Docs(root, options);
    expect(fs.readFileSync(path.join(root, 'docs/HARMONY.md'), 'utf8')).toBe(first);
  });
});
