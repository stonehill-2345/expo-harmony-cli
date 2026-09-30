import util from '@ohos.util';
import cryptoFramework from '@ohos.security.cryptoFramework';
import { RNOHPackage, UITurboModule, UITurboModuleContext } from '@rnoh/react-native-openharmony';

export class CoreDirectories {
  cacheDir: string;
  documentsDir: string;
  constructor(cacheDir: string, documentsDir: string) {
    this.cacheDir = cacheDir;
    this.documentsDir = documentsDir;
  }
}

export class CorePlatformError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

// This is Core's own platform backend, not data injected by an application.
export class ExpoModulesCore extends UITurboModule {
  private destroyed: boolean = false;
  private reloadTimer: number | undefined = undefined;
  private finishReload: (() => void) | undefined = undefined;

  private checkAlive(): void {
    if (this.destroyed) throw new CorePlatformError('ERR_CORE_CONTEXT_DESTROYED', 'Expo Core context destroyed');
  }

  __onDestroy__(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.reloadTimer !== undefined) clearTimeout(this.reloadTimer);
    this.reloadTimer = undefined;
    const finish = this.finishReload;
    this.finishReload = undefined;
    if (finish) finish();
  }

  uuidv4(): string {
    this.checkAlive();
    // The platform API specifies a cryptographically secure RFC 4122 v4 UUID.
    return util.generateRandomUUID(false).toLowerCase();
  }

  uuidv5(name: string, namespace: string): string {
    this.checkAlive();
    if (namespace.length !== 36 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(namespace)) {
      throw new CorePlatformError('ERR_INVALID_UUID_NAMESPACE', 'Invalid UUID namespace');
    }
    const hex = namespace.replace(/-/g, '');
    // The platform's legacy encoder can return undefined for empty input.
    // An empty UUID name contributes exactly zero UTF-8 bytes.
    const nameBytes = name.length === 0 ? new Uint8Array(0) : new util.TextEncoder().encodeInto(name);
    const input = new Uint8Array(16 + nameBytes.length);
    for (let i = 0; i < 16; i++) input[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    input.set(nameBytes, 16);
    const md = cryptoFramework.createMd('SHA1');
    md.updateSync({ data: input });
    const bytes = md.digestSync().data;
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let result = '';
    for (let i = 0; i < 16; i++) {
      if (i === 4 || i === 6 || i === 8 || i === 10) result += '-';
      result += bytes[i].toString(16).padStart(2, '0');
    }
    return result;
  }

  async reloadAppAsync(reason: string): Promise<void> {
    this.checkAlive();
    if (this.finishReload) throw new CorePlatformError('ERR_RELOAD_IN_PROGRESS', 'Core reload already requested');
    return new Promise<void>((resolve, reject) => {
      this.finishReload = resolve;
      // RNApp subscribes to this native controller in both Debug and Release.
      // A host that does not actually destroy/recreate this instance must fail,
      // rather than receive a successful no-op Promise.
      this.reloadTimer = setTimeout(() => {
        this.finishReload = undefined;
        this.reloadTimer = undefined;
        reject(new CorePlatformError('ERR_RELOAD_UNAVAILABLE', 'Native host did not accept the reload request'));
      }, 5000);
      try {
        this.ctx.devToolsController.reload(reason);
      } catch (error) {
        if (this.reloadTimer !== undefined) clearTimeout(this.reloadTimer);
        this.reloadTimer = undefined;
        this.finishReload = undefined;
        reject(error);
      }
    });
  }

  getConstants(): CoreDirectories {
    this.checkAlive();
    return new CoreDirectories(this.ctx.uiAbilityContext.cacheDir, this.ctx.uiAbilityContext.filesDir);
  }
}

export class ExpoModulesCorePackage extends RNOHPackage {
  getUITurboModuleFactoryByNameMap(): Map<string, (ctx: UITurboModuleContext) => UITurboModule> {
    return new Map<string, (ctx: UITurboModuleContext) => UITurboModule>([
      ['ExpoModulesCore', (ctx: UITurboModuleContext): UITurboModule => new ExpoModulesCore(ctx)],
    ]);
  }
}
