import type { AnyThreadTurboModuleContext } from '@rnoh/react-native-openharmony';
import { AnyThreadTurboModule } from '@rnoh/react-native-openharmony';
import fileHash from '@ohos.file.hash';
import fs from '@ohos.file.fs';
import http from '@ohos.net.http';
import cryptoFramework from '@ohos.security.cryptoFramework';
import util from '@ohos.util';

import {
  createCacheFilePath,
  getEmbeddedRawFilePath,
  normalizeFileUri,
  toFileUri,
} from './AssetCache';

export class ExpoAssetTurboModule extends AnyThreadTurboModule {
  public static readonly NAME = 'ExpoAsset';

  private readonly activeRequests = new Map<number, () => void>();
  private readonly temporaryFiles = new Set<string>();
  private nextRequestId = 1;
  private destroyed = false;

  public constructor(ctx: AnyThreadTurboModuleContext) {
    super(ctx);
  }

  public async downloadAsync(url: string, md5Hash: string | null, type: string): Promise<string> {
    this.assertActive();
    if (url.startsWith('file://')) {
      return normalizeFileUri(url);
    }

    try {
      const cacheKey = md5Hash ?? this.md5String(url);
      const cachePath = createCacheFilePath(this.ctx.uiAbilityContext.cacheDir, cacheKey, type);
      const cached = await this.isValidCachedFile(cachePath, md5Hash);
      this.assertActive();
      if (cached) {
        return toFileUri(cachePath);
      }

      const bytes = await this.readSource(url);
      this.assertActive();
      await this.writeAtomically(cachePath, bytes, md5Hash);
      this.assertActive();
      return toFileUri(cachePath);
    } catch (error) {
      throw new Error(`Unable to download asset from ${url}: ${String(error)}`);
    }
  }

  public override __onDestroy__(): void {
    this.destroyed = true;
    this.activeRequests.forEach((cancel) => {
      try {
        cancel();
      } catch (_) {
      }
    });
    this.activeRequests.clear();

    this.temporaryFiles.forEach((path) => {
      try {
        if (fs.accessSync(path)) {
          fs.unlinkSync(path);
        }
      } catch (_) {
      }
    });
    // A pending fs.open may create its file after this hook. Its writer owns
    // final cleanup, so keep the path registered until that finally block runs.
    super.__onDestroy__();
  }

  private assertActive(): void {
    if (this.destroyed) {
      throw new Error('ExpoAsset module was destroyed');
    }
  }

  private async isValidCachedFile(path: string, md5Hash: string | null): Promise<boolean> {
    if (!fs.accessSync(path)) {
      return false;
    }
    if (md5Hash === null) {
      return true;
    }

    try {
      return (await fileHash.hash(path, 'md5')).toLowerCase() === md5Hash.toLowerCase();
    } catch (_) {
      return false;
    }
  }

  private async readSource(url: string): Promise<Uint8Array> {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return this.downloadHttp(url);
    }
    if (url.startsWith('asset://') || url.startsWith('rawfile://') || !this.hasScheme(url)) {
      const rawFilePath = getEmbeddedRawFilePath(url, this.ctx.rnInstance.getAssetsDest());
      return this.ctx.uiAbilityContext.resourceManager.getRawFileContent(rawFilePath);
    }
    throw new Error('Unsupported asset URL scheme');
  }

  private hasScheme(url: string): boolean {
    return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(url);
  }

  private async downloadHttp(url: string): Promise<Uint8Array> {
    const requestId = this.nextRequestId++;
    const request = this.ctx.httpClient.sendRequest(url, {
      method: http.RequestMethod.GET,
      header: {},
      connectTimeout: 30000,
      readTimeout: 30000,
      timeout: 60000,
    });

    // RNOH owns request settlement. Cancel its transport on destruction without
    // injecting a second rejection into the Runtime that is being torn down.
    this.activeRequests.set(requestId, request.cancel);
    try {
      const response = await request.promise.catch((error: Error) => {
        throw new Error(`HTTP request failed: ${String(error)}`);
      });
      this.assertActive();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error(`HTTP ${response.statusCode}`);
      }
      if (typeof response.body === 'string') {
        return util.TextEncoder.create('utf-8').encodeInto(response.body);
      }
      return new Uint8Array(response.body);
    } finally {
      this.activeRequests.delete(requestId);
    }
  }

  private async writeAtomically(
    destinationPath: string,
    bytes: Uint8Array,
    expectedMd5: string | null
  ): Promise<void> {
    const temporaryPath = `${destinationPath}.tmp-${util.generateRandomUUID()}`;
    this.temporaryFiles.add(temporaryPath);
    let file: fs.File | undefined;

    try {
      file = await fs.open(
        temporaryPath,
        fs.OpenMode.WRITE_ONLY | fs.OpenMode.CREATE | fs.OpenMode.TRUNC
      );
      this.assertActive();
      let offset = 0;
      while (offset < bytes.byteLength) {
        this.assertActive();
        const remaining = bytes.buffer.slice(
          bytes.byteOffset + offset,
          bytes.byteOffset + bytes.byteLength
        );
        const written = await fs.write(file.fd, remaining);
        if (written <= 0) {
          throw new Error('Asset file write made no progress');
        }
        offset += written;
      }
      await fs.fsync(file.fd);
      await fs.close(file);
      file = undefined;

      if (expectedMd5 !== null) {
        const actualMd5 = (await fileHash.hash(temporaryPath, 'md5')).toLowerCase();
        if (actualMd5 !== expectedMd5.toLowerCase()) {
          throw new Error(`Asset MD5 mismatch: expected ${expectedMd5}, received ${actualMd5}`);
        }
      }

      this.assertActive();
      await fs.rename(temporaryPath, destinationPath);
      this.temporaryFiles.delete(temporaryPath);
    } finally {
      if (file !== undefined) {
        try {
          await fs.close(file);
        } catch (_) {
        }
      }
      if (this.temporaryFiles.has(temporaryPath)) {
        try {
          if (fs.accessSync(temporaryPath)) {
            await fs.unlink(temporaryPath);
          }
        } catch (_) {
        }
        this.temporaryFiles.delete(temporaryPath);
      }
    }
  }

  private md5String(value: string): string {
    const digest = cryptoFramework.createMd('MD5');
    digest.updateSync({ data: util.TextEncoder.create('utf-8').encodeInto(value) });
    const bytes = digest.digestSync().data;
    let result = '';
    for (let index = 0; index < bytes.length; index += 1) {
      result += bytes[index].toString(16).padStart(2, '0');
    }
    return result;
  }
}
