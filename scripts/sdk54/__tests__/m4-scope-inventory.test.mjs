import assert from 'node:assert/strict';
import test from 'node:test';
import * as scopeInventory from '../m4-scope-inventory.mjs';
import { applyM4Decisions, buildM4Inventory, collectM4Members, compareM4Sources, mergeM4Membership, seedM4Decisions, validateM4MembershipSource, verifyM4Inventory } from '../m4-scope-inventory.mjs';

const runtime = { apis: [
  { id: 'api:font:default', packageId: 'PKG:expo-font', entryId: 'entry:default', name: 'loadAsync', source: { path: 'font.ts', line: 3 } },
  { id: 'api:font:server', packageId: 'PKG:expo-font', entryId: 'entry:server', name: 'loadAsync', source: { path: 'server.ts', line: 4 } },
  { id: 'api:other', packageId: 'PKG:expo-constants', entryId: 'other', name: 'x' },
], members: [{ id: 'member:font', syntacticPublicEntryIds: ['entry:default'], source: { path: 'font.ts', line: 5 } }] };
const plugins = { plugins: [{ id: 'PLG-FONT', typescript: { options: [{ id: 'option:ts', path: 'fonts', occurrences: [] }] },
  schema: { options: [{ id: 'option:schema', path: 'fonts', occurrences: [] }] } }] };
const publicSurface = { entries: [{ id: 'entry:router', packageId: 'PKG:expo-router', request: 'expo-router', disposition: 'PUBLIC' },
  { id: 'entry:font', packageId: 'PKG:expo-font', request: 'expo-font', disposition: 'PUBLIC' }],
  additionalEntries: [], exports: [{ id: 'router:export', moduleId: 'MODULE:packages/expo-router/src/index.ts',
    name: 'Link', source: { path: 'packages/expo-router/src/index.ts' }, disposition: 'PUBLIC_MODULE_EXPORT' },
  { id: 'core:export', moduleId: 'MODULE:packages/expo-modules-core/src/index.ts', name: 'NativeModule',
    source: { path: 'packages/expo-modules-core/src/index.ts' }, disposition: 'PUBLIC_MODULE_EXPORT' },
  { id: 'font:export', moduleId: 'MODULE:packages/expo-font/src/index.ts', name: 'loadAsync',
    source: { path: 'packages/expo-font/src/index.ts' }, disposition: 'PUBLIC_MODULE_EXPORT' }] };
const pluginContracts = { plugins: [{ id: 'contract:font', packageId: 'PKG:expo-font', sourcePath: 'font-plugin.ts',
  optionContract: { strictExpansion: { options: [{ id: 'contract:font:option', path: 'fonts', occurrences: [] }] } } },
{ id: 'contract:other', packageId: 'PKG:unrelated', optionContract: { strictExpansion: { options: [{ id: 'unrelated' }] } } }] };

test('current additions retain file hashes and every explicit source export', () => {
  assert.equal(typeof scopeInventory.collectM4CurrentAdditions, 'function');
  const file = 'packages/expo-router/_ctx.harmony.js';
  const rows = scopeInventory.collectM4CurrentAdditions(new Map([[file, Buffer.from('export const ctx = 1; export function extra() {}')]]));
  assert.deepEqual(rows.map(row => [row.kind, row.name]), [
    ['current-file', undefined], ['current-export', 'ctx'], ['current-export', 'extra'],
  ]);
  assert.ok(rows.every(row => /^[a-f0-9]{64}$/.test(row.source.sha256)));
  const decisions = seedM4Decisions({ rows });
  assert.deepEqual(decisions, []);
  const reviewed = structuredClone(rows);
  for (const row of reviewed) row.source.sha256 = '48297ecdb3609baccef41fddc56951b76eca9e76e0d6efd27cbfdab2a8b91b2b';
  const reviewedDecisions = seedM4Decisions({ rows: reviewed });
  assert.deepEqual(reviewedDecisions.map(row => row.id), [rows[0].id, rows[1].id]);
  assert.ok(reviewedDecisions.every(row => row.acceptanceId === 'M4-A04'));
  assert.throws(() => scopeInventory.collectM4CurrentAdditions(new Map([[file, Buffer.from('export const = ;')]])), /parse/i);
  assert.throws(() => scopeInventory.collectM4CurrentAdditions(new Map([[file, Buffer.from('module.exports = { hidden: 1 };')]])), /commonjs/i);
  const typedFile = 'packages/expo-modules-core/src/NativeModulesProxy.harmony.ts';
  assert.throws(() => scopeInventory.collectM4CurrentAdditions(new Map([[typedFile, Buffer.from('const value = {}; export = value;')]])), /commonjs/i);
  const inventory = buildM4Inventory({ runtime, plugins, currentAdditions: rows });
  assert.equal(inventory.rows.filter(row => row.kind.startsWith('current-')).length, 3);
  assert.deepEqual(verifyM4Inventory(inventory, { runtime, plugins, currentAdditions: rows }), []);
});

test('current source changes cannot retain previous decisions unnoticed', () => {
  const previous = { rows: [{ id: 'CURRENT-FILE:a', kind: 'current-file', scope: 'M4_REQUIRED', acceptanceId: 'M4-A04', source: { path: 'a', sha256: 'old' } }] };
  const current = structuredClone(previous);
  current.rows[0].source.sha256 = 'new';
  assert.notDeepEqual(scopeInventory.verifyM4DecisionContinuity(previous, current), []);
});

test('current exported function parameters and generics remain individually reviewable', () => {
  const file = 'packages/expo-modules-core/src/NativeViewManagerAdapter.harmony.tsx';
  const source = 'export function requireNativeViewManager<P>(moduleName: string, viewName?: string, unexpected?: boolean): P { throw 0; }';
  const rows = scopeInventory.collectM4CurrentAdditions(new Map([[file, Buffer.from(source)]]));
  const members = rows.filter(row => row.kind === 'current-member');
  assert.deepEqual(members.map(row => row.name), ['P', 'moduleName', 'viewName', 'unexpected']);
  for (const row of rows) row.source.sha256 = '4fded1c68bb9f30ed0e858d28d4e3ab92782718d31e2f8e28da1e3588868cc64';
  const decisions = seedM4Decisions({ rows });
  assert.ok(members.slice(0, 3).every(member => decisions.some(decision => decision.id === member.id && decision.acceptanceId === 'M4-A06')));
  assert.ok(!decisions.some(decision => decision.id === members[3].id));
});

test('current default functions retain parameters and unsupported arrow exports fail closed', () => {
  const file = 'packages/expo-router/_ctx.harmony.js';
  const rows = scopeInventory.collectM4CurrentAdditions(new Map([[file, Buffer.from('export default function (value) { return value; }')]]));
  assert.deepEqual(rows.filter(row => row.kind === 'current-member').map(row => [row.parentName, row.name]), [['default', 'value']]);
  assert.throws(() => scopeInventory.collectM4CurrentAdditions(new Map([[file, Buffer.from('export const ctx = (value) => value;')]])), /function export/i);
  assert.throws(() => scopeInventory.collectM4CurrentAdditions(new Map([[file, Buffer.from('export default (value) => value;')]])), /function export/i);
});

test('preserves separate entries, reachable members and both option sources as undecided', () => {
  const result = buildM4Inventory({ runtime, plugins });
  assert.deepEqual(result.rows.map(row => row.id), ['api:font:default', 'api:font:server', 'member:font', 'option:schema', 'option:ts']);
  assert.ok(result.rows.every(row => row.scope === 'UNDECIDED' && row.acceptance === 'NOT_RUN'));
  assert.equal(result.complete, false);
  assert.deepEqual(verifyM4Inventory(result, { runtime, plugins }), []);
});

test('includes final Router and Core source dispositions without claiming runtime acceptance', () => {
  const result = buildM4Inventory({ runtime, plugins, publicSurface });
  assert.deepEqual(result.rows.filter(row => row.kind.startsWith('public-')).map(row => row.id),
    ['core:export', 'entry:font', 'entry:router', 'font:export', 'router:export']);
  assert.ok(result.rows.filter(row => row.kind.startsWith('public-')).every(row => row.scope === 'UNDECIDED'));
  assert.deepEqual(verifyM4Inventory(result, { runtime, plugins, publicSurface }), []);
});

test('includes final plugin contract option identities without merging earlier evidence', () => {
  const result = buildM4Inventory({ runtime, plugins, pluginContracts });
  const row = result.rows.find(item => item.id === 'contract:font:option');
  assert.ok(row, 'Missing final plugin option');
  assert.equal(row.kind, 'contract-option');
  assert.equal(row.scope, 'UNDECIDED');
  assert.ok(result.rows.some(item => item.id === 'option:ts'));
  assert.ok(!result.rows.some(item => item.id === 'unrelated'));
  assert.deepEqual(verifyM4Inventory(result, { runtime, plugins, pluginContracts }), []);
});

