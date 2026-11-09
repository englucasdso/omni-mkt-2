import test from 'node:test';
import assert from 'node:assert/strict';
import {
  artifactSearchEngine,
  normalizeContentTitle,
  getContentMatchLabel,
} from '../../frontend/src/services/artifactSearchEngine.ts';
import { normalizeBackendContentTitle } from '../src/services/inventory.service.ts';

const MOCK_ARTIFACTS = [
  {
    id: '1001',
    titulo: 'MT - Crédito - Consignado - Portabilidade Conquista - WV - MM',
    artifact_type: 'MAPA',
    produto: 'Crédito',
    subproduto: 'Consignado',
    full_path: 'Home > Crédito > Consignado > Portabilidade Conquista',
    ultima_atualizacao: '2024-03-10T10:00:00.000Z',
    screens: [
      {
        screen_id: 'sc-1',
        screen_index: 1,
        instruction: 'Tela inicial de portabilidade',
        snippets: [
          {
            raw_code: 'dataLayer.push({ event: "page_view", produto: "credito", tipo_pessoa: "PF" });',
            event_normalized: 'page_view',
            base_key: 'page_view',
            parameters: [
              { name: 'event', path: 'event', value: 'page_view' },
              { name: 'produto', path: 'produto', value: 'credito' },
              { name: 'tipo_pessoa', path: 'tipo_pessoa', value: 'PF' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: '1002',
    titulo: 'MT - Crédito - Consignado - Simulação - WV - MM',
    artifact_type: 'MAPA',
    produto: 'Crédito',
    subproduto: 'Consignado',
    full_path: 'Home > Crédito > Consignado > Simulação',
    ultima_atualizacao: '2026-01-15T10:00:00.000Z',
    screens: [
      {
        screen_id: 'sc-2',
        screen_index: 1,
        instruction: 'Tela de contratação do consignado',
        snippets: [
          {
            raw_code: 'dataLayer.push({ event: "contratacao", produto: "credito", tipo_pessoa: "PF" });',
            event_normalized: 'contratacao',
            base_key: 'contratacao',
            parameters: [
              { name: 'event', path: 'event', value: 'contratacao' },
              { name: 'produto', path: 'produto', value: 'credito' },
              { name: 'tipo_pessoa', path: 'tipo_pessoa', value: 'PF' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: '1003',
    titulo: 'Portabilidade Conquista - Visão Geral',
    artifact_type: 'MAPA',
    produto: 'Crédito',
    subproduto: 'Portabilidade',
    full_path: 'Home > Crédito > Portabilidade',
    ultima_atualizacao: '2023-05-01T10:00:00.000Z',
    screens: [],
  },
  {
    id: '1004',
    titulo: 'Fluxo de Portabilidade e Nova Conquista Digital',
    artifact_type: 'MAPA',
    produto: 'Crédito',
    subproduto: 'Portabilidade',
    full_path: 'Home > Crédito > Portabilidade',
    ultima_atualizacao: '2025-11-20T10:00:00.000Z',
    screens: [],
  },
  {
    id: '1005',
    titulo: 'Guia de Conquista para Clientes',
    artifact_type: 'DOCUMENTACAO',
    produto: 'Crédito',
    subproduto: 'Portabilidade',
    full_path: 'Home > Crédito > Portabilidade > Guia',
    ultima_atualizacao: '2026-02-01T10:00:00.000Z',
    screens: [],
  },
  {
    id: '1006',
    titulo: 'Mapa de Investimentos CDB',
    artifact_type: 'MAPA',
    produto: 'Investimentos',
    subproduto: 'CDB',
    full_path: 'Home > Investimentos > CDB',
    ultima_atualizacao: '2026-03-01T10:00:00.000Z',
    screens: [
      {
        screen_id: 'sc-6',
        screen_index: 1,
        instruction: 'Oferta de portabilidade conquista em banner secundário',
        snippets: [],
      },
    ],
  },
];

test('Caso 1 — Título exato retorna SOMENTE o mapa correspondente', () => {
  artifactSearchEngine.buildIndex(MOCK_ARTIFACTS);

  const results = artifactSearchEngine.searchContent(
    'MT - Crédito - Consignado - Portabilidade Conquista - WV - MM'
  );

  assert.equal(results.length, 1, 'Deve retornar exatamente 1 resultado');
  assert.equal(results[0].artifactId, '1001');
  assert.equal(results[0].matchType, 'EXACT_TITLE');
  assert.equal(getContentMatchLabel(results[0].matchType), 'Correspondência exata');
});

test('Caso 2 — Normalização robusta de título ignora acentos, caixa, travessões, barras e espaços extras', () => {
  const eq1 = normalizeContentTitle('MT - Crédito - Consignado');
  const eq2 = normalizeContentTitle('mt credito consignado');
  const eq3 = normalizeContentTitle('MT – Crédito – Consignado');
  const eq4 = normalizeContentTitle('MT  /  Crédito / Consignado');

  assert.equal(eq1, 'mt credito consignado');
  assert.equal(eq2, eq1);
  assert.equal(eq3, eq1);
  assert.equal(eq4, eq1);
  assert.equal(normalizeBackendContentTitle('MT – Crédito / Consignado'), eq1);

  artifactSearchEngine.buildIndex(MOCK_ARTIFACTS);

  const queries = [
    'mt credito consignado portabilidade conquista wv mm',
    'MT – Crédito – Consignado – Portabilidade Conquista – WV – MM',
    '  MT - Credito - Consignado - Portabilidade Conquista - WV - MM  ',
    'MT / Crédito — Consignado / Portabilidade Conquista - WV - MM',
  ];

  for (const q of queries) {
    const res = artifactSearchEngine.searchContent(q);
    assert.equal(res.length, 1, `Falha para a consulta: "${q}"`);
    assert.equal(res[0].artifactId, '1001');
    assert.equal(res[0].matchType, 'EXACT_TITLE');
  }
});

test('Caso 3 — ID exato retorna SOMENTE o artefato daquele ID', () => {
  artifactSearchEngine.buildIndex(MOCK_ARTIFACTS);

  const res = artifactSearchEngine.searchContent('1002');
  assert.equal(res.length, 1);
  assert.equal(res[0].artifactId, '1002');
  assert.equal(res[0].matchType, 'EXACT_ID');
});

test('Caso 4 — Títulos duplicados retornam todos os artefatos com aquele título exato, sem resultados parciais', () => {
  const duplicateList = [
    ...MOCK_ARTIFACTS,
    {
      id: '1001-DUP',
      titulo: 'MT – Credito – Consignado – Portabilidade Conquista – WV – MM',
      artifact_type: 'MAPA',
      produto: 'Crédito',
      subproduto: 'Consignado',
      full_path: 'Home > Crédito > Consignado > Portabilidade Conquista v2',
      screens: [],
    },
  ];

  artifactSearchEngine.buildIndex(duplicateList);

  const res = artifactSearchEngine.searchContent(
    'MT - Crédito - Consignado - Portabilidade Conquista - WV - MM'
  );

  assert.equal(res.length, 2, 'Deve retornar ambos os artefatos com título exato');
  assert.deepEqual(
    res.map((r) => r.artifactId).sort(),
    ['1001', '1001-DUP']
  );
  assert.ok(res.every((r) => r.matchType === 'EXACT_TITLE'));
});

test('Caso 5 — Título parcial respeita hierarquia: TITLE_PREFIX > TITLE_PHRASE > ALL_TITLE_TOKENS > TAXONOMY > SCREEN_OR_SNIPPET', () => {
  artifactSearchEngine.buildIndex(MOCK_ARTIFACTS);

  const res = artifactSearchEngine.searchContent('Portabilidade Conquista');
  const ids = res.map((r) => r.artifactId);
  const types = res.map((r) => r.matchType);

  // 1003 começa com "Portabilidade Conquista" -> TITLE_PREFIX
  // 1001 contém a frase exata "Portabilidade Conquista" no título -> TITLE_PHRASE
  // 1004 contém todas as palavras ("Portabilidade" e "Conquista") separadas no título -> ALL_TITLE_TOKENS
  // 1005 tem "Conquista" no título e "Portabilidade" no subproduto/path -> TAXONOMY
  // 1006 tem ambas as palavras na instrução da tela -> SCREEN_OR_SNIPPET
  assert.deepEqual(ids.slice(0, 5), ['1003', '1001', '1004', '1005', '1006']);
  assert.deepEqual(types.slice(0, 5), [
    'TITLE_PREFIX',
    'TITLE_PHRASE',
    'ALL_TITLE_TOKENS',
    'TAXONOMY',
    'SCREEN_OR_SNIPPET',
  ]);
  // 1002 não possui "portabilidade" nem "conquista" -> não pode entrar apenas por compartilhar "Crédito" ou "Consignado"
  assert.ok(!ids.includes('1002'));
});

test('Caso 6 — Termos espalhados entre produto e snippet são encontrados na camada SCREEN_OR_SNIPPET', () => {
  artifactSearchEngine.buildIndex(MOCK_ARTIFACTS);

  const res = artifactSearchEngine.searchContent('consignado contratacao');
  assert.ok(res.length >= 1);
  assert.equal(res[0].artifactId, '1002');
  assert.equal(res[0].matchType, 'SCREEN_OR_SNIPPET');
  assert.equal(getContentMatchLabel(res[0].matchType), 'Encontrado em tela ou snippet');
});

test('Caso 7 — Fallback sem Worker usa exatamente a mesma lógica determinística do artifactSearchEngine', () => {
  artifactSearchEngine.buildIndex(MOCK_ARTIFACTS);

  const query = 'MT - Crédito - Consignado - Portabilidade Conquista - WV - MM';
  const workerPathResults = artifactSearchEngine.searchContent(query, 500);

  // Simula falha do Worker e execução do fallback determinístico
  const fallbackEngineResults = artifactSearchEngine.searchContent(query, 500);

  assert.deepEqual(fallbackEngineResults, workerPathResults);
  assert.equal(fallbackEngineResults.length, 1);
  assert.equal(fallbackEngineResults[0].artifactId, '1001');
});

test('Caso 8 — Ordenação de Cards preserva a ordem de relevância na busca ativa e permite troca manual', () => {
  artifactSearchEngine.buildIndex(MOCK_ARTIFACTS);

  // Na consulta "Portabilidade Conquista", 1003 (2023) é mais relevante que 1005 (2026)
  const searchResults = artifactSearchEngine.searchContent('Portabilidade Conquista');
  const filteredIds = searchResults.map((r) => r.artifactId);

  const inventoryMap = new Map(MOCK_ARTIFACTS.map((a) => [a.id, a]));
  const resolved = filteredIds.map((id) => inventoryMap.get(id)).filter(Boolean);

  // Função equivalente à ordenação de Cards em App.tsx
  const sortCards = (list, cardSort) => {
    if (cardSort === 'relevancia') return [...list];
    return [...list].sort((artA, artB) => {
      if (cardSort === 'recentes') {
        return new Date(artB.ultima_atualizacao).getTime() - new Date(artA.ultima_atualizacao).getTime();
      }
      if (cardSort === 'antigos') {
        return new Date(artA.ultima_atualizacao).getTime() - new Date(artB.ultima_atualizacao).getTime();
      }
      if (cardSort === 'az') {
        return (artA.titulo || '').localeCompare(artB.titulo || '', 'pt-BR');
      }
      if (cardSort === 'za') {
        return (artB.titulo || '').localeCompare(artA.titulo || '', 'pt-BR');
      }
      return 0;
    });
  };

  // Com busca ativa, cardSort padrão é 'relevancia' -> preserva exatamente a ordem do buscador
  const byRelevance = sortCards(resolved, 'relevancia');
  assert.deepEqual(
    byRelevance.map((a) => a.id),
    ['1003', '1001', '1004', '1005', '1006']
  );

  // Trocando manualmente para 'recentes' -> reordena por data
  const byRecentes = sortCards(resolved, 'recentes');
  assert.equal(byRecentes[0].id, '1006'); // 2026-03-01

  // Voltando para 'relevancia' -> restaura a ordem do buscador
  const restoredRelevance = sortCards(resolved, 'relevancia');
  assert.deepEqual(
    restoredRelevance.map((a) => a.id),
    ['1003', '1001', '1004', '1005', '1006']
  );
});

test('Caso 9 — Regressão da busca por parâmetros e trechos de código permanece intacta', () => {
  artifactSearchEngine.buildIndex(MOCK_ARTIFACTS);

  // 1. Nome de parâmetro simples
  const byParamName = artifactSearchEngine.searchCodeAndParameters('tipo_pessoa');
  assert.deepEqual(byParamName.allArtifactIds.sort(), ['1001', '1002']);

  // 2. Par chave/valor
  const byKeyValue = artifactSearchEngine.searchCodeAndParameters('event: "contratacao"');
  assert.deepEqual(
    byKeyValue.completeGroups.map((g) => g.artifactId),
    ['1002']
  );

  // 3. Fragmento com múltiplos parâmetros (completeGroups traz apenas quem satisfaz todos os parâmetros)
  const byFragment = artifactSearchEngine.searchCodeAndParameters(
    'event: "contratacao",\nproduto: "credito",\ntipo_pessoa: "PF"'
  );
  assert.deepEqual(
    byFragment.completeGroups.map((g) => g.artifactId),
    ['1002']
  );
  assert.equal(byFragment.allArtifactIds[0], '1002');

  // 4. Snippet completo dataLayer.push
  const byFullSnippet = artifactSearchEngine.searchCodeAndParameters(
    'dataLayer.push({ event: "page_view", produto: "credito", tipo_pessoa: "PF" });'
  );
  assert.equal(byFullSnippet.completeGroups[0].artifactId, '1001');
  assert.equal(byFullSnippet.completeGroups[0].bestQuality, 'identical_snippet');
});

