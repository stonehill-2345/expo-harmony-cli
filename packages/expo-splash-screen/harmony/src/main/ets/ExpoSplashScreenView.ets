import {
  ExpoSplashScreenController,
  ExpoSplashScreenState,
} from './ExpoSplashScreenController';

@Component
export struct ExpoSplashScreenView {
  @Require public controller!: ExpoSplashScreenController;
  @BuilderParam public splashContent: () => void = this.defaultSplashContent;

  @State private rendered: boolean = true;
  @State private splashOpacity: number = 1;
  private animationToken = 0;
  private unsubscribe: (() => void) | undefined = undefined;

  @Builder
  private defaultSplashContent() {
    Column() {}
      .width('100%')
      .height('100%')
      .backgroundColor(Color.White)
  }

  public aboutToAppear(): void {
    this.applyState(this.controller.getState());
    this.unsubscribe = this.controller.subscribe((state) => this.applyState(state));
  }

  public aboutToDisappear(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private applyState(state: ExpoSplashScreenState): void {
    const token = ++this.animationToken;
    if (state.visible) {
      this.rendered = true;
      this.splashOpacity = 1;
      return;
    }

    if (!state.options.fade || state.options.duration === 0) {
      this.splashOpacity = 0;
      this.rendered = false;
      return;
    }

    animateTo({
      duration: state.options.duration,
      curve: Curve.EaseIn,
      onFinish: () => {
        if (token === this.animationToken && !this.controller.getState().visible) {
          this.rendered = false;
        }
      },
    }, () => {
      this.splashOpacity = 0;
    });
  }

  build() {
    if (this.rendered) {
      Stack() {
        this.splashContent()
      }
      .width('100%')
      .height('100%')
      .opacity(this.splashOpacity)
      .hitTestBehavior(HitTestMode.Block)
      .zIndex(2147483647)
    }
  }
}