test('rejects omitted, duplicate, fabricated and prematurely completed entries', () => {
  const result = buildM4Inventory({ runtime, plugins });
  for (const change of [
    value => value.rows.pop(),
    value => value.rows.push(value.rows[0]),
    value => { value.rows[0].id = 'invented'; },
    value => { value.complete = true; },
    value => { value.limitations = []; },
    value => { value.schemaVersion = 2; },
  ]) {
    const altered = structuredClone(result); change(altered);
    assert.notDeepEqual(verifyM4Inventory(altered, { runtime, plugins }), []);
  }
});

test('scope decisions require real source IDs and complete acceptance or transfer details', () => {
  const inventory = buildM4Inventory({ runtime, plugins });
  const result = applyM4Decisions(inventory, [{ id: 'api:font:default', scope: 'M4_REQUIRED', acceptanceId: 'M4-A01' },
    { id: 'api:font:server', scope: 'M7_TRANSFER', batch: 'M7.2', dependencyId: 'PKG:expo-font', target: 'Verify server font behavior' }]);
  assert.equal(result.ready, false);
  assert.equal(result.rows.find(row => row.id === 'api:font:default').scope, 'M4_REQUIRED');
  assert.equal(result.rows.find(row => row.id === 'api:font:server').batch, 'M7.2');
  assert.throws(() => applyM4Decisions(result, [{ id: 'api:font:default', scope: 'M7_TRANSFER',
    batch: 'M7.2', dependencyId: 'PKG:expo-font', target: 'Changed after acceptance' }]));
  for (const decisions of [
    [{ id: 'missing', scope: 'M4_REQUIRED', acceptanceId: 'M4-A01' }],
    [{ id: 'api:font:default', scope: 'M4_REQUIRED', acceptanceId: 'M4-A99' }],
    [{ id: 'api:font:default', scope: 'M7_TRANSFER', batch: 'M7.2', dependencyId: '', target: '' }],
    [{ id: 'api:font:default', scope: 'M4_REQUIRED', acceptanceId: 'M4-A01' }, { id: 'api:font:default', scope: 'M4_REQUIRED', acceptanceId: 'M4-A01' }],
  ]) assert.throws(() => applyM4Decisions(inventory, decisions));
});

