import * as he from 'he';

/**
 * Mapeamento reverso dos caracteres específicos da página de código Windows-1252 (0x80..0x9F)
 * para seus respectivos bytes originais quando um texto UTF-8 foi lido incorretamente como Windows-1252.
 */
const WIN1252_CHAR_TO_BYTE = new Map([
  [0x20ac, 0x80], // €
  [0x201a, 0x82], // ‚
  [0x0192, 0x83], // ƒ
  [0x201e, 0x84], // „
  [0x2026, 0x85], // …
  [0x2020, 0x86], // †
  [0x2021, 0x87], // ‡
  [0x02c6, 0x88], // ˆ
  [0x2030, 0x89], // ‰
  [0x0160, 0x8a], // Š
  [0x2039, 0x8b], // ‹
  [0x0152, 0x8c], // Œ
  [0x017d, 0x8e], // Ž
  [0x2018, 0x91], // ‘
  [0x2019, 0x92], // ’
  [0x201c, 0x93], // “
  [0x201d, 0x94], // ”
  [0x2022, 0x95], // •
  [0x2013, 0x96], // –
  [0x2014, 0x97], // —
  [0x02dc, 0x98], // ˜
  [0x2122, 0x99], // ™
  [0x0161, 0x9a], // š
  [0x203a, 0x9b], // ›
  [0x0153, 0x9c], // œ
  [0x017e, 0x9e], // ž
  [0x0178, 0x9f]  // Ÿ
]);

const utf8FatalDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Converte um code point Unicode (que representa um byte 0x80..0xBF em Latin-1 ou Windows-1252)
 * de volta para o valor de byte (0x80..0xBF), ou retorna -1 se não for um byte de continuação UTF-8 válido.
 */
function charToContinuationByte(char) {
  if (!char) return -1;
  const cp = char.codePointAt(0);
  if (cp >= 0x80 && cp <= 0xbf) {
    return cp;
  }
  const winByte = WIN1252_CHAR_TO_BYTE.get(cp);
  if (winByte !== undefined && winByte >= 0x80 && winByte <= 0xbf) {
    return winByte;
  }
  return -1;
}

/**
 * Converte uma sequência de caracteres Latin-1 / Windows-1252 para Uint8Array,
 * retornando null caso algum caractere não pertença ao intervalo 0x00..0xFF.
 */
function stringToWin1252Bytes(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const cp = str.charCodeAt(i);
    if (cp <= 0xff) {
      bytes[i] = cp;
    } else if (WIN1252_CHAR_TO_BYTE.has(cp)) {
      bytes[i] = WIN1252_CHAR_TO_BYTE.get(cp);
    } else {
      return null;
    }
  }
  return bytes;
}

/**
 * Conta quantos marcadores suspeitos de mojibake (sequências iniciadas por Ã, Â, â€ seguidas de bytes 0x80..0xBF)
 * ou caracteres de substituição existem em uma string.
 */
export function countMojibakeMarkers(str) {
  if (!str) return 0;
  let markers = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\uFFFD') {
      markers += 2;
      continue;
    }
    if ((ch === 'Ã' || ch === 'Â') && i + 1 < str.length) {
      const nextByte = charToContinuationByte(str[i + 1]);
      if (nextByte !== -1) {
        markers++;
      }
    } else if (ch === 'â' && i + 2 < str.length) {
      const b2 = charToContinuationByte(str[i + 1]);
      const b3 = charToContinuationByte(str[i + 2]);
      if (b2 !== -1 && b3 !== -1) {
        markers++;
      }
    }
  }
  return markers;
}

/**
 * Repara de forma determinística e segura ocorrências de mojibake (UTF-8 lido como Latin-1/Windows-1252),
 * como "ContrataÃ§Ã£o" -> "Contratação", "CrÃ©dito" -> "Crédito", "JoÃ£o" -> "João", "CORREÃ‡ÃƒO" -> "CORREÇÃO".
 *
 * Regras de segurança:
 * - Nunca altera texto português válido em maiúsculas (como "CORREÇÃO", "SÃO", "JOÃO", onde 'Ã' é seguido de 'O').
 * - Só aceita a reparação quando a decodificação UTF-8 estrita (fatal: true) é válida e reduz os marcadores de mojibake.
 * - Nunca remove nem esconde caracteres desconhecidos ou ''.
 */
