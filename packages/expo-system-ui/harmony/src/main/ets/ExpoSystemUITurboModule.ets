import { preferences } from '@kit.ArkData';
import type { UITurboModuleContext } from '@rnoh/react-native-openharmony';
import { UITurboModule } from '@rnoh/react-native-openharmony';
import {
  isStoredBackgroundColor,
  resolveBackgroundColor,
} from './SystemUIColor';

const PREFERENCES_NAME = 'expo_system_ui';
const BACKGROUND_COLOR_KEY = 'backgroundColor';

export class ExpoSystemUITurboModule extends UITurboModule {
  public static readonly NAME = 'ExpoSystemUI';

  private readonly store: preferences.Preferences;
  private currentColor: string;
  private destroyed = false;

  public constructor(ctx: UITurboModuleContext) {
    super(ctx);
    this.store = preferences.getPreferencesSync(ctx.uiAbilityContext, { name: PREFERENCES_NAME });
    const stored = this.store.getSync(BACKGROUND_COLOR_KEY, '');
    this.currentColor = typeof stored === 'string' && isStoredBackgroundColor(stored)
      ? stored
      : this.defaultColor();
    this.applyToWindow(this.currentColor);
  }

  public async setBackgroundColorAsync(color: number | null): Promise<void> {
    this.assertActive();
    const resolved = resolveBackgroundColor(color, this.ctx.uiAbilityContext.config.colorMode);
    this.applyToWindow(resolved);
    if (color === null) {
      this.store.deleteSync(BACKGROUND_COLOR_KEY);
    } else {
      this.store.putSync(BACKGROUND_COLOR_KEY, resolved);
    }
    await this.store.flush();
    this.assertActive();
    this.currentColor = resolved;
  }

  public async getBackgroundColorAsync(): Promise<string> {
    this.assertActive();
    return this.currentColor;
  }

  public override __onDestroy__(): void {
    this.destroyed = true;
    super.__onDestroy__();
  }

  private defaultColor(): string {
    return resolveBackgroundColor(null, this.ctx.uiAbilityContext.config.colorMode);
  }

  private applyToWindow(color: string): void {
    this.ctx.uiAbilityContext.windowStage.getMainWindowSync().setWindowBackgroundColor(color);
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error('ExpoSystemUI module was destroyed');
  }
}
