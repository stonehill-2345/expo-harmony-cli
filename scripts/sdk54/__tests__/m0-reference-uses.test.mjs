import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import { collectDeclarationReferences } from '../m0-reference-uses.mjs';
import { projectTemplateSource, TEMPLATE_PROJECTION_RULE } from '../m0-template-projection.mjs';

function scan(input) {
  assert.equal(typeof collectDeclarationReferences, 'function', 'reference scanner must be implemented');
  return collectDeclarationReferences(input);
}

function declarations(path, text, names) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const found = [];
  function visit(node) {
    if (node.name && ts.isIdentifier(node.name) && names.includes(node.name.text)) {
      const start = node.getStart(source);
      const location = source.getLineAndCharacterOfPosition(start);
      found.push({ id: `DECL:${node.name.text}`, path, start, end: node.end, origin: 'source', line: location.line + 1, column: location.character + 1 });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

const resolution = (from, request, status = 'RESOLVED', path = 'external/types.d.ts') => ({ key: `${from}\0${request}`, from, request, status, path });

test('binds renamed, default, namespace, type-only and import-equals references to their own imports', () => {
  const path = 'packages/demo/index.ts';
  const text = `import DefaultValue from 'default-package';
import type { Original as Renamed, Unused } from 'types-package';
import * as NS from 'namespace-package';
import Legacy = require('legacy-package');
export interface Public { value: Renamed; qualified: NS.Item; legacy: Legacy.Type; defaultValue: typeof DefaultValue; }
`;
  const inputDeclarations = declarations(path, text, ['Public', 'value', 'qualified', 'legacy', 'defaultValue']);
  const result = scan({ files: new Map([[path, text]]), declarations: inputDeclarations, resolutions: ['default-package', 'types-package', 'namespace-package', 'legacy-package'].map(request => resolution(path, request)) });
  const publicUses = result.uses.filter(use => use.declarationId === 'DECL:Public');
  assert.deepEqual(publicUses.map(use => [use.localName, use.request]), [['Renamed', 'types-package'], ['NS', 'namespace-package'], ['Legacy', 'legacy-package'], ['DefaultValue', 'default-package']]);
  assert.equal(result.uses.length, 8);
  for (const use of result.uses) {
    assert.equal(use.evidenceKind, 'bound-import-symbol-use');
    assert.equal(use.resolutionKey, `${path}\0${use.request}`);
    assert.equal(use.resolutionStatus, 'RESOLVED');
    assert.equal(text.slice(use.source.start, use.source.end), use.localName);
    assert.equal(text.slice(use.importSource.start, use.importSource.end), `'${use.request}'`);
    assert.equal(use.source.path, path);
    assert.equal(use.importSource.path, path);
    assert.equal(use.source.line, 5);
    assert.equal(use.source.column, use.source.start - text.lastIndexOf('\n', use.source.start - 1));
  }
  assert.equal(result.compilerVersion, ts.version);
  for (const declaration of result.declarations) {
    assert.equal(declaration.referenceScanStatus, 'SCANNED');
    assert.deepEqual(declaration.useIds, result.uses.filter(use => use.declarationId === declaration.id).map(use => use.id));
  }
});

test('ignores function, generic, parameter and block shadows while retaining real references', () => {
  const path = 'shadow.ts';
  const text = `import type { Item } from 'type-source';
import { action } from 'value-source';
export interface Public<Item> { value: Item; }
export function outer(action: () => void) { action(); }
export function generic<Item>(item: Item): Item { return item; }
export function nested() { function action() {} action(); { let Item = 1; Item; } }
export function real(value: Item) { action(); return value; }
`;
  const result = scan({ files: new Map([[path, text]]), declarations: declarations(path, text, ['Public', 'outer', 'generic', 'nested', 'real']), resolutions: [] });
  assert.deepEqual(result.uses.map(use => [use.declarationId, use.localName]), [['DECL:real', 'Item'], ['DECL:real', 'action']]);
  assert.ok(result.declarations.every(declaration => declaration.referenceScanStatus === 'SCANNED'));
});

test('records import type literals directly including relative requests without assuming resolution', () => {
  const path = 'packages/a/types.ts';
  const text = `export type Public = import('./nearby').Member | typeof import('missing-module');\n`;
  const result = scan({ files: new Map([[path, text], ['packages/a/nearby.ts', 'export type Member = string;']]), declarations: declarations(path, text, ['Public']), resolutions: [resolution(path, './nearby', 'LOCAL_SOURCE', 'packages/a/nearby.ts')] });
  assert.deepEqual(result.uses.map(use => [use.localName, use.request, use.resolutionStatus, use.evidenceKind]), [[null, './nearby', 'LOCAL_SOURCE', 'import-type-use'], [null, 'missing-module', 'NOT_OBSERVED', 'import-type-use']]);
  for (const use of result.uses) {
    assert.equal(text.slice(use.source.start, use.source.end), `'${use.request}'`);
    assert.deepEqual(use.source, use.importSource);
  }
});

test('keeps an observed unresolved result separate from absent and other-file resolutions', () => {
  const path = 'index.ts';
  const text = `import type { A } from './a'; import type { B } from 'b'; export type Public = A | B;`;
  const result = scan({ files: new Map([[path, text]]), declarations: declarations(path, text, ['Public']), resolutions: [resolution(path, './a', 'UNRESOLVED', undefined), resolution('other.ts', 'b')] });
  assert.deepEqual(result.uses.map(use => [use.request, use.resolutionStatus]), [['./a', 'UNRESOLVED'], ['b', 'NOT_OBSERVED']]);
  assert.equal(result.uses[1].resolutionKey, `${path}\0b`);
});

test('preserves missing sources and unmatched exact ranges as explicit scan boundaries', () => {
  const path = 'index.ts';
  const text = `import type { Item } from 'types'; export type Public = Item;`;
  const [valid] = declarations(path, text, ['Public']);
  const result = scan({ files: new Map([[path, text], ['empty.ts', '']]), declarations: [valid, { ...valid, id: 'wrong-start', start: valid.start + 1 }, { ...valid, id: 'wrong-end', end: valid.end + 1 }, { ...valid, id: 'missing', path: 'absent.d.ts', origin: 'library' }, { ...valid, id: 'empty', path: 'empty.ts' }], resolutions: [] });
  assert.deepEqual(Object.fromEntries(result.declarations.map(row => [row.id, row.referenceScanStatus])), { 'DECL:Public': 'SCANNED', empty: 'RANGE_UNMATCHED', missing: 'SOURCE_UNAVAILABLE', 'wrong-end': 'RANGE_UNMATCHED', 'wrong-start': 'RANGE_UNMATCHED' });
  assert.equal(result.uses.length, 1);
});

test('scans provided library and external declarations without consulting installed modules', () => {
  const files = new Map([
    ['lib/ambient.d.ts', `import type { T } from 'typescript'; export interface Library { value: T; }`],
    ['external/types.d.ts', `import type { X } from '../lib/local'; export type External = X;`],
  ]);
  const rows = [...files].flatMap(([path, text]) => declarations(path, text, ['Library', 'External']).map(row => ({ ...row, origin: path.startsWith('lib') ? 'library' : 'external' })));
  const result = scan({ files, declarations: rows, resolutions: [] });
  assert.deepEqual(result.uses.map(use => use.request), ['../lib/local', 'typescript']);
  assert.ok(result.uses.every(use => use.resolutionStatus === 'NOT_OBSERVED'));
});

test('produces stable ids, sorted inputs, and raw UTF-8 content hashes across input order', () => {
  const path = 'z.ts';
  const text = `// \u6c49\u5b57\r\nimport type { A } from './a';\r\nexport interface Z { value: A; }\r\n`;
  const files = new Map([[path, text], ['a.ts', '\ufeffexport type A = string;\n']]);
  const rows = declarations(path, text, ['Z', 'value']);
  const resolutions = [resolution(path, './a', 'LOCAL_SOURCE', 'a.ts')];
  const first = scan({ files, declarations: rows, resolutions });
  const second = scan({ files: new Map([...files].reverse()), declarations: [...rows].reverse(), resolutions: [...resolutions].reverse() });
  assert.deepEqual(first, second);
  assert.deepEqual(first.inputs, [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, contents]) => ({ path, sha256: createHash('sha256').update(contents).digest('hex') })));
  assert.equal(new Set(first.uses.map(use => use.id)).size, first.uses.length);
  assert.equal(first.uses[0].source.line, 3);
});