export function repairMojibakeIfNeeded(input) {
  if (!input || typeof input !== 'string') return input || '';

  const initialMarkers = countMojibakeMarkers(input);
  if (initialMarkers === 0) {
    return input;
  }

  let out = '';
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    // Sequência de 2 bytes UTF-8 lida como Latin-1/Win-1252: 0xC2 ('Â') ou 0xC3 ('Ã') + byte 0x80..0xBF
    if ((ch === 'Ã' || ch === 'Â') && i + 1 < len) {
      const b2 = charToContinuationByte(input[i + 1]);
      if (b2 !== -1) {
        const b1 = ch.charCodeAt(0);
        try {
          const decoded = utf8FatalDecoder.decode(new Uint8Array([b1, b2]));
          if (decoded && !decoded.includes('\uFFFD')) {
            out += decoded;
            i += 2;
            continue;
          }
        } catch (_) {
          // Preserva original se não formar sequência UTF-8 válida
        }
      }
    }

    // Sequência de 3 bytes UTF-8 (ex: pontuação tipográfica E2 80 xx -> 'â' + byte2 + byte3)
    if (ch === 'â' && i + 2 < len) {
      const b2 = charToContinuationByte(input[i + 1]);
      const b3 = charToContinuationByte(input[i + 2]);
      if (b2 !== -1 && b3 !== -1) {
        try {
          const decoded = utf8FatalDecoder.decode(new Uint8Array([0xe2, b2, b3]));
          if (decoded && !decoded.includes('\uFFFD')) {
            out += decoded;
            i += 3;
            continue;
          }
        } catch (_) {
          // Preserva original
        }
      }
    }

    out += ch;
    i++;
  }

  // Confirma que a reparação reduziu marcadores inválidos e não introduziu caracteres de substituição
  const finalMarkers = countMojibakeMarkers(out);
  const initialReplacementCount = (input.match(/\uFFFD/g) || []).length;
  const finalReplacementCount = (out.match(/\uFFFD/g) || []).length;

  if (finalMarkers < initialMarkers && finalReplacementCount <= initialReplacementCount) {
    return out;
  }

  // Fallback opcional: se toda a string consiste em bytes Windows-1252 e decodifica inteira
  const fullBytes = stringToWin1252Bytes(input);
  if (fullBytes) {
    try {
      const fullDecoded = utf8FatalDecoder.decode(fullBytes);
      if (
        countMojibakeMarkers(fullDecoded) < initialMarkers &&
        (fullDecoded.match(/\uFFFD/g) || []).length <= initialReplacementCount
      ) {
        return fullDecoded;
      }
    } catch (_) {
      // Ignora e preserva original
    }
  }

  return input;
}

/**
 * Decodifica uma única entidade HTML terminada por ponto-e-vírgula usando a biblioteca `he`,
 * preservando o texto original caso não seja uma entidade reconhecida.
 */
function decodeSingleHtmlEntity(fullMatch) {
  try {
    const decoded = he.decode(fullMatch, { isAttributeValue: false, strict: false });
    // Evita substituir por caractere de substituição caso um código numérico inválido tenha sido informado
    if (decoded.includes('\uFFFD') && !fullMatch.includes('\uFFFD')) {
      return fullMatch;
    }
    return decoded;
  } catch (_) {
    return fullMatch;
  }
}

/**
 * Rotina central, pura e idempotente para decodificação de entidades HTML e preservação Unicode.
 *
 * Garantias:
 * 1. Decodifica todas as entidades HTML nomeadas (&ccedil;, &atilde;, &Ccedil;, &Atilde;, &eacute;, &apos;, etc.).
 * 2. Decodifica entidades numéricas decimais (&#231;, &#227;, &#199;, &#195;, etc.).
 * 3. Decodifica entidades numéricas hexadecimais (&#xE7;, &#xE3;, &#xC7;, &#xC3;, etc.).
 * 4. Preserva caracteres UTF-8 já corretos, acentos, cedilha, símbolos, moedas, placeholders e emojis.
 * 5. Repara mojibake confirmado de forma determinística antes da limpeza de caracteres invisíveis.
 * 6. Não realiza double decode destrutivo e não altera '&' legítimo (ex: "Crédito & Investimentos", "a && b", "?a=1&para=2").
 * 7. É idempotente: executar múltiplas vezes sobre texto já decodificado retorna exatamente o mesmo texto.
 * 8. Nunca remove silenciosamente o caractere de substituição '' (\uFFFD).
 */
