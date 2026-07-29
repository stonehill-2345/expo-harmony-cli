/**
 * 鸿蒙 bundleName 清洗。
 *
 * 鸿蒙 bundleName（app identifier）规范：反向域名，每段只允许 [A-Za-z0-9_]，
 * 横杠 / 点等非法字符会导致 DevEco 构建校验失败。
 * 例：项目名 my-app → 段 "my-app"（非法）→ 清洗为 my_app → com.example.my_app。
 */

/** 清洗 bundleName 单段：非 [A-Za-z0-9_] 字符 → 下划线。 */
export function sanitizeBundleSegment(slug: string): string {
  return slug.replace(/[^A-Za-z0-9_]/g, '_');
}

/** 构造 bundleName = com.example.<清洗后 slug>。 */
export function buildBundleName(slug: string): string {
  return `com.example.${sanitizeBundleSegment(slug)}`;
}
