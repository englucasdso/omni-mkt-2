// frontend/src/utils/parameterSearchParser.ts
// Pure parsing and normalization utilities for code and parameter search

export type ParameterQueryKind =
  | 'parameter'
  | 'key_value'
  | 'code_fragment'
  | 'full_snippet';

export interface ParsedQueryParam {
  name: string;
  path?: string;
  value?: string;
  rawPair?: string;
}

/**
 * Normalizes basic text: lowercase, remove diacritics, trim.
 */
export function normalizeText(str: string): string {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Normalizes code strictly for literal comparisons:
 * - Line endings (\r\n -> \n)
 * - Tabs (\t -> ' ')
 * - Runs of spaces ([ \t]+ -> ' ')
 * - Trim
 */
export function cleanCodeLiteral(code: string): string {
  if (!code) return '';
  return code
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Normalizes code deeply for equivalent comparison:
 * - Strips comment lines
 * - Unifies single/double quotes and backticks
 * - Removes trailing commas and semicolons
 * - Removes spaces around punctuation: : = , { } ( ) [ ] ;
 * - Collapses remaining whitespace
 * - Lowercases
 */
export function normalizeCodeForComparison(code: string): string {
  if (!code) return '';

  return code
    // Remove single-line comments // ...
    .replace(/\/\/[^\n]*/g, '')
    // Remove multi-line comments /* ... */
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Normalize string quotes to single standard marker or double quotes
    .replace(/['"`]/g, '"')
    // Remove spaces around syntax operators and structural delimiters
    .replace(/\s*([:=,{}\(\)\[\];])\s*/g, '$1')
    // Remove trailing commas before closing braces/brackets/parens
    .replace(/,([}\]\)])/g, '$1')
    // Remove trailing semicolons before closing braces or end of line
    .replace(/;+/g, ';')
    .replace(/;([}\]\)])/g, '$1')
    .replace(/;$/g, '')
    // Collapse any remaining whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deterministically detects the format/kind of the query without AI:
 * - parameter: single identifier or dotted path (e.g. "user_id", "event_data.item_id")
 * - key_value: single key with value (e.g. 'tipo_pessoa: "PF"' or 'tipo_pessoa="PF"')
 * - code_fragment: multiple lines or multiple key-value pairs without complete wrapper
 * - full_snippet: complete function call (dataLayer.push, gtag), complete JSON object { ... }
 */
export function detectQueryKind(rawQuery: string): ParameterQueryKind {
  const trimmed = rawQuery.trim();
  if (!trimmed) return 'parameter';

  // Check for full snippet indicators: dataLayer.push, gtag, function call, or balanced outer braces
  const hasCall = /datalayer\.push|gtag\(|window\.|function\s*\(|\(\s*\{[\s\S]*\}\s*\)/i.test(trimmed);
  const startsWithBrace = trimmed.startsWith('{') && (trimmed.endsWith('}') || trimmed.endsWith('};') || trimmed.endsWith('}'));
  const hasMultipleLinesWithBraces = trimmed.includes('{') && trimmed.includes('}') && trimmed.split('\n').length >= 3;

  if (hasCall || startsWithBrace || hasMultipleLinesWithBraces) {
    return 'full_snippet';
  }

  // Count key-value occurrences: key: val or key = val (including Unicode keys and values)
  const pairMatches =
    trimmed.match(
      /(?:"[^"]+"|'[^']+'|[\p{L}\p{N}_$.-]+)\s*[:=]\s*(?:"[^"]*"|'[^']*'|`[^`]*`|[^\s,;}\n]+)/gu
    ) || [];

  if (pairMatches.length > 1 || (pairMatches.length === 1 && trimmed.includes('\n'))) {
    return 'code_fragment';
  }

  if (pairMatches.length === 1) {
    return 'key_value';
  }

  // Check if multiple lines or comma separated tokens exist
  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    return 'code_fragment';
  }

  const commaTokens = trimmed.split(',').map((t) => t.trim()).filter(Boolean);
  if (commaTokens.length > 1) {
    return 'code_fragment';
  }

  return 'parameter';
}

/**
 * Extracts structured pairs { name, path, value } from the query string.
 * Supports:
 * - Object syntax: { event: "contratacao", produto: "credito" }
 * - Code fragments: event: "contratacao",\nproduto: "credito"
 * - Key-value: tipo_pessoa: "PF" or tipo_pessoa="PF" or "ação": "Contratação de crédito"
 * - Parameter names: user_id, event_data.produto
 */
export function extractQueryParams(rawQuery: string): ParsedQueryParam[] {
  const trimmed = rawQuery.trim();
  if (!trimmed) return [];

  const results: ParsedQueryParam[] = [];
  const seenKeys = new Set<string>();

  // Regex to match pairs with optional quotes on keys and full Unicode support
  const pairRegex =
    /(?:"([^"]+)"|'([^']+)'|([\p{L}\p{N}_$.-]+))\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`|([^\s,;}\n]+))/gu;
  let match: RegExpExecArray | null;

  while ((match = pairRegex.exec(trimmed)) !== null) {
    const rawKey = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    const rawVal = (match[4] ?? match[5] ?? match[6] ?? match[7] ?? '').trim();

    if (rawKey) {
      const isPath = rawKey.includes('.');
      const dedupeKey = `${normalizeText(rawKey)}=${normalizeText(rawVal)}`;
      if (!seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey);
        results.push({
          name: isPath ? rawKey.split('.').pop()! : rawKey,
          path: isPath ? rawKey : undefined,
          value: rawVal,
          rawPair: match[0].trim(),
        });
      }
    }
  }

  if (results.length > 0) {
    return results;
  }

  // If no key-value pairs with : or = were found, treat tokens as standalone parameters
  // Split by newlines, commas, pluses, or semicolons
  const tokens = trimmed
    .split(/[\n,;+]+/)
    .map((t) => t.replace(/[{}\(\)]/g, '').trim())
    .filter(Boolean);

  for (const tok of tokens) {
    const isPath = tok.includes('.');
    const cleanTok = tok.replace(/['"`]/g, '').trim();
    if (cleanTok && !seenKeys.has(normalizeText(cleanTok))) {
      seenKeys.add(normalizeText(cleanTok));
      results.push({
        name: isPath ? cleanTok.split('.').pop()! : cleanTok,
        path: isPath ? cleanTok : undefined,
      });
    }
  }

  return results;
}
