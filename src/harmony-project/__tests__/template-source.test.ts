import { describe, expect, it } from 'vitest';
import { resolveHarmonyTemplateSource } from '../template-source';

describe('resolveHarmonyTemplateSource', () => {
  it('defaults to the bundled HarmonyOS template', () => {
    const resolved = resolveHarmonyTemplateSource();

    expect(resolved.source).toBe('bundled');
    expect(resolved.templateDir).toContain('templates/harmony');
  });

  it('rejects CDN template source in P0 with a clear error', () => {
    expect(() => resolveHarmonyTemplateSource({ source: 'cdn' })).toThrow(
      /CDN Harmony template source is not enabled in P0/,
    );
  });
});
