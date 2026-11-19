import assert from 'node:assert/strict';
import test from 'node:test';

import { compareOptionSurfaces, extractSchemaSurface, extractTypeSurface, validateSurfaceRecords } from '../plugin-surface.mjs';
import * as typeSurfaces from '../plugin-surface-types.mjs';

const descriptor = { id: 'PLG-FIXTURE', sourcePath: 'packages/test/plugin/src/index.ts', symbol: 'withTest' };

function typeFixture(type = 'Props') {
  return new Map([
    [descriptor.sourcePath, `import type { Imported } from '@expo/options/build/options';
      type Props = { fonts?: (string | Imported)[]; headers: Record<string, string | string[]> } | null;
      const withTest: ConfigPlugin<${type}> = (config, props) => config;`],
    ['packages/@expo/options/src/options.ts', `interface Base { name: string; dark?: { image?: string } }
      export type Imported = Base & { definitions: { path: string; style?: 'normal' | 'italic' }[] }`],
  ]);
}

function option(surface, name) {
  const value = surface.options.find((entry) => entry.path === name);
  assert.ok(value, `missing option ${name}`);
  return value;
}

test('PLG-01: expands imported/intersected nested array types and literal unions', () => {
  const surface = extractTypeSurface(typeFixture(), descriptor);
  assert.ok(option(surface, 'fonts[].dark.image').occurrences[0].source.path.endsWith('options.ts'));
  const style = option(surface, 'fonts[].definitions[].style');
  assert.match(JSON.stringify(style), /normal/);
  assert.match(JSON.stringify(style), /italic/);
  assert.equal(style.occurrences[0].required, false);
  assert.ok(option(surface, 'headers.*'));
  assert.ok(option(surface, 'headers.*[]'));
  assert.equal(option(surface, 'headers').occurrences[0].required, true);
  assert.deepEqual(extractTypeSurface(typeFixture(), descriptor), surface);
});

test('batch option extraction isolates unresolved plugins and selects duplicate names by source position',()=>{
 const source=descriptor.sourcePath,text='function first() { const withTest: ConfigPlugin<{ nested: { image: string } }> = c => c; }\nfunction second() { const withTest: ConfigPlugin<{ bad: Missing }> = c => c; }';
 const files=new Map([[source,text],['unused.ts','this is invalid syntax !']]);
 const descriptors=[{...descriptor,id:'FIRST',start:text.indexOf('withTest')},{...descriptor,id:'SECOND',start:text.lastIndexOf('withTest')}];
 const result=typeSurfaces.extractTypeSurfaces(files,descriptors);
 assert.equal(result.plugins[0].status,'EXPANDED');
 assert.ok(result.plugins[0].typescript.options.some(o=>o.path==='nested.image'));
 assert.equal(result.plugins[1].status,'BLOCKED_OPTION_TYPE');
 assert.match(result.plugins[1].error,/Missing|unsupported|unresolved/i);
 assert.ok(!result.inputPaths.includes('unused.ts'));
 assert.throws(()=>typeSurfaces.extractTypeSurfaces(files,[descriptors[0],descriptors[0]]),/Duplicate/);
});

test('PLG-01: indexed access and NonNullable preserve actual literal types', () => {
  const files = typeFixture();
  files.set(descriptor.sourcePath, `type Config = { ios?: { splash?: { resizeMode?: 'contain' | 'cover' } } };
    type Splash = NonNullable<NonNullable<Config['ios']>['splash']>;
    const withTest: ConfigPlugin<{ ios?: { resizeMode: NonNullable<Splash['resizeMode']> } }> = c => c;`);
  const surface = extractTypeSurface(files, descriptor);
  const resize = option(surface, 'ios.resizeMode');
  assert.match(JSON.stringify(resize), /contain/);
  assert.match(JSON.stringify(resize), /cover/);
  assert.doesNotMatch(JSON.stringify(resize), /undefined/);
});

