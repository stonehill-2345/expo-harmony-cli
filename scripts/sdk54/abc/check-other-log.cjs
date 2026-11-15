#!/usr/bin/env node
// M4 Other 六项语义重放 checker（C 实现，2026-11-14）。
//
// 输入是独立 run-manifest 绑定的 PID 定向 hilog 原件。本 checker 只解析
// 设备夹具真实输出的结构化标记行，独立重算断言；输入自报的
// semantic.oracle/result 不是依据，缺标记、顺序错乱、值不符、混入
// failure 均判 FAIL。
//
// 标记来源（产品源码固定夹具，随候选源码冻结）：
//   packages/expo-splash-screen/harmony/example/SplashStatusApp.tsx  A04_SPLASH_STATUS
//   packages/expo-system-ui/harmony/example/SystemUIApp.tsx          A04_SYSTEM_UI
//   packages/expo-web-browser/harmony/example/WebBrowserApp.tsx      A04_WEB_BROWSER
//   packages/expo-modules-core/harmony/example/router/RouterProbe.tsx A_ROUTER_*
//   packages/expo-linking/harmony/example/public.tsx                 LANE_B_LINKING_PUBLIC_READY
//
// 用法：node check-other-log.cjs <log> <debug|release> [--reload]
//
// 边界：本 checker 证明日志可承载的事件/状态机语义（标记序列、oracle
// 快照值、身份一致性）。像素级渲染证据（截图、窗口颜色、ArkWeb 页面）
// 属于独立图像校验，不在本文件职责内，也不得用本 PASS 替代。

const fs = require('node:fs');

const file = process.argv[2];
const mode = process.argv[3];
if (!['debug', 'release'].includes(mode)) throw new Error('Expected debug or release');
const reload = process.argv.includes('--reload');
const log = fs.readFileSync(file, 'utf8');
const isDebug = mode === 'debug';

const results = {};
const define = (name, run) => {
  const failures = [];
  const fail = message => failures.push(message);
  try { run(fail); } catch (error) { fail(`checker error: ${error.message}`); }
  results[name] = failures;
};

const parseMarker = marker => {
  const rows = [];
  for (const line of log.split('\n')) {
    const at = line.indexOf(`${marker}=`);
    if (at < 0) continue;
    const payload = line.slice(at + marker.length + 1).trim();
    try { rows.push(JSON.parse(payload)); }
    catch { rows.push({ __malformed: payload }); }
  }
  return rows;
};

// The linking host probe logs "MARKER {json}" with a space separator
// (packages/expo-linking/harmony/example/public.tsx), not "MARKER={json}".
const parseLooseMarker = marker => {
  const rows = [];
  for (const line of log.split('\n')) {
    const at = line.indexOf(marker);
    if (at < 0) continue;
    const brace = line.indexOf('{', at + marker.length);
    if (brace < 0) { rows.push({ __malformed: line.slice(at) }); continue; }
    try { rows.push(JSON.parse(line.slice(brace))); }
    catch { rows.push({ __malformed: line.slice(at) }); }
  }
  return rows;
};

const splash = parseMarker('A04_SPLASH_STATUS');
const systemUi = parseMarker('A04_SYSTEM_UI');
const browser = parseMarker('A04_WEB_BROWSER');
const routerProbe = parseMarker('A_ROUTER_PROBE');
const routerAppState = parseMarker('A_ROUTER_APP_STATE');
const linkingReady = parseLooseMarker('LANE_B_LINKING_PUBLIC_READY');
const coreBoots = [...log.matchAll(/EXPO_CORE_BOOT=([^\n]*)/g)].map(match => {
  try { return JSON.parse(match[1]); } catch { return { __malformed: true }; }
});
const splashFailures = [...splash, ...systemUi, ...browser].filter(row => row.kind === 'failure' || row.__malformed);

