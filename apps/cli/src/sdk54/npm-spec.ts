// The parser handles scoped aliases, ranges and prereleases without reading digits from package names.
const npa = require('npm-package-arg') as (spec: string) => { type: string; rawSpec: string; subSpec?: { rawSpec: string } };
const semver = require('semver') as { minVersion(range: string): { major: number } | null };

export function expoSdkMajor(spec: unknown): number | undefined {
  if (typeof spec !== 'string') return undefined;
  try {
    const parsed = npa(`expo@${spec}`);
    return semver.minVersion(parsed.type === 'alias' ? parsed.subSpec!.rawSpec : parsed.rawSpec)?.major;
  } catch { return undefined; }
}
