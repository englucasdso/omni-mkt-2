import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveCanonicalTaxonomy, classifyTree } from '../src/services/classification/treeClassifier.js';
import { resolveArtifactTaxonomy } from '../../frontend/src/utils/taxonomyResolver.ts';

/**
 * Regra canônica (decisão de produto, nov/2026):
 * - depth 0 = Raiz
 * - depth 1 = Produto  → sempre NO
 * - depth 2 = Subproduto → sempre NO
 * - depth 3+ = descendentes; MAPA quando há telas + snippets válidos
 *
 * A taxonomia é calculada uma única vez no backend (resolveCanonicalTaxonomy / classifyTree).
 * O frontend (resolveArtifactTaxonomy) apenas adapta os campos canônicos para a UI.
 */

const root = { id: 'root', titulo: 'Hub de Artefatos', depth: 0, ancestor_ids: [], ancestor_titles: [] };
const creditos = { id: 'prod-creditos', titulo: 'Créditos', depth: 1, parent_id: 'root', ancestor_ids: ['root'], ancestor_titles: ['Hub de Artefatos'] };
const consignado = { id: 'sub-consignado', titulo: 'Consignado', depth: 2, parent_id: 'prod-creditos', ancestor_ids: ['root', 'prod-creditos'], ancestor_titles: ['Hub de Artefatos', 'Créditos'] };

const validScreens = [{ screen_index: 0, status: 'VALIDADO', snippets: [{ raw_code: "dataLayer.push({ event: 'click' })", measurement_class: 'GA4' }] }];

describe('Taxonomia canônica (backend)', () => {
  it('1. Mapa filho direto de subproduto: Produto e Subproduto corretos, sem caminho descendente', () => {
    const mapa = {
      id: 'map-1', titulo: 'Contratação Consignado', artifact_type: 'MAPA', depth: 3,
      parent_id: 'sub-consignado',
      ancestor_ids: ['root', 'prod-creditos', 'sub-consignado'],
      ancestor_titles: ['Hub de Artefatos', 'Créditos', 'Consignado']
    };
    const rowMap = new Map([[root.id, root], [creditos.id, creditos], [consignado.id, consignado], [mapa.id, mapa]]);
    const res = resolveCanonicalTaxonomy(mapa, rowMap, 'root');
    assert.equal(res.produto, 'Créditos');
    assert.equal(res.produto_id, 'prod-creditos');
    assert.equal(res.subproduto, 'Consignado');
    assert.equal(res.subproduto_id, 'sub-consignado');
    assert.deepEqual(res.descendant_path_titles, []);
  });

  it('2. Mapa profundo: descendentes entre subproduto e mapa formam o caminho', () => {
    const mapa = {
      id: 'map-checkout', titulo: 'MT Checkout', artifact_type: 'MAPA', depth: 4,
      ancestor_ids: ['root', 'prod-creditos', 'sub-posvenda', 'desc-parcelado'],
      ancestor_titles: ['Hub de Artefatos', 'Créditos', 'Pós Venda', 'Parcelado']
    };
    const res = resolveCanonicalTaxonomy(mapa, new Map(), 'root');
    assert.equal(res.produto, 'Créditos');
    assert.equal(res.subproduto, 'Pós Venda');
    assert.deepEqual(res.descendant_path_titles, ['Parcelado']);
    assert.deepEqual(res.descendant_path_ids, ['desc-parcelado']);
  });

  it('3. Raiz nunca recebe produto', () => {
    const res = resolveCanonicalTaxonomy(root, new Map(), 'root');
    assert.equal(res.produto, '');
    assert.equal(res.produto_id, null);
  });

  it('4. Subprodutos homônimos em produtos diferentes mantêm chaves distintas', () => {
    const mapaA = { id: 'map-a', titulo: 'Cadastro CC', artifact_type: 'MAPA', depth: 3, ancestor_ids: ['root', 'prod-a', 'sub-cad-a'], ancestor_titles: ['Hub', 'Conta Corrente', 'Cadastro'] };
    const mapaB = { id: 'map-b', titulo: 'Cadastro Cartões', artifact_type: 'MAPA', depth: 3, ancestor_ids: ['root', 'prod-b', 'sub-cad-b'], ancestor_titles: ['Hub', 'Cartões', 'Cadastro'] };
    const a = resolveCanonicalTaxonomy(mapaA, new Map(), 'root');
    const b = resolveCanonicalTaxonomy(mapaB, new Map(), 'root');
    assert.equal(a.subproduto, 'Cadastro');
    assert.equal(b.subproduto, 'Cadastro');
    assert.notEqual(a.subproduto_id, b.subproduto_id);
    assert.notEqual(a.produto_id, b.produto_id);
  });

  it('5. Campo legado com o nome da raiz em produto é rejeitado', () => {
    const legado = { id: 'map-legado', titulo: 'Mapa Legado', artifact_type: 'MAPA', produto: 'Hub de Artefatos', subproduto: 'Consignado' };
    const rowMap = new Map([[root.id, root], [legado.id, legado]]);
    const res = resolveCanonicalTaxonomy(legado, rowMap, 'root');
    assert.equal(res.produto, '');
    assert.equal(res.subproduto, '');
  });

  it('6. Níveis 1 e 2 são sempre NO, mesmo com telas e snippets; nível 3+ com conteúdo é MAPA', () => {
    const produtoComSnippet = { ...creditos, screens: validScreens };
    const subComSnippet = { ...consignado, screens: validScreens };
    const mapa = {
      id: 'map-1', titulo: 'Contratação', depth: 3,
      ancestor_ids: ['root', 'prod-creditos', 'sub-consignado'],
      ancestor_titles: ['Hub de Artefatos', 'Créditos', 'Consignado'],
      screens: validScreens
    };
    const out = classifyTree([root, produtoComSnippet, subComSnippet, mapa], 'root');
    const byId = new Map(out.map((r) => [String(r.id), r]));
    assert.equal(byId.get('root').artifact_type, 'RAIZ');
    assert.equal(byId.get('prod-creditos').artifact_type, 'NO');
    assert.equal(byId.get('sub-consignado').artifact_type, 'NO');
    assert.equal(byId.get('map-1').artifact_type, 'MAPA');
    assert.equal(byId.get('map-1').produto, 'Créditos');
    assert.equal(byId.get('map-1').subproduto, 'Consignado');
  });
});

