import type { UITurboModuleContext } from '@rnoh/react-native-openharmony';
import { UITurboModule } from '@rnoh/react-native-openharmony';
import fs from '@ohos.file.fs';
import drawing from '@ohos.graphics.drawing';
import cryptoFramework from '@ohos.security.cryptoFramework';
import util from '@ohos.util';
import type { BusinessError } from '@ohos.base';
import { validateFontRequest, validateSfntFont } from './FontFile';

interface EmbeddedFont {
  family: string;
  resource: string;
  sha256: string;
}

export class ExpoFontLoaderTurboModule extends UITurboModule {
  public static readonly NAME = 'ExpoFontLoader';

  private readonly loadedFonts = new Map<string, string>();
  private destroyed = false;

  public constructor(ctx: UITurboModuleContext) {
    super(ctx);
    this.loadEmbeddedFonts();
  }

  public getLoadedFonts(): string[] {
    return Array.from(this.loadedFonts.keys()).sort();
  }

  public getFontPath(family: string): string | undefined {
    this.assertActive();
    return this.loadedFonts.get(family);
  }

  public async loadAsync(fontFamilyName: string, localUri: string): Promise<void> {
    this.registerFontFile(fontFamilyName, localUri);
  }

  private registerFontFile(fontFamilyName: string, localUri: string): void {
    this.assertActive();
    if (this.loadedFonts.has(fontFamilyName)) return;

    const request = validateFontRequest(fontFamilyName, localUri);
    if (!fs.accessSync(request.path)) {
      throw new Error(`Font file '${request.path}' does not exist`);
    }
    if (fs.statSync(request.path).size <= 0) {
      throw new Error(`Font file '${request.path}' is empty`);
    }

    const file = fs.openSync(request.path, fs.OpenMode.READ_ONLY);
    try {
      const size = fs.statSync(file.fd).size;
      const buffer = new ArrayBuffer(size);
      const read = fs.readSync(file.fd, buffer);
      if (read !== size) throw new Error(`Font file '${request.path}' could not be read completely`);
      validateSfntFont(new Uint8Array(buffer));
    } finally {
      fs.closeSync(file);
    }
    if (!drawing.Typeface.makeFromFile(request.path)) {
      throw new Error(`Font file '${request.path}' could not be decoded`);
    }
    this.ctx.rnInstance.registerFont(request.family, request.path);
    this.assertActive();
    this.loadedFonts.set(request.family, request.path);
  }

  private loadEmbeddedFonts(): void {
    let manifest: Uint8Array;
    try {
      manifest = this.ctx.uiAbilityContext.resourceManager.getRawFileContentSync('expo-font/fonts.json');
    } catch (error) {
      // Devices may return the fixed-path missing-resource code as a string.
      if (String((error as BusinessError).code) === '9001005') return;
      throw new Error(`Cannot read embedded Harmony font manifest: ${String(error)}`);
    }
    const fonts = JSON.parse(util.TextDecoder.create('utf-8', { fatal: true }).decode(manifest)) as EmbeddedFont[];
    if (!Array.isArray(fonts)) throw new Error('Invalid embedded Harmony font manifest');
    const families = new Set<string>();
    for (const font of fonts) {
      if (!font || typeof font.family !== 'string' || !font.family.trim() || families.has(font.family)
        || typeof font.resource !== 'string' || !/^expo-font\/fonts\/[^/\\]+\.(ttf|otf)$/.test(font.resource)
        || typeof font.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(font.sha256)) {
        throw new Error('Invalid or duplicate embedded Harmony font');
      }
      families.add(font.family);
      const bytes = this.ctx.uiAbilityContext.resourceManager.getRawFileContentSync(font.resource);
      validateSfntFont(bytes);
      const digest = cryptoFramework.createMd('SHA256');
      digest.updateSync({ data: bytes });
      const actual = Array.from(digest.digestSync().data).map(value => value.toString(16).padStart(2, '0')).join('');
      if (actual !== font.sha256) throw new Error('Embedded Harmony font hash mismatch');
      const extension = font.resource.endsWith('.otf') ? 'otf' : 'ttf';
      const destination = `${this.ctx.uiAbilityContext.cacheDir}/ExpoEmbeddedFont-${font.sha256}.${extension}`;
      const file = fs.openSync(destination, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      try {
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        if (fs.writeSync(file.fd, buffer) !== bytes.byteLength) throw new Error('Incomplete embedded Harmony font write');
      } finally {
        fs.closeSync(file);
      }
      this.registerFontFile(font.family, `file://${destination.split('/').map(encodeURIComponent).join('/')}`);
    }
  }

  public override __onDestroy__(): void {
    this.destroyed = true;
    this.loadedFonts.clear();
    super.__onDestroy__();
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error('ExpoFontLoader module was destroyed');
  }
}
