import type { UITurboModuleContext } from '@rnoh/react-native-openharmony';
import { UITurboModule } from '@rnoh/react-native-openharmony';
import fs from '@ohos.file.fs';
import { validateFontRequest, validateSfntFont } from './FontFile';

export class ExpoFontLoaderTurboModule extends UITurboModule {
  public static readonly NAME = 'ExpoFontLoader';

  private readonly loadedFonts = new Set<string>();
  private destroyed = false;

  public constructor(ctx: UITurboModuleContext) {
    super(ctx);
  }

  public getLoadedFonts(): string[] {
    return Array.from(this.loadedFonts).sort();
  }

  public async loadAsync(fontFamilyName: string, localUri: string): Promise<void> {
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
    this.ctx.rnInstance.registerFont(request.family, request.path);
    this.assertActive();
    this.loadedFonts.add(request.family);
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
