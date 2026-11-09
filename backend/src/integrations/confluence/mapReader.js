import crypto from 'crypto';
import { ParameterParser } from './parameterParser.js';
import {
  decodeHtmlEntities,
  repairMojibakeIfNeeded,
  countMojibakeMarkers,
  extractCodeFromHtmlBlock,
  extractCodeFromSyntaxHighlighterLine,
  detectReplacementCharDiagnostic
} from './unicodeNormalizer.js';

export {
  decodeHtmlEntities,
  repairMojibakeIfNeeded,
  countMojibakeMarkers,
  extractCodeFromHtmlBlock,
  extractCodeFromSyntaxHighlighterLine,
  detectReplacementCharDiagnostic
};

/**
 * Converte o índice interno da tela (0-based) para o número de exibição humano (1-based).
 * Ex: screen_index 0 -> 1 (#1), screen_index 34 -> 35 (#35).
 */
export function toDisplayScreenNumber(screenIndex, fallbackZeroBasedIndex = 0) {
  if (typeof screenIndex === 'number' && Number.isInteger(screenIndex) && screenIndex >= 0) {
    return screenIndex + 1;
  }
  if (screenIndex !== null && screenIndex !== undefined && screenIndex !== '') {
    const parsed = Number(screenIndex);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed + 1;
    }
  }
  const fb =
    typeof fallbackZeroBasedIndex === 'number' &&
    Number.isInteger(fallbackZeroBasedIndex) &&
    fallbackZeroBasedIndex >= 0
      ? fallbackZeroBasedIndex
      : 0;
  return fb + 1;
}

/**
 * Extrai o conteúdo interno balanceado de um elemento HTML a partir do índice da tag de abertura,
 * retornando também o índice final após a tag de fechamento correspondente.
 */
function extractBalancedTagWithEnd(html, tagOpenStart, tagName) {
  const openTagEnd = html.indexOf('>', tagOpenStart);
  if (openTagEnd === -1) return null;
  if (html[openTagEnd - 1] === '/') {
    return { innerHtml: '', endIndex: openTagEnd + 1 };
  }

  const contentStart = openTagEnd + 1;
  const tagRegex = new RegExp(`<(\\/)?${tagName}\\b[^>]*>`, 'gi');
  tagRegex.lastIndex = contentStart;

  let depth = 1;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const fullTag = match[0];
    const isClosing = Boolean(match[1]);
    const isSelfClosing = fullTag.endsWith('/>');

    if (isClosing) {
      depth--;
      if (depth === 0) {
        return {
          innerHtml: html.slice(contentStart, match.index),
          endIndex: match.index + fullTag.length
        };
      }
    } else if (!isSelfClosing) {
      depth++;
    }
  }

  return {
    innerHtml: html.slice(contentStart),
    endIndex: html.length
  };
}

/**
 * Extrai o conteúdo interno balanceado de um elemento HTML a partir do índice da tag de abertura.
 */
function extractBalancedTagInner(html, tagOpenStart, tagName) {
  const res = extractBalancedTagWithEnd(html, tagOpenStart, tagName);
  return res ? res.innerHtml : null;
}

export class MapReader {
  constructor(transport, options = {}) {
    this.transport = transport;
    this.parameterParser = new ParameterParser();
    this.metrics = options.metrics || null;
  }

