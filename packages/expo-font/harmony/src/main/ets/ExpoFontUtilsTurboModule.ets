import type { UITurboModuleContext } from '@rnoh/react-native-openharmony';
import { UITurboModule } from '@rnoh/react-native-openharmony';
import fs from '@ohos.file.fs';
import image from '@ohos.multimedia.image';
import util from '@ohos.util';
import text from '@ohos.graphics.text';
import drawing from '@ohos.graphics.drawing';
import type { ExpoFontLoaderTurboModule } from './ExpoFontLoaderTurboModule';

interface RenderOptions {
  fontFamily?: string;
  size?: number;
  color?: number;
}

interface RenderResult {
  uri: string;
  width: number;
  height: number;
  scale: number;
}

export class ExpoFontUtilsTurboModule extends UITurboModule {
  public static readonly NAME = 'ExpoFontUtils';
  private destroyed = false;

  public constructor(ctx: UITurboModuleContext) {
    super(ctx);
  }

  public async renderToImageAsync(glyphs: string, options: RenderOptions): Promise<RenderResult> {
    this.assertActive();
    const size = options.size ?? 24;
    const color = options.color ?? 0xff000000;
    if (typeof glyphs !== 'string' || glyphs.length === 0) throw new Error('Font image text must not be empty');
    if (!Number.isFinite(size) || size <= 0) throw new Error('Font image size must be positive and finite');
    if (options.fontFamily !== undefined && typeof options.fontFamily !== 'string') throw new Error('Invalid font family');
    if (!Number.isInteger(color)) throw new Error('Font image color must be a processed ARGB number');

    const scale = this.ctx.rnInstance.getUIContext().vp2px(1);
    const collection = text.FontCollection.getGlobalInstance();
    const family = options.fontFamily || 'sans-serif';
    const fontPath = options.fontFamily ? this.ctx.rnInstance
      .getTurboModule<ExpoFontLoaderTurboModule>('ExpoFontLoader').getFontPath(family) : undefined;
    const alias = fontPath === undefined ? undefined : `ExpoFontImage-${util.generateRandomUUID()}`;
    const output = `${this.ctx.uiAbilityContext.cacheDir}/ExpoFont-${util.generateRandomUUID()}.png`;
    try {
      if (alias !== undefined && fontPath !== undefined) collection.loadFontSync(alias, `file://${fontPath}`);
      const builder = new text.ParagraphBuilder({}, collection);
      builder.pushStyle({
        fontFamilies: [alias ?? family], fontSize: size * scale,
        color: { red: (color >>> 16) & 255, green: (color >>> 8) & 255,
          blue: color & 255, alpha: color >>> 24 },
      });
      builder.addText(glyphs);
      const paragraph = builder.build();
      paragraph.layoutSync(Number.MAX_SAFE_INTEGER);
      let left = 0;
      let top = 0;
      let right = paragraph.getLongestLine();
      let bottom = paragraph.getHeight();
      const lines = paragraph.getTextLines();
      const metrics = paragraph.getLineMetrics();
      for (let index = 0; index < lines.length; index++) {
        const bounds = lines[index].getImageBounds();
        const line = metrics[index];
        left = Math.min(left, line.left + bounds.left);
        top = Math.min(top, line.baseline - line.ascent);
        right = Math.max(right, line.left + bounds.right);
        bottom = Math.max(bottom, line.baseline + line.descent);
      }
      const width = Math.ceil(right - left);
      const height = Math.ceil(bottom - top);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error('Font image has invalid dimensions');
      }
      const pixels = image.createPixelMapSync({ size: { width, height }, editable: true,
        pixelFormat: image.PixelMapFormat.RGBA_8888, alphaType: image.AlphaType.PREMUL });
      try {
        const canvas = new drawing.Canvas(pixels);
        canvas.clear({ red: 0, green: 0, blue: 0, alpha: 0 });
        paragraph.paint(canvas, -left, -top);
        const packer = image.createImagePacker();
        try {
          const bytes = await packer.packing(pixels, { format: 'image/png', quality: 100 });
          this.assertActive();
          const file = fs.openSync(output, fs.OpenMode.WRITE_ONLY | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
          try {
            let offset = 0;
            while (offset < bytes.byteLength) {
              const written = fs.writeSync(file.fd, bytes.slice(offset));
              if (written <= 0) throw new Error('Font image write made no progress');
              offset += written;
            }
            fs.fsyncSync(file.fd);
          } finally {
            fs.closeSync(file);
          }
        } finally {
          await packer.release();
        }
      } finally {
        await pixels.release();
      }
      this.assertActive();
      return {
        uri: `file://${output.split('/').map(segment => encodeURIComponent(segment)).join('/')}`,
        width: width / scale, height: height / scale, scale,
      };
    } catch (error) {
      if (fs.accessSync(output)) fs.unlinkSync(output);
      throw new Error(`Unable to render font image: ${String(error)}`);
    } finally {
      if (alias !== undefined) collection.unloadFontSync(alias);
    }
  }

  public override __onDestroy__(): void {
    this.destroyed = true;
    super.__onDestroy__();
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error('ExpoFontUtils module was destroyed');
  }
}