export function decodeHtmlEntities(input, options = {}) {
  if (input === null || input === undefined) return '';
  let text = String(input);
  if (!text) return '';

  // 1. Se houver entidades duplamente escapadas de caracteres acentuados/tipográficos (ex: &amp;Ccedil; ou &amp;#231;),
  // desfaz apenas a camada externa de &amp; quando o interior é uma entidade válida de caractere (não estrutural &amp;amp;, &amp;lt;, &amp;gt;).
  text = text.replace(/&amp;(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (full, inner) => {
    const lowerInner = inner.toLowerCase();
    if (lowerInner === 'amp' || lowerInner === 'lt' || lowerInner === 'gt') {
      return full;
    }
    const candidateEntity = `&${inner};`;
    const decodedCandidate = decodeSingleHtmlEntity(candidateEntity);
    if (decodedCandidate !== candidateEntity) {
      return decodedCandidate;
    }
    return full;
  });

  // 2. Decodifica entidades HTML formadas com ponto-e-vírgula explícito (&nome;, &#dec;, &#xhex;)
  // Não altera '&' solto nem parâmetros de URL como '&para=1' ou '&copy=2' sem ponto-e-vírgula.
  text = text.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (fullMatch) => {
    return decodeSingleHtmlEntity(fullMatch);
  });

  // 3. Repara mojibake determinístico (importante executar ANTES de remover \u00AD, pois 'Ã\u00AD' é 'í' em mojibake)
  text = repairMojibakeIfNeeded(text);

  // 4. Normaliza espaços não separáveis para espaço normal, preservando quebras de linha e indentação
  text = text.replace(/[\u00A0\u202F\u2007]/g, ' ');

  // 5. Remove apenas caracteres invisíveis de largura zero (preservando \uFFFD '' e todo o conteúdo visível)
  if (!options.keepZeroWidth) {
    text = text.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
  }

  return text;
}

/**
 * Extrai e preserva o código-fonte de um bloco HTML (<pre>, <code>, .codeContent)
 * sem colapsar quebras de linha, indentação, acentos, aspas ou operadores (<, >, &).
 */
export function extractCodeFromHtmlBlock(rawHtmlBlock) {
  if (!rawHtmlBlock || typeof rawHtmlBlock !== 'string') return '';

  const withLineBreaks = rawHtmlBlock
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  // Remove tags HTML sem injetar espaços artificiais no meio de tokens ou strings
  const withoutTags = withLineBreaks.replace(/<[^>]+>/g, '');

  // Decodifica entidades HTML e repara mojibake preservando quebras de linha e indentação
  const decoded = decodeHtmlEntities(withoutTags);

  // Remove espaços à direita de cada linha e linhas vazias nas extremidades, mantendo indentação interna
  const cleanedLines = decoded
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''));

  return cleanedLines.join('\n').trim();
}

/**
 * Extrai o conteúdo de uma linha individual (.line) do SyntaxHighlighter do Confluence,
 * preservando a indentação da linha, aspas, placeholders e caracteres Unicode.
 */
export function extractCodeFromSyntaxHighlighterLine(lineHtml) {
  if (lineHtml === null || lineHtml === undefined) return '';

  const withoutScripts = String(lineHtml)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  // Em linhas do SyntaxHighlighter, cada token está em <code class="js ...">token</code>.
  // Remover as tags com '' preserva exatamente os espaços reais (&nbsp;) e não injeta espaços dentro de strings.
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, '');

  const decoded = decodeHtmlEntities(withoutTags);
  return decoded.replace(/[ \t]+$/g, '');
}

/**
 * Detecta a presença do caractere de substituição Unicode '' (\uFFFD) e gera um diagnóstico
 * técnico resumido e seguro (sem imprimir o snippet inteiro nem dados sensíveis).
 */
export function detectReplacementCharDiagnostic(text, context = {}) {
  if (!text || typeof text !== 'string') return null;
  const matches = text.match(/\uFFFD/g);
  if (!matches || matches.length === 0) return null;

  return {
    type: 'UNICODE_REPLACEMENT_CHAR',
    mapId: context.mapId !== undefined && context.mapId !== null ? String(context.mapId) : '',
    screenIndex:
      typeof context.screenIndex === 'number' && Number.isInteger(context.screenIndex)
        ? context.screenIndex
        : null,
    snippetIndex:
      typeof context.snippetIndex === 'number' && Number.isInteger(context.snippetIndex)
        ? context.snippetIndex
        : null,
    stage: String(context.stage || 'extraction'),
    occurrences: matches.length
  };
}
