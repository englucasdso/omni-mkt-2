/**
 * generateMockInventory.js
 *
 * Gera um inventário FICTÍCIO com a mesma estrutura do Confluence corporativo
 * (Raiz → Produto → Subproduto → [agrupadores] → Mapas/Documentação) e o passa
 * pelo pipeline REAL do OMNI: TreeCrawler → MapReader → ParameterParser →
 * MeasurementClassifier → classifyTree → InventoryRepository.
 *
 * Nenhum dado real é usado. Os IDs, nomes, responsáveis e snippets são inventados.
 * O resultado é determinístico (PRNG com semente fixa).
 *
 * Uso:
 *   npx tsx backend/scripts/generateMockInventory.js            → grava backend/data/inventario.json
 *   npx tsx backend/scripts/generateMockInventory.js --out x.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { ConfluenceOrchestrator } from '../src/integrations/confluence/confluenceOrchestrator.js';

// ── PRNG determinístico ─────────────────────────────────────────────
let seed = 20261109;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
const weighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
  return pairs[pairs.length - 1][0];
};
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// ── Taxonomia fictícia ──────────────────────────────────────────────
const TAXONOMY = {
  'Cartões': {
    'Cartão de Crédito': ['Contratação', 'Desbloqueio', 'Fatura', 'Limite'],
    'Cartão de Débito': ['Solicitação', 'Bloqueio'],
    'Programa de Pontos': ['Resgate', 'Extrato de Pontos'],
  },
  'Conta Corrente': {
    'Abertura de Conta': ['Pessoa Física', 'Pessoa Jurídica', 'Onboarding'],
    'Cadastro': ['Atualização Cadastral', 'Biometria'],
    'Extrato': ['Consulta', 'Exportação'],
  },
  'Créditos': {
    'Consignado': ['Contratação', 'Portabilidade', 'Refinanciamento INSS'],
    'Crédito Pessoal': ['Simulação', 'Contratação'],
    'Pós Venda': ['Antecipação de Parcelas', 'Renegociação'],
  },
  'Investimentos': {
    'Renda Fixa': ['CDB', 'Tesouro Direto', 'LCI e LCA'],
    'Fundos': ['Aplicação', 'Resgate'],
    'Previdência': ['Contratação', 'Portabilidade'],
  },
  'Pix e Pagamentos': {
    'Pix': ['Transferência', 'Pix Agendado', 'Chaves Pix'],
    'Boletos': ['Pagamento', 'DDA'],
  },
  'Financiamentos': {
    'Imobiliário': ['Simulação', 'Proposta', 'Acompanhamento'],
    'Veículos': ['Simulação', 'Contratação'],
  },
  'Consórcio': {
    'Consórcio Imóvel': ['Adesão', 'Lance', 'Contemplação'],
    'Consórcio Auto': ['Adesão', 'Lance'],
  },
  'Empresas': {
    'Capital de Giro': ['Simulação', 'Contratação'],
    'Maquininha': ['Credenciamento', 'Antecipação de Recebíveis'],
    'Folha de Pagamento': ['Cadastro de Funcionários', 'Envio de Arquivo'],
  },
  'Câmbio': {
    'Remessa Internacional': ['Envio', 'Recebimento'],
    'Conta Global': ['Abertura', 'Recarga'],
  },
  'Seguros': {
    'Seguro Residencial': ['Cotação', 'Contratação'],
    'Seguro Auto': ['Cotação', 'Sinistro'],
    'Seguro de Vida': ['Contratação'],
  },
};

const RESPONSAVEIS = ['Ana Ribeiro', 'Bruno Tavares', 'Carla Menezes', 'Diego Arantes', 'Elisa Moura', 'Felipe Nogueira', 'Gabriela Lins', 'Henrique Prado', ''];
const SCREEN_STEPS = ['Tela inicial', 'Simulação', 'Escolha de valores', 'Revisão dos dados', 'Termos e condições', 'Confirmação', 'Comprovante', 'Erro de validação', 'Token de segurança'];
const ELEMENTS = [['botao', 'Continuar'], ['botao', 'Contratar agora'], ['link', 'Ver condições'], ['botao', 'Voltar'], ['toggle', 'Aceito os termos'], ['card', 'Opção recomendada']];

// ── Snippets ────────────────────────────────────────────────────────
function ga4Snippet(ctx, step, index) {
  const tipoPessoa = ctx.tipoPessoa;
  if (rand() < 0.45) {
    return `dataLayer.push({
  event: 'screen_view',
  screen: {
    name: '${ctx.base}:${slug(step)}',
    path: '/${ctx.base.replace(/:/g, '/')}/${slug(step)}'
  },
  product: {
    name: '${ctx.subproduto.toLowerCase()}',
    flow: '${ctx.fluxo.toLowerCase()}',
    segment: '${ctx.segmento}'
  },
  user: {
    user_id: '{{user_id}}',
    tipo_pessoa: '${tipoPessoa}'
  }
});`;
  }
  const [type, text] = pick(ELEMENTS);
  const extra = rand() < 0.3 ? `,\n    value: '${pick(['R$ 1.500,00', 'R$ 25.000,00', 'R$ 320,90'])}'` : '';
  return `dataLayer.push({
  event: 'ga_event',
  ga_event: {
    name: 'clique',
    element: '${type}',
    text: '${text}'${extra}
  },
  screen: {
    name: '${ctx.base}:${slug(step)}'
  },
  product: {
    name: '${ctx.subproduto.toLowerCase()}',
    flow: '${ctx.fluxo.toLowerCase()}'
  },
  user: {
    user_id: '{{user_id}}',
    tipo_pessoa: '${tipoPessoa}'
  },
  index: '${index + 1}'
});`;
}

function ga3Snippet(ctx, step) {
  if (rand() < 0.5) {
    return `dataLayer.push({
  'event': 'virtual_pageview',
  'page_path': '/${ctx.base.replace(/:/g, '/')}/${slug(step)}',
  'eventCategory': '${ctx.base}',
  'eventAction': 'pageview',
  'eventLabel': '${slug(step)}'
});`;
  }
  const [, text] = pick(ELEMENTS);
  return `dataLayer.push({
  'event': 'event',
  'eventCategory': '${ctx.base}:${slug(step)}',
  'eventAction': 'clique',
  'eventLabel': 'botao:${slug(text)}',
  'tipo_pessoa': '${ctx.tipoPessoa}'
});`;
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function mapHtml(ctx) {
  const kind = ctx.kind; // GA4 | GA3 | HIBRIDO
  const screensCount = between(2, 7);
  const steps = [...SCREEN_STEPS].sort(() => rand() - 0.5).slice(0, screensCount);
  const maturity = rand();
  const header = `
  <table class="confluenceTable">
    <tr><th>Produto / Serviço</th><td>${ctx.subproduto}</td></tr>
    <tr><th>Nº da Task</th><td>MKT-${between(1000, 9999)}</td></tr>
    <tr><th>Figma / XD</th><td>https://figma.com/file/mock-${ctx.id}</td></tr>
    <tr><th>Propriedade GA4/Stream ID</th><td>G-MOCK${between(100000, 999999)}</td></tr>
    <tr><th>GTM ID</th><td>GTM-MOCK${between(100, 999)}</td></tr>
    <tr><th>Status</th><td><span class="status-macro" data-macro-name="status">${ctx.declared}</span></td></tr>
  </table>`;

  const screens = steps.map((step, i) => {
    const status = weighted(
      maturity > 0.6
        ? [['VALIDADO', 85], ['CORREÇÃO', 8], ['NOVO', 5], ['DESCONTINUAR', 2]]
        : maturity > 0.25
          ? [['VALIDADO', 45], ['CORREÇÃO', 25], ['NOVO', 25], ['EXCLUIR', 5]]
          : [['NOVO', 55], ['CORREÇÃO', 30], ['VALIDADO', 10], ['EXCLUIR', 5]]
    );
    const useGa3 = kind === 'GA3' || (kind === 'HIBRIDO' && i % 2 === 1);
    const snippetsCount = rand() < 0.2 ? 2 : 1;
    const codes = Array.from({ length: snippetsCount }, (_, k) =>
      `<pre>${escapeHtml(useGa3 ? ga3Snippet(ctx, step) : ga4Snippet(ctx, step, i + k))}</pre>`
    ).join('');
    return `
  <table class="confluenceTable">
    <tr><th>Status</th><td><span class="status-macro" data-macro-name="status">${status}</span></td></tr>
    <tr><th>Tela</th><td>${step} — ${ctx.fluxo}</td></tr>
    ${rand() < 0.6 ? `<tr><th>Evidência</th><td><img src="/download/attachments/${ctx.id}/tela-${i + 1}.png" alt="Evidência"></td></tr>` : ''}
    <tr><th>Instrução</th><td>Disparar ao ${i === 0 ? 'carregar a tela' : 'interagir com o elemento principal'} da etapa "${step}" de ${ctx.fluxo.toLowerCase()} em ${ctx.subproduto}.</td></tr>
    <tr><th>Código de Disparo</th><td>${codes}</td></tr>
  </table>`;
  }).join('');

  return `<div id="main-content">${header}${screens}</div>`;
}

function docHtml(title) {
  return `<div id="main-content">
  <h1>${title}</h1>
  <p>Esta página reúne orientações de governança de mensuração para o time de Martech: nomenclatura de eventos, padrões de parâmetros e o processo de homologação das telas.</p>
  <p>Antes de publicar um novo mapa, valide a especificação com o responsável do produto e registre a evidência visual de cada tela. Parâmetros com acentuação (contratação, crédito, pessoa física) devem ser preservados exatamente como especificados.</p>
  <ul><li>Revisão trimestral dos mapas legados (Universal Analytics).</li><li>Migração progressiva para o esquema GA4.</li></ul>
</div>`;
}

// ── Árvore ──────────────────────────────────────────────────────────
let nextId = 880000000;
const newId = () => String(nextId += between(7, 997));
const tree = {};
const pageMeta = {};
const htmlById = {};

const ROOT = 'mock-root';
tree[ROOT] = { title: 'Mapas de Mensuração Digital (MOCK)', children: [] };

const addPage = (parentId, title, meta = {}) => {
  const id = newId();
  tree[id] = { title, children: [] };
  tree[parentId].children.push({ id, title });
  pageMeta[id] = {
    version: between(1, 24),
    author: pick(RESPONSAVEIS),
    when: new Date(Date.UTC(2024, 0, 1) + Math.floor(rand() * 1000 * 86400000 * 1.0)).toISOString(),
    ...meta
  };
  return id;
};

for (const [produto, subs] of Object.entries(TAXONOMY)) {
  const prodId = addPage(ROOT, produto);
  htmlById[prodId] = docHtml(produto);
  for (const [subproduto, fluxos] of Object.entries(subs)) {
    const subId = addPage(prodId, subproduto);
    htmlById[subId] = docHtml(subproduto);

    // Alguns subprodutos têm agrupadores intermediários (nível 4 = Nó)
    const useGroups = rand() < 0.4;
    const groups = useGroups ? ['Jornada Web', 'Jornada App'] : [null];
    for (const group of groups) {
      const parentForMaps = group ? addPage(subId, `${subproduto} — ${group}`) : subId;
      for (const fluxo of fluxos) {
       const canais = group
         ? [group.replace('Jornada ', '')]
         : ['Web', 'App', 'Internet Banking'].sort(() => rand() - 0.5).slice(0, between(1, 3));
       for (const canal of canais) {
        const kind = weighted([['GA4', 55], ['GA3', 30], ['HIBRIDO', 15]]);
        const title = `MT ${subproduto} — ${fluxo} (${canal})`;
        const mapId = addPage(parentForMaps, title);
        const ctx = {
          id: mapId,
          kind,
          subproduto,
          fluxo,
          segmento: pick(['varejo', 'prime', 'private', 'empresas']),
          tipoPessoa: /Jurídica|empresas/i.test(fluxo) ? 'PJ' : pick(['PF', 'PF', 'PJ']),
          base: `${slug(produto)}:${slug(subproduto)}:${slug(fluxo)}`,
          declared: pick(['VALIDADO', 'NOVO', 'CORREÇÃO', 'EM HOMOLOGAÇÃO'])
        };
        htmlById[mapId] = mapHtml(ctx);

        // Versões legadas (Universal Analytics) que ainda convivem na árvore
        if (rand() < 0.35) {
          const legacyId = addPage(parentForMaps, `${title} — legado UA`);
          htmlById[legacyId] = mapHtml({ ...ctx, id: legacyId, kind: 'GA3', declared: pick(['DESCONTINUAR', 'VALIDADO', 'CORREÇÃO']) });
        }
       }
      }
    }

    // Documentação de apoio em alguns subprodutos
    if (rand() < 0.45) {
      const docId = addPage(subId, `Guia de mensuração — ${subproduto}`);
      htmlById[docId] = docHtml(`Guia de mensuração — ${subproduto}`);
    }
  }
}

// ── Transporte simulado (mesmo contrato do Confluence REST) ─────────
const pageResponse = (id) => {
  const node = tree[id];
  const meta = pageMeta[id] || { version: 1, author: 'Martech', when: '2024-01-01T00:00:00.000Z' };
  return {
    id,
    title: node.title,
    version: { number: meta.version, by: { displayName: meta.author } },
    history: { lastUpdated: { when: meta.when } },
    space: { name: 'Martech (mock)', key: 'MOCK' },
    _links: { webui: `/pages/viewpage.action?pageId=${id}` }
  };
};

const transport = {
  isCancelled: false,
  cancel() { this.isCancelled = true; },
  checkRoot: async () => ({ results: [] }),
  fetchApi: async (endpoint) => {
    const child = endpoint.match(/\/rest\/api\/content\/([^/?]+)\/child\/page/);
    if (child) {
      const node = tree[child[1]];
      return { results: (node?.children || []).map((c) => pageResponse(c.id)) };
    }
    const view = endpoint.match(/pageId=([^&]+)/);
    if (view) return htmlById[view[1]] || docHtml(tree[view[1]]?.title || 'Página');
    const page = endpoint.match(/\/rest\/api\/content\/([^/?]+)/);
    if (page) return pageResponse(page[1]);
    return { results: [] };
  }
};

let rows = [];
const repository = {
  getInventory: () => [],
  saveSafely: (items) => { rows = items; }
};

const outArg = process.argv.indexOf('--out');
const outPath = path.resolve(process.cwd(), outArg > -1 ? process.argv[outArg + 1] : 'backend/data/inventario.json');

const orchestrator = new ConfluenceOrchestrator({ transport, repository });
await orchestrator.run(ROOT, null, { mode: 'full', forceRefresh: true });

// Links fictícios: nunca apontar para o Confluence corporativo no mock
for (const r of rows) {
  r.link = `https://confluence.example.com/pages/viewpage.action?pageId=${r.id}`;
}

fs.writeFileSync(outPath, JSON.stringify(rows, null, 2), 'utf-8');

const count = (key) => rows.reduce((acc, r) => ((acc[r[key]] = (acc[r[key]] || 0) + 1), acc), {});
console.log(`\n[mock] ${rows.length} artefatos gravados em ${path.relative(process.cwd(), outPath)}`);
console.log('[mock] artifact_type:', count('artifact_type'));
console.log('[mock] measurement_class:', count('measurement_class'));