test('does not treat import binding declarations or same-file dependencies as exact use evidence', () => {
  const path = 'index.ts';
  const text = `import { Used, Unused } from 'dependency'; export interface Public { plain: string; } export const value = { Used };`;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const importNode = source.statements[0];
  const rows = [...declarations(path, text, ['Public', 'plain', 'value']), { id: 'import', path, start: importNode.getStart(source), end: importNode.end }];
  const result = scan({ files: new Map([[path, text]]), declarations: rows, resolutions: [resolution(path, 'dependency')] });
  assert.deepEqual(result.uses.map(use => [use.declarationId, use.localName]), [['DECL:value', 'Used']]);
  assert.equal(result.declarations.find(row => row.id === 'import').useIds.length, 0);
});

test('tracks local export specifiers through renamed import bindings', () => {
  const path = 'index.ts';
  const text = `import { Original as Local } from 'source'; export { Local as Exposed }; export { Other } from 'other';`;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const rows = source.statements.filter(ts.isExportDeclaration).map((node, index) => ({ id: `export:${index}`, path, start: node.getStart(source), end: node.end }));
  const result = scan({ files: new Map([[path, text]]), declarations: rows, resolutions: [] });
  assert.deepEqual(result.uses.map(use => [use.declarationId, use.localName, use.request]), [['export:0', 'Local', 'source']]);
});

