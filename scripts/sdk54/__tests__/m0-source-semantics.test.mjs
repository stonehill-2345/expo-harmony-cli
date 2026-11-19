import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeScriptSource, validateSourceSemantics } from '../m0-source-semantics.mjs';

const analyze = (content, path = 'packages/example/src/index.tsx') => analyzeScriptSource({ path, content });
test('enumerates finite declarations, nested props, callback signatures and exported aliases', () => {
  const result = analyze('export interface Props { nested: { onChange?: (value: string) => void }; enabled?: boolean }\nexport class Thing { run(p: Props): void {} }\nexport const answer = 42;\nexport { Thing as Other };');
  for (const name of ['Props', 'nested', 'onChange', 'enabled', 'Thing', 'run', 'answer', 'Other']) assert.ok(result.facts.some(row => row.name === name), name);
  assert.ok(result.facts.some(row => row.kind === 'CALLBACK'));
  assert.equal(result.boundaries.length, 0); assert.equal(result.coverage, 'PARSED_FINITE_SOURCE');
});
test('records event, permission, lifecycle, error and resource expressions without truncation', () => {
  const expression = '"' + 'long-name'.repeat(200) + '"';
  const result = analyze(`export function run() { useEffect(() => () => subscription.remove(), []); emitter.addListener(${expression}, handler); requestPermissionsAsync(); throw new Error('no'); }\nconst icon = require('./assets/icon.png');`);
  for (const kind of ['EVENT', 'PERMISSION', 'LIFECYCLE', 'ERROR', 'RESOURCE']) assert.ok(result.facts.some(row => row.kind === kind), kind);
  assert.ok(result.facts.find(row => row.kind === 'EVENT').details.expression.includes(expression));
  assert.ok(result.facts.some(row => row.kind === 'REMOVE'));
});
test('does not invent semantic calls from comments, string values or unrelated names', () => {
  const result = analyze('// emitter.emit("x"); throw new Error();\nexport const text = "Platform.OS requestPermissionsAsync addListener";\nexport function emitDocumentation() {}');
  for (const kind of ['EVENT', 'ERROR', 'PERMISSION', 'PLATFORM_CONDITION']) assert.equal(result.facts.some(row => row.kind === kind), false, kind);
});
test('records platform branches, call arguments and dynamic resource source rules', () => {
  const result = analyze('if (Platform.OS === "ios") { start(); }\nconst a = Platform.select({ios: 1, default: 2});\nconst b = require(assetPath);');
  assert.ok(result.facts.some(row => row.kind === 'PLATFORM_CONDITION' && row.details.expression.includes('Platform.OS')));
  assert.ok(result.facts.some(row => row.kind === 'RESOURCE' && row.details.valueMode === 'FINITE_SOURCE_EXPRESSION'));
  assert.ok(result.facts.some(row => row.kind === 'CALL_SITE' && row.name === 'start'));
});
test('supports Flow and JSX JavaScript with independently parsed source ranges', () => {
  const result = analyze('// @flow\nexport type Props = { title: string };\nexport const View = (p: Props) => <Text>{p.title}</Text>;', 'packages/example/src/index.js');
  assert.equal(result.boundaries.length, 0); assert.ok(result.facts.some(row => row.name === 'Props')); assert.ok(result.facts.some(row => row.kind === 'COMPONENT_PROPERTY' && row.name === 'title'));
});
test('preserves named exports and import dependencies as finite syntax rather than inferred targets', () => {
  const result = analyze('export { XcodeProject } from "xcode";\nexport * from "./other";\nimport asset from "./asset.png";');
  assert.ok(result.facts.some(row => row.kind === 'EXPORT' && row.name === 'XcodeProject'));
  assert.ok(result.facts.some(row => row.kind === 'DEPENDENCY' && row.details.request === 'xcode'));
  assert.ok(result.facts.some(row => row.kind === 'RESOURCE' && row.details.request === './asset.png'));
});
test('keeps syntax errors as source enumeration blockers with location', () => {
  const result = analyze('export function broken( {');
  assert.equal(result.coverage, 'SOURCE_ENUMERATION_BLOCKED'); assert.ok(result.boundaries.length);
  assert.ok(result.boundaries.every(row => row.disposition === 'SOURCE_ENUMERATION_BLOCKER' && row.line > 0));
});
test('EJS names are finite generation rules with original offsets and source text', () => {
  const content = 'export class <%= project.moduleName %> {\n  method() {}\n}';
  const result = analyze(content, 'packages/expo-module-template/src/index.ts');
  assert.equal(result.boundaries.length, 0);
  const generated = result.facts.find(row => row.kind === 'CLASS');
  assert.equal(generated.details.valueMode, 'TEMPLATE_GENERATION_RULE');
  assert.ok(generated.details.expression.includes('<%= project.moduleName %>'));
  assert.equal(result.facts.find(row => row.name === 'method').line, 2);
});
test('stable identities and validator reject deletion, changed range, duplicates and invented facts', () => {
  const expected = analyze('export interface Options { deep: { name: string } }');
  assert.deepEqual(expected, analyze('export interface Options { deep: { name: string } }'));
  assert.equal(validateSourceSemantics(expected, expected).valid, true);
  const deleted = structuredClone(expected); const target = deleted.facts.find(row => row.name === 'name'); deleted.facts = deleted.facts.filter(row => row.id !== target.id);
  const failure = validateSourceSemantics(deleted, expected); assert.equal(failure.valid, false); assert.ok(failure.failures.some(row => row.includes(target.id) && row.includes('index.tsx')));
  const changed = structuredClone(expected); changed.facts[0].line++;
  assert.equal(validateSourceSemantics(changed, expected).valid, false);
  const duplicated = structuredClone(expected); duplicated.facts.push(duplicated.facts[0]);
  assert.equal(validateSourceSemantics(duplicated, expected).valid, false);
  const invented = structuredClone(expected); invented.facts.push({...invented.facts[0],id:'invented'});
  assert.equal(validateSourceSemantics(invented, expected).valid, false);
});
test('all facts carry exact original slices, line ranges and immutable source identity', () => {
  const content = '/* heading */\nexport function run(\n value: string\n) { return value; }';
  const result = analyze(content);
  for (const row of result.facts) {
    assert.equal(row.details.expression, content.slice(row.start, row.end));
    assert.equal(row.path, result.path); assert.ok(row.line <= row.endLine);
    assert.match(row.sliceSha256, /^[a-f0-9]{64}$/);
  }
  const changed = structuredClone(result); changed.sourceSha256 = 'a'.repeat(64);
  assert.equal(validateSourceSemantics(changed, result).valid, false);
});
test('compiler AST enumerates optional generic ambient methods rejected by Babel', () => {
  const content = 'export declare class EventEmitter<T> { startObserving?<K extends keyof T>(eventName: K): void; stopObserving?<K extends keyof T>(eventName: K): void; }';
  const result = analyze(content, 'packages/core/EventEmitter.ts');
  assert.equal(result.coverage, 'PARSED_FINITE_SOURCE');
  for (const name of ['EventEmitter', 'startObserving', 'stopObserving']) assert.ok(result.facts.some(row => row.name === name), name);
  assert.ok(result.facts.some(row => row.kind === 'FUNCTION' && row.name === 'startObserving'));
  assert.ok(result.facts.every(row => row.details.expression === content.slice(row.start, row.end)));
});
test('compiler AST preserves empty generic syntax and its complete concrete members', () => {
  const result = analyze('export type RenderStore<> = { rerender: (input: string) => void; context: Record<string, unknown> };', 'packages/router/server.ts');
  assert.equal(result.coverage, 'PARSED_FINITE_SOURCE');
  for (const name of ['RenderStore', 'rerender', 'context']) assert.ok(result.facts.some(row => row.name === name), name);
  assert.ok(result.facts.some(row => row.kind === 'CALLBACK'));
});
test('compiler AST preserves nullable compatibility declaration syntax as an explicit finite rule', () => {
  const result = analyze('declare module "web" { export default function useLayout(ref: any, onLayout?: ?((e: Event) => void)): void; }', 'packages/web/index.d.ts');
  assert.equal(result.coverage, 'PARSED_FINITE_SOURCE');
  assert.ok(result.facts.some(row => row.details.nodeType === 'JSDocNullableType' && row.details.expression.startsWith('?')));
});
test('enumerates index, call, construct and ambient accessor members explicitly', () => {
  const result = analyze('export interface Dict { [key: string]: string; (x: string): number; new(x: number): Date } export declare class Socket { get readyState(): number; set enabled(value: boolean); run(): void; }', 'packages/core/contracts.ts');
  for (const nodeType of ['TSIndexSignature', 'TSCallSignatureDeclaration', 'TSConstructSignatureDeclaration', 'TSDeclareMethod']) {
    assert.ok(result.facts.some(row => row.details.nodeType === nodeType && row.kind === 'COMPONENT_PROPERTY'), nodeType);
  }
  for (const name of ['readyState', 'enabled', 'run']) assert.ok(result.facts.some(row => row.name === name), name);
});
