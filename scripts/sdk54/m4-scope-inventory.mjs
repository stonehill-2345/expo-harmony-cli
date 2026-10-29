import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import ts from 'typescript';

const packages = new Set(['expo-asset', 'expo-font', 'expo-linking', 'expo-splash-screen',
  'expo-status-bar', 'expo-system-ui', 'expo-web-browser'].map(name => `PKG:${name}`));
const pluginIds = new Set(['PLG-ASSET', 'PLG-FONT', 'PLG-SPLASH', 'PLG-SYSTEM-UI', 'PLG-ROUTER', 'PLG-WEB-BROWSER']);
const compare = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
export function collectM4Members(declarations, members) {
  const selected = new Map();
  for (const declaration of declarations) {
    if (/^packages\/(?:expo-router|expo-modules-core)\//.test(declaration.path ?? '')) {
      if (selected.has(declaration.id)) throw new Error(`Duplicate declaration: ${declaration.id}`);
      selected.set(declaration.id, declaration);
    }
  }
  const rows = [];
  for (const member of members) {
    const sources = (member.declarationIds ?? []).filter(id => selected.has(id)).map(id => selected.get(id));
    if (sources.length) rows.push({ id: member.id, kind: 'public-member-candidate', relation: member.relation ?? null,
      memberKind: member.kind ?? null, ownerTypeId: member.ownerTypeId ?? null, declarations: sources });
  }
  return rows.sort(compare);
}
export function mergeM4Membership(candidates, memberships) {
  const ids = new Set(candidates.map(row => row.id)), matches = new Map();
  for (const item of memberships) {
    if (item.table !== 'members' || !ids.has(item.recordId)) continue;
    if (matches.has(item.recordId)) throw new Error(`Duplicate membership: ${item.recordId}`);
    matches.set(item.recordId, item);
  }
  return candidates.map(row => {
    const membership = matches.get(row.id);
    return { ...row, reachability: membership?.classification ?? 'MISSING_MEMBERSHIP',
      capabilityIds: membership?.capabilityIds ?? [], membershipId: membership?.id ?? null };
  });
}
export function validateM4MembershipSource(file, sha256, closure) {
  return (closure.inputs ?? []).filter(row => row.path === file && row.sha256 === sha256).length === 1;
}

function* closureRows(file) {
  const index = JSON.parse(fs.readFileSync(file));
  if (index.format !== 'sdk54-final-public-closure-v1') throw new Error('Invalid final closure index');
  let count = 0;
  for (const shard of index.recordShards) {
    if (!/^[a-f0-9]{64}\.json\.gz$/.test(shard.path) || shard.path !== `${shard.sha256}.json.gz`) throw new Error('Invalid closure shard');
    const bytes = fs.readFileSync(path.join(`${file}.parts`, shard.path));
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== shard.sha256) throw new Error('Closure shard hash mismatch');
    const rows = JSON.parse(gunzipSync(bytes));
    if (!rows.length || rows.length !== shard.count || rows[0].id !== shard.firstId || rows.at(-1).id !== shard.lastId) throw new Error('Closure shard contents mismatch');
    count += rows.length;
    yield* rows;
  }
  if (count !== index.recordCount) throw new Error('Closure total mismatch');
}

function* publicSurfaceRows(file, table) {
  const index = JSON.parse(fs.readFileSync(file));
  if (index.format !== 'sdk54-public-surface-shards-v1' || !index.tables?.[table]) throw new Error('Invalid public surface index');
  let count = 0;
  const seen = new Set();
  for (const shard of index.tables[table].shards) {
    if (!/^[a-f0-9]{64}\.json\.gz$/.test(shard.path) || seen.has(shard.path) || shard.path !== `${shard.sha256}.json.gz`) throw new Error('Invalid shard identity');
    seen.add(shard.path);
    const bytes = fs.readFileSync(path.join(`${file}.parts`, shard.path));
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== shard.sha256) throw new Error('Shard hash mismatch');
    const rows = JSON.parse(gunzipSync(bytes));
    if (!rows.length || rows.length !== shard.count || rows[0].id !== shard.firstId || rows.at(-1).id !== shard.lastId) throw new Error('Shard contents mismatch');
    count += rows.length;
    yield* rows;
  }
  if (count !== index.tables[table].count) throw new Error('Shard total mismatch');
}
export function compareM4Sources(inputs, getHash) {
  const roots = [...packages].map(name => `packages/${name.slice(4)}/`);
  return inputs.filter(row => roots.some(root => row.path.startsWith(root))).map(row => {
    const current = getHash(row.path);
    return { path: row.path, sourceSha256: row.sha256, currentSha256: current,
      status: current === null ? 'MISSING' : current === row.sha256 ? 'UNCHANGED' : 'CHANGED' };
  }).sort((a, b) => a.path.localeCompare(b.path));
}
export function compareM4PublicSources(inputs, current) {
  if (!(current instanceof Map)) throw new Error('Current sources must be a map');
  const fixed = new Map();
  for (const row of inputs) {
    if (!row.path || !row.sha256 || fixed.has(row.path)) throw new Error(`Invalid or duplicate fixed source: ${row.path}`);
    fixed.set(row.path, row.sha256);
  }
  return [...new Set([...fixed.keys(), ...current.keys()])].sort().map(file => {
    const sourceSha256 = fixed.get(file) ?? null, currentSha256 = current.get(file) ?? null;
    return { path: file, sourceSha256, currentSha256,
      status: sourceSha256 === null ? 'ADDED' : currentSha256 === null ? 'MISSING' :
        sourceSha256 === currentSha256 ? 'UNCHANGED' : 'CHANGED' };
  });
}

export function collectM4CurrentAdditions(files) {
  if (!(files instanceof Map)) throw new Error('Current additions must be a map');
  const rows = [];
  for (const [file, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    if (!isM4PublicSourcePath(file) || !Buffer.isBuffer(bytes)) throw new Error(`Invalid current source: ${file}`);
    const source = { path: file, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    const parsed = ts.createSourceFile(file, bytes.toString('utf8'), ts.ScriptTarget.Latest, true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS);
    if (parsed.parseDiagnostics.length) throw new Error(`Cannot parse current source: ${file}`);
    const checkCommonJs = node => {
      if ((ts.isIdentifier(node) && node.text === 'exports') ||
          (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'module' &&
           ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === 'exports')) {
        throw new Error(`CommonJS current source requires explicit review: ${file}`);
      }
      ts.forEachChild(node, checkCommonJs);
    };
    checkCommonJs(parsed);
    const names = new Set(), members = [];
    for (const node of parsed.statements) {
      if (ts.isExportAssignment(node)) {
        if (node.isExportEquals) throw new Error(`CommonJS export assignment requires explicit review: ${file}`);
        if (ts.isArrowFunction(node.expression) || ts.isFunctionExpression(node.expression)) throw new Error(`Unsupported function export: ${file}`);
        names.add('default');
      }
      else if (ts.isExportDeclaration(node)) {
        if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) names.add(node.exportClause?.name?.text ?? '*');
        else for (const element of node.exportClause.elements) names.add(element.name.text);
      } else if (node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        const isDefault = node.modifiers.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword);
        if (isDefault && !ts.isFunctionDeclaration(node)) names.add('default');
        else if (ts.isVariableStatement(node)) {
          for (const declaration of node.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name)) throw new Error(`Unsupported export binding: ${file}`);
            if (declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) throw new Error(`Unsupported function export: ${file}`);
            names.add(declaration.name.text);
          }
        } else if (isDefault || (node.name && ts.isIdentifier(node.name))) {
          const name = isDefault ? 'default' : node.name.text;
          names.add(name);
          if (ts.isFunctionDeclaration(node)) {
            for (const [role, declarations] of [['type-parameter', node.typeParameters ?? []], ['parameter', node.parameters]]) {
              declarations.forEach((declaration, index) => {
                if (!ts.isIdentifier(declaration.name)) throw new Error(`Unsupported exported function binding: ${file}`);
                members.push({ id: `CURRENT-MEMBER:${file}#${name}/${role}/${index}`, kind: 'current-member',
                  parentName: name, memberRole: role, name: declaration.name.text,
                  signature: declaration.getText(parsed), source });
              });
            }
          }
        }
        else throw new Error(`Unsupported export declaration: ${file}`);
      }
    }
    rows.push({ id: `CURRENT-FILE:${file}`, kind: 'current-file', source });
    for (const name of [...names].sort()) rows.push({ id: `CURRENT-EXPORT:${file}#${name}`, kind: 'current-export', name, source });
    rows.push(...members);
  }
  return rows;
}

export function isM4PublicSourcePath(file) {
  if (/\/(?:__tests__|__rsc_tests__|__mocks__|fixtures|__fixtures__|tests?)\//.test(file) ||
      /(?:\.test|\.spec|-test)\.[cm]?[jt]sx?$/.test(file)) return false;
  return /^packages\/(?:expo-asset|expo-font|expo-linking|expo-splash-screen|expo-status-bar|expo-system-ui|expo-web-browser|expo-router|expo-modules-core)\/(?:package\.json|[^/]+\.[cm]?[jt]sx?|plugin\/[^/]+\.json|(?:src|plugin\/src)\/.*\.[cm]?[jt]sx?)$/.test(file) ||
    /^packages\/expo-router\/(?:link|node|rsc|types)\/.*\.[cm]?[jt]sx?$/.test(file);
}

