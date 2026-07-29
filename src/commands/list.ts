import { COMPAT_TABLE } from '../scanner/compat-table';

/** list 命令：列出 compat-table（鸿蒙兼容表），调试用。*/
export async function list(_args: string[] = []): Promise<void> {
  console.log('compat-table（鸿蒙兼容表）：\n');
  for (const [pkg, entry] of Object.entries(COMPAT_TABLE)) {
    const harmony = entry.harmony ? ` → ${entry.harmony.package}` : '';
    console.log(`  ${pkg.padEnd(40)} ${entry.status.padEnd(14)}${harmony}`);
  }
}
