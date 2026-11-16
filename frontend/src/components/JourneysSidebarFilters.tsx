import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Code2, Search, Check } from 'lucide-react';
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

const norm = (v: string) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

interface PickOption {
  value: string;
  label: string;
}

/**
 * Lista de escolha da jornada. Substitui o <select> nativo: a lista abre com
 * rolagem (sem limite de itens) e, quando é longa, com busca no topo.
 */
const PickList: React.FC<{
  label: string;
  className: string;
  value: string;
  options: PickOption[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}> = ({ label, className, value, options, placeholder, disabled, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);
  const showSearch = options.length > 8;
  const visible = query.trim() ? options.filter((o) => norm(o.label).includes(norm(query.trim()))) : options;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    if (showSearch) setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, showSearch]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={rootRef} className={`relative flex flex-col gap-1 min-w-0 ${className}`}>
      <span className="text-[11px] font-medium text-omni-ink-secondary">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selected?.label}
        className="h-9 w-full rounded-lg border border-omni-line bg-white text-xs px-3 text-left flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-omni-rubi/20 focus:border-omni-rubi transition-all cursor-pointer shadow-neu-card disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={`flex-1 min-w-0 truncate ${selected ? 'text-omni-ink' : 'text-omni-muted'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-omni-muted shrink-0" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-full min-w-[240px] rounded-xl border border-omni-line bg-white shadow-lg overflow-hidden">
          {showSearch && (
            <div className="relative border-b border-omni-line-subtle">
              <Search className="w-3.5 h-3.5 text-omni-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && visible.length === 1) pick(visible[0].value);
                }}
                placeholder="Buscar..."
                className="w-full h-9 pl-8 pr-3 text-xs text-omni-ink placeholder:text-omni-muted focus:outline-none"
              />
            </div>
          )}
          <ul role="listbox" className="max-h-72 overflow-y-auto custom-scrollbar py-1">
            {visible.length === 0 ? (
              <li className="px-3 py-2 text-xs text-omni-muted">Nada encontrado.</li>
            ) : (
              visible.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    onClick={() => pick(o.value)}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 cursor-pointer hover:bg-omni-mist ${
                      o.value === value ? 'text-omni-bordo font-semibold' : 'text-omni-ink'
                    }`}
                  >
                    <span className="flex-1 min-w-0">{o.label}</span>
                    {o.value === value && <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

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
        <PickList
          label="Produto"
          className="w-[22%]"
          value={selectedProduct}
          options={products.map((p) => ({ value: p, label: p }))}
          placeholder="Selecione..."
          onChange={(v) => {
            onSelectProduct(v);
            onSelectSubproduct('');
            onSelectMapId('');
          }}
        />

        <ChevronRight className="w-4 h-4 text-omni-muted shrink-0 mb-2.5" aria-hidden="true" />

        <PickList
          label="Subproduto"
          className="w-[26%]"
          value={selectedSubproduct}
          options={subproducts.map((sp) => ({ value: sp, label: sp === NO_SUB ? 'Sem subproduto' : sp }))}
          placeholder={selectedProduct ? 'Selecione...' : 'Escolha o produto'}
          disabled={!selectedProduct}
          onChange={(v) => {
            onSelectSubproduct(v);
            onSelectMapId('');
          }}
        />

        <ChevronRight className="w-4 h-4 text-omni-muted shrink-0 mb-2.5" aria-hidden="true" />

        <PickList
          label="Mapa"
          className="flex-1"
          value={selectedMapId}
          options={maps.map((m) => ({ value: m.id, label: m.name }))}
          placeholder={selectedSubproduct ? 'Selecione...' : 'Escolha o subproduto'}
          disabled={!selectedSubproduct}
          onChange={onSelectMapId}
        />
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