// --- M4-A03-splash ---------------------------------------------------------
define('M4-A03-splash', fail => {
  if (!splash.length) return fail('Missing A04_SPLASH_STATUS markers');
  const byBoot = new Map();
  for (const row of splash) {
    if (!byBoot.has(row.boot)) byBoot.set(row.boot, []);
    byBoot.get(row.boot).push(row);
  }
  for (const [boot, rows] of byBoot) {
    const kinds = rows.map(row => row.kind);
    if (rows.some(row => row.dev !== isDebug)) fail(`dev flag differs from ${mode} (boot ${boot})`);
    if (!kinds.includes('boot')) fail(`Missing boot marker (boot ${boot})`);
    if (!kinds.includes('hidden')) fail(`Missing hidden marker (boot ${boot})`);
    const scenario = rows[0]?.scenario;
    if (!['user', 'internal', 'auto'].includes(scenario)) fail(`Unknown scenario: ${String(scenario)}`);
    if (scenario === 'auto') {
      if (kinds.includes('held') || kinds.includes('hide-request')) fail(`auto scenario must not hold splash (boot ${boot})`);
    } else {
      const held = rows.find(row => row.kind === 'held');
      const hideRequest = rows.find(row => row.kind === 'hide-request');
      const hidden = rows.find(row => row.kind === 'hidden');
      if (!held || held.splash?.visible !== true) fail(`held must keep splash visible (boot ${boot})`);
      if (!hideRequest || hideRequest.splash?.visible !== true) fail(`hide-request must still show splash (boot ${boot})`);
      if (!hidden || hidden.splash?.visible !== false) fail(`hidden must clear splash (boot ${boot})`);
      if (!(kinds.indexOf('held') < kinds.indexOf('hide-request') && kinds.indexOf('hide-request') < kinds.indexOf('hidden'))) {
        fail(`held -> hide-request -> hidden order violated (boot ${boot})`);
      }
    }
    const hidden = rows.find(row => row.kind === 'hidden');
    if (hidden && hidden.splash?.visible !== false) fail(`hidden splash state mismatch (boot ${boot})`);
  }
  if (reload) {
    const reloadBoots = splash.filter(row => row.kind === 'reload-request').map(row => row.boot);
    if (!reloadBoots.length) fail('Missing reload-request for splash');
    for (const boot of reloadBoots) {
      const later = splash.slice(splash.findIndex(row => row.boot === boot && row.kind === 'reload-request'))
        .filter(row => row.kind === 'boot');
      if (!later.some(row => row.boot !== boot)) fail(`No new splash boot after reload (boot ${boot})`);
    }
  }
});

// --- M4-A03-status-bar ----------------------------------------------------
const STATUS_PHASES = [
  { name: 'stack-light', color: '#ff223344', light: true },
  { name: 'stack-restore', color: '#ff112233', light: false },
  { name: 'component-hidden', color: null, light: null },
  { name: 'shown', color: '#ff112233', light: false },
  { name: 'imperative-hidden', color: null, light: null },
  { name: 'imperative-shown', color: '#ff445566', light: true },
];
define('M4-A03-status-bar', fail => {
  const stages = splash.filter(row => row.kind === 'stage');
  // The Next button stays disabled until the splash is hidden; a status phase
  // recorded before its boot's hidden marker is not a real user-driven phase.
  for (const stage of stages) {
    const bootRows = splash.filter(row => row.boot === stage.boot);
    const hiddenAt = bootRows.findIndex(row => row.kind === 'hidden');
    const stageAt = bootRows.indexOf(stage);
    if (hiddenAt >= 0 && stageAt < hiddenAt) fail(`Status phase ${stage.name} recorded before splash hidden`);
  }
  const phasesByBoot = new Map();
  for (const stage of stages) {
    if (!phasesByBoot.has(stage.boot)) phasesByBoot.set(stage.boot, new Set());
    phasesByBoot.get(stage.boot).add(stage.name);
  }
  // Reload can exercise splash alone, but partial runs cannot jointly prove status phases.
  if (![...phasesByBoot.values()].some(names => STATUS_PHASES.every(phase => names.has(phase.name)))) {
    const missing = STATUS_PHASES.filter(phase => !stages.some(stage => stage.name === phase.name));
    fail(`Missing status phase: ${missing.map(phase => phase.name).join(', ') || 'complete six-phase sequence within one boot'}`);
  }
  const lastIndexByBoot = new Map();
  for (const stage of stages) {
    const lastIndex = lastIndexByBoot.get(stage.boot) ?? -1;
    const index = STATUS_PHASES.findIndex(entry => entry.name === stage.name);
    if (index < 0) { fail(`Unknown status phase: ${String(stage.name)}`); continue; }
    if (index <= lastIndex) fail(`Status phase out of order: ${stage.name}`);
    lastIndexByBoot.set(stage.boot, index);
    const expected = STATUS_PHASES[index];
    const bars = stage.bars;
    if (!bars || typeof bars !== 'object') { fail(`Missing bars snapshot: ${stage.name}`); continue; }
    if (expected.color === null) {
      if (bars.visibleTopHeight !== 0) fail(`${stage.name} must hide the top bar (got ${String(bars.visibleTopHeight)})`);
    } else {
      if (!(bars.visibleTopHeight > 0)) fail(`${stage.name} must show the top bar`);
      if (String(bars.statusBarColor).toLowerCase() !== expected.color) {
        fail(`${stage.name} color mismatch: ${String(bars.statusBarColor)} != ${expected.color}`);
      }
      if (bars.isStatusBarLightIcon !== expected.light) fail(`${stage.name} icon style mismatch`);
    }
  }
});

