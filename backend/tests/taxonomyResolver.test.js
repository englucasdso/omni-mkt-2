import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveArtifactTaxonomy } from '../../frontend/src/utils/taxonomyResolver.ts';
import fs from 'node:fs';
import path from 'node:path';

describe('Resolução de Taxonomia Estrutural da Árvore', () => {
  it('1. Raiz → Créditos → Mapa: Produto: Créditos', () => {
    const root = { id: 'root', titulo: 'Home', artifact_type: 'RAIZ', depth: 0 };
    const creditos = { id: 'prod-creditos', titulo: 'Créditos', artifact_type: 'NO', depth: 1, parent_id: 'root' };
    const mapa = {
      id: 'map-direto',
      titulo: 'Visão Geral de Créditos',
      artifact_type: 'MAPA',
      depth: 2,
      parent_id: 'prod-creditos',
      ancestor_ids: ['root', 'prod-creditos'],
      ancestor_titles: ['Home', 'Créditos']
    };

    const artifactsById = new Map([
      ['root', root],
      ['prod-creditos', creditos],
      ['map-direto', mapa]
    ]);

    const res = resolveArtifactTaxonomy(mapa, artifactsById);

    assert.equal(res.product?.name, 'Créditos');
    assert.equal(res.product?.id, 'prod-creditos');
    assert.equal(res.productKey, 'prod-creditos');
    assert.equal(res.subproduct, null);
    assert.equal(res.subproductKey, 'SEM_SUBPRODUTO');
    assert.equal(res.displayPath, '');
    assert.equal(res.descendantPath.length, 0);
  });

  it('2. Raiz → Créditos → Consignado → Mapa: Produto: Créditos, Subproduto: Consignado', () => {
    const root = { id: 'root', titulo: 'Home', artifact_type: 'RAIZ', depth: 0 };
    const creditos = { id: 'prod-creditos', titulo: 'Créditos', artifact_type: 'NO', depth: 1, parent_id: 'root' };
    const consignado = { id: 'sub-consignado', titulo: 'Consignado', artifact_type: 'NO', depth: 2, parent_id: 'prod-creditos' };
    const mapa = {
      id: 'map-1',
      titulo: 'Contratação Consignado',
      artifact_type: 'MAPA',
      depth: 3,
      parent_id: 'sub-consignado',
      ancestor_ids: ['root', 'prod-creditos', 'sub-consignado'],
      ancestor_titles: ['Home', 'Créditos', 'Consignado']
    };

    const artifactsById = new Map([
      ['root', root],
      ['prod-creditos', creditos],
      ['sub-consignado', consignado],
      ['map-1', mapa]
    ]);

    const res = resolveArtifactTaxonomy(mapa, artifactsById);

    assert.equal(res.product?.name, 'Créditos');
    assert.equal(res.product?.id, 'prod-creditos');
    assert.equal(res.productKey, 'prod-creditos');
    assert.equal(res.subproduct?.name, 'Consignado');
    assert.equal(res.subproduct?.id, 'sub-consignado');
    assert.equal(res.subproductKey, 'sub-consignado');
    assert.equal(res.displayPath, 'Consignado');
    assert.equal(res.descendantPath.length, 1);
  });

  it('3. Raiz → Créditos → Pós Venda → Parcelado → Mapa: Produto: Créditos, Caminho: Pós Venda › Parcelado', () => {
    const root = { id: 'root', titulo: 'Hub de Artefatos', artifact_type: 'RAIZ', depth: 0 };
    const creditos = { id: 'prod-creditos', titulo: 'Créditos', artifact_type: 'NO', depth: 1, parent_id: 'root' };
    const posVenda = { id: 'sub-posvenda', titulo: 'Pós Venda', artifact_type: 'NO', depth: 2, parent_id: 'prod-creditos' };
    const parcelado = { id: 'desc-parcelado', titulo: 'Parcelado', artifact_type: 'NO', depth: 3, parent_id: 'sub-posvenda' };
    const mapa = {
      id: 'map-checkout',
      titulo: 'MT Checkout',
      artifact_type: 'MAPA',
      depth: 4,
      parent_id: 'desc-parcelado',
      ancestor_ids: ['root', 'prod-creditos', 'sub-posvenda', 'desc-parcelado'],
      ancestor_titles: ['Hub de Artefatos', 'Créditos', 'Pós Venda', 'Parcelado']
    };

    const artifactsById = new Map([
      ['root', root],
      ['prod-creditos', creditos],
      ['sub-posvenda', posVenda],
      ['desc-parcelado', parcelado],
      ['map-checkout', mapa]
    ]);

    const res = resolveArtifactTaxonomy(mapa, artifactsById);

    assert.equal(res.product?.name, 'Créditos');
    assert.equal(res.product?.id, 'prod-creditos');
    assert.equal(res.subproduct?.name, 'Pós Venda');
    assert.equal(res.subproduct?.id, 'sub-posvenda');
    assert.equal(res.descendantPath.length, 2);
    assert.equal(res.descendantPath[0].name, 'Pós Venda');
    assert.equal(res.descendantPath[1].name, 'Parcelado');
    assert.equal(res.displayPath, 'Pós Venda › Parcelado');
  });

  it('4. Raiz → Mapa: Produto: Sem Produto. A raiz não pode aparecer como produto', () => {
    const root = { id: 'root', titulo: 'Home', artifact_type: 'RAIZ', depth: 0 };
    const mapa = {
      id: 'map-raiz',
      titulo: 'Mapa Solto na Raiz',
      artifact_type: 'MAPA',
      depth: 1,
      parent_id: 'root',
      ancestor_ids: ['root'],
      ancestor_titles: ['Home']
    };

    const artifactsById = new Map([
      ['root', root],
      ['map-raiz', mapa]
    ]);

    const res = resolveArtifactTaxonomy(mapa, artifactsById);

    assert.equal(res.product, null);
    assert.equal(res.productKey, 'SEM_PRODUTO');
    assert.equal(res.subproduct, null);
    assert.equal(res.subproductKey, 'SEM_SUBPRODUTO');
    assert.equal(res.displayPath, '');
    assert.notEqual(res.product?.name, 'Home');
    assert.notEqual(res.product?.name, 'Mapa Solto na Raiz');
  });

  it('5. Dois produtos diferentes abaixo da mesma raiz: Devem gerar dois grupos diferentes', () => {
    const root = { id: 'root', titulo: 'Home', artifact_type: 'RAIZ', depth: 0 };
    const prodA = { id: 'prod-a', titulo: 'Créditos', artifact_type: 'NO', depth: 1, parent_id: 'root' };
    const prodB = { id: 'prod-b', titulo: 'Investimentos', artifact_type: 'NO', depth: 1, parent_id: 'root' };
    const mapaA = {
      id: 'map-a',
      titulo: 'Mapa Créditos',
      artifact_type: 'MAPA',
      parent_id: 'prod-a'
    };
    const mapaB = {
      id: 'map-b',
      titulo: 'Mapa Investimentos',
      artifact_type: 'MAPA',
      parent_id: 'prod-b'
    };

    const artifactsById = new Map([
      ['root', root],
      ['prod-a', prodA],
      ['prod-b', prodB],
      ['map-a', mapaA],
      ['map-b', mapaB]
    ]);

    const resA = resolveArtifactTaxonomy(mapaA, artifactsById);
    const resB = resolveArtifactTaxonomy(mapaB, artifactsById);

    assert.equal(resA.product?.name, 'Créditos');
    assert.equal(resB.product?.name, 'Investimentos');
    assert.equal(resA.productKey, 'prod-a');
    assert.equal(resB.productKey, 'prod-b');
    assert.notEqual(resA.productKey, resB.productKey);
  });

  it('6. Dois subprodutos homônimos em produtos diferentes: Não podem ser misturados', () => {
    const root = { id: 'root', titulo: 'Home', artifact_type: 'RAIZ', depth: 0 };
    const prodA = { id: 'prod-a', titulo: 'Conta Corrente', artifact_type: 'NO', depth: 1, parent_id: 'root' };
    const subA = { id: 'sub-cadastro-a', titulo: 'Cadastro', artifact_type: 'NO', depth: 2, parent_id: 'prod-a' };
    const mapaA = {
      id: 'map-a',
      titulo: 'Mapa Cadastro CC',
      artifact_type: 'MAPA',
      depth: 3,
      parent_id: 'sub-cadastro-a'
    };

    const prodB = { id: 'prod-b', titulo: 'Cartões', artifact_type: 'NO', depth: 1, parent_id: 'root' };
    const subB = { id: 'sub-cadastro-b', titulo: 'Cadastro', artifact_type: 'NO', depth: 2, parent_id: 'prod-b' };
    const mapaB = {
      id: 'map-b',
      titulo: 'Mapa Cadastro Cartões',
      artifact_type: 'MAPA',
      depth: 3,
      parent_id: 'sub-cadastro-b'
    };

    const artifactsById = new Map([
      ['root', root],
      ['prod-a', prodA],
      ['sub-cadastro-a', subA],
      ['map-a', mapaA],
      ['prod-b', prodB],
      ['sub-cadastro-b', subB],
      ['map-b', mapaB]
    ]);

    const resA = resolveArtifactTaxonomy(mapaA, artifactsById);
    const resB = resolveArtifactTaxonomy(mapaB, artifactsById);

    assert.equal(resA.product?.name, 'Conta Corrente');
    assert.equal(resB.product?.name, 'Cartões');
    assert.equal(resA.subproduct?.name, 'Cadastro');
    assert.equal(resB.subproduct?.name, 'Cadastro');
    assert.notEqual(resA.subproductKey, resB.subproductKey);
    assert.equal(resA.subproductKey, 'sub-cadastro-a');
    assert.equal(resB.subproductKey, 'sub-cadastro-b');
  });

  it('7. Ciclo acidental em parent_id: O resolvedor deve finalizar sem travar', () => {
    const nodeA = { id: 'node-a', titulo: 'Nó A', parent_id: 'node-b' };
    const nodeB = { id: 'node-b', titulo: 'Nó B', parent_id: 'node-a' };
    const mapa = {
      id: 'map-ciclo',
      titulo: 'Mapa com Ciclo',
      artifact_type: 'MAPA',
      parent_id: 'node-a'
    };

    const artifactsById = new Map([
      ['node-a', nodeA],
      ['node-b', nodeB],
      ['map-ciclo', mapa]
    ]);

    // Não deve travar em loop infinito
    const res = resolveArtifactTaxonomy(mapa, artifactsById);
    assert.ok(res);
    assert.ok(typeof res.productKey === 'string');
  });

  it('8. Ausência de parent_id, mas presença de ancestor_ids e ancestor_titles: Deve usar corretamente o fallback estrutural', () => {
    const mapa = {
      id: 'map-fallback',
      titulo: 'Mapa sem parent_id',
      artifact_type: 'MAPA',
      ancestor_ids: ['root', 'prod-creditos', 'sub-posvenda', 'desc-parcelado'],
      ancestor_titles: ['Home', 'Créditos', 'Pós Venda', 'Parcelado']
    };

    const artifactsById = new Map([
      ['map-fallback', mapa]
    ]);

    const res = resolveArtifactTaxonomy(mapa, artifactsById);

    // O índice 0 ('Home') foi descartado.
    // O índice 1 ('Créditos') é o produto (depth 1).
    // O índice 2 ('Pós Venda') é o subproduto (depth 2).
    // O índice 3 ('Parcelado') é descendente.
    assert.equal(res.product?.name, 'Créditos');
    assert.equal(res.product?.id, 'prod-creditos');
    assert.equal(res.subproduct?.name, 'Pós Venda');
    assert.equal(res.subproduct?.id, 'sub-posvenda');
    assert.equal(res.displayPath, 'Pós Venda › Parcelado');
    assert.notEqual(res.product?.name, 'Home');
  });

  it('9. Campos legados contendo o nome da raiz em produto: Devem ser rejeitados', () => {
    const root = { id: 'root', titulo: 'Hub de Artefatos', artifact_type: 'RAIZ', depth: 0 };
    const mapaLegado = {
      id: 'map-legado',
      titulo: 'Mapa Legado com Raiz no Produto',
      artifact_type: 'MAPA',
      produto: 'Hub de Artefatos', // Nome da raiz!
      subproduto: 'Consignado'
    };

    const artifactsById = new Map([
      ['root', root],
      ['map-legado', mapaLegado]
    ]);

    const res = resolveArtifactTaxonomy(mapaLegado, artifactsById);

    assert.equal(res.product, null);
    assert.equal(res.productKey, 'SEM_PRODUTO');
    assert.equal(res.subproduct, null);
    assert.equal(res.subproductKey, 'SEM_SUBPRODUTO');
    assert.equal(res.displayPath, '');
    assert.notEqual(res.product?.name, 'Hub de Artefatos');
  });

  it('10. Validação no inventario.json atual: resolve sem quebras e agrupa em múltiplos produtos', () => {
    const invPath = path.resolve(process.cwd(), 'backend/data/inventario.json');
    if (fs.existsSync(invPath)) {
      const data = JSON.parse(fs.readFileSync(invPath, 'utf8'));
      const items = Array.isArray(data) ? data : data.resultados || [];
      
      const artifactsById = new Map(items.map(a => [String(a.id), a]));
      let resolvedCount = 0;
      const productGroups = new Set();

      for (const item of items) {
        if (item.artifact_type === 'MAPA') {
          const res = resolveArtifactTaxonomy(item, artifactsById);
          assert.ok(res, 'Deve retornar resultado de taxonomia');
          assert.ok(typeof res.productKey === 'string');
          assert.ok(typeof res.subproductKey === 'string');
          assert.ok(Array.isArray(res.descendantPath));
          
          if (res.product) {
            productGroups.add(res.product.name);
          }
          resolvedCount++;
        }
      }

      assert.equal(resolvedCount, 603, 'Todos os 603 mapas devem ser resolvidos');
      assert.ok(productGroups.size > 1, 'Deve conter mais de um produto distinto');
      assert.equal(productGroups.has('Home'), false, 'A raiz nunca pode ser produto');
      assert.equal(productGroups.has('Hub de Artefatos'), false, 'A raiz nunca pode ser produto');
    }
  });
});