test('keeps a shared imported symbol precise across many independent field declarations', () => {
  const path = 'fields.ts';
  const fields = Array.from({ length: 256 }, (_, index) => `field${index}: Imported;`);
  const text = `import type { Imported } from 'source'; export interface Public { ${fields.join(' ')} }`;
  const rows = declarations(path, text, fields.map((_, index) => `field${index}`));
  const result = scan({ files: new Map([[path, text]]), declarations: rows, resolutions: [] });
  assert.equal(result.declarations.length, 256);
  assert.equal(result.uses.length, 256);
  for (const row of result.declarations) {
    assert.equal(row.useIds.length, 1);
    const use = result.uses.find(candidate => candidate.id === row.useIds[0]);
    const input = rows.find(candidate => candidate.id === row.id);
    assert.equal(use.declarationId, row.id);
    assert.ok(use.source.start >= input.start && use.source.end <= input.end);
  }
});

test('accepts an empty declaration set without manufacturing references', () => {
  const result = scan({ files: new Map(), declarations: [], resolutions: [] });
  assert.deepEqual(result, { compilerVersion: ts.version, declarations: [], uses: [], inputs: [] });
});

test('traces internal import-equals aliases through multiple levels to the original module literal', () => {
  const path = 'aliases.ts';
  const text = `import * as NS from 'source';
import Local = NS.Type;
import Second = Local.Deep;
import Third = Second;
export interface Public { first: Local; second: Second; third: Third; }
export interface Shadow<Local, Second, Third> { first: Local; second: Second; third: Third; }
export function shadow(Local: unknown, Second: unknown, Third: unknown) { return [Local, Second, Third]; }
`;
  const result = scan({ files: new Map([[path, text]]), declarations: declarations(path, text, ['Public', 'Shadow', 'shadow']), resolutions: [resolution(path, 'source')] });
  assert.deepEqual(result.uses.map(use => [use.declarationId, use.localName, use.request]), [['DECL:Public', 'Local', 'source'], ['DECL:Public', 'Second', 'source'], ['DECL:Public', 'Third', 'source']]);
  for (const use of result.uses) {
    assert.equal(text.slice(use.importSource.start, use.importSource.end), "'source'");
    assert.equal(use.importSource.line, 1);
    assert.equal(use.source.line, 5);
  }
});

test('records the right-hand symbol of public internal import-equals declarations but excludes their binding names', () => {
  const path = 'public-alias.ts';
  const text = `import * as NS from 'source';
export import Local = NS.Type;
export import Second = Local.Deep;
export import External = require('external');
`;
  const result = scan({ files: new Map([[path, text]]), declarations: declarations(path, text, ['Local', 'Second', 'External']), resolutions: [] });
  assert.deepEqual(result.uses.map(use => [use.declarationId, use.localName, use.request]), [['DECL:Local', 'NS', 'source'], ['DECL:Second', 'Local', 'source']]);
  assert.ok(result.uses.every(use => use.importSource.line === 1));
  assert.equal(result.declarations.find(row => row.id === 'DECL:External').useIds.length, 0);
});