// --- M4-A03-system-ui -------------------------------------------------------
// The fixture reports restore as kind 'stage' with name 'restore'
// (SystemUIApp.tsx); its color has no fixed expectation (fresh install or
// persisted restore), only a valid hex from the real getter.
const SYSTEM_UI_STAGES = [
  { name: 'restore' },
  { name: 'solid', color: '#b42318' },
  { name: 'concurrent', color: '#336699' },
  { name: 'dark-reset', color: '#000000', colorScheme: 'dark', lightIcon: true },
  { name: 'light-reset', color: '#ffffff', colorScheme: 'light', lightIcon: false },
  { name: 'persist', color: '#336699' },
];
define('M4-A03-system-ui', fail => {
  if (!systemUi.length) return fail('Missing A04_SYSTEM_UI markers');
  const boots = new Map();
  for (const row of systemUi) {
    if (!boots.has(row.boot)) boots.set(row.boot, []);
    boots.get(row.boot).push(row);
  }
  // Boots iterate in first-seen (log) order; `previous` carries the causal
  // chain: whether the prior boot requested the public reload and the last
  // persisted color a restore boot must reproduce.
  let previous = null;
  for (const [boot, rows] of boots) {
    if (rows.some(row => row.dev !== isDebug)) fail(`dev flag differs from ${mode} (boot ${boot})`);
    if (!rows.some(row => row.kind === 'boot')) fail(`Missing boot marker (boot ${boot})`);
    const restore = rows.find(row => row.kind === 'stage' && row.name === 'restore')
      ?? rows.find(row => row.kind === 'restore');
    if (!restore || !/^#[0-9a-f]{6}$/i.test(String(restore.color ?? ''))) fail(`Missing valid restore color (boot ${boot})`);
    let lastIndex = -1;
    for (const stage of rows.filter(row => row.kind === 'stage')) {
      const index = SYSTEM_UI_STAGES.findIndex(entry => entry.name === stage.name);
      if (index < 0) { fail(`Unknown SystemUI stage: ${String(stage.name)}`); continue; }
      if (index <= lastIndex) fail(`SystemUI stage out of order: ${stage.name}`);
      lastIndex = index;
      const expected = SYSTEM_UI_STAGES[index];
      if (expected.color !== undefined && stage.color !== expected.color) {
        fail(`${stage.name} color mismatch: ${String(stage.color)} != ${expected.color}`);
      }
      if (expected.colorScheme && stage.colorScheme !== expected.colorScheme) fail(`${stage.name} colorScheme mismatch`);
      if (expected.lightIcon !== undefined && stage.bars?.isStatusBarLightIcon !== expected.lightIcon) {
        fail(`${stage.name} icon style mismatch`);
      }
    }
    const stageNames = rows.filter(row => row.kind === 'stage').map(row => row.name);
    const reloadRequested = rows.some(row => row.kind === 'reload-request');
    const hasAllStages = SYSTEM_UI_STAGES.every(entry => stageNames.includes(entry.name));
    // Fixture README: after persist, verify background/foreground, public
    // reload and cold start BEFORE any further setter — the post-reload boot
    // must only restore the persisted color. Only a boot causally preceded by
    // a reload request may skip the full setter sequence.
    if (!hasAllStages && previous?.reloadRequested) {
      if (stageNames.some(name => name !== 'restore')) {
        fail(`Restore-only SystemUI boot contains setter stages (boot ${boot})`);
      }
      const persisted = previous.persistColor;
      if (!persisted) fail(`Causal restore boot without a prior persist stage (boot ${boot})`);
      else if (restore && restore.color !== persisted) {
        fail(`Restore color drifted from the persisted stage (boot ${boot}): ${String(restore.color)} != ${String(persisted)}`);
      }
    } else if (!hasAllStages) {
      for (const entry of SYSTEM_UI_STAGES) {
        if (!stageNames.includes(entry.name)) fail(`Missing SystemUI stage: ${entry.name} (boot ${boot})`);
      }
    }
    // A reload request is only meaningful after the full sequence ran in the
    // same boot; otherwise the old rule silently excused an incomplete boot.
    const persistStage = rows.filter(row => row.kind === 'stage' && row.name === 'persist').at(-1);
    const reloadBeforePersist = rows.some((row, index) => row.kind === 'reload-request' && index <= rows.indexOf(persistStage));
    if (reloadRequested && (!hasAllStages || reloadBeforePersist)) {
      fail(`Reload requested before the full SystemUI stage sequence completed (boot ${boot})`);
    }
    previous = {
      reloadRequested,
      persistColor: persistStage?.color ?? previous?.persistColor ?? null,
    };
  }
  const states = systemUi.filter(row => row.kind === 'app-state').map(row => row.state);
  for (let index = 0; index < states.length - 1; index++) {
    if (states[index] === 'background' && states[index + 1] === 'active') {
      const foreground = systemUi.find(row => row.kind === 'foreground');
      if (!foreground || !/^#[0-9a-f]{6}$/i.test(String(foreground.color ?? ''))) fail('Missing foreground color after returning active');
      const persist = systemUi.filter(row => row.kind === 'stage' && row.name === 'persist').at(-1);
      if (persist && foreground.color !== persist.color) fail('Foreground color drifted from the persisted stage');
      return;
    }
  }
  fail('Missing background -> active transition');
});

// --- M4-A05-browser ---------------------------------------------------------
const BROWSER_BASELINE_CHECKS = ['invalid-url', 'ephemeral-auth', 'dismiss-empty', 'warm-up', 'cool-down', 'may-init', 'custom-tabs', 'web-completion'];
const BROWSER_REJECTIONS = {
  'auth-wrong-redirect': 'ERR_WEB_BROWSER_UNSUPPORTED_SCHEME',
  'load-failure': 'ERR_WEB_BROWSER_LOAD_FAILED',
  'pending-reload-old': 'ERR_WEB_BROWSER_UNAVAILABLE',
};
define('M4-A05-browser', fail => {
  if (!browser.length) return fail('Missing A04_WEB_BROWSER markers');
  const requiredRequests = ['manual-open', 'programmatic-dismiss', 'concurrent',
    'auth-success', 'auth-wrong-redirect', 'load-failure', ...(reload ? ['pending-reload'] : [])];
  for (const name of requiredRequests) {
    if (!browser.some(row => row.kind === 'request' && row.name === name)) fail(`Missing browser request: ${name}`);
  }
  const byBoot = new Map();
  for (const row of browser) {
    if (!byBoot.has(row.boot)) byBoot.set(row.boot, []);
    byBoot.get(row.boot).push(row);
  }
  for (const [boot, rows] of byBoot) {
    if (rows.some(row => row.dev !== isDebug)) fail(`dev flag differs from ${mode} (boot ${boot})`);
    if (!rows.some(row => row.kind === 'boot')) fail(`Missing boot marker (boot ${boot})`);
    const baseline = rows.find(row => row.kind === 'baseline-pass');
    if (!baseline) fail(`Missing baseline-pass (boot ${boot})`);
    else {
      const checks = [...(baseline.checks ?? [])].sort();
      if (JSON.stringify(checks) !== JSON.stringify([...BROWSER_BASELINE_CHECKS].sort())) {
        fail(`baseline checks mismatch: ${JSON.stringify(checks)}`);
      }
      // The baseline runs in the mount effect before any button handler can
      // fire; a baseline recorded after a user request is not the mount pass.
      const baselineAt = rows.indexOf(baseline);
      if (rows.slice(0, baselineAt).some(row => row.kind === 'request' || row.kind === 'rejection')) {
        fail(`baseline-pass must precede all user requests (boot ${boot})`);
      }
    }
    const requests = rows.filter(row => row.kind === 'request').map(row => row.name);
    const settled = rows.filter(row => row.kind === 'result' || row.kind === 'rejection').map(row => row.name);
    // pendingReload() settles its pre-reload promise under the '-old' suffix
    // (WebBrowserApp.tsx pendingReload), so both names close the request.
    const settlementNames = name => name === 'pending-reload' ? ['pending-reload', 'pending-reload-old'] : [name];
    for (const name of requests) {
      if (!settlementNames(name).some(candidate => settled.includes(candidate))) fail(`Request never settled: ${name}`);
    }
    for (const row of rows) {
      if (row.kind === 'rejection') {
        if (typeof row.code !== 'string' || !row.code) fail(`Rejection without code: ${String(row.name)}`);
        const expected = BROWSER_REJECTIONS[row.name];
        if (expected && row.code !== expected) fail(`${row.name} code mismatch: ${String(row.code)} != ${expected}`);
      }
      if (row.kind === 'result' && (row.result === null || typeof row.result !== 'object')) {
        fail(`Result is not an object: ${String(row.name)}`);
      }
      if (row.kind === 'result' && row.name === 'concurrent' && row.result?.second?.type !== 'locked') {
        fail('Concurrent open must reject the second session with locked');
      }
      if (row.kind === 'result' && row.name === 'concurrent' && row.result?.first?.type !== 'dismiss') {
        fail('Concurrent open must keep the first session dismissable');
      }
      if (row.kind === 'result' && row.name === 'programmatic-dismiss'
        && (row.result?.dismissed?.type !== 'dismiss' || row.result?.opened?.type !== 'dismiss')) {
        fail('Programmatic dismiss must return dismiss for both the call and the pending open');
      }
      if (row.kind === 'result' && row.name === 'auth-success') {
        if (row.result?.type !== 'success') fail('Auth session must complete with success');
        // The fixture's redirect constant is lanebbrowser://callback; a success
        // result pointing anywhere else is not the fixture's real callback.
        if (typeof row.result?.url !== 'string' || !row.result.url.startsWith('lanebbrowser://callback')) {
          fail('auth-success must return the real callback url');
        }
      }
      if (row.kind === 'result' && row.name === 'manual-open' && !['cancel', 'dismiss'].includes(row.result?.type)) {
        fail('manual-open must end through a close or dismiss path');
      }
    }
    if (reload && rows.some(row => row.kind === 'reload-request')) {
      const oldSession = rows.find(row => (row.kind === 'rejection' || row.kind === 'result') && row.name === 'pending-reload-old');
      if (!oldSession) fail('Pending session must settle before reload');
    }
  }
  if (reload) {
    const reloadBoots = browser.filter(row => row.kind === 'reload-request').map(row => row.boot);
    if (reloadBoots.length && byBoot.size < 2) fail('No new browser boot after reload');
  }
});

// --- M4-A04-linking-router ---------------------------------------------------
define('M4-A04-linking-router', fail => {
  if (!routerProbe.length) return fail('Missing A_ROUTER_PROBE markers');
  for (const row of routerProbe) {
    if (row.dev !== isDebug) fail(`dev flag differs from ${mode}`);
    if (typeof row.pathname !== 'string') fail('Probe without pathname');
    if (typeof row.boot !== 'string' && typeof row.boot !== 'number') fail('Probe without boot identity');
  }
  if (log.includes('A_ROUTER_RELOAD_ERROR=')) fail('Router reload error present');
  if (!linkingReady.length) fail('Missing LANE_B_LINKING_PUBLIC_READY marker');
  for (const row of routerAppState) {
    if (!row.boot || !row.from || !row.to || !row.at) fail('Malformed app-state event');
  }
  // Router reload is not a standalone Other requirement (it is covered by the
  // V02 navigation cases); when present, it must be followed by a new boot.
  const reloadRequests = [...log.matchAll(/A_ROUTER_RELOAD_REQUEST=([^\n]*)/g)];
  if (reloadRequests.length) {
    const reloaded = new Set(reloadRequests.map(match => match[1]));
    const afterBoots = new Set(routerProbe.filter(row => !reloaded.has(row.boot)).map(row => row.boot));
    if (!afterBoots.size) fail('Router reload produced no new probe boot');
  }
});

// --- M4-A07-package-sync ------------------------------------------------------
define('M4-A07-package-sync', fail => {
  if (!coreBoots.length) fail('Missing EXPO_CORE_BOOT');
  for (const boot of coreBoots) {
    if (boot.__malformed || boot.dev !== isDebug) fail('Core boot malformed or dev mismatch');
  }
  if (!splash.length) fail('expo-splash-screen fixture never loaded');
  if (!systemUi.length) fail('expo-system-ui fixture never loaded');
  if (!browser.length) fail('expo-web-browser fixture never loaded');
  if (!routerProbe.length) fail('expo-router probe never loaded');
  if (!linkingReady.length) fail('expo-linking host never loaded');
  const group = (rows, label) => {
    const boots = new Set(rows.map(row => row.boot));
    // Multiple boots are legitimate only when the fixture itself logged a
    // reload request inside this marker group.
    const requestedReload = rows.some(row => row.kind === 'reload-request');
    if (boots.size > 1 && !requestedReload && !reload) fail(`${label} mixes ${boots.size} boots without a reload request`);
  };
  group(splash, 'A04_SPLASH_STATUS');
  group(systemUi, 'A04_SYSTEM_UI');
  group(browser, 'A04_WEB_BROWSER');
});

// ---------------------------------------------------------------------------
// Any fixture-reported failure or unparsable marker line is a hard rejection
// for the case that fixture belongs to.
if (splashFailures.length) {
  const failureByCase = new Map([['M4-A03-splash', []], ['M4-A03-status-bar', []], ['M4-A03-system-ui', []], ['M4-A05-browser', []]]);
  for (const row of splashFailures) {
    const source = splash.includes(row) ? 'splash' : systemUi.includes(row) ? 'systemUi' : 'browser';
    const targets = source === 'systemUi' ? ['M4-A03-system-ui']
      : source === 'browser' ? ['M4-A05-browser'] : ['M4-A03-splash', 'M4-A03-status-bar'];
    for (const target of targets) failureByCase.get(target).push(JSON.stringify(row));
  }
  for (const [name, extra] of failureByCase) {
    if (!extra.length) continue;
    results[name] = [...(results[name] ?? []), ...extra.map(row => `fixture reported failure/malformed marker: ${row}`)];
  }
}
if (splashFailures.length) {
  for (const row of splashFailures) console.error(`OTHER_FAILURE_MARKER=${JSON.stringify(row)}`);
}
let passed = true;
for (const [name, failures] of Object.entries(results)) {
  const ok = failures.length === 0;
  if (!ok) passed = false;
  for (const failure of failures) console.error(`${name}: ${failure}`);
  console.log(`${name}=${ok ? 'PASS' : 'FAIL'}`);
}
console.log(`OTHER_${mode.toUpperCase()}_RESULT=${passed ? 'PASS' : 'FAIL'}`);
process.exitCode = passed ? 0 : 1;
