import { RNOHPackage, UITurboModule, UITurboModuleContext } from '@rnoh/react-native-openharmony';
class ExpoImageModule extends UITurboModule {
  constructor(ctx: UITurboModuleContext) { super(ctx); }
}
export class ExpoImagePackage extends RNOHPackage {
  getUITurboModuleFactoryByNameMap(): Map<string, (ctx: UITurboModuleContext) => UITurboModule> {
    return new Map<string, (ctx: UITurboModuleContext) => UITurboModule>([
      ['ExpoImage', (ctx: UITurboModuleContext): UITurboModule => new ExpoImageModule(ctx)],
    ]);
  }
}
