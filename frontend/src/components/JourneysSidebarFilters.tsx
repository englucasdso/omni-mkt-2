import React, { useMemo } from 'react';
import { Artifact } from '../types';
import { resolveArtifactTaxonomy } from '../utils/taxonomyResolver';

interface Props {
  artifacts: Artifact[];
  selectedProduct: string;
  onSelectProduct: (val: string) => void;
  selectedSubproduct: string;
  onSelectSubproduct: (val: string) => void;
  selectedMapId: string;
  onSelectMapId: (val: string) => void;
  isLoading?: boolean;
}

export const JourneysSidebarFilters: React.FC<Props> = ({
  artifacts,
  selectedProduct,
  onSelectProduct,
  selectedSubproduct,
  onSelectSubproduct,
  selectedMapId,
  onSelectMapId,
  isLoading
}) => {
  const eligibleMaps = useMemo(() => {
    return (artifacts || []).filter(a => a.artifact_type === 'MAPA' && Array.isArray(a.screens) && a.screens.length > 0);
  }, [artifacts]);

  const mapTaxonomies = useMemo(() => {
    return eligibleMaps.map(a => ({
      artifact: a,
      taxonomy: resolveArtifactTaxonomy(a)
    }));
  }, [eligibleMaps]);

  const products = useMemo(() => {
    const set = new Set<string>();
    mapTaxonomies.forEach(({ taxonomy }) => {
      const p = taxonomy.produto_nome;
      if (p && p !== 'Sem Produto') set.add(p);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [mapTaxonomies]);

  const subproducts = useMemo(() => {
    if (!selectedProduct) return [];
    const set = new Set<string>();
    mapTaxonomies.forEach(({ taxonomy }) => {
      if (taxonomy.produto_nome === selectedProduct) {
        const sub = taxonomy.subproduto_nome === 'Sem Subproduto' ? 'SEM_SUBPRODUTO' : taxonomy.subproduto_nome;
        set.add(sub);
      }
    });
    return Array.from(set).sort((a, b) => {
      const displayA = a === 'SEM_SUBPRODUTO' ? 'Sem subproduto' : a;
      const displayB = b === 'SEM_SUBPRODUTO' ? 'Sem subproduto' : b;
      return displayA.localeCompare(displayB);
    });
  }, [mapTaxonomies, selectedProduct]);

  const maps = useMemo(() => {
    if (!selectedProduct || !selectedSubproduct) return [];
    const list: {id: string, name: string}[] = [];
    const seen = new Set<string>();
    mapTaxonomies.forEach(({ artifact, taxonomy }) => {
      const p = taxonomy.produto_nome;
      const sub = taxonomy.subproduto_nome === 'Sem Subproduto' ? 'SEM_SUBPRODUTO' : taxonomy.subproduto_nome;
      
      if (p === selectedProduct && sub === selectedSubproduct) {
        const title = String(artifact.titulo || artifact.id).trim();
        const idStr = String(artifact.id);
        if (!seen.has(idStr)) {
          seen.add(idStr);
          list.push({ id: idStr, name: title });
        }
      }
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [mapTaxonomies, selectedProduct, selectedSubproduct]);

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-slate-400">
        Carregando filtros...
      </div>
    );
  }

  if (eligibleMaps.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-slate-400">
        Nenhum mapa com telas disponível.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">Produto</label>
        <select
          className="w-full h-9 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2 focus:ring-2 focus:ring-omni-brand-accent focus:border-omni-brand-accent transition-all dark:text-slate-200"
          value={selectedProduct}
          onChange={(e) => {
            onSelectProduct(e.target.value);
            onSelectSubproduct('');
            onSelectMapId('');
          }}
        >
          <option value="">Selecione...</option>
          {products.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">Subproduto</label>
        <select
          className="w-full h-9 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2 focus:ring-2 focus:ring-omni-brand-accent focus:border-omni-brand-accent transition-all dark:text-slate-200"
          value={selectedSubproduct}
          onChange={(e) => {
            onSelectSubproduct(e.target.value);
            onSelectMapId('');
          }}
          disabled={!selectedProduct}
        >
          <option value="">Selecione...</option>
          {subproducts.map(s => (
            <option key={s} value={s}>{s === 'SEM_SUBPRODUTO' ? 'Sem subproduto' : s}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">Mapa</label>
        <select
          className="w-full h-9 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs px-2 focus:ring-2 focus:ring-omni-brand-accent focus:border-omni-brand-accent transition-all dark:text-slate-200"
          value={selectedMapId}
          onChange={(e) => onSelectMapId(e.target.value)}
          disabled={!selectedSubproduct}
        >
          <option value="">Selecione...</option>
          {maps.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
};
