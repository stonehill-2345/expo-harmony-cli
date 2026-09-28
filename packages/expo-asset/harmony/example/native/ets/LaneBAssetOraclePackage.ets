import type {
  AnyThreadTurboModule,
  AnyThreadTurboModuleContext,
} from '@rnoh/react-native-openharmony';
import { RNOHPackage } from '@rnoh/react-native-openharmony';

import { LaneBAssetOracleTurboModule } from './LaneBAssetOracleTurboModule';

export class LaneBAssetOraclePackage extends RNOHPackage {
  public override getAnyThreadTurboModuleFactoryByNameMap(): Map<
    string,
    (ctx: AnyThreadTurboModuleContext) => AnyThreadTurboModule | null
  > {
    return new Map<string, (ctx: AnyThreadTurboModuleContext) => AnyThreadTurboModule>().set(
      LaneBAssetOracleTurboModule.NAME,
      (ctx) => new LaneBAssetOracleTurboModule(ctx)
    );
  }

  public override getDebugName(): string {
    return 'lane-b-asset-oracle';
  }
}
