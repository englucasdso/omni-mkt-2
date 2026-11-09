import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isMap,
  isDocumentation,
  isNode,
  isRoot,
  isUnclassified,
  isStructural,
  isCataloged,
  getMaps,
  getDocuments,
  getCatalogedArtifacts,
  getStructuralArtifacts,
  deduplicateArtifactsById
} from '../../frontend/src/domain/artifacts/artifactSelectors.js';
import {
  getArtifactTypeLabel,
  ARTIFACT_TYPE_CONFIGS
} from '../../frontend/src/domain/artifacts/artifactLabels.js';
import {
  resolveMeasurementClass,
  getMeasurementLabel,
  MEASUREMENT_CONFIGS
} from '../../frontend/src/domain/measurement/index.js';
import {
  calculateScreenStatusMetrics,
  getMapStatusMetrics
} from '../../frontend/src/domain/status/screenStatusMetrics.js';
import {
  reconcileSubproductWithProduct,
  getValidSubproductsForProduct,
  filterArtifactsByGlobalContract,
  DEFAULT_GLOBAL_FILTERS
} from '../../frontend/src/domain/filters/filterContract.js';

describe('Canonical Domain Consistency Test Suite (Omni Marketing)', () => {

  // =========================================================================
  // 1. Matriz Canônica de Tipos de Artefato (Cenário de Teste Obrigatório)
  // =========================================================================
  describe('Matriz Canônica de Tipos de Artefato', () => {
    // Dataset com 1 RAIZ, 3 NO, 34 MAPA, 2 DOCUMENTACAO, 4 NAO_CLASSIFICADO
    const testMatrixDataset = [
      { id: 'raiz-0', artifact_type: 'RAIZ', titulo: 'Raiz Geral' },
      { id: 'no-1', artifact_type: 'NO', titulo: 'Nó Cartões' },
      { id: 'no-2', artifact_type: 'NO', titulo: 'Nó Investimentos' },
      { id: 'no-3', artifact_type: 'NO', titulo: 'Nó Empréstimos' },
      ...Array.from({ length: 34 }, (_, i) => ({
        id: `mapa-${i + 1}`,
        artifact_type: 'MAPA',
        titulo: `Mapa ${i + 1}`,
        measurement_class: i % 2 === 0 ? 'GA4' : 'GA3'
      })),
      { id: 'doc-1', artifact_type: 'DOCUMENTACAO', titulo: 'Guia de Tags' },
      { id: 'doc-2', artifact_type: 'DOCUMENTACAO', titulo: 'Padrão Técnico' },
      { id: 'nc-1', artifact_type: 'NAO_CLASSIFICADO', titulo: 'Página Nova A' },
      { id: 'nc-2', artifact_type: 'NAO_CLASSIFICADO', titulo: 'Página Nova B' },
      { id: 'nc-3', artifact_type: null, titulo: 'Página sem tipo' },
      { id: 'nc-4', titulo: 'Página indefinida' }
    ];

    it('Valida contagens exatas da matriz de 44 artefatos', () => {
      assert.strictEqual(testMatrixDataset.length, 44);

      const mapas = getMaps(testMatrixDataset);
      const docs = getDocuments(testMatrixDataset);
      const catalogados = getCatalogedArtifacts(testMatrixDataset);
      const estruturais = getStructuralArtifacts(testMatrixDataset);
      const raizes = testMatrixDataset.filter(isRoot);
      const nos = testMatrixDataset.filter(isNode);
      const naoClassificados = testMatrixDataset.filter(isUnclassified);

      assert.strictEqual(mapas.length, 34, 'Mapas deve ser exatamente 34');
      assert.strictEqual(docs.length, 2, 'Documentações deve ser exatamente 2');
      assert.strictEqual(catalogados.length, 36, 'Artefatos catalogados deve ser 36 (34 mapas + 2 docs)');
      assert.strictEqual(estruturais.length, 4, 'Artefatos estruturais deve ser 4 (1 raiz + 3 nós)');
      assert.strictEqual(raizes.length, 1, 'Raiz deve ser 1');
      assert.strictEqual(nos.length, 3, 'Nós deve ser 3');
      assert.strictEqual(naoClassificados.length, 4, 'Não classificados deve ser 4');
    });

    it('Rótulos canônicos de tipos de artefatos', () => {
      assert.strictEqual(getArtifactTypeLabel('MAPA'), 'Mapa');
      assert.strictEqual(getArtifactTypeLabel('DOCUMENTACAO'), 'Documentação');
      assert.strictEqual(getArtifactTypeLabel('NO'), 'Nó');
      assert.strictEqual(getArtifactTypeLabel('RAIZ'), 'Raiz');
      assert.strictEqual(getArtifactTypeLabel('NAO_CLASSIFICADO'), 'Não classificado');
      assert.strictEqual(getArtifactTypeLabel(null), 'Não classificado');
      assert.strictEqual(getArtifactTypeLabel(undefined), 'Não classificado');
    });

    it('Deduplicação de artefatos por ID preserva a ordem e remove duplicatas', () => {
      const duplicated = [
        { id: 'mapa-1', titulo: 'Versão 1' },
        { id: 'mapa-2', titulo: 'Mapa 2' },
        { id: 'mapa-1', titulo: 'Versão 2 (duplicada)' },
        { id: 'mapa-3', titulo: 'Mapa 3' }
      ];
      const deduplicated = deduplicateArtifactsById(duplicated);
      assert.strictEqual(deduplicated.length, 3);
      assert.deepStrictEqual(deduplicated.map(a => a.id), ['mapa-1', 'mapa-2', 'mapa-3']);
      assert.strictEqual(deduplicated[0].titulo, 'Versão 1');
    });
  });

  // =========================================================================
  // 2. Classificação de Mensuração Canônica
  // =========================================================================
  describe('Resolução Canônica de Mensuração', () => {
    it('Prioriza measurement_class quando presente', () => {
      const art1 = { measurement_class: 'GA4', tipo_mapa: 'Universal Analytics' };
      assert.strictEqual(resolveMeasurementClass(art1), 'GA4');

      const art2 = { measurement_class: 'GA3', tipo_mapa: 'ga4' };
      assert.strictEqual(resolveMeasurementClass(art2), 'GA3');

      const art3 = { measurement_class: 'HIBRIDO' };
      assert.strictEqual(resolveMeasurementClass(art3), 'HIBRIDO');

      const art4 = { measurement_class: 'NAO_CLASSIFICADO' };
      assert.strictEqual(resolveMeasurementClass(art4), 'NAO_CLASSIFICADO');
    });

    it('Fallback gracioso em tipo_mapa legado', () => {
      assert.strictEqual(resolveMeasurementClass({ tipo_mapa: 'GA4' }), 'GA4');
      assert.strictEqual(resolveMeasurementClass({ tipo_mapa: 'ga4' }), 'GA4');
      assert.strictEqual(resolveMeasurementClass({ tipo_mapa: 'Universal Analytics' }), 'GA3');
      assert.strictEqual(resolveMeasurementClass({ tipo_mapa: 'ga3' }), 'GA3');
      assert.strictEqual(resolveMeasurementClass({ tipo_mapa: 'híbrido' }), 'HIBRIDO');
      assert.strictEqual(resolveMeasurementClass({ tipo_mapa: 'Hibrido' }), 'HIBRIDO');
    });

    it('Nunca assume GA3 sem evidência — mapas sem informação tornam-se NAO_CLASSIFICADO', () => {
      assert.strictEqual(resolveMeasurementClass({}), 'NAO_CLASSIFICADO');
      assert.strictEqual(resolveMeasurementClass(null), 'NAO_CLASSIFICADO');
      assert.strictEqual(resolveMeasurementClass({ tipo_mapa: 'outro' }), 'NAO_CLASSIFICADO');
    });

    it('Rótulos canônicos de mensuração', () => {
      assert.strictEqual(getMeasurementLabel('GA4'), 'GA4');
      assert.strictEqual(getMeasurementLabel('GA3'), 'Universal Analytics (GA3)');
      assert.strictEqual(getMeasurementLabel('HIBRIDO'), 'Híbrido');
      assert.strictEqual(getMeasurementLabel('NAO_CLASSIFICADO'), 'Não classificado');
      assert.strictEqual(MEASUREMENT_CONFIGS.GA3.label, 'Universal Analytics (GA3)');
      assert.strictEqual(MEASUREMENT_CONFIGS.NAO_CLASSIFICADO.label, 'Não classificado');
    });
  });

  // =========================================================================
  // 3. Status de Telas e Agregação de Homologação Canônica
  // =========================================================================
  describe('Agregação Canônica de Status e Homologação', () => {
    it('Reconhece exclusivamente os 5 status oficiais', () => {
      const screens = [
        { status: 'VALIDADO' },
        { status: 'CORREÇÃO' },
        { status: 'NOVO' },
        { status: 'EXCLUIR' },
        { status: 'DESCONTINUAR' },
        { status: 'ESTRANHO_1' },
        { status: null }
      ];
      const metrics = calculateScreenStatusMetrics(screens);
      assert.strictEqual(metrics.totalScreens, 7);
      assert.strictEqual(metrics.recognizedScreens, 5);
      assert.strictEqual(metrics.unrecognizedScreens, 2);
      assert.strictEqual(metrics.validated, 1);
      assert.strictEqual(metrics.correction, 1);
      assert.strictEqual(metrics.new, 1);
      assert.strictEqual(metrics.exclude, 1);
      assert.strictEqual(metrics.discontinue, 1);
      // 1 validado de 5 reconhecidos = 20%
      assert.strictEqual(metrics.homologationPercentage, 20);
      assert.strictEqual(metrics.homologationStatus, 'PARCIAL');
      assert.strictEqual(metrics.isFullyValidated, false);
    });

    it('Mapa 100% validado atinge estado HOMOLOGADO', () => {
      const screens = [
        { status: 'VALIDADO' },
        { status: 'VALIDADO' },
        { status: 'VALIDADO' }
      ];
      const metrics = calculateScreenStatusMetrics(screens);
      assert.strictEqual(metrics.homologationPercentage, 100);
      assert.strictEqual(metrics.homologationStatus, 'HOMOLOGADO');
      assert.strictEqual(metrics.isFullyValidated, true);
      assert.strictEqual(metrics.isFullyHomologated, true);
    });

    it('Mapa com 0% validado é NÃO HOMOLOGADO', () => {
      const screens = [
        { status: 'NOVO' },
        { status: 'CORREÇÃO' }
      ];
      const metrics = calculateScreenStatusMetrics(screens);
      assert.strictEqual(metrics.homologationPercentage, 0);
      assert.strictEqual(metrics.homologationStatus, 'NAO_HOMOLOGADO');
      assert.strictEqual(metrics.isFullyValidated, false);
    });

    it('Mapa sem telas retorna homologação nula (não-calculável, nunca 0% ou falso erro)', () => {
      const metrics = calculateScreenStatusMetrics([]);
      assert.strictEqual(metrics.totalScreens, 0);
      assert.strictEqual(metrics.homologationPercentage, null);
      assert.strictEqual(metrics.homologationStatus, 'NAO_CALCULAVEL');
      assert.strictEqual(metrics.hasScreens, false);
    });

    it('getMapStatusMetrics suporta fallback de status_summary estruturado', () => {
      const artifactWithSummary = {
        id: 'map-summary',
        artifact_type: 'MAPA',
        status_summary: {
          VALIDADO: 36,
          'CORREÇÃO': 1,
          NOVO: 27,
          EXCLUIR: 0,
          DESCONTINUAR: 0
        },
        total_screens: 64
      };
      const metrics = getMapStatusMetrics(artifactWithSummary);
      assert.strictEqual(metrics.totalScreens, 64);
      assert.strictEqual(metrics.validated, 36);
      assert.strictEqual(metrics.correction, 1);
      assert.strictEqual(metrics.new, 27);
      assert.strictEqual(metrics.recognizedScreens, 64);
      // 36 / 64 = 56.25% -> 56%
      assert.strictEqual(metrics.homologationPercentage, 56);
      assert.strictEqual(metrics.homologationStatus, 'PARCIAL');
    });
  });

  // =========================================================================
  // 4. Contratos de Filtro Canônico
  // =========================================================================
  describe('Contratos Canônicos de Filtro', () => {
    const sampleArtifacts = [
      { id: '1', artifact_type: 'MAPA', produto: 'Cartões', subproduto: 'Crédito', measurement_class: 'GA4', responsavel: 'Lucas' },
      { id: '2', artifact_type: 'MAPA', produto: 'Cartões', subproduto: 'Débito', measurement_class: 'GA3', responsavel: 'Ana' },
      { id: '3', artifact_type: 'MAPA', produto: 'Investimentos', subproduto: 'Renda Fixa', measurement_class: 'GA4', responsavel: 'Lucas' },
      { id: '4', artifact_type: 'DOCUMENTACAO', produto: 'Cartões', subproduto: 'Crédito', responsavel: 'Lucas' },
      { id: '5', artifact_type: 'NO', produto: 'Cartões', subproduto: 'Crédito' }
    ];

    it('Recupera subprodutos válidos para um produto específico', () => {
      const subsCartoes = getValidSubproductsForProduct(sampleArtifacts, 'Cartões');
      assert.deepStrictEqual(subsCartoes.map(s => s.name).sort(), ['Crédito', 'Débito'].sort());

      const subsInvest = getValidSubproductsForProduct(sampleArtifacts, 'Investimentos');
      assert.deepStrictEqual(subsInvest.map(s => s.name), ['Renda Fixa']);

      const subsAll = getValidSubproductsForProduct(sampleArtifacts, 'ALL');
      assert.deepStrictEqual(subsAll.map(s => s.name).sort(), ['Crédito', 'Débito', 'Renda Fixa'].sort());
    });

    it('Reconcilia subproduto se não pertencer ao produto selecionado', () => {
      // 'Renda Fixa' não pertence a 'Cartões', então deve reconciliar para 'ALL'
      const reconciled = reconcileSubproductWithProduct(sampleArtifacts, 'Cartões', 'Renda Fixa');
      assert.strictEqual(reconciled, 'ALL');

      // 'Crédito' pertence a 'Cartões', deve ser mantido
      const kept = reconcileSubproductWithProduct(sampleArtifacts, 'Cartões', 'Crédito');
      assert.strictEqual(kept, 'Crédito');
    });

    it('Filtra artefatos pelo contrato global com precisão', () => {
      // Filtrar apenas Cartões
      const resCartoes = filterArtifactsByGlobalContract(sampleArtifacts, {
        ...DEFAULT_GLOBAL_FILTERS,
        productId: 'Cartões'
      });
      assert.strictEqual(resCartoes.length, 4);

      // Filtrar Cartões + Crédito + apenas MAPA
      const resCartoesCreditoMapa = filterArtifactsByGlobalContract(sampleArtifacts, {
        ...DEFAULT_GLOBAL_FILTERS,
        productId: 'Cartões',
        subproductId: 'Crédito',
        artifactType: 'MAPA'
      });
      assert.strictEqual(resCartoesCreditoMapa.length, 1);
      assert.strictEqual(resCartoesCreditoMapa[0].id, '1');

      // Filtrar por Classificação GA3
      const resGA3 = filterArtifactsByGlobalContract(sampleArtifacts, {
        ...DEFAULT_GLOBAL_FILTERS,
        measurementClass: 'GA3'
      });
      assert.strictEqual(resGA3.length, 1);
      assert.strictEqual(resGA3[0].id, '2');
    });
  });
});
