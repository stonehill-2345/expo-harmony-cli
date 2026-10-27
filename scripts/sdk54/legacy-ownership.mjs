import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import YAML from 'yaml';
import { ownershipScope, ownershipRules, reviewedResources, splitAnchors, dynamicReviews } from './legacy-ownership-policy.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const code = (file) => /\.[cm]?[jt]sx?$/.test(file);
const analyzable = (file) => code(file) && !/\/(?:content|templates|fixtures|external-overlays)\//.test(file);
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
export const serializeOwnership = (value) => `${JSON.stringify(canonical(value), null, 2)}\n`;

function resolveRelative(request, from, files, root) {
  const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(from), request));
  if (candidate.startsWith('../') || path.posix.isAbsolute(candidate)) return { target: null, resolution: 'OUTSIDE_REPOSITORY' };
  const projection = candidate.startsWith('apps/cli/dist/') ? candidate.replace('apps/cli/dist/', 'apps/cli/src/').replace(/\.js$/, '.ts') : null;
  const exists = (file) => files.has(file) || Boolean(root && fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).isFile());
  const stem = candidate.replace(/\.[cm]?jsx?$/, '');
  const choices = [...new Set([projection, candidate, ...['.ts', '.tsx', '.js', '.json', '.mjs', '.cjs', '/index.ts', '/index.js'].map((extension) => stem + extension)].filter(Boolean))];
  const target = choices.find(exists);
  return { target: target ?? null, resolution: !target ? 'MISSING_RELATIVE' : target === candidate ? 'exact' : 'source-projection',
    ...(target && target !== candidate ? { requestedPath: candidate } : {}) };
}

export function indexModuleReferences(files, root) {
  const references = [];
  for (const [file, content] of [...files].sort(([a], [b]) => compare(a, b))) {
    if (!analyzable(file)) continue;
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    if (source.parseDiagnostics.length) throw new Error(`Cannot parse source: ${file}: ${source.parseDiagnostics[0].messageText}`);
    const requireNames = new Set(['require']);
    const collectAliases = (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)
        && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === 'createRequire') requireNames.add(node.name.text);
      ts.forEachChild(node, collectAliases);
    };
    collectAliases(source);
    let ordinal = 0;
    const add = (node, kind, argument, typeOnly = false) => {
      const request = argument && (ts.isStringLiteralLike(argument)) ? argument.text : null;
      const resolution = request === null ? { target: null, resolution: 'UNRESOLVED_DYNAMIC' }
        : request.startsWith('.') ? resolveRelative(request, file, files, root) : { target: null, resolution: 'EXTERNAL_PACKAGE_OR_BUILTIN' };
      const position = source.getLineAndCharacterOfPosition(node.getStart(source));
      references.push({ id: `REF:${file}#${++ordinal}`, source: file, line: position.line + 1, column: position.character + 1,
        kind, typeOnly, request, expression: node.getText(source), ...resolution });
    };
    const visit = (node) => {
      if (ts.isImportDeclaration(node)) add(node, 'import', node.moduleSpecifier,
        Boolean(node.importClause?.isTypeOnly || (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
          && !node.importClause.name && node.importClause.namedBindings.elements.length && node.importClause.namedBindings.elements.every((entry) => entry.isTypeOnly))));
      else if (ts.isExportDeclaration(node) && node.moduleSpecifier) add(node, 'export', node.moduleSpecifier,
        Boolean(node.isTypeOnly || (node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length
          && node.exportClause.elements.every((entry) => entry.isTypeOnly))));
      else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node, 'import-equals', node.moduleReference.expression, node.isTypeOnly);
      else if (ts.isImportTypeNode(node)) add(node, 'import-type', ts.isLiteralTypeNode(node.argument) ? node.argument.literal : node.argument, true);
      else if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node, 'dynamic-import', node.arguments[0]);
        else if (ts.isIdentifier(node.expression) && requireNames.has(node.expression.text)) add(node, 'require', node.arguments[0]);
        else if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
          && requireNames.has(node.expression.expression.text) && node.expression.name.text === 'resolve') add(node, 'require-resolve', node.arguments[0]);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return references;
}

