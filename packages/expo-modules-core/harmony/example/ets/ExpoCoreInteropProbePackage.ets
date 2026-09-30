import { ExpoModulesCore } from './ExpoModulesCorePackage';
import fs from '@ohos.file.fs';
import {
  RNOHPackage, UITurboModule, UITurboModuleContext,
} from '@rnoh/react-native-openharmony';

class ProbeConstants {
  source: string = 'native-interop-probe';
  cacheDir: string;
  constructor(cacheDir: string) { this.cacheDir = cacheDir; }
}

class DirectoryOracle {
  cacheDir: string;
  documentsDir: string;
  constructor(cacheDir: string, documentsDir: string) {
    this.cacheDir = cacheDir;
    this.documentsDir = documentsDir;
  }
}

class FileRoundTrip {
  value: string;
  removed: boolean;
  constructor(value: string, removed: boolean) { this.value = value; this.removed = removed; }
}

class ProbeError extends Error {
  code: string = 'ERR_CORE_PROBE';
  constructor() { super('Native interop probe failure'); }
}

class ExpoCoreInteropProbe extends UITurboModule {
  private destroyed: boolean = false;

  constructor(ctx: UITurboModuleContext) {
    super(ctx);
    console.info('EXPO_CORE_INTEROP_NATIVE_CREATE=' + ctx.uiAbilityContext.cacheDir);
  }

  private checkAlive(): void {
    if (this.destroyed) throw new Error('Interop probe context destroyed');
  }

  getConstants(): ProbeConstants {
    this.checkAlive();
    return new ProbeConstants(this.ctx.uiAbilityContext.cacheDir);
  }

  async failFromDestroyedCoreAsync(): Promise<void> {
    const retained = new ExpoModulesCore(this.ctx);
    retained.__onDestroy__();
    await retained.reloadAppAsync('Destroyed Core context test');
  }

  checkCoreContextInvalidation(): boolean {
    const retained = new ExpoModulesCore(this.ctx);
    if (retained.getConstants().cacheDir !== this.ctx.uiAbilityContext.cacheDir) return false;
    retained.__onDestroy__();
    try { retained.getConstants(); } catch (error) {
      return (error as Error).message === 'Expo Core context destroyed';
    }
    return false;
  }

  getDirectoryOracle(): DirectoryOracle {
    this.checkAlive();
    return new DirectoryOracle(this.ctx.uiAbilityContext.cacheDir, this.ctx.uiAbilityContext.filesDir);
  }

  roundTripFile(directory: string, value: string): FileRoundTrip {
    this.checkAlive();
    const oracle = this.getDirectoryOracle();
    if (directory !== oracle.cacheDir && directory !== oracle.documentsDir) {
      throw new Error('Probe only writes in the actual application cache/files directory');
    }
    const path = directory + '/expo-core-context-' + Date.now() + '.txt';
    let readBack = '';
    try {
      const file = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
      try { fs.writeSync(file.fd, value); } finally { fs.closeSync(file); }
      readBack = fs.readTextSync(path);
    } finally {
      if (fs.accessSync(path)) fs.unlinkSync(path);
    }
    return new FileRoundTrip(readBack, !fs.accessSync(path));
  }

  echoNullable(value: string | null): string | null {
    this.checkAlive();
    return value;
  }

  async addAsync(a: number, b: number): Promise<number> {
    this.checkAlive();
    return a + b;
  }

  async failAsync(): Promise<void> {
    this.checkAlive();
    const error = new ProbeError();
    console.info('EXPO_CORE_INTEROP_NATIVE_ERROR=' + JSON.stringify({ code: error.code, message: error.message }));
    throw error;
  }

  failStringAsync(): Promise<void> {
    this.checkAlive();
    return Promise.reject<void>('Native string rejection');
  }

  async failUncodedAsync(): Promise<void> {
    this.checkAlive();
    throw new Error('Native uncoded failure');
  }

  failLaterAsync(delayMs: number): Promise<void> {
    this.checkAlive();
    // Deliberately complete after RN reload: no context access or JSI capture.
    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        console.info('EXPO_CORE_INTEROP_NATIVE_LATE_REJECTION destroyed=' + this.destroyed);
        reject(new ProbeError());
      }, delayMs);
    });
  }

  __onDestroy__(): void {
    this.destroyed = true;
    console.info('EXPO_CORE_INTEROP_NATIVE_DESTROY');
  }
}

export class ExpoCoreInteropProbePackage extends RNOHPackage {
  getUITurboModuleFactoryByNameMap(): Map<string, (ctx: UITurboModuleContext) => UITurboModule> {
    return new Map<string, (ctx: UITurboModuleContext) => UITurboModule>([
      ['ExpoCoreInteropProbe', (ctx: UITurboModuleContext): UITurboModule => new ExpoCoreInteropProbe(ctx)],
    ]);
  }
}