function currentPublicSources() {
  const result = new Map();
  const roots = [...packages, 'PKG:expo-router', 'PKG:expo-modules-core'].map(name => `packages/${name.slice(4)}`);
  const visit = file => {
    if (!fs.existsSync(file)) return;
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`Unexpected source symlink: ${file}`);
    if (stat.isDirectory()) for (const entry of fs.readdirSync(file)) visit(`${file}/${entry}`);
    else if (stat.isFile() && isM4PublicSourcePath(file)) result.set(file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  };
  for (const root of roots) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isFile()) visit(`${root}/${entry.name}`);
    }
    const directories = ['src', 'plugin/src'];
    if (root === 'packages/expo-router') directories.push('link', 'node', 'rsc', 'types');
    for (const item of directories) visit(`${root}/${item}`);
    const plugin = `${root}/plugin`;
    if (fs.existsSync(plugin)) for (const entry of fs.readdirSync(plugin, { withFileTypes: true })) {
      if (entry.isFile()) visit(`${plugin}/${entry.name}`);
    }
  }
  return result;
}
export function seedM4Decisions(inventory) {
  const apiNames = {
    'PKG:expo-font': ['loadAsync', 'useFonts', 'getLoadedFonts', 'isLoaded', 'isLoading', 'renderToImageAsync',
      'FontResource', 'FontSource', 'RenderToImageOptions', 'RenderToImageResult'],
    'PKG:expo-asset': ['Asset', 'AssetDescriptor', 'AssetMetadata', 'useAssets'],
    'PKG:expo-splash-screen': ['hide', 'hideAsync', 'preventAutoHideAsync', 'setOptions', 'SplashScreenOptions'],
    'PKG:expo-system-ui': ['getBackgroundColorAsync', 'setBackgroundColorAsync'],
    'PKG:expo-status-bar': ['StatusBar', 'StatusBarAnimation', 'StatusBarProps', 'StatusBarStyle', 'setStatusBarHidden',
      'setStatusBarStyle', 'setStatusBarBackgroundColor', 'setStatusBarTranslucent'],
    'PKG:expo-linking': ['getInitialURL', 'getLinkingURL', 'addEventListener', 'openURL', 'canOpenURL', 'collectManifestSchemes',
      'createURL', 'hasConstantsManifest', 'hasCustomScheme', 'parse', 'parseInitialURLAsync', 'resolveScheme', 'useLinkingURL',
      'useURL', 'CreateURLOptions', 'EventType', 'NativeURLListener', 'ParsedURL', 'QueryParams', 'URLListener'],
    'PKG:expo-web-browser': ['openBrowserAsync', 'dismissBrowser', 'openAuthSessionAsync', 'dismissAuthSession',
      'WebBrowserOpenOptions', 'AuthSessionOpenOptions', 'WebBrowserAuthSessionResult', 'WebBrowserRedirectResult', 'WebBrowserResult', 'WebBrowserResultType'],
  };
  const acceptance = { 'PKG:expo-font': 'M4-A01', 'PKG:expo-asset': 'M4-A02',
    'PKG:expo-splash-screen': 'M4-A03', 'PKG:expo-system-ui': 'M4-A03', 'PKG:expo-status-bar': 'M4-A03',
    'PKG:expo-linking': 'M4-A04', 'PKG:expo-web-browser': 'M4-A05' };
  const sharedOptions = { 'PLG-FONT': ['fonts', 'fonts[]'], 'PLG-ASSET': ['assets', 'assets[]'],
    'PLG-SPLASH': ['backgroundColor', 'image', 'imageWidth', 'resizeMode', 'dark', 'dark.backgroundColor', 'dark.image', 'enableFullScreenImage_legacy'] };
  const pluginAcceptance = { 'PLG-FONT': 'M4-A01', 'PLG-ASSET': 'M4-A02', 'PLG-SPLASH': 'M4-A03' };
  const pluginPackages = { 'PLG-FONT': 'PKG:expo-font', 'PLG-ASSET': 'PKG:expo-asset',
    'PLG-SPLASH': 'PKG:expo-splash-screen', 'PLG-ROUTER': 'PKG:expo-router', 'PLG-WEB-BROWSER': 'PKG:expo-web-browser' };
  const contracts = { 'packages/expo-font/plugin/src/withFonts.ts': 'PLG-FONT',
    'packages/expo-asset/plugin/src/withAssets.ts': 'PLG-ASSET',
    'packages/expo-splash-screen/plugin/src/withSplashScreen.ts': 'PLG-SPLASH' };
  const routerSources = new Set(['getLinkingConfig.ts', 'getRoutesCore.ts', 'fork/getStateFromPath.ts',
    'fork/getStateFromPath-forks.ts', 'fork/getPathFromState.ts', 'fork/getPathFromState-forks.ts',
    'global-state/routing.ts', 'global-state/routeInfo.ts', 'global-state/router-store.tsx', 'imperative-api.tsx',
    'Route.tsx', 'useScreens.tsx', 'layouts/withLayoutContext.tsx', 'link/useLinkHooks.ts', 'hooks.ts',
    'getReactNavigationConfig.ts', 'views/Navigator.tsx', 'layouts/StackClient.tsx', 'LocationProvider.tsx',
    'routes-manifest.ts', 'getRoutesRedirects.tsx', 'link/Link.tsx', 'link/linking.ts', 'link/useLinkToPathProps.tsx',
    'fork/useLinking.ts', 'fork/NavigationContainer.tsx', 'ExpoRoot.tsx', 'getRoutes.ts', 'sortRoutes.ts',
    'layouts/TabsClient.tsx', 'views/Screen.tsx', 'link/useLoadedNavigation.ts', 'link/href.ts', 'useNavigation.ts',
    'views/Protected.tsx', 'utils/url.ts', 'views/Try.tsx', 'navigationParams.ts', 'fork/useLinking.native.ts',
    'fork/native-stack/createNativeStackNavigator.tsx', 'fork/native-stack/NativeStackView.tsx', 'link/Redirect.tsx',
    'layouts/RootModal.tsx', 'fork/useThenable.ts', 'fork/validatePathConfig.ts', 'views/SuspenseFallback.tsx',
    'global-state/utils.ts', 'link/BaseExpoRouterLink.tsx', 'link/ExpoLink.tsx', 'views/ErrorBoundary.tsx',
    'views/Unmatched.tsx', 'views/EmptyRoute.tsx', 'fork/findFocusedRoute.tsx', 'fork/useBackButton.native.ts',
    'global-state/sort-routes.ts', 'global-state/storeContext.ts', 'qualified-entry.tsx', 'renderRootComponent.tsx'].map(file => `packages/expo-router/src/${file}`));
  const routerNavigationExports = {
    'getRoutes.ts': ['Options', 'extrapolateGroups', 'generateDynamic', 'getExactRoutes', 'getRoutes'],
    'sortRoutes.ts': ['sortRoutes', 'sortRoutesWithInitial'],
    'Route.tsx': ['DynamicConvention', 'LoadedRoute', 'LocalRouteParamsContext', 'Route', 'RouteNode', 'RouteProps',
      'sortRoutes', 'sortRoutesWithInitial', 'useContextKey', 'useRouteNode'],
    'link/href.ts': ['resolveHref', 'resolveHrefStringWithSegments'],
    'link/linking.ts': ['getInitialURL', 'getPathFromState', 'getRootURL', 'getStateFromPath', 'subscribe'],
    'link/useLoadedNavigation.ts': ['useLoadedNavigation', 'useOptionalNavigation'],
    'link/Redirect.tsx': ['Redirect', 'RedirectProps'],
    'useNavigation.ts': ['useNavigation'],
    'views/Screen.tsx': ['Screen', 'ScreenProps', 'isScreen'],
    'views/Navigator.tsx': ['DefaultNavigator', 'Navigator', 'NavigatorContext', 'NavigatorContextValue', 'NavigatorProps', 'Slot', 'useNavigatorContext'],
    'global-state/routing.ts': ['LinkToOptions', 'NavigationOptions', 'canDismiss', 'dismiss', 'dismissAll', 'dismissTo',
      'findDivergentState', 'getPayloadFromStateRoute', 'push', 'replace', 'routingQueue', 'setParams'],
    'global-state/router-store.tsx': ['FocusedRouteState', 'ReactNavigationState', 'RouterStore', 'StoreRedirects', 'store', 'useRouteInfo', 'useStore'],
    'getLinkingConfig.ts': ['ExpoLinkingOptions', 'LinkingConfigOptions', 'getLinkingConfig', 'getNavigationConfig'],
    'getReactNavigationConfig.ts': ['Screen', 'getReactNavigationConfig', 'getReactNavigationScreensConfig', 'parseRouteSegments'],
    'fork/useLinking.native.ts': ['getInitialURLWithTimeout', 'useLinking'],
    'fork/useBackButton.native.ts': ['useBackButton'],
    'ExpoRoot.tsx': ['ExpoRoot', 'ExpoRootProps'],
    'LocationProvider.tsx': ['UrlObject', 'getNormalizedStatePath', 'getRouteInfoFromState'],
    'getRoutesCore.ts': ['Options', 'RedirectConfig', 'extrapolateGroups', 'generateDynamic', 'getRoutes'],
    'getRoutesRedirects.tsx': ['applyRedirects', 'convertRedirect', 'getRedirectModule', 'mergeVariablesWithPath'],
    'global-state/routeInfo.ts': ['UrlObject', 'defaultRouteInfo', 'getRouteInfoFromState'],
    'global-state/sort-routes.ts': ['getSortedRoutes'],
    'global-state/storeContext.ts': ['StoreContext', 'useExpoRouterStore'],
    'global-state/utils.ts': ['getRootStackRouteNames', 'shouldAppendNotFound', 'shouldAppendSitemap'],
    'navigationParams.ts': ['InternalExpoRouterParamName', 'InternalExpoRouterParams', 'appendInternalExpoRouterParams', 'getInternalExpoRouterParams', 'removeInternalExpoRouterParams'],
    'layouts/RootModal.tsx': ['RootModalContext', 'RootModalProvider'],
    'layouts/Stack.tsx': ['Stack', 'default'], 'layouts/Tabs.tsx': ['Tabs', 'default'],
    'layouts/TabsClient.tsx': ['BottomTabNavigator', 'default'],
    'layouts/withLayoutContext.tsx': ['useFilterScreenChildren', 'withLayoutContext'],
    'link/BaseExpoRouterLink.tsx': ['BaseExpoRouterLink'], 'link/ExpoLink.tsx': ['ExpoLink'],
    'fork/NavigationContainer.tsx': ['NavigationContainer'], 'fork/findFocusedRoute.tsx': ['findFocusedRoute'],
    'fork/native-stack/NativeStackView.tsx': ['NativeStackView'], 'fork/native-stack/createNativeStackNavigator.tsx': ['createNativeStackNavigator'],
    'fork/useThenable.ts': ['useThenable'], 'fork/validatePathConfig.ts': ['default'],
    'views/ErrorBoundary.tsx': ['ErrorBoundary'], 'views/Try.tsx': ['ErrorBoundaryProps', 'Try'],
    'views/Unmatched.tsx': ['Unmatched'], 'views/SuspenseFallback.tsx': ['SuspenseFallback'],
    'views/Protected.tsx': ['Protected', 'ProtectedProps', 'isProtectedReactElement'],
    'utils/url.ts': ['hasUrlProtocolPrefix', 'isWellKnownUri', 'shouldLinkExternally'],
    'imperative-api.tsx': ['Router', 'router', 'useImperativeApiEmitter'],
    'layouts/BaseStack.tsx': ['default'], 'layouts/StackClient.tsx': ['default', 'StackRouter', 'stackRouterOverride'],
    'layouts/TabRouter.tsx': ['tabRouterOverride'],
    'useScreens.tsx': ['ScreenProps', 'getQualifiedRouteComponent', 'routeToScreen', 'screenOptionsFactory', 'useSortedScreens'],
    'link/useLinkToPathProps.tsx': ['default', 'shouldHandleMouseEvent'],
    'link/useLinkHooks.ts': ['useHrefAttrs', 'useInteropClassName'],
    'qualified-entry.tsx': ['App'], 'renderRootComponent.tsx': ['renderRootComponent'],
    'fork/getPathFromState-forks.ts': ['appendQueryAndHash'], 'fork/getPathFromState.ts': ['appendBaseUrl'],
    'fork/getStateFromPath-forks.ts': ['assertScreens', 'spreadParamsAcrossAllStates', 'stripBaseUrl'],
    'views/EmptyRoute.tsx': ['EmptyRoute'], 'views/useSafeLayoutEffect.ts': ['useSafeLayoutEffect'],
    'hooks.ts': ['useRouteInfo'],
    'constants.ts': ['INTERNAL_SLOT_NAME', 'NOT_FOUND_ROUTE_NAME', 'SITEMAP_ROUTE_NAME'],
    'import-mode/index.ts': ['default'], 'primitives.tsx': ['Group', 'Screen'],
  };
  const routerExtraExports = {
    'Route.tsx': ['LoadedMiddleware', 'MiddlewareNode'], 'getRoutesCore.ts': ['RewriteConfig'],
    'fork/useLinking.ts': ['getInitialURLWithTimeout', 'series', 'useLinking'],
    'getDevServer/index.native.ts': ['getDevServer'], 'hooks.ts': ['useSearchParams', 'useUnstableGlobalHref'],
    'layouts/StackClient.tsx': ['ExtendedStackNavigationOptions'],
    'link/Link.tsx': ['WebAnchorProps'], 'link/useLinkHooks.ts': ['WebAnchorProps'],
    'routes-manifest.ts': ['ExpoRoutesManifestV1', 'MiddlewareInfo', 'Options', 'RouteInfo', 'createRoutesManifest'],
    'useScreens.tsx': ['SingularOptions', 'getSingularId'],
  };
  const routerNonDeviceSource = file => /^packages\/expo-router\/(?:src\/(?:rsc|testing-library|modal\/web|static)\/|rsc\/|node\/|_ctx-html\.js$|src\/(?:loadStaticParamsAsync|getRoutesSSR|fork\/createMemoryHistory)\.ts$|vendor\/react-helmet-async\/|(?:testing-library|server)\.(?:js|d\.ts)$)/.test(file ?? '');
  const routerAdditionalSource = file => /^packages\/expo-router\/(?:src\/(?:ui|typed-routes|head|link\/preview|domComponents|doctor|onboard)\/|src\/(?:getServerManifest\.ts|views\/(?:Pressable|useSitemap|Sitemap|NoSSR|Toast)\.tsx|layouts\/(?:ExperimentalModalStack|Stack\.web|_web-modal|Drawer|DrawerClient)\.tsx|(?:Prefetch|useDeprecated|useFocusEffect)\.tsx?|fork\/(?:useBackButton|useDocumentTitle)\.ts|global-state\/serverLocationContext\.ts|link\/(?:LinkWithPreview\.tsx|InternalLinkPreviewContext\.ts)|utils\/(?:debug|stack)\.ts|getDevServer\/index\.ts)$|(?:ui|head|html|drawer)\.(?:js|d\.ts)$)/.test(file ?? '');
  const coreContractSource = file => /^packages\/expo-modules-core\/src\/(?:(?:ts-declarations\/)?(?:EventEmitter|NativeModule|SharedObject|SharedRef)|LegacyEventEmitter|NativeModulesProxy(?:\.native|\.types)?|NativeViewManagerAdapter(?:\.native)?|requireNativeModule|reload|errors\/(?:CodedError|UnavailabilityError))\.(?:ts|tsx)$/.test(file ?? '');
  const corePermissionSource = file => /^packages\/expo-modules-core\/src\/Permissions(?:Hook|Interface)\.ts$/.test(file ?? '');
  const platformBrowserNames = ['warmUpAsync', 'coolDownAsync', 'mayInitWithUrlAsync', 'getCustomTabsSupportingBrowsersAsync',
    'WebBrowserWarmUpResult', 'WebBrowserCoolDownResult', 'WebBrowserMayInitWithUrlResult', 'WebBrowserCustomTabsResults',
    'maybeCompleteAuthSession', 'WebBrowserCompleteAuthSessionOptions', 'WebBrowserCompleteAuthSessionResult'];
  const platformApiNames = { 'PKG:expo-asset': ['ANDROID_EMBEDDED_URL_BASE_RESOURCE'],
    'PKG:expo-linking': ['sendIntent', 'SendIntentExtras'],
    'PKG:expo-status-bar': ['setStatusBarNetworkActivityIndicatorVisible'],
    'PKG:expo-web-browser': ['WebBrowserPresentationStyle', 'WebBrowserWindowFeatures'] };
  return inventory.rows.flatMap(row => {
    if (['current-file', 'current-export', 'current-member'].includes(row.kind)) {
      const reviewed = {
        'packages/expo-router/_ctx.harmony.js': { acceptanceId: 'M4-A04', sha256: '48297ecdb3609baccef41fddc56951b76eca9e76e0d6efd27cbfdab2a8b91b2b', names: ['ctx'] },
        'packages/expo-router/src/global-state/harmony-native-dismiss.ts': { acceptanceId: 'M4-A04', sha256: 'e8b5ba4b4081736a7899bd3dfffcf022c998a7e3ca053f87e34d6e2d6448ae74', names: ['emitHarmonyNativeDismissTo'] },
        'packages/expo-modules-core/src/NativeModulesProxy.harmony.ts': { acceptanceId: 'M4-A06', sha256: '30bcd5f9deb366ea64dc11a942378d4ea38276bcc58ab4a9555a65357f4f588f', names: ['default'] },
        'packages/expo-modules-core/src/NativeViewManagerAdapter.harmony.tsx': { acceptanceId: 'M4-A06', sha256: '4fded1c68bb9f30ed0e858d28d4e3ab92782718d31e2f8e28da1e3588868cc64', names: ['requireNativeViewManager'] },
      }[row.source?.path];
      const members = {
        'packages/expo-modules-core/src/NativeViewManagerAdapter.harmony.tsx': ['requireNativeViewManager:type-parameter:P',
          'requireNativeViewManager:parameter:moduleName', 'requireNativeViewManager:parameter:viewName'],
        'packages/expo-router/src/global-state/harmony-native-dismiss.ts': ['emitHarmonyNativeDismissTo:parameter:action',
          'emitHarmonyNativeDismissTo:parameter:navigationState'],
      };
      if (reviewed && row.source?.sha256 === reviewed.sha256 && (row.kind === 'current-file' || (row.kind === 'current-export' && reviewed.names.includes(row.name)) ||
          (row.kind === 'current-member' && members[row.source.path]?.includes(`${row.parentName}:${row.memberRole}:${row.name}`)))) {
        return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: reviewed.acceptanceId }];
      }
    }
    if (row.kind === 'public-export' && row.disposition === 'IMPLEMENTATION_MODULE_EXPORT') {
      return [{ id: row.id, scope: 'SOURCE_CONTEXT', sourceDisposition: row.disposition }];
    }
    if ((row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
         row.declarations.every(item => item.path === 'packages/expo-router/src/fork/useDocumentTitle.native.ts')) ||
        (row.kind === 'public-export' && row.source?.path === 'packages/expo-router/src/fork/useDocumentTitle.native.ts')) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-router',
        target: 'Verify native document-title no-op and platform consumer behavior' }];
    }
    if (row.kind === 'public-export' && row.source?.path === 'packages/expo-router/src/utils/statusbar.ts' && row.name === 'canOverrideStatusBarBehavior') {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A03' }];
    }
    if (row.kind === 'public-export' && ((row.source?.path === 'packages/expo-router/plugin/src/index.ts' && row.name === 'default') ||
        (row.source?.path?.startsWith('packages/expo-router/src/') && routerExtraExports[row.source.path.slice('packages/expo-router/src/'.length)]?.includes(row.name)))) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
        target: 'Verify additional Router public APIs, types and their consumer behavior' }];
    }
    if (row.kind === 'public-export' && ((row.source?.path === 'packages/expo-splash-screen/src/SplashScreen.types.ts' && row.name === 'SplashScreenNativeModule') ||
        (row.source?.path === 'packages/expo-system-ui/src/ExpoSystemUI.ts' && row.name === 'default'))) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A03' }];
    }
    if (row.kind === 'public-export' && row.source?.path === 'packages/expo-web-browser/src/ExpoWebBrowser.ts' && row.name === 'default') {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A05' }];
    }
    if (row.kind === 'public-export' && /^packages\/expo-router\/_ctx\.(?:android|ios|web)\.js$/.test(row.source?.path ?? '')) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-router',
        target: 'Verify platform-specific Router entry selection and behavior' }];
    }
    if (row.kind === 'public-export' && ['packages/expo-router/_ctx.js', 'packages/expo-router/_ctx.d.ts',
      'packages/expo-router/stack.d.ts', 'packages/expo-router/tabs.d.ts', 'packages/expo-router/link/index.d.ts',
      'packages/expo-router/link/index.js'].includes(row.source?.path)) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
    }
    if (row.kind === 'public-export' && row.source?.path === 'packages/expo-router/src/ExpoRoot.tsx' && row.name === 'NativeIntent') {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
        target: 'Verify additional Router public APIs, types and their consumer behavior' }];
    }
    if (row.kind === 'public-export' && row.source?.path === 'packages/expo-router/src/fork/extractPathFromURL.ts') {
      if (row.name === 'extractExpoPathFromURL') return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
      if (['parsePathAndParamsFromExpoGoLink', 'parsePathFromExpoGoLink'].includes(row.name)) {
        return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.5', dependencyId: 'PKG:expo-router',
          target: 'Track DEFER-GO and verify Expo Go link parsing when that scope is resumed' }];
      }
    }
    if (row.kind === 'public-export' && row.source?.path === 'packages/expo-router/src/global-state/routing.ts' && ['prefetch', 'reload'].includes(row.name)) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
        target: 'Verify additional Router public APIs, types and their consumer behavior' }];
    }
    if (row.kind === 'public-export' && row.source?.path === 'packages/expo-status-bar/src/StatusBar.ts' && row.name === 'setStatusBarNetworkActivityIndicatorVisible') {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-status-bar',
        target: 'Verify platform-specific API behavior or explicit unavailability' }];
    }
    if (row.kind === 'public-export' && ((row.source?.path === 'packages/expo-web-browser/src/WebBrowser.types.ts' && row.name === 'ServiceActionResult') ||
        (row.source?.path === 'packages/expo-web-browser/src/WebBrowser.ts' && ['WebBrowserPresentationStyle', 'WebBrowserWindowFeatures'].includes(row.name)) ||
        row.source?.path === 'packages/expo-web-browser/plugin/src/utils.ts')) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-web-browser',
        target: 'Verify platform-specific browser services or explicit unavailability' }];
    }
    if (row.kind === 'public-export') {
      const pluginExports = {
        'packages/expo-font/plugin/src/withFonts.ts': { names: ['default', 'FontProps'], acceptanceId: 'M4-A01' },
        'packages/expo-asset/plugin/src/withAssets.ts': { names: ['default', 'AssetProps'], acceptanceId: 'M4-A02' },
        'packages/expo-splash-screen/plugin/src/withSplashScreen.ts': { names: ['default'], acceptanceId: 'M4-A03' },
        'packages/expo-system-ui/plugin/src/withSystemUI.ts': { names: ['default'], acceptanceId: 'M4-A03' },
      };
      const entry = pluginExports[row.source?.path];
      if (entry?.names.includes(row.name)) return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: entry.acceptanceId }];
      if ((row.source?.path === 'packages/expo-font/plugin/src/withFonts.ts' && ['Font', 'FontObject'].includes(row.name)) ||
          row.source?.path === 'packages/expo-web-browser/plugin/src/withWebBrowser.ts' ||
          /^packages\/expo-(?:system-ui|web-browser)\/plugin\/src\/with(?:Android|Ios|WebBrowserAndroid)/.test(row.source?.path ?? '')) {
        return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: `PKG:${row.source.path.split('/')[1]}`,
          target: 'Verify platform-specific plugin option behavior or explicit unavailability' }];
      }
    }
    if (row.kind === 'public-entry' && (packages.has(row.packageId) || ['PKG:expo-router', 'PKG:expo-modules-core'].includes(row.packageId))) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A07' }];
    }
    if (row.kind === 'public-member-candidate' && ['CONTEXT_ONLY', 'IMPLEMENTATION_TYPE_CONTEXT'].includes(row.reachability) && row.membershipId) {
      return [{ id: row.id, scope: 'SOURCE_CONTEXT', membershipId: row.membershipId }];
    }
    if (row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length === 2) {
      const paths = row.declarations.map(item => item.path).sort().join('|');
      if (row.id === 'MEMBER:TYPE:0008049/properties/101' && paths === 'packages/expo-router/src/link/useLinkHooks.ts|packages/expo-router/src/rsc/router/client.ts') {
        return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
      }
      if (row.id === 'MEMBER:TYPE:0025909/properties/10' && paths === 'packages/expo-router/src/imperative-api.tsx|packages/expo-router/src/rsc/router/client.ts') {
        return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
          target: 'Verify additional Router public APIs, types and their consumer behavior' }];
      }
    }
    if (row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
        row.declarations.every(item => item.path === 'packages/expo-router/src/link/elements.tsx' &&
          item.sha256 === '71eaf27bf3fd6e30565528b4b2ae8062238dddfbed2a9398a4ea2d0ec9f5e945' && item.line >= 1 && item.line <= 221)) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
        target: 'Verify additional Router public APIs, types and their consumer behavior' }];
    }
    if (row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
        row.declarations.every(item => item.path === 'packages/expo-router/src/link/elements.tsx' &&
          item.sha256 === '71eaf27bf3fd6e30565528b4b2ae8062238dddfbed2a9398a4ea2d0ec9f5e945' && item.line >= 222 && item.line <= 260)) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
    }
    if (row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
        row.declarations.every(item => item.path === 'packages/expo-router/src/matchers.tsx' &&
          item.sha256 === '419eec0e81575d4f897a29fea8ce009a8ec46e046e80777af4bd4974c82876e8' && item.line >= 1 && item.line <= 90)) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
    }
    if (row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
        row.declarations.every(item => item.path === 'packages/expo-router/src/matchers.tsx' &&
          item.sha256 === '419eec0e81575d4f897a29fea8ce009a8ec46e046e80777af4bd4974c82876e8' && item.line >= 91 && item.line <= 93)) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
        target: 'Verify additional Router public APIs, types and their consumer behavior' }];
    }
    if (row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length) {
      const global = item => item.path === 'packages/expo-modules-core/src/ts-declarations/global.ts' &&
        item.sha256 === '23557ad527aaf97e7c0aa0ee93003d79db4ecbecfef79defb75664e9acf5f41d';
      if (row.declarations.every(item => global(item) && ((item.line >= 6 && item.line <= 76) || (item.line >= 94 && item.line <= 112)))) {
        return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A06' }];
      }
      if (row.declarations.every(item => global(item) && (item.line === 83 || item.line === 88))) {
        return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.2', dependencyId: 'PKG:expo-modules-core',
          target: 'Verify UUID generation, inputs and errors on Harmony' }];
      }
      if (row.declarations.every(item => global(item) && item.line === 117)) {
        return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-modules-core',
          target: 'Verify DOM web view globals and consumer types' }];
      }
    }
    if (row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length) {
      const routerTypes = item => item.path === 'packages/expo-router/src/types.ts' &&
        item.sha256 === 'a81702797365462c0e78c2bb9551f0e39ea5ee487769948348b0c7b97c98d8d1';
      if (row.declarations.every(item => routerTypes(item) && item.line >= 5 && item.line <= 13)) {
        return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
      }
      if (row.declarations.every(item => routerTypes(item) && item.line >= 31 && item.line <= 57)) {
        return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
          target: 'Verify additional Router public APIs, types and their consumer behavior' }];
      }
    }
    if (row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length) {
      const extract = item => item.path === 'packages/expo-router/src/fork/extractPathFromURL.ts' &&
        item.sha256 === '85d3bacfff4bf000b5870665f9b8f97da51c3883c0d1f54fbf25128468b3fc83';
      if (row.declarations.every(item => extract(item) && item.line === 127)) {
        return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
      }
      if (row.declarations.every(item => extract(item) && [1, 2, 3, 16].includes(item.line))) {
        return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.5', dependencyId: 'PKG:expo-router',
          target: 'Track DEFER-GO and verify Expo Go link parsing when that scope is resumed' }];
      }
    }
    if (row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
        row.declarations.every(item => /^packages\/expo-router\/(?:src\/native-tabs\/|unstable-native-tabs\.(?:d\.ts|js)$)/.test(item.path))) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.4', dependencyId: 'PKG:expo-router',
        target: 'Verify Native Tabs navigation, properties, events and lifecycle on Harmony devices' }];
    }
    if (row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
        row.declarations.every(item => coreContractSource(item.path))) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A06' }];
    }
    if ((row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
         row.declarations.every(item => item.path === 'packages/expo-modules-core/src/hooks/useReleasingSharedObject.ts')) ||
        (row.kind === 'public-export' && row.source?.path === 'packages/expo-modules-core/src/hooks/useReleasingSharedObject.ts' && row.name === 'useReleasingSharedObject')) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A06' }];
    }
    if ((row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
         row.declarations.every(item => /^packages\/expo-modules-core\/src\/uuid\//.test(item.path))) ||
        (row.kind === 'public-export' && (row.source?.path?.startsWith('packages/expo-modules-core/src/uuid/') ||
          (row.source?.path === 'packages/expo-modules-core/src/index.ts' && row.name === 'uuid')))) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.2', dependencyId: 'PKG:expo-modules-core',
        target: 'Verify UUID generation, inputs and errors on Harmony' }];
    }
    if ((row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
         row.declarations.every(item => item.path === 'packages/expo-modules-core/src/Platform.ts')) ||
        (row.kind === 'public-export' && ((row.source?.path === 'packages/expo-modules-core/src/index.ts' &&
          ['Platform', 'ExpoGlobal', 'ExpoProcess', 'ExpoProcessEnv', 'ProxyNativeModule'].includes(row.name)) ||
          (row.source?.path === 'packages/expo-modules-core/src/Platform.ts' && ['default', 'PlatformSelect', 'PlatformSelectOSType'].includes(row.name))))) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A06' }];
    }
    if (row.kind === 'public-export' && row.source?.path === 'packages/expo-modules-core/src/index.ts' && row.name === 'ExpoDomWebView') {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-modules-core',
        target: 'Verify DOM web view globals and consumer types' }];
    }
    if ((row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
         row.declarations.every(item => item.path === 'packages/expo-modules-core/src/registerWebModule.ts')) ||
        (row.kind === 'public-export' && ((row.source?.path === 'packages/expo-modules-core/src/index.ts' && row.name === 'registerWebModule') ||
          row.source?.path === 'packages/expo-modules-core/src/registerWebModule.ts'))) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-modules-core',
        target: 'Verify web-only module registration and consumer behavior' }];
    }
    if ((row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
         row.declarations.every(item => item.path === 'packages/expo-modules-core/src/environment/browser.web.ts')) ||
        (row.kind === 'public-export' && row.source?.path === 'packages/expo-modules-core/src/environment/browser.web.ts')) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-modules-core',
        target: 'Verify web environment detection and consumer behavior' }];
    }
    if ((row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
         row.declarations.every(item => item.path === 'packages/expo-modules-core/src/polyfill/dangerous-internal.ts')) ||
        (row.kind === 'public-export' && row.source?.path === 'packages/expo-modules-core/src/polyfill/dangerous-internal.ts')) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-modules-core',
        target: 'Verify web global polyfill behavior and consumer types' }];
    }
    if ((row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
         row.declarations.every(item => item.path === 'packages/expo-modules-core/src/Refs.ts')) ||
        (row.kind === 'public-export' && ((row.source?.path === 'packages/expo-modules-core/src/index.ts' && row.name === 'createSnapshotFriendlyRef') ||
        row.source?.path === 'packages/expo-modules-core/src/Refs.ts'))) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-modules-core',
        target: 'Verify snapshot-friendly refs and consumer types' }];
    }
    if (row.kind === 'public-export' && ((row.source?.path === 'packages/expo-modules-core/src/index.ts' &&
        ['TypedArray', 'IntBasedTypedArray', 'UintBasedTypedArray', 'FloatBasedTypedArray'].includes(row.name)) ||
        row.source?.path === 'packages/expo-modules-core/src/TypedArrays.types.ts')) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.2', dependencyId: 'PKG:expo-modules-core',
        target: 'Verify typed-array contracts and consumer types' }];
    }
    if (row.kind === 'public-export' && coreContractSource(row.source?.path)) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A06' }];
    }
    if (row.kind === 'public-export' && row.source?.path === 'packages/expo-modules-core/src/index.ts' &&
        ['LegacyEventEmitter', 'NativeModulesProxy'].includes(row.name)) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A06' }];
    }
    if (row.kind === 'public-export' && row.source?.path === 'packages/expo-modules-core/src/index.ts' &&
        ['PermissionResponse', 'PermissionStatus', 'PermissionExpiration', 'PermissionHookOptions', 'createPermissionHook'].includes(row.name)) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.3', dependencyId: 'PKG:expo-modules-core',
        target: 'Verify permissions, denial, revocation and lifecycle behavior' }];
    }
    if ((row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
         row.declarations.every(item => corePermissionSource(item.path))) ||
        (row.kind === 'public-export' && corePermissionSource(row.source?.path))) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.3', dependencyId: 'PKG:expo-modules-core',
        target: 'Verify permissions, denial, revocation and lifecycle behavior' }];
    }
    if (row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
        row.declarations.every(item => routerSources.has(item.path))) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
    }
    if ((row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
         row.declarations.every(item => ['packages/expo-router/src/utils/splash.ts', 'packages/expo-router/src/views/Splash.tsx'].includes(item.path))) ||
        (row.kind === 'public-export' && ['packages/expo-router/src/utils/splash.ts', 'packages/expo-router/src/views/Splash.tsx'].includes(row.source?.path))) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A03' }];
    }
    if ((row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
         row.declarations.every(item => routerNonDeviceSource(item.path))) ||
        (row.kind === 'public-export' && routerNonDeviceSource(row.source?.path))) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
        target: 'Verify server, web or testing-library exports and their consumer selection' }];
    }
    if ((row.kind === 'public-member-candidate' && row.reachability === 'PUBLIC_REACHABLE' && row.declarations?.length &&
         row.declarations.every(item => routerAdditionalSource(item.path))) ||
        (row.kind === 'public-export' && routerAdditionalSource(row.source?.path))) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
        target: 'Verify additional Router public APIs, types and their consumer behavior' }];
    }
    if (row.kind === 'api' && (row.entryId?.includes('react-server') || row.entryId?.includes('~1build~1server'))) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: row.packageId,
        target: 'Verify server-specific export behavior and consumer selection' }];
    }
    if (row.kind === 'member' && /(?:\/server|\.server)\.(?:ts|tsx)$/.test(row.source?.path ?? '')) {
      const packageName = /^packages\/(expo-[^/]+)\//.exec(row.source.path)?.[1];
      if (packages.has(`PKG:${packageName}`)) return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1',
        dependencyId: `PKG:${packageName}`, target: 'Verify server-specific export behavior and consumer selection' }];
    }
    if (row.kind === 'public-export') {
      const packageName = /^MODULE:packages\/(expo-[^/]+)\//.exec(row.moduleId ?? '')?.[1];
      const packageId = `PKG:${packageName}`;
      if (packages.has(packageId) && /(?:\/server|\.server)\.(?:ts|tsx|js)$/.test(row.source?.path ?? '')) {
        return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: packageId,
          target: 'Verify server-specific export behavior and consumer selection' }];
      }
      if (packages.has(packageId) && /\.(?:android|ios|web)\.(?:ts|tsx|js)$/.test(row.source?.path ?? '')) {
        return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: packageId,
          target: 'Verify platform-specific API behavior or explicit unavailability' }];
      }
    }
    if (row.kind === 'public-export' && row.source?.path === 'packages/expo-font/src/index.ts' &&
        ['FontDisplay', 'UnloadFontOptions', 'unloadAsync', 'unloadAllAsync'].includes(row.name)) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-font',
        target: 'Verify platform-specific font API behavior or explicit unavailability' }];
    }
    if (row.kind === 'public-export' && row.source?.path === 'packages/expo-linking/src/Linking.ts' && row.name === 'openSettings') {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.3', dependencyId: 'PKG:expo-linking',
        target: 'Verify system settings availability and failure behavior' }];
    }
    if (row.kind === 'public-export' && (
      (row.source?.path === 'packages/expo-asset/src/index.ts' && row.name === 'ANDROID_EMBEDDED_URL_BASE_RESOURCE') ||
      (row.source?.path === 'packages/expo-linking/src/Linking.ts' && ['sendIntent', 'SendIntentExtras'].includes(row.name)) ||
      (row.source?.path === 'packages/expo-web-browser/src/WebBrowser.types.ts' && ['WebBrowserWindowFeatures', 'WebBrowserPresentationStyle'].includes(row.name))
    )) {
      const packageId = `PKG:${row.source.path.split('/')[1]}`;
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: packageId,
        target: 'Verify platform-specific API behavior or explicit unavailability' }];
    }
    if (row.kind === 'public-export' && row.source?.path === 'packages/expo-web-browser/src/WebBrowser.types.ts' && row.name === 'RedirectEvent') {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A05' }];
    }
    if (row.kind === 'api' && /:(?:android|ios|web)$/.test(row.entryId ?? '')) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: row.packageId,
        target: 'Verify platform-specific API behavior or explicit unavailability' }];
    }
    if (row.kind === 'api' && row.packageId === 'PKG:expo-linking' && row.name === 'openSettings') {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.3', dependencyId: row.packageId,
        target: 'Verify system settings availability and failure behavior' }];
    }
    if (row.kind === 'api' && platformApiNames[row.packageId]?.includes(row.name)) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: row.packageId,
        target: 'Verify platform-specific API behavior or explicit unavailability' }];
    }
    if ((row.kind === 'plugin-option' && /^(?:android|ios)(?:\.|$)/.test(row.name ?? '') && pluginPackages[row.pluginId]) ||
        (row.kind === 'contract-option' && (/^(?:android|ios)(?:\.|$)/.test(row.name ?? '') || /(?:Android|Ios)\.ts$/.test(row.sourcePath ?? '')))) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: row.packageId ?? pluginPackages[row.pluginId],
        target: 'Verify platform-specific plugin option behavior or explicit unavailability' }];
    }
    if ((row.kind === 'plugin-option' && row.pluginId === 'PLG-ROUTER') ||
        (row.kind === 'contract-option' && row.packageId === 'PKG:expo-router')) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
        target: 'Verify Router plugin option schema, types and generated behavior' }];
    }
    if (((row.kind === 'plugin-option' && row.pluginId === 'PLG-WEB-BROWSER') ||
         (row.kind === 'contract-option' && row.packageId === 'PKG:expo-web-browser')) && row.name === 'experimentalLauncherActivity') {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-web-browser',
        target: 'Verify platform-specific plugin option behavior or explicit unavailability' }];
    }
    if (row.kind === 'public-export' && /^packages\/expo-router\/(?:src\/native-tabs\/|unstable-native-tabs\.(?:d\.ts|js)$)/.test(row.source?.path ?? '')) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.4', dependencyId: 'PKG:expo-router',
        target: 'Verify Native Tabs navigation, properties, events and lifecycle on Harmony devices' }];
    }
    if (row.kind === 'api' && row.packageId === 'PKG:expo-font' && row.entryId.endsWith(':base') &&
        !row.entryId.includes('react-server') && ['FontDisplay', 'UnloadFontOptions', 'unloadAsync', 'unloadAllAsync'].includes(row.name)) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-font',
        target: 'Verify platform-specific font API behavior or explicit unavailability' }];
    }
    if (((row.kind === 'api' && row.packageId === 'PKG:expo-web-browser' && row.entryId.endsWith(':base')) ||
         (row.kind === 'public-export' && row.moduleId?.startsWith('MODULE:packages/expo-web-browser/') && row.disposition === 'PUBLIC_MODULE_EXPORT')) &&
        platformBrowserNames.includes(row.name)) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-web-browser',
        target: 'Verify platform-specific browser services or explicit unavailability' }];
    }
    if (row.kind === 'member' && row.source?.path?.startsWith('packages/expo-font/') &&
        /^(?:(?:isLoaded|isLoading|loadAsync|useFonts|renderToImageAsync|RenderToImageOptions|RenderToImageResult)\.|FontResource\.(?:uri|default)$)/.test(row.name ?? '')) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A01' }];
    }
    if (row.kind === 'member' && row.source?.path?.startsWith('packages/expo-asset/src/') &&
        !row.source.path.includes('.server.') && /^(?:Asset|AssetDescriptor|AssetMetadata|useAssets)(?:\.|$)/.test(row.name ?? '')) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A02' }];
    }
    if (row.kind === 'member' && row.source?.path?.startsWith('packages/expo-linking/src/') &&
        /^(?:addEventListener|openURL|canOpenURL|CreateURLOptions|EventType|NativeURLListener|ParsedURL|URLListener|resolveScheme|createURL|parse)\./.test(row.name ?? '')) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
    }
    if (row.kind === 'member' && row.source?.path?.startsWith('packages/expo-splash-screen/src/') &&
        /^(?:SplashScreenOptions|setOptions)\./.test(row.name ?? '')) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A03' }];
    }
    if (row.kind === 'member' && row.source?.path?.startsWith('packages/expo-system-ui/src/') && row.name === 'setBackgroundColorAsync.color') {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A03' }];
    }
    if (row.kind === 'member' && row.source?.path?.startsWith('packages/expo-linking/src/') && /^(?:sendIntent|SendIntentExtras)\./.test(row.name ?? '')) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-linking',
        target: 'Verify platform-specific API behavior or explicit unavailability' }];
    }
    if (row.kind === 'member' && row.source?.path?.startsWith('packages/expo-status-bar/src/') &&
        /^(?:setStatusBarNetworkActivityIndicatorVisible|StatusBarProps\.networkActivityIndicatorVisible)\b/.test(row.name ?? '')) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-status-bar',
        target: 'Verify platform-specific API behavior or explicit unavailability' }];
    }
    if (row.kind === 'member' && row.source?.path?.startsWith('packages/expo-web-browser/src/') &&
        /^(?:warmUpAsync|coolDownAsync|mayInitWithUrlAsync|maybeCompleteAuthSession|WebBrowserPresentationStyle|ServiceActionResult|WebBrowserCompleteAuthSessionOptions|WebBrowserCompleteAuthSessionResult|WebBrowserCustomTabsResults)\./.test(row.name ?? '')) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-web-browser',
        target: 'Verify platform-specific browser services or explicit unavailability' }];
    }
    if (row.kind === 'member' && row.source?.path?.startsWith('packages/expo-status-bar/src/') &&
        /^(?:StatusBar|setStatusBarBackgroundColor|setStatusBarHidden|setStatusBarStyle|setStatusBarTranslucent)\.|^StatusBarProps\.(?:animated|backgroundColor|hidden|hideTransitionAnimation|style|translucent)$/.test(row.name ?? '')) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A03' }];
    }
    if (row.kind === 'member' && row.source?.path?.startsWith('packages/expo-web-browser/src/') &&
        /^(?:openBrowserAsync|dismissBrowser|openAuthSessionAsync|WebBrowserResult|WebBrowserRedirectResult|WebBrowserResultType)\.|^WebBrowserOpenOptions\.(?:toolbarColor|controlsColor|enableBarCollapsing)$/.test(row.name ?? '')) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A05' }];
    }
    if (row.kind === 'member' && row.source?.path?.startsWith('packages/expo-web-browser/src/') &&
        /^(?:WebBrowserOpenOptions\.(?:windowName|windowFeatures|browserPackage|secondaryToolbarColor|showTitle|enableDefaultShareMenuItem|createTask|showInRecents|dismissButtonStyle|presentationStyle|readerMode)|AuthSessionOpenOptions\.preferEphemeralSession)$/.test(row.name ?? '')) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-web-browser',
        target: 'Verify platform-specific browser options or explicit unavailability' }];
    }
    if (row.kind === 'member' && row.source?.path?.startsWith('packages/expo-font/') &&
        /^(?:FontDisplay\.|FontResource\.display$|unloadAsync\.)/.test(row.name ?? '')) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.6', dependencyId: 'PKG:expo-font',
        target: 'Verify platform-specific font API behavior or explicit unavailability' }];
    }
    if (row.kind === 'public-export' && ['packages/expo-router/src/index.tsx', 'packages/expo-router/src/exports.ts'].includes(row.source?.path) &&
        ['ExpoRoot', 'Href', 'HrefObject', 'Link', 'LinkProps', 'Navigator', 'Redirect', 'RedirectProps',
          'Route', 'RouteParams', 'RouteSegments', 'Router', 'ScreenProps', 'Slot', 'Stack', 'Tabs', 'router',
          'useGlobalSearchParams', 'useLocalSearchParams', 'useNavigation', 'useNavigationContainerRef',
          'usePathname', 'useRootNavigation', 'useRootNavigationState', 'useRouter', 'useSegments',
          'withLayoutContext'].includes(row.name)) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
    }
    if (row.kind === 'public-export' && row.source?.path === 'packages/expo-router/src/global-state/routing.ts' &&
        ['navigate', 'goBack', 'canGoBack', 'linkTo'].includes(row.name)) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
    }
    if (row.kind === 'public-export' && row.source?.path?.startsWith('packages/expo-router/src/') &&
        routerNavigationExports[row.source.path.slice('packages/expo-router/src/'.length)]?.includes(row.name)) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
    }
    if (row.kind === 'public-export' && row.source?.path === 'packages/expo-router/src/matchers.tsx' && row.name === 'isTypedRoute') {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
        target: 'Verify additional Router public APIs, types and their consumer behavior' }];
    }
    if (row.kind === 'public-export' && row.source?.path === 'packages/expo-router/src/matchers.tsx' &&
        ['getContextKey', 'getNameFromFilePath', 'matchArrayGroupName', 'matchDynamicName', 'matchGroupName',
          'matchLastGroupName', 'removeFileSystemDots', 'removeFileSystemExtensions', 'removeSupportedExtensions',
          'stripGroupSegmentsFromPath', 'stripInvisibleSegmentsFromPath', 'testNotFound'].includes(row.name)) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
    }
    if (row.kind === 'public-export' && ['packages/expo-router/src/index.tsx', 'packages/expo-router/src/exports.ts',
      'packages/expo-router/src/link/elements.tsx'].includes(row.source?.path) &&
        ['LinkMenu', 'LinkMenuAction', 'LinkMenuActionProps', 'LinkMenuProps', 'LinkPreview', 'LinkPreviewProps',
          'LinkPreviewStyle', 'useIsPreview'].includes(row.name)) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
        target: 'Verify additional Router public APIs, types and their consumer behavior' }];
    }
    if (row.kind === 'public-export' && ['packages/expo-router/src/index.tsx', 'packages/expo-router/src/exports.ts',
      'packages/expo-router/src/link/elements.tsx'].includes(row.source?.path) && ['LinkTrigger', 'LinkTriggerProps'].includes(row.name)) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
    }
    if (row.kind === 'public-export' && ['packages/expo-router/src/index.tsx', 'packages/expo-router/src/exports.ts',
      'packages/expo-router/src/types.ts'].includes(row.source?.path) && row.name === 'RequireContext') {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
    }
    if (row.kind === 'public-export' && ['packages/expo-router/src/index.tsx', 'packages/expo-router/src/exports.ts',
      'packages/expo-router/src/types.ts'].includes(row.source?.path) && ['NativeIntent', 'PickPartial'].includes(row.name)) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
        target: 'Verify additional Router public APIs, types and their consumer behavior' }];
    }
    if (row.kind === 'public-export' && ['packages/expo-router/src/index.tsx', 'packages/expo-router/src/exports.ts'].includes(row.source?.path)) {
      if (row.name === 'SplashScreen') return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A03' }];
      if (['ErrorBoundary', 'ErrorBoundaryProps', 'LinkComponent', 'RedirectConfig', 'ResultState', 'Unmatched'].includes(row.name)) {
        return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
      }
    }
    if (row.kind === 'public-export' && ['packages/expo-router/src/index.tsx', 'packages/expo-router/src/exports.ts',
      'packages/expo-router/src/types.ts'].includes(row.source?.path) &&
        ['ExpoRouter', 'ExternalPathString', 'HrefInputParams', 'HrefInputParamsObject', 'HrefOutputParams', 'HrefOutputParamsObject',
          'RelativePathString', 'RouteInputParams', 'RouteOutputParams', 'SearchOrHash', 'SearchParams', 'SingleRoutePart',
          'UnknownInputParams', 'UnknownOutputParams', 'EffectCallback', 'SingularOptions', 'Sitemap', 'SitemapType',
          'WebAnchorProps', 'useFocusEffect', 'useSitemap', 'useUnstableGlobalHref'].includes(row.name)) {
      return [{ id: row.id, scope: 'M7_TRANSFER', batch: 'M7.1', dependencyId: 'PKG:expo-router',
        target: 'Verify additional Router public APIs, types and their consumer behavior' }];
    }
    if (row.kind === 'public-export' && (
      (row.source?.path === 'packages/expo-router/src/fork/getStateFromPath.ts' &&
        ['InitialRouteConfig', 'Options', 'ParsedRoute', 'ResultState', 'RouteConfig', 'getStateFromPath'].includes(row.name)) ||
      (row.source?.path === 'packages/expo-router/src/fork/getPathFromState.ts' &&
        ['Options', 'State', 'StringifyConfig', 'getPathDataFromState', 'getPathFromState'].includes(row.name)) ||
      (row.source?.path === 'packages/expo-router/src/fork/getStateFromPath-forks.ts' &&
        ['ExpoOptions', 'ExpoRouteConfig', 'appendIsInitial', 'cleanPath', 'configRegExp', 'createConfig',
          'getParamValue', 'getRouteConfigSorter', 'getUrlWithReactNavigationConcessions', 'handleUrlParams',
          'isDynamicPart', 'matchForEmptyPath', 'parseQueryParams', 'populateParams', 'replacePart',
          'routePatternToRegex', 'safelyDecodeURIComponent'].includes(row.name)) ||
      (row.source?.path === 'packages/expo-router/src/fork/getPathFromState-forks.ts' &&
        ['ExpoConfigItem', 'ExpoOptions', 'appendBaseUrl', 'fixCurrentParams', 'getParamName',
          'getPathWithConventionsCollapsed', 'isDynamicPart', 'validatePathConfig'].includes(row.name))
    )) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
    }
    if (row.kind === 'public-export' && (
      (row.source?.path === 'packages/expo-router/src/hooks.ts' &&
        ['useRouter', 'usePathname', 'useNavigationContainerRef', 'useGlobalSearchParams', 'useLocalSearchParams',
          'useSegments', 'useRootNavigation', 'useRootNavigationState'].includes(row.name)) ||
      (row.source?.path === 'packages/expo-router/src/types.ts' &&
        ['Href', 'HrefObject', 'Route', 'RouteParams', 'RouteSegments'].includes(row.name))
    )) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
    }
    if (row.kind === 'public-export' && routerSources.has(row.source?.path) &&
        ['Link', 'LinkProps', 'LinkComponent', 'Redirect', 'RedirectProps'].includes(row.name)) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A04' }];
    }
    if (row.kind === 'public-export' && row.source?.path?.startsWith('packages/expo-modules-core/') &&
        !/\.(?:web|ios|android|server)\.[^.]+$/.test(row.source.path) && !row.source.path.includes('/polyfill/') &&
        ['CodedError', 'UnavailabilityError', 'EventEmitter', 'EventSubscription', 'EventsMap', 'NativeModule',
          'SharedObject', 'SharedRef', 'requireNativeModule', 'requireOptionalNativeModule', 'requireNativeViewManager',
          'reloadAppAsync', 'useReleasingSharedObject', 'ensureNativeModulesAreInstalled'].includes(row.name)) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: 'M4-A06' }];
    }
    if (row.kind === 'public-export' && row.disposition === 'PUBLIC_MODULE_EXPORT' &&
        !/\.(?:server|web|ios|android)\.[^.]+$/.test(row.source?.path ?? '')) {
      const packageName = /^MODULE:packages\/(expo-[^/]+)\//.exec(row.moduleId ?? '')?.[1];
      const packageId = `PKG:${packageName}`;
      if (apiNames[packageId]?.includes(row.name)) {
        return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: acceptance[packageId] }];
      }
    }
    if (row.kind === 'api' && /:(?:base|native)$/.test(row.entryId) && !row.entryId.includes('react-server') &&
        apiNames[row.packageId]?.includes(row.name)) return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: acceptance[row.packageId] }];
    if (row.kind === 'plugin-option' && sharedOptions[row.pluginId]?.includes(row.name)) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: pluginAcceptance[row.pluginId] }];
    }
    if (row.kind === 'contract-option' && sharedOptions[contracts[row.sourcePath]]?.includes(row.name)) {
      return [{ id: row.id, scope: 'M4_REQUIRED', acceptanceId: pluginAcceptance[contracts[row.sourcePath]] }];
    }
    return [];
  });
}
export function applyM4Decisions(inventory, decisions) {
  if (!Array.isArray(inventory.rows) || !Array.isArray(decisions)) throw new Error('Invalid inventory or decisions');
  const ids = new Set(inventory.rows.map(row => row.id)), existing = new Map(inventory.rows.map(row => [row.id, row])), byId = new Map();
  if (ids.size !== inventory.rows.length) throw new Error('Duplicate inventory identity');
  for (const decision of decisions) {
    if (!ids.has(decision.id) || byId.has(decision.id)) throw new Error(`Unknown or duplicate decision: ${decision.id}`);
    if (decision.scope === 'M4_REQUIRED') {
      if (!/^M4-A0[1-7]$/.test(decision.acceptanceId ?? '')) throw new Error(`Invalid M4 acceptance: ${decision.id}`);
      if (Object.keys(decision).some(key => !['id', 'scope', 'acceptanceId'].includes(key))) throw new Error('Unexpected decision field');
    } else if (decision.scope === 'M7_TRANSFER') {
      if (!/^M7\.[1-6]$/.test(decision.batch ?? '') || !decision.dependencyId?.trim() || !decision.target?.trim()) {
        throw new Error(`Incomplete M7 transfer: ${decision.id}`);
      }
      if (Object.keys(decision).some(key => !['id', 'scope', 'batch', 'dependencyId', 'target'].includes(key))) throw new Error('Unexpected decision field');
    } else if (decision.scope === 'SOURCE_CONTEXT') {
      const row = existing.get(decision.id);
      const memberContext = row.kind === 'public-member-candidate' && ['CONTEXT_ONLY', 'IMPLEMENTATION_TYPE_CONTEXT'].includes(row.reachability) &&
        row.membershipId && row.membershipId === decision.membershipId && Object.keys(decision).every(key => ['id', 'scope', 'membershipId'].includes(key));
      const exportContext = row.kind === 'public-export' && row.disposition === 'IMPLEMENTATION_MODULE_EXPORT' &&
        decision.sourceDisposition === row.disposition && Object.keys(decision).every(key => ['id', 'scope', 'sourceDisposition'].includes(key));
      if (!memberContext && !exportContext) throw new Error(`Invalid source context: ${decision.id}`);
    } else throw new Error(`Invalid scope: ${decision.id}`);
    const prior = existing.get(decision.id);
    if (prior.scope !== 'UNDECIDED' && Object.entries(decision).some(([key, value]) => prior[key] !== value)) {
      throw new Error(`Cannot change an existing scope decision: ${decision.id}`);
    }
    byId.set(decision.id, decision);
  }
  return { ...inventory, ready: false, rows: inventory.rows.map(row => ({ ...row, ...(byId.get(row.id) ?? {}) })) };
}

