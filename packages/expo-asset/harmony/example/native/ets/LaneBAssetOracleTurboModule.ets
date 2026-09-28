import type { AnyThreadTurboModuleContext } from '@rnoh/react-native-openharmony';
import { AnyThreadTurboModule } from '@rnoh/react-native-openharmony';
import fs from '@ohos.file.fs';

export class LaneBAssetOracleTurboModule extends AnyThreadTurboModule {
  public static readonly NAME = 'LaneBAssetOracle';

  public constructor(ctx: AnyThreadTurboModuleContext) {
    super(ctx);
  }

  public readText(fileUri: string): string {
    return fs.readTextSync(this.toPath(fileUri));
  }

  public overwriteText(fileUri: string, text: string): void {
    const path = this.toPath(fileUri);
    const file = fs.openSync(path, fs.OpenMode.WRITE_ONLY | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
    try {
      fs.writeSync(file.fd, text);
      fs.fsyncSync(file.fd);
    } finally {
      fs.closeSync(file);
    }
  }

  public listCache(): string[] {
    return fs.listFileSync(this.ctx.uiAbilityContext.cacheDir).sort();
  }

  public hasReloadMarker(): boolean {
    return fs.accessSync(this.reloadMarkerPath());
  }

  public markReload(): void {
    const file = fs.openSync(
      this.reloadMarkerPath(),
      fs.OpenMode.WRITE_ONLY | fs.OpenMode.CREATE | fs.OpenMode.TRUNC
    );
    fs.closeSync(file);
  }

  private toPath(fileUri: string): string {
    if (!fileUri.startsWith('file:///')) {
      throw new Error('Oracle requires an absolute file URI');
    }
    return decodeURIComponent(fileUri.slice('file://'.length));
  }

  private reloadMarkerPath(): string {
    return `${this.ctx.uiAbilityContext.filesDir}/lane-b-asset-reload-v1`;
  }
}
