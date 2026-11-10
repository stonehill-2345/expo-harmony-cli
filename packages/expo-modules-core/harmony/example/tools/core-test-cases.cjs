// Required case identities for the Core example's device acceptance contract.
module.exports = {
  EXPO_CORE_EXAMPLE_RESULTS: [
    'Public requireNativeModule', 'Synchronous native call', 'Native event and unsubscribe',
    'SharedObject resource release', 'Worker Promise resolve / JS remains responsive',
    'Worker Promise rejection', 'Async cancellation / late completion',
    'Native view props / events / imperative ref',
  ],
  EXPO_CORE_INTEROP_RESULTS: ['raw.lookup', 'core.lookup.identity', ...['raw', 'core'].flatMap(route =>
    ['constants', 'sync.string', 'sync.null', 'promise.resolve', 'promise.reject.code-message',
      'promise.reject.string', 'promise.reject.uncoded'].map(name => `${route}.${name}`))],
  EXPO_CORE_CONTEXT_RESULTS: ['version.from-package', ...['cacheDir', 'documentsDir'].flatMap(key =>
    [`${key}.native-oracle`, `${key}.native-file-io`]),
    'context.reject-access-after-destroy', 'context.reload-rejects-after-destroy'],
  EXPO_CORE_UUID_RESULTS: ['uuid.v4.native-random-format', ...['known-vector', 'namespace-array',
    'utf8', 'empty-name', 'uppercase-namespace', 'invalid-namespace', 'invalid-namespace-length',
    'invalid-namespace-bytes'].map(name => `uuid.v5.${name}`)],
  EXPO_CORE_BOUNDARY_RESULTS: ['platform.harmony-selection', 'module.missing-public-contract',
    'installer.repeated-identity', 'async.coded-native-error', 'resource.release-revokes-binding-with-external-owner'],
  EXPO_CORE_VIEW_RESULTS: ['view.named-public-config', 'view.named-props-event-ref-native-read',
    'view.unmount-revokes-ref', 'view.pending-read-rejects-after-unmount', 'view.stale-ref-cannot-address-a-new-real-view'],
};
