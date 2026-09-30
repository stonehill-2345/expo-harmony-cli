const BUNDLE_NAME_PATTERN = /^[a-zA-Z][0-9a-zA-Z_.]+$/;

function isValidBundleName(s: string): boolean {
  return BUNDLE_NAME_PATTERN.test(s) && s.split('.').length === 3;
}

/** spec §2.5 fallback 链：harmony.package > android.package > com.{slug}.app */
export function resolveBundleName(expoConfig: any): string {
  const fromHarmony = expoConfig?.harmony?.package;
  if (typeof fromHarmony === 'string' && isValidBundleName(fromHarmony)) return fromHarmony;

  const fromAndroid = expoConfig?.android?.package;
  if (typeof fromAndroid === 'string' && isValidBundleName(fromAndroid)) return fromAndroid;

  const slug = String(expoConfig?.slug ?? 'app');
  const normalized = slug.replace(/[^a-zA-Z0-9]/g, '_');
  return `com.${normalized}.app`;
}

export function resolveAppName(expoConfig: any): string {
  return String(expoConfig?.name ?? 'app');
}
