import React, { useMemo, useRef, useState } from 'react';
import { Search, X, Code2 } from 'lucide-react';
import { Artifact } from '../types';
import { isMap } from '../domain/artifacts';
import { resolveArtifactTaxonomy } from '../utils/taxonomyResolver';
import { SidebarFilterPopover, FilterSearchableSingle } from './SidebarFilterPopover';

interface Props {
  artifacts: Artifact[];
  selectedProduct: string;
  onSelectProduct: (val: string) => void;
  selectedSubproduct: string;
  onSelectSubproduct: (val: string) => void;
  selectedMapId: string;
  onSelectMapId: (val: string) => void;
  /** Busca dentro da jornada aberta (tela, evento ou código) */
  searchQuery: string;
  onSearchChange: (val: string) => void;
  showCode: boolean;
  onShowCodeChange: (val: boolean) => void;
  isLoading?: boolean;
}

const NO_SUB = 'Sem subproduto';
/** O "Todos" da lista única devolve um destes valores: tratamos como "nenhum" */
const isAllValue = (v: string) => !v || ['todos', 'todas', 'all', 'TODOS'].includes(v);

/**
 * Barra da aba Jornadas no mesmo padrão das outras abas:
 * busca de 260px + botão Filtros com Produto, Subproduto, Mapa e exibição do código.
 */