const upstreamTemplateProjection = text => text.replace(/<%[-=]\s*project\.([A-Za-z_]\w*)\s*%>/g, (token, name) => `Template_${name}`.padEnd(token.length, '_'));

test('opt-in template projection matches semantic declaration ranges while retaining raw input hashes', () => {
  const path = 'template.ts';
  const text = `import type { Item } from 'source';\nexport interface <%- project.name %> { value: Item; }\n`;
  const rows = declarations(path, upstreamTemplateProjection(text), ['value']);
  const interfaceNode = ts.createSourceFile(path, upstreamTemplateProjection(text), ts.ScriptTarget.Latest, true).statements[1];
  rows.push({ id: 'public', path, start: interfaceNode.getStart(), end: interfaceNode.end });
  const input = { files: new Map([[path, text]]), declarations: rows, resolutions: [] };
  const baseline = scan(input);
  assert.equal(baseline.declarations.find(row => row.id === 'public').referenceScanStatus, 'RANGE_UNMATCHED');
  assert.equal(Object.hasOwn(baseline, 'projections'), false);
  const projected = scan({ ...input, templateProjection: true });
  assert.ok(projected.declarations.every(row => row.referenceScanStatus === 'SCANNED'));
  assert.deepEqual(projected.uses.map(use => use.localName), ['Item', 'Item']);
  assert.equal(projected.inputs[0].sha256, createHash('sha256').update(text).digest('hex'));
  assert.equal(projected.projections.length, 1);
  assert.equal(projected.projections[0].rawSha256, projected.inputs[0].sha256);
  assert.equal(projected.projections[0].projectedSha256, createHash('sha256').update(upstreamTemplateProjection(text)).digest('hex'));
  assert.equal(projected.projections[0].offsetUnit, 'UTF16_CODE_UNIT');
});

test('template projection preserves import and use coordinates from the raw CRLF source', () => {
  const path = 'template.ts';
  const text = `// \u6c49\u5b57\r\nimport type { Item } from 'source';\r\nexport interface <%=\r\n project.name\r\n%> { value: Item; }\r\n`;
  const parsed = ts.createSourceFile(path, upstreamTemplateProjection(text), ts.ScriptTarget.Latest, true);
  const node = parsed.statements[1];
  const result = scan({ files: new Map([[path, text]]), declarations: [{ id: 'public', path, start: node.getStart(parsed), end: node.end }], resolutions: [], templateProjection: true });
  assert.equal(result.declarations[0].referenceScanStatus, 'SCANNED');
  assert.equal(result.uses.length, 1);
  const use = result.uses[0];
  assert.equal(text.slice(use.source.start, use.source.end), 'Item');
  assert.equal(use.source.line, 5);
  assert.equal(use.source.column, text.slice(0, use.source.start).split(/\r\n|\r|\n/).at(-1).length + 1);
  assert.equal(use.importSource.line, 2);
  assert.equal(text.slice(use.importSource.start, use.importSource.end), "'source'");
});

test('does not repair unsupported template syntax or shifted declaration ranges', () => {
  const path = 'unknown.ts';
  const text = `import type { Item } from 'source'; export interface <%= unsupported.name %> { value: Item; }`;
  const fake = text.replace('<%= unsupported.name %>', 'X'.repeat('<%= unsupported.name %>'.length));
  const node = ts.createSourceFile(path, fake, ts.ScriptTarget.Latest, true).statements[1];
  const result = scan({ files: new Map([[path, text]]), declarations: [{ id: 'unknown', path, start: node.getStart(), end: node.end }, { id: 'shifted', path, start: node.getStart() + 1, end: node.end }], resolutions: [], templateProjection: true });
  assert.ok(result.declarations.every(row => row.referenceScanStatus === 'RANGE_UNMATCHED'));
  assert.equal(result.uses.length, 0);
  assert.equal(result.projections[0].substitutions.length, 0);
  assert.equal(result.projections[0].unsupportedTokens.length, 1);
  assert.equal(result.projections[0].rawSha256, result.projections[0].projectedSha256);
});