test('preserves prior decisions across snapshots while allowing undecided records to be resolved', () => {
  assert.equal(typeof scopeInventory.verifyM4DecisionContinuity, 'function');
  const { verifyM4DecisionContinuity } = scopeInventory;
  const previous = applyM4Decisions(buildM4Inventory({ runtime, plugins }), [
    { id: 'api:font:default', scope: 'M4_REQUIRED', acceptanceId: 'M4-A01' },
    { id: 'api:font:server', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-font', target: 'Verify server behavior' },
  ]);
  const next = applyM4Decisions(previous, [{ id: 'option:ts', scope: 'M4_REQUIRED', acceptanceId: 'M4-A01' }]);
  assert.deepEqual(verifyM4DecisionContinuity(previous, next), []);
  for (const mutate of [
    rows => { rows.find(r => r.id === 'api:font:default').scope = 'M7_TRANSFER'; },
    rows => { rows.find(r => r.id === 'api:font:server').target = 'Different target'; },
    rows => { rows.splice(rows.findIndex(r => r.id === 'api:font:default'), 1); },
    rows => { rows.push(structuredClone(rows[0])); },
  ]) {
    const altered = structuredClone(next); mutate(altered.rows);
    assert.notDeepEqual(verifyM4DecisionContinuity(previous, altered), []);
  }
  assert.notDeepEqual(verifyM4DecisionContinuity({ ...previous, inputs: [{ sha256: 'old' }] },
    { ...next, inputs: [{ sha256: 'new' }] }), []);
});

test('seed decisions select only explicitly required base APIs and shared plugin options', () => {
  const rows = [
    { id: 'a', kind: 'api', packageId: 'PKG:expo-font', name: 'loadAsync', entryId: 'ENTRY:expo-font#%2Fmain:base' },
    { id: 'b', kind: 'api', packageId: 'PKG:expo-font', name: 'loadAsync', entryId: 'ENTRY:expo-font#%2Fexports%2F.%2Freact-server:base' },
    { id: 'c', kind: 'api', packageId: 'PKG:expo-asset', name: 'loadAsync', entryId: 'ENTRY:expo-asset#%2Fmain:base' },
    { id: 'd', kind: 'plugin-option', pluginId: 'PLG-FONT', name: 'fonts' },
    { id: 'e', kind: 'plugin-option', pluginId: 'PLG-FONT', name: 'android.fonts' },
    { id: 'f', kind: 'public-export', moduleId: 'MODULE:packages/expo-router/src/native-tabs/NativeTabs.tsx', source: { path: 'packages/expo-router/src/native-tabs/NativeTabs.tsx' } },
    { id: 'g', kind: 'public-export', moduleId: 'MODULE:packages/expo-router/src/tabs.tsx', source: { path: 'packages/expo-router/src/tabs.tsx' } },
    { id: 'h', kind: 'api', packageId: 'PKG:expo-font', name: 'RenderToImageOptions', entryId: 'ENTRY:expo-font#%2Fmain:base' },
    { id: 'i', kind: 'member', name: 'RenderToImageOptions.color', source: { path: 'packages/expo-font/src/FontUtils.types.ts' } },
    { id: 'j', kind: 'api', packageId: 'PKG:expo-font', name: 'unloadAsync', entryId: 'ENTRY:expo-font#%2Fmain:base' },
    { id: 'k', kind: 'member', name: 'FontResource.uri', source: { path: 'packages/expo-font/src/Font.types.ts' } },
    { id: 'l', kind: 'member', name: 'FontResource.display', source: { path: 'packages/expo-font/src/Font.types.ts' } },
    { id: 'm', kind: 'public-export', name: 'Stack', source: { path: 'packages/expo-router/src/index.tsx' } },
    { id: 'n', kind: 'public-export', name: 'LinkPreview', source: { path: 'packages/expo-router/src/index.tsx' } },
    { id: 'o', kind: 'contract-option', packageId: 'PKG:expo-font', sourcePath: 'packages/expo-font/plugin/src/withFonts.ts', name: 'fonts' },
    { id: 'p', kind: 'contract-option', packageId: 'PKG:expo-font', sourcePath: 'packages/expo-font/plugin/src/withFontsAndroid.ts', name: 'fonts' },
    { id: 'q', kind: 'api', packageId: 'PKG:expo-linking', name: 'ParsedURL', entryId: 'ENTRY:expo-linking#%2Fmain:base' },
    { id: 'r', kind: 'member', name: 'Asset.fromModule', source: { path: 'packages/expo-asset/src/Asset.ts' } },
    { id: 's', kind: 'member', name: 'Asset.fromModule', source: { path: 'packages/expo-asset/src/Asset.server.ts' } },
    { id: 't', kind: 'public-export', name: 'loadAsync', moduleId: 'MODULE:packages/expo-font/src/Font.ts', disposition: 'PUBLIC_MODULE_EXPORT', source: { path: 'packages/expo-font/src/Font.ts' } },
    { id: 'u', kind: 'public-export', name: 'loadAsync', moduleId: 'MODULE:packages/expo-font/src/Font.server.ts', disposition: 'PUBLIC_MODULE_EXPORT', source: { path: 'packages/expo-font/src/Font.server.ts' } },
    { id: 'v', kind: 'api', packageId: 'PKG:expo-status-bar', name: 'setStatusBarTranslucent', entryId: 'ENTRY:expo-status-bar#%2Fmain:base' },
    { id: 'w', kind: 'member', name: 'StatusBarProps.translucent', source: { path: 'packages/expo-status-bar/src/StatusBar.tsx' } },
    { id: 'x', kind: 'api', packageId: 'PKG:expo-font', name: 'getServerResources', entryId: 'ENTRY:expo-font#%2Fexports%2F.~1build~1server:base' },
    { id: 'y', kind: 'api', packageId: 'PKG:expo-status-bar', name: 'StatusBar', entryId: 'ENTRY:expo-status-bar#%2Fmain:android' },
    { id: 'z', kind: 'public-export', name: 'SharedObject', source: { path: 'packages/expo-modules-core/src/SharedObject.ts' } },
    { id: 'zz', kind: 'public-export', name: 'SharedObject', source: { path: 'packages/expo-modules-core/src/SharedObject.web.ts' } },
    { id: 'zzz', kind: 'public-member-candidate', reachability: 'CONTEXT_ONLY', capabilityIds: [], membershipId: 'membership:zzz' },
    { id: 'zzza', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path: 'packages/expo-router/src/native-tabs/Tabs.tsx' }] },
    { id: 'zzzb', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path: 'packages/expo-router/src/native-tabs/Tabs.tsx' }, { path: 'packages/expo-router/src/Link.tsx' }] },
    { id: 'zzzc', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path: 'packages/expo-modules-core/src/ts-declarations/EventEmitter.ts' }] },
    { id: 'zzzd', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path: 'packages/expo-modules-core/src/ts-declarations/EventEmitter.ts' }, { path: 'packages/expo-router/src/Link.tsx' }] },
    { id: 'zzze', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path: 'packages/expo-router/src/getLinkingConfig.ts' }] },
    { id: 'zzzf', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path: 'packages/expo-router/src/rsc/server.ts' }] },
    { id: 'zzzg', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path: 'packages/expo-router/src/rsc/server.ts' }, { path: 'packages/expo-router/src/getLinkingConfig.ts' }] },
    { id: 'zzzh', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path: 'packages/expo-router/src/fork/getStateFromPath-forks.ts' }] },
    { id: 'zzzi', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path: 'packages/expo-modules-core/src/errors/CodedError.ts' }] },
    { id: 'zzzj', kind: 'api', packageId: 'PKG:expo-web-browser', name: 'openAuthSessionAsync', entryId: 'ENTRY:expo-web-browser#%2Fmain:base' },
    { id: 'zzzk', kind: 'api', packageId: 'PKG:expo-web-browser', name: 'warmUpAsync', entryId: 'ENTRY:expo-web-browser#%2Fmain:base' },
    { id: 'zzzl', kind: 'public-export', source: { path: 'packages/expo-router/src/ui/TabSlot.tsx' } },
    { id: 'zzzm', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path: 'packages/expo-router/src/typed-routes/types.ts' }] },
    { id: 'zzzn', kind: 'public-export', name: 'default', source: { path: 'packages/expo-modules-core/src/NativeModulesProxy.native.ts' } },
    { id: 'zzzo', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path: 'packages/expo-modules-core/src/PermissionsInterface.ts' }] },
    { id: 'zzzp', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path: 'packages/expo-modules-core/src/PermissionsInterface.ts' }, { path: 'packages/expo-modules-core/src/EventEmitter.ts' }] },
    { id: 'zzzq', kind: 'public-export', name: 'warmUpAsync', moduleId: 'MODULE:packages/expo-web-browser/src/WebBrowser.ts', disposition: 'PUBLIC_MODULE_EXPORT', source: { path: 'packages/expo-web-browser/src/WebBrowser.ts' } },
    { id: 'zzzr', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path: 'packages/expo-router/src/link/Link.tsx' }] },
    { id: 'zzzs', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path: 'packages/expo-router/src/link/preview/HrefPreview.tsx' }] },
    { id: 'zzzt', kind: 'public-export', name: 'Link', source: { path: 'packages/expo-router/src/link/Link.tsx' } },
    { id: 'zzzu', kind: 'member', name: 'WebBrowserOpenOptions.toolbarColor', source: { path: 'packages/expo-web-browser/src/WebBrowser.types.ts' } },
    { id: 'zzzv', kind: 'member', name: 'WebBrowserOpenOptions.windowName', source: { path: 'packages/expo-web-browser/src/WebBrowser.types.ts' } },
    { id: 'zzzw', kind: 'public-entry', packageId: 'PKG:expo-font', name: 'expo-font' },
    { id: 'zzzx', kind: 'public-entry', packageId: 'PKG:unrelated', name: 'unrelated' },
    { id: 'zzzy', kind: 'plugin-option', pluginId: 'PLG-ROUTER', name: 'headOrigin' },
    { id: 'zzzz', kind: 'contract-option', packageId: 'PKG:expo-router', sourcePath: 'packages/expo-router/plugin/src/index.ts', name: 'root' },
    { id: 'zzzzz', kind: 'api', packageId: 'PKG:expo-splash-screen', name: 'hide', entryId: 'ENTRY:expo-splash-screen#%2Fmain:native' },
    { id: 'zzzzza', kind: 'api', packageId: 'PKG:expo-linking', name: 'sendIntent', entryId: 'ENTRY:expo-linking#%2Fmain:base' },
    { id: 'zzzzzb', kind: 'api', packageId: 'PKG:expo-linking', name: 'openSettings', entryId: 'ENTRY:expo-linking#%2Fmain:base' },
    { id: 'zzzzzc', kind: 'member', name: 'Asset.fromModule', source: { path: 'packages/expo-asset/src/Asset.server.ts' } },
    { id: 'zzzzzd', kind: 'member', name: 'setBackgroundColorAsync.color', source: { path: 'packages/expo-system-ui/src/SystemUI.ts' } },
    { id: 'zzzzze', kind: 'plugin-option', pluginId: 'PLG-SPLASH', name: 'enableFullScreenImage_legacy' },
    { id: 'zzzzzf', kind: 'plugin-option', pluginId: 'PLG-WEB-BROWSER', name: 'experimentalLauncherActivity' },
    { id: 'zzzzzg', kind: 'public-export', moduleId: 'MODULE:packages/expo-linking/src/Linking.server.ts', name: 'parse', source: { path: 'packages/expo-linking/src/Linking.server.ts' } },
    { id: 'zzzzzh', kind: 'public-export', moduleId: 'MODULE:packages/expo-status-bar/src/StatusBar.android.tsx', name: 'StatusBar', source: { path: 'packages/expo-status-bar/src/StatusBar.android.tsx' } },
    { id: 'zzzzzi', kind: 'public-export', name: 'helper', disposition: 'IMPLEMENTATION_MODULE_EXPORT', source: { path: 'packages/expo-router/src/private.ts' } },
    { id: 'zzzzzj', kind: 'public-export', name: 'api', disposition: 'PUBLIC_MODULE_EXPORT', source: { path: 'packages/expo-router/src/unknown.ts' } },
  ];
  assert.deepEqual(seedM4Decisions({ rows }), [
    { id: 'a', scope: 'M4_REQUIRED', acceptanceId: 'M4-A01' },
    { id: 'b', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-font', target: 'Verify server-specific export behavior and consumer selection' },
    { id: 'd', scope: 'M4_REQUIRED', acceptanceId: 'M4-A01' },
    { id: 'e', scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-font', target: 'Verify platform-specific plugin option behavior or explicit unavailability' },
    { id: 'f', scope: 'M7_TRANSFER', batch: 'M7.4', dependencyId: 'PKG:expo-router', target: 'Verify Native Tabs navigation, properties, events and lifecycle on Harmony devices' },
    { id: 'h', scope: 'M4_REQUIRED', acceptanceId: 'M4-A01' },
    { id: 'i', scope: 'M4_REQUIRED', acceptanceId: 'M4-A01' },
    { id: 'j', scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-font', target: 'Verify platform-specific font API behavior or explicit unavailability' },
    { id: 'k', scope: 'M4_REQUIRED', acceptanceId: 'M4-A01' },
    { id: 'l', scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-font', target: 'Verify platform-specific font API behavior or explicit unavailability' },
    { id: 'm', scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
    { id: 'n', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router', target: 'Verify additional Router public APIs, types and their consumer behavior' },
    { id: 'o', scope: 'M4_REQUIRED', acceptanceId: 'M4-A01' },
    { id: 'p', scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-font', target: 'Verify platform-specific plugin option behavior or explicit unavailability' },
    { id: 'q', scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
    { id: 'r', scope: 'M4_REQUIRED', acceptanceId: 'M4-A02' },
    { id: 's', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-asset', target: 'Verify server-specific export behavior and consumer selection' },
    { id: 't', scope: 'M4_REQUIRED', acceptanceId: 'M4-A01' },
    { id: 'u', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-font', target: 'Verify server-specific export behavior and consumer selection' },
    { id: 'v', scope: 'M4_REQUIRED', acceptanceId: 'M4-A03' },
    { id: 'w', scope: 'M4_REQUIRED', acceptanceId: 'M4-A03' },
    { id: 'x', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-font', target: 'Verify server-specific export behavior and consumer selection' },
    { id: 'y', scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-status-bar', target: 'Verify platform-specific API behavior or explicit unavailability' },
    { id: 'z', scope: 'M4_REQUIRED', acceptanceId: 'M4-A06' },
    { id: 'zzz', scope: 'SOURCE_CONTEXT', membershipId: 'membership:zzz' },
    { id: 'zzza', scope: 'M7_TRANSFER', batch: 'M7.4', dependencyId: 'PKG:expo-router', target: 'Verify Native Tabs navigation, properties, events and lifecycle on Harmony devices' },
    { id: 'zzzc', scope: 'M4_REQUIRED', acceptanceId: 'M4-A06' },
    { id: 'zzze', scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
    { id: 'zzzf', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router', target: 'Verify server, web or testing-library exports and their consumer selection' },
    { id: 'zzzh', scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
    { id: 'zzzi', scope: 'M4_REQUIRED', acceptanceId: 'M4-A06' },
    { id: 'zzzj', scope: 'M4_REQUIRED', acceptanceId: 'M4-A05' },
    { id: 'zzzk', scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-web-browser', target: 'Verify platform-specific browser services or explicit unavailability' },
    { id: 'zzzl', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router', target: 'Verify additional Router public APIs, types and their consumer behavior' },
    { id: 'zzzm', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router', target: 'Verify additional Router public APIs, types and their consumer behavior' },
    { id: 'zzzn', scope: 'M4_REQUIRED', acceptanceId: 'M4-A06' },
    { id: 'zzzo', scope: 'M7_TRANSFER', batch: 'M7.3', dependencyId: 'PKG:expo-modules-core', target: 'Verify permissions, denial, revocation and lifecycle behavior' },
    { id: 'zzzq', scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-web-browser', target: 'Verify platform-specific browser services or explicit unavailability' },
    { id: 'zzzr', scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
    { id: 'zzzs', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router', target: 'Verify additional Router public APIs, types and their consumer behavior' },
    { id: 'zzzt', scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
    { id: 'zzzu', scope: 'M4_REQUIRED', acceptanceId: 'M4-A05' },
    { id: 'zzzv', scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-web-browser', target: 'Verify platform-specific browser options or explicit unavailability' },
    { id: 'zzzw', scope: 'M4_REQUIRED', acceptanceId: 'M4-A07' },
    { id: 'zzzy', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router', target: 'Verify Router plugin option schema, types and generated behavior' },
    { id: 'zzzz', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router', target: 'Verify Router plugin option schema, types and generated behavior' },
    { id: 'zzzzz', scope: 'M4_REQUIRED', acceptanceId: 'M4-A03' },
    { id: 'zzzzza', scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-linking', target: 'Verify platform-specific API behavior or explicit unavailability' },
    { id: 'zzzzzb', scope: 'M7_TRANSFER', batch: 'M7.3', dependencyId: 'PKG:expo-linking', target: 'Verify system settings availability and failure behavior' },
    { id: 'zzzzzc', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-asset', target: 'Verify server-specific export behavior and consumer selection' },
    { id: 'zzzzzd', scope: 'M4_REQUIRED', acceptanceId: 'M4-A03' },
    { id: 'zzzzze', scope: 'M4_REQUIRED', acceptanceId: 'M4-A03' },
    { id: 'zzzzzf', scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-web-browser', target: 'Verify platform-specific plugin option behavior or explicit unavailability' },
    { id: 'zzzzzg', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-linking', target: 'Verify server-specific export behavior and consumer selection' },
    { id: 'zzzzzh', scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-status-bar', target: 'Verify platform-specific API behavior or explicit unavailability' },
    { id: 'zzzzzi', scope: 'SOURCE_CONTEXT', sourceDisposition: 'IMPLEMENTATION_MODULE_EXPORT' },
  ]);
});

test('classifies only reviewed Router navigation exports as M4 requirements', () => {
  const path = 'packages/expo-router/src/global-state/routing.ts';
  const rows = ['navigate', 'goBack', 'canGoBack', 'linkTo', 'reload', 'prefetch', 'unknown'].map(name => ({
    id: name, kind: 'public-export', name, disposition: 'PUBLIC_MODULE_EXPORT', source: { path },
  }));
  assert.deepEqual(seedM4Decisions({ rows }), [
    ...['navigate', 'goBack', 'canGoBack', 'linkTo'].map(id => ({ id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' })),
    ...['reload', 'prefetch'].map(id => ({ id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
      target: 'Verify additional Router public APIs, types and their consumer behavior' })),
  ]);
});

test('classifies reviewed Router re-exports consistently with the root entry', () => {
  const paths = ['packages/expo-router/src/index.tsx', 'packages/expo-router/src/exports.ts'];
  const rows = paths.flatMap(path => ['Link', 'router', 'useRouter', 'LinkPreview', 'unknown'].map(name => ({
    id: `${path}#${name}`, kind: 'public-export', name, disposition: 'PUBLIC_MODULE_EXPORT', source: { path },
  })));
  assert.deepEqual(seedM4Decisions({ rows }), paths.flatMap(path => [
    ...['Link', 'router', 'useRouter'].map(name => ({ id: `${path}#${name}`, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' })),
    { id: `${path}#LinkPreview`, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
      target: 'Verify additional Router public APIs, types and their consumer behavior' },
  ]));
});

test('classifies reviewed Router hook and type origins without assigning extra APIs', () => {
  const rows = [
    ['hooks.ts', 'useRouter'], ['hooks.ts', 'usePathname'], ['hooks.ts', 'useSearchParams'],
    ['hooks.ts', 'useUnstableGlobalHref'], ['types.ts', 'Href'], ['types.ts', 'RouteParams'],
    ['types.ts', 'NativeIntent'], ['types.ts', 'UnknownInputParams'],
  ].map(([file, name]) => ({ id: `${file}#${name}`, kind: 'public-export', name,
    disposition: 'PUBLIC_MODULE_EXPORT', source: { path: `packages/expo-router/src/${file}` } }));
  assert.deepEqual(seedM4Decisions({ rows }), [
    ...['hooks.ts#useRouter', 'hooks.ts#usePathname']
      .map(id => ({ id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' })),
    ...['hooks.ts#useSearchParams', 'hooks.ts#useUnstableGlobalHref'].map(id => ({ id, scope: 'M7_TRANSFER', batch: 'M7.1',
      dependencyId: 'PKG:expo-router', target: 'Verify additional Router public APIs, types and their consumer behavior' })),
    ...['types.ts#Href', 'types.ts#RouteParams'].map(id => ({ id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' })),
    { id: 'types.ts#NativeIntent', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
      target: 'Verify additional Router public APIs, types and their consumer behavior' },
    { id: 'types.ts#UnknownInputParams', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
      target: 'Verify additional Router public APIs, types and their consumer behavior' },
  ]);
});

test('classifies reviewed deep link parser and serializer dependencies', () => {
  const rows = [
    ['getStateFromPath-forks.ts', 'cleanPath'], ['getStateFromPath-forks.ts', 'parseQueryParams'],
    ['getStateFromPath-forks.ts', 'ExpoRouteConfig'], ['getStateFromPath-forks.ts', 'unknown'],
    ['getPathFromState-forks.ts', 'fixCurrentParams'], ['getPathFromState-forks.ts', 'ExpoConfigItem'],
    ['getPathFromState-forks.ts', 'unknown'],
  ].map(([file, name]) => ({ id: `${file}#${name}`, kind: 'public-export', name,
    disposition: 'PUBLIC_MODULE_EXPORT', source: { path: `packages/expo-router/src/fork/${file}` } }));
  assert.deepEqual(seedM4Decisions({ rows }), [
    'getStateFromPath-forks.ts#cleanPath', 'getStateFromPath-forks.ts#parseQueryParams',
    'getStateFromPath-forks.ts#ExpoRouteConfig', 'getPathFromState-forks.ts#fixCurrentParams',
    'getPathFromState-forks.ts#ExpoConfigItem',
  ].map(id => ({ id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' })));
});

test('classifies direct path conversion exports while leaving other names undecided', () => {
  const rows = [
    ['getStateFromPath.ts', 'getStateFromPath'], ['getStateFromPath.ts', 'ResultState'],
    ['getStateFromPath.ts', 'unknown'], ['getPathFromState.ts', 'getPathFromState'],
    ['getPathFromState.ts', 'getPathDataFromState'], ['getPathFromState.ts', 'unknown'],
  ].map(([file, name]) => ({ id: `${file}#${name}`, kind: 'public-export', name,
    disposition: 'PUBLIC_MODULE_EXPORT', source: { path: `packages/expo-router/src/fork/${file}` } }));
  assert.deepEqual(seedM4Decisions({ rows }), [
    'getStateFromPath.ts#getStateFromPath', 'getStateFromPath.ts#ResultState',
    'getPathFromState.ts#getPathFromState', 'getPathFromState.ts#getPathDataFromState',
  ].map(id => ({ id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' })));
});

test('transfers reviewed Router server and browser sources while retaining mixed-source members', () => {
  const paths = ['src/static/getServerManifest.ts', 'src/loadStaticParamsAsync.ts', 'src/getRoutesSSR.ts',
    'src/fork/createMemoryHistory.ts', 'server.d.ts'];
  const rows = paths.map((file, i) => ({ id: String(i), kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE',
    declarations: [{ path: `packages/expo-router/${file}` }] }));
  rows.push({ id: 'mixed', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [
    { path: 'packages/expo-router/src/getRoutesSSR.ts' }, { path: 'packages/expo-router/src/getRoutesCore.ts' },
  ] });
  assert.deepEqual(seedM4Decisions({ rows }), paths.map((_, i) => ({ id: String(i), scope: 'M7_TRANSFER',
    batch: 'M7.1', dependencyId: 'PKG:expo-router', target: 'Verify server, web or testing-library exports and their consumer selection' })));
});

test('aligns reviewed module source exports with their existing entry decisions', () => {
  const rows = [
    ['expo-font/src/index.ts', 'unloadAsync'], ['expo-asset/src/index.ts', 'ANDROID_EMBEDDED_URL_BASE_RESOURCE'],
    ['expo-linking/src/Linking.ts', 'sendIntent'], ['expo-linking/src/Linking.ts', 'openSettings'],
    ['expo-web-browser/src/WebBrowser.types.ts', 'RedirectEvent'], ['expo-web-browser/src/WebBrowser.types.ts', 'WebBrowserWindowFeatures'],
    ['expo-font/src/index.ts', 'unknown'],
  ].map(([file, name]) => ({ id: `${file}#${name}`, kind: 'public-export', name,
    disposition: 'PUBLIC_MODULE_EXPORT', source: { path: `packages/${file}` } }));
  assert.deepEqual(seedM4Decisions({ rows }), [
    { id: 'expo-font/src/index.ts#unloadAsync', scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-font', target: 'Verify platform-specific font API behavior or explicit unavailability' },
    { id: 'expo-asset/src/index.ts#ANDROID_EMBEDDED_URL_BASE_RESOURCE', scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-asset', target: 'Verify platform-specific API behavior or explicit unavailability' },
    { id: 'expo-linking/src/Linking.ts#sendIntent', scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-linking', target: 'Verify platform-specific API behavior or explicit unavailability' },
    { id: 'expo-linking/src/Linking.ts#openSettings', scope: 'M7_TRANSFER', batch: 'M7.3', dependencyId: 'PKG:expo-linking', target: 'Verify system settings availability and failure behavior' },
    { id: 'expo-web-browser/src/WebBrowser.types.ts#RedirectEvent', scope: 'M4_REQUIRED', acceptanceId: 'M4-A05' },
    { id: 'expo-web-browser/src/WebBrowser.types.ts#WebBrowserWindowFeatures', scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-web-browser', target: 'Verify platform-specific API behavior or explicit unavailability' },
  ]);
});

test('transfers iOS Router link preview exports without transferring ordinary links or triggers', () => {
  const paths = ['packages/expo-router/src/index.tsx', 'packages/expo-router/src/exports.ts',
    'packages/expo-router/src/link/elements.tsx'];
  const rows = paths.flatMap(path => ['LinkMenu', 'LinkPreview', 'LinkTrigger', 'unknown'].map(name => ({
    id: `${path}#${name}`, kind: 'public-export', name, disposition: 'PUBLIC_MODULE_EXPORT', source: { path },
  })));
  assert.deepEqual(seedM4Decisions({ rows }), paths.flatMap(path => [
    ...['LinkMenu', 'LinkPreview'].map(name => ({ id: `${path}#${name}`, scope: 'M7_TRANSFER', batch: 'M7.1',
      dependencyId: 'PKG:expo-router', target: 'Verify additional Router public APIs, types and their consumer behavior' })),
    { id: `${path}#LinkTrigger`, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
  ]));
});

test('separates link preview and trigger members using fixed declaration provenance', () => {
  const path = 'packages/expo-router/src/link/elements.tsx';
  const sha256 = '71eaf27bf3fd6e30565528b4b2ae8062238dddfbed2a9398a4ea2d0ec9f5e945';
  const row = (id, line, hash = sha256) => ({ id, kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE',
    declarations: [{ path, sha256: hash, line }] });
  const rows = [row('menu', 58), row('preview', 196), row('trigger', 243), row('stale', 58, 'changed'),
    { ...row('mixed', 58), declarations: [{ path, sha256, line: 58 }, { path, sha256, line: 243 }] }];
  assert.deepEqual(seedM4Decisions({ rows }), [
    ...['menu', 'preview'].map(id => ({ id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
      target: 'Verify additional Router public APIs, types and their consumer behavior' })),
    { id: 'trigger', scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
  ]);
});

test('separates routing matchers from the typed-route helper', () => {
  const path = 'packages/expo-router/src/matchers.tsx';
  const sha256 = '419eec0e81575d4f897a29fea8ce009a8ec46e046e80777af4bd4974c82876e8';
  const member = (id, line, hash = sha256) => ({ id, kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE',
    declarations: [{ path, sha256: hash, line }] });
  const rows = [member('dynamic', 10), member('typed', 91), member('stale', 10, 'changed'),
    { id: 'match', kind: 'public-export', name: 'matchDynamicName', source: { path } },
    { id: 'typed-export', kind: 'public-export', name: 'isTypedRoute', source: { path } },
    { id: 'unknown', kind: 'public-export', name: 'unknown', source: { path } }];
  const transfer = id => ({ id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
    target: 'Verify additional Router public APIs, types and their consumer behavior' });
  assert.deepEqual(seedM4Decisions({ rows }), [
    { id: 'dynamic', scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }, transfer('typed'),
    { id: 'match', scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }, transfer('typed-export'),
  ]);
});

test('separates Core global runtime declarations from UUID and DOM declarations', () => {
  const path = 'packages/expo-modules-core/src/ts-declarations/global.ts';
  const sha256 = '23557ad527aaf97e7c0aa0ee93003d79db4ecbecfef79defb75664e9acf5f41d';
  const member = (id, line, hash = sha256) => ({ id, kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE',
    declarations: [{ path, sha256: hash, line }] });
  assert.deepEqual(seedM4Decisions({ rows: [member('view', 7), member('registry', 40), member('reload', 99),
    member('uuid', 88), member('dom', 117), member('stale', 40, 'changed'), member('outside', 121)] }), [
    ...['view', 'registry', 'reload'].map(id => ({ id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A06' })),
    { id: 'uuid', scope: 'M7_TRANSFER', batch: 'M7.2', dependencyId: 'PKG:expo-modules-core', target: 'Verify UUID generation, inputs and errors on Harmony' },
    { id: 'dom', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-modules-core', target: 'Verify DOM web view globals and consumer types' },
  ]);
});

test('separates Router context requirements from optional native intent customization', () => {
  const path = 'packages/expo-router/src/types.ts';
  const sha256 = 'a81702797365462c0e78c2bb9551f0e39ea5ee487769948348b0c7b97c98d8d1';
  const member = (id, line, hash = sha256) => ({ id, kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE',
    declarations: [{ path, sha256: hash, line }] });
  const exp = name => ({ id: name, kind: 'public-export', name, source: { path } });
  assert.deepEqual(seedM4Decisions({ rows: [member('context', 8), member('intent', 44), member('stale', 8, 'changed'),
    exp('RequireContext'), exp('NativeIntent')] }), [
    { id: 'context', scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
    { id: 'intent', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router', target: 'Verify additional Router public APIs, types and their consumer behavior' },
    { id: 'RequireContext', scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
    { id: 'NativeIntent', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router', target: 'Verify additional Router public APIs, types and their consumer behavior' },
  ]);
});

test('classifies route discovery, screen and link navigation members while preserving mixed sources', () => {
  const paths = ['getRoutes.ts', 'sortRoutes.ts', 'layouts/TabsClient.tsx', 'views/Screen.tsx',
    'link/useLoadedNavigation.ts', 'link/href.ts', 'useNavigation.ts', 'views/Protected.tsx', 'utils/url.ts'];
  const rows = paths.map((file, i) => ({ id: String(i), kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE',
    declarations: [{ path: `packages/expo-router/src/${file}` }] }));
  rows.push({ id: 'mixed', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [
    { path: 'packages/expo-router/src/getRoutes.ts' }, { path: 'packages/expo-router/src/rsc/server.ts' },
  ] });
  assert.deepEqual(seedM4Decisions({ rows }), paths.map((_, i) => ({ id: String(i), scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' })));
});

test('classifies reviewed Router navigation exports and leaves unrelated exports open', () => {
  const rows = [
    ['getRoutes.ts', 'getRoutes'], ['sortRoutes.ts', 'sortRoutes'], ['link/href.ts', 'resolveHref'],
    ['global-state/routing.ts', 'push'], ['global-state/routing.ts', 'prefetch'], ['Route.tsx', 'RouteNode'],
    ['Route.tsx', 'LoadedMiddleware'], ['getRoutes.ts', 'unknown'],
  ].map(([file, name]) => ({ id: `${file}#${name}`, kind: 'public-export', name,
    disposition: 'PUBLIC_MODULE_EXPORT', source: { path: `packages/expo-router/src/${file}` } }));
  assert.deepEqual(seedM4Decisions({ rows }), [
    ...['getRoutes.ts#getRoutes', 'sortRoutes.ts#sortRoutes', 'link/href.ts#resolveHref', 'global-state/routing.ts#push']
      .map(id => ({ id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' })),
    { id: 'global-state/routing.ts#prefetch', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
      target: 'Verify additional Router public APIs, types and their consumer behavior' },
    { id: 'Route.tsx#RouteNode', scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
    { id: 'Route.tsx#LoadedMiddleware', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
      target: 'Verify additional Router public APIs, types and their consumer behavior' },
  ]);
});

test('separates Core platform and runtime exports from UUID and web helpers', () => {
  const rows = ['Platform', 'ExpoGlobal', 'uuid', 'registerWebModule', 'ExpoDomWebView', 'unknown'].map(name => ({
    id: name, kind: 'public-export', name, source: { path: 'packages/expo-modules-core/src/index.ts' },
  }));
  assert.deepEqual(seedM4Decisions({ rows }), [
    ...['Platform', 'ExpoGlobal'].map(id => ({ id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A06' })),
    { id: 'uuid', scope: 'M7_TRANSFER', batch: 'M7.2', dependencyId: 'PKG:expo-modules-core', target: 'Verify UUID generation, inputs and errors on Harmony' },
    { id: 'registerWebModule', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-modules-core', target: 'Verify web-only module registration and consumer behavior' },
    { id: 'ExpoDomWebView', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-modules-core', target: 'Verify DOM web view globals and consumer types' },
  ]);
});

test('classifies Router splash, route errors, and web or tooling-only members', () => {
  const entries = [
    ['splash', 'packages/expo-router/src/utils/splash.ts'], ['screen-splash', 'packages/expo-router/src/views/Splash.tsx'],
    ['route-error', 'packages/expo-router/src/views/Try.tsx'], ['params', 'packages/expo-router/src/navigationParams.ts'],
    ['dom', 'packages/expo-router/src/domComponents/emitDomEvent.ts'], ['doctor', 'packages/expo-router/src/doctor/index.ts'],
  ];
  const rows = entries.map(([id, path]) => ({ id, kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path }] }));
  rows.push({ id: 'mixed', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [
    { path: entries[0][1] }, { path: entries[4][1] },
  ] });
  assert.deepEqual(seedM4Decisions({ rows }), [
    ...['splash', 'screen-splash'].map(id => ({ id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A03' })),
    ...['route-error', 'params'].map(id => ({ id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' })),
    ...['dom', 'doctor'].map(id => ({ id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
      target: 'Verify additional Router public APIs, types and their consumer behavior' })),
  ]);
});

test('aligns Router root re-exports with their reviewed route and typed-route sources', () => {
  const paths = ['packages/expo-router/src/index.tsx', 'packages/expo-router/src/exports.ts'];
  const rows = paths.flatMap(path => ['ResultState', 'ErrorBoundaryProps', 'SplashScreen', 'HrefInputParams', 'Sitemap', 'unknown']
    .map(name => ({ id: `${path}#${name}`, kind: 'public-export', name, source: { path } })));
  assert.deepEqual(seedM4Decisions({ rows }), paths.flatMap(path => [
    ...['ResultState', 'ErrorBoundaryProps'].map(name => ({ id: `${path}#${name}`, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' })),
    { id: `${path}#SplashScreen`, scope: 'M4_REQUIRED', acceptanceId: 'M4-A03' },
    ...['HrefInputParams', 'Sitemap'].map(name => ({ id: `${path}#${name}`, scope: 'M7_TRANSFER', batch: 'M7.1',
      dependencyId: 'PKG:expo-router', target: 'Verify additional Router public APIs, types and their consumer behavior' })),
  ]));
});

test('classifies native navigation and shared object lifecycle source members', () => {
  const entries = [
    ['linking', 'packages/expo-router/src/fork/useLinking.native.ts', 'M4-A04'],
    ['stack', 'packages/expo-router/src/fork/native-stack/createNativeStackNavigator.tsx', 'M4-A04'],
    ['view', 'packages/expo-router/src/fork/native-stack/NativeStackView.tsx', 'M4-A04'],
    ['release', 'packages/expo-modules-core/src/hooks/useReleasingSharedObject.ts', 'M4-A06'],
  ];
  const rows = entries.map(([id, path]) => ({ id, kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path }] }));
  rows.push({ id: 'mixed', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [
    { path: entries[0][1] }, { path: 'packages/expo-router/src/rsc/server.ts' },
  ] });
  assert.deepEqual(seedM4Decisions({ rows }), entries.map(([id, , acceptanceId]) => ({ id, scope: 'M4_REQUIRED', acceptanceId })));
});

test('classifies plugin entry exports by their shared or platform-specific contract', () => {
  const values = [
    ['expo-font/plugin/src/withFonts.ts', 'default'], ['expo-font/plugin/src/withFonts.ts', 'FontObject'],
    ['expo-asset/plugin/src/withAssets.ts', 'AssetProps'], ['expo-splash-screen/plugin/src/withSplashScreen.ts', 'default'],
    ['expo-system-ui/plugin/src/withSystemUI.ts', 'default'], ['expo-web-browser/plugin/src/withWebBrowser.ts', 'default'],
  ];
  const rows = values.map(([file, name]) => ({ id: `${file}#${name}`, kind: 'public-export', name, source: { path: `packages/${file}` } }));
  assert.deepEqual(seedM4Decisions({ rows }), [
    { id: `${values[0][0]}#default`, scope: 'M4_REQUIRED', acceptanceId: 'M4-A01' },
    { id: `${values[1][0]}#FontObject`, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-font', target: 'Verify platform-specific plugin option behavior or explicit unavailability' },
    { id: `${values[2][0]}#AssetProps`, scope: 'M4_REQUIRED', acceptanceId: 'M4-A02' },
    { id: `${values[3][0]}#default`, scope: 'M4_REQUIRED', acceptanceId: 'M4-A03' },
    { id: `${values[4][0]}#default`, scope: 'M4_REQUIRED', acceptanceId: 'M4-A03' },
    { id: `${values[5][0]}#default`, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-web-browser', target: 'Verify platform-specific plugin option behavior or explicit unavailability' },
  ]);
});

test('separates native navigation dependencies from browser and optional Router features', () => {
  const items = [
    ['modal', 'layouts/RootModal.tsx'], ['thenable', 'fork/useThenable.ts'], ['validation', 'fork/validatePathConfig.ts'],
    ['web-back', 'fork/useBackButton.ts'], ['web-title', 'fork/useDocumentTitle.ts'],
    ['prefetch', 'Prefetch.tsx'], ['server', 'global-state/serverLocationContext.ts'],
  ];
  const rows = items.map(([id, file]) => ({ id, kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE',
    declarations: [{ path: `packages/expo-router/src/${file}` }] }));
  rows.push({ id: 'mixed', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [
    { path: 'packages/expo-router/src/layouts/RootModal.tsx' }, { path: 'packages/expo-router/src/Prefetch.tsx' },
  ] });
  assert.deepEqual(seedM4Decisions({ rows }), [
    ...['modal', 'thenable', 'validation'].map(id => ({ id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' })),
    ...['web-back', 'web-title', 'prefetch', 'server'].map(id => ({ id, scope: 'M7_TRANSFER', batch: 'M7.1',
      dependencyId: 'PKG:expo-router', target: 'Verify additional Router public APIs, types and their consumer behavior' })),
  ]);
});

test('transfers Core browser, snapshot and typed-array helper surfaces with explicit targets', () => {
  const rows = [
    { id: 'browser', kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path: 'packages/expo-modules-core/src/environment/browser.web.ts' }] },
    { id: 'ref', kind: 'public-export', name: 'createSnapshotFriendlyRef', source: { path: 'packages/expo-modules-core/src/index.ts' } },
    { id: 'array', kind: 'public-export', name: 'TypedArray', source: { path: 'packages/expo-modules-core/src/index.ts' } },
  ];
  assert.deepEqual(seedM4Decisions({ rows }), [
    { id: 'browser', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-modules-core', target: 'Verify web environment detection and consumer behavior' },
    { id: 'ref', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-modules-core', target: 'Verify snapshot-friendly refs and consumer types' },
    { id: 'array', scope: 'M7_TRANSFER', batch: 'M7.2', dependencyId: 'PKG:expo-modules-core', target: 'Verify typed-array contracts and consumer types' },
  ]);
});

test('classifies platform entries and Router basic navigation exports by concrete path', () => {
  const rows = [
    ['packages/expo-router/_ctx.js', 'ctx'], ['packages/expo-router/_ctx.android.js', 'ctx'],
    ['packages/expo-router/stack.d.ts', 'Stack'], ['packages/expo-router/src/layouts/Stack.web.tsx', 'Stack'],
    ['packages/expo-router/src/ExpoRoot.tsx', 'ExpoRoot'], ['packages/expo-router/src/ExpoRoot.tsx', 'NativeIntent'],
    ['packages/expo-router/src/link/ExpoLink.tsx', 'ExpoLink'], ['packages/expo-router/src/link/LinkWithPreview.tsx', 'LinkWithPreview'],
  ].map(([path, name]) => ({ id: `${path}#${name}`, kind: 'public-export', name, source: { path } }));
  assert.deepEqual(seedM4Decisions({ rows }), [
    { id: `${rows[0].source.path}#ctx`, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
    { id: `${rows[1].source.path}#ctx`, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-router', target: 'Verify platform-specific Router entry selection and behavior' },
    { id: `${rows[2].source.path}#Stack`, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
    { id: `${rows[3].source.path}#Stack`, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router', target: 'Verify additional Router public APIs, types and their consumer behavior' },
    { id: `${rows[4].source.path}#ExpoRoot`, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
    { id: `${rows[5].source.path}#NativeIntent`, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router', target: 'Verify additional Router public APIs, types and their consumer behavior' },
    { id: `${rows[6].source.path}#ExpoLink`, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
    { id: `${rows[7].source.path}#LinkWithPreview`, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router', target: 'Verify additional Router public APIs, types and their consumer behavior' },
  ]);
});

test('keeps ordinary deep-link extraction separate from deferred Expo Go parsing', () => {
  const path = 'packages/expo-router/src/fork/extractPathFromURL.ts';
  const sha256 = '85d3bacfff4bf000b5870665f9b8f97da51c3883c0d1f54fbf25128468b3fc83';
  const member = (id, line) => ({ id, kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path, sha256, line }] });
  const exp = name => ({ id: name, kind: 'public-export', name, source: { path } });
  assert.deepEqual(seedM4Decisions({ rows: [member('normal', 127), member('go', 1), exp('extractExpoPathFromURL'), exp('parsePathFromExpoGoLink')] }), [
    { id: 'normal', scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
    { id: 'go', scope: 'M7_TRANSFER', batch: 'M7.5', dependencyId: 'PKG:expo-router', target: 'Track DEFER-GO and verify Expo Go link parsing when that scope is resumed' },
    { id: 'extractExpoPathFromURL', scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
    { id: 'parsePathFromExpoGoLink', scope: 'M7_TRANSFER', batch: 'M7.5', dependencyId: 'PKG:expo-router', target: 'Track DEFER-GO and verify Expo Go link parsing when that scope is resumed' },
  ]);
});

test('preserves M4 requirements for shared links and transfers shared prefetch', () => {
  const member = (id, paths) => ({ id, kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE',
    declarations: paths.map(path => ({ path })) });
  const rows = [member('MEMBER:TYPE:0008049/properties/101', ['packages/expo-router/src/link/useLinkHooks.ts', 'packages/expo-router/src/rsc/router/client.ts']),
    member('MEMBER:TYPE:0025909/properties/10', ['packages/expo-router/src/rsc/router/client.ts', 'packages/expo-router/src/imperative-api.tsx']),
    member('unknown', ['packages/expo-router/src/link/useLinkHooks.ts', 'packages/expo-router/src/rsc/router/client.ts'])];
  assert.deepEqual(seedM4Decisions({ rows }), [
    { id: rows[0].id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' },
    { id: rows[1].id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router', target: 'Verify additional Router public APIs, types and their consumer behavior' },
  ]);
});

test('classifies remaining reviewed navigation and platform exports explicitly', () => {
  const examples = [
    ['packages/expo-router/src/useScreens.tsx', 'routeToScreen', 'M4-A04'],
    ['packages/expo-router/src/imperative-api.tsx', 'router', 'M4-A04'],
    ['packages/expo-system-ui/src/ExpoSystemUI.ts', 'default', 'M4-A03'],
    ['packages/expo-web-browser/src/ExpoWebBrowser.ts', 'default', 'M4-A05'],
  ];
  const rows = examples.map(([path, name]) => ({ id: `${path}#${name}`, kind: 'public-export', name, source: { path } }));
  rows.push({ id: 'unknown', kind: 'public-export', name: 'unknown', source: { path: examples[0][0] } });
  assert.deepEqual(seedM4Decisions({ rows }), examples.map(([path, name, acceptanceId]) => ({
    id: `${path}#${name}`, scope: 'M4_REQUIRED', acceptanceId,
  })));
});

test('transfers reviewed server, drawer, web and browser service exports', () => {
  const values = [
    ['packages/expo-router/rsc/headers.js', 'unstable_headers', 'PKG:expo-router', 'M7.1'],
    ['packages/expo-router/src/layouts/Drawer.tsx', 'Drawer', 'PKG:expo-router', 'M7.1'],
    ['packages/expo-router/src/global-state/routing.ts', 'prefetch', 'PKG:expo-router', 'M7.1'],
    ['packages/expo-web-browser/src/WebBrowser.types.ts', 'ServiceActionResult', 'PKG:expo-web-browser', 'M7.6'],
    ['packages/expo-status-bar/src/StatusBar.ts', 'setStatusBarNetworkActivityIndicatorVisible', 'PKG:expo-status-bar', 'M7.6'],
  ];
  const rows = values.map(([path, name]) => ({ id: `${path}#${name}`, kind: 'public-export', name, source: { path } }));
  const decisions = seedM4Decisions({ rows });
  assert.deepEqual(decisions.map(({ id, scope, batch, dependencyId }) => ({ id, scope, batch, dependencyId })),
    values.map(([path, name, dependencyId, batch]) => ({ id: `${path}#${name}`, scope: 'M7_TRANSFER', batch, dependencyId })));
  assert.ok(decisions.every(decision => decision.target));
});

test('classifies native route fallback members and web-only Core polyfill members', () => {
  const paths = ['packages/expo-router/src/views/ErrorBoundary.tsx', 'packages/expo-router/src/views/Unmatched.tsx',
    'packages/expo-router/src/fork/findFocusedRoute.tsx', 'packages/expo-router/src/fork/useBackButton.native.ts',
    'packages/expo-modules-core/src/polyfill/dangerous-internal.ts'];
  const rows = paths.map((path, i) => ({ id: String(i), kind: 'public-member-candidate', reachability: 'PUBLIC_REACHABLE', declarations: [{ path }] }));
  assert.deepEqual(seedM4Decisions({ rows }), [
    ...['0', '1', '2', '3'].map(id => ({ id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' })),
    { id: '4', scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-modules-core', target: 'Verify web global polyfill behavior and consumer types' },
  ]);
});

test('classifies final reviewed Router exports and native document title no-op', () => {
  const examples = [
    ['src/constants.ts', 'INTERNAL_SLOT_NAME', 'M4_REQUIRED', 'M4-A04'],
    ['src/utils/statusbar.ts', 'canOverrideStatusBarBehavior', 'M4_REQUIRED', 'M4-A03'],
    ['plugin/src/index.ts', 'default', 'M7_TRANSFER', 'M7.1'],
    ['src/routes-manifest.ts', 'createRoutesManifest', 'M7_TRANSFER', 'M7.1'],
    ['src/fork/useDocumentTitle.native.ts', 'useDocumentTitle', 'M7_TRANSFER', 'M7.6'],
    ['src/primitives.tsx', 'Screen', 'M4_REQUIRED', 'M4-A04'],
  ];
  const rows = examples.map(([file, name]) => ({ id: `${file}#${name}`, kind: 'public-export', name, source: { path: `packages/expo-router/${file}` } }));
  const decisions = seedM4Decisions({ rows });
  assert.deepEqual(decisions.map(row => [row.id, row.scope, row.acceptanceId ?? row.batch]),
    examples.map(([file, name, scope, value]) => [`${file}#${name}`, scope, value]));
  assert.ok(decisions.filter(row => row.scope === 'M7_TRANSFER').every(row => row.dependencyId && row.target));
});

test('classifies reviewed Core root exports without assigning unrelated exports', () => {
  const path = 'packages/expo-modules-core/src/index.ts';
  const rows = ['LegacyEventEmitter', 'NativeModulesProxy', 'PermissionResponse', 'PermissionStatus',
    'PermissionExpiration', 'PermissionHookOptions', 'createPermissionHook', 'uuid', 'unknown'].map(name => ({
    id: name, kind: 'public-export', name, disposition: 'PUBLIC_MODULE_EXPORT', source: { path },
  }));
  assert.deepEqual(seedM4Decisions({ rows }), [
    ...['LegacyEventEmitter', 'NativeModulesProxy'].map(id => ({ id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A06' })),
    ...['PermissionResponse', 'PermissionStatus', 'PermissionExpiration', 'PermissionHookOptions', 'createPermissionHook'].map(id =>
      ({ id, scope: 'M7_TRANSFER', batch: 'M7.3', dependencyId: 'PKG:expo-modules-core',
        target: 'Verify permissions, denial, revocation and lifecycle behavior' })),
    { id: 'uuid', scope: 'M7_TRANSFER', batch: 'M7.2', dependencyId: 'PKG:expo-modules-core',
      target: 'Verify UUID generation, inputs and errors on Harmony' },
  ]);
});

test('source reconciliation distinguishes unchanged, changed and missing current files', () => {
  const inputs = [{ path: 'packages/expo-font/a.ts', sha256: 'old' },
    { path: 'packages/expo-font/b.ts', sha256: 'same' }, { path: 'packages/expo-font/c.ts', sha256: 'gone' },
    { path: 'packages/expo-constants/x.ts', sha256: 'other' }];
  const current = new Map([['packages/expo-font/a.ts', 'new'], ['packages/expo-font/b.ts', 'same']]);
  assert.deepEqual(compareM4Sources(inputs, file => current.get(file) ?? null).map(row => [row.path, row.status]), [
    ['packages/expo-font/a.ts', 'CHANGED'], ['packages/expo-font/b.ts', 'UNCHANGED'], ['packages/expo-font/c.ts', 'MISSING'],
  ]);
});

test('current public source comparison reports additions, removals and changed files in both directions', () => {
  assert.equal(typeof scopeInventory.compareM4PublicSources, 'function');
  const fixed = [
    { path: 'packages/expo-router/src/old.ts', sha256: 'old' },
    { path: 'packages/expo-modules-core/src/same.ts', sha256: 'same' },
    { path: 'packages/expo-font/src/removed.ts', sha256: 'removed' },
  ];
  const current = new Map([
    ['packages/expo-router/src/old.ts', 'new'],
    ['packages/expo-modules-core/src/same.ts', 'same'],
    ['packages/expo-font/src/added.ts', 'added'],
  ]);
  assert.deepEqual(scopeInventory.compareM4PublicSources(fixed, current).map(row => [row.path, row.status]), [
    ['packages/expo-font/src/added.ts', 'ADDED'], ['packages/expo-font/src/removed.ts', 'MISSING'],
    ['packages/expo-modules-core/src/same.ts', 'UNCHANGED'], ['packages/expo-router/src/old.ts', 'CHANGED'],
  ]);
  assert.throws(() => scopeInventory.compareM4PublicSources([...fixed, fixed[0]], current), /duplicate/i);
});

test('public source selection excludes test directories and test files', () => {
  assert.equal(typeof scopeInventory.isM4PublicSourcePath, 'function');
  for (const file of ['packages/expo-router/src/__tests__/navigation.test.tsx',
    'packages/expo-font/plugin/src/__tests__/utils-test.ts', 'packages/expo-font/src/__rsc_tests__/index.test.ts',
    'packages/expo-router/src/link/example.spec.ts']) {
    assert.equal(scopeInventory.isM4PublicSourcePath(file), false, file);
  }
  for (const file of ['packages/expo-router/src/global-state/routing.ts', 'packages/expo-font/plugin/src/withFonts.ts',
    'packages/expo-modules-core/package.json', 'packages/expo-router/entry.js', 'packages/expo-router/stack.d.ts',
    'packages/expo-router/plugin/options.json', 'packages/expo-font/app.plugin.js',
    'packages/expo-router/link/index.js', 'packages/expo-router/node/render.js',
    'packages/expo-router/rsc/headers.d.ts', 'packages/expo-router/types/index.d.ts']) assert.equal(scopeInventory.isM4PublicSourcePath(file), true, file);
  assert.equal(scopeInventory.isM4PublicSourcePath('packages/expo-router/build/index.js'), false);
});

test('Router and Core member candidates retain declaration identity and source', () => {
  const declarations = [{ id: 'd1', path: 'packages/expo-router/src/Link.tsx', line: 2 },
    { id: 'd2', path: 'packages/expo-modules-core/src/SharedObject.ts', line: 3 },
    { id: 'd3', path: 'packages/other/a.ts', line: 4 }];
  const members = [{ id: 'm1', declarationIds: ['d1', 'd3'], kind: 'property' },
    { id: 'm2', declarationIds: ['d2'], kind: 'method' }, { id: 'm3', declarationIds: ['d3'] }];
  assert.deepEqual(collectM4Members(declarations, members).map(row => [row.id, row.declarations.map(d => d.id)]),
    [['m1', ['d1']], ['m2', ['d2']]]);
});

test('member reachability uses final membership IDs and keeps missing entries visible', () => {
  const candidates = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }];
  const memberships = [{ table: 'members', recordId: 'm1', classification: 'PUBLIC_REACHABLE', capabilityIds: ['c1'] },
    { table: 'members', recordId: 'm2', classification: 'CONTEXT_ONLY', capabilityIds: [] },
    { table: 'exports', recordId: 'm3', classification: 'PUBLIC_REACHABLE', capabilityIds: ['other'] }];
  assert.deepEqual(mergeM4Membership(candidates, memberships).map(row => [row.id, row.reachability, row.capabilityIds]), [
    ['m1', 'PUBLIC_REACHABLE', ['c1']], ['m2', 'CONTEXT_ONLY', []], ['m3', 'MISSING_MEMBERSHIP', []],
  ]);
  assert.throws(() => mergeM4Membership(candidates, [memberships[0], memberships[0]]));
});

test('context-only decisions require a matching final membership', () => {
  const inventory = { rows: [{ id: 'context', kind: 'public-member-candidate', scope: 'UNDECIDED', reachability: 'CONTEXT_ONLY', membershipId: 'membership:context' },
    { id: 'public', kind: 'public-member-candidate', scope: 'UNDECIDED', reachability: 'PUBLIC_REACHABLE', membershipId: 'membership:public' }] };
  assert.equal(applyM4Decisions(inventory, [{ id: 'context', scope: 'SOURCE_CONTEXT', membershipId: 'membership:context' }]).rows[0].scope, 'SOURCE_CONTEXT');
  assert.throws(() => applyM4Decisions(inventory, [{ id: 'public', scope: 'SOURCE_CONTEXT', membershipId: 'membership:public' }]));
  assert.throws(() => applyM4Decisions(inventory, [{ id: 'context', scope: 'SOURCE_CONTEXT', membershipId: 'other' }]));
  assert.throws(() => applyM4Decisions({ rows: [{ id: 'export', scope: 'UNDECIDED', kind: 'public-export', disposition: 'PUBLIC_MODULE_EXPORT' }] },
    [{ id: 'export', scope: 'SOURCE_CONTEXT', sourceDisposition: 'IMPLEMENTATION_MODULE_EXPORT' }]));
});

test('rejects member indexes unrelated to final public membership', () => {
  const closure = { inputs: [{ path: 'final/public.json', sha256: 'correct' }] };
  assert.equal(validateM4MembershipSource('final/public.json', 'correct', closure), true);
  assert.equal(validateM4MembershipSource('old/public.json', 'correct', closure), false);
  assert.equal(validateM4MembershipSource('final/public.json', 'wrong', closure), false);
});
