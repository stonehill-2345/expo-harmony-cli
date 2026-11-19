import { RNOHPackage, UITurboModule, UITurboModuleContext } from '@rnoh/react-native-openharmony';
import fs from '@ohos.file.fs';
class ExpoM3AuthorFixture extends UITurboModule {
  constructor(ctx: UITurboModuleContext) { super(ctx); }
}
class M3ReloadMarker extends UITurboModule {
  constructor(ctx: UITurboModuleContext) { super(ctx); }
  private markerPath(): string { return this.ctx.uiAbilityContext.cacheDir + '/expo-m3-reload-pending'; }
  consumePending(): boolean {
    if (!fs.accessSync(this.markerPath())) return false;
    fs.unlinkSync(this.markerPath());
    return true;
  }
  setPending(): void {
    const file = fs.openSync(this.markerPath(), fs.OpenMode.CREATE | fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
    fs.closeSync(file);
  }
}
export class AuthorFixturePackage extends RNOHPackage {
  getUITurboModuleFactoryByNameMap(): Map<string, (ctx: UITurboModuleContext) => UITurboModule> {
    return new Map<string, (ctx: UITurboModuleContext) => UITurboModule>([
      ['ExpoM3AuthorFixture', (ctx: UITurboModuleContext): UITurboModule => new ExpoM3AuthorFixture(ctx)],
      ['M3ReloadMarker', (ctx: UITurboModuleContext): UITurboModule => new M3ReloadMarker(ctx)],
    ]);
  }
}
