import assert from 'node:assert/strict';
import test from 'node:test';

const implementation = await import('../m0-final-plugin-contracts.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('m0-final-plugin-contracts.mjs')) return {};
  throw error;
});
const file = 'packages/example/plugin/src/index.ts';
const text = `
type ConfigPlugin<P = void> = (config: any, props: P) => any;
type Props = { mode?: 'append' | 'replace'; value?: string };
function setValue(config: any, value: string | undefined) {
  const old = config.values.find((item: any) => item.key === 'value');
  if (value) { if (old) old.value = value; else config.values.push({ key: 'value', value }); }
  else if (old) config.values.splice(config.values.indexOf(old), 1);
  return config;
}
export function createNamedPlugin(name: string, fallback = 'append') {
  const withUnknown: ConfigPlugin<Props> = (config, props = {}) => {
    const mode = props.mode ?? config.mode ?? fallback;
    if (mode === 'replace') delete config.previous;
    return setValue(config, props.value);
  };
  Object.defineProperty(withUnknown, 'name', { value: name });
  return withUnknown;
}
export const withSpecial = createNamedPlugin('Special', 'replace');
const withLocal: ConfigPlugin<Props> = (config, props) => setValue(config, props.value);
export default createRunOncePlugin(withLocal, 'example', '1.0.0');
`;
const candidates = ['withUnknown', 'withLocal'].map(name => ({ id: `CONFIG-PLUGIN:${file}:${text.indexOf(name + ':')}`, sourcePath: file, symbol: name, start: text.indexOf(name + ':') }));
const linkage = candidates.map(candidate => ({ ...candidate, name: candidate.symbol, linkage: 'NO_DIRECT_EXPORTED_SYMBOL_MATCH', directPublicExportIds: [], conservativeExportIds: [], moduleEntryIds: ['ENTRY:example'], directEntryIds: [], sourceTreePublicationPackageIds: [] }));
const input = () => ({ files: new Map([[file, text]]), candidates, linkage, typeContracts: null });

