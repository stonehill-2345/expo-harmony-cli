import { RNOHPackage } from '@rnoh/react-native-openharmony';
import type { RNPackageContext, UITurboModule, UITurboModuleContext } from '@rnoh/react-native-openharmony';
import { StatusBarOracleTurboModule } from './StatusBarOracleTurboModule';
export class StatusBarOraclePackage extends RNOHPackage {
  public override getUITurboModuleFactoryByNameMap(): Map<string, (ctx: UITurboModuleContext) => UITurboModule | null> {
    return new Map<string, (ctx: UITurboModuleContext) => UITurboModule>().set(StatusBarOracleTurboModule.NAME, (ctx) => new StatusBarOracleTurboModule(ctx));
  }
  public override getDebugName(): string { return 'status-bar-oracle'; }
}
