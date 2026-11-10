import React, { useRef, useState } from 'react';
import { MEASUREMENT_CONFIGS, ORDERED_MEASUREMENT_CLASSES } from '../domain/measurement';
import { 
  Search, 
  X, 
  SlidersHorizontal, 
  RotateCcw, 
  AlertTriangle 
} from 'lucide-react';
import { 
  SidebarFilterPopover, 
  FilterSegmentedRow, 
  FilterSearchableSingle, 
  FilterMultiSelectSearchable 
} from './SidebarFilterPopover';

export interface SidebarContextualAreaProps {
  currentRouteId: string;

  // Cards (results)
  cardSearch: string;
  onCardSearchChange: (val: string) => void;
  cardSort: 'relevancia' | 'recentes' | 'antigos' | 'az' | 'za';
  onCardSortChange: (val: 'relevancia' | 'recentes' | 'antigos' | 'az' | 'za') => void;
  hasActiveSearch?: boolean;
  cardArtifactType: 'todos' | 'mapas' | 'docs' | 'nos';
  onCardArtifactTypeChange: (val: 'todos' | 'mapas' | 'docs' | 'nos') => void;
  cardResponsible: string;
  onCardResponsibleChange: (val: string) => void;
  cardYear: string;
  onCardYearChange: (val: string) => void;
  availableResponsibles: string[];
  availableYears: string[];
  isCardFilterActive: boolean;
  onResetCardFilters: () => void;

  // Inventário (inventory_table)
  tableFilter: string;
  onTableFilterChange: (val: string) => void;
  inventoryFilters: {
    tipo_mapa: string[];
    measurement_class: string[];
    produto: string[];
    subproduto: string[];
    parametro: string[];
    ano: string[];
  };
  onInventoryFiltersChange: (newFilters: any) => void;
  filterOptions: {
    tipoArtefato: { v: string; l: string }[];
    classificacao: { v: string; l: string }[];
    produtos: { v: string; l: string }[];
    subprodutos: { v: string; l: string }[];
    parametros: { v: string; l: string }[];
    anos: { v: string; l: string }[];
  };
  onlyWithoutResponsible: boolean;
  onToggleOnlyWithoutResponsible: () => void;
  onlyWithoutSubproduct: boolean;
  onToggleOnlyWithoutSubproduct: () => void;
  onlyDivergent: boolean;
  onToggleOnlyDivergent: () => void;
  isInventoryFilterActive: boolean;
  onResetInventoryFilters: () => void;

  // Por Produto (produtos_analise)
  productSearch: string;
  onProductSearchChange: (val: string) => void;
  productSubprodutoFilter: string;
  onProductSubprodutoFilterChange: (val: string) => void;
  availableProductSubprodutos: string[];
  isProductFilterActive: boolean;
  onResetProductFilters: () => void;

  // Por Parâmetro (parametros_analise)
  paramSearch: string;
  onParamSearchChange: (val: string) => void;
  isParamFilterActive: boolean;
  onResetParamFilters: () => void;

  // Insights (insights) - Não possui busca!
  insightsProductFilter: string;
  onInsightsProductFilterChange: (val: string) => void;
  availableInsightsProducts: string[];
  insightsSubprodutoFilter: string;
  onInsightsSubprodutoFilterChange: (val: string) => void;
  availableInsightsSubprodutos: string[];
  insightsMeasurementFilter: string;
  onInsightsMeasurementFilterChange: (val: string) => void;
  isInsightsFilterActive: boolean;
  onResetInsightsFilters: () => void;
}

