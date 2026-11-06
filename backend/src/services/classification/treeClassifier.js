/**
 * treeClassifier.js
 * Classificação canônica estrutural e taxonômica do Hub de Artefatos.
 * 
 * Regra canônica: A taxonomia segue exclusivamente a posição real da página
 * na árvore iniciada pela página raiz:
 * - Nível humano 1 = depth 0 (Raiz)
 * - Nível humano 2 = depth 1 (Produto)
 * - Nível humano 3 = depth 2 (Subproduto)
 * - Nível humano 4+ = descendant_path
 * 
 * Separação de conceitos: Nível taxonômico é estritamente desacoplado do tipo de artefato (MAPA/DOC/NO).
 */

export function resolveCanonicalTaxonomy(row, rowMap = new Map(), rootPageId = '') {
  const rootStr = String(rootPageId || '');
  const rowIdStr = String(row.id);
  const depth = row.depth !== undefined ? Number(row.depth) : (row.taxonomy_depth || row.nivel || 0);

  const ancestorIds = Array.isArray(row.ancestor_ids) ? row.ancestor_ids.map(String) : [];
  const ancestorTitles = Array.isArray(row.ancestor_titles) ? row.ancestor_titles.map(t => String(t || '').trim()) : [];

  let produto = '';
  let produto_id = null;
  let subproduto = '';
  let subproduto_id = null;
  let descendant_path_ids = [];
  let descendant_path_titles = [];

  const getTitle = (id, fallbackTitle) => {
    if (id && rowMap.has(String(id))) {
      const found = rowMap.get(String(id));
      const t = found?.titulo || found?.title;
      if (t) return String(t).trim();
    }
    return String(fallbackTitle || '').trim();
  };

  // 1. Raiz (depth 0)
  if (depth === 0 || (rootStr && rowIdStr === rootStr) || row.artifact_type === 'RAIZ') {
    return {
      produto: '',
      produto_id: null,
      subproduto: '',
      subproduto_id: null,
      descendant_path_ids: [],
      descendant_path_titles: []
    };
  }

  // 2. Com ancestrais da árvore (novo crawl ou dados com hierarquia preservada)
  if (ancestorIds.length > 0) {
    if (depth === 1) {
      // Nível humano 2 (depth 1) = Produto
      produto_id = rowIdStr;
      produto = String(row.titulo || row.title || '').trim();
    } else if (depth === 2) {
      // Nível humano 3 (depth 2) = Subproduto
      produto_id = ancestorIds[1] || (row.parent_id ? String(row.parent_id) : null);
      produto = getTitle(produto_id, ancestorTitles[1] || row.produto);

      subproduto_id = rowIdStr;
      subproduto = String(row.titulo || row.title || '').trim();
    } else if (depth === 3) {
      // Nível humano 4 (depth 3) = Filho direto de Subproduto
      produto_id = ancestorIds[1] || null;
      produto = getTitle(produto_id, ancestorTitles[1] || row.produto);
      subproduto_id = ancestorIds[2] || (row.parent_id ? String(row.parent_id) : null);
      subproduto = getTitle(subproduto_id, ancestorTitles[2] || row.subproduto);

      if (row.artifact_type === 'NO') {
        descendant_path_ids = [rowIdStr];
        descendant_path_titles = [String(row.titulo || row.title || '').trim()];
      }
    } else {
      // Nível humano 5+ (depth >= 4) = Descendentes profundos
      produto_id = ancestorIds[1] || null;
      produto = getTitle(produto_id, ancestorTitles[1] || row.produto);
      subproduto_id = ancestorIds[2] || null;
      subproduto = getTitle(subproduto_id, ancestorTitles[2] || row.subproduto);

      const dIds = [];
      const dTitles = [];
      for (let i = 3; i < ancestorIds.length; i++) {
        const aId = String(ancestorIds[i]);
        dIds.push(aId);
        dTitles.push(getTitle(aId, ancestorTitles[i]));
      }
      if (row.artifact_type === 'NO') {
        dIds.push(rowIdStr);
        dTitles.push(String(row.titulo || row.title || '').trim());
      }
      descendant_path_ids = dIds;
      descendant_path_titles = dTitles;
    }
  } else {
    // 3. Fallback determinístico para registros legados sem ancestor_ids
    produto = String(row.produto || '').trim();
    produto_id = row.produto_id ? String(row.produto_id) : (produto ? produto : null);
    subproduto = String(row.subproduto || '').trim();
    subproduto_id = row.subproduto_id ? String(row.subproduto_id) : (subproduto ? subproduto : null);
    descendant_path_ids = Array.isArray(row.descendant_path_ids) ? row.descendant_path_ids.map(String) : [];
    descendant_path_titles = Array.isArray(row.descendant_path_titles) ? row.descendant_path_titles.map(String) : [];
  }

  return {
    produto,
    produto_id,
    subproduto,
    subproduto_id,
    descendant_path_ids,
    descendant_path_titles
  };
}