export function discoverOwnershipFiles(root = repository) {
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024,
  }).split('\0').filter((file) => file && (ownershipScope.rootFiles.includes(file) || ownershipScope.directories.some((prefix) => file.startsWith(prefix))))
    .filter((file) => !ownershipScope.exclusions.some((excluded) => excluded.includes('/') ? file === excluded : file.split('/').includes(excluded)))
    .sort(compare).map((file) => {
      const absolute = path.join(root, file);
      const stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
      if (!stat) return null;
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Ownership input must be a regular file: ${file}`);
      return file;
    }).filter(Boolean);
}

function matches(rule, file) {
  return Boolean((rule.files?.includes(file) || rule.prefixes?.some((prefix) => file.startsWith(prefix)))
    && !rule.excludedPrefixes?.some((prefix) => file.startsWith(prefix)));
}

function anchorFact(source, anchor, files) {
  const content = files.get(source);
  if (typeof content !== 'string') throw new Error(`Missing reviewed source ${source}`);
  const start = content.indexOf(anchor);
  if (start < 0 || content.indexOf(anchor, start + anchor.length) >= 0) throw new Error(`Missing/ambiguous reviewed anchor: ${source}: ${anchor}`);
  return { source, anchor, line: content.slice(0, start).split('\n').length, anchorSha256: hash(anchor) };
}

function structuredCommands(files) {
  const commands = [];
  for (const file of ['package.json', 'apps/cli/package.json']) {
    const manifest = JSON.parse(files.get(file));
    for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
      commands.push({ id: `COMMAND:${file}#/scripts/${name}`, source: file, pointer: `/scripts/${name}`, name, command });
    }
  }
  for (const [file, content] of files) {
    if (!file.startsWith('.github/workflows/')) continue;
    const document = YAML.parseDocument(content, { uniqueKeys: true });
    if (document.errors.length) throw new Error(`Invalid workflow ${file}: ${document.errors[0].message}`);
    const value = document.toJS();
    for (const [job, config] of Object.entries(value.jobs ?? {})) for (const [index, step] of (config.steps ?? []).entries()) {
      if (typeof step.run === 'string') commands.push({ id: `COMMAND:${file}#/jobs/${job}/steps/${index}/run`, source: file,
        pointer: `/jobs/${job}/steps/${index}/run`, name: null, command: step.run });
    }
  }
  return commands.sort((a, b) => compare(a.id, b.id));
}

