import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { SDK54_EXPO_COMMIT } from './catalog.mjs';
import { readSourceTree } from './source-inventory.mjs';
import { parseFixedYarnLock } from './external-sources.mjs';
import { publisherIdentity, publisherLifecycle, readMetadataReceipt } from './m0-external-seed-sources.mjs';

const require = createRequire(new URL('../../apps/cli/package.json', import.meta.url));
const semver = require('semver');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const tree = '5457e824b21d968e55c8f533cdf1751860160a92';
const treeEntriesSha256 = '783501483543f6e134529888037909a5b3eceead5cea74149c93554f3dc2851d';
const fixedInputs = [
  { kind: 'seed-range-facts', path: 'outputs/sdk54/ai-e2e/20261023-m0-entry-template/seed-range-facts.json', sha256: '0d0a160711152a0fd6bcc8db817805c48e28924e014b99cd10967ec90d2aede5' },
  { kind: 'external-seed-results', path: 'outputs/sdk54/ai-e2e/20261023-m0-source-closure/external-seed-results.json', sha256: 'b15e76292339ac54a6d1dfd2b8a22ab3e053d9279afd52564613e9e778e37119' },
  { kind: 'previous-remaining-work', path: 'outputs/sdk54/ai-e2e/20261027-m0-export-patterns/remaining-work.json', sha256: '934326a128565521cce09eec74c7b25403152ba9f7ee352b189d7bf2e24a3d74' },
  { kind: 'harmony-target-catalog', path: 'packages/expo/bundledNativeModules.json', sha256: 'c88fa93aaa575a7b00ca5983eb6a0129228461a0faff2b5b639258b25085f763' },
];
const bundlePath = 'packages/expo/bundledNativeModules.json';
const policies = [
  { name: 'expo-dev-launcher', manifest: 'packages/expo-dev-launcher/package.json', blob: '8febd026151f6e8b10dc53d945017babb7cbbb78', role: 'NATIVE_PLUGIN_CONFIGURATION_WITHOUT_DECLARED_JS_ROOT', evidence: ['packages/expo-dev-launcher/expo-module.config.json'] },
  { name: 'expo-env-info', manifest: 'packages/expo-env-info/package.json', blob: '90bc5ce2b0c0de0f730f0d668bb1e04c05a23528', role: 'BIN_NCC_BUILD_CONTRACT_WITHOUT_DECLARED_IMPORT_ROOT', evidence: ['packages/expo-env-info/tsconfig.json'] },
  { name: 'expo-module-template', manifest: 'packages/expo-module-template/package.json', blob: 'ae07e852a8a14d478f9fcc8c2f1bd9edb7720ddf', role: 'GENERATOR_TEMPLATE_ROOT_DISTINCT_FROM_GENERATED_PACKAGE', evidence: ['packages/expo-module-template/$package.json'] },
  { name: 'expo-structured-headers', manifest: 'packages/expo-structured-headers/package.json', blob: '71f36817a4e32ab71ba5054d0526189d18c01996', role: 'DECLARED_JS_MAIN_MISSING_WITH_INDEPENDENT_NATIVE_CONFIG', evidence: ['packages/expo-structured-headers/expo-module.config.json'] },
  { name: 'expo-workflow-testing', manifest: 'apps/expo-workflow-testing/package.json', blob: '0cd6a985e23baa4b13463c3a758428cb7d99cb17', role: 'WORKFLOW_APPLICATION_CONFIGURATION_WITHOUT_DECLARED_JS_ROOT', evidence: ['apps/expo-workflow-testing/app.json', 'apps/expo-workflow-testing/eas.json'] },
  { name: 'unimodules-app-loader', manifest: 'packages/unimodules-app-loader/package.json', blob: '4fe35afbb970eb7d85d4f75130424ddf7a817ba7', role: 'NATIVE_MODULE_CONFIGURATION_WITHOUT_DECLARED_JS_ROOT', evidence: ['packages/unimodules-app-loader/expo-module.config.json'] },
];
const gitFiles = [...new Set([bundlePath, 'yarn.lock', 'packages/expo-router/package.json', 'packages/jest-expo/package.json', ...policies.flatMap(row => [row.manifest, ...row.evidence])])].sort(compare);

function assertSource(source) {
  if (source?.revision !== SDK54_EXPO_COMMIT) throw new Error('Scope fixed source revision mismatch');
  if (source.tree !== tree) throw new Error('Scope fixed source tree mismatch');
}