test('resolves package root type imports through the pinned manifest instead of assuming index.ts', () => {
  const files = new Map([
    [descriptor.sourcePath, `import type { Config } from '@expo/options';
      type Splash = NonNullable<NonNullable<Config['ios']>['splash']>;
      const withTest: ConfigPlugin<{ resizeMode: NonNullable<Splash['resizeMode']> }> = c => c;`],
    ['packages/@expo/options/package.json', JSON.stringify({ types: 'build/Config.d.ts' })],
    ['packages/@expo/options/src/Config.ts', `export interface Config { ios?: { splash?: { resizeMode?: 'contain' | 'cover' } } }`],
  ]);
  const resize = option(extractTypeSurface(files, descriptor), 'resizeMode');
  assert.match(JSON.stringify(resize), /contain/);
  assert.match(JSON.stringify(resize), /cover/);
});

test('PLG-02: schema refs, escaped pointers, arrays, enum and open dictionaries retain locations', () => {
  const schema = { $ref: '#/definitions/Props', definitions: {
    'a/b~c': { type: 'string', enum: ['GET', 'POST'] },
    Props: { type: 'object', required: ['redirects'], properties: {
      redirects: { type: 'array', items: { type: 'object', properties: {
        methods: { type: 'array', items: { $ref: '#/definitions/a~1b~0c' } },
      } } }, headers: { type: 'object', additionalProperties: { type: 'string' } },
    }, additionalProperties: false },
  } };
  const surface = extractSchemaSurface(schema, { id: 'PLG-SCHEMA', sourcePath: 'options.json' });
  const methods = option(surface, 'redirects[].methods[]');
  assert.match(JSON.stringify(methods), /GET/);
  assert.equal(methods.occurrences[0].source.pointer, '#/definitions/a~1b~0c');
  assert.equal(option(surface, 'redirects').occurrences[0].required, true);
  assert.ok(option(surface, 'headers.*'));
  assert.equal(surface.root.additionalProperties, false);
});

test('preserves boolean literal options instead of widening false to boolean', () => {
  const files = new Map([[descriptor.sourcePath, `const withTest: ConfigPlugin<{ disabled: false; enabled: true; toggle?: boolean }> = c => c;`]]);
  const surface = extractTypeSurface(files, descriptor);
  assert.deepEqual(option(surface, 'disabled').occurrences[0].type, { kind: 'literal', value: false });
  assert.deepEqual(option(surface, 'enabled').occurrences[0].type, { kind: 'literal', value: true });
  const schema = extractSchemaSurface({ type: 'object', properties: { toggle: { type: 'boolean' } } }, descriptor);
  assert.ok(!compareOptionSurfaces(surface, schema).some((entry) => entry.path === 'toggle' && entry.kind === 'type-difference'));
});

test('points inline schema array elements to items rather than the containing property', () => {
  const surface = extractSchemaSurface({ type: 'object', properties: {
    values: { type: 'array', items: { type: 'string' } },
  } }, descriptor);
  assert.equal(option(surface, 'values[]').occurrences[0].source.pointer, '#/properties/values/items');
});

test('PLG-03: reports type/required and both-direction missing options without replacing definitions', () => {
  const files = new Map([[descriptor.sourcePath, `const withTest: ConfigPlugin<{
    origin?: string; partialTypedGroups?: boolean; headers: Record<string, string>;
  }> = c => c;`]]);
  const types = extractTypeSurface(files, descriptor);
  const schema = extractSchemaSurface({ type: 'object', properties: {
    origin: { oneOf: [{ type: 'string' }, { type: 'boolean' }] },
    partialRouteTypes: { type: 'boolean' }, headers: { type: 'object', additionalProperties: { type: 'string' } },
  } }, descriptor);
  const before = JSON.stringify({ types, schema });
  const differences = compareOptionSurfaces(types, schema);
  assert.ok(differences.some((entry) => entry.path === 'partialTypedGroups' && entry.kind === 'typescript-only'));
  assert.ok(differences.some((entry) => entry.path === 'partialRouteTypes' && entry.kind === 'schema-only'));
  assert.ok(differences.some((entry) => entry.path === 'origin' && entry.kind === 'type-difference'));
  assert.ok(differences.some((entry) => entry.path === 'headers' && entry.kind === 'required-difference'));
  assert.equal(JSON.stringify({ types, schema }), before);
});

