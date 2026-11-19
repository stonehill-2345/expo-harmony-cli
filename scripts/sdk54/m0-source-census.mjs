import path from 'node:path';

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const ordered = values => [...values].sort(compare);
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort(compare).map(key => [key, item[key]])) : item);
const identity = (kind, value) => `SOURCE-${kind}:${encodeURIComponent(value)}`;
const tables = ['owners', 'files', 'categoryGaps', 'unmatchedInputs'];
const semanticCategories = ['FUNCTION', 'CLASS', 'CONSTANT', 'COMPONENT_PROPERTY', 'EVENT', 'CALLBACK', 'ERROR', 'PERMISSION', 'PLUGIN_OPTION', 'PLATFORM_CONDITION', 'TYPE', 'NATIVE_INTERFACE', 'LIFECYCLE', 'RESOURCE', 'INSTALL', 'REMOVE', 'AUTOLINKING', 'PREBUILD'];
const ordinaryBlob = entry => entry?.type === 'blob' && ['100644', '100755'].includes(entry.mode);

function safePath(value, label = 'path') {
  if (typeof value !== 'string' || !value || value.includes('\\') || /[\0\r\n]/.test(value) || path.posix.isAbsolute(value)
    || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Invalid ${label}: ${String(value)}`);
  return value;
}

function requireRows(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`Missing ${label} array`);
  return rows;
}

function indexRows(rows, key, label) {
  const result = new Map();
  for (const row of requireRows(rows, label)) {
    if (!row || typeof row[key] !== 'string' || !row[key] || result.has(row[key])) throw new Error(`Duplicate or missing ${label} ${key}: ${row?.[key]}`);
    result.set(row[key], row);
  }
  return result;
}

function validateSource(record, source, label) {
  for (const value of [record.source, record]) {
    if (!value) continue;
    for (const key of ['revision', 'tree']) if (value[key] !== undefined && value[key] !== source[key]) throw new Error(`Conflicting ${label} fixed source ${key}: ${record.path ?? record.id}`);
  }
}

function validateHashes(row, label) {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(row.blob ?? '')) throw new Error(`Invalid ${label} blob: ${row.path}`);
  if (!/^[a-f0-9]{64}$/.test(row.sha256 ?? '')) throw new Error(`Invalid ${label} sha256: ${row.path}`);
}

function workspacePatterns(root) {
  const patterns = Array.isArray(root.workspaces) ? root.workspaces : root.workspaces?.packages;
  if (!Array.isArray(patterns) || !patterns.length) throw new Error('Missing root manifest workspace patterns');
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || !pattern || pattern.trim() !== pattern) throw new Error(`Invalid workspace pattern: ${String(pattern)}`);
    safePath(pattern.startsWith('!') && !pattern.startsWith('!(') ? pattern.slice(1) : pattern, 'workspace pattern');
  }
  if (!patterns.some(pattern => !pattern.startsWith('!') || pattern.startsWith('!('))) throw new Error('Workspace patterns require a positive pattern');
  return ordered(new Set(patterns));
}

function isWorkspace(root, patterns) {
  const negative = pattern => pattern.startsWith('!') && !pattern.startsWith('!(');
  return patterns.some(pattern => !negative(pattern) && path.posix.matchesGlob(root, pattern))
    && !patterns.some(pattern => negative(pattern) && path.posix.matchesGlob(root, pattern.slice(1)));
}

function rolesFor(file) {
  const lower = file.toLowerCase(), basename = path.posix.basename(lower), roles = new Set();
  if (/\.[cm]?[jt]sx?$/.test(lower)) roles.add('JAVASCRIPT_TYPESCRIPT');
  if (/\.d\.[cm]?ts$/.test(lower)) roles.add('DECLARATION');
  if (/(?:^|\/)(?:android|ios|apple|macos|windows|native|cpp|cxx)(?:\/|$)/.test(lower)
    || /\.(?:java|kt|kts|swift|m|mm|h|hpp|c|cc|cpp|cxx|podspec|xcprivacy|entitlements)$/.test(lower)) roles.add('NATIVE');
  if (/\.(?:png|jpe?g|gif|webp|avif|svg|ico|icns|bmp|ttf|otf|woff2?|mp3|wav|mp4|mov|pdf|zip|aar|jar|wasm)$/.test(lower)
    || /(?:^|\/)(?:assets|resources|res)(?:\/|$)/.test(lower)) roles.add('RESOURCE');
  if (/\.(?:gradle|plist|xcconfig|pbxproj|entitlements|xcprivacy)$/.test(lower)
    || /^(?:androidmanifest\.xml|app\.json|app\.config\.[cm]?[jt]s|expo-module\.config\.json|podfile(?:\.lock)?|gradle\.properties|settings\.gradle(?:\.kts)?)$/.test(basename)) roles.add('PLATFORM_CONFIGURATION');
  if (/^(?:package\.json|(?:yarn|package|pnpm)-lock\.(?:json|yaml)|yarn\.lock|(?:tsconfig[^/]*|lerna|turbo)\.json|dockerfile|makefile|cmakelists\.txt|podfile(?:\.lock)?|(?:build|settings)\.gradle(?:\.kts)?|gradlew(?:\.bat)?|(?:babel|metro|webpack)\.config\.[cm]?[jt]s|app\.plugin\.[cm]?[jt]s|taskfile[^/]*\.[cm]?[jt]s)$/.test(basename)
    || /\.(?:sh|bat|ps1|podspec|gradle)$/.test(lower) || /(?:^|\/)(?:scripts|bin|build|plugin|plugins)(?:\/|$)/.test(lower)) roles.add('BUILD_INSTALL');
  if (/(?:^|\/)(?:__tests__|tests?|__mocks__|docs?|examples?)(?:\/|$)/.test(lower)
    || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(lower) || /\.(?:md|mdx|rst)$/.test(lower)
    || /^(?:readme|license|licence|changelog|contributing)(?:\.|$)/.test(basename)) roles.add('TEST_DOCUMENTATION');
  if (!roles.size) roles.add('OTHER');
  return ordered(roles);
}

export function buildSourceCensus({ source, treeEntries, manifests, coveredInputs, publicPackages, capabilities, supplementalReads = [] }) {
  if (!source || typeof source.revision !== 'string' || !source.revision || typeof source.tree !== 'string' || !source.tree) throw new Error('Missing fixed source revision/tree');
  if (typeof path.posix.matchesGlob !== 'function') throw new Error('Source census requires Node path.posix.matchesGlob');
  const tree = indexRows(treeEntries, 'path', 'tree'), manifestIndex = indexRows(manifests, 'path', 'manifest');
  const inputs = indexRows(coveredInputs, 'id', 'input'), packages = indexRows(publicPackages, 'id', 'public package'), caps = indexRows(capabilities, 'id', 'capability');
  const supplementalIndex = indexRows(supplementalReads, 'path', 'supplemental read');
  for (const entry of tree.values()) {
    safePath(entry.path, 'tree path');
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(entry.oid ?? '') || !(ordinaryBlob(entry) || (entry.mode === '120000' && entry.type === 'blob') || (entry.mode === '160000' && entry.type === 'commit'))) throw new Error(`Invalid tree oid/mode/type: ${entry.path}`);
    validateSource(entry, source, 'tree');
  }
  const readHashes = new Map(), readBlobs = new Map(), blobHashes = new Map();
  const registerRead = (row, label) => {
    safePath(row.path, `${label} path`);
    validateSource(row, source, label);
    validateHashes(row, label);
    const entry = tree.get(row.path);
    if (entry && (!ordinaryBlob(entry) || entry.oid !== row.blob)) throw new Error(`Conflicting ${label} read/blob: ${row.path}`);
    if (readBlobs.has(row.path) && readBlobs.get(row.path) !== row.blob) throw new Error(`Conflicting ${label} blob: ${row.path}`);
    if (readHashes.has(row.path) && readHashes.get(row.path) !== row.sha256) throw new Error(`Conflicting ${label} sha256: ${row.path}`);
    if (blobHashes.has(row.blob) && blobHashes.get(row.blob) !== row.sha256) throw new Error(`Conflicting ${label} blob sha256: ${row.path}`);
    readHashes.set(row.path, row.sha256); readBlobs.set(row.path, row.blob); blobHashes.set(row.blob, row.sha256);
  };
  for (const row of manifestIndex.values()) {
    if (!(row.path === 'package.json' || row.path.endsWith('/package.json')) || !tree.has(row.path)
      || !row.value || typeof row.value !== 'object' || Array.isArray(row.value)) throw new Error(`Invalid manifest: ${row.path}`);
    registerRead(row, 'manifest');
  }
  const rootManifest = manifestIndex.get('package.json');
  if (!rootManifest) throw new Error('Missing root manifest: package.json');
  const patterns = workspacePatterns(rootManifest.value), owners = [], names = new Set();
  for (const entry of [...tree.values()].sort((a, b) => compare(a.path, b.path))) {
    if (entry.path === 'package.json' || !entry.path.endsWith('/package.json')) continue;
    const root = path.posix.dirname(entry.path), workspace = isWorkspace(root, patterns), template = /^templates\/[^/]+\/package.json$/.test(entry.path);
    if (!workspace && !template) continue;
    const manifest = manifestIndex.get(entry.path);
    if (!manifest || !ordinaryBlob(entry)) throw new Error(`Missing or unreadable candidate manifest: ${entry.path}`);
    const name = manifest.value.name;
    if (typeof name !== 'string' || !name || names.has(name)) throw new Error(`Duplicate or missing owner package name: ${name} at ${entry.path}`);
    names.add(name);
    owners.push({ id: identity('OWNER', root), root, name, kind: workspace ? 'WORKSPACE' : 'TEMPLATE', manifest: { path: manifest.path, blob: manifest.blob, sha256: manifest.sha256 }, publicPackageId: null, capabilityIds: [] });
  }
  owners.sort((a, b) => compare(a.root, b.root));
  const ownersByRoot = new Map(owners.map(row => [row.root, row])), ownersByPackage = new Map();
  for (const pkg of packages.values()) {
    const file = pkg.sourcePath ?? pkg.source?.path ?? pkg.entryAudit?.source?.path;
    safePath(file, 'public package manifest path');
    const owner = ownersByRoot.get(path.posix.dirname(file));
    if (!owner || file !== owner.manifest.path || pkg.name !== owner.name || owner.publicPackageId !== null) throw new Error(`Public package identity differs from discovered manifest: ${pkg.id} at ${file}`);
    validateSource(pkg, source, 'public package');
    const blob = pkg.manifestBlob ?? pkg.source?.blob, sha256 = pkg.manifestSha256 ?? pkg.source?.sha256;
    if ((blob !== undefined && blob !== owner.manifest.blob) || (sha256 !== undefined && sha256 !== owner.manifest.sha256)) throw new Error(`Public package manifest hash differs: ${pkg.id} at ${file}`);
    owner.publicPackageId = pkg.id; ownersByPackage.set(pkg.id, owner);
  }
  for (const owner of owners) if (owner.publicPackageId === null) throw new Error(`Missing public package for discovered manifest: ${owner.name} at ${owner.manifest.path}`);
  for (const cap of caps.values()) {
    const owner = ownersByPackage.get(cap.ownerPackageId);
    if (!owner) throw new Error(`Dangling capability owner package: ${cap.id}/${cap.ownerPackageId}`);
    validateSource(cap, source, 'capability'); owner.capabilityIds.push(cap.id);
  }
  for (const owner of owners) owner.capabilityIds.sort(compare);
  const inputRefs = new Map(), unmatchedInputs = [];
  for (const input of inputs.values()) {
    registerRead(input, 'input');
    if (!tree.has(input.path)) {
      unmatchedInputs.push({ id: identity('UNMATCHED-INPUT', input.id), inputId: input.id, path: input.path, reason: 'PATH_NOT_IN_FIXED_TREE', originalInput: structuredClone(input) });
      continue;
    }
    if (!inputRefs.has(input.path)) inputRefs.set(input.path, []);
    inputRefs.get(input.path).push(structuredClone(input));
  }
  for (const row of supplementalIndex.values()) {
    if (!tree.has(row.path)) throw new Error(`Supplemental read path missing from fixed tree: ${row.path}`);
    registerRead(row, 'supplemental read');
  }
  // Longest roots take precedence so nested workspaces never borrow their parent's owner.
  const roots = [...owners].sort((a, b) => b.root.length - a.root.length || compare(a.root, b.root));
  const files = [...tree.values()].sort((a, b) => compare(a.path, b.path)).map(entry => {
    const owner = roots.find(row => entry.path.startsWith(row.root + '/'));
    const verified = readHashes.has(entry.path);
    return { id: identity('FILE', entry.path), path: entry.path, oid: entry.oid, mode: entry.mode, type: entry.type,
      ownerId: owner?.id ?? null, ownershipStatus: owner ? 'DISCOVERED_OWNER' : 'OUTSIDE_DISCOVERED_OWNERS_REQUIRES_REVIEW',
      roles: rolesFor(entry.path), roleStatus: 'PATH_ROLE_CANDIDATE_ONLY',
      contentStatus: verified ? 'READ_AND_HASH_VERIFIED' : 'GIT_TREE_OID_ONLY', sha256: verified ? readHashes.get(entry.path) : null,
      inputRefs: (inputRefs.get(entry.path) ?? []).sort((a, b) => compare(a.id, b.id)),
      supplementalRefs: supplementalIndex.has(entry.path) ? [structuredClone(supplementalIndex.get(entry.path))] : [],
      capabilityIds: [...(owner?.capabilityIds ?? [])], capabilityRelation: 'OWNER_ASSOCIATION_ONLY' };
  });
  const categoryGaps = owners.flatMap(owner => semanticCategories.map(category => ({ id: identity('CATEGORY-GAP', `${owner.root}:${category}`), ownerId: owner.id, path: owner.manifest.path, category,
    status: 'SEMANTIC_REVIEW_REQUIRED', semanticCoverageProven: false, evidence: 'PATH_ROLE_CANDIDATES_DO_NOT_PROVE_PUBLIC_SEMANTICS' }))).sort((a, b) => compare(a.id, b.id));
  unmatchedInputs.sort((a, b) => compare(a.id, b.id));
  return { schemaVersion: 1, source: structuredClone(source), owners, files, categoryGaps, unmatchedInputs,
    metadata: { workspacePatterns: patterns, workspaceOwners: owners.filter(row => row.kind === 'WORKSPACE').length, templateOwners: owners.filter(row => row.kind === 'TEMPLATE').length,
      ownerCount: owners.length, fileCount: files.length, readAndHashVerified: files.filter(row => row.contentStatus === 'READ_AND_HASH_VERIFIED').length,
      gitTreeOidOnly: files.filter(row => row.contentStatus === 'GIT_TREE_OID_ONLY').length, matchedInputCount: [...inputRefs.values()].reduce((count, refs) => count + refs.length, 0), unmatchedInputCount: unmatchedInputs.length,
      supplementalReadCount: supplementalIndex.size,
      outsideOwnerFiles: files.filter(row => row.ownerId === null).length, semanticCategoryGaps: categoryGaps.length, publicSemanticCoverageProven: false,
      stageClosable: false, inputDifferenceMeaning: 'NOT_INCLUDED_IN_EXISTING_ANALYSIS_INPUTS_NOT_PROOF_OF_MISSING_API',
      contentVerificationBoundary: 'MANIFEST_AND_INPUT_HASH_ATTESTATIONS_MUST_BE_VERIFIED_BY_SOURCE_LOADER' } };
}

export function validateSourceCensus(actual, expected) {
  const failures = [];
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return { valid: false, failures: ['Source census must be an object'] };
  for (const table of tables) {
    if (!Array.isArray(actual[table])) { failures.push(`Missing table: ${table}`); continue; }
    const rows = new Map();
    for (const row of actual[table]) {
      if (!row || typeof row.id !== 'string' || !row.id || rows.has(row.id)) failures.push(`Duplicate or missing ${table} identity: ${row?.id} at ${row?.path ?? row?.root ?? '?'}`);
      if (row) rows.set(row.id, row);
    }
    const expectedIds = new Set();
    for (const row of expected[table]) {
      expectedIds.add(row.id);
      const found = rows.get(row.id);
      if (!found || canonical(found) !== canonical(row)) failures.push(`${found ? 'Changed' : 'Missing'} ${table}: ${row.id} at ${row.path ?? row.root ?? '?'}`);
    }
    for (const [id, row] of rows) if (!expectedIds.has(id)) failures.push(`Unexpected ${table}: ${id} at ${row.path ?? row.root ?? '?'}`);
  }
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const key of keys) if (!tables.includes(key) && canonical(actual[key]) !== canonical(expected[key])) failures.push(`Changed metadata field: ${key}`);
  return { valid: failures.length === 0, failures };
}

export function serializeSourceCensus(value) {
  return JSON.stringify(JSON.parse(canonical(value)), null, 2) + '\n';
}
