const MD5_PATTERN = /^[0-9a-f]{32}$/i;
const ASSET_TYPE_PATTERN = /^[A-Za-z0-9_-]*$/;

export function createCacheFilePath(cacheDirectory: string, cacheKey: string, type: string): string {
  if (!cacheDirectory.startsWith('/')) {
    throw new Error('Asset cache directory must be an absolute path');
  }
  if (!MD5_PATTERN.test(cacheKey)) {
    throw new Error('Invalid asset cache key');
  }
  if (!ASSET_TYPE_PATTERN.test(type)) {
    throw new Error('Invalid asset type');
  }

  const normalizedCacheDirectory = cacheDirectory.replace(/\/+$/, '');
  return `${normalizedCacheDirectory}/ExponentAsset-${cacheKey}.${type}`;
}

export function toFileUri(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error('File URI path must be absolute');
  }
  return `file://${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function normalizeFileUri(uri: string): string {
  if (!uri.startsWith('file:///')) {
    throw new Error('Asset file URI must contain an absolute local path');
  }

  try {
    return toFileUri(decodeURIComponent(uri.slice('file://'.length)));
  } catch (error) {
    throw new Error(`Invalid asset file URI: ${String(error)}`);
  }
}

export function getEmbeddedRawFilePath(uri: string, assetsDirectory: string): string {
  let encodedPath: string;
  let prefix: string;
  if (uri.startsWith('asset://')) {
    encodedPath = uri.slice('asset://'.length);
    prefix = assetsDirectory;
  } else if (uri.startsWith('rawfile://')) {
    encodedPath = uri.slice('rawfile://'.length);
    prefix = '';
  } else {
    encodedPath = uri;
    prefix = assetsDirectory;
  }

  let path: string;
  try {
    path = decodeURIComponent(encodedPath);
  } catch (error) {
    throw new Error(`Invalid embedded asset path: ${String(error)}`);
  }

  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, '');
  const normalizedPath = path.replace(/^\/+/, '');
  const segments = normalizedPath.split('/');
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    normalizedPath.length === 0 ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new Error('Invalid embedded asset path');
  }

  return normalizedPrefix.length > 0 ? `${normalizedPrefix}/${normalizedPath}` : normalizedPath;
}
