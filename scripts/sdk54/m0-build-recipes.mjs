import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const parse = (file, text) => ts.createSourceFile(file, String(text), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const shape = node => {
  if (!node) return null;
  const children = [];
  ts.forEachChild(node, child => { children.push(JSON.parse(shape(child))); });
  return JSON.stringify([node.kind, node.text ?? null, children]);
};
const first = text => parse('recipe.js', text).statements[0];
const same = (node, text) => shape(node) === shape(first(text));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const binFunction = `export async function bin(task, opts) {
  await task.source(opts.src || 'bin/*').swc('cli', { stripExtension: true, dev: opts.dev }).target('build/bin', { mode: '0755' });
}`;
const buildFunction = `export async function build(task, opts) { await task.parallel(['cli', 'bin', 'metroRequire'], opts); }`;
const releaseFunction = `export async function release(task) { await task.clear('build').start('build'); }`;
const defaultPrefix = first(`async function init(task) {
  const opts = { dev: true };
  await task.clear('build');
  await task.start('build', opts);
}`).body.statements;
const watchStatement = first(`if (process.stdout.isTTY && !boolish('CI', false) && !boolish('EXPO_NONINTERACTIVE', false)) {
  await task.watch('metro-require/*', 'metroRequire', opts);
  await task.watch('bin/*', 'bin', opts);
  await task.watch('src/**/*.+(js|ts)', 'cli', opts);
}`);

// This is an intentionally narrow AST grammar, not a JavaScript interpreter.
const callbackTemplate = first([String.raw`function* rename(file, environment, { stripExtension } = {}) {
  if (file.base.endsWith('.d.ts')) return;
  assert.match(environment, matcher);
  const setting = ENVIRONMENTS[environment];
  const filePath = path.join(file.dir, file.base);
  const inputFilePath = path.join(__dirname, filePath);
  const outputFilePath = path.dirname(path.join(__dirname, setting.output, filePath));
  const options = {
    filename: path.join(file.dir, file.base),
    sourceMaps: true,
    sourceFileName: path.relative(outputFilePath, inputFilePath),
    ...setting.options,
  };
`, '  if (file.data == null) { throw new Error(`File "${file.base}" is empty.`); }', String.raw`
  const output = yield transform(file.data.toString('utf-8'), options);
  const ext = path.extname(file.base);
  if (ext) {
    const extRegex = new RegExp(ext.replace('.', '\\.') + '$', 'i');
    file.base = file.base.replace(extRegex, stripExtension ? '' : '.js');
  }
  if (output.map) {
`, '    const map = `${file.base}.map`;', '    output.code += Buffer.from(`\\n//# sourceMappingURL=${map}`);', String.raw`
    this._.files.push({ base: map, dir: file.dir, data: Buffer.from(output.map) });
  }
  file.data = Buffer.from(setVersionCode(output.code));
}`].join('\n'));
const callbackStatements = callbackTemplate.body.statements.map(shape);

function collect(node, predicate, result = []) {
  if (predicate(node)) result.push(node);
  ts.forEachChild(node, child => { collect(child, predicate, result); });
  return result;
}

function staticObject(node) {
  return ts.isObjectLiteralExpression(node) && node.properties.every(property => ts.isPropertyAssignment(property)
    && !ts.isComputedPropertyName(property.name) && (ts.isObjectLiteralExpression(property.initializer) ? staticObject(property.initializer)
      : ts.isStringLiteral(property.initializer) || ts.isNumericLiteral(property.initializer)
        || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(property.initializer.kind)));
}

function verifyPlugin(source) {
  if (source.parseDiagnostics.length) return false;
  const pathDeclarations = collect(source, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'path');
  if (pathDeclarations.length !== 1 || !same(pathDeclarations[0].parent.parent, "const path = require('path');")) return false;
  const writes = collect(source, node => ts.isBinaryExpression(node) && ts.isIdentifier(node.left) && node.left.text === 'path');
  if (writes.length) return false;
  const registrations = collect(source, node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.expression.getText(source) === 'task' && node.expression.name.text === 'plugin');
  if (registrations.length !== 1) return false;
  const call = registrations[0], [name, options, callback] = call.arguments;
  if (call.arguments.length !== 3 || !ts.isStringLiteral(name) || name.text !== 'swc'
    || !ts.isObjectLiteralExpression(options) || options.properties.length || !ts.isFunctionExpression(callback) || !callback.asteriskToken
    || callback.parameters.length !== 3 || callback.parameters.some((parameter, index) => shape(parameter) !== shape(callbackTemplate.parameters[index]))) return false;
  const wrapper = call.parent?.parent?.parent;
  if (!ts.isFunctionExpression(wrapper) || wrapper.parameters.length !== 1 || wrapper.parameters[0].name.getText(source) !== 'task'
    || !ts.isBinaryExpression(wrapper.parent) || wrapper.parent.left.getText(source) !== 'module.exports') return false;
  if (!source.statements.every(statement => statement === wrapper.parent.parent
    || same(statement, "const path = require('path');") || same(statement, "const assert = require('assert');")
    || same(statement, "const transform = require('@swc/core').transform;")
    || same(statement, "function setVersionCode(code) { return code.replace(/process\\.env\\.__EXPO_VERSION/g, `\"${require('./package.json').version}\"`); }"))) return false;
  if (!wrapper.body.statements.every(statement => statement === call.parent || ts.isVariableStatement(statement)
    && statement.declarationList.declarations.length === 1 && statement.declarationList.declarations.every(declaration =>
      declaration.name.getText(source) === 'ENVIRONMENTS' && declaration.initializer && staticObject(declaration.initializer)
      || same(statement, "const matcher = new RegExp(`^(${Object.keys(ENVIRONMENTS).join('|')})$`);")))) return false;
  let previous = -1;
  const matched = [];
  for (const statement of callback.body.statements) {
    const current = callbackStatements.indexOf(shape(statement));
    if (current <= previous) return false;
    matched.push(current); previous = current;
  }
  // Require the declaration-file guard, extname calculation and anchored strip/replacement branch.
  return [0, 9, 10].every(index => matched.includes(index));
}

function verifyTaskfile(source) {
  if (source.parseDiagnostics.length) return false;
  const named = name => source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (![ ['bin', binFunction], ['build', buildFunction], ['release', releaseFunction] ]
    .every(([name, expected]) => named(name).length === 1 && same(named(name)[0], expected))) return false;
  const defaults = source.statements.filter(node => ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  if (defaults.length !== 1) return false;
  const init = defaults[0], statements = init.body?.statements ?? [];
  if (init.parameters.length !== 1 || init.parameters[0].name.getText(source) !== 'task' || statements.length < 3 || statements.length > 4
    || !defaultPrefix.every((node, index) => shape(node) === shape(statements[index]))
    || statements.length === 4 && shape(statements[3]) !== shape(watchStatement)) return false;
  return source.statements.every(node => ts.isFunctionDeclaration(node) || ts.isVariableStatement(node)
    && node.declarationList.declarations.every(declaration => declaration.initializer && ts.isCallExpression(declaration.initializer)
      && declaration.initializer.expression.getText(source) === 'require'));
}

export function extractTaskrBuildRecipes({ packages, treeEntries, files }) {
  if (!(files instanceof Map)) throw new Error('Build recipes require a fixed source Map');
  const tree = new Map(treeEntries.map(entry => [entry.path, entry]));
  const safe = file => tree.get(file)?.type === 'blob' && tree.get(file)?.mode !== '120000' && files.has(file);
  const result = { mappings: [], boundaries: [] };
  for (const pkg of [...packages].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!safe(pkg.sourcePath)) continue;
    const manifest = JSON.parse(String(files.get(pkg.sourcePath)));
    if (!Object.values(manifest.scripts ?? {}).some(value => typeof value === 'string' && /(?:^|\s)taskr(?:\s|$)/.test(value))) continue;
    const root = path.posix.dirname(pkg.sourcePath), taskfile = root + '/taskfile.js';
    const requirements = manifest.taskr?.requires;
    const required = Array.isArray(requirements) ? requirements.length === 1 ? requirements[0] : null : requirements;
    const plugin = typeof required === 'string' && /^\.\/[\w./-]+$/.test(required) && !required.split('/').includes('..')
      ? path.posix.join(root, required) : null;
    const reason = manifest.name !== pkg.name ? 'manifest-identity-mismatch'
      : manifest.scripts?.build !== 'taskr' || manifest.scripts?.prepare !== 'taskr release' ? 'unsupported-taskr-script-chain'
      : !safe(taskfile) || !plugin || !safe(plugin) ? 'missing-fixed-taskr-script'
      : !verifyTaskfile(parse(taskfile, files.get(taskfile))) ? 'unsupported-taskr-task-chain'
      : !verifyPlugin(parse(plugin, files.get(plugin))) ? 'unsupported-swc-filename-transform' : null;
    if (reason) {
      result.boundaries.push({ packageId: pkg.id, kind: 'taskr-build-recipe-unverified', reason, source: { path: pkg.sourcePath }, status: 'NOT_VERIFIED' });
      continue;
    }
    const sourceEvidence = file => ({ path: file, ...(tree.get(file).oid ? { blob: tree.get(file).oid } : {}), sha256: sha256(files.get(file)) });
    const binFiles = treeEntries.filter(entry => entry.path.startsWith(root + '/bin/') && !entry.path.slice((root + '/bin/').length).includes('/'));
    for (const entry of [...binFiles].sort((a, b) => a.path.localeCompare(b.path))) {
      const relative = entry.path.slice((root + '/bin/').length);
      if (!/^[\w-][\w.-]*\.ts$/.test(relative) || /\.d\.ts$/.test(relative) || !safe(entry.path)) continue;
      const outputStem = entry.path.slice(0, -3);
      const collisions = binFiles.filter(candidate => candidate.path !== entry.path
        && candidate.path.slice(0, candidate.path.length - path.posix.extname(candidate.path).length) === outputStem);
      if (collisions.length) {
        result.boundaries.push({ packageId: pkg.id, kind: 'taskr-output-collision', source: { path: entry.path }, candidates: collisions.map(candidate => candidate.path), status: 'NOT_VERIFIED' });
        continue;
      }
      result.mappings.push({ packageId: pkg.id, recipe: 'taskr-swc-bin', sourcePath: entry.path,
        outputPath: root + '/build/bin/' + relative.slice(0, -3),
        sources: [pkg.sourcePath, taskfile, plugin, entry.path].map(sourceEvidence),
        buildAcceptance: 'NOT_VERIFIED', publicationAcceptance: 'NOT_VERIFIED', runtimeAcceptance: 'NOT_VERIFIED',
        boundary: 'static-taskr-recipe-is-not-executed-build-or-runtime-equivalence',
      });
    }
  }
  return result;
}
