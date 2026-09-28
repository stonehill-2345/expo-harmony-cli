export interface FontRequest {
  family: string;
  path: string;
}

export function normalizeFontFileUri(uri: string): string {
  if (!uri.startsWith('file:///')) {
    throw new Error('Font source must be an absolute file URI');
  }
  try {
    const path = decodeURIComponent(uri.slice('file://'.length));
    if (!path.startsWith('/')) {
      throw new Error('Font source must be an absolute file URI');
    }
    return path;
  } catch (error) {
    if (error instanceof Error && error.message === 'Font source must be an absolute file URI') {
      throw error;
    }
    throw new Error(`Invalid font file URI: ${String(error)}`);
  }
}

export function validateFontRequest(family: string, uri: string): FontRequest {
  if (typeof family !== 'string' || family.trim().length === 0) {
    throw new Error('Font family must be a non-empty string');
  }
  return { family, path: normalizeFontFileUri(uri) };
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

export function validateSfntFont(bytes: Uint8Array): void {
  if (bytes.byteLength < 12) throw new Error('Font file is not a valid TTF/OTF sfnt');
  const signature = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (signature === 'ttcf') throw new Error('Font collection files are not supported by Font-v1');
  const isTrueType = bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0;
  if (!isTrueType && !['OTTO', 'true', 'typ1'].includes(signature)) {
    throw new Error('Font file is not a valid TTF/OTF sfnt');
  }
  const tableCount = readUint16(bytes, 4);
  if (tableCount <= 0 || tableCount > 4096 || 12 + tableCount * 16 > bytes.byteLength) {
    throw new Error('Font file has an invalid sfnt table directory');
  }
  for (let index = 0; index < tableCount; index += 1) {
    const record = 12 + index * 16;
    const offset = readUint32(bytes, record + 8);
    const length = readUint32(bytes, record + 12);
    if (offset > bytes.byteLength || length > bytes.byteLength - offset) {
      throw new Error('Font table exceeds the font file bounds');
    }
  }
}
