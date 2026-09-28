const MIN_SIGNED_32 = -0x80000000;
const MAX_UNSIGNED_32 = 0xffffffff;

export function colorNumberToHex(color: number): string {
  if (!Number.isFinite(color) || Math.floor(color) !== color) {
    throw new Error('System UI background color must be a finite integer');
  }
  if (color < MIN_SIGNED_32 || color > MAX_UNSIGNED_32) {
    throw new Error('System UI background color must fit in 32-bit ARGB');
  }
  return `#${(color >>> 0 & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function resolveBackgroundColor(color: number | null, colorMode: number | undefined): string {
  if (color !== null) return colorNumberToHex(color);
  return colorMode === 0 ? '#000000' : '#ffffff';
}

export function isStoredBackgroundColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/.test(value);
}
