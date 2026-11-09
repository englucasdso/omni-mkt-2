import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { artifactSearchEngine } from '../../frontend/src/services/artifactSearchEngine.ts';

const snippet = (id, raw_code, parameters) => ({
  snippet_id: id,
  raw_code,
  event_raw: 'clique',
  parameters: parameters.map((name) => ({ name, name_normalized: name.toLowerCase(), path: name, raw_value: "'x'", normalized_value: 'x' }))
});

const artifacts = [
  {
    id: 'ga3', titulo: 'Mapa GA3', artifact_type: 'MAPA', produto: 'Cartões',
    screens: [{ screen_id: 's1', screen_index: 0, status: 'VALIDADO', snippets: [
      snippet('a', "dataLayer.push({ eventCategory: 'x', eventAction: 'y' })", ['eventCategory', 'eventAction'])
    ] }]
  },
  {
    id: 'ga4', titulo: 'Mapa GA4', artifact_type: 'MAPA', produto: 'Cartões',
    screens: [{ screen_id: 's2', screen_index: 0, status: 'VALIDADO', snippets: [
      snippet('b', "dataLayer.push({ event: 'x', user_id: '{{user_id}}' })", ['event', 'user_id'])
    ] }]
  },
  {
    id: 'ambos', titulo: 'Mapa com os dois', artifact_type: 'MAPA', produto: 'Cartões',
    screens: [{ screen_id: 's3', screen_index: 0, status: 'VALIDADO', snippets: [
      snippet('c', "dataLayer.push({ eventCategory: 'x', user_id: '{{user_id}}' })", ['eventCategory', 'user_id'])
    ] }]
  }
];

describe('Busca por parâmetros — combinação AND estrita', () => {
  artifactSearchEngine.buildIndex(artifacts);

  it('AND retorna apenas artefatos com todos os parâmetros no mesmo snippet', () => {
    const res = artifactSearchEngine.searchCodeAndParameters('eventCategory + user_id', { scope: 'SNIPPET', condition: 'AND' });
    assert.deepEqual(res.allArtifactIds, ['ambos']);
    assert.equal(res.totalArtifactsCount, 1);
  });

  it('AND sem nenhum artefato completo retorna zero resultados (parciais não contam)', () => {
    const res = artifactSearchEngine.searchCodeAndParameters('eventAction + user_id', { scope: 'SNIPPET', condition: 'AND' });
    assert.equal(res.allArtifactIds.length, 0);
    assert.ok(res.partialGroups.length > 0, 'parciais continuam disponíveis como sugestão');
  });

  it('OR aceita qualquer um dos parâmetros', () => {
    const res = artifactSearchEngine.searchCodeAndParameters('eventAction + user_id', { scope: 'SNIPPET', condition: 'OR' });
    assert.ok(res.allArtifactIds.includes('ga3'));
    assert.ok(res.allArtifactIds.includes('ga4'));
  });
});