test('plugin final contracts expose a concrete finite-source builder', () => {
  assert.equal(typeof implementation.buildFinalPluginContracts, 'function');
});
test('factory closure and wrapper retain real public ownership without treating unmatched symbols as internal', () => {
  assert.equal(typeof implementation.buildFinalPluginContracts, 'function');
  const result = implementation.buildFinalPluginContracts(input());
  const factory = result.plugins.find(plugin => plugin.name === 'withUnknown');
  const wrapper = result.plugins.find(plugin => plugin.name === 'withLocal');
  assert.equal(factory.disposition.kind, 'PUBLIC_FACTORY_RETURNED_PLUGIN');
  assert(factory.disposition.owners.some(owner => owner.name === 'createNamedPlugin'));
  assert(factory.disposition.factoryBindings.some(binding => binding.arguments[0] === "'Special'" && binding.arguments[1] === "'replace'"));
  assert.equal(wrapper.disposition.kind, 'PUBLIC_WRAPPER_EXPOSED_PLUGIN');
  assert(wrapper.disposition.owners.some(owner => owner.name === 'default'));
  assert.deepEqual(result.declarations.find(declaration => declaration.name === 'withLocal').parameters, ['config', 'props']);
  assert.deepEqual(factory.entryIds, ['ENTRY:example']);
});
test('finite rules preserve defaults, enum declarations, source priority, consumed inputs and guarded writes/deletes', () => {
  assert.equal(typeof implementation.buildFinalPluginContracts, 'function');
  const result = implementation.buildFinalPluginContracts(input());
  const plugin = result.plugins[0];
  const declarations = result.declarations.filter(declaration => plugin.reachableDeclarationIds.includes(declaration.id));
  const rules = declarations.flatMap(declaration => declaration.rules);
  assert(rules.some(rule => rule.kind === 'DEFAULT' && rule.expression === 'props = {}'));
  assert(rules.some(rule => rule.kind === 'PRIORITY' && JSON.stringify(rule.operands) === JSON.stringify(['props.mode', 'config.mode', 'fallback'])));
  assert(rules.some(rule => rule.kind === 'WRITE' && rule.expression === 'old.value = value' && rule.guards.some(guard => guard.expression === 'value')));
  assert(rules.some(rule => rule.kind === 'DELETE' && rule.expression === 'delete config.previous'));
  assert(rules.some(rule => rule.kind === 'CALL' && rule.expression.includes('config.values.splice')));
  assert(result.declarations.some(declaration => declaration.name === 'Props' && declaration.source.text.includes("'append' | 'replace'")));
  assert(plugin.effectContract.ruleIds.writes.length > 0);
  assert(plugin.effectContract.ruleIds.deletions.length > 0);
  assert(plugin.effectContract.ruleIds.guards.length > 0);
  const helper = declarations.find(declaration => declaration.name === 'setValue');
  assert.equal(helper.executionOrder.kind, 'Sequence');
  assert(helper.executionOrder.steps.some(step => step.kind === 'Branch' && step.condition === 'value' && step.whenFalse));
  assert(declarations.every(declaration => declaration.source.sha256 && declaration.source.text));
});
test('public composition owners retain their complete source algorithm and bound path into a plugin', () => {
  const composition = `
type ConfigPlugin<P = void> = (config: any, props: P) => any;
const withLeaf: ConfigPlugin<{ enabled?: boolean }> = (config, props = {}) => {
  if (props.enabled) config.enabled = true;
  return config;
};
function intermediate(config: any, enabled = true) {
  return withLeaf(config, { enabled });
}
function sibling(config: any) { config.sibling = true; return config; }
export function publicOwner(config: any, enabled = false) {
  if (enabled) intermediate(config, enabled);
  return sibling(config);
}
`;
  const candidate = { id: `CONFIG-PLUGIN:${file}:${composition.indexOf('withLeaf:')}`, sourcePath: file, symbol: 'withLeaf', start: composition.indexOf('withLeaf:') };
  const data = { files: new Map([[file, composition]]), candidates: [candidate], linkage: [{ ...candidate, moduleEntryIds: ['ENTRY:composition'] }] };
  const result = implementation.buildFinalPluginContracts(data), plugin = result.plugins[0];
  const declarations = new Map(result.declarations.map(row => [row.id, row]));
  const owner = plugin.disposition.owners.find(row => row.name === 'publicOwner');
  assert(owner);
  assert(declarations.has(owner.declarationId), 'public owner source must be archived');
  const contract = plugin.ownershipContract.owners.find(row => row.declarationId === owner.declarationId);
  assert.deepEqual(contract.candidatePathDeclarationIds.map(id => declarations.get(id).name).sort(), ['intermediate', 'publicOwner', 'withLeaf']);
  assert(contract.reachableDeclarationIds.some(id => declarations.get(id).name === 'sibling'), 'full owner algorithm includes sibling effects');
  for (const edge of contract.candidatePathEdges) {
    assert(declarations.has(edge.fromDeclarationId));
    assert(declarations.has(edge.toDeclarationId));
    assert(edge.callRuleIds.some(id => declarations.get(edge.fromDeclarationId).rules.some(rule => rule.id === id && rule.inputBindings.some(binding => binding.declarationId === edge.toDeclarationId && binding.arguments.length))));
  }
  const altered = structuredClone(result);
  altered.plugins[0].ownershipContract.owners[0].candidatePathEdges = [];
  assert.equal(implementation.validateFinalPluginContracts(altered, data).valid, false);
});
test('missing candidate source or declaration stays blocked', () => {
  assert.equal(typeof implementation.buildFinalPluginContracts, 'function');
  const result = implementation.buildFinalPluginContracts({ ...input(), files: new Map() });
  assert.equal(result.summary.blocked, 2);
  assert(result.plugins.every(plugin => plugin.status === 'BLOCKED_SOURCE_OR_OWNERSHIP'));
});
test('a source export alone does not invent a public entry or publication rule', () => {
  const data = input();
  data.linkage = linkage.map(row => ({ ...row, moduleEntryIds: [] }));
  const result = implementation.buildFinalPluginContracts(data);
  assert.equal(result.summary.blocked, 2);
});
test('validator rejects dropped options, sources and factory owner links against source rebuild', () => {
  assert.equal(typeof implementation.buildFinalPluginContracts, 'function');
  assert.equal(typeof implementation.validateFinalPluginContracts, 'function');
  const expected = implementation.buildFinalPluginContracts(input());
  for (const mutate of [
    result => result.declarations.find(declaration => declaration.name === 'Props').source.text = '{}',
    result => result.declarations.find(declaration => declaration.name === 'withUnknown').rules = [],
    result => result.plugins[0].disposition.owners = [],
    result => result.sources.pop(),
  ]) {
    const altered = structuredClone(expected); mutate(altered);
    assert.equal(implementation.validateFinalPluginContracts(altered, input()).valid, false);
  }
  assert.equal(implementation.validateFinalPluginContracts(expected, input()).valid, true);
});
