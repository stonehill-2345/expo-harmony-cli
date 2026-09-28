import webview from '@ohos.web.webview';
import { ExpoWebBrowserController, ExpoWebBrowserSession } from './ExpoWebBrowserController';

@Component
struct BrowserContent {
  @Require controller!: ExpoWebBrowserController;
  @Require session!: ExpoWebBrowserSession;
  private webController: webview.WebviewController = new webview.WebviewController();
  @State private currentUrl: string = '';

  aboutToAppear(): void {
    this.currentUrl = this.session.url;
  }

  build() {
    Column() {
      Row() {
        Text(this.currentUrl)
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .fontColor(this.session.controlsColor)
        Button('Close')
          .fontColor(this.session.controlsColor)
          .backgroundColor(Color.Transparent)
          .onClick(() => this.controller.cancel(this.session.id))
      }
      .width('100%')
      .padding(12)
      .backgroundColor(this.session.toolbarColor)
      Web({ src: this.session.url, controller: this.webController })
        .layoutWeight(1)
        .width('100%')
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(false)
        .mixedMode(MixedMode.None)
        .onPageBegin((event) => { this.currentUrl = event.url; })
        .onLoadIntercept((event) => this.controller.onNavigation(
          this.session.id, event.data.getRequestUrl(), event.data.isMainFrame(),
        ))
        .onErrorReceive((event) => {
          if (event.request.isMainFrame()) {
            this.controller.fail(this.session.id, 'ERR_WEB_BROWSER_LOAD_FAILED', event.error.getErrorInfo());
          }
        })
        .onSslErrorEventReceive((event) => {
          event.handler.handleCancel();
          this.controller.fail(this.session.id, 'ERR_WEB_BROWSER_TLS_FAILED', 'The browser rejected an invalid TLS certificate');
        })
        .onRenderExited(() => {
          this.controller.fail(this.session.id, 'ERR_WEB_BROWSER_RENDER_FAILED', 'The browser renderer exited');
        })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.White)
  }
}

@Component
export struct ExpoWebBrowserView {
  @Require public controller!: ExpoWebBrowserController;
  @State private visible: boolean = false;
  @State private sessions: ExpoWebBrowserSession[] = [];
  private unsubscribe: (() => void) | undefined;

  public aboutToAppear(): void {
    this.unsubscribe = this.controller.attachHost((session) => {
      this.sessions = session ? [session] : [];
      this.visible = session !== undefined;
    }, true);
  }

  public aboutToDisappear(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  @Builder
  private browserContent() {
    ForEach(this.sessions, (session: ExpoWebBrowserSession) => {
      BrowserContent({ controller: this.controller, session })
    }, (session: ExpoWebBrowserSession) => `${session.id}`)
  }

  build() {
    Column() {}
      .width(0)
      .height(0)
      .bindContentCover(this.visible, this.browserContent, {
        modalTransition: ModalTransition.NONE,
        onWillDismiss: (action: DismissContentCoverAction) => {
          const session = this.controller.getSession();
          if (session) this.controller.cancel(session.id);
          action.dismiss();
        },
      })
  }
}