export function verifyM4DecisionContinuity(previous, current) {
  const errors = [];
  if (!Array.isArray(previous.rows) || !Array.isArray(current.rows)) return ['Missing snapshot rows'];
  if ((previous.inputs || current.inputs) && JSON.stringify(previous.inputs) !== JSON.stringify(current.inputs)) {
    errors.push('Snapshot inputs differ');
  }
  const currentById = new Map(current.rows.map(row => [row.id, row]));
  if (currentById.size !== current.rows.length || new Set(previous.rows.map(row => row.id)).size !== previous.rows.length) {
    errors.push('Duplicate snapshot identity');
  }
  const fields = ['scope', 'acceptanceId', 'batch', 'dependencyId', 'target', 'sourceDisposition', 'membershipId'];
  for (const row of previous.rows) {
    const next = currentById.get(row.id);
    if (!next) errors.push(`Missing previous identity: ${row.id}`);
    else if (row.scope !== 'UNDECIDED' && fields.some(field => row[field] !== next[field])) {
      errors.push(`Changed previous decision: ${row.id}`);
    }
    if (next && ['current-file', 'current-export', 'current-member'].includes(row.kind) && JSON.stringify(row.source) !== JSON.stringify(next.source)) {
      errors.push(`Changed current source provenance: ${row.id}`);
    }
  }
  return errors;
}

