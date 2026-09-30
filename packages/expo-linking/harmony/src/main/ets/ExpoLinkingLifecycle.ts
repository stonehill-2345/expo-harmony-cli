export interface LinkingWant {
  uri?: string;
}

// One instance per UIAbility, retained across RNInstance reloads.
// The host passes real Wants from onCreate/onNewWant, never a synthesized URI.
export class ExpoLinkingLifecycle {
  private url: string | null = null;
  private destroyed = false;
  private readonly listeners = new Set<(url: string) => void>();

  public onCreate(want: LinkingWant): void {
    this.onNewWant(want);
  }

  public onNewWant(want: LinkingWant): void {
    this.assertActive();
    if (!want.uri) return;
    this.url = want.uri;
    this.listeners.forEach((listener) => listener(want.uri!));
  }

  public getLinkingURL(): string | null {
    return this.url;
  }

  public subscribe(listener: (url: string) => void): () => void {
    this.assertActive();
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  public onDestroy(): void {
    this.destroyed = true;
    this.listeners.clear();
    this.url = null;
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error('ExpoLinking Ability lifecycle was destroyed');
  }
}
