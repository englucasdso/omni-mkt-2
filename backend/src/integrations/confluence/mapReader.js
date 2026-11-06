import crypto from 'crypto';
import { ParameterParser } from './parameterParser.js';

export class MapReader {
  constructor(transport) {
    this.transport = transport;
    this.parameterParser = new ParameterParser();
  }

  /**
   * Limpa tags HTML mantendo texto puro e espaços normais
   */
  limpar(txt) {
    if (!txt) return '';
    return String(txt)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/\u200B/g, '')
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
   * Normalização dos 5 status reais:
   * Normalização oficial dos 5 status de tela permitidos:
   * VALIDADO, CORREÇÃO, NOVO, EXCLUIR, DESCONTINUAR.
   * Não cria novos valores, não infere por cor.
   */
  normalizarStatusTela(rawStatus) {
    if (!rawStatus || typeof rawStatus !== 'string') {
      return { status: null, status_raw: '' };
    }
    const raw = rawStatus.trim();
    if (!raw) {
      return { status: null, status_raw: '' };
    }

    // Normalização estrita:
    // - remover espaços extras e quebras de linha
    // - converter para maiúsculas
    // - aceitar diferença de acentuação somente para reconhecer CORREÇÃO
    // - não criar novos valores
    // - não inferir status por cor ou classes
    const clean = raw
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();

    if (clean === 'VALIDADO') {
      return { status: 'VALIDADO', status_raw: raw };
    }
    if (clean === 'CORREÇÃO' || clean === 'CORRECAO') {
      return { status: 'CORREÇÃO', status_raw: raw };
    }
    if (clean === 'NOVO') {
      return { status: 'NOVO', status_raw: raw };
    }
    if (clean === 'EXCLUIR') {
      return { status: 'EXCLUIR', status_raw: raw };
    }
    if (clean === 'DESCONTINUAR') {
      return { status: 'DESCONTINUAR', status_raw: raw };
    }

    // Qualquer outro valor é tratado como falha de extração (não reconhecido)
    return { status: null, status_raw: raw };
  }

