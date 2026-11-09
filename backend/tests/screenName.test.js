import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MapReader } from '../src/integrations/confluence/mapReader.js';

describe('Nome da tela preservado no modelo', () => {
  it('extrai screen_name do campo "Tela" sem substituir a instrução', () => {
    const reader = new MapReader({ fetchApi: async () => '' });
    const html = `
      <table class="confluenceTable">
        <tr><th>Status</th><td><span class="status-macro">VALIDADO</span></td></tr>
        <tr><th>Tela</th><td>Revisão da contratação</td></tr>
        <tr><th>Instrução</th><td>Disparar ao clicar em Continuar</td></tr>
        <tr><th>Código de Disparo</th><td><pre>dataLayer.push({ event: 'clique', produto: 'crédito' });</pre></td></tr>
      </table>`;
    const screens = reader.extrairTelas(html, 'map-1', 'Créditos', 'Consignado');
    assert.equal(screens.length, 1);
    assert.equal(screens[0].screen_name, 'Revisão da contratação');
    assert.equal(screens[0].instruction, 'Disparar ao clicar em Continuar');
  });
});