test('template scanning keeps local generic shadows distinct from genuine imported aliases', () => {
  const path = 'template.ts';
  const text = `import type { Item } from 'source';\nexport interface <%= project.name %><Item> { shadow: Item; }\nexport interface Real { value: Item; }\n`;
  const projectedText = upstreamTemplateProjection(text);
  const rows = ts.createSourceFile(path, projectedText, ts.ScriptTarget.Latest, true).statements.slice(1).map((node, index) => ({ id: `declaration:${index}`, path, start: node.getStart(), end: node.end }));
  const result = scan({ files: new Map([[path, text]]), declarations: rows, resolutions: [], templateProjection: true });
  assert.ok(result.declarations.every(row => row.referenceScanStatus === 'SCANNED'));
  assert.deepEqual(result.uses.map(use => [use.declarationId, use.localName]), [['declaration:1', 'Item']]);
});

test('templated imported names and requests retain raw evidence rather than inventing instantiated paths', () => {
  const path = 'template.ts';
  const text = `import type { <%- project.name %>Props } from './<%- project.name %>.types';\nexport type Public = <%- project.name %>Props;\n`;
  const node = ts.createSourceFile(path, upstreamTemplateProjection(text), ts.ScriptTarget.Latest, true).statements[1];
  const result = scan({ files: new Map([[path, text]]), declarations: [{ id: 'public', path, start: node.getStart(), end: node.end }], resolutions: [], templateProjection: true });
  assert.equal(result.uses.length, 1);
  assert.equal(result.uses[0].localName, '<%- project.name %>Props');
  assert.equal(result.uses[0].request, './<%- project.name %>.types');
  assert.equal(result.uses[0].resolutionStatus, 'NOT_OBSERVED');
  assert.equal(result.uses[0].resolutionKey, `${path}\0./<%- project.name %>.types`);
  assert.equal(result.uses[0].projectedRequest, './' + upstreamTemplateProjection('<%- project.name %>') + '.types');
  assert.equal(result.uses[0].projectedLocalName, upstreamTemplateProjection('<%- project.name %>') + 'Props');
});

test('known template projection rejects shifted boundaries rather than selecting a nearby declaration', () => {
  const path = 'template.ts';
  const text = `import type { Item } from 'source'; export interface <%= project.name %> { value: Item; }`;
  const node = ts.createSourceFile(path, upstreamTemplateProjection(text), ts.ScriptTarget.Latest, true).statements[1];
  const result = scan({ files: new Map([[path, text]]), declarations: [{ id: 'start-shift', path, start: node.getStart() + 1, end: node.end }, { id: 'end-shift', path, start: node.getStart(), end: node.end - 1 }], resolutions: [], templateProjection: true });
  assert.ok(result.declarations.every(row => row.referenceScanStatus === 'RANGE_UNMATCHED'));
  assert.equal(result.uses.length, 0);
});

test('shared projection retains unsupported tokens and exposes its exact deterministic rule', () => {
  const text = `// \u6c49\u5b57\r\nexport type <%= project._name2 %> = '<%= other.name %>';\r\n// <%= project.name.toUpperCase() %>\r\n`;
  const projected = projectTemplateSource({ path: 'template.ts', text });
  assert.equal(projected.text, upstreamTemplateProjection(text));
  assert.equal(projected.projection.rule, TEMPLATE_PROJECTION_RULE);
  assert.equal(projected.projection.substitutions.length, 1);
  assert.equal(projected.projection.unsupportedTokens.length, 2);
  assert.equal(projected.text.length, text.length);
  assert.equal(projected.projection.rawSha256, createHash('sha256').update(text).digest('hex'));
  assert.deepEqual(projectTemplateSource({ path: 'plain.ts', text: 'export type T = string;' }), { text: 'export type T = string;', projection: null });
});

test('projection records and use ids are stable across file and declaration input order', () => {
  const files = new Map([['b.ts', `import type { Item } from 'source'; export interface <%= project.name %> { value: Item; }`], ['a.ts', 'export type Plain = string;']]);
  const rows = [...files].map(([path, text]) => {
    const node = ts.createSourceFile(path, upstreamTemplateProjection(text), ts.ScriptTarget.Latest, true).statements.at(-1);
    return { id: `declaration:${path}`, path, start: node.getStart(), end: node.end };
  });
  const first = scan({ files, declarations: rows, resolutions: [], templateProjection: true });
  const second = scan({ files: new Map([...files].reverse()), declarations: [...rows].reverse(), resolutions: [], templateProjection: true });
  assert.deepEqual(first, second);
  assert.deepEqual(first.projections.map(row => row.path), ['b.ts']);
});