describe('Adaptador de taxonomia (frontend)', () => {
  it('7. Usa os campos canônicos do backend sem recalcular', () => {
    const res = resolveArtifactTaxonomy({
      id: 'map-1', titulo: 'X', artifact_type: 'MAPA', depth: 4,
      produto: 'Créditos', produto_id: 'prod-creditos',
      subproduto: 'Pós Venda', subproduto_id: 'sub-posvenda',
      descendant_path_ids: ['desc-parcelado'], descendant_path_titles: ['Parcelado']
    });
    assert.equal(res.product?.name, 'Créditos');
    assert.equal(res.productKey, 'prod-creditos');
    assert.equal(res.subproduct?.name, 'Pós Venda');
    assert.equal(res.displayPath, 'Pós Venda › Parcelado');
  });

  it('8. Raiz e itens sem produto caem em SEM_PRODUTO', () => {
    assert.equal(resolveArtifactTaxonomy({ id: 'r', titulo: 'Hub', artifact_type: 'RAIZ', depth: 0 }).productKey, 'SEM_PRODUTO');
    const semProduto = resolveArtifactTaxonomy({ id: 'x', titulo: 'Solto', artifact_type: 'MAPA', depth: 3, produto: 'Sem Produto' });
    assert.equal(semProduto.product, null);
    assert.equal(semProduto.subproductKey, 'SEM_SUBPRODUTO');
  });
});

describe('Inventário versionado', () => {
  it('9. Todos os mapas resolvem taxonomia, há múltiplos produtos e a raiz nunca é produto', () => {
    const invPath = path.resolve(process.cwd(), 'backend/data/inventario.json');
    if (!fs.existsSync(invPath)) return;
    const data = JSON.parse(fs.readFileSync(invPath, 'utf8'));
    const items = Array.isArray(data) ? data : data.resultados || [];
    const roots = new Set(items.filter((i) => i.artifact_type === 'RAIZ').map((i) => String(i.titulo).toLowerCase()));
    const products = new Set();
    for (const item of items) {
      if (item.artifact_type !== 'MAPA') continue;
      const res = resolveArtifactTaxonomy(item);
      assert.equal(typeof res.productKey, 'string');
      if (res.product) products.add(res.product.name);
      assert.equal(roots.has(String(res.product?.name || '').toLowerCase()), false);
    }
    assert.ok(products.size > 1, 'Deve conter mais de um produto distinto');
  });
});