function assertCompleteTree(entries) {
  if (!Array.isArray(entries)) throw new Error('Missing complete fixed tree');
  const normalized = entries.map(({ path: file, mode, type, oid }) => ({ path: file, mode, type, oid })).sort((a, b) => compare(a.path, b.path));
  if (normalized.length !== 19546 || sha256(JSON.stringify(normalized)) !== treeEntriesSha256) throw new Error('Scope complete fixed tree path/object set mismatch');
  return new Map(normalized.map(entry => [entry.path, entry]));
}

function documentEvidence(document) {
  return { kind: document.kind, path: document.path, sha256: document.sha256, verification: 'FIXED_LOCAL_BYTES_SHA256_VERIFIED' };
}

function validateInputs(inputs) {
  if (inputs?.schemaVersion !== 1 || inputs.policy !== 'fixed-v1') throw new Error('Unsupported scope input policy');
  assertSource(inputs.source);
  if (!isDeepStrictEqual(inputs.gitFiles, gitFiles)) throw new Error('Scope Git input file set mismatch');
  const documents = inputs.documents;
  if (!Array.isArray(documents) || new Set(documents.map(row => row.path)).size !== documents.length) throw new Error('Duplicate or missing scope input documents');
  const byPath = new Map(documents.map(row => [row.path, row]));
  const read = expected => {
    const row = byPath.get(expected.path);
    if (!row || row.kind !== expected.kind || row.sha256 !== expected.sha256 || typeof row.text !== 'string' || sha256(row.text) !== expected.sha256) throw new Error(`Scope input hash mismatch: ${expected.kind} ${expected.path}`);
    return JSON.parse(row.text);
  };
  const [facts, externalResults, remainingWork, targetCatalog] = fixedInputs.map(read);
  assertSource(facts.source); assertSource(externalResults.source);
  if (externalResults.summary.historicalSeedIdentitiesClosed !== 0 || externalResults.summary.pendingSeedIdentityDecisions !== 13 || externalResults.seeds.length !== 13 || facts.remaining.unresolvedIdentityOrFixedRange.length !== 13) throw new Error('Scope historical identity boundary mismatch');
  const publisherMetadata = externalResults.seeds.map(seed => {
    const metadataEvidence = { kind: 'publisher-metadata', path: seed.metadata.path, sha256: seed.metadata.sha256 };
    const receiptEvidence = { kind: 'publisher-receipt', path: seed.metadata.receiptPath, sha256: seed.metadata.receiptSha256 };
    const metadata = read(metadataEvidence), receipt = read(receiptEvidence);
    const expectedUrl = `https://registry.npmjs.org/${encodeURIComponent(seed.name)}/${seed.version}`;
    if (receipt.path !== seed.metadata.path || receipt.url !== expectedUrl || receipt.sha256 !== metadataEvidence.sha256 || !Number.isFinite(Date.parse(receipt.retrievedAt))) throw new Error(`Scope publisher receipt integrity mismatch: ${seed.name}`);
    const identity = publisherIdentity(metadata, seed);
    if (!isDeepStrictEqual(identity, seed.identity) || !isDeepStrictEqual(publisherLifecycle(metadata), seed.lifecycle) || seed.upstreamInstalledIdentity !== 'NOT_VERIFIED') throw new Error(`Scope publisher metadata identity or lifecycle mismatch: ${seed.name}`);
    return { name: seed.name, version: seed.version, metadata, receipt, metadataEvidence: documentEvidence(byPath.get(metadataEvidence.path)), receiptEvidence: documentEvidence(byPath.get(receiptEvidence.path)) };
  });
  if (documents.length !== fixedInputs.length + publisherMetadata.length * 2) throw new Error('Unexpected scope input documents');
  const evidence = documents.map(documentEvidence).sort((a, b) => compare(a.path, b.path));
  for (const [key, value] of Object.entries({ facts, externalResults, remainingWork, targetCatalog, publisherMetadata, evidence })) {
    if (!isDeepStrictEqual(inputs[key], value)) throw new Error(`Scope input ${key} differs from verified documents`);
  }
  return { facts, externalResults, remainingWork, targetCatalog, publisherMetadata, evidence };
}

