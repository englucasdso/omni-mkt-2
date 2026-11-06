/**
 * ParameterParser
 * Parser tolerante e seguro para snippets de tagueamento Confluence / dataLayer.push.
 * Não utiliza eval nem new Function.
 * Extrai determinísticamente: eventos, caminhos completos, chaves de primeiro nível,
 * valores brutos, valores normalizados, tipos de valores e assinaturas estruturais.
 */

export class ParameterParser {
  /**
   * Decodifica entidades HTML e limpa caracteres invisíveis
   */
  decodeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/\u200B/g, '')
      .replace(/\uFEFF/g, '');
  }

  /**
   * Normaliza chaves e eventos para comparação:
   * "Screen_Data" -> "screendata"
   * "Screen Data" -> "screendata"
   * "Screen_Data_New" -> normalized: "screendatanew", base: "screendata"
   */
  normalizeKey(key) {
    if (!key) return { raw: '', normalized: '', base: '' };
    const raw = String(key).trim();
    const normalized = raw
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

    // Placeholder do GTM / Figma (ex: {{user-id}}, {{segmento}}, <id>)
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
      /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/.test(trimmed)
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
      const startIndex = match.index + match[0].length;
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
          braceIdx = code.indexOf('{', braceIdx + candidate.length + 2);
        } else {
          braceIdx = code.indexOf('{', braceIdx + 1);
        }
      }
    }

    return blocks.length > 0 ? blocks : [code];
  }

  /**
   * Extrai substring balanceando parênteses ou chaves com segurança
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
   * Parser tolerante de pares chave-valor e aninhamentos em JavaScript Object Literal
   */
  parseObjectLiteral(objText) {
    let text = this.decodeHtml(objText);
    
    // Remove comentários de linha // e de bloco /* */
    text = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
    text = text.replace(/\/\/.*$/gm, ' ');

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
        // Pula espaços e vírgulas
        while (i < len && /[\s,;]/.test(str[i])) i++;
        if (i >= len) break;

        // Extrai a chave
        let key = '';
        let keyQuote = '';
        if (str[i] === '"' || str[i] === "'") {
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
          while (i < len && /[a-zA-Z0-9_$]/.test(str[i])) i++;
          key = str.substring(start, i);
        }

        key = key.trim();
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
          const valStart = i;
          while (i < len && str[i] !== ',' && str[i] !== '}' && str[i] !== '\n') {
            val += str[i];
            i++;
          }
          val = val.trim();
        }

        const fullPath = prefix ? `${prefix}.${key}` : key;
        const normalizedVal = val.trim();
        const valueType = this.classifyValueType(normalizedVal, quote);

        if (fullPath.toLowerCase() === 'event') {
          eventRaw = normalizedVal;
        } else {
          if (!prefix) {
            topLevelGroups.add(key);
          }
        }

        params.push({
          name: key,
          path: fullPath,
          raw_value: quote ? `${quote}${val}${quote}` : val,
          normalized_value: normalizedVal,
          value_type: valueType
        });
      }
    };

    parseNested(content, '');

    // Fallback: se regex padrão falhou por sintaxe muito incomum, extrai pares por regex
    if (params.length === 0) {
      const lineRegex = /['"]?([a-zA-Z0-9_$.]+)['"]?\s*:\s*(['"`]?)([\s\S]*?)\2(?=[,\n\r}]|$)/g;
      let m;
      while ((m = lineRegex.exec(content)) !== null) {
        const key = m[1].trim();
        const quote = m[2] || '';
        const rawVal = m[3] ? m[3].trim() : '';
        const valueType = this.classifyValueType(rawVal, quote);
        
        if (key.toLowerCase() === 'event') {
          eventRaw = rawVal;
        } else {
          const rootKey = key.split('.')[0];
          topLevelGroups.add(rootKey);
        }

        params.push({
          name: key.split('.').pop() || key,
          path: key,
          raw_value: quote ? `${quote}${rawVal}${quote}` : rawVal,
          normalized_value: rawVal,
          value_type: valueType
        });
      }
    }

    return {
      eventRaw,
      params,
      topLevelGroups: Array.from(topLevelGroups)
    };
  }

  /**
   * Analisa um snippet completo e extrai seu modelo canônico
   */
  parseSnippet(rawCode, mapId = '', screenId = '', snippetIndex = 0) {
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

    return {
      snippet_id: snippetId,
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
      parameters: allParams
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
