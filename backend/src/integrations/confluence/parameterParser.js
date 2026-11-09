/**
 * ParameterParser
 * Parser tolerante e seguro para snippets de tagueamento Confluence / dataLayer.push.
 * Não utiliza eval nem new Function.
 * Extrai determinísticamente: eventos, caminhos completos, chaves de primeiro nível,
 * valores brutos, valores normalizados, tipos de valores e assinaturas estruturais.
 */

import {
  decodeHtmlEntities,
  detectReplacementCharDiagnostic
} from './unicodeNormalizer.js';

export class ParameterParser {
  /**
   * Decodifica entidades HTML (nomeadas, decimais e hexadecimais), repara mojibake determinístico
   * e limpa caracteres invisíveis delegando à rotina central compartilhada.
   */
  decodeHtml(str) {
    return decodeHtmlEntities(str);
  }

  /**
   * Remove comentários de linha (//) e de bloco (/* *\/) preservando intacto o conteúdo
   * dentro de strings ("...", '...', `...`), como URLs "https://...".
   */
  stripCommentsPreservingStrings(code) {
    if (!code) return '';
    const str = String(code);
    let out = '';
    let i = 0;
    const len = str.length;
    let quote = '';

    while (i < len) {
      const ch = str[i];

      if (quote) {
        out += ch;
        if (ch === '\\' && i + 1 < len) {
          out += str[i + 1];
          i += 2;
          continue;
        }
        if (ch === quote) {
          quote = '';
        }
        i++;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        out += ch;
        i++;
        continue;
      }

      // Comentário de bloco /* ... */
      if (ch === '/' && str[i + 1] === '*') {
        i += 2;
        while (i < len && !(str[i] === '*' && str[i + 1] === '/')) {
          i++;
        }
        i += 2;
        out += ' ';
        continue;
      }

      // Comentário de linha // ...
      if (ch === '/' && str[i + 1] === '/') {
        i += 2;
        while (i < len && str[i] !== '\n') {
          i++;
        }
        continue;
      }

      out += ch;
      i++;
    }

    return out;
  }

  /**
   * Normaliza chaves e eventos para comparação interna mantendo `raw` fiel ao original Unicode:
   * "Simulação_Concluída" -> raw: "Simulação_Concluída", normalized: "simulacaoconcluida", base: "simulacaoconcluida"
   * "Screen_Data_New" -> raw: "Screen_Data_New", normalized: "screendatanew", base: "screendata"
   */
  normalizeKey(key) {
    if (!key) return { raw: '', normalized: '', base: '' };
    const raw = decodeHtmlEntities(String(key)).trim();
    const normalized = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[\s_\-]+/g, '')
      .replace(/[^\w]/g, '');

    // Identifica base_key removendo sufixo "new" se existir
    let base = normalized;
    if (normalized.endsWith('new') && normalized.length > 3) {
      base = normalized.slice(0, -3);
    }