export function buildM4Inventory({ runtime, plugins, publicSurface, pluginContracts, publicMembers, currentAdditions }) {
  const apis = runtime.apis.filter(row => packages.has(row.packageId));
  const entryIds = new Set(apis.map(row => row.entryId));
  const rows = apis.map(row => ({ id: row.id, kind: 'api', packageId: row.packageId,
    name: row.name, entryId: row.entryId, source: row.source }));
  for (const row of runtime.members) {
    const entries = (row.syntacticPublicEntryIds ?? []).filter(id => entryIds.has(id));
    if (entries.length) rows.push({ id: row.id, kind: 'member', name: row.memberPath ?? null,
      entryIds: entries, source: row.source });
  }
  for (const plugin of plugins.plugins.filter(row => pluginIds.has(row.id))) {
    for (const [source, options] of [['typescript', plugin.typescript?.options ?? []], ['schema', plugin.schema?.options ?? []]]) {
      for (const option of options) rows.push({ id: option.id, kind: 'plugin-option', pluginId: plugin.id,
        name: option.path, optionSource: source, occurrences: option.occurrences });
    }
  }
  if (publicSurface) {
    const publicPackages = new Set([...packages, 'PKG:expo-router', 'PKG:expo-modules-core']);
    const modulePrefixes = [...publicPackages].map(name => `MODULE:packages/${name.slice(4)}/`);
    for (const entry of [...publicSurface.entries, ...publicSurface.additionalEntries]) {
      if (publicPackages.has(entry.packageId)) rows.push({ id: entry.id, kind: 'public-entry', packageId: entry.packageId,
        name: entry.request, disposition: entry.disposition });
    }
    for (const item of publicSurface.exports) {
      if (modulePrefixes.some(prefix => (item.moduleId ?? '').startsWith(prefix))) {
        rows.push({ id: item.id, kind: 'public-export', moduleId: item.moduleId, name: item.name,
          source: item.source, disposition: item.disposition, entryIds: item.effectiveEntryIds ?? [] });
      }
    }
  }
  if (pluginContracts) {
    const owners = new Set(['PKG:expo-asset', 'PKG:expo-font', 'PKG:expo-splash-screen',
      'PKG:expo-system-ui', 'PKG:expo-router', 'PKG:expo-web-browser']);
    for (const plugin of pluginContracts.plugins.filter(row => owners.has(row.packageId))) {
      for (const option of plugin.optionContract?.strictExpansion?.options ?? []) {
        rows.push({ id: option.id, kind: 'contract-option', packageId: plugin.packageId,
          pluginId: plugin.id, name: option.path, sourcePath: plugin.sourcePath, occurrences: option.occurrences });
      }
    }
  }
  if (publicMembers) rows.push(...publicMembers);
  if (currentAdditions) rows.push(...currentAdditions);
  rows.sort(compare);
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Duplicate source identity');
  return { schemaVersion: 1, complete: false, limitations: [publicSurface
    ? (pluginContracts ? (publicMembers ? 'Public reachability and current candidate differences require separate reconciliation' : 'Router and Core members and current candidate differences require separate reconciliation')
      : 'Router and Core members, plugin contracts and current candidate differences require separate reconciliation')
    : 'Router and Core public surfaces and current candidate differences require separate reconciliation'],
    rows: rows.map(row => ({ ...row, scope: 'UNDECIDED', acceptance: 'NOT_RUN' })) };
}

