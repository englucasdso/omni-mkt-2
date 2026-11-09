import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { ConfluenceOrchestrator } from '../src/integrations/confluence/confluenceOrchestrator.js';
import { runCollection, getSyncStatus } from '../src/integrations/confluenceClient.js';
import { getSyncSessionStatus } from '../src/integrations/confluence/confluenceSession.js';

describe('Sincronização Completa Confluence (Modo Full / forceRefresh)', () => {

  const sampleHtmlInitial = `
    <div id="main-content">
      <table class="confluenceTable">
        <tr><th>Produto / Serviço</th><td>Créditos</td></tr>
        <tr><th>Propriedade GA4/Stream ID</th><td>G-111111</td></tr>
        <tr><th>GTM ID</th><td>GTM-AAAA111</td></tr>
      </table>
      <table class="confluenceTable">
        <tr><th>Status</th><td><span class="status-macro" data-macro-name="status">NOVO</span></td></tr>
        <tr><th>Tela</th><td>Tela Inicial</td></tr>
        <tr><th>Instrução</th><td>Exibição inicial</td></tr>
        <tr>
          <th>Código de Disparo</th>
          <td>
            <pre>dataLayer.push({ event: 'screen_view', screen_name: 'inicio_credito', step: '1' });</pre>
          </td>
        </tr>
      </table>
    </div>
  `;

  const sampleHtmlUpdated = `
    <div id="main-content">
      <table class="confluenceTable">
        <tr><th>Produto / Serviço</th><td>Créditos</td></tr>
        <tr><th>Propriedade GA4/Stream ID</th><td>G-111111</td></tr>
        <tr><th>GTM ID</th><td>GTM-AAAA111</td></tr>
      </table>
      <table class="confluenceTable">
        <tr><th>Status</th><td><span class="status-macro" data-macro-name="status">CORREÇÃO</span></td></tr>
        <tr><th>Tela</th><td>Tela Inicial Modificada</td></tr>
        <tr><th>Instrução</th><td>Exibição revisada</td></tr>
        <tr>
          <th>Código de Disparo</th>
          <td>
            <pre>dataLayer.push({ event: 'screen_view_updated', screen_name: 'inicio_credito_v2', custom_segment: 'varejo' });</pre>
          </td>
        </tr>
      </table>
    </div>
  `;

  const buildTree = () => ({
    'root-1': {
      title: 'Raiz Mapas',
      children: [
        { id: 'prod-1', title: 'Créditos' }
      ]
    },
    'prod-1': {
      title: 'Créditos',
      children: [
        { id: 'sub-1', title: 'Parcelado' }
      ]
    },
    'sub-1': {
      title: 'Parcelado',
      children: [
        { id: 'map-1', title: 'Mapa Contratação' }
      ]
    },
    'map-1': { title: 'Mapa Contratação', children: [] }
  });

  const createMockTransport = (treeData, htmlByPageId = {}, callsTracker = { readPages: [] }) => {
    return {
      isCancelled: false,
      cancel() {
        this.isCancelled = true;
      },
      checkRoot: async () => ({ results: [] }),
      fetchApi: async (endpoint) => {
        const childMatch = endpoint.match(/\/rest\/api\/content\/([^/?]+)\/child\/page/);
        if (childMatch) {
          const pageId = childMatch[1];
          const node = treeData[pageId];
          const results = (node && node.children) || [];
          return {
            results: results.map(c => ({
              id: c.id,
              title: c.title,
              version: { number: 1, by: { displayName: 'Analytics' } },
              history: { lastUpdated: { when: '2026-11-01T10:00:00.000Z' } },
              space: { name: 'Salla', key: 'SALLA' },
              _links: { webui: `/pages/viewpage.action?pageId=${c.id}` }
            }))
          };
        }

        const pageMatch = endpoint.match(/\/rest\/api\/content\/([^/?]+)/);
        if (pageMatch) {
          const pageId = pageMatch[1];
          const node = treeData[pageId] || { title: `Página ${pageId}` };
          return {
            id: pageId,
            title: node.title,
            version: { number: 1, by: { displayName: 'Analytics' } },
            history: { lastUpdated: { when: '2026-11-01T10:00:00.000Z' } },
            space: { name: 'Salla', key: 'SALLA' },
            _links: { webui: `/pages/viewpage.action?pageId=${pageId}` }
          };
        }

        const viewMatch = endpoint.match(/pageId=([^&]+)/);
        if (viewMatch) {
          const pageId = viewMatch[1];
          callsTracker.readPages.push(pageId);
          const handler = htmlByPageId[pageId];
          if (typeof handler === 'function') {
            return await handler(pageId);
          }
          if (typeof handler === 'string') {
            return handler;
          }
          return sampleHtmlInitial;
        }

        return { results: [] };
      }
    };
  };

  // 1. Clique no botão envia mode: "full" e forceRefresh: true
  it('1. App.tsx deve enviar mode: "full" e forceRefresh: true no payload de atualização', () => {
    const appTsxContent = fs.readFileSync(path.resolve('frontend/src/app/App.tsx'), 'utf-8');
    assert.ok(
      appTsxContent.includes('mode: "full"'),
      'App.tsx deve especificar mode: "full" na chamada de update-inventory'
    );
    assert.ok(
      appTsxContent.includes('forceRefresh: true'),
      'App.tsx deve especificar forceRefresh: true na chamada de update-inventory'
    );
  });

  // 2. Rota backend recebe os parâmetros e propaga para o orquestrador
  it('2. search.routes.ts deve receber mode e forceRefresh e propagar para runCollection', () => {
    const routeContent = fs.readFileSync(path.resolve('backend/src/routes/search.routes.ts'), 'utf-8');
    assert.ok(
      routeContent.includes('const { rootId, maxRows, mode, forceRefresh } = req.body'),
      'search.routes.ts deve desestruturar mode e forceRefresh de req.body'
    );
    assert.ok(
      routeContent.includes('mode === "full" || forceRefresh === true'),
      'search.routes.ts deve detectar modo completo através de mode ou forceRefresh'
    );
    assert.ok(
      routeContent.includes('mode: isFull ? "full" : (mode || "incremental")'),
      'search.routes.ts deve repassar opções para runCollection'
    );
  });

  // 3, 4 e 5: Mesmo com versão e timestamp idênticos, a consulta é executada, canReuseCache é falso e reused é 0
  it('3, 4 e 5. Mesmo com versão e timestamp idênticos, consulta o Confluence, canReuseCache é falso e reused termina em 0', async () => {
    const tree = buildTree();
    const calls = { readPages: [] };
    const transport = createMockTransport(tree, { 'map-1': sampleHtmlInitial }, calls);

    // Cache preexistente exatamente com mesma versão e timestamp da árvore do Confluence
    const cachedItem = {
      id: 'map-1',
      titulo: 'Mapa Contratação',
      versao: '1',
      ultima_atualizacao: '2026-11-01T10:00:00.000Z',
      depth: 3,
      artifact_type: 'MAPA',
      measurement_class: 'GA4',
      tipo_mapa: 'GA4',
      content_scan_completed: true,
      content_scan_version: 2,
      screens: [{ screen_id: 'scr-old', status: 'NOVO', instruction: 'Instrução Antiga' }],
      status_summary: { NOVO: 1 },
      homologation_status: 'NAO_HOMOLOGADO',
      homologation_percentage: 0,
      validated_screens: 0,
      total_screens: 1,
      homologado: false,
      parameter_summary: [],
      pattern_summary: [],
      gtm_ids: ['GTM-AAAA111'],
      signature_hash: 'hash-antigo'
    };

    let savedRows = [];
    const mockRepo = {
      getInventory: () => [cachedItem],
      saveSafely: (rows) => {
        savedRows = rows;
      }
    };

    const orchestrator = new ConfluenceOrchestrator({
      transport,
      repository: mockRepo
    });

    // Executa em modo completo
    await orchestrator.run('root-1', null, { mode: 'full', forceRefresh: true });

    // 3. Consulta ao Confluence foi executada para map-1
    assert.ok(
      calls.readPages.includes('map-1'),
      'readMapDetails deve ser executado para map-1 mesmo com versão e timestamp idênticos ao cache'
    );

    // 4. canReuseCache foi ignorado e os dados novos foram processados
    const map1Result = savedRows.find(r => r.id === 'map-1');
    assert.ok(map1Result, 'map-1 deve estar no inventário final');
    assert.strictEqual(map1Result.reused_on_error, undefined);

    // 5. Contador reused termina em 0
    const finalStatus = getSyncSessionStatus();
    assert.strictEqual(
      finalStatus.reused,
      0,
      'Contador reused deve terminar estritamente zerado em sincronização completa'
    );
  });

  // 6, 7, 8 e 9: Alteração de conteúdo, snippet, status e parâmetro com versão idêntica substitui dados antigos
  it('6, 7, 8 e 9. Alteração de conteúdo, snippet, status e parâmetros sem alteração de versão substitui os dados anteriores', async () => {
    const tree = buildTree();
    const calls = { readPages: [] };
    // Confluence agora retorna HTML atualizado, mantendo versão = 1
    const transport = createMockTransport(tree, { 'map-1': sampleHtmlUpdated }, calls);

    const cachedOldItem = {
      id: 'map-1',
      titulo: 'Mapa Contratação',
      versao: '1',
      ultima_atualizacao: '2026-11-01T10:00:00.000Z',
      depth: 3,
      artifact_type: 'MAPA',
      measurement_class: 'GA4',
      tipo_mapa: 'GA4',
      content_scan_completed: true,
      content_scan_version: 2,
      screens: [
        {
          screen_id: 'scr-old',
          status: 'NOVO',
          instruction: 'Exibição inicial',
          snippets: [{ event_raw: 'screen_view', raw_code: 'dataLayer.push({ event: "screen_view" })' }]
        }
      ],
      status_summary: { NOVO: 1 },
      homologation_status: 'NAO_HOMOLOGADO',
      homologation_percentage: 0,
      validated_screens: 0,
      total_screens: 1,
      homologado: false,
      parameter_summary: [{ name: 'step', path: 'step' }]
    };

    let savedRows = [];
    const mockRepo = {
      getInventory: () => [cachedOldItem],
      saveSafely: (rows) => {
        savedRows = rows;
      }
    };

    const orchestrator = new ConfluenceOrchestrator({
      transport,
      repository: mockRepo
    });

    await orchestrator.run('root-1', null, { mode: 'full', forceRefresh: true });

    const updatedMap = savedRows.find(r => r.id === 'map-1');
    assert.ok(updatedMap, 'map-1 deve ter sido salvo no inventário');

    // 6. Alteração de conteúdo capturada
    assert.strictEqual(updatedMap.screens.length, 1);
    assert.strictEqual(updatedMap.screens[0].instruction, 'Exibição revisada');

    // 7. Snippet atualizado substitui o anterior
    const snippets = updatedMap.screens[0].snippets;
    assert.strictEqual(snippets.length, 1);
    assert.strictEqual(snippets[0].event_raw, 'screen_view_updated');
    assert.ok(snippets[0].raw_code.includes('inicio_credito_v2'));

    // 8. Status atualizado (CORREÇÃO) substitui o anterior (NOVO)
    assert.strictEqual(updatedMap.screens[0].status, 'CORREÇÃO');
    assert.strictEqual(updatedMap.status_summary['CORREÇÃO'], 1);
    assert.strictEqual(updatedMap.status_summary['NOVO'] || 0, 0);

    // 9. Parâmetros novos (custom_segment) substituem os anteriores (step)
    const paramNames = updatedMap.parameter_summary.map(p => p.name || p.path);
    assert.ok(
      paramNames.includes('custom_segment'),
      'Novo parâmetro custom_segment deve estar no resumo de parâmetros'
    );
  });

  // 10 e 11: Falha de uma página em sincronização completa não mistura base e preserva inventário anterior
  it('10 e 11. Falha de página em sincronização completa interrompe a operação e mantém inventário anterior íntegro', async () => {
    const tree = buildTree();
    const transport = createMockTransport(tree, {
      'map-1': async () => {
        throw new Error('Timeout de 30000ms simulado');
      }
    });

    const existingInventory = [
      {
        id: 'map-1',
        titulo: 'Mapa Contratação - Preservado',
        versao: '1',
        ultima_atualizacao: '2026-11-01T10:00:00.000Z',
        depth: 3,
        artifact_type: 'MAPA',
        content_scan_completed: true,
        screens: [{ screen_id: 'scr-existing', status: 'VALIDADO' }]
      }
    ];

    let saveCalled = false;
    const mockRepo = {
      getInventory: () => existingInventory,
      saveSafely: () => {
        saveCalled = true;
      }
    };

    const orchestrator = new ConfluenceOrchestrator({
      transport,
      repository: mockRepo
    });

    // Deve rejeitar a operação completa ao invés de salvar base parcial ou mista
    await assert.rejects(
      async () => {
        await orchestrator.run('root-1', null, { mode: 'full', forceRefresh: true });
      },
      /Falha na leitura detalhada|Timeout/i
    );

    // 10 & 11: saveSafely NÃO foi chamado, mantendo base íntegra
    assert.strictEqual(
      saveCalled,
      false,
      'saveSafely não pode ser executado em falha de sincronização completa'
    );
    assert.strictEqual(
      mockRepo.getInventory()[0].titulo,
      'Mapa Contratação - Preservado',
      'O inventário anterior permanece totalmente íntegro'
    );
  });

  // 12. Sincronização completa bem-sucedida substitui o inventário atomicamente
  it('12. Sincronização completa bem-sucedida chama saveSafely com a árvore completa recém-lida', async () => {
    const tree = buildTree();
    const transport = createMockTransport(tree, { 'map-1': sampleHtmlInitial });

    let savedRows = [];
    let saveCount = 0;
    const mockRepo = {
      getInventory: () => [],
      saveSafely: (rows) => {
        savedRows = rows;
        saveCount++;
      }
    };

    const orchestrator = new ConfluenceOrchestrator({
      transport,
      repository: mockRepo
    });

    const result = await orchestrator.run('root-1', null, { mode: 'full', forceRefresh: true });

    assert.strictEqual(saveCount, 1, 'saveSafely deve ser invocado exatamente uma vez de forma atômica');
    assert.strictEqual(savedRows.length, 4, 'Deve salvar todos os nós da árvore');
    assert.strictEqual(result.length, 4);
  });

  // 13. Sessão do Playwright continua sendo reutilizada sem exigir novo login
  it('13. Transport existente é reutilizado sem recriar autenticação', async () => {
    const tree = buildTree();
    let checkRootCalls = 0;
    const mockTransport = {
      ...createMockTransport(tree),
      checkRoot: async () => {
        checkRootCalls++;
        return { results: [] };
      }
    };

    const mockRepo = {
      getInventory: () => [],
      saveSafely: () => {}
    };

    const orchestrator = new ConfluenceOrchestrator({
      transport: mockTransport,
      repository: mockRepo
    });

    await orchestrator.run('root-1', null, { mode: 'full', forceRefresh: true });

    // Sessão/transport já existia: não tentou criar ConfluenceSession nova nem reexecutar checkRoot
    assert.strictEqual(orchestrator.transport, mockTransport);
    assert.strictEqual(checkRootCalls, 0, 'Transport preexistente deve ser reutilizado diretamente sem reautenticação');
  });

  // 14. Mensagem final exibe total consultado e frontend recarrega inventário
  it('14. Mensagem final exibe total de páginas consultadas e status indica completed', async () => {
    const tree = buildTree();
    const transport = createMockTransport(tree, { 'map-1': sampleHtmlInitial });

    const mockRepo = {
      getInventory: () => [],
      saveSafely: () => {}
    };

    const orchestrator = new ConfluenceOrchestrator({
      transport,
      repository: mockRepo
    });

    await orchestrator.run('root-1', null, { mode: 'full', forceRefresh: true });

    const status = getSyncSessionStatus();
    assert.strictEqual(status.phase, 'completed');
    assert.strictEqual(status.percentage, 100);
    assert.strictEqual(status.total, 4);
    assert.strictEqual(status.reused, 0);
    assert.ok(
      status.message.includes('Sincronização completa concluída. 4 páginas consultadas no Confluence.'),
      `Mensagem final deve incluir contagem de páginas consultadas. Obtido: "${status.message}"`
    );

    // Verifica que App.tsx chama fetchInventory() após receber o resultado
    const appTsx = fs.readFileSync(path.resolve('frontend/src/app/App.tsx'), 'utf-8');
    assert.ok(
      appTsx.includes('await fetchInventory()'),
      'App.tsx deve chamar fetchInventory() após a sincronização'
    );
  });
});
