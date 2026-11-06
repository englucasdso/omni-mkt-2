import React, { useRef, useState } from 'react';
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
  cardSort: 'recentes' | 'antigos' | 'az' | 'za';
  onCardSortChange: (val: 'recentes' | 'antigos' | 'az' | 'za') => void;
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
    let activeFiltersCount = 0;
    if (cardSort !== 'recentes') activeFiltersCount++;
    if (cardArtifactType !== 'todos') activeFiltersCount++;
    if (cardResponsible !== 'todos') activeFiltersCount++;
    if (cardYear !== 'todas') activeFiltersCount++;

    return (
      <div className="flex flex-col gap-2 w-full min-w-0" id="sidebar-contextual-cards">
        {/* Botão de Refinar Resultados (Abre o Popover Flutuante) */}
        <button
          ref={filterButtonRef}
          type="button"
          onClick={() => setIsPopoverOpen(!isPopoverOpen)}
          aria-expanded={isPopoverOpen}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-ui font-semibold transition-all border cursor-pointer ${
            isPopoverOpen || activeFiltersCount > 0
              ? 'bg-red-50/70 dark:bg-red-950/30 border-[#7B0209]/30 text-[#7B0209]'
              : 'bg-gray-50/80 dark:bg-slate-800/80 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Refinar resultados</span>
            {activeFiltersCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#7B0209] text-white">
                {activeFiltersCount}
              </span>
            )}
          </div>
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
            options={[
              { value: 'recentes', label: 'Mais recentes' },
              { value: 'antigos', label: 'Mais antigos' },
              { value: 'az', label: 'A a Z' },
              { value: 'za', label: 'Z a A' },
            ]}
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
      <div className="flex flex-col gap-2 w-full min-w-0" id="sidebar-contextual-inventory">
        {/* Campo de Busca Reativo */}
        <div className="relative w-full">
          <Search className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
          <input
            type="text"
            placeholder="Buscar inventário..."
            value={tableFilter}
            onChange={(e) => onTableFilterChange(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 bg-gray-50/90 dark:bg-slate-800/90 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-ui text-gray-800 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-slate-600 focus:border-gray-400 dark:focus:border-slate-500 transition-all truncate"
          />
          {tableFilter && (
            <button
              type="button"
              onClick={() => onTableFilterChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 p-0.5"
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
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-ui font-semibold transition-all border cursor-pointer ${
            isPopoverOpen || totalActiveCount > 0
              ? 'bg-red-50/70 dark:bg-red-950/30 border-[#7B0209]/30 text-[#7B0209]'
              : 'bg-gray-50/80 dark:bg-slate-800/80 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Filtros</span>
            {totalActiveCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#7B0209] text-white">
                {totalActiveCount}
              </span>
            )}
          </div>
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
            <span className="text-[10px] font-ui font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider block">
              Exceções e Status
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
      <div className="flex flex-col gap-2 w-full min-w-0" id="sidebar-contextual-product">
        {/* Campo de Busca Reativo */}
        <div className="relative w-full">
          <Search className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
          <input
            type="text"
            placeholder="Filtrar produtos..."
            value={productSearch}
            onChange={(e) => onProductSearchChange(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 bg-gray-50/90 dark:bg-slate-800/90 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-ui text-gray-800 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-slate-600 focus:border-gray-400 dark:focus:border-slate-500 transition-all truncate"
          />
          {productSearch && (
            <button
              type="button"
              onClick={() => onProductSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 p-0.5"
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
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-ui font-semibold transition-all border cursor-pointer ${
            isPopoverOpen || isFiltered
              ? 'bg-red-50/70 dark:bg-red-950/30 border-[#7B0209]/30 text-[#7B0209]'
              : 'bg-gray-50/80 dark:bg-slate-800/80 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Filtros</span>
            {isFiltered && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#7B0209] text-white">
                1
              </span>
            )}
          </div>
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
      <div className="flex flex-col gap-2 w-full min-w-0" id="sidebar-contextual-param">
        {/* Campo de Busca Reativo */}
        <div className="relative w-full">
          <Search className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
          <input
            type="text"
            placeholder="Buscar parâmetro/valor..."
            value={paramSearch}
            onChange={(e) => onParamSearchChange(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 bg-gray-50/90 dark:bg-slate-800/90 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-ui text-gray-800 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-slate-600 focus:border-gray-400 dark:focus:border-slate-500 transition-all truncate"
          />
          {paramSearch && (
            <button
              type="button"
              onClick={() => onParamSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 p-0.5"
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
            className="flex items-center justify-center gap-1.5 px-2.5 py-1 text-xs font-ui font-semibold text-gray-500 hover:text-[#7B0209] dark:text-slate-400 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 text-[#7B0209]" />
            Limpar busca
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
      <div className="flex flex-col gap-2 w-full min-w-0" id="sidebar-contextual-insights">
        {/* Botão de Filtros */}
        <button
          ref={filterButtonRef}
          type="button"
          onClick={() => setIsPopoverOpen(!isPopoverOpen)}
          aria-expanded={isPopoverOpen}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-ui font-semibold transition-all border cursor-pointer ${
            isPopoverOpen || activeInsightsCount > 0
              ? 'bg-red-50/70 dark:bg-red-950/30 border-[#7B0209]/30 text-[#7B0209]'
              : 'bg-gray-50/80 dark:bg-slate-800/80 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Filtros de Indicadores</span>
            {activeInsightsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#7B0209] text-white">
                {activeInsightsCount}
              </span>
            )}
          </div>
        </button>

        {/* Popover Flutuante */}
        <SidebarFilterPopover
          isOpen={isPopoverOpen}
          onClose={() => setIsPopoverOpen(false)}
          anchorRef={filterButtonRef}
          title="Filtros de Indicadores"
          activeCount={activeInsightsCount}
          onResetAll={onResetInsightsFilters}
        >
          {/* Produto */}
          <FilterSearchableSingle
            label="Produto"
            options={availableInsightsProducts}
            value={insightsProductFilter}
            onChange={onInsightsProductFilterChange}
            allOptionLabel="TODOS OS PRODUTOS"
            placeholder="Buscar produto..."
          />

          {/* Nível 2 / Subproduto */}
          <FilterSearchableSingle
            label="Nível 2 / Subproduto"
            options={availableInsightsSubprodutos}
            value={insightsSubprodutoFilter}
            onChange={onInsightsSubprodutoFilterChange}
            allOptionLabel="TODOS OS SUBPRODUTOS"
            placeholder="Buscar subproduto..."
          />

          {/* Mensuração */}
          <FilterSegmentedRow
            label="Mensuração"
            value={insightsMeasurementFilter}
            onChange={onInsightsMeasurementFilterChange}
            options={[
              { value: 'all', label: 'Qualquer' },
              { value: 'GA4', label: 'GA4' },
              { value: 'GA3', label: 'GA3 / Universal' },
              { value: 'HIBRIDO', label: 'Híbrido' },
            ]}
          />
        </SidebarFilterPopover>
      </div>
    );
  }

  // Conexões (graph) e outras rotas não possuem filtros contextuais adicionais
  return null;
};
