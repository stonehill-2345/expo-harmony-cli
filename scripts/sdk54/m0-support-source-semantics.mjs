import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { analyzeNativeSource } from './m0-native-semantics.mjs';

const require = createRequire(import.meta.url), pbxproj = require('xcode/lib/parser/pbxproj');
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_key, row) => row && typeof row === 'object' && !Array.isArray(row)
  ? Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))) : row);
const pointerKey = value => value.replaceAll('~', '~0').replaceAll('/', '~1');

export function analyzeSupportSource({ path, content }) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content), text = bytes.toString('utf8');
  const output = { path, sourceSha256: hash(bytes), parser: null, facts: [], boundaries: [], platformSupportAccepted: false };
  const fail = (kind, reason) => output.boundaries.push({ kind, severity: 'SOURCE_ENUMERATION_BLOCKER', path, reason });
  const walk = (value, pointer = '', kindFor = () => 'STRUCTURED_CONFIGURATION') => {
    output.facts.push({ id: `SUPPORT-SOURCE:${encodeURIComponent(path)}:${encodeURIComponent(pointer)}`, kind: kindFor(pointer), pointer,
      value, sourceRange: { start: 0, end: text.length, line: 1, endLine: text.split('\n').length, precision: 'WHOLE_DOCUMENT_WITH_EXACT_STRUCTURED_POINTER' } });
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) walk(child, `${pointer}/${pointerKey(key)}`, kindFor);
  };
  try {
    if (path.endsWith('.json') || path.endsWith('.map')) {
      let value;
      if (/(?:^|\/)tsconfig(?:\.[^/]*)?\.json$/.test(path) || /(?:^|\/)\.vscode\/[^/]+\.json$/.test(path)) {
        output.parser = `typescript:${ts.version}:parseConfigFileTextToJson`;
        const parsed = ts.parseConfigFileTextToJson(path, text);
        if (parsed.error) throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, ' '));
        value = parsed.config;
      } else { output.parser = 'JSON.parse'; value = JSON.parse(text); }
      if (path.endsWith('.map')) {
        if (value.version !== 3 || !Array.isArray(value.sources) || value.sources.some(row => typeof row !== 'string')
          || value.sourcesContent != null && (!Array.isArray(value.sourcesContent) || value.sourcesContent.length !== value.sources.length
            || value.sourcesContent.some(row => row !== null && typeof row !== 'string')))
          throw new Error('Unsupported or malformed version-3 source-map source/content correspondence');
        walk(value, '', pointer => /^\/sources\/\d+$/.test(pointer) ? 'SOURCE_MAP_SOURCE'
          : /^\/sourcesContent\/\d+$/.test(pointer) ? 'SOURCE_MAP_EMBEDDED_CONTENT' : 'SOURCE_MAP_CONFIGURATION');
      } else walk(value);
    } else if (path.endsWith('.pbxproj')) {
      output.parser = `xcode:${require('xcode/package.json').version}:pbxproj`;
      const value = pbxproj.parse(text), resourcePointers = [];
      const resources = (object, pointer = '') => {
        if (!object || typeof object !== 'object') return;
        if (/^PBX(?:FileReference|BuildFile|ResourcesBuildPhase)$/.test(object.isa)) resourcePointers.push(pointer);
        for (const [key, child] of Object.entries(object)) resources(child, `${pointer}/${pointerKey(key)}`);
      };
      resources(value);
      walk(value, '', pointer => resourcePointers.some(prefix => pointer === prefix || pointer.startsWith(prefix + '/')) ? 'PROJECT_RESOURCE'
        : pointer.includes('/buildSettings/') ? 'PROJECT_BUILD_SETTING' : 'PROJECT_CONFIGURATION');
    } else if (/\.(?:xcscheme|xcworkspacedata|xcsettings)$/.test(path)) {
      const native = analyzeNativeSource({ path: path + '.xml', content: text });
      output.parser = native.parser;
      output.facts = native.facts.map((row, index) => ({ ...row, id: `SUPPORT-SOURCE:${encodeURIComponent(path)}:${index}` }));
      output.boundaries = native.boundaries;
    } else if (/(?:^|\/)Podfile$/.test(path)) {
      const native = analyzeNativeSource({ path: path + '.rb', content: text });
      output.parser = native.parser;
      output.facts = native.facts.map((row, index) => ({ ...row, id: `SUPPORT-SOURCE:${encodeURIComponent(path)}:${index}` }));
      output.boundaries = native.boundaries;
    } else fail('UNSUPPORTED_SUPPORT_SOURCE', 'The complete fixed file identity is retained; this parser does not claim semantic coverage for this format.');
  } catch (error) { fail('MALFORMED_SUPPORT_SOURCE', error.message); }
  output.coverage = output.boundaries.some(row => row.severity === 'SOURCE_ENUMERATION_BLOCKER') ? 'SOURCE_ENUMERATION_BLOCKED' : 'STRUCTURED_SOURCE_ENUMERATED';
  return output;
}

export function validateSupportSource(actual, expected) {
  const failures = [], indexed = new Map();
  for (const row of actual?.facts ?? []) {
    if (indexed.has(row.id)) failures.push(`Duplicate support-source fact: ${row.id}`);
    indexed.set(row.id, row);
  }
  for (const row of expected.facts) if (!indexed.has(row.id) || canonical(indexed.get(row.id)) !== canonical(row)) failures.push(`Missing or changed support-source fact: ${row.id}`);
  if (canonical(actual) !== canonical(expected)) failures.push(`Support source content/metadata mismatch: ${expected.path}`);
  return { valid: failures.length === 0, failures };
}
