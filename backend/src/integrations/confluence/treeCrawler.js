export class TreeCrawler {
  constructor(transport, maxConcurrency = 4, baseUrl = 'https://confluence.bradesco.com.br:8443') {
    this.transport = transport;
    this.maxConcurrency = maxConcurrency;
    this.baseUrl = baseUrl;
    this.childrenCache = new Map();
  }

  async getDirectChildren(pageId) {
    if (this.childrenCache.has(pageId)) {
      return this.childrenCache.get(pageId);
    }

    const pageSize = 100;
    let start = 0;
    let pages = [];
    let keepGoing = true;

    while (keepGoing) {
      if (this.transport.isCancelled) throw new Error('Operação cancelada pelo usuário.');
      
      const endpoint = `/rest/api/content/${pageId}/child/page?limit=${pageSize}&start=${start}&expand=version,history.lastUpdated,space`;
      const data = await this.transport.fetchApi(endpoint);
      
      const batch = data.results || [];
      pages = pages.concat(batch);
      
      if (batch.length < pageSize) {
        keepGoing = false;
      } else {
        start += pageSize;
      }
    }

    this.childrenCache.set(pageId, pages);
    return pages;
  }

  // Promise pool logic for Node compatibility without external libraries
  async promisePool(items, limit, asyncFn) {
    const results = [];
    let i = 0;
    
    const execWorker = async () => {
      while (i < items.length) {
        if (this.transport.isCancelled) return;
        const index = i++;
        results[index] = await asyncFn(items[index]);
      }
    };

    const workers = [];
    for (let w = 0; w < limit && w < items.length; w++) {
      workers.push(execWorker());
    }

    await Promise.all(workers);
    return results;
  }

  /**
   * Executa a travessia completa da árvore de páginas a partir da raiz (DFS/BFS concorrente).
   * Não impõe limite de profundidade fixa.
   * Toda página descoberta é registrada e pode ter seu conteúdo analisado.
   * Evita duplicidades através do conjunto visitedIds.
   */
  async crawl(rootId, processPageFn, maxRows = null, options = {}) {
    let processCount = 0;
    const visitedIds = new Set();
    const idStr = String(rootId);
    visitedIds.add(idStr);

    // 1. Obter metadados da página raiz
    let rootPageData = null;
    try {
      rootPageData = await this.transport.fetchApi(`/rest/api/content/${idStr}?expand=version,history.lastUpdated,space`);
    } catch (_) {
      // Fallback gracioso caso a chamada individual da raiz falhe ou seja mock
    }

    // O título da raiz é derivado dos dados originais da página (ou opções de fallback)
    const rootTitle = String((rootPageData && rootPageData.title) || options.rootTitle || 'Raiz').trim();
    const rootSpace = (rootPageData && rootPageData.space && (rootPageData.space.name || rootPageData.space.key)) || '';
    const rootVersion = (rootPageData && rootPageData.version && rootPageData.version.number) || 1;
    const rootAuthor = (rootPageData && rootPageData.version && rootPageData.version.by && rootPageData.version.by.displayName) || '';
    const rootUpdated = (rootPageData && rootPageData.history && rootPageData.history.lastUpdated && rootPageData.history.lastUpdated.when) || '';
    const rootUrl = (rootPageData && rootPageData._links && rootPageData._links.webui)
      ? `${this.baseUrl}${rootPageData._links.webui}`
      : `${this.baseUrl}/pages/viewpage.action?pageId=${idStr}`;

    // Buscar filhos diretos da raiz
    const rootChildren = await this.getDirectChildren(idStr);

    const rootNode = {
      id: idStr,
      title: rootTitle,
      url: rootUrl,
      parent_id: null,
      parent_title: null,
      depth: 0,
      ancestor_ids: [],
      ancestor_titles: [],
      full_path: rootTitle,
      has_children: rootChildren.length > 0,
      children_count: rootChildren.length,
      is_leaf: rootChildren.length === 0,
      space: rootSpace,
      version: rootVersion,
      responsavel: rootAuthor,
      ultima_atualizacao: rootUpdated,
      raw_page: rootPageData
    };

    // Processa a raiz se solicitado (padrão true para registrar profundidade 0)
    if (options.includeRoot !== false) {
      if (this.transport.isCancelled) return;
      if (maxRows === null || processCount < maxRows) {
        const trilhaRaiz = [{ id: rootNode.id, titulo: rootNode.title, nivel: 0 }];
        await processPageFn(rootNode, rootNode.is_leaf, 0, null, trilhaRaiz);
        processCount++;
      }
    }

    // 2. Travessia recursiva unbounded para todos os descendentes
    const traverseNode = async (node) => {
      if (this.transport.isCancelled) return;
      if (maxRows !== null && processCount >= maxRows) return;

      // Buscar filhos da página atual
      const children = await this.getDirectChildren(node.id);
      node.children_count = children.length;
      node.has_children = children.length > 0;
      node.is_leaf = children.length === 0;

      // Trilha de ancestrais para retrocompatibilidade
      const trilhaAtual = node.ancestor_ids.map((ancId, idx) => ({
        id: ancId,
        titulo: node.ancestor_titles[idx],
        nivel: idx
      }));
      trilhaAtual.push({
        id: node.id,
        titulo: node.title,
        nivel: node.depth
      });

      // Processar página atual (mesmo que possua filhos)
      await processPageFn(node, node.is_leaf, node.depth, node.parent_title, trilhaAtual);
      processCount++;

      if (maxRows !== null && processCount >= maxRows) return;
      if (this.transport.isCancelled) return;

      // Se possuir filhos, continuar a descida sem limite fixo de profundidade
      if (children.length > 0) {
        const unvisitedChildren = children.filter(c => !visitedIds.has(String(c.id)));

        const childNodes = unvisitedChildren.map(c => {
          const childId = String(c.id);
          visitedIds.add(childId);
          const childTitle = String(c.title || '').trim();
          const childUrl = (c._links && c._links.webui)
            ? `${this.baseUrl}${c._links.webui}`
            : `${this.baseUrl}/pages/viewpage.action?pageId=${childId}`;
          const childSpace = (c.space && (c.space.name || c.space.key)) || node.space || '';

          return {
            id: childId,
            title: childTitle,
            url: childUrl,
            parent_id: node.id,
            parent_title: node.title,
            depth: node.depth + 1,
            ancestor_ids: [...node.ancestor_ids, node.id],
            ancestor_titles: [...node.ancestor_titles, node.title],
            full_path: `${node.full_path} > ${childTitle}`,
            space: childSpace,
            version: (c.version && c.version.number) || 1,
            responsavel: (c.version && c.version.by && c.version.by.displayName) || '',
            ultima_atualizacao: (c.history && c.history.lastUpdated && c.history.lastUpdated.when) || '',
            raw_page: c
          };
        });

        await this.promisePool(childNodes, this.maxConcurrency, async (childNode) => {
          await traverseNode(childNode);
        });
      }
    };

    // Inicia a navegação nos filhos da raiz (profundidade 1)
    if (rootChildren.length > 0) {
      const initialChildren = rootChildren.filter(c => !visitedIds.has(String(c.id)));
      const level1Nodes = initialChildren.map(c => {
        const childId = String(c.id);
        visitedIds.add(childId);
        const childTitle = String(c.title || '').trim();
        const childUrl = (c._links && c._links.webui)
          ? `${this.baseUrl}${c._links.webui}`
          : `${this.baseUrl}/pages/viewpage.action?pageId=${childId}`;
        const childSpace = (c.space && (c.space.name || c.space.key)) || rootNode.space || '';

        return {
          id: childId,
          title: childTitle,
          url: childUrl,
          parent_id: rootNode.id,
          parent_title: rootNode.title,
          depth: 1,
          ancestor_ids: [rootNode.id],
          ancestor_titles: [rootNode.title],
          full_path: `${rootNode.full_path} > ${childTitle}`,
          space: childSpace,
          version: (c.version && c.version.number) || 1,
          responsavel: (c.version && c.version.by && c.version.by.displayName) || '',
          ultima_atualizacao: (c.history && c.history.lastUpdated && c.history.lastUpdated.when) || '',
          raw_page: c
        };
      });

      await this.promisePool(level1Nodes, this.maxConcurrency, async (level1Node) => {
        await traverseNode(level1Node);
      });
    }
  }
}