    return { raw, normalized, base };
  }

  /**
   * Classifica o tipo de valor de um parâmetro
   */
  classifyValueType(rawValue, quoteChar) {
    const trimmed = String(rawValue || '').trim();

    if (!trimmed) {
      return quoteChar ? 'EMPTY' : 'NULL';
    }

    // Placeholder do GTM / Figma (ex: {{user-id}}, {{código-produto}}, <id>)
    if ((trimmed.startsWith('{{') && trimmed.endsWith('}}')) || (trimmed.startsWith('<') && trimmed.endsWith('>'))) {
      return 'PLACEHOLDER';
    }

    // Se possui aspas envolventes, é string literal (HARDCODED)
    if (quoteChar) {
      // Se dentro das aspas houver placeholder explícito
      if (trimmed.includes('{{') && trimmed.includes('}}')) {
        return 'PLACEHOLDER';
      }
      return 'HARDCODED';
    }

    // Valores sem aspas
    if (trimmed === 'null' || trimmed === 'undefined') {
      return 'NULL';
    }
    if (trimmed === 'true' || trimmed === 'false') {
      return 'BOOLEAN';
    }
    if (!isNaN(Number(trimmed)) && !trimmed.startsWith('0x')) {
      return 'NUMBER';
    }
    // Referências JavaScript conhecidas ou variáveis sem aspas
    if (
      trimmed.startsWith('document.') ||
      trimmed.startsWith('window.') ||
      trimmed.startsWith('location.') ||
      /^[\p{L}_$][\p{L}\p{N}_$]*(\.[\p{L}_$][\p{L}\p{N}_$]*)*$/u.test(trimmed)
    ) {
      return 'JAVASCRIPT_REFERENCE';
    }

    return 'UNKNOWN';
  }

  /**
   * Extrai o bloco de objeto de um código (ex: dataLayer.push({...}) ou {...})
   */
  extractObjectBlocks(rawCode) {
    const code = this.decodeHtml(rawCode);
    const blocks = [];

    // Procura por dataLayer.push(
    const dlPushRegex = /dataLayer\.push\s*\(/g;
    let match;
    while ((match = dlPushRegex.exec(code)) !== null) {
      const startIndex = match.index + match[0].length - 1; // aponta para '('
      const objStr = this.extractBalancedBrackets(code, startIndex, '(', ')');
      if (objStr) {
        // Dentro do push, procura o primeiro '{'
        const firstBrace = objStr.indexOf('{');
        if (firstBrace !== -1) {
          const innerObj = this.extractBalancedBrackets(objStr, firstBrace, '{', '}');
          if (innerObj) {
            blocks.push(innerObj);
            continue;
          }
        }
        blocks.push(objStr.trim());
      }
    }

    // Se não encontrou dataLayer.push, procura por blocos literais { ... }
    if (blocks.length === 0) {
      let braceIdx = code.indexOf('{');
      while (braceIdx !== -1) {
        const candidate = this.extractBalancedBrackets(code, braceIdx, '{', '}');
        if (candidate && candidate.length > 5 && (candidate.includes(':') || candidate.includes('event'))) {
          blocks.push(candidate);
          braceIdx = code.indexOf('{', braceIdx + candidate.length);
        } else {
          braceIdx = code.indexOf('{', braceIdx + 1);
        }
      }
    }

    return blocks.length > 0 ? blocks : [code];
  }

  /**
   * Extrai substring balanceando parênteses, colchetes ou chaves com segurança
   */
  extractBalancedBrackets(text, startIndex, openChar, closeChar) {
    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inBacktick = false;
    let escape = false;
    let startFound = -1;

    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        continue;
      }

      if (char === "'" && !inDoubleQuote && !inBacktick) {
        inSingleQuote = !inSingleQuote;
        continue;
      }
      if (char === '"' && !inSingleQuote && !inBacktick) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }
      if (char === '`' && !inSingleQuote && !inDoubleQuote) {
        inBacktick = !inBacktick;
        continue;
      }

      if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
        if (char === openChar) {
          if (depth === 0) startFound = i;
          depth++;
        } else if (char === closeChar) {
          depth--;
          if (depth === 0 && startFound !== -1) {
            return text.substring(startFound, i + 1);
          }
        }
      }
    }

    return null;
  }

  /**
   * Constrói um item de parâmetro preservando campos raw e normalizados sem remover acentos de normalized_value
   */
  buildParameterEntry(rawKey, fullPath, val, quote) {
    const cleanKey = decodeHtmlEntities(rawKey).trim();
    const cleanFullPath = decodeHtmlEntities(fullPath).trim();
    const decodedVal = decodeHtmlEntities(val);
    const normalizedVal = quote ? decodedVal : decodedVal.trim();
    const rawValue = quote ? `${quote}${decodedVal}${quote}` : decodedVal.trim();
    const valueType = this.classifyValueType(normalizedVal, quote);

    const { raw: nameRaw, normalized: nameNormalized } = this.normalizeKey(cleanKey);
    const pathNormalized = cleanFullPath
      .split('.')
      .map((seg) => this.normalizeKey(seg).normalized || seg.toLowerCase())
      .join('.');

    return {
      name: nameRaw || cleanKey,
      name_raw: nameRaw || cleanKey,
      name_normalized: nameNormalized,
      path: cleanFullPath,
      path_raw: cleanFullPath,
      path_normalized: pathNormalized,
      raw_value: rawValue,
      normalized_value: normalizedVal,
      value_type: valueType
    };
  }

  /**
   * Parser tolerante de pares chave-valor e aninhamentos em JavaScript Object Literal / JSON
   * Suporta chaves e valores Unicode (com acentos, cedilha, símbolos, placeholders).
   */
  parseObjectLiteral(objText) {
    const decodedText = this.decodeHtml(objText);
    const text = this.stripCommentsPreservingStrings(decodedText);

    // Se estiver envolvido por { ... }, remove as chaves externas
    const trimmed = text.trim();
    let content = trimmed;
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      content = trimmed.slice(1, -1);
    }

    const params = [];
    let eventRaw = '';
    const topLevelGroups = new Set();

    // Função recursiva com caminhos aninhados
    const parseNested = (str, prefix = '') => {
      let i = 0;
      const len = str.length;

      while (i < len) {
        // Pula espaços, vírgulas e ponto-e-vírgula
        while (i < len && /[\s,;]/.test(str[i])) i++;
        if (i >= len) break;

        // Extrai a chave (entre aspas ou identificador Unicode válido)
        let key = '';
        let keyQuote = '';
        if (str[i] === '"' || str[i] === "'" || str[i] === '`') {
          keyQuote = str[i];
          i++;
          const start = i;
          while (i < len && str[i] !== keyQuote) {
            if (str[i] === '\\') i++;
            i++;
          }
          key = str.substring(start, i);
          i++; // fecha aspas
        } else {
          const start = i;
          while (i < len && /[\p{L}\p{N}_$.-]/u.test(str[i])) i++;
          key = str.substring(start, i);
        }

        key = decodeHtmlEntities(key).trim();
        if (!key) {
          i++;
          continue;
        }

        // Procura ':'
        while (i < len && /\s/.test(str[i])) i++;
        if (i >= len || str[i] !== ':') {
          i++;
          continue;
        }
        i++; // pula ':'

        // Pula espaços antes do valor
        while (i < len && /\s/.test(str[i])) i++;
        if (i >= len) break;

        // Se o valor for um objeto aninhado '{'
        if (str[i] === '{') {
          const nestedObj = this.extractBalancedBrackets(str, i, '{', '}');
          if (nestedObj) {
            if (!prefix) {
              topLevelGroups.add(key);
            }
            const inner = nestedObj.slice(1, -1);
            parseNested(inner, prefix ? `${prefix}.${key}` : key);
            i += nestedObj.length;
            continue;
          }
        }

        // Se o valor for um array '[ ... ]'
        if (str[i] === '[') {
          const nestedArr = this.extractBalancedBrackets(str, i, '[', ']');
          if (nestedArr) {
            const fullPath = prefix ? `${prefix}.${key}` : key;
            if (!prefix && fullPath.toLowerCase() !== 'event') {
              topLevelGroups.add(key);
            }
            params.push(this.buildParameterEntry(key, fullPath, nestedArr, ''));
            i += nestedArr.length;
            continue;
          }
        }

        // Se for valor simples (string com aspas ou literal)
        let val = '';
        let quote = '';
        if (str[i] === '"' || str[i] === "'" || str[i] === '`') {
          quote = str[i];
          i++;
          const valStart = i;
          while (i < len && str[i] !== quote) {
            if (str[i] === '\\') i++;
            i++;
          }
          val = str.substring(valStart, i);
          i++; // fecha aspas
        } else {
          // Valor sem aspas até a próxima vírgula, quebra de linha ou '}'
          while (i < len && str[i] !== ',' && str[i] !== '}' && str[i] !== '\n') {
            val += str[i];
            i++;
          }
          val = val.trim();
        }

        const fullPath = prefix ? `${prefix}.${key}` : key;
        const paramEntry = this.buildParameterEntry(key, fullPath, val, quote);

        if (fullPath.toLowerCase() === 'event') {
          eventRaw = paramEntry.normalized_value;
        } else if (!prefix) {
          topLevelGroups.add(key);
        }

        params.push(paramEntry);
      }
    };

    parseNested(content, '');

    // Fallback: se o parser estruturado não extraiu pares por sintaxe incomum, extrai pares com suporte a chaves Unicode
    if (params.length === 0) {
      const lineRegex = /['"]?([\p{L}\p{N}_$.-]+)['"]?\s*:\s*(['"`]?)([\s\S]*?)\2(?=[,\n\r}]|$)/gu;
      let m;
      while ((m = lineRegex.exec(content)) !== null) {
        const fullKey = decodeHtmlEntities(m[1]).trim();
        const quote = m[2] || '';
        const rawVal = m[3] !== undefined ? m[3] : '';
        const leafKey = fullKey.split('.').pop() || fullKey;
        const paramEntry = this.buildParameterEntry(leafKey, fullKey, rawVal, quote);

        if (fullKey.toLowerCase() === 'event') {
          eventRaw = paramEntry.normalized_value;
        } else {
          const rootKey = fullKey.split('.')[0];
          topLevelGroups.add(rootKey);
        }

        params.push(paramEntry);
      }
    }

    return {
      eventRaw,
      params,
      topLevelGroups: Array.from(topLevelGroups)
    };
  }

  /**
   * Analisa um snippet completo e extrai seu modelo canônico preservando fielmente Unicode
   */
  parseSnippet(rawCode, mapId = '', screenId = '', snippetIndex = 0, options = {}) {
    const inputStageDiag = detectReplacementCharDiagnostic(String(rawCode || ''), {
      mapId,
      screenIndex: options.screenIndex ?? null,
      snippetIndex,
      stage: options.stage || 'parameter_parser_input'
    });

    const cleanCode = this.decodeHtml(rawCode).trim();
    const objectBlocks = this.extractObjectBlocks(cleanCode);

    let allParams = [];
    let detectedEventRaw = '';
    const allGroups = new Set();

    for (const block of objectBlocks) {
      const parsed = this.parseObjectLiteral(block);
      if (parsed.eventRaw && !detectedEventRaw) {
        detectedEventRaw = parsed.eventRaw;
      }
      for (const grp of parsed.topLevelGroups) {
        allGroups.add(grp);
      }
      for (const p of parsed.params) {
        // Evita duplicatas exatas de caminho
        if (!allParams.some(existing => existing.path === p.path)) {
          allParams.push({
            ...p,
            map_id: mapId,
            screen_id: screenId
          });
        }
      }
    }

    const { raw: event_raw, normalized: event_normalized, base: base_key } = this.normalizeKey(detectedEventRaw);
    const detected_paths = Array.from(new Set(allParams.map(p => p.path))).sort();
    const signature = Array.from(allGroups).filter(g => g.toLowerCase() !== 'event').sort();

    // Gera o pattern_id estável
    const pattern_id = [base_key || 'noevent', ...signature].join('+');

    // Determina a classe de mensuração do snippet
    const measurement_class = this.classifySnippetMeasurement(detected_paths, signature, event_normalized);

    const snippetId = `${mapId}-${screenId}-snip-${snippetIndex}`;
    const unicodeDiagnostic =
      inputStageDiag ||
      detectReplacementCharDiagnostic(cleanCode, {
        mapId,
        screenIndex: options.screenIndex ?? null,
        snippetIndex,
        stage: options.stage || 'parameter_parser_output'
      });

    return {
      snippet_id: snippetId,
      snippet_index: snippetIndex,
      map_id: mapId,
      screen_id: screenId,
      raw_code: cleanCode,
      event_raw,
      event_normalized,
      base_key,
      detected_paths,
      signature,
      pattern_id,
      measurement_class,
      parameters: allParams,
      ...(unicodeDiagnostic ? { unicode_diagnostics: unicodeDiagnostic } : {})
    };
  }

  /**
   * Classificação determinística da mensuração baseada em assinaturas comprovadas
   */
  classifySnippetMeasurement(paths, signature, eventNormalized) {
    const pathsLower = paths.map(p => p.toLowerCase());
    const sigLower = signature.map(s => s.toLowerCase());

    // 1. GA3 Comprovado (Universal Analytics)
    const hasGa3Paths = pathsLower.some(p => 
      p === 'eventcategory' || p === 'event_category' ||
      p === 'eventaction' || p === 'event_action' ||
      p === 'eventlabel' || p === 'event_label' ||
      p === 'eventvalue' || p === 'event_value'
    );

    // 2. GA4 Comprovado
    const hasGa4Paths = pathsLower.some(p =>
      p.startsWith('ga_event') ||
      (p.startsWith('screen.') && pathsLower.some(q => q.startsWith('product.'))) ||
      p === 'event_type' ||
      p.startsWith('ep_padrao') ||
      p.startsWith('web_view') ||
      p.startsWith('product.flow') ||
      p.startsWith('user.user_id')
    );
    const hasGa4Sig = sigLower.includes('ga_event') ||
      (sigLower.includes('screen') && sigLower.includes('product')) ||
      sigLower.includes('ep_padrao');

    if (hasGa3Paths && (hasGa4Paths || hasGa4Sig)) {
      return 'HIBRIDO';
    }
    if (hasGa4Paths || hasGa4Sig) {
      return 'GA4';
    }
    if (hasGa3Paths) {
      return 'GA3';
    }

    return 'NAO_CLASSIFICADO';
  }
}
