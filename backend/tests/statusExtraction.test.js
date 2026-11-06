import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MapReader } from '../src/integrations/confluence/mapReader.js';
import { MeasurementClassifier } from '../src/services/classification/measurementClassifier.js';

describe('Extração, Normalização e Integridade de Status de Telas do Confluence', () => {
  const dummyTransport = {
    fetchApi: async () => ''
  };
  const mapReader = new MapReader(dummyTransport);
  const classifier = new MeasurementClassifier();

  // 1. Cada um dos cinco status oficiais
  it('1. Deve extrair perfeitamente cada um dos cinco status oficiais', () => {
    const statuses = ['VALIDADO', 'CORREÇÃO', 'NOVO', 'EXCLUIR', 'DESCONTINUAR'];

    for (const expectedStatus of statuses) {
      const html = `
        <table class="confluenceTable">
          <tbody>
            <tr>
              <th>Status</th>
              <td><span class="status-macro" data-macro-name="status">${expectedStatus}</span></td>
            </tr>
            <tr>
              <th>Instrução</th>
              <td>Disparo de teste para ${expectedStatus}</td>
            </tr>
            <tr>
              <th>Código de Disparo</th>
              <td><pre>dataLayer.push({ event: 'test_${expectedStatus}' });</pre></td>
            </tr>
          </tbody>
        </table>
      `;
      const screens = mapReader.extrairTelas(html, `map-${expectedStatus}`, 'Investimentos', 'Fluxo 1');
      assert.strictEqual(screens.length, 1, `Deve detectar 1 tela para ${expectedStatus}`);
      assert.strictEqual(screens[0].status, expectedStatus, `Status deve ser exatamente ${expectedStatus}`);
      assert.strictEqual(screens[0].status_raw, expectedStatus);
    }
  });

  // 2. Status com espaços extras e quebras de linha
  it('2. Deve normalizar status com espaços extras, tabulações e quebras de linha', () => {
    const rawWithWhitespaces = `
      \t\r\n   VALIDADO  \t  \n
    `;
    const html = `
      <table class="confluenceTable">
        <tbody>
          <tr>
            <th>Status</th>
            <td><span class="status-macro" data-macro-name="status">${rawWithWhitespaces}</span></td>
          </tr>
          <tr>
            <th>Instrução</th>
            <td>Carregamento da tela</td>
          </tr>
          <tr>
            <th>Código de Disparo</th>
            <td><pre>dataLayer.push({ event: 'whitespace_event' });</pre></td>
          </tr>
        </tbody>
      </table>
    `;
    const screens = mapReader.extrairTelas(html, 'map-whitespace', 'Cartoes', 'Fluxo 1');
    assert.strictEqual(screens.length, 1);
    assert.strictEqual(screens[0].status, 'VALIDADO', 'Deve remover quebras de linha e espaços extras');
    assert.strictEqual(screens[0].status_raw.trim(), 'VALIDADO');
  });

  // 3. CORREÇÃO com variação de acentuação
  it('3. Deve aceitar variação de acentuação para normalizar CORREÇÃO e CORRECAO para o oficial CORREÇÃO', () => {
    const variations = ['Correção', 'CORREÇÃO', 'correcao', 'CORRECAO'];

    for (const raw of variations) {
      const html = `
        <table class="confluenceTable">
          <tbody>
            <tr>
              <th>Status</th>
              <td><span data-macro-name="status">${raw}</span></td>
            </tr>
            <tr>
              <th>Instrução</th>
              <td>Correção de tag</td>
            </tr>
            <tr>
              <th>Código de Disparo</th>
              <td><pre>dataLayer.push({ event: 'fix_event' });</pre></td>
            </tr>
          </tbody>
        </table>
      `;
      const screens = mapReader.extrairTelas(html, `map-corr-${raw}`, 'Consorcio', 'Fluxo 1');
      assert.strictEqual(screens.length, 1);
      assert.strictEqual(screens[0].status, 'CORREÇÃO', `Variação "${raw}" deve ser normalizada para "CORREÇÃO"`);
      assert.strictEqual(screens[0].status_raw, raw);
    }
  });

  // 4. Várias telas com status diferentes no mesmo mapa
  it('4. Deve extrair várias telas com status diferentes no mesmo mapa e somar a distribuição', () => {
    const html = `
      <!-- Tela 1: VALIDADO -->
      <table class="confluenceTable">
        <tr><th>Status</th><td><span data-macro-name="status">VALIDADO</span></td></tr>
        <tr><th>Instrução</th><td>Tela 1</td></tr>
        <tr><th>Código de Disparo</th><td><pre>dataLayer.push({ event: 't1' });</pre></td></tr>
      </table>

      <!-- Tela 2: CORREÇÃO -->
      <table class="confluenceTable">
        <tr><th>Status</th><td><span data-macro-name="status">Correção</span></td></tr>
        <tr><th>Instrução</th><td>Tela 2</td></tr>
        <tr><th>Código de Disparo</th><td><pre>dataLayer.push({ event: 't2' });</pre></td></tr>
      </table>

      <!-- Tela 3: NOVO -->
      <table class="confluenceTable">
        <tr><th>Status</th><td><span data-macro-name="status">NOVO</span></td></tr>
        <tr><th>Instrução</th><td>Tela 3</td></tr>
        <tr><th>Código de Disparo</th><td><pre>dataLayer.push({ event: 't3' });</pre></td></tr>
      </table>

      <!-- Tela 4: EXCLUIR -->
      <table class="confluenceTable">
        <tr><th>Status</th><td><span data-macro-name="status">EXCLUIR</span></td></tr>
        <tr><th>Instrução</th><td>Tela 4</td></tr>
        <tr><th>Código de Disparo</th><td><pre>dataLayer.push({ event: 't4' });</pre></td></tr>
      </table>

      <!-- Tela 5: DESCONTINUAR -->
      <table class="confluenceTable">
        <tr><th>Status</th><td><span data-macro-name="status">DESCONTINUAR</span></td></tr>
        <tr><th>Instrução</th><td>Tela 5</td></tr>
        <tr><th>Código de Disparo</th><td><pre>dataLayer.push({ event: 't5' });</pre></td></tr>
      </table>
    `;
    const screens = mapReader.extrairTelas(html, 'map-multi-status', 'Omni Marketing', 'Fluxo 1');
    assert.strictEqual(screens.length, 5);

    const classification = classifier.classifyMap(screens, 'VALIDADO');
    const { status_summary, integrity, homologado } = classification;

    assert.strictEqual(status_summary.VALIDADO, 1);
    assert.strictEqual(status_summary['CORREÇÃO'], 1);
    assert.strictEqual(status_summary.NOVO, 1);
    assert.strictEqual(status_summary.EXCLUIR, 1);
    assert.strictEqual(status_summary.DESCONTINUAR, 1);
    assert.strictEqual(status_summary.NAO_IDENTIFICADO, undefined, 'Não deve existir chave NAO_IDENTIFICADO');

    assert.strictEqual(integrity.valid, true, 'Regra de integridade total_telas = soma dos 5 status deve ser verdadeira');
    assert.strictEqual(integrity.totalScreens, 5);
    assert.strictEqual(integrity.sum, 5);
    assert.strictEqual(homologado, false, 'Mapa com telas em correção/novo não pode ser homologado');
  });

  // 5. Diferença entre status geral do mapa e status individual das telas
  it('5. Não deve utilizar o status geral do cabeçalho do mapa para classificar as telas', () => {
    const html = `
      <!-- Cabeçalho do mapa informando VALIDADO -->
      <table class="confluenceTable">
        <tbody>
          <tr>
            <th>Status de Homologação</th>
            <td><span data-macro-name="status">VALIDADO</span></td>
          </tr>
          <tr>
            <th>Produto</th>
            <td>Financiamentos</td>
          </tr>
        </tbody>
      </table>

      <!-- Tela individual informando CORREÇÃO -->
      <table class="confluenceTable">
        <tbody>
          <tr>
            <th>Status</th>
            <td><span data-macro-name="status">Correção</span></td>
          </tr>
          <tr>
            <th>Instrução</th>
            <td>Tela com erro de disparo</td>
          </tr>
          <tr>
            <th>Código de Disparo</th>
            <td><pre>dataLayer.push({ event: 'err_event' });</pre></td>
          </tr>
        </tbody>
      </table>
    `;
    const { header } = mapReader.extrairCabecalho(html);
    assert.strictEqual(header.status_homologacao?.value, 'VALIDADO');

    const screens = mapReader.extrairTelas(html, 'map-header-diff', 'Financiamentos', 'Fluxo 1');
    assert.strictEqual(screens.length, 1);
    assert.strictEqual(screens[0].status, 'CORREÇÃO', 'Tela deve ter status próprio CORREÇÃO, sem herdar cabeçalho');

    const classification = classifier.classifyMap(screens, header.status_homologacao?.value);
    assert.strictEqual(classification.declared_status, 'VALIDADO');
    assert.strictEqual(classification.status_summary['CORREÇÃO'], 1);
    assert.strictEqual(classification.status_summary.VALIDADO, 0);
    assert.strictEqual(classification.homologado, false, 'Não deve homologar porque tela está em correção');
    assert.strictEqual(classification.status_divergent, true, 'Deve sinalizar divergência entre declarado e telas');
  });

  // 6. Página com múltiplos blocos de tela
  it('6. Deve extrair perfeitamente múltiplos blocos de tela isolando o status de cada bloco', () => {
    const html = `
      <div>
        <h2>Bloco 1: Login</h2>
        <table class="confluenceTable">
          <tr><th>Status</th><td><span data-macro-name="status">VALIDADO</span></td></tr>
          <tr><th>Instrução</th><td>Tela Login</td></tr>
          <tr><th>Código de Disparo</th><td><pre>dataLayer.push({ event: 'login_view' });</pre></td></tr>
        </table>

        <h2>Bloco 2: Termos</h2>
        <table class="confluenceTable">
          <tr><th>Status</th><td><span data-macro-name="status">NOVO</span></td></tr>
          <tr><th>Instrução</th><td>Tela Termos</td></tr>
          <tr><th>Código de Disparo</th><td><pre>dataLayer.push({ event: 'termos_view' });</pre></td></tr>
        </table>
      </div>
    `;
    const screens = mapReader.extrairTelas(html, 'map-multi-blocks', 'Bradesco Bank', 'Fluxo Onboarding');
    assert.strictEqual(screens.length, 2);
    assert.strictEqual(screens[0].status, 'VALIDADO');
    assert.strictEqual(screens[1].status, 'NOVO');
  });

  // 7. Tela cuja estrutura não pôde ser reconhecida (falha técnica, não 6ª categoria)
  it('7. Deve registrar erro técnico quando a estrutura de status não puder ser reconhecida, sem inventar status nem 6ª categoria', () => {
    const html = `
      <table class="confluenceTable">
        <tbody>
          <tr>
            <th>Status</th>
            <td><span>VALOR_ESTRANHO_INVALIDO</span></td>
          </tr>
          <tr>
            <th>Instrução</th>
            <td>Tela com status desconhecido</td>
          </tr>
          <tr>
            <th>Código de Disparo</th>
            <td><pre>dataLayer.push({ event: 'unknown_status' });</pre></td>
          </tr>
        </tbody>
      </table>
    `;
    const screens = mapReader.extrairTelas(html, 'map-unrecognized', 'Previdencia', 'Fluxo 1');
    assert.strictEqual(screens.length, 1);
    assert.strictEqual(screens[0].status, null, 'Status deve ser null pois valor é inválido');
    assert.ok(screens[0].technical_error, 'Deve conter registro de technical_error');
    assert.strictEqual(screens[0].technical_error.type, 'STATUS_EXTRACTION_FAILURE');

    const classification = classifier.classifyMap(screens, null);
    assert.strictEqual(classification.status_summary.VALIDADO, 0);
    assert.strictEqual(classification.status_summary['CORREÇÃO'], 0);
    assert.strictEqual(classification.status_summary.NOVO, 0);
    assert.strictEqual(classification.status_summary.EXCLUIR, 0);
    assert.strictEqual(classification.status_summary.DESCONTINUAR, 0);
    assert.strictEqual(classification.status_summary.NAO_IDENTIFICADO, undefined);
    assert.strictEqual(classification.extraction_errors.length, 1, 'Deve registrar falha técnica para diagnóstico');
    assert.strictEqual(classification.integrity.valid, false, 'Integridade deve acusar divergência sem mascarar');
  });

  // 8. Fechamento da soma total por status (regra de integridade)
  it('8. Deve validar fechamento exato da soma total por status: total_telas = VALIDADO + CORREÇÃO + NOVO + EXCLUIR + DESCONTINUAR', () => {
    const screens = [
      { status: 'VALIDADO', status_raw: 'VALIDADO', snippets: [] },
      { status: 'VALIDADO', status_raw: 'VALIDADO', snippets: [] },
      { status: 'CORREÇÃO', status_raw: 'Correção', snippets: [] },
      { status: 'NOVO', status_raw: 'NOVO', snippets: [] },
      { status: 'EXCLUIR', status_raw: 'EXCLUIR', snippets: [] },
      { status: 'DESCONTINUAR', status_raw: 'DESCONTINUAR', snippets: [] }
    ];

    const result = classifier.classifyMap(screens, null);
    const integrity = classifier.validateIntegrity(screens.length, result.status_summary);

    assert.strictEqual(integrity.valid, true);
    assert.strictEqual(integrity.totalScreens, 6);
    assert.strictEqual(integrity.sum, 6);
    assert.strictEqual(integrity.difference, 0);
  });

  // 9. Mapas de documentação sem telas não entram na distribuição de status de telas
  it('9. Mapas de documentação (sem telas) não devem entrar na contagem de status de telas', () => {
    const docScreens = [];
    const classification = classifier.classifyMap(docScreens, 'VALIDADO', { isDoc: true });

    assert.strictEqual(classification.status_summary.VALIDADO, 0);
    assert.strictEqual(classification.status_summary['CORREÇÃO'], 0);
    assert.strictEqual(classification.status_summary.NOVO, 0);
    assert.strictEqual(classification.status_summary.EXCLUIR, 0);
    assert.strictEqual(classification.status_summary.DESCONTINUAR, 0);
    assert.strictEqual(classification.homologado, false);

    const integrity = classifier.validateIntegrity(0, classification.status_summary);
    assert.strictEqual(integrity.valid, true);
    assert.strictEqual(integrity.sum, 0);
  });
});