export function verifyM4Inventory(actual, inputs) {
  const expected = buildM4Inventory(inputs), errors = [];
  if (actual.complete !== false) errors.push('Partial source inventory cannot be marked complete');
  if (actual.schemaVersion !== expected.schemaVersion || JSON.stringify(actual.limitations) !== JSON.stringify(expected.limitations)) {
    errors.push('Inventory metadata differs');
  }
  if (!Array.isArray(actual.rows)) return [...errors, 'Missing rows'];
  const rows = [...actual.rows].sort(compare);
  if (rows.length !== expected.rows.length || new Set(rows.map(row => row.id)).size !== rows.length) errors.push('Missing or duplicate identities');
  for (let i = 0; i < Math.max(rows.length, expected.rows.length); i++) {
    if (JSON.stringify(rows[i]) !== JSON.stringify(expected.rows[i])) errors.push(`Changed or missing row: ${expected.rows[i]?.id ?? rows[i]?.id}`);
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [flag, file, ...options] = process.argv.slice(2);
  if (!['--output', '--check'].includes(flag) || !file) throw new Error('Usage: --output|--check FILE');
  const previousOptions = options.filter(option => option.startsWith('--previous='));
  if (previousOptions.length > 1 || previousOptions.some(option => !option.slice('--previous='.length)) ||
      new Set(options).size !== options.length || options.some(option => !option.startsWith('--previous=') && !['--with-public', '--with-contracts', '--with-members', '--with-closure', '--with-current', '--with-current-public', '--with-current-additions', '--seed'].includes(option))) throw new Error('Unknown or duplicate option');
  if (options.includes('--with-closure') && !options.includes('--with-members')) throw new Error('Closure requires members');
  if (options.includes('--with-current-public') && !options.includes('--with-members')) throw new Error('Current public comparison requires members');
  if (options.includes('--with-current-additions') && !options.includes('--with-current-public')) throw new Error('Current additions require current public comparison');
  const paths = ['docs/releases/sdk54-first-runtime-api.json', 'docs/releases/sdk54-first-plugin-surface.json'];
  if (options.includes('--with-public')) paths.push('outputs/sdk54/ai-e2e/20261027-m0-final-closure/public-dispositions.json');
  if (options.includes('--with-contracts')) paths.push('outputs/sdk54/ai-e2e/20261027-m0-final-closure/plugin-contracts.json');
  if (options.includes('--with-members')) paths.push('outputs/sdk54/ai-e2e/20261027-m0-consumer-sources/public-surface.json');
  if (options.includes('--with-closure')) paths.push('outputs/sdk54/ai-e2e/20261027-m0-final-closure/final-public-closure.json');
  const bytes = paths.map(name => fs.readFileSync(name));
  const membersFile = 'outputs/sdk54/ai-e2e/20261027-m0-consumer-sources/public-surface.json';
  const closureFile = 'outputs/sdk54/ai-e2e/20261027-m0-final-closure/final-public-closure.json';
  if (options.includes('--with-closure') && !validateM4MembershipSource(membersFile,
      crypto.createHash('sha256').update(bytes[paths.indexOf(membersFile)]).digest('hex'), JSON.parse(bytes[paths.indexOf(closureFile)]))) {
    throw new Error('Member index is not the source of the final public closure');
  }
  let publicMembers = options.includes('--with-members') ? collectM4Members(
    publicSurfaceRows(membersFile, 'declarations'), publicSurfaceRows(membersFile, 'members')) : undefined;
  if (options.includes('--with-closure')) publicMembers = mergeM4Membership(publicMembers, closureRows(closureFile));
  const inputs = { runtime: JSON.parse(bytes[0]), plugins: JSON.parse(bytes[1]),
    ...(options.includes('--with-public') ? { publicSurface: JSON.parse(bytes[paths.indexOf('outputs/sdk54/ai-e2e/20261027-m0-final-closure/public-dispositions.json')]) } : {}),
    ...(options.includes('--with-contracts') ? { pluginContracts: JSON.parse(bytes[paths.indexOf('outputs/sdk54/ai-e2e/20261027-m0-final-closure/plugin-contracts.json')]) } : {}),
    ...(publicMembers ? { publicMembers } : {}) };
  const hashes = paths.map((name, i) => ({ path: name, sha256: crypto.createHash('sha256').update(bytes[i]).digest('hex') }));
  const currentSources = options.includes('--with-current') ? compareM4Sources(inputs.runtime.inputs, file =>
    fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null) : undefined;
  const currentPublicSourcesComparison = options.includes('--with-current-public') ? compareM4PublicSources(
    [...publicSurfaceRows(membersFile, 'inputs')].filter(row => isM4PublicSourcePath(row.path)), currentPublicSources()) : undefined;
  if (options.includes('--with-current-additions')) {
    const added = currentPublicSourcesComparison.filter(row => row.status === 'ADDED');
    inputs.currentAdditions = collectM4CurrentAdditions(new Map(added.map(row => {
      const data = fs.readFileSync(row.path);
      if (crypto.createHash('sha256').update(data).digest('hex') !== row.currentSha256) throw new Error(`Current source changed during scan: ${row.path}`);
      return [row.path, data];
    })));
  }
  const initial = buildM4Inventory(inputs);
  const inventory = { ...(options.includes('--seed') ? applyM4Decisions(initial, seedM4Decisions(initial)) : initial), inputs: hashes,
    ...(currentSources ? { currentSources } : {}), ...(currentPublicSourcesComparison ? { currentPublicSources: currentPublicSourcesComparison } : {}) };
  if (previousOptions.length) {
    const previous = JSON.parse(fs.readFileSync(previousOptions[0].slice('--previous='.length)));
    const errors = verifyM4DecisionContinuity(previous, inventory);
    if (errors.length) throw new Error(errors.join('\n'));
  }
  if (flag === '--output') fs.writeFileSync(file, JSON.stringify(inventory, null, 2) + '\n', { flag: 'wx' });
  else {
    const actual = JSON.parse(fs.readFileSync(file));
    const errors = options.includes('--seed') ? (JSON.stringify(actual) === JSON.stringify(inventory) ? [] : ['Seeded inventory differs']) : verifyM4Inventory(actual, inputs);
    if (JSON.stringify(actual.inputs) !== JSON.stringify(hashes)) errors.push('Input hash mismatch');
    if (currentSources && JSON.stringify(actual.currentSources) !== JSON.stringify(currentSources)) errors.push('Current source snapshot differs');
    if (currentPublicSourcesComparison && JSON.stringify(actual.currentPublicSources) !== JSON.stringify(currentPublicSourcesComparison)) errors.push('Current public source snapshot differs');
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(`PASS: ${actual.rows.length} source records match; scope remains incomplete`);
  }
}
