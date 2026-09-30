export interface ExpoSplashScreenOptions {
  duration?: number;
  fade?: boolean;
}

export interface ResolvedExpoSplashScreenOptions {
  duration: number;
  fade: boolean;
}

export interface ExpoSplashScreenState {
  runtime: number;
  visible: boolean;
  options: ResolvedExpoSplashScreenOptions;
}

type StateListener = (state: ExpoSplashScreenState) => void;

const DEFAULT_OPTIONS: ResolvedExpoSplashScreenOptions = {
  duration: 400,
  fade: false,
};

export class ExpoSplashScreenController {
  private runtime = 0;
  private visible = true;
  private options: ResolvedExpoSplashScreenOptions = { ...DEFAULT_OPTIONS };
  private preventAutoHideCalled = false;
  private userControlledAutoHideEnabled = false;
  private destroyed = false;
  private readonly listeners = new Set<StateListener>();

  public beginRuntime(): number {
    this.assertActive();
    this.runtime += 1;
    this.visible = true;
    this.options = { ...DEFAULT_OPTIONS };
    this.preventAutoHideCalled = false;
    this.userControlledAutoHideEnabled = false;
    this.notify();
    return this.runtime;
  }

  public getState(): ExpoSplashScreenState {
    return {
      runtime: this.runtime,
      visible: this.visible,
      options: { ...this.options },
    };
  }

  public subscribe(listener: StateListener): () => void {
    this.assertActive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public setOptions(runtime: number, options: ExpoSplashScreenOptions): void {
    this.assertRuntime(runtime);
    const duration = options.duration ?? DEFAULT_OPTIONS.duration;
    const fade = options.fade ?? DEFAULT_OPTIONS.fade;
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) {
      throw new Error('ExpoSplashScreen duration must be a finite non-negative number');
    }
    if (typeof fade !== 'boolean') {
      throw new Error('ExpoSplashScreen fade must be a boolean');
    }
    this.options = { duration, fade };
    this.notify();
  }

  public hide(runtime: number): void {
    this.assertRuntime(runtime);
    if (!this.visible) return;
    this.visible = false;
    this.notify();
  }

  public async hideAsync(runtime: number): Promise<void> {
    this.hide(runtime);
  }

  public async preventAutoHideAsync(runtime: number): Promise<boolean> {
    this.assertRuntime(runtime);
    this.userControlledAutoHideEnabled = true;
    this.preventAutoHideCalled = true;
    return true;
  }

  public async internalPreventAutoHideAsync(runtime: number): Promise<boolean> {
    this.assertRuntime(runtime);
    this.preventAutoHideCalled = true;
    return true;
  }

  public async internalMaybeHideAsync(runtime: number): Promise<void> {
    this.assertRuntime(runtime);
    if (!this.userControlledAutoHideEnabled) this.hide(runtime);
  }

  public onContentAppeared(runtime: number): void {
    if (this.destroyed || runtime !== this.runtime) return;
    if (!this.preventAutoHideCalled) this.hide(runtime);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.visible = false;
    this.notify();
    this.listeners.clear();
    this.destroyed = true;
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error('ExpoSplashScreen controller was destroyed');
  }

  private assertRuntime(runtime: number): void {
    this.assertActive();
    if (runtime !== this.runtime || runtime === 0) {
      throw new Error('ExpoSplashScreen runtime is no longer active');
    }
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }
}
