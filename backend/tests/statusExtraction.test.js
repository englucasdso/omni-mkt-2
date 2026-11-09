import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MapReader,
  decodeHtmlEntities,
  toDisplayScreenNumber
} from '../src/integrations/confluence/mapReader.js';
import { MeasurementClassifier } from '../src/services/classification/measurementClassifier.js';
import {
  buildDocumentarySequence,
  toDisplayScreenNumber as journeyToDisplayScreenNumber
} from '../src/services/journeyAnalysis.service.ts';

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

  // 3. CORREÇÃO em texto normal, sem acento e com entidades HTML (nomeadas, decimais, hexadecimais e duplamente codificadas)
  it('3. Deve decodificar e normalizar CORREÇÃO em texto normal, CORRECAO, CORRE&Ccedil;&Atilde;O, CORRE&ccedil;&atilde;O, CORRE&#199;&#195;O e hexadecimais', () => {
    const variations = [
      'CORREÇÃO',
      'Correção',
      'correção',
      'CORRECAO',
      'correcao',
      'CORRE&Ccedil;&Atilde;O',
      'CORRE&ccedil;&atilde;O',
      'CORRE&#199;&#195;O',
      'CORRE&#231;&#227;O',
      'CORRE&#xC7;&#xC3;O',
      'CORRE&#xc7;&#xc3;O',
      'CORRE&amp;Ccedil;&amp;Atilde;O'
    ];

    for (const raw of variations) {
      const decoded = decodeHtmlEntities(raw);
      assert.ok(
        decoded.toUpperCase() === 'CORREÇÃO' || decoded.toUpperCase() === 'CORRECAO',
        `decodeHtmlEntities("${raw}") resultou em "${decoded}"`
      );

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
    }
  });

  // 4. Formatos variados de macro e atributos do Confluence (.aui-lozenge, aninhamento, title, ac:structured-macro, texto simples)
  it('4. Deve extrair status de .aui-lozenge, macro aninhada, atributo title, ac:structured-macro e texto simples da célula', () => {
    const cases = [
      {
        name: 'Macro .aui-lozenge',
        cell: '<span class="aui-lozenge aui-lozenge-moved">CORRE&Ccedil;&Atilde;O</span>',
        expected: 'CORREÇÃO'
      },
      {
        name: 'Macro aninhada dentro de outros elementos',
        cell: '<div class="content-wrapper"><span class="status-macro" data-macro-name="status"><span class="aui-lozenge"><b>CORRE&Ccedil;&Atilde;O</b></span></span></div>',
        expected: 'CORREÇÃO'
      },
      {
        name: 'Status no atributo title com corpo vazio ou ícone',
        cell: '<span class="status-macro aui-lozenge" title="CORRE&Ccedil;&Atilde;O"><i class="icon"></i></span>',
        expected: 'CORREÇÃO'
      },
      {
        name: 'Status em ac:structured-macro',
        cell: '<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">Yellow</ac:parameter><ac:parameter ac:name="title">CORRE&Ccedil;&Atilde;O</ac:parameter></ac:structured-macro>',
        expected: 'CORREÇÃO'
      },
      {
        name: 'Status como texto simples da célula',
        cell: 'CORRE&Ccedil;&Atilde;O',
        expected: 'CORREÇÃO'
      }
    ];

    for (const c of cases) {
      const html = `
        <table class="confluenceTable">
          <tr><th>Status</th><td>${c.cell}</td></tr>
          <tr><th>Instrução</th><td>Teste ${c.name}</td></tr>
          <tr><th>Tela</th><td>Tela Principal</td></tr>
        </table>
      `;
      const screens = mapReader.extrairTelas(html, `map-${c.name}`, 'Credito', 'Fluxo');
      assert.strictEqual(screens.length, 1, `Falha na quantidade de telas para: ${c.name}`);
      assert.strictEqual(screens[0].status, c.expected, `Falha no status para: ${c.name}`);
    }
  });

  // 5. Status válido seguido por célula vazia ou candidato inválido nunca é apagado
  it('5. Não deve sobrescrever um status válido quando seguido por célula vazia, Status - Bot ou candidato inválido no mesmo bloco', () => {
    const htmlWithEmptySecondStatus = `
      <table class="confluenceTable">
        <tr><th>Status</th><td><span class="status-macro">CORRE&Ccedil;&Atilde;O</span></td></tr>
        <tr><th>Status</th><td>   </td></tr>
        <tr><th>Instrução</th><td>Tela com segunda linha Status vazia</td></tr>
        <tr><th>Código de Disparo</th><td><pre>dataLayer.push({ event: 'screen_view' });</pre></td></tr>
      </table>
    `;
    const screensEmpty = mapReader.extrairTelas(htmlWithEmptySecondStatus, 'map-empty-second', 'Credito', 'Fluxo');
    assert.strictEqual(screensEmpty.length, 1);
    assert.strictEqual(screensEmpty[0].status, 'CORREÇÃO');

    const htmlWithInvalidCandidate = `
      <table class="confluenceTable">
        <tr><th>Status</th><td><span class="status-macro">CORREÇÃO</span></td></tr>
        <tr><th>Status</th><td><span>VALOR_DESCONHECIDO</span></td></tr>
        <tr><th>Status - Bot</th><td><span>PENDENTE_BOT</span></td></tr>
        <tr><th>Instrução</th><td>Tela com candidato inválido posterior</td></tr>
        <tr><th>Código de Disparo</th><td><pre>dataLayer.push({ event: 'screen_view' });</pre></td></tr>
      </table>
    `;
    const screensInvalid = mapReader.extrairTelas(htmlWithInvalidCandidate, 'map-invalid-second', 'Credito', 'Fluxo');
    assert.strictEqual(screensInvalid.length, 1);
    assert.strictEqual(screensInvalid[0].status, 'CORREÇÃO');
  });

  // 6. Conflito entre dois status oficiais no mesmo bloco
  it('6. Deve priorizar a fonte estrutural mais forte e registrar STATUS_CONFLICT quando houver dois status oficiais conflitantes no mesmo bloco', () => {
    const htmlConflict = `
      <table class="confluenceTable">
        <tr>
          <th>Status</th>
          <td><span class="status-macro" data-macro-name="status">CORREÇÃO</span></td>
        </tr>
        <tr>
          <th>Instrução</th>
          <td>Ajustar disparo <span class="aui-lozenge">VALIDADO</span></td>
        </tr>
        <tr>
          <th>Código de Disparo</th>
          <td><pre>dataLayer.push({ event: 'conflict_event' });</pre></td>
        </tr>
      </table>
    `;
    const screens = mapReader.extrairTelas(htmlConflict, 'map-conflict', 'Credito', 'Fluxo');
    assert.strictEqual(screens.length, 1);
    assert.strictEqual(screens[0].status, 'CORREÇÃO', 'Deve escolher o status da linha exata Status');
    assert.ok(screens[0].status_conflict, 'Deve registrar status_conflict para auditoria');
    assert.strictEqual(screens[0].status_conflict.type, 'STATUS_CONFLICT');
    assert.strictEqual(screens[0].status_conflict.chosenStatus, 'CORREÇÃO');
    assert.deepStrictEqual(screens[0].status_conflict.conflictingStatuses.sort(), ['CORREÇÃO', 'VALIDADO']);
  });

  // 7. Diferença entre status geral do mapa, legenda de status e status individual das telas
  it('7. Não deve utilizar o status geral do cabeçalho nem tabela de legenda para contaminar as telas', () => {
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

      <!-- Legenda de status próxima da tabela -->
      <table class="confluenceTable">
        <tbody>
          <tr>
            <th>Legenda de Status</th>
            <td>
              <span class="aui-lozenge">VALIDADO</span> Verde |
              <span class="aui-lozenge">CORREÇÃO</span> Vermelho |
              <span class="aui-lozenge">NOVO</span> Amarelo
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Tela individual informando CORREÇÃO -->
      <table class="confluenceTable">
        <tbody>
          <tr>
            <th>Status</th>
            <td><span data-macro-name="status">CORRE&Ccedil;&Atilde;O</span></td>
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
    assert.strictEqual(screens.length, 1, 'Legenda e cabeçalho não podem virar telas');
    assert.strictEqual(screens[0].status, 'CORREÇÃO', 'Tela deve ter status próprio CORREÇÃO');

    const classification = classifier.classifyMap(screens, header.status_homologacao?.value);
    assert.strictEqual(classification.declared_status, 'VALIDADO');
    assert.strictEqual(classification.status_summary['CORREÇÃO'], 1);
    assert.strictEqual(classification.status_summary.VALIDADO, 0);
    assert.strictEqual(classification.homologado, false);
    assert.strictEqual(classification.status_divergent, true);
  });

  // 8. Diagnóstico curto e sanitizado quando o status não puder ser extraído
  it('8. Deve registrar STATUS_EXTRACTION_FAILURE sanitizado sem HTML bruto quando o status for inválido', () => {
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
    assert.strictEqual(screens[0].status, null);
    const err = screens[0].technical_error;
    assert.ok(err);
    assert.strictEqual(err.type, 'STATUS_EXTRACTION_FAILURE');
    assert.strictEqual(err.mapId, 'map-unrecognized');
    assert.strictEqual(err.screenIndex, 0);
    assert.strictEqual(err.displayScreenNumber, 1);
    assert.ok(Array.isArray(err.candidateLabels));
    assert.ok(Array.isArray(err.candidateValues));
    assert.ok(err.candidateValues.includes('VALOR_ESTRANHO_INVALIDO'));
    assert.ok(Array.isArray(err.candidateSources));
    assert.ok(typeof err.blockSignature === 'string' && err.blockSignature.length > 0);
    assert.strictEqual(err.snippetSnippet, undefined, 'Não deve armazenar a tabela HTML bruta');
  });

  // 9. Indexação estrutural independente do parâmetro literal "index" do snippet
  it('9. Deve separar completamente screen_index estrutural do parâmetro literal "index" do snippet', () => {
    const html = `
      <!-- Tela 0: possui index literal "1", e dois snippets -->
      <table class="confluenceTable">
        <tr><th>Status</th><td><span data-macro-name="status">VALIDADO</span></td></tr>
        <tr><th>Instrução</th><td>Tela index inicial com dois disparos</td></tr>
        <tr><th>Tela</th><td>De quanto precisa? (index)</td></tr>
        <tr>
          <th>Código de Disparo</th>
          <td>
            <pre>dataLayer.push({ "event": "Screen_Data", "name": "De quanto precisa?", "index": "1" });</pre>
            <pre>dataLayer.push({ "event": "Click_Data", "name": "Continuar", "index": "99" });</pre>
          </td>
        </tr>
      </table>

      <!-- Tela 1: não possui parâmetro literal index -->
      <table class="confluenceTable">
        <tr><th>Status</th><td><span data-macro-name="status">NOVO</span></td></tr>
        <tr><th>Instrução</th><td>Segunda tela sem parametro index</td></tr>
        <tr>
          <th>Código de Disparo</th>
          <td>
            <pre>dataLayer.push({ "event": "Screen_Data", "name": "Resumo da proposta" });</pre>
          </td>
        </tr>
      </table>

      <!-- Tela 2: possui o MESMO index literal "1" da primeira tela -->
      <table class="confluenceTable">
        <tr><th>Status</th><td><span data-macro-name="status">CORRE&Ccedil;&Atilde;O</span></td></tr>
        <tr><th>Instrução</th><td>Terceira tela repetindo index 1</td></tr>
        <tr>
          <th>Código de Disparo</th>
          <td>
            <pre>dataLayer.push({ "event": "Screen_Data", "name": "Confirmação", "index": "1" });</pre>
          </td>
        </tr>
      </table>
    `;

    const screens = mapReader.extrairTelas(html, 'map-index-test', 'Credito', 'Parcelado');
    assert.strictEqual(screens.length, 3, 'Deve detectar 3 telas distintas sem fundir telas com mesmo index literal');

    // Índices estruturais 0, 1, 2
    assert.deepStrictEqual(
      screens.map(s => s.screen_index),
      [0, 1, 2]
    );

    // Tela 0 possui 2 snippets com snippet_index 0 e 1, e preserva "index" como parâmetro do snippet
    assert.strictEqual(screens[0].snippets.length, 2);
    assert.strictEqual(screens[0].snippets[0].snippet_index, 0);
    assert.strictEqual(screens[0].snippets[1].snippet_index, 1);
    const literalIndexParam = screens[0].snippets[0].parameters.find(p => p.name === 'index');
    assert.ok(literalIndexParam, 'Parâmetro literal "index" deve continuar sendo extraído no snippet');
    assert.strictEqual(literalIndexParam.normalized_value, '1');

    // Tela 1 não possui parâmetro index e funciona normalmente
    assert.strictEqual(screens[1].snippets.length, 1);
    assert.strictEqual(screens[1].snippets[0].parameters.find(p => p.name === 'index'), undefined);

    // Tela 2 possui o mesmo index literal "1", mas mantém screen_index: 2 e status CORREÇÃO
    assert.strictEqual(screens[2].screen_index, 2);
    assert.strictEqual(screens[2].status, 'CORREÇÃO');
  });

  // 10. Vários blocos de tela dentro da mesma tabela HTML
  it('10. Deve segmentar vários blocos de tela (Status -> Instrução -> Tela -> Código) dentro da mesma tabela HTML', () => {
    const html = `
      <table class="confluenceTable">
        <tbody>
          <tr><th>Status</th><td><span class="status-macro">VALIDADO</span></td></tr>
          <tr><th>Instrução</th><td>Primeira tela na mesma tabela</td></tr>
          <tr><th>Tela</th><td>Home Parcelado</td></tr>
          <tr><th>Código de Disparo</th><td><pre>dataLayer.push({ event: 'step_1' });</pre></td></tr>

          <tr><th>Status</th><td><span class="aui-lozenge">CORRE&Ccedil;&Atilde;O</span></td></tr>
          <tr><th>Instrução</th><td>Segunda tela na mesma tabela</td></tr>
          <tr><th>Tela</th><td>Simulação Parcelado</td></tr>
          <tr><th>Código de Disparo</th><td><pre>dataLayer.push({ event: 'step_2' });</pre></td></tr>

          <tr><th>Status</th><td><span class="status-macro">NOVO</span></td></tr>
          <tr><th>Instrução</th><td>Terceira tela sem snippet ainda</td></tr>
          <tr><th>Tela</th><td>Comprovante</td></tr>
        </tbody>
      </table>
    `;

    const screens = mapReader.extrairTelas(html, 'map-single-table-multi-screens', 'Credito', 'Parcelado');
    assert.strictEqual(screens.length, 3, 'Deve segmentar os 3 blocos estruturais na mesma tabela');
    assert.deepStrictEqual(screens.map(s => s.screen_index), [0, 1, 2]);
    assert.deepStrictEqual(screens.map(s => s.status), ['VALIDADO', 'CORREÇÃO', 'NOVO']);
    assert.strictEqual(screens[0].snippets[0].event_raw, 'step_1');
    assert.strictEqual(screens[1].snippets[0].event_raw, 'step_2');
    assert.strictEqual(screens[2].snippets.length, 0, 'Tela estrutural sem snippet ainda deve ser criada');
  });

  // 11. Conversão de índice interno (0-based) para exibição humana (1-based) e labels de Jornadas
  it('11. Deve converter screen_index interno (0, 1, 34) para exibição humana (#1, #2, #35) e gerar labels corretos em Jornadas sem #0', () => {
    assert.strictEqual(toDisplayScreenNumber(0), 1);
    assert.strictEqual(toDisplayScreenNumber(1), 2);
    assert.strictEqual(toDisplayScreenNumber(34), 35);
    assert.strictEqual(journeyToDisplayScreenNumber(0), 1);
    assert.strictEqual(journeyToDisplayScreenNumber(34), 35);

    const mockScreens = Array.from({ length: 35 }, (_, idx) => ({
      screen_id: `sc-${idx}`,
      screen_index: idx,
      instruction: `Passo ${idx + 1}`,
      status: idx === 34 ? 'CORREÇÃO' : 'VALIDADO',
      snippets: []
    }));

    const journey = buildDocumentarySequence({
      id: '3359048152',
      titulo: 'MT - Créditos - Parcelado - Contratação - APP - MM',
      screens: mockScreens
    });

    assert.strictEqual(journey.nodes.length, 35);
    assert.strictEqual(journey.nodes[0].screenIndex, 0);
    assert.strictEqual(journey.nodes[0].label, 'Tela 1');
    assert.strictEqual(journey.nodes[1].screenIndex, 1);
    assert.strictEqual(journey.nodes[1].label, 'Tela 2');
    assert.strictEqual(journey.nodes[34].screenIndex, 34);
    assert.strictEqual(journey.nodes[34].label, 'Tela 35');
    assert.ok(journey.nodes.every(n => !n.label.includes('Tela 0') && !n.label.includes('#0')));
  });

  // 12. Caso real completo: Mapa 3359048152 com 64 telas (36 validadas, 1 correção na 35ª tela / screen_index 34, 27 novas)
  it('12. Deve validar o caso real do mapa 3359048152 com 64 telas (36 VALIDADO, 1 CORREÇÃO na tela #35 / screen_index 34, 27 NOVO)', () => {
    const blocksHtml = Array.from({ length: 64 }, (_, idx) => {
      let statusHtml = '<span class="status-macro" data-macro-name="status">VALIDADO</span>';
      if (idx === 34) {
        // 35ª tela (screen_index 34) com CORREÇÃO codificada em HTML no Confluence
        statusHtml = '<span class="status-macro aui-lozenge" data-macro-name="status">CORRE&Ccedil;&Atilde;O</span>';
      } else if (idx >= 37) {
        // 27 telas com NOVO (índices 37 a 63)
        statusHtml = '<span class="status-macro" data-macro-name="status">NOVO</span>';
      }

      return `
        <table class="confluenceTable">
          <tr><th>Status</th><td>${statusHtml}</td></tr>
          <tr><th>Instrução</th><td>Tela documental ${idx + 1}</td></tr>
          <tr><th>Tela</th><td>Tela_${idx + 1}</td></tr>
          <tr>
            <th>Código de Disparo</th>
            <td><pre>dataLayer.push({ "event": "Screen_Data", "name": "Tela ${idx + 1}", "index": "1" });</pre></td>
          </tr>
        </table>
      `;
    }).join('\n');

    const screens = mapReader.extrairTelas(
      blocksHtml,
      '3359048152',
      'Créditos',
      'Parcelado - Contratação - APP - MM'
    );

    assert.strictEqual(screens.length, 64, 'Mapa deve possuir 64 telas');
    const screen35 = screens[34];
    assert.strictEqual(screen35.screen_index, 34, '35ª tela deve ter screen_index interno 34');
    assert.strictEqual(toDisplayScreenNumber(screen35.screen_index), 35, '35ª tela deve ser exibida como #35');
    assert.strictEqual(screen35.status, 'CORREÇÃO', '35ª tela deve ter status CORREÇÃO');
    assert.strictEqual(screen35.technical_error, undefined);

    // O snippet preserva seu parâmetro literal "index": "1"
    const indexParam = screen35.snippets[0].parameters.find(p => p.name === 'index');
    assert.ok(indexParam);
    assert.strictEqual(indexParam.normalized_value, '1');

    const classification = classifier.classifyMap(screens, 'PARCIAL');
    assert.strictEqual(classification.total_screens, 64);
    assert.strictEqual(classification.status_summary.VALIDADO, 36);
    assert.strictEqual(classification.status_summary['CORREÇÃO'], 1);
    assert.strictEqual(classification.status_summary.NOVO, 27);
    assert.strictEqual(classification.status_summary.EXCLUIR, 0);
    assert.strictEqual(classification.status_summary.DESCONTINUAR, 0);
    assert.strictEqual(classification.extraction_errors.length, 0);
    assert.strictEqual(classification.integrity.valid, true);
    assert.strictEqual(classification.integrity.sum, 64);
  });
});