export function loadScopeDecisionInputs({ sourceDir }) {
  const fixed = readSourceTree(sourceDir, SDK54_EXPO_COMMIT);
  const source = { revision: SDK54_EXPO_COMMIT, tree: fixed.tree };
  assertSource(source); assertCompleteTree(fixed.entries);
  const documents = fixedInputs.map(row => ({ ...row, text: fs.readFileSync(row.path, 'utf8') }));
  for (const document of documents) if (sha256(document.text) !== document.sha256) throw new Error(`Scope input hash mismatch: ${document.path}`);
  const [facts, externalResults, remainingWork, targetCatalog] = documents.map(row => JSON.parse(row.text));
  const publisherMetadata = externalResults.seeds.map(seed => {
    const { bytes, receipt } = readMetadataReceipt(seed.metadata.path, seed.metadata.receiptPath, seed.metadata.url);
    const metadataDocument = { kind: 'publisher-metadata', path: seed.metadata.path, sha256: seed.metadata.sha256, text: bytes.toString('utf8') };
    const receiptDocument = { kind: 'publisher-receipt', path: seed.metadata.receiptPath, sha256: seed.metadata.receiptSha256, text: fs.readFileSync(seed.metadata.receiptPath, 'utf8') };
    documents.push(metadataDocument, receiptDocument);
    return { name: seed.name, version: seed.version, metadata: JSON.parse(bytes), receipt, metadataEvidence: documentEvidence(metadataDocument), receiptEvidence: documentEvidence(receiptDocument) };
  });
  const inputs = { schemaVersion: 1, policy: 'fixed-v1', source, gitFiles: [...gitFiles], documents, facts, externalResults, remainingWork, targetCatalog, publisherMetadata,
    evidence: documents.map(documentEvidence).sort((a, b) => compare(a.path, b.path)) };
  validateInputs(inputs);
  return inputs;
}

