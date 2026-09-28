import url from '@ohos.url';

export interface ExpoWebBrowserOptions {
  toolbarColor?: number | null;
  controlsColor?: number | null;
  preferEphemeralSession?: boolean;
}

export interface ExpoWebBrowserResult {
  type: string;
  url?: string;
}

export interface ExpoWebBrowserSession {
  id: number;
  url: string;
  auth: boolean;
  redirectUrl?: string;
  toolbarColor: number;
  controlsColor: number;
}

export class ExpoWebBrowserError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

type SessionListener = (session: ExpoWebBrowserSession | undefined) => void;

export class ExpoWebBrowserController {
  private runtime = 0;
  private nextId = 0;
  private destroyed = false;
  private session: ExpoWebBrowserSession | undefined;
  private resolve: ((result: ExpoWebBrowserResult) => void) | undefined;
  private reject: ((error: Error) => void) | undefined;
  private readonly listeners = new Set<SessionListener>();

  public beginRuntime(): number {
    this.assertActive();
    this.invalidate();
    return ++this.runtime;
  }

  public endRuntime(runtime: number): void {
    if (runtime !== this.runtime || this.destroyed) return;
    this.invalidate();
    this.runtime++;
  }

  public getSession(): ExpoWebBrowserSession | undefined {
    return this.session;
  }

  public attachHost(listener: SessionListener, deferUpdates: boolean = false): () => void {
    this.assertActive();
    let attached = true;
    let updateToken = 0;
    const notify: SessionListener = (session) => {
      const token = ++updateToken;
      if (!deferUpdates) {
        listener(session);
        return;
      }
      setTimeout(() => {
        if (attached && token === updateToken) listener(session);
      }, 0);
    };
    this.listeners.add(notify);
    notify(this.session);
    return () => {
      attached = false;
      updateToken++;
      this.listeners.delete(notify);
      if (this.listeners.size === 0) this.invalidate();
    };
  }

  public async open(
    runtime: number,
    target: string,
    options: ExpoWebBrowserOptions,
    auth: boolean,
    redirectUrl?: string | null,
  ): Promise<ExpoWebBrowserResult> {
    this.assertRuntime(runtime);
    if (this.session) {
      if (auth) throw new ExpoWebBrowserError('ERR_WEB_BROWSER_ALREADY_OPEN', 'A browser is already open');
      return { type: 'locked' };
    }
    this.validateUrl(target, true);
    if (redirectUrl) this.validateUrl(redirectUrl, false);
    if (auth && options.preferEphemeralSession) {
      throw new ExpoWebBrowserError('ERR_WEB_BROWSER_UNSUPPORTED_OPTION', 'Ephemeral authentication is not supported on Harmony');
    }
    if (this.listeners.size === 0) {
      throw new ExpoWebBrowserError('ERR_WEB_BROWSER_UNAVAILABLE', 'The browser host is no longer available');
    }
    const session: ExpoWebBrowserSession = {
      id: ++this.nextId,
      url: target,
      auth,
      redirectUrl: redirectUrl ?? undefined,
      toolbarColor: options.toolbarColor ?? 0xffffffff,
      controlsColor: options.controlsColor ?? 0xff000000,
    };
    return new Promise<ExpoWebBrowserResult>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      this.session = session;
      try {
        this.notify();
      } catch (error) {
        this.fail(session.id, 'ERR_WEB_BROWSER_PRESENTATION_FAILED', 'Unable to present the browser');
      }
    });
  }

  public dismiss(runtime: number, authOnly: boolean = false): ExpoWebBrowserResult {
    this.assertRuntime(runtime);
    if (authOnly && !this.session?.auth) return { type: 'dismiss' };
    if (!this.session) throw new ExpoWebBrowserError('ERR_WEB_BROWSER_NOT_OPEN', 'No browser is open');
    this.finish({ type: 'dismiss' });
    return { type: 'dismiss' };
  }

  public cancel(id: number): void {
    if (this.session?.id === id) this.finish({ type: 'cancel' });
  }

  public fail(id: number, code: string, message: string): void {
    if (this.session?.id !== id) return;
    const reject = this.reject;
    this.clear();
    reject?.(new ExpoWebBrowserError(code, message));
  }

  // Called only from an actual ArkWeb navigation callback. No synthetic Linking events.
  public onNavigation(id: number, target: string, mainFrame: boolean): boolean {
    const session = this.session;
    if (!session || session.id !== id) return true;
    if (mainFrame && session.auth && session.redirectUrl && this.matchesRedirect(target, session.redirectUrl)) {
      this.finish({ type: 'success', url: target });
      return true;
    }
    if (/^https?:\/\//i.test(target)) return false;
    // Embedded frames cannot complete authentication or launch external applications.
    if (mainFrame) this.fail(id, 'ERR_WEB_BROWSER_UNSUPPORTED_SCHEME', 'The page requested an unsupported URL scheme');
    return true;
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.invalidate();
    this.destroyed = true;
    this.listeners.clear();
  }

  private matchesRedirect(target: string, redirect: string): boolean {
    if (target === redirect) return true;
    if (!target.startsWith(redirect)) return false;
    const next = target.charAt(redirect.length);
    return next === '?' || next === '#' || (next === '&' && redirect.includes('?'));
  }

  private validateUrl(target: string, httpOnly: boolean): void {
    try {
      const parsed = new url.URL(target);
      const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
      if (!parsed.protocol || /\s/.test(target) || (httpOnly && (!isHttp || !parsed.hostname)) ||
        ['javascript:', 'data:', 'file:', 'about:'].includes(parsed.protocol)) {
        throw new Error('Unsupported URL');
      }
    } catch (error) {
      throw new ExpoWebBrowserError('ERR_WEB_BROWSER_INVALID_URL', 'Expected a valid browser or redirect URL');
    }
  }

  private finish(result: ExpoWebBrowserResult): void {
    const resolve = this.resolve;
    this.clear();
    resolve?.(result);
  }

  private clear(): void {
    this.session = undefined;
    this.resolve = undefined;
    this.reject = undefined;
    this.notify();
  }

  private invalidate(): void {
    if (this.session) this.fail(this.session.id, 'ERR_WEB_BROWSER_UNAVAILABLE', 'The browser session is no longer available');
  }

  private assertActive(): void {
    if (this.destroyed) throw new ExpoWebBrowserError('ERR_WEB_BROWSER_UNAVAILABLE', 'The browser Ability is no longer available');
  }

  private assertRuntime(runtime: number): void {
    this.assertActive();
    if (runtime === 0 || runtime !== this.runtime) {
      throw new ExpoWebBrowserError('ERR_WEB_BROWSER_UNAVAILABLE', 'The browser runtime is no longer available');
    }
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this.session));
  }
}