export function createOwnershipInventory(root = repository) {
  const paths = discoverOwnershipFiles(root);
  const buffers = new Map(paths.map((file) => [file, fs.readFileSync(path.join(root, file))]));
  const files = new Map([...buffers].map(([file, buffer]) => [file, buffer.toString('utf8')]));
  const references = indexModuleReferences(files, root);
  const pendingReviews = new Set(dynamicReviews);
  for (const reference of references.filter((entry) => entry.resolution === 'UNRESOLVED_DYNAMIC')) {
    const review = dynamicReviews.find((entry) => entry.source === reference.source && entry.expression === reference.expression);
    if (!review) throw new Error(`Unreviewed dynamic dependency: ${reference.source}:${reference.line}: ${reference.expression}`);
    reference.review = review;
    pendingReviews.delete(review);
  }
  if (pendingReviews.size) throw new Error('Stale dynamic dependency review; source changed');
  const missing = references.filter((entry) => entry.resolution === 'MISSING_RELATIVE' || entry.resolution === 'OUTSIDE_REPOSITORY');
  if (missing.length) throw new Error(`Unresolved static source references: ${missing.map((entry) => `${entry.source}:${entry.line} ${entry.request}`).join(', ')}`);
  const commands = structuredCommands(files);
  const expand = (selector) => {
    const targets = paths.filter((file) => selector.endsWith('/') ? file.startsWith(selector) : file === selector);
    if (!targets.length) throw new Error(`Empty reviewed resource selector: ${selector}`);
    return targets;
  };
  for (const [index, resource] of reviewedResources.entries()) {
    const fact = anchorFact(resource.source, resource.anchor, files);
    for (const selector of resource.targets) for (const target of expand(selector)) references.push({
      id: `RESOURCE:${index}:${target}`, ...fact, kind: resource.kind, target, selector,
      ...(resource.artifact ? { artifactPath: resource.artifact, artifactFreshness: 'NOT_VERIFIED' } : {}),
    });
  }
  // Literal content names are data references, not evidence that a branch ran.
  for (const [file, content] of files) {
    if (!analyzable(file) || file.endsWith('/legacy-ownership-policy.mjs')) continue;
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (ts.isStringLiteralLike(node) && /^(?:content|templates)\//.test(node.text)) {
        const target = `apps/cli/${node.text}`;
        if (files.has(target)) references.push({ id: `DATA:${file}:${node.getStart(source)}`, source: file,
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, kind: 'literal-library-reference', target, request: node.text });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  for (const command of commands) {
    for (const target of paths) if (command.command.includes(target) ||
      (command.source === 'apps/cli/package.json' && command.command.includes(target.replace(/^apps\/cli\//, '')) && target.startsWith('apps/cli/scripts/'))) {
      references.push({ id: `COMMAND-PATH:${command.id}:${target}`, source: command.source, pointer: command.pointer,
        commandId: command.id, kind: 'command-path-text', target });
    }
    for (const target of commands) if (target.name && target.id !== command.id) {
      const escaped = target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(^|[^\\w:-])${escaped}($|[^\\w:-])`).test(command.command)) references.push({
        id: `COMMAND-NAME:${command.id}:${target.id}`, source: command.source, pointer: command.pointer,
        commandId: command.id, kind: 'script-name-text', target: target.source, targetCommand: target.id,
      });
    }
    for (const match of command.command.matchAll(/(?:apps|scripts)\/[A-Za-z0-9_.*?/-]+/g)) {
      if (!/[?*]/.test(match[0])) continue;
      const expression = match[0].split('/').map((segment) => segment.split('*').map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\?/g, '[^/]')).join('[^/]*')).join('/');
      for (const target of paths.filter((file) => new RegExp(`^${expression}$`).test(file))) references.push({
        id: `COMMAND-GLOB:${command.id}:${target}`, source: command.source, pointer: command.pointer,
        commandId: command.id, kind: 'command-glob-text', target, pattern: match[0],
      });
    }
  }
  const manifest = JSON.parse(files.get('apps/cli/package.json'));
  const buildInputs = { source: 'apps/cli/tsconfig.json', ...JSON.parse(files.get('apps/cli/tsconfig.json')),
    entries: { main: manifest.main, types: manifest.types, bin: manifest.bin },
    generatedReadme: { source: 'README.md', generator: 'apps/cli/scripts/sync-readme.mjs', output: 'apps/cli/README.md', freshness: 'NOT_VERIFIED' } };
  for (const [field, entry] of Object.entries({ main: manifest.main, types: manifest.types, ...manifest.bin })) {
    const target = `apps/cli/${entry}`.replace('apps/cli/dist/', 'apps/cli/src/').replace(/(?:\.d)?\.js$|\.d\.ts$/, '.ts');
    if (!files.has(target)) throw new Error(`Missing CLI build entry projection: ${entry}`);
    references.push({ id: `PACKAGE-ENTRY:${field}`, source: 'apps/cli/package.json', pointer: `/${field}`,
      kind: 'package-entry-source-projection', target, declaredPath: entry, artifactFreshness: 'NOT_VERIFIED' });
  }
  for (const field of manifest.files ?? []) {
    const targets = field === 'dist' ? paths.filter((file) => file.startsWith('apps/cli/src/') && !file.includes('/__tests__/') && code(file))
      : paths.filter((file) => file === `apps/cli/${field}` || file.startsWith(`apps/cli/${field}/`));
    for (const target of targets) references.push({ id: `PACKAGE-FILES:${field}:${target}`, source: 'apps/cli/package.json',
      pointer: `/files/${manifest.files.indexOf(field)}`, kind: field === 'dist' ? 'package-files-source-projection' : 'package-files',
      target, declaredPath: field, artifactFreshness: field === 'dist' ? 'NOT_VERIFIED' : null });
  }
  const anchors = splitAnchors.map((entry) => ({ ...entry, ...anchorFact(entry.source, entry.anchor, files) }));
  const verifiedTarget = (target, file) => {
    const resolved = { ...target, path: target.path === '$self' ? file : target.path };
    if (resolved.status === 'existing' && !fs.existsSync(path.join(root, resolved.path))) throw new Error(`Missing ownership target: ${resolved.path}`);
    if (resolved.status === 'existing' && fs.statSync(path.join(root, resolved.path)).isFile()) resolved.sha256 = hash(fs.readFileSync(path.join(root, resolved.path)));
    return resolved;
  };
  const records = paths.map((file) => {
    const rule = ownershipRules.find((entry) => matches(entry, file));
    if (!rule) throw new Error(`Unclassified ownership input: ${file}`);
    const split = [...(rule.split ?? []).map((entry) => ({ ...entry, ...anchorFact(file, entry.anchor, files) })),
      ...anchors.filter((entry) => entry.source === file)];
    const incoming = references.filter((entry) => entry.target === file).map(({ id, source, line, pointer, kind, typeOnly, targetCommand }) => ({
      id, source, ...(line ? { line } : {}), ...(pointer ? { pointer } : {}), kind,
      ...(typeOnly !== undefined ? { typeOnly } : {}), ...(targetCommand ? { targetCommand } : {}),
    }));
    const regressions = rule.regressions.map((testPath) => {
      if (!buffers.has(testPath)) throw new Error(`Missing ownership regression: ${file}: ${testPath}`);
      return { path: testPath, sha256: hash(buffers.get(testPath)), status: 'REQUIRED_AFTER_CHANGE',
        command: testPath.startsWith('scripts/') ? `node --test ${testPath}` : testPath.endsWith('.pack.test.ts') ? 'pnpm test:pack' : `pnpm --dir apps/cli exec vitest run ${testPath.replace(/^apps\/cli\//, '')}` };
    });
    return { id: `FILE:${file}`, path: file, sha256: hash(buffers.get(file)),
      decision: { ruleId: rule.id, category: rule.category, reason: rule.reason, sdk52Impact: rule.sdk52Impact,
        target: verifiedTarget(rule.target, file), tasks: rule.tasks, split },
      incoming, staticCallerState: incoming.some((entry) => ['import', 'export', 'dynamic-import', 'require', 'require-resolve'].includes(entry.kind)) ? 'HAS_MODULE_REFERENCE' : 'NO_STATIC_MODULE_CALLER',
      regressions, readyToDelete: false,
      removalGates: ['解除全部实际调用/打包/内容/CI入边，动态依赖逐点复核', 'M0-04/M6-A04：移交后独立消费与SDK52识别/创建/运行回归通过', 'M0A-04/M6-05实际清理验收；本轮仅调查'] };
  });
  return { schemaVersion: 1, compilerVersion: ts.version, yamlVersion: '2.9.1', scope: ownershipScope,
    limitation: 'Current scoped module/resource/command references; not a complete dynamic call graph. Text/resource edges do not prove execution. Generated artifacts are source projections without freshness acceptance.',
    cleanupExecuted: false, stageClosable: false, buildInputs, commands, references, files: records,
    summary: { files: records.length, references: references.length, commands: commands.length,
      unresolvedDynamic: references.filter((entry) => entry.resolution === 'UNRESOLVED_DYNAMIC').length,
      categories: Object.fromEntries(['KEEP_SDK52', 'REMOVE_SDK54', 'TRANSFER_SDK54', 'RETAIN_TOOLING'].map((category) => [category, records.filter((entry) => entry.decision.category === category).length])) } };
}

export function validateOwnershipInventory(actual, expected = createOwnershipInventory()) {
  const failures = [];
  const seen = new Set();
  for (const record of actual.files ?? []) {
    if (!record.id || seen.has(record.id)) failures.push(`Missing/duplicate file ID: ${record.id}`);
    seen.add(record.id);
    if (record.readyToDelete !== false) failures.push(`Investigation cannot authorize deletion: ${record.id}`);
    if (!record.regressions?.length || !record.decision?.target?.path) failures.push(`Missing ownership/acceptance: ${record.id}`);
  }
  for (const record of expected.files) if (!seen.has(record.id)) failures.push(`Missing file ${record.id}`);
  if (serializeOwnership(actual) !== serializeOwnership(expected)) failures.push('Ownership files/decisions/references/inputs differ from current reviewed source');
  return { valid: failures.length === 0, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || !['--output', '--check'].includes(args[0])) throw new Error('Usage: --output|--check <json>');
    const expected = createOwnershipInventory();
    if (args[0] === '--check') {
      const result = validateOwnershipInventory(JSON.parse(fs.readFileSync(args[1], 'utf8')), expected);
      console.log(JSON.stringify(result, null, 2));
      if (!result.valid) process.exitCode = 1;
    } else {
      fs.writeFileSync(args[1], serializeOwnership(expected));
      console.log(JSON.stringify({ ...expected.summary, cleanupExecuted: false, stageClosable: false }, null, 2));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
