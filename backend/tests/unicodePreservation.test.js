import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MapReader,
  decodeHtmlEntities,
  repairMojibakeIfNeeded,
  detectReplacementCharDiagnostic
} from '../src/integrations/confluence/mapReader.js';
import { ParameterParser } from '../src/integrations/confluence/parameterParser.js';
import { artifactSearchEngine } from '../../frontend/src/services/artifactSearchEngine.ts';

describe('Preservação de Caracteres Unicode em Snippets e Parâmetros (Casos 1 a 18)', () => {
  const dummyTransport = { fetchApi: async () => '' };
  const mapReader = new MapReader(dummyTransport);
  const parser = new ParameterParser();

  it('Caso 1 — UTF-8 já correto deve permanecer idêntico', () => {
    const input = 'Contratação de crédito';
    assert.strictEqual(decodeHtmlEntities(input), 'Contratação de crédito');
    assert.strictEqual(parser.decodeHtml(input), 'Contratação de crédito');
  });

  it('Caso 2 — Entidades nomeadas (Contrata&ccedil;&atilde;o -> Contratação)', () => {
    assert.strictEqual(decodeHtmlEntities('Contrata&ccedil;&atilde;o'), 'Contratação');
    assert.strictEqual(
      decodeHtmlEntities('Empr&eacute;stimo para Jo&atilde;o &ndash; Voc&ecirc; est&aacute; eleg&iacute;vel'),
      'Empréstimo para João – Você está elegível'
    );
  });

  it('Caso 3 — Entidades decimais (Cr&#233;dito -> Crédito)', () => {
    assert.strictEqual(decodeHtmlEntities('Cr&#233;dito'), 'Crédito');
    assert.strictEqual(decodeHtmlEntities('Contrata&#231;&#227;o'), 'Contratação');
  });

  it('Caso 4 — Entidades hexadecimais (Simula&#xE7;&#xE3;o -> Simulação)', () => {
    assert.strictEqual(decodeHtmlEntities('Simula&#xE7;&#xE3;o'), 'Simulação');
    assert.strictEqual(decodeHtmlEntities('Simula&#xe7;&#xe3;o conclu&#xED;da'), 'Simulação concluída');
  });

  it('Caso 5 — Maiúsculas (CORRE&Ccedil;&Atilde;O -> CORREÇÃO)', () => {
    assert.strictEqual(decodeHtmlEntities('CORRE&Ccedil;&Atilde;O'), 'CORREÇÃO');
    assert.strictEqual(decodeHtmlEntities('&Aacute;rea de Cr&eacute;dito'), 'Área de Crédito');
  });

  it('Caso 6 — Texto com ampersand legítimo não deve ser alterado', () => {
    assert.strictEqual(decodeHtmlEntities('Crédito & Investimentos'), 'Crédito & Investimentos');
    // Também garante que query strings com nomes similares a entidades sem ';' não sejam corrompidas
    assert.strictEqual(
      decodeHtmlEntities('https://banco.bradesco?id=1&para=credito&copy=2&times=3'),
      'https://banco.bradesco?id=1&para=credito&copy=2&times=3'
    );
  });

  it('Caso 7 — Entidade de ampersand (Crédito &amp; Investimentos -> Crédito & Investimentos)', () => {
    assert.strictEqual(decodeHtmlEntities('Crédito &amp; Investimentos'), 'Crédito & Investimentos');
  });

  it('Caso 8 — Caracteres variados preservados integralmente', () => {
    const chars = 'á é í ó ú â ê ô ã õ ç Á É Ç';
    assert.strictEqual(decodeHtmlEntities(chars), chars);
  });

  it('Caso 9 — Símbolos e moeda preservados (R$ 1.250,00 – aprovação 100%)', () => {
    const text = 'R$ 1.250,00 – aprovação 100%';
    assert.strictEqual(decodeHtmlEntities(text), text);
  });

  it('Caso 10 — Placeholder acentuado preservado ({{código-produto}})', () => {
    const placeholder = '{{código-produto}}';
    assert.strictEqual(decodeHtmlEntities(placeholder), '{{código-produto}}');

    const snippet = parser.parseSnippet(
      'dataLayer.push({ "event": "selecao_produto", "id_produto": "{{código-produto}}" });',
      'map-10',
      'sc-1',
      0
    );
    const param = snippet.parameters.find((p) => p.name === 'id_produto');
    assert.ok(param);
    assert.strictEqual(param.raw_value, '"{{código-produto}}"');
    assert.strictEqual(param.normalized_value, '{{código-produto}}');
    assert.strictEqual(param.value_type, 'PLACEHOLDER');
  });

  it('Caso 11 — Mojibake confirmado reparado com segurança sem afetar texto válido', () => {
    assert.strictEqual(decodeHtmlEntities('ContrataÃ§Ã£o'), 'Contratação');
    assert.strictEqual(decodeHtmlEntities('CrÃ©dito'), 'Crédito');
    assert.strictEqual(decodeHtmlEntities('SimulaÃ§Ã£o'), 'Simulação');
    assert.strictEqual(decodeHtmlEntities('JoÃ£o'), 'João');
    assert.strictEqual(repairMojibakeIfNeeded('ConcluÃ­da'), 'Concluída');
    // Texto em maiúsculas já válido com 'Ã' legítimo nunca deve ser corrompido
    assert.strictEqual(decodeHtmlEntities('CORREÇÃO DE SÃO PAULO E JOÃO'), 'CORREÇÃO DE SÃO PAULO E JOÃO');
  });

  it('Caso 12 — Idempotência: texto já correto executado duas ou mais vezes continua idêntico', () => {
    const samples = [
      'Contratação de crédito',
      'Crédito & Investimentos',
      'R$ 1.250,00 – aprovação 100%',
      '{{código-produto}}',
      'CORREÇÃO',
      decodeHtmlEntities('Contrata&ccedil;&atilde;o &amp; Simula&#xE7;&#xE3;o')
    ];

    for (const s of samples) {
      const once = decodeHtmlEntities(s);
      const twice = decodeHtmlEntities(once);
      const thrice = decodeHtmlEntities(twice);
      assert.strictEqual(once, twice, `Falha de idempotência na 2ª execução para: ${s}`);
      assert.strictEqual(twice, thrice, `Falha de idempotência na 3ª execução para: ${s}`);
    }
  });

  it('Caso 13 — Snippet completo em SyntaxHighlighter com divs aninhadas, indentação e entidades HTML', () => {
    const shHtml = `
      <div class="syntaxhighlighter nogutter js">
        <div class="container">
          <div class="line number1 index0 alt2"><code class="js plain">dataLayer.push({</code></div>
          <div class="line number2 index1 alt1"><code class="js spaces">&nbsp;&nbsp;</code><code class="js string">&quot;event&quot;</code><code class="js plain">: </code><code class="js string">&quot;Simula&ccedil;&atilde;o_Conclu&iacute;da&quot;</code><code class="js plain">,</code></div>
          <div class="line number3 index2 alt2"><code class="js spaces">&nbsp;&nbsp;</code><code class="js string">&quot;name&quot;</code><code class="js plain">: </code><code class="js string">&quot;Contrata&#231;&#227;o de cr&#xE9;dito&quot;</code><code class="js plain">,</code></div>
          <div class="line number4 index3 alt1"><code class="js spaces">&nbsp;&nbsp;</code><code class="js string">&quot;placeholder&quot;</code><code class="js plain">: </code><code class="js string">&quot;{{c&oacute;digo-produto}}&quot;</code></div>
          <div class="line number5 index4 alt2"><code class="js plain">});</code></div>
        </div>
      </div>
    `;

    const snippets = mapReader.extrairSnippetsDeHtml(shHtml);
    assert.strictEqual(snippets.length, 1);
    const expectedCode = [
      'dataLayer.push({',
      '  "event": "Simulação_Concluída",',
      '  "name": "Contratação de crédito",',
      '  "placeholder": "{{código-produto}}"',
      '});'
    ].join('\n');
    assert.strictEqual(snippets[0], expectedCode);
  });

  it('Caso 14 — Snippet completo em <pre> preservando quebras de linha, indentação, acentos e operadores', () => {
    const preHtml = `
      <div class="codeContent">
        <pre class="syntaxhighlighter-pre">dataLayer.push({
  "event": "Simula&ccedil;&atilde;o_Conclu&iacute;da",
  "name": "Contrata&ccedil;&atilde;o de cr&eacute;dito",
  "produto": "Cr&#233;dito parcelado",
  "acao": "Simula&#xE7;&#xE3;o conclu&#xED;da",
  "descricao": "Empr&eacute;stimo para Jo&atilde;o",
  "mensagem": "Voc&ecirc; est&aacute; eleg&iacute;vel",
  "regra": "valor &lt; 10000 &amp;&amp; score &gt; 700"
});</pre>
      </div>
    `;

    const snippets = mapReader.extrairSnippetsDeHtml(preHtml);
    assert.strictEqual(snippets.length, 1, 'Não deve duplicar snippet em .codeContent > pre');
    assert.ok(snippets[0].includes('"name": "Contratação de crédito"'));
    assert.ok(snippets[0].includes('"produto": "Crédito parcelado"'));
    assert.ok(snippets[0].includes('"acao": "Simulação concluída"'));
    assert.ok(snippets[0].includes('"descricao": "Empréstimo para João"'));
    assert.ok(snippets[0].includes('"mensagem": "Você está elegível"'));
    assert.ok(snippets[0].includes('"regra": "valor < 10000 && score > 700"'));
    assert.ok(snippets[0].includes('\n  "name":'), 'Deve preservar quebras de linha e indentação');
  });

  it('Caso 15 — Snippet completo em <code>', () => {
    const codeHtml = `
      <code>{
  "name": "Contrata&ccedil;&atilde;o de cr&eacute;dito",
  "produto": "Cr&eacute;dito parcelado",
  "acao": "Simula&ccedil;&atilde;o conclu&iacute;da",
  "descricao": "Empr&eacute;stimo para Jo&atilde;o",
  "mensagem": "Voc&ecirc; est&aacute; eleg&iacute;vel"
}</code>
    `;

    const snippets = mapReader.extrairSnippetsDeHtml(codeHtml);
    assert.strictEqual(snippets.length, 1);
    const parsed = parser.parseSnippet(snippets[0], 'map-15', 'sc-15', 0);
    const byName = Object.fromEntries(parsed.parameters.map((p) => [p.name, p]));
    assert.strictEqual(byName.name.normalized_value, 'Contratação de crédito');
    assert.strictEqual(byName.produto.normalized_value, 'Crédito parcelado');
    assert.strictEqual(byName.acao.normalized_value, 'Simulação concluída');
    assert.strictEqual(byName.descricao.normalized_value, 'Empréstimo para João');
    assert.strictEqual(byName.mensagem.normalized_value, 'Você está elegível');
  });

  it('Caso 16 — Pipeline completo: HTML do Confluence -> MapReader -> ParameterParser -> objeto persistido (incluindo chaves Unicode e diagnóstico de \uFFFD)', async () => {
    const confluencePageHtml = `
      <table class="confluenceTable">
        <tbody>
          <tr><th>Status</th><td><span class="status-macro">VALIDADO</span></td></tr>
          <tr><th>Instrução</th><td>Clique em Contratar Cr&eacute;dito</td></tr>
          <tr><th>Código de Disparo</th><td>
            <pre>dataLayer.push({
  "event": "Simula&ccedil;&atilde;o_Conclu&iacute;da",
  "name": "Contrata&ccedil;&atilde;o de cr&eacute;dito",
  "mensagem": "Voc&ecirc; est&aacute; eleg&iacute;vel",
  "cidade": "S&atilde;o Paulo",
  "ação": "contrata&ccedil;&atilde;o",
  "descrição": "Cr&eacute;dito f&aacute;cil",
  "url": "https://banco.bradesco/cr&eacute;dito"
});</pre>
          </td></tr>
        </tbody>
      </table>
    `;

    const customReader = new MapReader({
      fetchApi: async () => confluencePageHtml
    });
    const details = await customReader.readMapDetails('999001', 'Créditos', 'Parcelado');
    assert.strictEqual(details.telas.length, 1);

    const screen = details.telas[0];
    assert.strictEqual(screen.status, 'VALIDADO');
    assert.strictEqual(screen.instruction, 'Clique em Contratar Crédito');
    assert.strictEqual(screen.snippets.length, 1);

    const snip = screen.snippets[0];
    assert.strictEqual(snip.event_raw, 'Simulação_Concluída');
    assert.strictEqual(snip.event_normalized, 'simulacaoconcluida');
    assert.ok(snip.raw_code.includes('"name": "Contratação de crédito"'));

    const findParam = (key) => snip.parameters.find((p) => p.name === key);

    assert.strictEqual(findParam('name').raw_value, '"Contratação de crédito"');
    assert.strictEqual(findParam('name').normalized_value, 'Contratação de crédito');
    assert.strictEqual(findParam('mensagem').normalized_value, 'Você está elegível');
    assert.strictEqual(findParam('cidade').normalized_value, 'São Paulo');

    // Chaves Unicode preservadas no original + versão normalizada separada
    assert.ok(findParam('ação'), 'Deve suportar chave Unicode "ação"');
    assert.strictEqual(findParam('ação').name, 'ação');
    assert.strictEqual(findParam('ação').name_raw, 'ação');
    assert.strictEqual(findParam('ação').name_normalized, 'acao');
    assert.strictEqual(findParam('ação').normalized_value, 'contratação');

    assert.ok(findParam('descrição'), 'Deve suportar chave Unicode "descrição"');
    assert.strictEqual(findParam('descrição').name, 'descrição');
    assert.strictEqual(findParam('descrição').name_normalized, 'descricao');
    assert.strictEqual(findParam('descrição').normalized_value, 'Crédito fácil');

    // URL com "//" não pode ser truncada pela remoção de comentários
    assert.strictEqual(findParam('url').normalized_value, 'https://banco.bradesco/crédito');

    // Sumário de parâmetros persistido mantém valores distintos com acentuação original
    const nameSummary = details.parameter_summary.find((p) => p.name === 'name');
    assert.ok(nameSummary);
    assert.deepStrictEqual(nameSummary.distinct_values, ['Contratação de crédito']);

    // Diagnóstico de caractere de substituição \uFFFD sem remoção silenciosa
    const corruptedHtml = `
      <table>
        <tr><th>Status</th><td>NOVO</td></tr>
        <tr><th>Instrução</th><td>Teste caractere perdido</td></tr>
        <tr><th>Código de Disparo</th><td><pre>dataLayer.push({ "event": "teste", "name": "Cr\uFFFDdito \uFFFD" });</pre></td></tr>
      </table>
    `;
    const diagScreens = mapReader.extrairTelas(corruptedHtml, 'map-fffd', 'Créditos', 'Parcelado');
    assert.strictEqual(diagScreens.length, 1);
    const diagSnip = diagScreens[0].snippets[0];
    assert.ok(diagSnip.raw_code.includes('Cr\uFFFDdito \uFFFD'), 'Não deve remover silenciosamente \uFFFD');
    assert.ok(diagSnip.unicode_diagnostics, 'Deve registrar diagnóstico quando \uFFFD estiver presente');
    assert.strictEqual(diagSnip.unicode_diagnostics.mapId, 'map-fffd');
    assert.strictEqual(diagSnip.unicode_diagnostics.screenIndex, 0);
    assert.strictEqual(diagSnip.unicode_diagnostics.snippetIndex, 0);
    assert.strictEqual(diagSnip.unicode_diagnostics.occurrences, 2);
  });

  it('Caso 17 — Serialização JSON.stringify e JSON.parse preservam integralmente os caracteres Unicode', () => {
    const parsed = parser.parseSnippet(
      `dataLayer.push({
  "event": "Simulação_Concluída",
  "name": "Contratação de crédito",
  "valor": "R$ 1.250,00 – aprovação 100%",
  "placeholder": "{{código-produto}}"
});`,
      'map-17',
      'sc-17',
      0
    );

    const serialized = JSON.stringify(parsed, null, 2);
    const restored = JSON.parse(serialized);

    assert.strictEqual(restored.event_raw, 'Simulação_Concluída');
    assert.strictEqual(restored.raw_code, parsed.raw_code);
    assert.deepStrictEqual(restored.parameters, parsed.parameters);
  });

  it('Caso 18 — Busca: valor "Contratação de crédito" é pesquisável com e sem acento, mantendo a grafia original na exibição', () => {
    const snippet = parser.parseSnippet(
      `dataLayer.push({
  "event": "Simulação_Concluída",
  "name": "Contratação de crédito",
  "produto": "Crédito parcelado",
  "acao": "Simulação concluída",
  "descricao": "Empréstimo para João",
  "mensagem": "Você está elegível"
});`,
      'map-18',
      'sc-18',
      0
    );

    const mockArtifacts = [
      {
        id: 'map-18',
        titulo: 'MT - Créditos - Parcelado - Contratação',
        artifact_type: 'MAPA',
        produto: 'Créditos',
        subproduto: 'Parcelado',
        full_path: 'Raiz > Créditos > Parcelado > MT - Créditos - Parcelado - Contratação',
        screens: [
          {
            screen_id: 'sc-18',
            screen_index: 0,
            instruction: 'Tela de Contratação',
            status: 'VALIDADO',
            snippets: [snippet]
          }
        ]
      }
    ];

    artifactSearchEngine.buildIndex(mockArtifacts);

    // 1. Busca estruturada de parâmetros COM acento
    const resWithAccent = artifactSearchEngine.searchParameters(
      [{ field: 'valor', operator: 'igual', value: 'Contratação de crédito' }],
      'AND',
      'SNIPPET'
    );
    assert.strictEqual(resWithAccent.length, 1);
    assert.ok(
      resWithAccent[0].matchedValues.includes('name = "Contratação de crédito"'),
      `Valor exibido deve preservar acentos: ${JSON.stringify(resWithAccent[0].matchedValues)}`
    );

    // 2. Busca estruturada de parâmetros SEM acento
    const resWithoutAccent = artifactSearchEngine.searchParameters(
      [{ field: 'valor', operator: 'igual', value: 'contratacao de credito' }],
      'AND',
      'SNIPPET'
    );
    assert.strictEqual(resWithoutAccent.length, 1);
    assert.ok(
      resWithoutAccent[0].matchedValues.includes('name = "Contratação de crédito"'),
      `Valor exibido mesmo buscando sem acento deve preservar a grafia original: ${JSON.stringify(resWithoutAccent[0].matchedValues)}`
    );

    // 3. Busca avançada de código/parâmetros com e sem acento
    const codeSearchWithAccent = artifactSearchEngine.searchCodeAndParameters('name: "Contratação de crédito"');
    assert.strictEqual(codeSearchWithAccent.completeGroups.length, 1);
    assert.ok(codeSearchWithAccent.completeGroups[0].occurrences[0].rawCodeFull.includes('Contratação de crédito'));

    const codeSearchWithoutAccent = artifactSearchEngine.searchCodeAndParameters('name: "contratacao de credito"');
    assert.strictEqual(codeSearchWithoutAccent.completeGroups.length, 1);
    assert.ok(codeSearchWithoutAccent.completeGroups[0].occurrences[0].rawCodeFull.includes('Contratação de crédito'));

    // 4. Sugestões de autocomplete retornam a grafia original com acento
    const suggestions = artifactSearchEngine.getSuggestions('valor', 'contratacao');
    assert.ok(suggestions.includes('Contratação de crédito'));
  });
});
