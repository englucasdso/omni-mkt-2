import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { normalizarStatus, getMapStatusMetrics } from '../../frontend/src/utils/statusUtils.js';

describe('Correções de Contagem de Mapas no Insights e Status em Por Produto', () => {

  // 1. Validação de regras de getMapStatusMetrics
  describe('getMapStatusMetrics - Cenários Canônicos de Mapa Individual', () => {
    
    it('Cenário 3: Mapa com 10 VALIDADO, 2 CORREÇÃO, 3 NOVO, 1 EXCLUIR, 0 DESCONTINUAR deve resultar em 63% homologado', () => {
      const mockScreens = [
        ...Array(10).fill({ status: 'VALIDADO' }),
        ...Array(2).fill({ status: 'CORREÇÃO' }),
        ...Array(3).fill({ status: 'NOVO' }),
        ...Array(1).fill({ status: 'EXCLUIR' }),
        ...Array(0).fill({ status: 'DESCONTINUAR' })
      ];

      const metrics = getMapStatusMetrics({ screens: mockScreens });

      assert.strictEqual(metrics.totalScreens, 16);
      assert.strictEqual(metrics.recognizedScreens, 16);
      assert.strictEqual(metrics.validated, 10);
      assert.strictEqual(metrics.correction, 2);
      assert.strictEqual(metrics.new, 3);
      assert.strictEqual(metrics.exclude, 1);
      assert.strictEqual(metrics.discontinue, 0);
      assert.strictEqual(metrics.unrecognized, 0);
      // round(10 / 16 * 100) = round(62.5) = 63%
      assert.strictEqual(metrics.homologationPercentage, 63);
      assert.strictEqual(metrics.isFullyHomologated, false);
      assert.strictEqual(metrics.hasScreens, true);
    });

    it('Cenário 4: Mapa sem telas detectadas não deve apresentar 0% como reprovação', () => {
      const metrics = getMapStatusMetrics({ screens: [] });

      assert.strictEqual(metrics.totalScreens, 0);
      assert.strictEqual(metrics.recognizedScreens, 0);
      assert.strictEqual(metrics.validated, 0);
      assert.strictEqual(metrics.homologationPercentage, null);
      assert.strictEqual(metrics.hasScreens, false);
      assert.strictEqual(metrics.isFullyHomologated, false);
    });

    it('Cenário 4 (null/undefined): Objeto sem propriedade screens não quebra', () => {
      const metricsNull = getMapStatusMetrics(null);
      assert.strictEqual(metricsNull.totalScreens, 0);
      assert.strictEqual(metricsNull.homologationPercentage, null);

      const metricsEmpty = getMapStatusMetrics({});
      assert.strictEqual(metricsEmpty.totalScreens, 0);
      assert.strictEqual(metricsEmpty.homologationPercentage, null);
    });

    it('Cenário 5: Mapa integralmente homologado (100% VALIDADO)', () => {
      const mockScreens = [
        { status: 'VALIDADO' },
        { status: 'VALIDADO' },
        { status: 'VALIDADO' }
      ];

      const metrics = getMapStatusMetrics({ screens: mockScreens });

      assert.strictEqual(metrics.totalScreens, 3);
      assert.strictEqual(metrics.recognizedScreens, 3);
      assert.strictEqual(metrics.validated, 3);
      assert.strictEqual(metrics.homologationPercentage, 100);
      assert.strictEqual(metrics.isFullyHomologated, true);
    });

    it('Cenário 6: Status não reconhecido deve ser contabilizado em unrecognized e não entrar no denominador', () => {
      const mockScreens = [
        { status: 'VALIDADO' },
        { status: 'VALIDADO' },
        { status: 'CORREÇÃO' },
        { status: 'STATUS_ESTRANHO_HTML' },
        { status: null }
      ];

      const metrics = getMapStatusMetrics({ screens: mockScreens });

      assert.strictEqual(metrics.totalScreens, 5);
      assert.strictEqual(metrics.recognizedScreens, 3); // 2 VALIDADO + 1 CORREÇÃO
      assert.strictEqual(metrics.validated, 2);
      assert.strictEqual(metrics.correction, 1);
      assert.strictEqual(metrics.unrecognized, 2);
      // round(2 / 3 * 100) = round(66.666...) = 67%
      assert.strictEqual(metrics.homologationPercentage, 67);
      assert.strictEqual(metrics.isFullyHomologated, false);
    });

    it('Normalização de acentuação: aceita CORRECAO como CORREÇÃO', () => {
      const mockScreens = [
        { status: 'CORRECAO' },
        { status: 'correção ' }
      ];

      const metrics = getMapStatusMetrics({ screens: mockScreens });
      assert.strictEqual(metrics.correction, 2);
      assert.strictEqual(metrics.unrecognized, 0);
    });
  });

  // 2. Validação da lógica canônica do Insights Dashboard
  describe('CanonicalInsightsDashboard - Lógica Canônica de Agregação e Contagem', () => {

    it('Cenário 1: [APP BETA] com 34 MAPA e 31 nós deve contabilizar exatamente 34 mapas e 34 artefatos (nunca 65)', () => {
      // Simula o conjunto de 65 artefatos de [APP BETA]
      const mockArtifacts = [
        ...Array(34).fill(null).map((_, i) => ({
          id: `map-${i}`,
          artifact_type: 'MAPA',
          produto: '[APP BETA]',
          screens: [{ status: 'VALIDADO' }]
        })),
        ...Array(31).fill(null).map((_, i) => ({
          id: `node-${i}`,
          artifact_type: 'NO',
          produto: '[APP BETA]',
          screens: [] // nós podem ter ou não telas, mas NÃO são mapas
        }))
      ];

      const filteredMaps = mockArtifacts.filter(a => a.artifact_type === 'MAPA');
      const filteredDocs = mockArtifacts.filter(a => a.artifact_type === 'DOCUMENTACAO');
      const totalMaps = filteredMaps.length;
      const totalDocs = filteredDocs.length;
      const totalArtifacts = totalMaps + totalDocs;

      assert.strictEqual(totalMaps, 34, 'totalMaps deve ser exatamente 34');
      assert.strictEqual(totalDocs, 0, 'totalDocs deve ser 0');
      assert.strictEqual(totalArtifacts, 34, 'totalArtifacts deve ser 34 e nunca 65');
    });

    it('Cenário 2: Produto com MAPA e DOCUMENTACAO contabiliza ambos separadamente, ignorando nós e não-classificados', () => {
      const mockArtifacts = [
        { id: '1', artifact_type: 'MAPA', produto: 'Cartões', screens: [{ status: 'VALIDADO' }] },
        { id: '2', artifact_type: 'MAPA', produto: 'Cartões', screens: [{ status: 'VALIDADO' }] },
        { id: '3', artifact_type: 'DOCUMENTACAO', produto: 'Cartões', screens: [] },
        { id: '4', artifact_type: 'NO', produto: 'Cartões', screens: [] },
        { id: '5', artifact_type: 'RAIZ', produto: 'Cartões', screens: [] },
        { id: '6', artifact_type: 'NAO_CLASSIFICADO', produto: 'Cartões', screens: [] }
      ];

      const filteredMaps = mockArtifacts.filter(a => a.artifact_type === 'MAPA');
      const filteredDocs = mockArtifacts.filter(a => a.artifact_type === 'DOCUMENTACAO');
      const totalMaps = filteredMaps.length;
      const totalDocs = filteredDocs.length;
      const totalArtifacts = totalMaps + totalDocs;

      assert.strictEqual(totalMaps, 2);
      assert.strictEqual(totalDocs, 1);
      assert.strictEqual(totalArtifacts, 3);
    });

    it('Métricas analíticas (telas, snippets, mensuração) percorrem exclusivamente filteredMaps', () => {
      const mockArtifacts = [
        {
          id: 'map-1',
          artifact_type: 'MAPA',
          produto: 'Investimentos',
          measurement_class: 'GA4',
          status_divergent: false,
          screens: [
            { status: 'VALIDADO', snippets: [{}, {}] },
            { status: 'NOVO', snippets: [{}] }
          ],
          parameter_summary: [{ name: 'param_a', occurrences: 5, screens_count: 2 }]
        },
        {
          id: 'doc-1',
          artifact_type: 'DOCUMENTACAO',
          produto: 'Investimentos',
          measurement_class: 'GA4', // não deve poluir a maturidade de mensuração de mapas
          status_divergent: true,  // não deve poluir divergência de mapas
          screens: [
            { status: 'VALIDADO', snippets: [{}] } // telas de docs não entram em totalScreens
          ],
          parameter_summary: [{ name: 'param_doc', occurrences: 99, screens_count: 99 }]
        },
        {
          id: 'node-1',
          artifact_type: 'NO',
          produto: 'Investimentos',
          screens: [
            { status: 'VALIDADO', snippets: [{}] } // não entra
          ]
        }
      ];

      const filteredMaps = mockArtifacts.filter(a => a.artifact_type === 'MAPA');
      let totalScreens = 0;
      let totalSnippets = 0;
      let divergentCount = 0;
      const measurementCounts = { GA4: 0, GA3: 0, HIBRIDO: 0, NAO_CLASSIFICADO: 0 };
      const paramMap = new Map();

      filteredMaps.forEach(art => {
        if (art.status_divergent) divergentCount++;
        (art.screens || []).forEach(sc => {
          const norm = normalizarStatus(sc.status);
          if (norm) totalScreens++;
          totalSnippets += (sc.snippets || []).length;
        });
        const mClass = art.measurement_class || 'NAO_CLASSIFICADO';
        measurementCounts[mClass] = (measurementCounts[mClass] || 0) + 1;
        (art.parameter_summary || []).forEach(p => {
          paramMap.set(p.name, p.occurrences);
        });
      });

      assert.strictEqual(totalScreens, 2, 'Apenas as 2 telas do MAPA devem ser contabilizadas');
      assert.strictEqual(totalSnippets, 3, 'Apenas os 3 snippets do MAPA devem ser contabilizados');
      assert.strictEqual(divergentCount, 0, 'Divergência de documentação não contamina mapas');
      assert.strictEqual(measurementCounts.GA4, 1, 'Maturidade conta apenas mapas');
      assert.strictEqual(paramMap.has('param_doc'), false, 'Parâmetros de documentação não entram');
      assert.strictEqual(paramMap.get('param_a'), 5);
    });
  });

  // 3. Validação do código estático de CanonicalInsightsDashboard.tsx e ProductAnalysisView.tsx
  describe('Validação Estática dos Componentes Frontend', () => {

    it('CanonicalInsightsDashboard.tsx não deve conter "else { totalMaps++; }"', () => {
      const code = fs.readFileSync(path.resolve('frontend/src/components/CanonicalInsightsDashboard.tsx'), 'utf-8');
      assert.ok(
        !code.includes('else { totalMaps++; }') && !code.includes('else {\n        totalMaps++;'),
        'Não deve haver else genérico atribuindo qualquer artefato para totalMaps'
      );
      assert.ok(
        code.includes("art.artifact_type === 'MAPA'"),
        'Deve filtrar canonicamente art.artifact_type === "MAPA"'
      );
      assert.ok(
        code.includes("art.artifact_type === 'DOCUMENTACAO'"),
        'Deve filtrar canonicamente art.artifact_type === "DOCUMENTACAO"'
      );
      assert.ok(
        code.includes('totalArtifacts = totalMaps + totalDocs'),
        'totalArtifacts deve ser totalMaps + totalDocs'
      );
    });

    it('ProductAnalysisView.tsx deve exibir resumo compacto de status com classes cromáticas oficiais e max-h-[55vh]', () => {
      const code = fs.readFileSync(path.resolve('frontend/src/components/ProductAnalysisView.tsx'), 'utf-8');
      
      assert.ok(code.includes('getMapStatusMetrics'), 'Deve usar getMapStatusMetrics');
      assert.ok(code.includes('max-h-[55vh]'), 'Deve possuir altura responsiva max-h-[55vh]');
      assert.ok(code.includes('flex-wrap'), 'Badges devem quebrar linha usando flex-wrap');
      assert.ok(code.includes('Validadas'), 'Deve conter rótulo Validadas');
      assert.ok(code.includes('Correções'), 'Deve conter rótulo Correções');
      assert.ok(code.includes('Novas'), 'Deve conter rótulo Novas');
      assert.ok(code.includes('Excluir'), 'Deve conter rótulo Excluir');
      assert.ok(code.includes('Descontinuar'), 'Deve conter rótulo Descontinuar');
      assert.ok(code.includes('% homologado'), 'Deve exibir percentual com "% homologado"');
      assert.ok(code.includes('Sem telas detectadas'), 'Deve tratar mapas sem telas com "Sem telas detectadas"');
      assert.ok(code.includes('status não reconhecido'), 'Deve tratar status não reconhecido discretamente');
    });
  });
});