  /**
   * Extração de status semântico da célula de uma linha de Status da tela
   * Seletor semântico principal: .status-macro[data-macro-name="status"], [data-macro-name="status"]
   * Fallback: texto da própria célula
   */
  extrairStatusDaCelula(secondCellHtml) {
    if (!secondCellHtml) return { status: null, status_raw: '' };

    // Procura macro de status: [data-macro-name="status"], .status-macro
    // Não depende de cor nem de classes cosméticas
    const macroRegex = /<[^>]+(?:data-macro-name=["']status["']|class=["'][^"']*\b(?:status-macro|aui-lozenge)\b[^"']*)[^>]*>([\s\S]*?)<\/[a-z0-9]+>/i;
    const match = secondCellHtml.match(macroRegex);

    let rawVal = '';
    if (match && match[1] !== undefined) {
      rawVal = this.limpar(match[1]).trim();
    }

    // Se o macro não existir, usa o texto da célula como fallback
    if (!rawVal) {
      rawVal = this.limpar(secondCellHtml).trim();
    }

    return this.normalizarStatusTela(rawVal);
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
   * Extração e reconstrução linha a linha de snippets (.syntaxhighlighter, pre, code)
   */
  extrairSnippetsDeHtml(containerHtml) {
    if (!containerHtml) return [];
    const snippets = [];

    // 1. Estrutura Confluence SyntaxHighlighter com .line
    const shRegex = /<div[^>]*class=["'][^"']*syntaxhighlighter[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
    let shMatch;
    while ((shMatch = shRegex.exec(containerHtml)) !== null) {
      const shContent = shMatch[1];
      const lineRegex = /<div[^>]*class=["'][^"']*line[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
      const lines = [];
      let lineMatch;
      while ((lineMatch = lineRegex.exec(shContent)) !== null) {
        const text = this.limpar(lineMatch[1]);
        lines.push(text);
      }
      if (lines.length > 0) {
        const codeText = lines.join('\n').trim();
        // Não classificar blocos de instalação do GTM como snippet de tela ou disparo
        if (this.isGtmInstallationSnippet(codeText)) {
          continue;
        }
        if (codeText.length > 10 && (codeText.includes('dataLayer') || codeText.includes('event'))) {
          snippets.push(codeText);
        }
      }
    }

    // 2. Fallbacks: <pre>, <code>, .codeContent
    if (snippets.length === 0) {
      const codeRegex = /<pre[^>]*>([\s\S]*?)<\/pre>|<code[^>]*>([\s\S]*?)<\/code>|<div[^>]*class=["'][^"']*codeContent[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
      let match;
      while ((match = codeRegex.exec(containerHtml)) !== null) {
        const rawBlock = match[1] || match[2] || match[3] || '';
        // Converte quebras de linha HTML <br> ou <p> antes de limpar tags
        const withNewlines = rawBlock
          .replace(/<br\s*[\/]?>/gi, '\n')
          .replace(/<\/div>/gi, '\n')
          .replace(/<\/p>/gi, '\n');
        const codeText = this.parameterParser.decodeHtml(
          withNewlines.replace(/<[^>]+>/g, '')
        ).trim();

        // Não classificar blocos de instalação do GTM como snippet de tela ou disparo
        if (this.isGtmInstallationSnippet(codeText)) {
          continue;
        }

        if (codeText.length > 10 && (codeText.includes('dataLayer') || codeText.includes('event'))) {
          snippets.push(codeText);
        }
      }
    }

    return snippets;
  }

  /**
   * Identificação de Telas (Section 11, 12, 14, 15)
   * Encontra blocos funcionais e extrai telas com snippets e parâmetros
   */
  extrairTelas(html, mapId, produto, fluxo) {
    const screens = [];
    const screenLabelPatterns = {
      status: ['status', 'situacao', 'estado'],
      instruction: ['instrucao', 'instrucoes', 'descricao da acao', 'acao'],
      screenName: ['tela', 'nome da tela', 'screen name', 'screen'],
      triggerCode: ['codigo de disparo', 'codigo de disparo dl', 'codigo dl', 'datalayer', 'codigo disparo'],
      additionalInfo: ['informacoes adicionais', 'informacao adicional', 'observacoes', 'obs'],
      evidence: ['evidencia', 'evidencia da homologacao', 'qa', 'print', 'evidencias']
    };

    // Identifica blocos de tabelas candidatos a tela
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;
    let screenIndex = 0;

    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const tableContent = tableMatch[1];

      // 1. percorrer seus tr
      // 2. ler os filhos diretos th e td
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
          // 3. normalizar o texto da primeira célula
          const labelNorm = this.normalizarRotulo(cells[0]);
          parsedRows.push({
            labelNorm,
            firstCellHtml: cells[0],
            secondCellHtml: cells[1] !== undefined ? cells[1] : '',
            cells
          });
        }
      }

      // Verifica se a tabela candidata a tela possui a combinação de rótulos característicos de tela
      const hasStatusRow = parsedRows.some(r => screenLabelPatterns.status.some(p => r.labelNorm === p || r.labelNorm.startsWith(p)));
      const hasInstructionRow = parsedRows.some(r => screenLabelPatterns.instruction.some(p => r.labelNorm === p || r.labelNorm.startsWith(p)));
      const hasScreenNameRow = parsedRows.some(r => screenLabelPatterns.screenName.some(p => r.labelNorm === p || r.labelNorm.startsWith(p)));
      const hasTriggerCodeRow = parsedRows.some(r => screenLabelPatterns.triggerCode.some(p => r.labelNorm === p || r.labelNorm.startsWith(p)));
      const hasAdditionalInfoRow = parsedRows.some(r => screenLabelPatterns.additionalInfo.some(p => r.labelNorm === p || r.labelNorm.startsWith(p)));
      const hasEvidenceRow = parsedRows.some(r => screenLabelPatterns.evidence.some(p => r.labelNorm === p || r.labelNorm.startsWith(p)));

      const matchScore = [
        hasStatusRow, 
        hasInstructionRow, 
        hasScreenNameRow, 
        hasTriggerCodeRow, 
        hasAdditionalInfoRow, 
        hasEvidenceRow
      ].filter(Boolean).length;

      // Se contém ao menos 2 indicadores de tela (evita legendas e tabelas arbitrárias)
      if (matchScore >= 2) {
        let statusObj = { status: null, status_raw: '' };
        let instruction = '';
        let screenName = '';
        let additionalInfo = '';
        let evidence = '';
        let imageName = '';

        for (const row of parsedRows) {
          const { labelNorm, secondCellHtml } = row;

          // 4. encontrar a linha cujo rótulo seja Status
          if (screenLabelPatterns.status.some(p => labelNorm === p || labelNorm.startsWith(p))) {
            // 5. procurar na segunda célula: [data-macro-name="status"], .status-macro
            // 6. ler o valor com normalização oficial
            statusObj = this.extrairStatusDaCelula(secondCellHtml);
          } else if (screenLabelPatterns.instruction.some(p => labelNorm === p || labelNorm.startsWith(p))) {
            if (!instruction) instruction = this.limpar(secondCellHtml);
          } else if (screenLabelPatterns.screenName.some(p => labelNorm === p || labelNorm.startsWith(p))) {
            if (!screenName) screenName = this.limpar(secondCellHtml);
          } else if (screenLabelPatterns.additionalInfo.some(p => labelNorm === p || labelNorm.startsWith(p))) {
            if (!additionalInfo) additionalInfo = this.limpar(secondCellHtml);
          } else if (screenLabelPatterns.evidence.some(p => labelNorm === p || labelNorm.startsWith(p))) {
            if (!evidence) evidence = this.limpar(secondCellHtml);
            const imgMatch = secondCellHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
            if (imgMatch) imageName = imgMatch[1];
          }
        }

        // Se não foi identificado pela linha rotulada Status, busca macro de status na tabela
        if (!statusObj.status) {
          const macroInTableRegex = /<[^>]+(?:data-macro-name=["']status["']|class=["'][^"']*\bstatus-macro\b[^"']*)[^>]*>([\s\S]*?)<\/[a-z0-9]+>/i;
          const tableMacroMatch = tableContent.match(macroInTableRegex);
          if (tableMacroMatch && tableMacroMatch[1]) {
            const rawInTable = this.limpar(tableMacroMatch[1]).trim();
            const norm = this.normalizarStatusTela(rawInTable);
            if (norm.status) {
              statusObj = norm;
            }
          }
        }

        // Se a tela realmente não puder ser associada a um status durante a coleta:
        // registrar erro técnico, não inventar status, não publicar "Sem status"
        let technicalError = null;
        if (!statusObj.status) {
          technicalError = {
            type: 'STATUS_EXTRACTION_FAILURE',
            mapId,
            produto,
            screenIndex,
            snippetSnippet: tableContent.replace(/\s+/g, ' ').slice(0, 160)
          };
          console.warn(`[MapReader] Falha técnica de extração de status da tela: mapa=${mapId}, tela=${screenIndex}`);
        }

        // Extrai snippets dentro desta tabela da tela
        const rawSnippets = this.extrairSnippetsDeHtml(tableContent);

        // Se a tabela contém apenas código de instalação do GTM e nenhum snippet analítico real,
        // não classificar o bloco de instalação como tela analítica
        if (rawSnippets.length === 0 && this.isGtmInstallationSnippet(tableContent)) {
          continue;
        }

        // ID estável da tela
        const screenId = crypto.createHash('sha256')
          .update(`${mapId}-${produto}-${fluxo}-${screenIndex}`)
          .digest('hex')
          .slice(0, 16);

        const parsedSnippets = rawSnippets.map((rawCode, snipIdx) =>
          this.parameterParser.parseSnippet(rawCode, mapId, screenId, snipIdx)
        );

        screens.push({
          map_id: mapId,
          screen_id: screenId,
          screen_index: screenIndex,
          status_raw: statusObj.status_raw || '',
          status: statusObj.status,
          instruction: instruction || screenName || 'Instrução de disparo',
          image_name: imageName || '',
          additional_information: additionalInfo || '',
          evidence: evidence || '',
          snippets: parsedSnippets,
          ...(technicalError ? { technical_error: technicalError } : {})
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

        screens.push({
          map_id: mapId,
          screen_id: screenId,
          screen_index: idx,
          status_raw: '',
          status: null,
          instruction: `Disparo ${idx + 1}`,
          image_name: '',
          additional_information: '',
          evidence: '',
          snippets: [parsedSnippet],
          technical_error: {
            type: 'STATUS_EXTRACTION_FAILURE',
            mapId,
            produto,
            screenIndex: idx,
            reason: 'Bloco de snippet isolado sem tabela de tela ou macro de status'
          }
        });
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

    const crypto = require('crypto');
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