test('PLG-04: unresolved, any, unknown and recursive types fail with a location', () => {
  for (const type of ['{ broken: MissingType }', '{ value: any }', '{ value: unknown }', 'Recursive']) {
    const files = typeFixture(type);
    files.set(descriptor.sourcePath, `type Recursive = { child?: Recursive };
      const withTest: ConfigPlugin<${type}> = c => c;`);
    assert.throws(() => extractTypeSurface(files, descriptor), /unsupported|unresolved|recursive/i);
  }
});

test('PLG-04: missing, external and recursive JSON refs fail instead of dropping options', () => {
  for (const schema of [
    { $ref: '#/definitions/Missing' }, { $ref: 'https://example.test/options.json' },
    { $ref: '#/definitions/Self', definitions: { Self: { type: 'object', properties: { child: { $ref: '#/definitions/Self' } } } } },
  ]) assert.throws(() => extractSchemaSurface(schema, descriptor), /ref|recursive/i);
});

test('PLG-04: unsupported schema structure and mixed composition fail instead of hiding properties', () => {
  for (const schema of [
    { type: 'object', patternProperties: { '^name': { type: 'string' } } },
    { type: 'object', properties: { name: { type: 'string' } }, allOf: [{ type: 'object' }] },
    { type: 'object', not: { required: ['secret'] } },
    { oneOf: [{ type: 'string' }], anyOf: [{ type: 'boolean' }] },
    { $ref: '#/definitions/Props', properties: { extra: { type: 'string' } }, definitions: { Props: { type: 'object' } } },
  ]) assert.throws(() => extractSchemaSurface(schema, descriptor), /unsupported|mixed/i);
});

test('PLG-04: ambiguous property path syntax fails rather than sharing a stable ID', () => {
  for (const name of ['a.b', 'items[]', '*', '']) {
    const files = new Map([[descriptor.sourcePath, `const withTest: ConfigPlugin<{ ${JSON.stringify(name)}: string }> = c => c;`]]);
    assert.throws(() => extractTypeSurface(files, descriptor), /property.*path/i);
    assert.throws(() => extractSchemaSurface({ type: 'object', properties: { [name]: { type: 'string' } } }, descriptor), /property.*path/i);
  }
});

test('PLG-05: records config reads/default expressions and no-props as distinct from no functionality', () => {
  const files = new Map([[descriptor.sourcePath, `const withTest: ConfigPlugin = config => {
    const color = config.backgroundColor ?? '#fff';
    return { ...config, color };
  };`]]);
  const surface = extractTypeSurface(files, descriptor);
  assert.equal(surface.root.kind, 'no-explicit-options');
  assert.deepEqual(surface.options, []);
  assert.ok(surface.facts.some((entry) => entry.kind === 'read' && entry.expression === 'config.backgroundColor'));
  assert.ok(surface.facts.some((entry) => entry.kind === 'fallback' && entry.expression.includes('#fff')));
  assert.ok(surface.facts.every((entry) => entry.source.line > 0));
});

test('PLG-06: rejects nested deletion, changed type/source, duplicate IDs and false completion', () => {
  const original = { schemaVersion: 1, stageClosable: false, plugins: [{ id: descriptor.id,
    typescript: extractTypeSurface(typeFixture(), descriptor), schema: null, differences: [] }] };
  assert.equal(validateSurfaceRecords(original, original).valid, true);
  const mutations = [
    (value) => value.plugins[0].typescript.options.pop(),
    (value) => { value.plugins[0].typescript.options[0].occurrences[0].source.line = 999; },
    (value) => { value.plugins[0].typescript.options[0].occurrences[0].type = { kind: 'number' }; },
    (value) => value.plugins[0].typescript.options.push(value.plugins[0].typescript.options[0]),
    (value) => { value.stageClosable = true; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.equal(validateSurfaceRecords(changed, original).valid, false);
  }
});