export function isValidSnippet(snippet) {
  if (!snippet || typeof snippet !== 'object') return false;

  const raw = String(snippet.raw_code || '').trim();
  const normalizedEvent = String(snippet.event_normalized || '').trim().toLowerCase();
  const baseKey = String(snippet.base_key || '').trim().toLowerCase();

  // Código de instalação do GTM não transforma uma página em mapa
  const isGtmInstallation =
    /googletagmanager\.com\/gtm\.js/i.test(raw) ||
    /googletagmanager\.com\/ns\.html/i.test(raw) ||
    /['"]?event['"]?\s*:\s*['"]gtm\.js['"]/i.test(raw) ||
    /gtm\.start/i.test(raw);

  if (isGtmInstallation) return false;

  // 1. raw_code não vazio contendo um disparo analítico real
  const hasAnalyticalRawCode =
    /datalayer\s*\.\s*push\s*\(/i.test(raw) ||
    /['"]?event['"]?\s*:/i.test(raw);

  if (hasAnalyticalRawCode) return true;

  // 2. event_normalized válido
  if (normalizedEvent && normalizedEvent !== 'gtmjs') return true;

  // 3. base_key válido
  if (baseKey && baseKey !== 'gtmjs' && baseKey !== 'noevent') return true;

  // 4. parâmetros analíticos estruturados
  if (Array.isArray(snippet.parameters) && snippet.parameters.length > 0) {
    return true;
  }
  if (snippet.parametros && typeof snippet.parametros === 'object' && Object.keys(snippet.parametros).length > 0) {
    return true;
  }

  // 5. detected_paths analíticos
  if (Array.isArray(snippet.detected_paths) && snippet.detected_paths.length > 0) {
    return true;
  }

  // 6. measurement_class igual a GA4, GA3 ou HIBRIDO
  if (['GA4', 'GA3', 'HIBRIDO'].includes(snippet.measurement_class)) {
    return true;
  }

  // 7. pattern_id analítico válido
  if (
    snippet.pattern_id &&
    snippet.pattern_id !== 'noevent' &&
    snippet.pattern_id !== 'gtmjs'
  ) {
    return true;
  }

  return false;
}

export function evaluateStructuredContent(item) {
  const screens = Array.isArray(item.screens) ? item.screens : [];
  let structuredScreensCount = 0;
  let validSnippetsCount = 0;

  for (const screen of screens) {
    if (!screen || typeof screen !== 'object') continue;
    const snippets = Array.isArray(screen.snippets) ? screen.snippets : [];
    let screenSnippets = 0;
    for (const snip of snippets) {
      if (isValidSnippet(snip)) {
        validSnippetsCount++;
        screenSnippets++;
      }
    }
    if (screenSnippets > 0) {
      structuredScreensCount++;
    }
  }

  return {
    screensCount: structuredScreensCount,
    snippetsCount: validSnippetsCount,
    hasStructuredContent: structuredScreensCount >= 1 && validSnippetsCount >= 1
  };
}

export function getTreeDepth(row) {
  if (row.depth !== undefined && row.depth !== null) {
    return Number(row.depth);
  }
  if (row.taxonomy_depth !== undefined && row.taxonomy_depth !== null) {
    return Number(row.taxonomy_depth);
  }
  if (Array.isArray(row.ancestor_ids) && row.ancestor_ids.length > 0) {
    return row.ancestor_ids.length;
  }
  if (row.nivel !== undefined && row.nivel !== null) {
    return Number(row.nivel) - 1;
  }
  return 0;
}

export function getTreeLevel(row) {
  return getTreeDepth(row) + 1;
}

export function classifyTree(rows, rootPageId) {
  const rootStr = String(rootPageId || '');

  // 1. Determinar o tipo de artefato para todas as linhas primeiro
  const classifiedRows = rows.map(row => {
    const classified = { ...row };
    const depth = getTreeDepth(classified);
    const rowIdStr = String(classified.id);

    // 1. depth 0: Sempre RAIZ
    if (depth === 0 || (rootStr && rowIdStr === rootStr)) {
      classified.artifact_type = 'RAIZ';
      classified.tipo_mapa = 'Nó';
      classified.measurement_class = 'NAO_CLASSIFICADO';
      classified.homologation_status = null;
      classified.homologation_percentage = null;
      classified.validated_screens = null;
      classified.total_screens = null;
      return classified;
    }

    // 2. depth 1 e depth 2: Sempre NO
    // Produto e subproduto são nós estruturais, mesmo quando não possuem filhos.
    // Não transformar produto ou subproduto em mapa por causa de código, tabela, título ou metadado existente na página.
    if (depth === 1 || depth === 2) {
      classified.artifact_type = 'NO';
      classified.tipo_mapa = 'Nó';
      classified.measurement_class = 'NAO_CLASSIFICADO';
      classified.homologation_status = null;
      classified.homologation_percentage = null;
      classified.validated_screens = null;
      classified.total_screens = null;
      return classified;
    }

    // 3. depth >= 3:
    // Signals
    const hasChildren = classified.has_children === true || classified.children_count > 0 || classified.is_leaf === false;
    let hasDocumentationSignals = false;
    
    if (classified.structural_metadata && classified.structural_metadata.signals) {
      const sigs = classified.structural_metadata.signals;
      hasDocumentationSignals = sigs.has_documentation_signals === true;
    }
    if (classified.signals && classified.signals.has_documentation_signals === true) {
      hasDocumentationSignals = true;
    }
    if (classified.has_documentation_signals === true || classified.hasDocContent === true) {
      hasDocumentationSignals = true;
    }

    const { screensCount, snippetsCount, hasStructuredContent } = evaluateStructuredContent(classified);

    const isIncompleteOrError = classified.content_scan_completed === false || Boolean(classified.content_scan_error);

    // * MAPA: possui pelo menos uma tela estruturada contendo pelo menos um snippet analítico válido;
    // * DOCUMENTACAO: não é mapa, não funciona como agrupador com filhos e possui conteúdo documental reconhecido;
    // * NO: não possui evidência suficiente de mapa e funciona como agrupador estrutural ou página vazia.
    // Uma página com telas e snippets válidos deve ser MAPA mesmo quando has_children === true.
    // A presença de filhos não pode sobrescrever evidência real de mapa.
    if (hasStructuredContent) {
      classified.artifact_type = 'MAPA';
      if (hasChildren) {
        console.log(`[ArtifactClassifier] page=${classified.id} depth=${depth} screens=${screensCount} snippets=${snippetsCount} type=MAPA reason=STRUCTURED_CONTENT (has_children=true)`);
      }
    } else if (isIncompleteOrError) {
      classified.artifact_type = 'NAO_CLASSIFICADO';
    } else if (!hasChildren && hasDocumentationSignals) {
      classified.artifact_type = 'DOCUMENTACAO';
    } else {
      classified.artifact_type = 'NO';
    }

    // Normalization
    if (classified.artifact_type === 'NAO_CLASSIFICADO') {
      classified.tipo_mapa = 'Não classificado';
      classified.measurement_class = 'NAO_CLASSIFICADO';
      classified.homologation_status = null;
      classified.homologation_percentage = null;
      classified.validated_screens = null;
      classified.total_screens = null;
    } else if (classified.artifact_type === 'NO') {
      classified.tipo_mapa = 'Nó';
      classified.measurement_class = 'NAO_CLASSIFICADO';
      classified.homologation_status = null;
      classified.homologation_percentage = null;
      classified.validated_screens = null;
      classified.total_screens = null;
    } else if (classified.artifact_type === 'DOCUMENTACAO') {
      classified.tipo_mapa = 'Doc';
      classified.measurement_class = 'NAO_CLASSIFICADO';
      classified.homologation_status = null;
      classified.homologation_percentage = null;
      classified.validated_screens = null;
      classified.total_screens = null;
    } else if (classified.artifact_type === 'MAPA') {
      const screens = classified.screens || [];
      const total = screens.length;
      const validated = screens.filter((s) => {
         const st = String(s.status || '').toUpperCase().trim();
         return st === 'VALIDADO' || st.includes('VALIDADO');
      }).length;
      
      classified.total_screens = total;
      classified.validated_screens = validated;
      
      if (total === 0) {
        classified.homologation_status = 'NAO_HOMOLOGADO';
        classified.homologation_percentage = 0;
      } else {
        classified.homologation_percentage = Math.round((validated / total) * 100);
        if (validated === total) {
          classified.homologation_status = 'HOMOLOGADO';
        } else if (validated > 0) {
          classified.homologation_status = 'PARCIAL';
        } else {
          classified.homologation_status = 'NAO_HOMOLOGADO';
        }
      }

      if (!classified.measurement_class || classified.measurement_class === 'NAO_CLASSIFICADO') {
        let hasGa4 = false;
        let hasGa3 = false;
        for (const screen of screens) {
          for (const snip of (screen.snippets || [])) {
            if (snip.measurement_class === 'GA4') hasGa4 = true;
            else if (snip.measurement_class === 'GA3') hasGa3 = true;
            else if (snip.measurement_class === 'HIBRIDO') {
              hasGa4 = true;
              hasGa3 = true;
            }
          }
        }
        if (hasGa4 && hasGa3) classified.measurement_class = 'HIBRIDO';
        else if (hasGa4) classified.measurement_class = 'GA4';
        else if (hasGa3) classified.measurement_class = 'GA3';
      }

      if (!classified.tipo_mapa || classified.tipo_mapa === 'Nó' || classified.tipo_mapa === 'Doc') {
        classified.tipo_mapa = (classified.measurement_class && classified.measurement_class !== 'NAO_CLASSIFICADO')
          ? classified.measurement_class
          : 'GA4';
      }
    }

    return classified;
  });

  // 2. Mapeamento por ID para resolução taxonômica estrutural canônica
  const rowMap = new Map(classifiedRows.map(r => [String(r.id), r]));

  // 3. Resolução taxonômica canônica por profundidade real na árvore
  return classifiedRows.map(classified => {
    const tax = resolveCanonicalTaxonomy(classified, rowMap, rootPageId);

    classified.produto = tax.produto;
    classified.produto_id = tax.produto_id;
    classified.subproduto = tax.subproduto;
    classified.subproduto_id = tax.subproduto_id;
    classified.descendant_path_ids = tax.descendant_path_ids;
    classified.descendant_path_titles = tax.descendant_path_titles;

    // Campos de compatibilidade para legados
    classified.categorias = tax.descendant_path_titles;
    classified.categoria_ids = tax.descendant_path_ids;
    classified.subproduto_path = tax.subproduto ? [tax.subproduto, ...tax.descendant_path_titles] : [...tax.descendant_path_titles];
    classified.subproduto_path_ids = tax.subproduto_id ? [tax.subproduto_id, ...tax.descendant_path_ids] : [...tax.descendant_path_ids];

    return classified;
  });
}