export const JourneysSidebarFilters: React.FC<Props> = ({
  artifacts,
  selectedProduct,
  onSelectProduct,
  selectedSubproduct,
  onSelectSubproduct,
  selectedMapId,
  onSelectMapId,
  searchQuery,
  onSearchChange,
  showCode,
  onShowCodeChange,
  isLoading,
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  const mapEntries = useMemo(
    () =>
      (artifacts || [])
        .filter((a) => isMap(a) && Array.isArray(a.screens) && a.screens.length > 0)
        .map((a) => {
          const t = resolveArtifactTaxonomy(a);
          const produto = t.produto_nome && t.produto_nome !== 'Sem Produto' ? t.produto_nome : '';
          const sub = !t.subproduto_nome || t.subproduto_nome === 'Sem Subproduto' ? NO_SUB : t.subproduto_nome;
          return { id: String(a.id), title: String(a.titulo || a.id).trim(), produto, sub };
        }),
    [artifacts]
  );

  const products = useMemo(
    () => Array.from(new Set(mapEntries.map((m) => m.produto).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [mapEntries]
  );

  const subproducts = useMemo(() => {
    if (!selectedProduct) return [];
    return Array.from(new Set(mapEntries.filter((m) => m.produto === selectedProduct).map((m) => m.sub))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [mapEntries, selectedProduct]);

  // Mapas visíveis: filtrados pelo produto/subproduto, se escolhidos. Títulos repetidos levam o ID.
  const mapOptions = useMemo(() => {
    const list = mapEntries
      .filter((m) => (!selectedProduct || m.produto === selectedProduct) && (!selectedSubproduct || m.sub === selectedSubproduct))
      .sort((a, b) => a.title.localeCompare(b.title));
    const count = new Map<string, number>();
    list.forEach((m) => count.set(m.title, (count.get(m.title) || 0) + 1));
    return list.map((m) => ({ ...m, label: (count.get(m.title) || 0) > 1 ? `${m.title} (${m.id})` : m.title }));
  }, [mapEntries, selectedProduct, selectedSubproduct]);

  const selectedMapLabel = useMemo(() => {
    const inList = mapOptions.find((m) => m.id === selectedMapId);
    if (inList) return inList.label;
    return mapEntries.find((m) => m.id === selectedMapId)?.title || '';
  }, [mapOptions, mapEntries, selectedMapId]);

  const activeCount = (selectedProduct ? 1 : 0) + (selectedSubproduct ? 1 : 0) + (selectedMapId ? 1 : 0) + (showCode ? 1 : 0);

  const resetAll = () => {
    onSelectProduct('');
    onSelectSubproduct('');
    onSelectMapId('');
    onShowCodeChange(false);
  };

  if (isLoading) {
    return <div className="text-xs text-omni-muted">Carregando filtros...</div>;
  }

  return (
    <div className="flex items-center gap-2 min-w-0" id="sidebar-contextual-journeys">
      {/* Busca dentro da jornada */}
      <div className="relative w-[260px] shrink-0">
        <Search className="w-3.5 h-3.5 text-omni-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
        <input
          type="text"
          placeholder={selectedMapId ? 'Buscar tela, evento ou código...' : 'Escolha um mapa em Filtros'}
          value={searchQuery}
          disabled={!selectedMapId}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-8 pr-7 h-8 bg-white border border-omni-line rounded-lg text-xs font-ui text-omni-ink placeholder:text-omni-muted focus:outline-none focus:ring-2 focus:ring-omni-rubi/20 focus:border-omni-rubi transition-all truncate disabled:bg-omni-mist disabled:cursor-not-allowed"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-omni-muted hover:text-omni-ink p-0.5"
            title="Limpar busca"
            aria-label="Limpar busca"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Botão de Filtros */}
      <button
        ref={filterButtonRef}
        type="button"
        onClick={() => setIsPopoverOpen(!isPopoverOpen)}
        aria-expanded={isPopoverOpen}
        className={`h-8 shrink-0 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-all border cursor-pointer ${
          isPopoverOpen || activeCount > 0
            ? 'bg-red-50 text-omni-bordo border-omni-bordo/30 font-semibold'
            : 'bg-white border-omni-line text-omni-ink-secondary hover:text-omni-ink hover:border-gray-300 shadow-neu-card'
        }`}
      >
        <span>Filtros</span>
        {activeCount > 0 && (
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-omni-bordo text-white">{activeCount}</span>
        )}
      </button>

      {/* Mapa aberto, para saber o que está na tela sem abrir os filtros */}
      {selectedMapLabel && (
        <span className="text-xs text-omni-ink-secondary truncate min-w-0" title={selectedMapLabel}>
          {selectedMapLabel}
        </span>
      )}

      <SidebarFilterPopover
        isOpen={isPopoverOpen}
        onClose={() => setIsPopoverOpen(false)}
        anchorRef={filterButtonRef}
        title="Filtros da jornada"
        activeCount={activeCount}
        onResetAll={resetAll}
      >
        <FilterSearchableSingle
          label="Produto"
          options={products}
          value={selectedProduct || 'todos'}
          onChange={(v) => {
            onSelectProduct(isAllValue(v) ? '' : v);
            onSelectSubproduct('');
            onSelectMapId('');
          }}
          allOptionLabel="Todos os produtos"
          placeholder="Buscar produto..."
        />

        {selectedProduct && (
          <FilterSearchableSingle
            label="Subproduto"
            options={subproducts}
            value={selectedSubproduct || 'todos'}
            onChange={(v) => {
              onSelectSubproduct(isAllValue(v) ? '' : v);
              onSelectMapId('');
            }}
            allOptionLabel="Todos os subprodutos"
            placeholder="Buscar subproduto..."
          />
        )}

        <FilterSearchableSingle
          label={`Mapa (${mapOptions.length})`}
          options={mapOptions.map((m) => m.label)}
          value={mapOptions.find((m) => m.id === selectedMapId)?.label || 'todos'}
          onChange={(label) => {
            if (isAllValue(label)) {
              onSelectMapId('');
              return;
            }
            const m = mapOptions.find((o) => o.label === label);
            if (!m) return;
            // Escolher o mapa direto também preenche produto e subproduto
            if (m.produto && m.produto !== selectedProduct) onSelectProduct(m.produto);
            if (m.sub !== selectedSubproduct) onSelectSubproduct(m.sub);
            onSelectMapId(m.id);
            onSearchChange('');
            setIsPopoverOpen(false);
          }}
          allOptionLabel="Nenhum mapa"
          placeholder="Buscar mapa..."
        />

        {/* Exibição (mesmo estilo do bloco "Exceções e status" das outras abas) */}
        <div className="space-y-1.5">
          <label className="text-xs font-ui font-semibold text-omni-ink-secondary block">Exibição</label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onShowCodeChange(!showCode)}
              aria-pressed={showCode}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-ui font-medium border transition-colors cursor-pointer flex items-center gap-1 ${
                showCode
                  ? 'bg-red-50 text-[#7B0209] border-[#7B0209]/40 font-semibold'
                  : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
              }`}
            >
              <Code2 className="w-3 h-3" />
              Mostrar código nas telas
            </button>
          </div>
        </div>
      </SidebarFilterPopover>
    </div>
  );
};