export const SidebarContextualArea: React.FC<SidebarContextualAreaProps> = ({
  currentRouteId,

  // Cards
  cardSearch,
  onCardSearchChange,
  cardSort,
  onCardSortChange,
  hasActiveSearch = false,
  cardArtifactType,
  onCardArtifactTypeChange,
  cardResponsible,
  onCardResponsibleChange,
  cardYear,
  onCardYearChange,
  availableResponsibles,
  availableYears,
  isCardFilterActive,
  onResetCardFilters,

  // Inventário
  tableFilter,
  onTableFilterChange,
  inventoryFilters,
  onInventoryFiltersChange,
  filterOptions,
  onlyWithoutResponsible,
  onToggleOnlyWithoutResponsible,
  onlyWithoutSubproduct,
  onToggleOnlyWithoutSubproduct,
  onlyDivergent,
  onToggleOnlyDivergent,
  isInventoryFilterActive,
  onResetInventoryFilters,

  // Por Produto
  productSearch,
  onProductSearchChange,
  productSubprodutoFilter,
  onProductSubprodutoFilterChange,
  availableProductSubprodutos,
  isProductFilterActive,
  onResetProductFilters,

  // Por Parâmetro
  paramSearch,
  onParamSearchChange,
  isParamFilterActive,
  onResetParamFilters,

  // Insights
  insightsProductFilter,
  onInsightsProductFilterChange,
  availableInsightsProducts,
  insightsSubprodutoFilter,
  onInsightsSubprodutoFilterChange,
  availableInsightsSubprodutos,
  insightsMeasurementFilter,
  onInsightsMeasurementFilterChange,
  isInsightsFilterActive,
  onResetInsightsFilters,
}) => {
  // Estado para controlar abertura do popover flutuante
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  // 1. CARDS (results)
  if (currentRouteId === 'results') {
    const defaultSort = hasActiveSearch ? 'relevancia' : 'recentes';
    let activeFiltersCount = 0;
    if (cardSort !== defaultSort) activeFiltersCount++;
    if (cardArtifactType !== 'todos') activeFiltersCount++;
    if (cardResponsible !== 'todos') activeFiltersCount++;
    if (cardYear !== 'todas') activeFiltersCount++;

    const sortOptions = [
      ...(hasActiveSearch || cardSort === 'relevancia'
        ? [{ value: 'relevancia' as const, label: 'Relevância' }]
        : []),
      { value: 'recentes' as const, label: 'Mais recentes' },
      { value: 'antigos' as const, label: 'Mais antigos' },
      { value: 'az' as const, label: 'A a Z' },
      { value: 'za' as const, label: 'Z a A' },
    ];

    return (
      <div className="flex items-center gap-2 min-w-0" id="sidebar-contextual-cards">
        {/* Botão de Refinar Resultados (Abre o Popover Flutuante) */}
        <button
          ref={filterButtonRef}
          type="button"
          onClick={() => setIsPopoverOpen(!isPopoverOpen)}
          aria-expanded={isPopoverOpen}
          className={`h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-all border cursor-pointer ${
            isPopoverOpen || activeFiltersCount > 0
              ? 'bg-red-50 text-omni-bordo border-omni-bordo/30 font-semibold'
              : 'bg-white border-omni-line text-omni-ink-secondary hover:text-omni-ink hover:border-gray-300 shadow-neu-card'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
          <span>Filtros</span>
          {activeFiltersCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-omni-bordo text-white">
              {activeFiltersCount}
            </span>
          )}
        </button>

        {/* Popover Flutuante rendered via Portal */}
        <SidebarFilterPopover
          isOpen={isPopoverOpen}
          onClose={() => setIsPopoverOpen(false)}
          anchorRef={filterButtonRef}
          title="Refinar resultados"
          activeCount={activeFiltersCount}
          onResetAll={onResetCardFilters}
        >
          {/* Ordenação */}
          <FilterSegmentedRow
            label="Ordenação"
            value={cardSort}
            onChange={(v) => onCardSortChange(v)}
            options={sortOptions}
          />


          {/* Tipo de Artefato */}
          <FilterSegmentedRow
            label="Tipo de Artefato"
            value={cardArtifactType}
            onChange={(v) => onCardArtifactTypeChange(v)}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'mapas', label: 'Mapas' },
              { value: 'docs', label: 'Docs' },
              { value: 'nos', label: 'Nós' },
            ]}
          />

          {/* Responsável */}
          <FilterSearchableSingle
            label="Responsável"
            options={availableResponsibles}
            value={cardResponsible}
            onChange={onCardResponsibleChange}
            allOptionLabel="Todos os responsáveis"
            placeholder="Buscar responsável..."
          />

          {/* Ano */}
          <FilterSearchableSingle
            label="Data (Ano)"
            options={availableYears}
            value={cardYear}
            onChange={onCardYearChange}
            allOptionLabel="Todos os anos"
            placeholder="Buscar ano..."
          />
        </SidebarFilterPopover>
      </div>
    );
  }

  // 2. INVENTÁRIO (inventory_table)
  if (currentRouteId === 'inventory_table') {
    const activeMultiCount = Object.values(inventoryFilters).filter(
      (arr) => arr && arr.length > 0 && !arr.includes('all')
    ).length;
    const togglesCount = (onlyWithoutResponsible ? 1 : 0) + (onlyWithoutSubproduct ? 1 : 0) + (onlyDivergent ? 1 : 0);
    const totalActiveCount = activeMultiCount + togglesCount;

    return (
      <div className="flex items-center gap-2 min-w-0" id="sidebar-contextual-inventory">
        {/* Campo de Busca Reativo */}
        <div className="relative w-44 sm:w-56">
          <Search className="w-3.5 h-3.5 text-omni-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
          <input
            type="text"
            placeholder="Filtrar inventário..."
            value={tableFilter}
            onChange={(e) => onTableFilterChange(e.target.value)}
            className="w-full pl-8 pr-7 h-8 bg-white border border-omni-line rounded-lg text-xs font-ui text-omni-ink placeholder:text-omni-muted focus:outline-none focus:ring-2 focus:ring-omni-rubi/20 focus:border-omni-rubi transition-all truncate"
          />
          {tableFilter && (
            <button
              type="button"
              onClick={() => onTableFilterChange('')}
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
          className={`h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-all border cursor-pointer ${
            isPopoverOpen || totalActiveCount > 0
              ? 'bg-red-50 text-omni-bordo border-omni-bordo/30 font-semibold'
              : 'bg-white border-omni-line text-omni-ink-secondary hover:text-omni-ink hover:border-gray-300 shadow-neu-card'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
          <span>Filtros</span>
          {totalActiveCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-omni-bordo text-white">
              {totalActiveCount}
            </span>
          )}
        </button>

        {/* Popover Flutuante */}
        <SidebarFilterPopover
          isOpen={isPopoverOpen}
          onClose={() => setIsPopoverOpen(false)}
          anchorRef={filterButtonRef}
          title="Filtros do Inventário"
          activeCount={totalActiveCount}
          onResetAll={onResetInventoryFilters}
        >
          {/* Toggles Rápidos */}
          <div className="space-y-1.5">
            <span className="text-xs font-ui font-semibold text-omni-ink-secondary block">
              Exceções e status
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={onToggleOnlyWithoutResponsible}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-ui font-medium border transition-colors cursor-pointer ${
                  onlyWithoutResponsible
                    ? 'bg-red-50 dark:bg-red-950/40 text-[#7B0209] border-[#7B0209]/40 font-semibold'
                    : 'bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-100'
                }`}
              >
                Sem responsável
              </button>
              <button
                type="button"
                onClick={onToggleOnlyWithoutSubproduct}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-ui font-medium border transition-colors cursor-pointer ${
                  onlyWithoutSubproduct
                    ? 'bg-red-50 dark:bg-red-950/40 text-[#7B0209] border-[#7B0209]/40 font-semibold'
                    : 'bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-100'
                }`}
              >
                Sem subproduto
              </button>
              <button
                type="button"
                onClick={onToggleOnlyDivergent}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-ui font-medium border transition-colors cursor-pointer flex items-center gap-1 ${
                  onlyDivergent
                    ? 'bg-red-50 dark:bg-red-950/40 text-[#7B0209] border-[#7B0209]/40 font-semibold'
                    : 'bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-100'
                }`}
              >
                <AlertTriangle className="w-3 h-3 text-[#7B0209]" />
                Divergentes
              </button>
            </div>
          </div>

          {/* Artefato */}
          <FilterMultiSelectSearchable
            label="Tipo de Artefato"
            options={filterOptions.tipoArtefato}
            values={inventoryFilters.tipo_mapa || []}
            onChange={(vals) => onInventoryFiltersChange({ ...inventoryFilters, tipo_mapa: vals })}
            placeholder="Buscar tipo de artefato..."
          />

          {/* Classificação */}
          <FilterMultiSelectSearchable
            label="Classificação"
            options={filterOptions.classificacao}
            values={inventoryFilters.measurement_class || []}
            onChange={(vals) => onInventoryFiltersChange({ ...inventoryFilters, measurement_class: vals })}
            placeholder="Buscar classificação..."
          />

          {/* Produto */}
          <FilterMultiSelectSearchable
            label="Produto"
            options={filterOptions.produtos}
            values={inventoryFilters.produto || []}
            onChange={(vals) => onInventoryFiltersChange({ ...inventoryFilters, produto: vals })}
            placeholder="Buscar produto..."
          />

          {/* Subproduto */}
          <FilterMultiSelectSearchable
            label="Subproduto"
            options={filterOptions.subprodutos}
            values={inventoryFilters.subproduto || []}
            onChange={(vals) => onInventoryFiltersChange({ ...inventoryFilters, subproduto: vals })}
            placeholder="Buscar subproduto..."
          />

          {/* Parâmetro */}
          <FilterMultiSelectSearchable
            label="Parâmetro"
            options={filterOptions.parametros}
            values={inventoryFilters.parametro || []}
            onChange={(vals) => onInventoryFiltersChange({ ...inventoryFilters, parametro: vals })}
            placeholder="Buscar parâmetro..."
          />

          {/* Ano */}
          <FilterMultiSelectSearchable
            label="Ano"
            options={filterOptions.anos}
            values={inventoryFilters.ano || []}
            onChange={(vals) => onInventoryFiltersChange({ ...inventoryFilters, ano: vals })}
            placeholder="Buscar ano..."
          />
        </SidebarFilterPopover>
      </div>
    );
  }

  // 3. POR PRODUTO (produtos_analise)
  if (currentRouteId === 'produtos_analise') {
    const isFiltered = productSubprodutoFilter !== 'TODOS' && productSubprodutoFilter !== 'all';

    return (
      <div className="flex items-center gap-2 min-w-0" id="sidebar-contextual-product">
        {/* Campo de Busca Reativo */}
        <div className="relative w-44 sm:w-56">
          <Search className="w-3.5 h-3.5 text-omni-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
          <input
            type="text"
            placeholder="Filtrar produtos..."
            value={productSearch}
            onChange={(e) => onProductSearchChange(e.target.value)}
            className="w-full pl-8 pr-7 h-8 bg-white border border-omni-line rounded-lg text-xs font-ui text-omni-ink placeholder:text-omni-muted focus:outline-none focus:ring-2 focus:ring-omni-rubi/20 focus:border-omni-rubi transition-all truncate"
          />
          {productSearch && (
            <button
              type="button"
              onClick={() => onProductSearchChange('')}
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
          className={`h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-all border cursor-pointer ${
            isPopoverOpen || isFiltered
              ? 'bg-red-50 text-omni-bordo border-omni-bordo/30 font-semibold'
              : 'bg-white border-omni-line text-omni-ink-secondary hover:text-omni-ink hover:border-gray-300 shadow-neu-card'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
          <span>Filtros</span>
          {isFiltered && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-omni-bordo text-white">
              1
            </span>
          )}
        </button>

        {/* Popover Flutuante */}
        <SidebarFilterPopover
          isOpen={isPopoverOpen}
          onClose={() => setIsPopoverOpen(false)}
          anchorRef={filterButtonRef}
          title="Filtros de Produtos"
          activeCount={isFiltered ? 1 : 0}
          onResetAll={onResetProductFilters}
        >
          <FilterSearchableSingle
            label="Subproduto"
            options={availableProductSubprodutos}
            value={productSubprodutoFilter}
            onChange={onProductSubprodutoFilterChange}
            allOptionLabel="Todos os subprodutos"
            placeholder="Buscar subproduto..."
          />
        </SidebarFilterPopover>
      </div>
    );
  }

  // 4. POR PARÂMETRO (parametros_analise)
  if (currentRouteId === 'parametros_analise') {
    return (
      <div className="flex items-center gap-2 min-w-0" id="sidebar-contextual-param">
        {/* Campo de Busca Reativo */}
        <div className="relative w-44 sm:w-64">
          <Search className="w-3.5 h-3.5 text-omni-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
          <input
            type="text"
            placeholder="Buscar parâmetro/valor..."
            value={paramSearch}
            onChange={(e) => onParamSearchChange(e.target.value)}
            className="w-full pl-8 pr-7 h-8 bg-white border border-omni-line rounded-lg text-xs font-ui text-omni-ink placeholder:text-omni-muted focus:outline-none focus:ring-2 focus:ring-omni-rubi/20 focus:border-omni-rubi transition-all truncate"
          />
          {paramSearch && (
            <button
              type="button"
              onClick={() => onParamSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-omni-muted hover:text-omni-ink p-0.5"
              title="Limpar busca"
              aria-label="Limpar busca"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {isParamFilterActive && (
          <button
            type="button"
            onClick={onResetParamFilters}
            className="h-8 flex items-center gap-1 px-2.5 rounded-lg text-xs font-medium text-omni-bordo hover:bg-red-50 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 text-omni-bordo" />
            <span>Limpar</span>
          </button>
        )}
      </div>
    );
  }

  // 5. INSIGHTS (insights) - Não possui busca! Mostrar apenas filtros de produto, nível 2 e mensuração.
  if (currentRouteId === 'insights') {
    let activeInsightsCount = 0;
    if (insightsProductFilter !== 'all') activeInsightsCount++;
    if (insightsSubprodutoFilter !== 'all') activeInsightsCount++;
    if (insightsMeasurementFilter !== 'all') activeInsightsCount++;

    return (
      <div className="flex items-center gap-2 min-w-0" id="sidebar-contextual-insights">
        {/* Botão de Filtros */}
        <button
          ref={filterButtonRef}
          type="button"
          onClick={() => setIsPopoverOpen(!isPopoverOpen)}
          aria-expanded={isPopoverOpen}
          className={`h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-all border cursor-pointer ${
            isPopoverOpen || activeInsightsCount > 0
              ? 'bg-red-50 text-omni-bordo border-omni-bordo/30 font-semibold'
              : 'bg-white border-omni-line text-omni-ink-secondary hover:text-omni-ink hover:border-gray-300 shadow-neu-card'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
          <span>Filtros</span>
          {activeInsightsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-omni-bordo text-white">
              {activeInsightsCount}
            </span>
          )}
        </button>

        {/* Popover Flutuante */}
        <SidebarFilterPopover
          isOpen={isPopoverOpen}
          onClose={() => setIsPopoverOpen(false)}
          anchorRef={filterButtonRef}
          title="Filtros de indicadores"
          activeCount={activeInsightsCount}
          onResetAll={onResetInsightsFilters}
        >
          {/* Produto */}
          <FilterSearchableSingle
            label="Produto"
            options={availableInsightsProducts}
            value={insightsProductFilter}
            onChange={onInsightsProductFilterChange}
            allOptionLabel="Todos os produtos"
            placeholder="Buscar produto..."
          />

          {/* Nível 2 / Subproduto */}
          <FilterSearchableSingle
            label="Subproduto"
            options={availableInsightsSubprodutos}
            value={insightsSubprodutoFilter}
            onChange={onInsightsSubprodutoFilterChange}
            allOptionLabel="Todos os subprodutos"
            placeholder="Buscar subproduto..."
          />

          {/* Mensuração */}
          <FilterSegmentedRow
            label="Mensuração"
            value={insightsMeasurementFilter}
            onChange={onInsightsMeasurementFilterChange}
            options={[
              { value: 'all', label: 'Todas as classificações' },
              ...ORDERED_MEASUREMENT_CLASSES.filter((m) => m !== 'NAO_CLASSIFICADO').map((m) => ({ value: m, label: MEASUREMENT_CONFIGS[m].label })),
            ]}
          />
        </SidebarFilterPopover>
      </div>
    );
  }

  // Conexões (graph) e outras rotas não possuem filtros contextuais adicionais
  return null;
};
