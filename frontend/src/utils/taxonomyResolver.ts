import type { Artifact, TaxonomyNodeReference, ResolvedArtifactTaxonomy } from '../types/index.ts';

export type { TaxonomyNodeReference, ResolvedArtifactTaxonomy };

/**
 * taxonomyResolver.ts
 * 
 * Adaptador leve para consumo dos dados taxonômicos canônicos gerados pelo backend.
 * Conforme a regra do Hub de Artefatos, a taxonomia é calculada no backend estritamente
 * pela posição na árvore (Root=0, Produto=1, Subproduto=2, Descendentes=3+).
 * 
 * Não reconstrói nem aplica heurísticas de títulos, snippets ou cabeçalhos.
 */
export function resolveArtifactTaxonomy(
  artifact: Artifact,
  _artifactsById?: Map<string, Artifact> | Artifact[]
): ResolvedArtifactTaxonomy {
  if (!artifact) {
    return {
      product: null,
      subproduct: null,
      descendantPath: [],
      displayPath: '',
      productKey: 'SEM_PRODUTO',
      subproductKey: 'SEM_SUBPRODUTO',
      produto_id: 'SEM_PRODUTO',
      produto_nome: 'Sem Produto',
      subproduto_id: 'SEM_SUBPRODUTO',
      subproduto_nome: 'Sem Subproduto',
      descendant_path_ids: [],
      descendant_path_titles: []
    };
  }

  // Raiz nunca possui taxonomia de produto
  if (artifact.artifact_type === 'RAIZ' || artifact.depth === 0) {
    return {
      product: null,
      subproduct: null,
      descendantPath: [],
      displayPath: '',
      productKey: 'SEM_PRODUTO',
      subproductKey: 'SEM_SUBPRODUTO',
      produto_id: 'SEM_PRODUTO',
      produto_nome: 'Sem Produto',
      subproduto_id: 'SEM_SUBPRODUTO',
      subproduto_nome: 'Sem Subproduto',
      descendant_path_ids: [],
      descendant_path_titles: []
    };
  }

  const rawProdNome = artifact.produto ? String(artifact.produto).trim() : '';
  const hasProd = rawProdNome && rawProdNome.toLowerCase() !== 'sem produto' && rawProdNome.toLowerCase() !== 'sem_produto';
  const produto_nome = hasProd ? rawProdNome : 'Sem Produto';
  const produto_id = hasProd 
    ? (artifact.produto_id ? String(artifact.produto_id).trim() : rawProdNome)
    : 'SEM_PRODUTO';

  const product: TaxonomyNodeReference | null = hasProd ? {
    id: produto_id,
    name: produto_nome,
    depth: 1
  } : null;

  const rawSubNome = artifact.subproduto ? String(artifact.subproduto).trim() : '';
  const hasSub = rawSubNome && rawSubNome.toLowerCase() !== 'sem subproduto' && rawSubNome.toLowerCase() !== 'sem_subproduto';
  const subproduto_nome = hasSub ? rawSubNome : 'Sem Subproduto';
  const subproduto_id = hasSub
    ? (artifact.subproduto_id ? String(artifact.subproduto_id).trim() : rawSubNome)
    : 'SEM_SUBPRODUTO';

  const subproduct: TaxonomyNodeReference | null = (hasProd && hasSub) ? {
    id: subproduto_id,
    name: subproduto_nome,
    depth: 2
  } : null;

  const descendant_path_ids = Array.isArray(artifact.descendant_path_ids)
    ? artifact.descendant_path_ids.map(String)
    : [];
  const descendant_path_titles = Array.isArray(artifact.descendant_path_titles)
    ? artifact.descendant_path_titles.map(String)
    : [];

  const descendantPath: TaxonomyNodeReference[] = [];
  if (subproduct) {
    descendantPath.push(subproduct);
  }
  for (let i = 0; i < descendant_path_titles.length; i++) {
    const title = descendant_path_titles[i];
    if (!title) continue;
    const id = descendant_path_ids[i] || `desc-${i + 3}`;
    descendantPath.push({
      id,
      name: title,
      depth: i + 3
    });
  }

  const displayPath = descendantPath.map(n => n.name).join(' › ');

  return {
    product,
    subproduct,
    descendantPath,
    displayPath,
    productKey: produto_id,
    subproductKey: subproduto_id,
    produto_id,
    produto_nome,
    subproduto_id,
    subproduto_nome,
    descendant_path_ids,
    descendant_path_titles
  };
}
