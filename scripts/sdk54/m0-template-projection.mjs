import { createHash } from 'node:crypto';

export const TEMPLATE_PROJECTION_RULE = 'EJS_PROJECT_IDENTIFIER_SAME_LENGTH_V1';
const hash = text => createHash('sha256').update(text).digest('hex');

export function projectTemplateSource({ path, text }) {
  if (!text.includes('<%')) return { text, projection: null };
  const substitutions = [];
  const projected = text.replace(/<%[-=]\s*project\.([A-Za-z_]\w*)\s*%>/g, (raw, name, start) => {
    const replacement = `Template_${name}`.padEnd(raw.length, '_');
    substitutions.push({ start, end: start + raw.length, name, raw, replacement });
    return replacement;
  });
  if (projected.length !== text.length) throw new Error(`Template position drift: ${path}`);
  const supportedRanges = new Set(substitutions.map(token => `${token.start}:${token.end}`));
  const unsupportedTokens = [...text.matchAll(/<%[\s\S]*?(?:%>|$)/g)]
    .map(match => ({ start: match.index, end: match.index + match[0].length, raw: match[0] }))
    .filter(token => !supportedRanges.has(`${token.start}:${token.end}`));
  return { text: projected, projection: { path, rule: TEMPLATE_PROJECTION_RULE,
    status: substitutions.length ? 'APPLIED' : 'UNSUPPORTED_ONLY', offsetUnit: 'UTF16_CODE_UNIT', positionSource: 'RAW_SOURCE',
    rawLength: text.length, projectedLength: projected.length, rawSha256: hash(text), projectedSha256: hash(projected),
    substitutions, unsupportedTokens } };
}