  /**
   * Limpa tags HTML e decodifica entidades HTML mantendo texto puro e espaços normais.
   * Uso exclusivo para células textuais (instruções, rótulos, observações), nunca para código de snippets.
   */
  limpar(txt) {
    if (!txt) return '';
    const withoutTags = String(txt)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
    return decodeHtmlEntities(withoutTags)
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Normaliza rótulo para comparação semântica
   */
  normalizarRotulo(txt) {
    return this.limpar(txt)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[\s_\-/|()\\.]+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extrai valor de uma célula HTML (respeitando links, painéis ou texto)
   */
  extrairValorDeCelula(cellHtml) {
    if (!cellHtml) return '';

    // Extrai href se contiver link relevante (ex: Figma)
    const hrefMatch = cellHtml.match(/<a[^>]+href=["']([^"']+)["']/i);
    const linkUrl = hrefMatch ? hrefMatch[1].trim() : '';

    // Painel Confluence macro
    const panelMatch = cellHtml.match(/<div[^>]+class=["'][^"']*panelContent[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const textContent = panelMatch ? this.limpar(panelMatch[1]) : this.limpar(cellHtml);

    // Se for link do figma ou http e o texto for genérico, prefere a url
    if (linkUrl && (linkUrl.includes('figma.com') || linkUrl.includes('xd.adobe') || !textContent)) {
      return linkUrl;
    }

    return textContent;
  }

  /**
   * Leitura Semântica do Header (Section 10)
   * Suporta tabelas tradicionais e macros/painéis com múltiplos aliases.
   * Evita falsos positivos com legendas ou caixas de instruções.
   */
  extrairCabecalho(html) {
    const canonicalAliases = {
      produto_servico: [
        'produto servico', 'produto / servico', 'produto/servico', 'produto e servico',
        'produto', 'servico', 'produto servicos'
      ],
      numero_task: [
        'no da task', 'numero da task', 'task', 'n da task', 'task jira', 'jira task',
        'no task', 'numero task'
      ],
      figma_xd: [
        'figma / xd', 'figma xd', 'figma/xd', 'figma', 'adobe xd', 'link figma',
        'prototipo', 'layout figma'
      ],
      ga4_stream_id: [
        'propriedade ga4/stream id', 'propriedade ga4 stream id', 'ga4 stream id',
        'stream id', 'propriedade ga4', 'id stream ga4', 'id ga4', 'stream id ga4',
        'propriedade ga4 stream'
      ],
      firebase: [
        'firebase', 'projeto firebase', 'app firebase', 'id firebase'
      ],
      gtm_id: [
        'gtm id', 'container gtm', 'gtm', 'id gtm', 'codigo gtm'
      ],
      dominio: [
        'dominio', 'dominio exclusivo web', 'dominio web', 'url dominio',
        'dominio exclusivo'
      ],
      status_homologacao: [
        'status da homologacao', 'status do mapa', 'status homologacao',
        'status de homologacao', 'status geral', 'status'
      ]
    };

    const header = {};
    const flatHeader = {};

    // Extrai todas as tabelas candidatas
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;

    let bestHeaderCandidate = null;
    let maxMatchedLabels = 0;

    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const tableContent = tableMatch[1];
      const pairs = [];

      // 1. Linhas TR tradicionais com TD ou TH
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch;
      while ((trMatch = trRegex.exec(tableContent)) !== null) {
        const tdRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
        const cells = [];
        let tdMatch;
        while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
          cells.push(tdMatch[1]);
        }
        if (cells.length >= 2) {
          const rawLabel = this.limpar(cells[0]);
          const rawValue = this.extrairValorDeCelula(cells[1]);
          if (rawLabel) {
            pairs.push({ rawLabel, rawValue, source: 'header_table' });
          }
        }
      }

      // 2. Macro inputs / painéis (ex: input_1, input_2, etc.)
      const panelRegex = /<div[^>]+class=["'][^"']*panel[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
      let panelMatch;
      while ((panelMatch = panelRegex.exec(tableContent)) !== null) {
        const pText = panelMatch[1];
        // Procura por "Rótulo: Valor"
        const colonSplit = pText.split(':');
        if (colonSplit.length >= 2) {
          const rawLabel = this.limpar(colonSplit[0]);
          const rawValue = this.limpar(colonSplit.slice(1).join(':'));
          if (rawLabel && rawValue) {
            pairs.push({ rawLabel, rawValue, source: 'header_panel' });
          }
        }
      }

      // Conta quantos rótulos canônicos distintos casam com esta tabela
      let matchedCount = 0;
      const candidateHeader = {};
      const candidateFlat = {};

      for (const { rawLabel, rawValue, source } of pairs) {
        const norm = this.normalizarRotulo(rawLabel);
        // Não confundir com tabelas de legenda de status (ex: "Status: NOVO")
        if (norm === 'status' && (rawValue.toLowerCase().includes('legenda') || rawValue.includes('verde') || rawValue.includes('azul'))) {
          continue;
        }

        for (const [canonicalKey, aliases] of Object.entries(canonicalAliases)) {
          if (!candidateHeader[canonicalKey]) {
            const isMatch = aliases.some(alias => {
              const normAlias = this.normalizarRotulo(alias);
              return norm === normAlias || norm.startsWith(normAlias) || normAlias.startsWith(norm);
            });

            if (isMatch && rawValue) {
              candidateHeader[canonicalKey] = {
                value: rawValue,
                raw_label: rawLabel,
                source
              };
              candidateFlat[canonicalKey] = rawValue;
              matchedCount++;
              break;
            }
          }
        }
      }

      if (matchedCount > maxMatchedLabels) {
        maxMatchedLabels = matchedCount;
        bestHeaderCandidate = { header: candidateHeader, flat: candidateFlat };
      }
    }

    // Se encontrou tabela com pelo menos 2 rótulos característicos do header
    if (bestHeaderCandidate && maxMatchedLabels >= 2) {
      Object.assign(header, bestHeaderCandidate.header);
      Object.assign(flatHeader, bestHeaderCandidate.flat);
    }

    return { header, flatHeader };
  }

  /**
   * Normalização oficial dos 5 status de tela permitidos:
   * VALIDADO, CORREÇÃO, NOVO, EXCLUIR, DESCONTINUAR.
   * Decodifica entidades HTML e caracteres invisíveis antes da comparação.
   * Não cria novos valores e não infere por cor.
   */
  normalizarStatusTela(rawStatus) {
    if (rawStatus === null || rawStatus === undefined || typeof rawStatus !== 'string') {
      return { status: null, status_raw: '' };
    }
    const decoded = decodeHtmlEntities(rawStatus)
      .replace(/<[^>]+>/g, ' ')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!decoded) {
      return { status: null, status_raw: '' };
    }

    const clean = decoded.toUpperCase();
    const cleanAscii = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (clean === 'VALIDADO') {
      return { status: 'VALIDADO', status_raw: decoded };
    }
    if (clean === 'CORREÇÃO' || clean === 'CORRECAO' || cleanAscii === 'CORRECAO') {
      return { status: 'CORREÇÃO', status_raw: decoded };
    }
    if (clean === 'NOVO') {
      return { status: 'NOVO', status_raw: decoded };
    }
    if (clean === 'EXCLUIR') {
      return { status: 'EXCLUIR', status_raw: decoded };
    }
    if (clean === 'DESCONTINUAR') {
      return { status: 'DESCONTINUAR', status_raw: decoded };
    }

    return { status: null, status_raw: decoded };
  }

  /**
   * Extrai todos os candidatos de status de um fragmento HTML (célula ou macro),
   * preservando prioridade da fonte estrutural e sem inferir por cor.
   */
  extrairCandidatosDeHtml(cellHtml, basePriority = 70, sourcePrefix = 'status_row') {
    if (!cellHtml || typeof cellHtml !== 'string') return [];
    const candidates = [];

    // 1. ac:structured-macro com ac:name="status"
    const acMacroRegex = /<ac:structured-macro[^>]*\bac:name=["']status["'][^>]*>([\s\S]*?)<\/ac:structured-macro>/gi;
    let acMatch;
    while ((acMatch = acMacroRegex.exec(cellHtml)) !== null) {
      const macroBody = acMatch[1] || '';
      const titleParamRegex = /<ac:parameter[^>]*\bac:name=["']title["'][^>]*>([\s\S]*?)<\/ac:parameter>/gi;
      let paramMatch;
      let foundTitleParam = false;
      while ((paramMatch = titleParamRegex.exec(macroBody)) !== null) {
        foundTitleParam = true;
        candidates.push({
          raw: paramMatch[1],
          decoded: this.limpar(paramMatch[1]),
          source: `${sourcePrefix}:ac_structured_macro_title`,
          priority: basePriority + 30
        });
      }
      if (!foundTitleParam) {
        candidates.push({
          raw: macroBody,
          decoded: this.limpar(macroBody),
          source: `${sourcePrefix}:ac_structured_macro`,
          priority: basePriority + 25
        });
      }
    }

    // 2. Elementos com data-macro-name="status", .status-macro ou .aui-lozenge (suportando aninhamento)
    const macroTagOpenRegex = /<([a-zA-Z0-9:_-]+)\b([^>]*?(?:data-macro-name=["']status["']|class=["'][^"']*\b(?:status-macro|aui-lozenge)\b[^"']*)[^>]*)>/gi;
    let tagMatch;
    while ((tagMatch = macroTagOpenRegex.exec(cellHtml)) !== null) {
      const tagName = tagMatch[1];
      const attrs = tagMatch[2] || '';

      // 2a. data-macro-parameters (ex: title=CORREÇÃO)
      const macroParamsMatch = attrs.match(/\bdata-macro-parameters=["']([^"']+)["']/i);
      if (macroParamsMatch && macroParamsMatch[1]) {
        const paramsStr = decodeHtmlEntities(macroParamsMatch[1]);
        const titleParam = paramsStr.match(/(?:^|[|;,\s])title\s*=\s*([^|;,]+)/i);
        if (titleParam && titleParam[1]) {
          candidates.push({
            raw: titleParam[1].trim(),
            decoded: this.limpar(titleParam[1]),
            source: `${sourcePrefix}:macro_parameters_title`,
            priority: basePriority + 26
          });
        }
      }

      // 2b. Atributo title ou data-status na própria macro/lozenge
      const titleAttrMatch = attrs.match(/\b(?:title|data-status|aria-label)=["']([^"']+)["']/i);
      if (titleAttrMatch && titleAttrMatch[1]) {
        candidates.push({
          raw: titleAttrMatch[1],
          decoded: this.limpar(titleAttrMatch[1]),
          source: `${sourcePrefix}:macro_title_attr`,
          priority: basePriority + 22
        });
      }

      // 2c. Conteúdo interno balanceado da macro/lozenge
      const innerHtml = extractBalancedTagInner(cellHtml, tagMatch.index, tagName);
      if (innerHtml !== null) {
        candidates.push({
          raw: innerHtml,
          decoded: this.limpar(innerHtml),
          source: `${sourcePrefix}:macro_text`,
          priority: basePriority + 20
        });
      }
    }

    // 3. Qualquer outro elemento na célula de status com atributo title / data-status / aria-label
    const genericAttrRegex = /<[a-zA-Z0-9:_-]+\b[^>]*?\b(title|data-status|aria-label)=["']([^"']+)["'][^>]*>/gi;
    let attrMatch;
    while ((attrMatch = genericAttrRegex.exec(cellHtml)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const attrVal = attrMatch[2];
      candidates.push({
        raw: attrVal,
        decoded: this.limpar(attrVal),
        source: `${sourcePrefix}:attr_${attrName}`,
        priority: basePriority + 10
      });
    }

    // 4. Texto visível da célula (somente quando permitido pela fonte)
    if (sourcePrefix === 'status_row') {
      const cellText = this.limpar(cellHtml);
      candidates.push({
        raw: cellHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        decoded: cellText,
        source: `${sourcePrefix}:cell_text`,
        priority: basePriority
      });
    }

    return candidates;
  }

  /**
   * Extração de status semântico da célula de uma linha de Status da tela.
   * Mantido para compatibilidade direta e delega para o extrator multi-candidato.
   */
  extrairStatusDaCelula(secondCellHtml) {
    if (!secondCellHtml) return { status: null, status_raw: '' };
    const candidates = this.extrairCandidatosDeHtml(secondCellHtml, 70, 'status_row');
    const resolved = this.resolverCandidatosStatus(candidates);
    return {
      status: resolved.status,
      status_raw: resolved.status_raw
    };
  }

  /**
   * Resolve uma lista de candidatos coletados de um mesmo bloco de tela:
   * - candidato inválido ou vazio nunca apaga um status válido encontrado anteriormente;
   * - maior prioridade estrutural vence;
   * - se houver dois status oficiais diferentes no mesmo bloco, registra STATUS_CONFLICT.
   */
  resolverCandidatosStatus(candidates = []) {
    const evaluated = candidates.map((cand, index) => {
      const norm = this.normalizarStatusTela(cand.raw ?? cand.decoded ?? '');
      return {
        ...cand,
        index,
        status: norm.status,
        status_raw: norm.status_raw
      };
    });

    const validCandidates = evaluated.filter(c => Boolean(c.status));
    if (validCandidates.length === 0) {
      const firstNonEmpty = evaluated.find(c => Boolean(c.status_raw));
      return {
        status: null,
        status_raw: firstNonEmpty ? firstNonEmpty.status_raw : '',
        conflict: null,
        evaluated
      };
    }

    // Ordena por maior prioridade estrutural; em empate, mantém a ordem original no bloco
    const sortedValid = [...validCandidates].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.index - b.index;
    });

    const winner = sortedValid[0];
    const distinctStatuses = Array.from(new Set(sortedValid.map(c => c.status)));

    let conflict = null;
    if (distinctStatuses.length > 1) {
      conflict = {
        type: 'STATUS_CONFLICT',
        chosenStatus: winner.status,
        chosenSource: winner.source,
        conflictingStatuses: distinctStatuses,
        candidates: sortedValid.map(c => ({
          status: c.status,
          source: c.source,
          raw: String(c.status_raw || '').slice(0, 60)
        }))
      };
    }

    return {
      status: winner.status,
      status_raw: winner.status_raw,
      conflict,
      evaluated
    };
  }

  /**
   * Verifica se uma linha ou célula pertence a legenda/explicação/histórico/bot/cabeçalho
   * e não deve ser tratada como status de tela.
   */
  isExcludedStatusRow(labelNorm, rawCellHtml = '') {
    if (!labelNorm) return true;

    const excludedLabelSubstrings = [
      'homologacao',
      'status do mapa',
      'status geral',
      'status documento',
      'status da documentacao',
      'bot',
      'legenda',
      'explicacao',
      'historico',
      'versao',
      'objetivo'
    ];
    if (excludedLabelSubstrings.some(sub => labelNorm.includes(sub))) {
      return true;
    }

    const cellTextLower = this.limpar(rawCellHtml).toLowerCase();
    if (
      cellTextLower.includes('legenda') ||
      (cellTextLower.includes('verde') && (cellTextLower.includes('azul') || cellTextLower.includes('amarelo') || cellTextLower.includes('vermelho')))
    ) {
      return true;
    }

    // Se a mesma célula lista 3 ou mais status oficiais diferentes como texto explicativo de legenda
    const officialMatches = ['VALIDADO', 'CORREÇÃO', 'CORRECAO', 'NOVO', 'EXCLUIR', 'DESCONTINUAR'].filter(
      st => cellTextLower.toUpperCase().includes(st)
    );
    const uniqueOfficialInCell = new Set(
      officialMatches.map(st => (st === 'CORRECAO' ? 'CORREÇÃO' : st))
    );
    if (uniqueOfficialInCell.size >= 3) {
      return true;
    }

    return false;
  }

  /**
   * Classifica o tipo semântico da linha de uma tabela de tela.
   */
  classificarLinhaDeTela(labelNorm, secondCellHtml = '') {
    if (!labelNorm) return null;

    const exactStatusLabels = new Set([
      'status',
      'status da tela',
      'situacao',
      'situacao da tela',
      'estado',
      'estado da tela'
    ]);

    if (exactStatusLabels.has(labelNorm)) {
      if (this.isExcludedStatusRow(labelNorm, secondCellHtml)) {
        return 'excluded_status';
      }
      return 'status';
    }

    if (labelNorm.includes('status') && this.isExcludedStatusRow(labelNorm, secondCellHtml)) {
      return 'excluded_status';
    }

    const screenLabelPatterns = {
      instruction: ['instrucao', 'instrucoes', 'instrucao da tela', 'descricao da acao', 'acao'],
      screenName: ['tela', 'nome da tela', 'screen name', 'screen'],
      triggerCode: ['codigo de disparo', 'codigo de disparo dl', 'codigo dl', 'datalayer', 'codigo disparo'],
      additionalInfo: ['informacoes adicionais', 'informacao adicional', 'observacoes', 'observacao', 'obs'],
      evidence: ['evidencia', 'evidencia da homologacao', 'qa', 'print', 'evidencias']
    };

    for (const [fieldType, patterns] of Object.entries(screenLabelPatterns)) {
      const matched = patterns.some(p => {
        if (labelNorm === p) return true;
        // Evita que "tela" case com qualquer frase arbitrária longa, mas permite "instrucao ..." / "codigo de disparo ..."
        if (p === 'tela' || p === 'screen' || p === 'acao' || p === 'obs' || p === 'qa') {
          return labelNorm === p;
        }
        return labelNorm.startsWith(p);
      });
      if (matched) return fieldType;
    }

    return null;
  }

  /**
   * Extrai identificadores genéricos de container GTM iniciados exatamente por GTM-
   * em letras maiúsculas, com caracteres alfanuméricos válidos após o hífen.
   * Case-sensitive, remove duplicidades.
   */
  extrairGtmIds(textOrHtml) {
    if (!textOrHtml) return [];
    const str = String(textOrHtml);
    const regex = /\bGTM-[A-Z0-9]+\b/g;
    const matches = str.match(regex);
    if (!matches) return [];
    return Array.from(new Set(matches));
  }

  /**
   * Verifica se um bloco de código é uma tag/snippet de instalação do Google Tag Manager.
   * Blocos de instalação não são disparos analíticos e não devem virar telas, eventos ou parâmetros.
   */
  isGtmInstallationSnippet(rawCode) {
    if (!rawCode) return false;
    const code = String(rawCode);
    if (code.includes('googletagmanager.com/gtm.js') || code.includes('googletagmanager.com/ns.html')) {
      return true;
    }
    if (code.includes('gtm.start') || /event\s*:\s*['"]gtm\.js['"]/i.test(code)) {
      return true;
    }
    if (/\(function\s*\(\s*w\s*,\s*d\s*,\s*s\s*,\s*l\s*,\s*i\s*\)/.test(code)) {
      return true;
    }
    return false;
  }

  /**
   * Verifica se um bloco de código extraído é um snippet analítico ou objeto de parâmetros válido
   */
  isValidTrackingCodeBlock(codeText) {
    if (!codeText || codeText.length <= 10) return false;
    if (this.isGtmInstallationSnippet(codeText)) return false;
    if (codeText.includes('dataLayer') || codeText.includes('event')) return true;
    // Também aceita objeto literal / JSON de parâmetros (ex: { "name": "Contratação de crédito", ... })
    if (codeText.includes('{') && codeText.includes('}') && codeText.includes(':')) {
      return true;
    }
    return false;
  }

  /**
   * Extração e reconstrução dedicada de blocos de código (.syntaxhighlighter, <pre>, <code>, .codeContent)
   * preservando quebras de linha, indentação significativa, aspas, placeholders e caracteres Unicode.
   */
  extrairSnippetsDeHtml(containerHtml) {
    if (!containerHtml) return [];
    const snippets = [];

    // 1. Estrutura Confluence SyntaxHighlighter com extração balanceada de <div>
    const shOpenRegex = /<div\b[^>]*class=["'][^"']*syntaxhighlighter[^"']*["'][^>]*>/gi;
    let shMatch;
    while ((shMatch = shOpenRegex.exec(containerHtml)) !== null) {
      const balancedSh = extractBalancedTagWithEnd(containerHtml, shMatch.index, 'div');
      if (!balancedSh) continue;
      shOpenRegex.lastIndex = balancedSh.endIndex;

      const shContent = balancedSh.innerHtml;
      const lineOpenRegex = /<div\b[^>]*class=["'][^"']*\bline\b[^"']*["'][^>]*>/gi;
      const lines = [];
      let lineMatch;
      while ((lineMatch = lineOpenRegex.exec(shContent)) !== null) {
        const balancedLine = extractBalancedTagWithEnd(shContent, lineMatch.index, 'div');
        if (!balancedLine) continue;
        lineOpenRegex.lastIndex = balancedLine.endIndex;
        lines.push(extractCodeFromSyntaxHighlighterLine(balancedLine.innerHtml));
      }

      const codeText =
        lines.length > 0
          ? lines.join('\n').trim()
          : extractCodeFromHtmlBlock(shContent);

      if (this.isValidTrackingCodeBlock(codeText)) {
        snippets.push(codeText);
      }
    }

    // 2. Fallbacks balanceados: <pre>, .codeContent, <code> (evitando duplicar blocos aninhados como <pre><code>...</code></pre>)
    if (snippets.length === 0) {
      const openCodeBlockRegex = /<(pre|code)\b[^>]*>|<(div)\b[^>]*class=["'][^"']*codeContent[^"']*["'][^>]*>/gi;
      let match;
      while ((match = openCodeBlockRegex.exec(containerHtml)) !== null) {
        const tagName = match[1] || match[2];
        const balancedBlock = extractBalancedTagWithEnd(containerHtml, match.index, tagName);
        if (!balancedBlock) continue;
        // Avança o cursor para depois do fechamento do bloco externo para não duplicar tags internas
        openCodeBlockRegex.lastIndex = balancedBlock.endIndex;

        const codeText = extractCodeFromHtmlBlock(balancedBlock.innerHtml);
        if (this.isValidTrackingCodeBlock(codeText)) {
          snippets.push(codeText);
        }
      }
    }

    return snippets;
  }

  /**
   * Segmenta as linhas de uma tabela HTML em um ou mais blocos estruturais de tela,
   * preservando a ordem documental.
   * Uma linha estrutural de Status inicia um novo bloco quando estiver associada a pelo
   * menos outro marcador de tela (Instrução, Tela, Código de Disparo, Informações Adicionais ou Evidência).
   */
  segmentarBlocosDeTelaNaTabela(parsedRows) {
    const markerFieldTypes = new Set([
      'instruction',
      'screenName',
      'triggerCode',
      'additionalInfo',
      'evidence'
    ]);

    // Verifica se a partir de startIdx existe pelo menos um marcador de tela antes do próximo Status com marcadores
    const hasMarkerAssociatedAhead = (startIdx) => {
      for (let j = startIdx + 1; j < parsedRows.length; j++) {
        const ft = parsedRows[j].fieldType;
        if (markerFieldTypes.has(ft)) {
          return true;
        }
      }
      return false;
    };

    const blocks = [];
    let currentBlock = null;

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      const ft = row.fieldType;

      if (ft === 'status') {
        const currentHasStatus = currentBlock ? currentBlock.hasStatus : false;
        const currentHasMarker = currentBlock ? currentBlock.markerCount > 0 : false;

        // Se já estamos em um bloco completo (tem Status + pelo menos um marcador de tela)
        // e este novo Status possui marcadores de tela adiante, iniciamos um novo bloco de tela!
        if (currentBlock && currentHasStatus && currentHasMarker && hasMarkerAssociatedAhead(i)) {
          blocks.push(currentBlock);
          currentBlock = {
            rows: [row],
            hasStatus: true,
            markerCount: 0
          };
        } else {
          if (!currentBlock) {
            currentBlock = {
              rows: [],
              hasStatus: false,
              markerCount: 0
            };
          }
          currentBlock.rows.push(row);
          currentBlock.hasStatus = true;
        }
      } else {
        if (!currentBlock) {
          currentBlock = {
            rows: [],
            hasStatus: false,
            markerCount: 0
          };
        }
        currentBlock.rows.push(row);
        if (markerFieldTypes.has(ft)) {
          currentBlock.markerCount++;
        }
      }
    }

    if (currentBlock && currentBlock.rows.length > 0) {
      blocks.push(currentBlock);
    }

    // Filtra apenas blocos que realmente representam telas:
    // - Possui linha Status + pelo menos 1 marcador de tela (Instrução, Tela, Código, Info Adicional, Evidência), OU
    // - Caso um bloco de tela tenha perdido a linha Status, exige pelo menos 2 marcadores de tela distintos
    return blocks.filter(b => {
      if (b.hasStatus && b.markerCount >= 1) return true;
      const distinctMarkers = new Set(
        b.rows.map(r => r.fieldType).filter(ft => markerFieldTypes.has(ft))
      );
      return distinctMarkers.size >= 2;
    });
  }

  /**
   * Identificação e Extração Estrutural de Telas (Sections 1, 2, 3, 5, 6, 7, 8, 10)
   * Segmenta telas pela estrutura do documento, sem depender de parâmetro literal `index`.
   */
  extrairTelas(html, mapId, produto, fluxo) {
    const screens = [];
    if (!html) return screens;

    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;
    let screenIndex = 0;

    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const tableContent = tableMatch[1];

      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch;
      const parsedRows = [];

      while ((trMatch = trRegex.exec(tableContent)) !== null) {
        const rowContent = trMatch[1];
        const cellRegex = /<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi;
        const cells = [];
        let cMatch;
        while ((cMatch = cellRegex.exec(rowContent)) !== null) {
          cells.push(cMatch[2]);
        }

        if (cells.length > 0) {
          const labelNorm = this.normalizarRotulo(cells[0]);
          const secondCellHtml = cells.length > 1 ? cells.slice(1).join(' ') : '';
          const fieldType = this.classificarLinhaDeTela(labelNorm, secondCellHtml);

          parsedRows.push({
            labelNorm,
            rawLabel: this.limpar(cells[0]),
            fieldType,
            firstCellHtml: cells[0],
            secondCellHtml: cells[1] !== undefined ? cells[1] : '',
            valueCellsHtml: cells.slice(1),
            rowHtml: rowContent,
            cells
          });
        }
      }

      const screenBlocks = this.segmentarBlocosDeTelaNaTabela(parsedRows);

      for (const block of screenBlocks) {
        const blockRows = block.rows;
        const blockHtml = blockRows.map(r => r.rowHtml).join('\n');

        let instruction = '';
        let screenName = '';
        let additionalInfo = '';
        let evidence = '';
        let imageName = '';

        const allStatusCandidates = [];
        const candidateLabels = [];

        for (const row of blockRows) {
          const { fieldType, labelNorm, secondCellHtml, valueCellsHtml } = row;
          if (labelNorm) candidateLabels.push(labelNorm);

          if (fieldType === 'status') {
            for (const cellHtml of valueCellsHtml) {
              const rowCandidates = this.extrairCandidatosDeHtml(cellHtml, 70, 'status_row');
              allStatusCandidates.push(...rowCandidates);
            }
          } else if (fieldType === 'instruction') {
            if (!instruction) instruction = this.limpar(secondCellHtml);
          } else if (fieldType === 'screenName') {
            if (!screenName) screenName = this.limpar(secondCellHtml);
          } else if (fieldType === 'additionalInfo') {
            if (!additionalInfo) additionalInfo = this.limpar(secondCellHtml);
          } else if (fieldType === 'evidence') {
            if (!evidence) evidence = this.limpar(secondCellHtml);
            const imgMatch = secondCellHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
            if (imgMatch) imageName = imgMatch[1];
          }
        }

        // Coleta secundária de macros explícitas de status dentro do próprio bloco (exceto linhas excluídas e blocos de código)
        for (const row of blockRows) {
          if (row.fieldType === 'status' || row.fieldType === 'excluded_status' || row.fieldType === 'triggerCode') {
            continue;
          }
          for (const cellHtml of row.valueCellsHtml) {
            const fallbackMacroCandidates = this.extrairCandidatosDeHtml(cellHtml, 40, 'block_macro');
            allStatusCandidates.push(...fallbackMacroCandidates);
          }
        }

        const resolvedStatus = this.resolverCandidatosStatus(allStatusCandidates);

        // Extrai todos os snippets pertencentes a este bloco estrutural de tela
        const rawSnippets = this.extrairSnippetsDeHtml(blockHtml);

        // Ignorar blocos que sejam exclusivamente instalação de GTM
        if (rawSnippets.length === 0 && this.isGtmInstallationSnippet(blockHtml)) {
          continue;
        }

        const displayScreenNumber = toDisplayScreenNumber(screenIndex);
        let technicalError = null;

        if (!resolvedStatus.status) {
          const candidateValues = allStatusCandidates
            .map(c => String(c.raw || c.decoded || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean);
          const candidateSources = allStatusCandidates
            .map(c => c.source)
            .filter(Boolean);

          const blockSignature = crypto
            .createHash('sha256')
            .update(`${mapId}:${screenIndex}:${candidateLabels.join('|')}`)
            .digest('hex')
            .slice(0, 12);

          technicalError = {
            type: 'STATUS_EXTRACTION_FAILURE',
            mapId: String(mapId),
            screenIndex,
            displayScreenNumber,
            candidateLabels: Array.from(new Set(candidateLabels)).slice(0, 8).map(s => String(s).slice(0, 60)),
            candidateValues: Array.from(new Set(candidateValues)).slice(0, 8).map(s => String(s).slice(0, 80)),
            candidateSources: Array.from(new Set(candidateSources)).slice(0, 8).map(s => String(s).slice(0, 60)),
            blockSignature
          };

          if (this.metrics && typeof this.metrics.recordStatusMissing === 'function') {
            this.metrics.recordStatusMissing(technicalError);
          } else if (process.env.SYNC_DEBUG === '1') {
            console.warn(
              `[STATUS] mapa=${mapId} tela=${displayScreenNumber} candidatos=${JSON.stringify(technicalError.candidateValues)}`
            );
          }
        }

        // ID estável da tela baseado exclusivamente na posição estrutural (screenIndex)
        const screenId = crypto.createHash('sha256')
          .update(`${mapId}-${produto}-${fluxo}-${screenIndex}`)
          .digest('hex')
          .slice(0, 16);

        // Cada snippet dentro da tela recebe seu próprio snippet_index começando em 0
        const unicodeDiagnostics = [];
        const htmlReplacementDiag = detectReplacementCharDiagnostic(blockHtml, {
          mapId,
          screenIndex,
          snippetIndex: null,
          stage: 'confluence_html_response'
        });

        const parsedSnippets = rawSnippets.map((rawCode, snipIdx) => {
          const stage = htmlReplacementDiag ? 'confluence_html_response' : 'snippet_extraction';
          const parsed = this.parameterParser.parseSnippet(rawCode, mapId, screenId, snipIdx, {
            screenIndex,
            stage
          });
          if (parsed.unicode_diagnostics) {
            unicodeDiagnostics.push(parsed.unicode_diagnostics);
            if (this.metrics && typeof this.metrics.recordWarning === 'function') {
              this.metrics.recordWarning('PARSING', parsed.unicode_diagnostics);
            }
          }
          return parsed;
        });

        screens.push({
          map_id: mapId,
          screen_id: screenId,
          screen_index: screenIndex,
          status_raw: resolvedStatus.status_raw || '',
          status: resolvedStatus.status,
          instruction: instruction || screenName || 'Instrução de disparo',
          image_name: imageName || '',
          additional_information: additionalInfo || '',
          evidence: evidence || '',
          snippets: parsedSnippets,
          ...(resolvedStatus.conflict ? { status_conflict: resolvedStatus.conflict } : {}),
          ...(technicalError ? { technical_error: technicalError } : {}),
          ...(unicodeDiagnostics.length > 0 ? { unicode_diagnostics: unicodeDiagnostics } : {})
        });

        screenIndex++;
      }
    }

    // Fallback: se nenhuma tabela estruturada de tela foi identificada,
    // mas a página possui blocos de código dataLayer soltos
    if (screens.length === 0) {
      const standaloneSnippets = this.extrairSnippetsDeHtml(html);
      standaloneSnippets.forEach((rawCode, idx) => {
        const screenId = crypto.createHash('sha256')
          .update(`${mapId}-${produto}-${fluxo}-fallback-${idx}`)
          .digest('hex')
          .slice(0, 16);

        const parsedSnippet = this.parameterParser.parseSnippet(rawCode, mapId, screenId, 0);
        const displayScreenNumber = toDisplayScreenNumber(idx);
        const blockSignature = crypto
          .createHash('sha256')
          .update(`${mapId}:fallback:${idx}`)
          .digest('hex')
          .slice(0, 12);

        const technicalError = {
          type: 'STATUS_EXTRACTION_FAILURE',
          mapId: String(mapId),
          screenIndex: idx,
          displayScreenNumber,
          candidateLabels: [],
          candidateValues: [],
          candidateSources: ['standalone_snippet_fallback'],
          blockSignature,
          reason: 'Bloco de snippet isolado sem tabela de tela ou macro de status'
        };

        screens.push({
          map_id: mapId,
          screen_id: screenId,
          screen_index: idx,
          status_raw: '',
          status: null,
          instruction: `Disparo ${displayScreenNumber}`,
          image_name: '',
          additional_information: '',
          evidence: '',
          snippets: [parsedSnippet],
          technical_error: technicalError
        });
        if (this.metrics && typeof this.metrics.recordStatusMissing === 'function') {
          this.metrics.recordStatusMissing(technicalError);
        }
      });
    }

    return screens;
  }


  /**
   * Gera sumário de parâmetros e padrões do mapa
   */
  gerarSumarios(screens) {
    const parameterSummary = {};
    const patternSummary = {};

    for (const screen of screens) {
      for (const snip of screen.snippets || []) {
        // Padrões
        if (snip.pattern_id) {
          if (!patternSummary[snip.pattern_id]) {
            patternSummary[snip.pattern_id] = {
              pattern_id: snip.pattern_id,
              event: snip.event_raw,
              signature: snip.signature,
              measurement_class: snip.measurement_class,
              count: 0,
              screens: new Set()
            };
          }
          patternSummary[snip.pattern_id].count++;
          patternSummary[snip.pattern_id].screens.add(screen.screen_id);
        }

        // Parâmetros
        for (const p of snip.parameters || []) {
          if (!parameterSummary[p.path]) {
            parameterSummary[p.path] = {
              path: p.path,
              name: p.name,
              occurrences: 0,
              value_types: {},
              distinct_values: new Set(),
              screens: new Set()
            };
          }
          const item = parameterSummary[p.path];
          item.occurrences++;
          item.value_types[p.value_type] = (item.value_types[p.value_type] || 0) + 1;
          if (p.normalized_value) item.distinct_values.add(p.normalized_value);
          item.screens.add(screen.screen_id);
        }
      }
    }

    // Formata sets para arrays
    const formattedParams = Object.values(parameterSummary).map(p => ({
      path: p.path,
      name: p.name,
      occurrences: p.occurrences,
      screens_count: p.screens.size,
      distinct_values_count: p.distinct_values.size,
      distinct_values: Array.from(p.distinct_values).slice(0, 15),
      value_types: p.value_types
    }));

    const formattedPatterns = Object.values(patternSummary).map(pt => ({
      pattern_id: pt.pattern_id,
      event: pt.event,
      signature: pt.signature,
      measurement_class: pt.measurement_class,
      count: pt.count,
      screens_count: pt.screens.size
    }));

    return {
      parameter_summary: formattedParams,
      pattern_summary: formattedPatterns
    };
  }

  /**
   * Extrai metadados estruturais determinísticos para futuras análises de agrupamento e IA
   */
  extrairMetadadosEstruturais(html, telas = [], gtm_ids = [], parameter_summary = []) {
    if (!html) {
      return {
        table_headers: [],
        macros_found: [],
        code_blocks_count: 0,
        snippet_keys: [],
        status_structures: [],
        signals: {
          has_gtm_ids: false,
          has_tracking_screens: false,
          has_tracking_snippets: false,
          has_content: false,
          has_documentation_signals: false,
          is_empty_page: true
        },
        signature_hash: 'empty'
      };
    }

    // 1. Cabeçalhos de tabelas encontradas
    const tableHeaderSets = [];
    const thRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trM;
    while ((trM = thRegex.exec(html)) !== null) {
      const trHtml = trM[1];
      if (/<th[^>]*>/i.test(trHtml)) {
        const cellRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
        const headers = [];
        let cM;
        while ((cM = cellRegex.exec(trHtml)) !== null) {
          const norm = this.normalizarRotulo(cM[1]);
          if (norm) headers.push(norm);
        }
        if (headers.length > 0) {
          tableHeaderSets.push(headers.sort().join('|'));
        }
      }
    }
    const distinctTableHeaders = Array.from(new Set(tableHeaderSets));

    // 2. Macros encontradas
    const macroMatches = [];
    const macroAttrRegex = /data-macro-name=["']([a-zA-Z0-9_-]+)["']/gi;
    let mM;
    while ((mM = macroAttrRegex.exec(html)) !== null) {
      macroMatches.push(mM[1].toLowerCase());
    }
    if (/status-macro|aui-lozenge/i.test(html)) macroMatches.push('status');
    if (/syntaxhighlighter|codeContent/i.test(html)) macroMatches.push('code');
    if (/panelContent/i.test(html)) macroMatches.push('panel');
    const macros_found = Array.from(new Set(macroMatches)).sort();

    // 3. Blocos de código
    const codeBlockMatches = html.match(/class=["'][^"']*(?:syntaxhighlighter|codeContent)[^"']*["']|<pre[^>]*>|<code[^>]*>/gi) || [];
    const code_blocks_count = codeBlockMatches.length;

    // 4. Chaves dos snippets / parâmetros
    const snippet_keys = Array.from(new Set(parameter_summary.map(p => p.path || p.name).filter(Boolean))).sort();

    // 5. Estruturas de status
    const status_structures = [];
    if (/data-macro-name=["']status["']|status-macro/i.test(html)) {
      status_structures.push('macro:status');
    }
    if (/aui-lozenge/i.test(html)) {
      status_structures.push('badge:aui-lozenge');
    }
    if (telas.some(s => s.status_raw && s.status !== 'NAO_IDENTIFICADO')) {
      status_structures.push('table_cell:status');
    }

    // 6. Sinais
    const has_tracking_snippets = telas.some(screen =>
      Array.isArray(screen.snippets) &&
      screen.snippets.some(snippet =>
        Boolean(String(snippet.raw_code || '').trim())
      )
    );

    const has_content = this.verificarConteudoUtil(html);
    const has_documentation_signals = has_content && !has_tracking_snippets;
    const is_empty_page = !has_content && !has_tracking_snippets;

    const signals = {
      has_gtm_ids: gtm_ids.length > 0,
      has_tracking_screens: telas.length > 0,
      has_tracking_snippets,
      has_content,
      has_documentation_signals,
      is_empty_page
    };

    // 7. Assinatura estrutural determinística (hash)
    const sigSeed = [
      macros_found.join(','),
      distinctTableHeaders.join(','),
      code_blocks_count,
      snippet_keys.slice(0, 10).join(','),
      telas.length > 0 ? 'SCREENS' : 'NO_SCREENS',
      gtm_ids.length > 0 ? 'GTM' : 'NO_GTM'
    ].join('##');

    const signature_hash = crypto.createHash('sha256').update(sigSeed).digest('hex').slice(0, 16);

    return {
      table_headers: distinctTableHeaders,
      macros_found,
      code_blocks_count,
      snippet_keys,
      status_structures,
      signals,
      signature_hash
    };
  }

  /**
   * Verifica se o HTML possui conteúdo útil real, desconsiderando navegação, comentários e espaços vazios.
   */
  verificarConteudoUtil(html) {
    if (!html) return false;

    // Isola área principal, se disponível
    let targetHtml = html;
    const mainContentMatch = html.match(/<div[^>]*id=["']main-content["'][^>]*>([\s\S]*?)<\/div>/i);
    if (mainContentMatch) {
      targetHtml = mainContentMatch[1];
    } else {
      const wikiContentMatch = html.match(/<div[^>]*class=["'][^"']*wiki-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      if (wikiContentMatch) {
        targetHtml = wikiContentMatch[1];
      }
    }

    // Remove comentários e seções padrões do Confluence
    let clean = targetHtml
      .replace(/<div[^>]*class=["'][^"']*comments-section[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<div[^>]*id=["']comments["'][^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<div[^>]*class=["'][^"']*page-metadata[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/Escreva um comentário/gi, '')
      .replace(/Write a comment/gi, '')
      .replace(/Seja o primeiro a curtir isto/gi, '')
      .replace(/Sem rótulos/gi, '');

    // Limpa tags HTML deixando só texto
    clean = clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    // Se sobrou mais do que 30 caracteres de texto legível, consideramos útil
    return clean.length > 30;
  }

  /**
   * Lê detalhes completos do mapa a partir do Confluence
   */
  async readMapDetails(pageId, produto, fluxo) {
    const html = await this.transport.fetchApi(`/pages/viewpage.action?pageId=${pageId}`);
    const { header, flatHeader } = this.extrairCabecalho(html);
    
    // Identificação genérica de GTM (Header, Body, scripts)
    const gtmIdsFromHtml = this.extrairGtmIds(html);
    const gtmIdsFromHeader = flatHeader.gtm_id ? this.extrairGtmIds(flatHeader.gtm_id) : [];
    const gtm_ids = Array.from(new Set([...gtmIdsFromHtml, ...gtmIdsFromHeader]));

    if (gtm_ids.length > 0 && !flatHeader.gtm_id) {
      flatHeader.gtm_id = gtm_ids.join(', ');
      header.gtm_id = {
        value: gtm_ids.join(', '),
        raw_label: 'GTM ID',
        source: 'html_detection'
      };
    }

    const telas = this.extrairTelas(html, String(pageId), produto, fluxo);
    const { parameter_summary, pattern_summary } = this.gerarSumarios(telas);
    const structural_metadata = this.extrairMetadadosEstruturais(html, telas, gtm_ids, parameter_summary);

    return {
      cabecalho: flatHeader,
      header,
      telas,
      parameter_summary,
      pattern_summary,
      gtm_ids,
      gtm_id: gtm_ids.join(', '),
      structural_metadata,
      signature_hash: structural_metadata.signature_hash
    };
  }
}

export function extrairGtmIdsHelper(textOrHtml) {
  if (!textOrHtml) return [];
  const regex = /\bGTM-[A-Z0-9]+\b/g;
  const matches = String(textOrHtml).match(regex);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

export function isGtmInstallationSnippetHelper(rawCode) {
  if (!rawCode) return false;
  const code = String(rawCode);
  if (code.includes('googletagmanager.com/gtm.js') || code.includes('googletagmanager.com/ns.html')) {
    return true;
  }
  if (code.includes('gtm.start') || /event\s*:\s*['"]gtm\.js['"]/i.test(code)) {
    return true;
  }
  if (/\(function\s*\(\s*w\s*,\s*d\s*,\s*s\s*,\s*l\s*,\s*i\s*\)/.test(code)) {
    return true;
  }
  return false;
}
