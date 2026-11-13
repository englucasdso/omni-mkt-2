import React, { useMemo, useRef, useState } from 'react';
import { ChevronRight, Code2 } from 'lucide-react';
import { Artifact } from '../types';
import { isMap } from '../domain/artifacts';
import { resolveArtifactTaxonomy } from '../utils/taxonomyResolver';
import { SidebarFilterPopover } from './SidebarFilterPopover';

const NO_SUB = 'SEM_SUBPRODUTO';

// --- Escolha do mapa: Produto → Subproduto → Mapa, centralizada no topo da jornada ---

interface PickerProps {
  artifacts: Artifact[];
  selectedProduct: string;
  onSelectProduct: (val: string) => void;
  selectedSubproduct: string;
  onSelectSubproduct: (val: string) => void;
  selectedMapId: string;
  onSelectMapId: (val: string) => void;
  isLoading?: boolean;
}

const selectClass =
  'h-9 w-full rounded-lg border border-omni-line bg-white text-xs px-3 text-omni-ink focus:outline-none focus:ring-2 focus:ring-omni-rubi/20 focus:border-omni-rubi transition-all cursor-pointer truncate shadow-neu-card disabled:opacity-50 disabled:cursor-not-allowed';

const Step: React.FC<{ label: string; className: string; children: React.ReactNode }> = ({ label, className, children }) => (
  <label className={`flex flex-col gap-1 min-w-0 ${className}`}>
    <span className="text-[11px] font-medium text-omni-ink-secondary">{label}</span>
    {children}
  </label>
);

export const JourneyMapPicker: React.FC<PickerProps> = ({
  artifacts,
  selectedProduct,
  onSelectProduct,
  selectedSubproduct,
  onSelectSubproduct,
  selectedMapId,
  onSelectMapId,
  isLoading,
}) => {
  const mapTaxonomies = useMemo(
    () =>
      (artifacts || [])
        .filter((a) => isMap(a) && Array.isArray(a.screens) && a.screens.length > 0)
        .map((a) => ({ artifact: a, taxonomy: resolveArtifactTaxonomy(a) })),
    [artifacts]
  );

  const subOf = (t: any) => (t.subproduto_nome === 'Sem Subproduto' ? NO_SUB : t.subproduto_nome);

  const products = useMemo(() => {
    const set = new Set<string>();
    mapTaxonomies.forEach(({ taxonomy }) => {
      if (taxonomy.produto_nome && taxonomy.produto_nome !== 'Sem Produto') set.add(taxonomy.produto_nome);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [mapTaxonomies]);

  const subproducts = useMemo(() => {
    if (!selectedProduct) return [];
    const set = new Set<string>();
    mapTaxonomies.forEach(({ taxonomy }) => {
      if (taxonomy.produto_nome === selectedProduct) set.add(subOf(taxonomy));
    });
    const label = (v: string) => (v === NO_SUB ? 'Sem subproduto' : v);
    return Array.from(set).sort((a, b) => label(a).localeCompare(label(b)));
  }, [mapTaxonomies, selectedProduct]);

  const maps = useMemo(() => {
    if (!selectedProduct || !selectedSubproduct) return [];
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    mapTaxonomies.forEach(({ artifact, taxonomy }) => {
      if (taxonomy.produto_nome !== selectedProduct || subOf(taxonomy) !== selectedSubproduct) return;
      const id = String(artifact.id);
      if (seen.has(id)) return;
      seen.add(id);
      list.push({ id, name: String(artifact.titulo || artifact.id).trim() });
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [mapTaxonomies, selectedProduct, selectedSubproduct]);

  if (isLoading) {
    return <p className="text-xs text-omni-muted text-center">Carregando mapas...</p>;
  }
  if (mapTaxonomies.length === 0) {
    return <p className="text-xs text-omni-muted text-center">Nenhum mapa com telas disponível.</p>;
  }

  return (
    <div className="w-full flex justify-center">
      <div className="flex items-end gap-2 w-full max-w-4xl">
        <Step label="Produto" className="w-[22%]">
          <select
            className={selectClass}
            value={selectedProduct}
            onChange={(e) => {
              onSelectProduct(e.target.value);
              onSelectSubproduct('');
              onSelectMapId('');
            }}
          >
            <option value="">Selecione...</option>
            {products.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Step>

        <ChevronRight className="w-4 h-4 text-omni-muted shrink-0 mb-2.5" aria-hidden="true" />

        <Step label="Subproduto" className="w-[26%]">
          <select
            className={selectClass}
            value={selectedSubproduct}
            disabled={!selectedProduct}
            onChange={(e) => {
              onSelectSubproduct(e.target.value);
              onSelectMapId('');
            }}
          >
            <option value="">{selectedProduct ? 'Selecione...' : 'Escolha o produto'}</option>
            {subproducts.map((s) => (
              <option key={s} value={s}>
                {s === NO_SUB ? 'Sem subproduto' : s}
              </option>
            ))}
          </select>
        </Step>

        <ChevronRight className="w-4 h-4 text-omni-muted shrink-0 mb-2.5" aria-hidden="true" />

        <Step label="Mapa" className="flex-1">
          <select
            className={selectClass}
            value={selectedMapId}
            disabled={!selectedSubproduct}
            onChange={(e) => onSelectMapId(e.target.value)}
            title={maps.find((m) => m.id === selectedMapId)?.name}
          >
            <option value="">{selectedSubproduct ? 'Selecione...' : 'Escolha o subproduto'}</option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Step>
      </div>
    </div>
  );
};

// --- Barra de cima (canto direito): botão Filtros, no mesmo padrão das outras abas ---

interface FiltersProps {
  showCode: boolean;
  onShowCodeChange: (val: boolean) => void;
}

export const JourneysSidebarFilters: React.FC<FiltersProps> = ({ showCode, onShowCodeChange }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="flex items-center gap-2 min-w-0" id="sidebar-contextual-journeys">
      <button
        ref={filterButtonRef}
        type="button"
        onClick={() => setIsPopoverOpen(!isPopoverOpen)}
        aria-expanded={isPopoverOpen}
        className={`h-8 shrink-0 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-all border cursor-pointer ${
          isPopoverOpen || showCode
            ? 'bg-red-50 text-omni-bordo border-omni-bordo/30 font-semibold'
            : 'bg-white border-omni-line text-omni-ink-secondary hover:text-omni-ink hover:border-gray-300 shadow-neu-card'
        }`}
      >
        <span>Filtros</span>
        {showCode && <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-omni-bordo text-white">1</span>}
      </button>

      <SidebarFilterPopover
        isOpen={isPopoverOpen}
        onClose={() => setIsPopoverOpen(false)}
        anchorRef={filterButtonRef}
        title="Filtros da jornada"
        activeCount={showCode ? 1 : 0}
        onResetAll={() => onShowCodeChange(false)}
      >
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
