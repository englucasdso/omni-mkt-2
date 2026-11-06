import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TreeCrawler } from '../src/integrations/confluence/treeCrawler.js';
import { MapReader, extrairGtmIdsHelper, isGtmInstallationSnippetHelper } from '../src/integrations/confluence/mapReader.js';
import { MeasurementClassifier } from '../src/services/classification/measurementClassifier.js';
import { ConfluenceOrchestrator } from '../src/integrations/confluence/confluenceOrchestrator.js';

describe('Evolução Estrutural do Confluence: Descoberta e Classificação Completa', () => {

  // Mock de dados de árvore com profundidade 4 (Raiz -> Nível 1 -> Nível 2 -> Nível 3 -> Nível 4)
  const mockTree = {
    'root-1': {
      title: 'Mapas de Métricas - Salla',
      children: [
        { id: 'cartoes-10', title: 'Cartões' },
        { id: 'invest-20', title: 'Investimentos' }
      ]
    },
    'cartoes-10': {
      title: 'Cartões',
      children: [
        { id: 'fatura-100', title: 'Fatura e Limites' }
      ]
    },
    'fatura-100': {
      title: 'Fatura e Limites',
      children: [
        { id: 'map-1001', title: 'Parcelamento de Fatura' } // Mapa sem MT - que também tem filhos!
      ]
    },
    'map-1001': {
      title: 'Parcelamento de Fatura',
      children: [
        { id: 'submap-2001', title: 'Simulação de Parcelas' }
      ]
    },
    'submap-2001': {
      title: 'Simulação de Parcelas',
      children: []
    },
    'invest-20': {
      title: 'Investimentos',
      children: [
        { id: 'map-200', title: 'MT - Resgate CDB' }
      ]
    },
    'map-200': {
      title: 'MT - Resgate CDB',
      children: []
    }
  };

  const createMockTransport = (treeData) => {
    return {
      isCancelled: false,
      fetchApi: async (endpoint) => {
        // Obter filhos diretos: /rest/api/content/:id/child/page?...
        const childMatch = endpoint.match(/\/rest\/api\/content\/([^\/]+)\/child\/page/);
        if (childMatch) {
          const pageId = childMatch[1];
          const node = treeData[pageId];
          const results = (node && node.children) || [];
          return {
            results: results.map(c => ({
              id: c.id,
              title: c.title,
              version: { number: 1, by: { displayName: 'Tester' } },
              history: { lastUpdated: { when: '2026-03-01T10:00:00.000Z' } },
              space: { name: 'Salla', key: 'SALLA' },
              _links: { webui: `/pages/viewpage.action?pageId=${c.id}` }
            }))
          };
        }

        // Obter metadados da página: /rest/api/content/:id?...
        const pageMatch = endpoint.match(/\/rest\/api\/content\/([^\/?]+)/);
        if (pageMatch) {
          const pageId = pageMatch[1];
          const node = treeData[pageId] || { title: 'Página ' + pageId };
          return {
            id: pageId,
            title: node.title,
            version: { number: 1, by: { displayName: 'Tester' } },
            history: { lastUpdated: { when: '2026-03-01T10:00:00.000Z' } },
            space: { name: 'Salla', key: 'SALLA' },
            _links: { webui: `/pages/viewpage.action?pageId=${pageId}` }
          };
        }

        return { results: [] };
      }
    };
  };

  // 1. Leitura além do segundo nível
  it('1. Deve ler além do segundo nível (percorrendo níveis 3, 4 e superiores)', async () => {
    const transport = createMockTransport(mockTree);
    const crawler = new TreeCrawler(transport, 2);
    const visited = [];

    await crawler.crawl('root-1', async (node) => {
      visited.push(node);
    });

    const maxDepth = Math.max(...visited.map(n => n.depth));
    assert.ok(maxDepth >= 4, `Profundidade máxima deve ser pelo menos 4, encontrado: ${maxDepth}`);
    
    const deepPage = visited.find(n => n.id === 'submap-2001');
    assert.ok(deepPage, 'Deve encontrar a página mais profunda (submap-2001)');
    assert.strictEqual(deepPage.depth, 4, 'A página no quarto nível abaixo da raiz deve ter depth 4');
  });

  // 2. Captura de uma página com filhos
  it('2. Deve capturar página que possui filhos sem descartá-la', async () => {
    const transport = createMockTransport(mockTree);
    const crawler = new TreeCrawler(transport, 2);
    const visited = [];

    await crawler.crawl('root-1', async (node) => {
      visited.push(node);
    });

    const pageWithChildren = visited.find(n => n.id === 'map-1001');
    assert.ok(pageWithChildren, 'Página map-1001 deve ser capturada');
    assert.strictEqual(pageWithChildren.has_children, true, 'has_children deve ser true');
    assert.strictEqual(pageWithChildren.children_count, 1, 'children_count deve ser 1');
    assert.strictEqual(pageWithChildren.is_leaf, false, 'is_leaf deve ser false');
  });

  // 3. Captura de mapa sem MT -
  it('3. Deve capturar mapa sem o prefixo MT -', async () => {
    const transport = createMockTransport(mockTree);
    const crawler = new TreeCrawler(transport, 2);
    const visited = [];

    await crawler.crawl('root-1', async (node) => {
      visited.push(node);
    });

    const mapWithoutPrefix = visited.find(n => n.id === 'map-1001');
    assert.ok(mapWithoutPrefix, 'Mapa sem prefixo MT - deve ser capturado normalmente');
    assert.strictEqual(mapWithoutPrefix.title, 'Parcelamento de Fatura');
    assert.ok(!mapWithoutPrefix.title.startsWith('MT -'), 'Título comprovadamente não começa com MT -');
  });

  // 4. Profundidade correta em cada nível
  it('4. Deve registrar a profundidade exata em cada nível', async () => {
    const transport = createMockTransport(mockTree);
    const crawler = new TreeCrawler(transport, 2);
    const visitedMap = new Map();

    await crawler.crawl('root-1', async (node) => {
      visitedMap.set(node.id, node);
    });

    assert.strictEqual(visitedMap.get('root-1').depth, 0, 'Raiz deve ser depth 0');
    assert.strictEqual(visitedMap.get('cartoes-10').depth, 1, 'Filho da raiz deve ser depth 1');
    assert.strictEqual(visitedMap.get('fatura-100').depth, 2, 'Neto da raiz deve ser depth 2');
    assert.strictEqual(visitedMap.get('map-1001').depth, 3, 'Bisneto da raiz deve ser depth 3');
    assert.strictEqual(visitedMap.get('submap-2001').depth, 4, 'Tetraneto da raiz deve ser depth 4');
  });

  // 5. Caminho completo correto
  it('5. Deve construir o full_path correto em toda a trilha hierárquica', async () => {
    const transport = createMockTransport(mockTree);
    const crawler = new TreeCrawler(transport, 2);
    const visitedMap = new Map();

    await crawler.crawl('root-1', async (node) => {
      visitedMap.set(node.id, node);
    });

    const deepPage = visitedMap.get('submap-2001');
    const expectedPath = 'Mapas de Métricas - Salla > Cartões > Fatura e Limites > Parcelamento de Fatura > Simulação de Parcelas';
    assert.strictEqual(deepPage.full_path, expectedPath, 'Caminho completo hierárquico deve ser exato');
    assert.deepStrictEqual(
      deepPage.ancestor_titles,
      ['Mapas de Métricas - Salla', 'Cartões', 'Fatura e Limites', 'Parcelamento de Fatura']
    );
  });

  // 6. Ausência de páginas duplicadas
  it('6. Deve impedir páginas duplicadas mesmo com links cíclicos ou repetidos', async () => {
    // Árvore com referência que poderia gerar ciclo (a aponta para b, b aponta para a)
    const cyclicTree = {
      'root-c': {
        title: 'Raiz Cíclica',
        children: [{ id: 'node-a', title: 'Nó A' }]
      },
      'node-a': {
        title: 'Nó A',
        children: [{ id: 'node-b', title: 'Nó B' }]
      },
      'node-b': {
        title: 'Nó B',
        children: [{ id: 'node-a', title: 'Nó A Duplicado' }] // Ciclo para Nó A
      }
    };

    const transport = createMockTransport(cyclicTree);
    const crawler = new TreeCrawler(transport, 2);
    const visitedIds = [];

    await crawler.crawl('root-c', async (node) => {
      visitedIds.push(node.id);
    });

    const uniqueIds = new Set(visitedIds);
    assert.strictEqual(visitedIds.length, uniqueIds.size, 'Não deve conter páginas duplicadas');
    assert.deepStrictEqual(visitedIds, ['root-c', 'node-a', 'node-b']);
  });

  // 7. Término apenas quando não existirem mais filhos
  it('7. Deve terminar a navegação somente quando não existirem mais páginas filhas', async () => {
    const transport = createMockTransport(mockTree);
    const crawler = new TreeCrawler(transport, 2);
    const visited = [];

    await crawler.crawl('root-1', async (node) => {
      visited.push(node);
    });

    // Total de nós na mockTree: root-1 (1) + cartoes-10 (1) + invest-20 (1) + fatura-100 (1) + map-1001 (1) + submap-2001 (1) + map-200 (1) = 7 nós
    assert.strictEqual(visited.length, 7, 'Deve descobrir todos os 7 nós da árvore sem parar antes');
    
    // Todos os nós folha (submap-2001 e map-200) devem ter is_leaf === true
    const leaf1 = visited.find(n => n.id === 'submap-2001');
    const leaf2 = visited.find(n => n.id === 'map-200');
    assert.strictEqual(leaf1.is_leaf, true);
    assert.strictEqual(leaf2.is_leaf, true);
  });

  // 8. GTM genérico identificado pelo prefixo maiúsculo GTM-
  it('8. Deve identificar GTM genérico pelo prefixo maiúsculo GTM- e ignorar falsos positivos', () => {
    const sampleText = `
      Container principal: GTM-ABC1234
      Outro container: GTM-XYZ9999
      Falsos positivos: gtm-minuscual, gtm solto, GTM sozinho, GTM_com_underline, GTM123 sem hífen.
    `;
    const ids = extrairGtmIdsHelper(sampleText);
    assert.deepStrictEqual(ids, ['GTM-ABC1234', 'GTM-XYZ9999'], 'Deve extrair apenas formatos GTM-[A-Z0-9]+');
  });

  // 9. Instalação do GTM não tratada como código de disparo
  it('9. Não deve tratar snippet de instalação do GTM como tela, evento ou código de disparo', () => {
    const mapReader = new MapReader({ fetchApi: async () => '' });
    
    const gtmInstallSnippet = `
      <!-- Google Tag Manager -->
      <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
      new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
      j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
      'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
      })(window,document,'script','dataLayer','GTM-PROD999');</script>
      <!-- End Google Tag Manager -->
    `;

    assert.strictEqual(isGtmInstallationSnippetHelper(gtmInstallSnippet), true, 'Deve reconhecer código de instalação do GTM');
    
    const extractedSnippets = mapReader.extrairSnippetsDeHtml(`<div>${gtmInstallSnippet}</div>`);
    assert.strictEqual(extractedSnippets.length, 0, 'Snippet de instalação não deve ser extraído como disparo');

    // Tela construída contendo código de instalação não deve considerar esse código como disparo analítico
    const htmlWithInstallTable = `
      <table>
        <tr><th>Instrução</th><td>Instalação do Container</td></tr>
        <tr><th>Código de Disparo</th><td><pre>${gtmInstallSnippet}</pre></td></tr>
      </table>
    `;
    const screens = mapReader.extrairTelas(htmlWithInstallTable, 'map-inst', 'Prod', 'Fluxo');
    assert.strictEqual(screens.length, 0, 'Instalação do GTM isolada não deve gerar telas de disparo');

    // Mas um dataLayer.push real continua sendo reconhecido normalmente
    const realPushHtml = `
      <table>
        <tr><th>Status</th><td>VALIDADO</td></tr>
        <tr><th>Instrução</th><td>Clique no botão Confirmar</td></tr>
        <tr><th>Código de Disparo</th><td><pre>dataLayer.push({ event: 'proposta_enviada', id_proposta: '123' });</pre></td></tr>
      </table>
    `;
    const realScreens = mapReader.extrairTelas(realPushHtml, 'map-real', 'Prod', 'Fluxo');
    assert.strictEqual(realScreens.length, 1, 'Deve reconhecer a tela com dataLayer.push real');
    assert.strictEqual(realScreens[0].snippets.length, 1, 'Deve extrair o snippet real');
    assert.strictEqual(realScreens[0].snippets[0].event_raw, 'proposta_enviada');
  });

  // 10. Conteúdo ambíguo permanecendo não classificado
  it('10. Conteúdo ambíguo deve permanecer como não classificado (NAO_CLASSIFICADO)', () => {
    const classifier = new MeasurementClassifier();

    // Caso 1: Sem telas, sem snippets, conteúdo ambíguo
    const ambiguousResult = classifier.classifyMap([], null, { isAmbiguous: true });
    assert.strictEqual(ambiguousResult.artifact_type, 'NAO_CLASSIFICADO', 'artifact_type deve ser NAO_CLASSIFICADO para ambíguo');
    assert.strictEqual(ambiguousResult.measurement_class, 'NAO_CLASSIFICADO', 'measurement_class deve ser NAO_CLASSIFICADO para ambíguo');
    assert.strictEqual(classifier.classify([], null, { isAmbiguous: true }), 'Não classificado');

    // Caso 2: Mapa com telas mas sem evidência clara de GA4 nem GA3
    const mapWithoutStandardPlatform = [
      {
        status: 'VALIDADO',
        snippets: [
          {
            raw_code: 'customTracker.log("action_taken");',
            measurement_class: 'NAO_CLASSIFICADO'
          }
        ]
      }
    ];
    const unclassifiedMapResult = classifier.classifyMap(mapWithoutStandardPlatform, null);
    assert.strictEqual(unclassifiedMapResult.artifact_type, 'MAPA', 'Possui telas, logo é MAPA');
    assert.strictEqual(unclassifiedMapResult.measurement_class, 'NAO_CLASSIFICADO', 'Sem GA4/GA3, measurement_class permanece NAO_CLASSIFICADO');
    assert.strictEqual(classifier.classify(mapWithoutStandardPlatform), 'Não classificado');
  });

  describe('extrairProdutoSubprodutoDaTrilha - Cenários solicitados', () => {
    it('Cenário 1: mapa diretamente dentro do produto', () => {
      const orch = new ConfluenceOrchestrator(null);
      const res = orch.extrairProdutoSubprodutoDaTrilha(['Raiz', 'Investimentos']);
      assert.strictEqual(res.produto, 'Investimentos');
      assert.strictEqual(res.subproduto, '');
    });

    it('Cenário 2: produto com subproduto', () => {
      const orch = new ConfluenceOrchestrator(null);
      const res = orch.extrairProdutoSubprodutoDaTrilha(['Raiz', 'Cartões', 'Cartões App']);
      assert.strictEqual(res.produto, 'Cartões');
      assert.strictEqual(res.subproduto, 'Cartões App');
    });

    it('Cenário 3: árvore profunda', () => {
      const orch = new ConfluenceOrchestrator(null);
      const res = orch.extrairProdutoSubprodutoDaTrilha(['Raiz', 'Créditos', 'Consignado', 'Contratação', 'Formalização']);
      assert.strictEqual(res.produto, 'Créditos');
      assert.strictEqual(res.subproduto, 'Consignado');
    });

    it('Cenário 4: fallback para cabeçalho somente se estrutura não informar', () => {
      const orch = new ConfluenceOrchestrator(null);
      const res = orch.extrairProdutoSubprodutoDaTrilha(['Raiz'], 'Produto Do Cabecalho');
      assert.strictEqual(res.produto, 'Produto Do Cabecalho');
      assert.strictEqual(res.subproduto, '');
    });

    it('Cenário 5: prioriza estrutura sobre o cabeçalho', () => {
      const orch = new ConfluenceOrchestrator(null);
      const res = orch.extrairProdutoSubprodutoDaTrilha(['Raiz', 'Cartões', 'Cartões App'], 'Outro Produto');
      assert.strictEqual(res.produto, 'Cartões');
      assert.strictEqual(res.subproduto, 'Cartões App');
    });
  });

});
