import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { MapReader } from '../src/integrations/confluence/mapReader.js';
import { TreeCrawler } from '../src/integrations/confluence/treeCrawler.js';
import { ConfluenceOrchestrator } from '../src/integrations/confluence/confluenceOrchestrator.js';
import { getSyncSessionStatus, setSyncSessionStatus } from '../src/integrations/confluence/confluenceSession.js';
import { SyncMetricsAggregator, ERROR_CATEGORIES, isTransientError } from '../src/integrations/confluence/syncMetrics.js';

describe('Sincronização do Confluence: Assinatura ESM, Progresso Real e Resiliência', () => {

  const sampleMapHtml = `
    <div id="main-content">
      <table class="confluenceTable">
        <tr><th>Produto / Serviço</th><td>Cartões Bradesco</td></tr>
        <tr><th>Propriedade GA4/Stream ID</th><td>G-123456</td></tr>
        <tr><th>GTM ID</th><td>GTM-ABCD123</td></tr>
      </table>
      <table class="confluenceTable">
        <tr><th>Status</th><td><span class="status-macro" data-macro-name="status">VALIDADO</span></td></tr>
        <tr><th>Tela</th><td>Resumo da Fatura</td></tr>
        <tr><th>Instrução</th><td>Visualização da tela inicial da fatura</td></tr>
        <tr>
          <th>Código de Disparo</th>
          <td>
            <pre>dataLayer.push({ event: 'screen_view', screen_name: 'resumo_fatura', custom_section: 'cartoes' });</pre>
          </td>
        </tr>
      </table>
    </div>
  `;

  const buildDeepMockTree = () => ({
    'root-1': {
      title: 'Raiz Mapas',
      children: [
        { id: 'prod-1', title: 'Cartões' }
      ]
    },
    'prod-1': {
      title: 'Cartões',
      children: [
        { id: 'sub-1', title: 'Fatura' }
      ]
    },
    'sub-1': {
      title: 'Fatura',
      children: [
        { id: 'map-1', title: 'Mapa Fatura 1' },
        { id: 'map-2', title: 'Mapa Fatura 2' },
        { id: 'map-3', title: 'Mapa Fatura 3' }
      ]
    },
    'map-1': { title: 'Mapa Fatura 1', children: [] },
    'map-2': { title: 'Mapa Fatura 2', children: [] },
    'map-3': { title: 'Mapa Fatura 3', children: [] }
  });

  const createTreeTransport = (treeData, htmlByPageId = {}) => {
    const t = {
      isCancelled: false,
      cancel() {
        this.isCancelled = true;
      },
      checkRoot: async () => ({ results: [] }),
      fetchApi: async (endpoint) => {
        if (t.isCancelled) throw new Error('Operação cancelada pelo usuário.');

        const childMatch = endpoint.match(/\/rest\/api\/content\/([^/?]+)\/child\/page/);
        if (childMatch) {
          const pageId = childMatch[1];
          const node = treeData[pageId];
          const results = (node && node.children) || [];
          return {
            results: results.map(c => ({
              id: c.id,
              title: c.title,
              version: { number: 2, by: { displayName: 'Analytics Team' } },
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
            version: { number: 2, by: { displayName: 'Analytics Team' } },
            history: { lastUpdated: { when: '2026-11-01T10:00:00.000Z' } },
            space: { name: 'Salla', key: 'SALLA' },
            _links: { webui: `/pages/viewpage.action?pageId=${pageId}` }
          };
        }

        const viewMatch = endpoint.match(/pageId=([^&]+)/);
        if (viewMatch) {
          const pageId = viewMatch[1];
          const handler = htmlByPageId[pageId];
          if (typeof handler === 'function') {
            return await handler(pageId);
          }
          if (typeof handler === 'string') {
            return handler;
          }
          return sampleMapHtml;
        }

        return { results: [] };
      }
    };
    return t;
  };

  // 1. Geração de signature_hash em ESM sem "require is not defined"
  it('1. Deve gerar signature_hash no ambiente ESM sem erro "require is not defined" e concluir readMapDetails', async () => {
    const transport = {
      fetchApi: async () => sampleMapHtml
    };
    const reader = new MapReader(transport);
    const details = await reader.readMapDetails('map-esm-1', 'Cartões', 'Fatura');

    assert.ok(details, 'Detalhes do mapa devem ser retornados');
    assert.ok(details.signature_hash, 'signature_hash deve ser gerado');
    assert.strictEqual(typeof details.signature_hash, 'string');
    assert.strictEqual(details.signature_hash.length, 16, 'signature_hash SHA-256 truncado deve ter 16 caracteres');
    assert.notStrictEqual(details.signature_hash, 'empty');
    assert.strictEqual(details.telas.length, 1, 'Leitura das telas deve continuar normalmente');
    assert.deepStrictEqual(details.gtm_ids, ['GTM-ABCD123']);
  });

  // 2 & 3. Progresso monotônico e processed nunca maior que total
  it('2 e 3. Deve manter o progresso estritamente monotônico e processed nunca maior que total', () => {
    const metrics = new SyncMetricsAggregator({ batchLogSize: 100 });
    metrics.setTotal(5);

    const history = [];
    for (let i = 0; i < 8; i++) {
      const snap = metrics.recordPageProcessed('succeeded');
      history.push(snap);
      assert.ok(snap.processed <= snap.total, `processed (${snap.processed}) nunca pode ultrapassar total (${snap.total})`);
      assert.ok(snap.percentage <= 99, 'Antes de salvar, o percentual nunca pode chegar a 100%');
    }

    for (let i = 1; i < history.length; i++) {
      assert.ok(
        history[i].percentage >= history[i - 1].percentage,
        `Percentual deve ser monotônico: ${history[i].percentage} >= ${history[i - 1].percentage}`
      );
    }
  });

  // 4. Respeito estrito ao maxRows mesmo com concorrência
  it('4. Deve respeitar estritamente maxRows durante a descoberta e o crawl', async () => {
    const tree = buildDeepMockTree(); // Total 6 páginas na árvore
    const transport = createTreeTransport(tree);
    const crawler = new TreeCrawler(transport, 4);

    const discovered = await crawler.discover('root-1', 4);
    assert.strictEqual(discovered.length, 4, 'Descoberta deve limitar exatamente a maxRows=4');
  });

  // 5. Percentual chega a 100 somente após classificar e salvar
  it('5. Percentual deve permanecer <= 99% durante a leitura e chegar a 100% somente após saveSafely', async () => {
    const tree = buildDeepMockTree();
    const transport = createTreeTransport(tree);
    let percentageDuringSave = null;
    let savedData = null;

    const mockRepo = {
      getInventory: () => [],
      saveSafely: (rows) => {
        // No momento em que saveSafely é invocado, o percentual ainda deve ser <= 99
        percentageDuringSave = getSyncSessionStatus().percentage;
        savedData = rows;
      }
    };

    const orchestrator = new ConfluenceOrchestrator({
      transport,
      repository: mockRepo
    });

    await orchestrator.run('root-1');
    const finalStatus = getSyncSessionStatus();

    assert.ok(savedData && savedData.length === 6, 'Deve salvar todas as 6 páginas da árvore');
    assert.strictEqual(percentageDuringSave, 99, 'Durante o salvamento o percentual deve ser no máximo 99%');
    assert.strictEqual(finalStatus.percentage, 100, 'Após salvar com segurança o percentual deve ser 100%');
    assert.strictEqual(finalStatus.processed, finalStatus.total);
    assert.strictEqual(finalStatus.phase, 'completed');
  });

  // 6. Falhas individuais e avisos de status ausente são agregados sem interromper snippets
  it('6. Deve agregar avisos de status ausente e falhas por categoria sem interromper a extração dos snippets', () => {
    const metrics = new SyncMetricsAggregator({ batchLogSize: 100, debug: false });
    const reader = new MapReader({ fetchApi: async () => '' }, { metrics });

    const htmlMissingStatus = `
      <table>
        <tr><th>Status</th><td><span>STATUS_INEXISTENTE</span></td></tr>
        <tr><th>Instrução</th><td>Clique no botão</td></tr>
        <tr><th>Código de Disparo</th><td><pre>dataLayer.push({ event: 'clique_botao', step: '1' });</pre></td></tr>
      </table>
    `;

    const screens = reader.extrairTelas(htmlMissingStatus, 'map-warn-1', 'Cartões', 'Fatura');
    assert.strictEqual(screens.length, 1);
    assert.strictEqual(screens[0].status, null, 'Não deve inventar status');
    assert.ok(screens[0].technical_error, 'Deve preservar technical_error no objeto da tela');
    assert.strictEqual(screens[0].snippets.length, 1, 'Não deve interromper a extração dos snippets dessa tela');
    assert.strictEqual(screens[0].snippets[0].event_raw, 'clique_botao');

    metrics.recordReadFailure(new Error('Timeout 30000ms exceeded'), { pageId: 'p1', title: 'P1' });
    metrics.recordReadFailure(new ReferenceError('require is not defined'), { pageId: 'p2', title: 'P2' });

    const snap = metrics.getSnapshot();
    assert.strictEqual(snap.countsByCategory[ERROR_CATEGORIES.STATUS_NAO_ENCONTRADO], 1);
    assert.strictEqual(snap.countsByCategory[ERROR_CATEGORIES.LEITURA_DETALHADA], 2);
    assert.strictEqual(snap.countsByCategory[ERROR_CATEGORIES.TIMEOUT], 1);
    assert.strictEqual(snap.countsByCategory[ERROR_CATEGORIES.PARSING], 1);
    assert.strictEqual(isTransientError(new Error('Timeout 30000ms exceeded')), true);
    assert.strictEqual(isTransientError(new ReferenceError('require is not defined')), false);
  });

  // 7 & 8. Preservação de cache válido em falha de leitura e não transformação de mapa com falha em Nó ou Doc
  it('7 e 8. Deve preservar cache válido quando a nova leitura falhar e não transformar falha sem cache em Nó ou Doc', async () => {
    const tree = buildDeepMockTree();
    const transport = createTreeTransport(tree, {
      'map-1': async () => {
        throw new Error('[BrowserTransport] HTTP 502 ao acessar /pages/viewpage.action?pageId=map-1');
      },
      'map-2': async () => {
        throw new Error('[BrowserTransport] HTTP 503 ao acessar /pages/viewpage.action?pageId=map-2');
      },
      'map-3': sampleMapHtml
    });

    const previousValidCachedMap1 = {
      id: 'map-1',
      titulo: 'Mapa Fatura 1',
      versao: '1', // Versão diferente da árvore atual (2) para forçar tentativa de atualização
      ultima_atualizacao: '2026-10-01T10:00:00.000Z',
      depth: 3,
      artifact_type: 'MAPA',
      measurement_class: 'GA4',
      tipo_mapa: 'GA4',
      content_scan_completed: true,
      content_scan_version: 2,
      screens: [
        {
          map_id: 'map-1',
          screen_id: 'scr-cached-1',
          screen_index: 0,
          status: 'VALIDADO',
          status_raw: 'VALIDADO',
          instruction: 'Tela em cache',
          snippets: [
            {
              raw_code: "dataLayer.push({ event: 'cached_event', param_a: '1' });",
              event_raw: 'cached_event',
              event_normalized: 'cached_event',
              measurement_class: 'GA4',
              parameters: [{ path: 'param_a', name: 'param_a' }]
            }
          ]
        }
      ],
      status_summary: { VALIDADO: 1, 'CORREÇÃO': 0, NOVO: 0, EXCLUIR: 0, DESCONTINUAR: 0 },
      homologation_status: 'HOMOLOGADO',
      homologation_percentage: 100,
      validated_screens: 1,
      total_screens: 1,
      homologado: true,
      parameter_summary: [{ path: 'param_a', name: 'param_a', occurrences: 1 }],
      pattern_summary: [],
      gtm_ids: ['GTM-CACHE01'],
      signature_hash: 'cachedhash123456'
    };

    let savedRows = [];
    const mockRepo = {
      getInventory: () => [previousValidCachedMap1],
      saveSafely: (rows) => {
        savedRows = rows;
      }
    };

    const orchestrator = new ConfluenceOrchestrator({
      transport,
      repository: mockRepo
    });

    await orchestrator.run('root-1');

    const map1Result = savedRows.find(r => r.id === 'map-1');
    const map2Result = savedRows.find(r => r.id === 'map-2');
    const map3Result = savedRows.find(r => r.id === 'map-3');

    // map-1 tinha cache válido: deve preservar dados completos e permanecer MAPA
    assert.ok(map1Result, 'map-1 deve estar no resultado');
    assert.strictEqual(map1Result.artifact_type, 'MAPA', 'map-1 com cache válido deve continuar sendo MAPA');
    assert.strictEqual(map1Result.tipo_mapa, 'GA4');
    assert.strictEqual(map1Result.screens.length, 1, 'Deve preservar as telas anteriores do cache');
    assert.strictEqual(map1Result.reused_on_error, true, 'Deve marcar que foi reutilizado por falha de atualização');
    assert.ok(map1Result.content_scan_error, 'Deve registrar o erro de tentativa de atualização');

    // map-2 NÃO tinha cache válido e falhou: deve ficar com content_scan_completed: false e NÃO virar Nó nem Doc
    assert.ok(map2Result, 'map-2 deve estar no resultado');
    assert.strictEqual(map2Result.content_scan_completed, false, 'Sem cache válido, content_scan_completed deve ser false');
    assert.ok(map2Result.content_scan_error, 'Deve conter content_scan_error explícito');
    assert.strictEqual(map2Result.artifact_type, 'NAO_CLASSIFICADO', 'Falha de leitura sem cache não pode virar NO ou DOCUMENTACAO');
    assert.strictEqual(map2Result.tipo_mapa, 'Não classificado', 'tipo_mapa não pode ser Nó nem Doc');

    // map-3 leu com sucesso: deve ser classificado como MAPA
    assert.ok(map3Result);
    assert.strictEqual(map3Result.artifact_type, 'MAPA');
    assert.strictEqual(map3Result.content_scan_completed, true);
  });

  // 9. Cancelamento não sobrescreve o inventário
  it('9. Cancelamento durante a leitura não deve sobrescrever o inventário existente', async () => {
    const tree = buildDeepMockTree();
    let saveCalled = false;
    let orchestratorRef = null;

    const transport = createTreeTransport(tree, {
      'map-1': async () => {
        // Cancela durante a leitura detalhada
        await orchestratorRef.abort();
        return sampleMapHtml;
      }
    });

    const mockRepo = {
      getInventory: () => [{ id: 'existing-1', titulo: 'Item Preservado' }],
      saveSafely: () => {
        saveCalled = true;
      }
    };

    orchestratorRef = new ConfluenceOrchestrator({
      transport,
      repository: mockRepo
    });

    await assert.rejects(
      async () => {
        await orchestratorRef.run('root-1');
      },
      /cancelada/i
    );

    assert.strictEqual(saveCalled, false, 'saveSafely jamais deve ser chamado quando a sincronização é cancelada');
    assert.strictEqual(orchestratorRef.isCollecting, false, 'isCollecting deve voltar para false após cancelamento');
  });

  // 10. Frontend usa o percentual recebido do backend e remove a regra artificial ((job.step + 1) / 5) * 100
  it('10. Frontend (App.tsx) deve utilizar job.percentage real do backend e não conter cálculo artificial por step', () => {
    const appTsxPath = path.resolve('frontend/src/app/App.tsx');
    const content = fs.readFileSync(appTsxPath, 'utf-8');

    assert.ok(
      !content.includes('((job.step + 1) / 5) * 100'),
      'A fórmula artificial ((job.step + 1) / 5) * 100 deve ter sido removida do App.tsx'
    );
    assert.ok(
      content.includes('statusData.percentage') && content.includes('statusData.processed') && content.includes('statusData.total'),
      'O polling de /api/sync-status deve copiar processed, total e percentage para o estado do frontend'
    );
    assert.ok(
      content.includes('de {job.total} páginas') && content.includes('páginas processadas'),
      'O SyncWidget deve exibir a contagem real de páginas processadas'
    );
  });
});
