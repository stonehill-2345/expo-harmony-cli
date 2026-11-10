# SystemUI lifecycle acceptance

Prepare the SDK-owned Core host using `--i0 --status-bar`; this provides the
existing StatusBarOracle to read real system-bar properties. Copy `SystemUIApp.tsx`
to the consumer root, select it in `expo-entry.ts`, and have `index.ts` import
`./expo-entry`. The entire area below the controls is transparent RN/ArkUI content,
so screenshots can inspect the real window background, not a JS-colored proxy.

Capture each stable `A04_SYSTEM_UI=... kind: stage` record and the screenshot:
restore, solid (#b42318), concurrent (#336699 after 16 setters), dark-reset
(#000000), light-reset (#ffffff), persist (#336699). Theme overrides use React
Native Appearance for this application's configuration; they do not change the
device's system theme. Final light mode is explicit for this isolated test app.

At each point compare the public getter with the expected color and actual
background pixels. Dark/light resets must also match the real StatusBarOracle's
icon style. After persist, test foreground/background, public reload and process
cold start before issuing any further setters. Restoration must remain #336699.

The deterministic out-of-order flush and storage/window failure regressions use
host adapters; normal on-device concurrent setters do not force native storage
failures. Do not describe this as full Splash/StatusBar or A-04 acceptance.