export function buildScopeDecisions({ source, treeEntries, files, entryLedger, inputs }) {
  assertSource(source);
  const treeByPath = assertCompleteTree(treeEntries);
  const verified = validateInputs(inputs);
  const gitEvidence = new Map();
  for (const file of gitFiles) {
    const entry = treeByPath.get(file), text = files.get(file);
    if (!entry || entry.type !== 'blob' || entry.mode === '120000') throw new Error(`Missing safe fixed blob: ${file}`);
    if (typeof text !== 'string') throw new Error(`Missing scope source text: ${file}`);
    const blob = createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
    if (blob !== entry.oid) throw new Error(`Scope source blob integrity mismatch: ${file}`);
    gitEvidence.set(file, { path: file, revision: SDK54_EXPO_COMMIT, blob, sha256: sha256(text) });
  }
  const bundle = JSON.parse(files.get(bundlePath));
  const locks = parseFixedYarnLock(files.get('yarn.lock'));
  const seeds = verified.facts.remaining.unresolvedIdentityOrFixedRange.map(pending => {
    const fact = verified.facts.records.find(row => row.id === pending.id && row.name === pending.name);
    const external = verified.externalResults.seeds.find(row => row.name === pending.name);
    const publisher = verified.publisherMetadata.find(row => row.name === pending.name);
    if (!fact || !external || !publisher) throw new Error(`Missing fixed seed fact: ${pending.name}`);
    const spec = fact.fixedBundleSpec ?? fact.seedSpec;
    if ((bundle[fact.name] ?? null) !== fact.fixedBundleSpec || verified.targetCatalog[fact.name] !== fact.seedSpec || external.spec !== spec || semver.minVersion(spec)?.version !== external.version) throw new Error(`Scope seed range mismatch: ${fact.name}`);
    const lifecycle = { ...publisherLifecycle(publisher.metadata), migration: null, rename: 'NOT_ESTABLISHED' };
    const migrations = { '@react-native-community/viewpager': 'react-native-pager-view', 'expo-app-auth': 'expo-auth-session', 'expo-google-app-auth': 'expo-auth-session' };
    if (migrations[fact.name] && lifecycle.deprecated?.includes(migrations[fact.name])) lifecycle.migration = { package: migrations[fact.name], basis: 'EXPLICIT_PUBLISHER_VERSION_DEPRECATION_TEXT', quote: lifecycle.deprecated, relation: 'MIGRATION_GUIDANCE_NOT_RENAME', evidence: publisher.metadataEvidence };
    const scopeDecision = { status: 'DECIDED', disposition: fact.fixedBundleSpec === null ? 'HARMONY_TARGET_ONLY_SEPARATE_FROM_UPSTREAM_BASELINE' : fact.name === 'react-server-dom-webpack' ? 'RETAIN_FIXED_BUNDLE_RANGE_WITH_UNRESOLVED_COMPATIBILITY' : 'RETAIN_FIXED_UPSTREAM_BUNDLE_DECLARATION',
      fixedBundleSpec: fact.fixedBundleSpec, targetCatalogSpec: fact.seedSpec, publisherCandidateVersion: external.version,
      candidateSelection: external.selection, baselineUpgradeAccepted: false, apiScopeAcceptance: 'NOT_VERIFIED',
      evidence: [gitEvidence.get(bundlePath), verified.evidence.find(row => row.kind === 'harmony-target-catalog'), publisher.metadataEvidence, publisher.receiptEvidence] };
    if (fact.name === 'react-server-dom-webpack') {
      const consumerFacts = fact.declaredConsumers.map(consumer => {
        const manifest = JSON.parse(files.get(consumer.source.path));
        if (manifest[consumer.section]?.[fact.name] !== consumer.spec) throw new Error('RSDW fixed consumer declaration mismatch');
        return { ...consumer, candidateSatisfies: semver.satisfies(external.version, consumer.spec), evidence: gitEvidence.get(consumer.source.path) };
      });
      scopeDecision.compatibility = { baselineUpgradeAccepted: false, lockRangeMismatch: true,
        observedLocks: locks.filter(lock => lock.name === fact.name), lockEvidence: gitEvidence.get('yarn.lock'),
        declaredConsumers: consumerFacts, consumerPeerConflicts: consumerFacts.filter(row => row.section === 'peerDependencies' && !row.candidateSatisfies),
        publisherPeerDependencies: publisher.metadata.peerDependencies ?? {},
        fixedBundlePublisherPeerConflicts: Object.entries(publisher.metadata.peerDependencies ?? {}).filter(([name, range]) => bundle[name] && !semver.intersects(bundle[name], range)).map(([name, range]) => ({ name, fixedBundleSpec: bundle[name], publisherRange: range })),
        securityDeprecation: lifecycle.deprecated, policy: 'NO_AUTOMATIC_BASELINE_UPGRADE_FROM_SECURITY_DEPRECATION_OR_PEER_CONFLICT' };
    }
    return { id: fact.id, name: fact.name, originalFacts: structuredClone(fact), originalPendingFacts: structuredClone(pending), originalPublisherFacts: structuredClone(external),
      scopeDecision, lifecycle,
      sourceCompleteness: { status: external.sourceLinkStatus, publisherIdentity: publisherIdentity(publisher.metadata, external), repository: publisher.metadata.repository ?? null, gitHead: publisher.metadata.gitHead ?? null, remaining: [...external.remaining], archiveAcceptance: 'NOT_VERIFIED', sourceBuildEquivalence: 'NOT_ESTABLISHED' },
      historicalIdentity: { status: 'NOT_VERIFIED', baselineIdentityStatus: fact.baselineIdentityStatus, closed: false, publisherCandidateIsHistoricalIdentity: false },
      runtime: { status: 'NOT_VERIFIED', harmonySupportAccepted: false } };
  }).sort((a, b) => compare(a.id, b.id));
  const ledger = entryLedger?.entries;
  if (!Array.isArray(ledger) || new Set(ledger.map(row => row.id)).size !== ledger.length) throw new Error('Missing or duplicate scope entry ledger');
  const missing = verified.remainingWork.actualMissingEntries;
  if (missing.length !== policies.length) throw new Error('Fixed missing entry set mismatch');
  const entries = policies.map(policy => {
    const original = missing.find(row => row.request === policy.name);
    const entry = ledger.find(row => row.id === original?.id);
    if (!entry || !isDeepStrictEqual(entry.source, original.source) || entry.request !== policy.name || entry.packageId !== `PKG:${policy.name}` || entry.kind !== 'default' || entry.patternFamily || entry.condition !== original.condition || entry.runtimeAcceptance !== 'NOT_VERIFIED' || entry.publicationAcceptance !== 'NOT_VERIFIED') throw new Error(`Missing or changed fixed blocked entry: ${policy.name}`);
    const manifest = JSON.parse(files.get(policy.manifest));
    const manifestEvidence = gitEvidence.get(policy.manifest);
    if (manifestEvidence.blob !== policy.blob || manifest.name !== policy.name) throw new Error(`Reviewed scope manifest identity mismatch: ${policy.name}`);
    const explicit = entry.condition === '/main';
    const targetValue = explicit ? manifest.main : './index';
    if (explicit ? targetValue !== 'index.js' : ['main', 'module', 'types', 'typings', 'react-native', 'browser', 'exports'].some(key => Object.hasOwn(manifest, key))) throw new Error(`Reviewed scope root declaration changed: ${policy.name}`);
    const requestedPath = path.posix.join(path.posix.dirname(policy.manifest), targetValue);
    const expectedTarget = { requestedPath, path: null, moduleId: null, status: 'BLOCKED', method: null, reason: 'missing-entry-target' };
    if (entry.declaredTarget !== targetValue || !isDeepStrictEqual(entry.target, expectedTarget)) throw new Error(`Fixed blocked entry target changed: ${policy.name}`);
    const candidatePaths = explicit ? [requestedPath] : ['', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.json'].map(extension => requestedPath + extension);
    if (candidatePaths.some(file => treeByPath.has(file))) throw new Error(`Blocked target exists in complete fixed tree: ${policy.name}`);
    const evidence = [manifestEvidence, ...policy.evidence.map(file => gitEvidence.get(file))];
    const contracts = Object.fromEntries([policy.manifest, ...policy.evidence].map(file => [file, JSON.parse(files.get(file))]));
    return { id: entry.id, packageId: entry.packageId, request: entry.request, condition: entry.condition, source: structuredClone(entry.source), target: structuredClone(entry.target),
      obligation: { kind: explicit ? 'DECLARED_MAIN_TARGET_GAP' : 'DEFAULT_RESOLUTION_PROBE', status: explicit ? 'DECLARED_TARGET_GAP_REMAINS_BLOCKED' : 'PROBE_ONLY_NO_DECLARED_ROOT_CAPABILITY_ACCEPTED',
        policy: { id: `SDK54-FIXED-ROOT:${policy.name}`, role: policy.role, manifest: manifestEvidence, acceptance: 'REVIEWED_PER_PACKAGE_FIXED_MANIFEST_NOT_GENERIC_FIELD_EXEMPTION' },
        evidence, contracts, absenceEvidence: { method: 'COMPLETE_FIXED_TREE_PATH_SET', revision: SDK54_EXPO_COMMIT, tree, treePathCount: treeEntries.length, treeEntriesSha256, candidatePaths, packagePaths: treeEntries.filter(row => row.path.startsWith(path.posix.dirname(policy.manifest) + '/')).map(row => row.path).sort(compare) },
        sourceInventoryRetained: true, runtimeAcceptance: 'NOT_VERIFIED', publicationAcceptance: 'NOT_VERIFIED', nativePlatformAcceptance: 'NOT_VERIFIED' } };
  }).sort((a, b) => compare(a.id, b.id));
  return { schemaVersion: 1, policy: 'fixed-v1', source: { revision: SDK54_EXPO_COMMIT, tree }, inputs: verified.evidence, seeds, entries,
    summary: { seeds: seeds.length, scopeDecisionsComplete: seeds.length, pendingScopeDecisions: 0, historicalSeedIdentitiesClosed: 0, pendingSeedIdentityDecisions: seeds.length,
      entries: entries.length, defaultResolutionProbes: entries.filter(row => row.obligation.kind === 'DEFAULT_RESOLUTION_PROBE').length, declaredMainTargetGaps: entries.filter(row => row.obligation.kind === 'DECLARED_MAIN_TARGET_GAP').length, stageClosable: false, harmonySupportAccepted: false },
    boundaries: ['SCOPE_DECISION_IS_NOT_HISTORICAL_INSTALL_IDENTITY', 'PUBLISHER_CANDIDATE_IS_NOT_UPSTREAM_INSTALLED_IDENTITY', 'PUBLISHER_MIGRATION_GUIDANCE_IS_NOT_RENAME', 'SOURCE_REPOSITORY_AND_GITHEAD_ARE_NOT_SOURCE_BUILD_EQUIVALENCE', 'DEFAULT_RESOLUTION_PROBE_IS_NOT_DECLARED_ROOT_CAPABILITY', 'DECLARED_MAIN_TARGET_GAP_REMAINS_BLOCKED', 'NO_BUILD_PUBLICATION_RUNTIME_OR_HARMONY_ACCEPTANCE', 'M0_CLOSURE_AND_TYPE_ROOTS_ISOLATION_NOT_ACCEPTED'] };
}
