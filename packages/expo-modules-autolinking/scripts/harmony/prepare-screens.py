#!/usr/bin/env python3
"""Build the pinned Screens HAR with its Harmony navigation compatibility fixes."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import tarfile

INPUT_SHA = '133a75df8e05117c79c30b492aa0137c076801f2f82367696eeb8101afce11dd'
SOURCE = 'package/src/main/ets/RNOHScreensPackage.ets'
SOURCE_SHA = 'c17b0ec1419d7ef6f713081bdb5f8bc87a0e11f1d3a41321201054ff6619c488'
SCREEN_SOURCE = 'package/src/main/ets/components/RNSScreen.ets'
SCREEN_SOURCE_SHA = '02e9538780b19677703955b88345b6d20573bd0a26ccd6ad5d265d2600a9107c'
BOTTOM_TABS_SCREEN_SOURCE = 'package/src/main/ets/components/RNSBottomTabsScreen.ets'
BOTTOM_TABS_SCREEN_SOURCE_SHA = '868bee185e12e0df5d547adaa14c80525f849ecb8090c37cdec06fdb8b835565'
CPP_PACKAGE_SOURCE = 'package/src/main/cpp/generated/RNOH/generated/BaseReactNativeScreensPackage.h'
CPP_PACKAGE_SOURCE_SHA = '74f7dab3ca94e72a5b7f2c18ed954d67fbab5bb199c21ef30cc99b44888ef869'
BACK_BEFORE = b'        if (this.from || this.viewTagArr?.length > 0) {'
BACK_AFTER = b'        if ((this.from || this.viewTagArr?.length > 0) &&\n          this.pageId !== RNSScreen.TOP_PAGEID) {'
BOTTOM_TABS_TOUCH_BEFORE = b"      .width('100%')\n      .height('100%')\n      .onAppear(() => {"
BOTTOM_TABS_TOUCH_AFTER = b"      .width('100%')\n      .height('100%')\n      .onTouch((event: TouchEvent) => {\n        this.ctx.rnInstance.postTouchEventMessageToCpp(this.tag, event)\n      })\n      .onAppear(() => {"
BEFORE = b'      .set(RNSScreenStackHeaderConfig.NAME, wrapBuilder(componentBuilder))\n      .set(RNSSearchBar.NAME, wrapBuilder(componentBuilder))'
AFTER = b'      .set(RNSScreenStackHeaderConfig.NAME, wrapBuilder(componentBuilder))\n      .set(RNSScreenContentWrapper.NAME, wrapBuilder(componentBuilder))\n      .set(RNSBottomTabs.NAME, wrapBuilder(componentBuilder))\n      .set(RNSSearchBar.NAME, wrapBuilder(componentBuilder))'
ETS_IMPORT_BEFORE = b'import { RNSScreenContentWrapper } from "./components/RNSScreenContentWrapper";'
ETS_IMPORT_AFTER = ETS_IMPORT_BEFORE + b'\nimport { RNSBottomTabs } from "./components/RNSBottomTabs";'
ETS_BUILDER_BEFORE = b'  } else if (ctx.componentName == RNSScreenContentWrapper.NAME) {\n    RNSScreenContentWrapper({\n      ctx: ctx.rnComponentContext,\n      tag: ctx.tag,\n    })\n  }\n}'
ETS_BUILDER_AFTER = b'  } else if (ctx.componentName == RNSScreenContentWrapper.NAME) {\n    RNSScreenContentWrapper({\n      ctx: ctx.rnComponentContext,\n      tag: ctx.tag,\n    })\n  } else if (ctx.componentName == RNSBottomTabs.NAME) {\n    RNSBottomTabs({\n      ctx: ctx.rnComponentContext,\n      tag: ctx.tag,\n    })\n  }\n}'
CPP_INCLUDE_BEFORE = b'#include "RNOH/generated/components/RNSSearchBarJSIBinder.h"'
CPP_INCLUDE_AFTER = CPP_INCLUDE_BEFORE + b'\n#include "RNOH/generated/components/RNSBottomTabsJSIBinder.h"\n#include "RNOH/generated/components/RNSBottomTabsScreenJSIBinder.h"'
CPP_DESCRIPTOR_BEFORE = b'            facebook::react::concreteComponentDescriptorProvider<facebook::react::RNSSearchBarComponentDescriptor>(),'
CPP_DESCRIPTOR_AFTER = CPP_DESCRIPTOR_BEFORE + b'\n            facebook::react::concreteComponentDescriptorProvider<facebook::react::RNSBottomTabsComponentDescriptor>(),\n            facebook::react::concreteComponentDescriptorProvider<facebook::react::RNSBottomTabsScreenComponentDescriptor>(),'
CPP_BINDER_BEFORE = b'            {"RNSSearchBar", std::make_shared<RNSSearchBarJSIBinder>()},'
CPP_BINDER_AFTER = CPP_BINDER_BEFORE + b'\n            {"RNSBottomTabs", std::make_shared<RNSBottomTabsJSIBinder>()},\n            {"RNSBottomTabsScreen", std::make_shared<RNSBottomTabsScreenJSIBinder>()},'



def patch_sheet(data):
    text = data.decode()
    marker = '  @State sheetAllowedDetents: number[] = [];'
    text = text.replace(marker, '''
  @State sheetVisible: boolean = false;
  @State sheetDetentIndex: number = 0;
  @State sheetGrabberVisible: boolean = false;
  @State sheetCornerRadius: number = -1;
'''+marker)
    start = text.index('        RNViewBase({ ctx: this.ctx, tag: this.tag }) {', text.index('  build() {'))
    end = text.index('\n      }\n      .onAreaChange', start)
    content = text[start:end].replace('          .onAreaChange', "          .onTouch((event: TouchEvent) => {\n            if (this.isFormSheet()) this.ctx.rnInstance.postTouchEventMessageToCpp(this.tag, event);\n          })\n          .onAreaChange", 1)
    content = content.replace(".height('100%')", ".height(this.isFormSheet() && this.sheetAllowedDetents[0] === -1 ? undefined : '100%')")
    text = text[:start] + '''
        if (!this.isFormSheet()) {
          this.screenContent()
        } else {
          Stack() {}.width('100%').height('100%')
        }'''+text[end:]
    methods = '''
  private isFormSheet(): boolean {
    return this.stackPresentationMode === 'formSheet' || this.stackPresentationMode === 'pageSheet';
  }

  private readSheetProps(): void {
    const detents: number[] = this.descriptor.rawProps['sheetAllowedDetents'] ?? [1];
    if (detents.length < 1 || detents.length > 3 || detents.some((n: number, index: number) => !Number.isFinite(n) || (n === -1 ? detents.length !== 1 : n <= 0 || n > 1) || (index > 0 && n < detents[index - 1]))) {
      throw new Error('Harmony sheets require one to three finite detents in (0, 1], or fitToContents');
    }
    const initial: number = this.descriptor.rawProps['sheetInitialDetent'] ?? 0;
    if (!Number.isInteger(initial) || initial < 0 || initial >= detents.length) {
      throw new Error('Invalid Harmony sheetInitialDetent');
    }
    const undimmed: number = this.descriptor.rawProps['sheetLargestUndimmedDetent'] ?? -1;
    if (!Number.isInteger(undimmed) || undimmed < -1 || undimmed >= detents.length) {
      throw new Error('Invalid Harmony sheetLargestUndimmedDetent');
    }
    const radius: number = this.descriptor.rawProps['sheetCornerRadius'] ?? -1;
    const elevation: number = this.descriptor.rawProps['sheetElevation'] ?? 24;
    if (!Number.isFinite(radius) || !Number.isInteger(elevation) || elevation < 0) {
      throw new Error('Invalid Harmony sheetCornerRadius or sheetElevation');
    }
    this.sheetCornerRadius = radius;
    this.sheetElevation = elevation;
    this.sheetAllowedDetents = detents;
    this.sheetInitialDetent = initial;
    if (!this.sheetVisible) this.sheetDetentIndex = initial;
    this.sheetGrabberVisible = this.descriptor.rawProps['sheetGrabberVisible'] ?? false;
    this.sheetLargestUndimmedDetent = undimmed;
  }

  private sheetHeight(index: number): SheetSize | Length {
    const value = this.sheetAllowedDetents[index] ?? 1;
    return value === -1 ? SheetSize.FIT_CONTENT : `${value * 100}%`;
  }

  private sheetOptions(): SheetOptions {
    const heights: [SheetSize | Length, (SheetSize | Length)?, (SheetSize | Length)?] = [this.sheetHeight(this.sheetInitialDetent)];
    for (let index = 0; index < this.sheetAllowedDetents.length; index++) {
      if (index !== this.sheetInitialDetent) heights.push(this.sheetHeight(index));
    }
    return {
      detents: heights,
      dragBar: this.sheetGrabberVisible,
      showClose: false,
      radius: this.sheetCornerRadius < 0 ? undefined : {
        topLeft: this.sheetCornerRadius, topRight: this.sheetCornerRadius,
        bottomLeft: 0, bottomRight: 0,
      },
      shadow: { radius: this.sheetElevation, color: '#33000000', offsetX: 0, offsetY: 0 },
      preferType: SheetType.BOTTOM,
      backgroundColor: this.backgroundColorValue ?? '#ffffff',
      enableOutsideInteractive: this.sheetDetentIndex <= this.sheetLargestUndimmedDetent,
      onDetentsDidChange: async (height: number) => {
        if (!this.sheetVisible) return;
        const currentWindow = await window.getLastWindow(this.ctx.uiAbilityContext);
        if (!this.sheetVisible) return;
        const screenHeight = currentWindow.getWindowProperties().windowRect.height;
        let nearest = 0;
        for (let index = 1; index < this.sheetAllowedDetents.length; index++) {
          if (Math.abs(height - screenHeight * this.sheetAllowedDetents[index]) < Math.abs(height - screenHeight * this.sheetAllowedDetents[nearest])) nearest = index;
        }
        this.sheetDetentIndex = nearest;
        this.eventEmitter?.emit('sheetDetentChanged', { index: nearest, isStable: true });
      },
      shouldDismiss: (action: SheetDismiss) => {
        if (!this.sheetVisible) return;
        if (this.preventNativeDismiss || this.getPreventFlag()) {
          this.eventEmitter?.emit('nativeDismissCancelled', { dismissCount: this.dismissCount });
          return;
        }
        if (!this.gestureEnabled) return;
        action.dismiss();
        this.sheetVisible = false;
        this.backBtnPressed(true);
      },
    };
  }

  @Builder
  screenContent() {
'''+content+'\n  }\n'
    text = text.replace('  build() {', methods+'\n  build() {',1)
    text = text.replace('    this.stackPresentationMode = presentation;', '    this.stackPresentationMode = presentation;\n    if (this.isFormSheet()) this.readSheetProps();')
    text = text.replace('      .hideTitleBar(true)', '      .hideTitleBar(true)\n      .bindSheet($$this.sheetVisible, this.screenContent(), this.sheetOptions())',1)
    text = text.replace('        await this.updateState(true);', '        await this.updateState(true);\n        if (this.isFormSheet()) this.sheetVisible = true;',1)
    text = text.replace('      .onWillDisappear(() => {', '      .onWillDisappear(() => {\n        this.sheetVisible = false;',1)
    text = text.replace('      .backgroundColor(this.backgroundColorValue)', "      .backgroundColor(this.isFormSheet() ? '#00000000' : this.backgroundColorValue)",1)
    text = text.replace('        if (this.gestureEnabled && this.fullScreenSwipeEnabled && !this.isRootStackGesturePopDisallowed()) {', '        if (!this.isFormSheet() && this.gestureEnabled && this.fullScreenSwipeEnabled && !this.isRootStackGesturePopDisallowed()) {',1)
    return text.encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def prepare(source, target):
    original = source.read_bytes()
    if sha(original) != INPUT_SHA:
        raise ValueError('Unsupported Screens HAR: input SHA256 mismatch')
    with tarfile.open(fileobj=io.BytesIO(original), mode='r:gz') as archive:
        data = archive.extractfile(SOURCE).read()
        if sha(data) != SOURCE_SHA:
            raise ValueError('Screens package source SHA256 mismatch')
        if (data.count(BEFORE) != 1 or AFTER in data or
                data.count(ETS_IMPORT_BEFORE) != 1 or ETS_IMPORT_AFTER in data or
                data.count(ETS_BUILDER_BEFORE) != 1 or ETS_BUILDER_AFTER in data):
            raise ValueError('Screens navigation ETS registration source mismatch')
        patched = data.replace(ETS_IMPORT_BEFORE, ETS_IMPORT_AFTER)
        patched = patched.replace(ETS_BUILDER_BEFORE, ETS_BUILDER_AFTER)
        patched = patched.replace(BEFORE, AFTER)
        screen_data = archive.extractfile(SCREEN_SOURCE).read()
        if sha(screen_data) != SCREEN_SOURCE_SHA:
            raise ValueError('Screens RNSScreen source SHA256 mismatch')
        if screen_data.count(BACK_BEFORE) != 1 or BACK_AFTER in screen_data:
            raise ValueError('Screens modal-back source mismatch')
        patched_screen = patch_sheet(screen_data.replace(BACK_BEFORE, BACK_AFTER))
        bottom_tabs_screen_data = archive.extractfile(BOTTOM_TABS_SCREEN_SOURCE).read()
        if sha(bottom_tabs_screen_data) != BOTTOM_TABS_SCREEN_SOURCE_SHA:
            raise ValueError('Screens RNSBottomTabsScreen source SHA256 mismatch')
        if (bottom_tabs_screen_data.count(BOTTOM_TABS_TOUCH_BEFORE) != 1 or
                BOTTOM_TABS_TOUCH_AFTER in bottom_tabs_screen_data):
            raise ValueError('Screens Native Tabs touch-forwarding source mismatch')
        patched_bottom_tabs_screen = bottom_tabs_screen_data.replace(
            BOTTOM_TABS_TOUCH_BEFORE,
            BOTTOM_TABS_TOUCH_AFTER,
        )
        cpp_data = archive.extractfile(CPP_PACKAGE_SOURCE).read()
        if sha(cpp_data) != CPP_PACKAGE_SOURCE_SHA:
            raise ValueError('Screens C++ package source SHA256 mismatch')
        if (cpp_data.count(CPP_INCLUDE_BEFORE) != 1 or CPP_INCLUDE_AFTER in cpp_data or
                cpp_data.count(CPP_DESCRIPTOR_BEFORE) != 1 or CPP_DESCRIPTOR_AFTER in cpp_data or
                cpp_data.count(CPP_BINDER_BEFORE) != 1 or CPP_BINDER_AFTER in cpp_data):
            raise ValueError('Screens Native Tabs C++ registration source mismatch')
        patched_cpp = cpp_data.replace(CPP_INCLUDE_BEFORE, CPP_INCLUDE_AFTER)
        patched_cpp = patched_cpp.replace(CPP_DESCRIPTOR_BEFORE, CPP_DESCRIPTOR_AFTER)
        patched_cpp = patched_cpp.replace(CPP_BINDER_BEFORE, CPP_BINDER_AFTER)
        output = io.BytesIO()
        with gzip.GzipFile(filename='', mode='wb', fileobj=output, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w|') as result:
                for member in archive:
                    payload = archive.extractfile(member) if member.isfile() else None
                    if member.name == SOURCE:
                        member.size = len(patched)
                        payload = io.BytesIO(patched)
                    elif member.name == SCREEN_SOURCE:
                        member.size = len(patched_screen)
                        payload = io.BytesIO(patched_screen)
                    elif member.name == BOTTOM_TABS_SCREEN_SOURCE:
                        member.size = len(patched_bottom_tabs_screen)
                        payload = io.BytesIO(patched_bottom_tabs_screen)
                    elif member.name == CPP_PACKAGE_SOURCE:
                        member.size = len(patched_cpp)
                        payload = io.BytesIO(patched_cpp)
                    result.addfile(member, payload)
    result_bytes = output.getvalue()
    manifest = {
        'profile': 'screens-4.9.0-navigation-sheet-v8',
        'inputSHA256': INPUT_SHA,
        'outputSHA256': sha(result_bytes),
        'source': SOURCE,
        'sourceSHA256': SOURCE_SHA,
        'patchedSourceSHA256': sha(patched),
        'backSource': SCREEN_SOURCE,
        'backSourceSHA256': SCREEN_SOURCE_SHA,
        'patchedBackSourceSHA256': sha(patched_screen),
        'bottomTabsScreenSource': BOTTOM_TABS_SCREEN_SOURCE,
        'bottomTabsScreenSourceSHA256': BOTTOM_TABS_SCREEN_SOURCE_SHA,
        'patchedBottomTabsScreenSourceSHA256': sha(patched_bottom_tabs_screen),
        'cppPackageSource': CPP_PACKAGE_SOURCE,
        'cppPackageSourceSHA256': CPP_PACKAGE_SOURCE_SHA,
        'patchedCppPackageSourceSHA256': sha(patched_cpp),
    }
    record = Path(str(target) + '.manifest.json')
    if target.exists() or record.exists():
        if not target.exists() or not record.exists() or target.read_bytes() != result_bytes or json.loads(record.read_text()) != manifest:
            raise ValueError('Output HAR/manifest conflict; use a fresh output path')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as stream:
            stream.write(result_bytes)
        with record.open('x') as stream:
            stream.write(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-har', type=Path, required=True)
    parser.add_argument('--output-har', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.input_har, args.output_har)
