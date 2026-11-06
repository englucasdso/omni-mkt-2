import React, { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { 
  Tag, Search, Filter, Code2, Layers, ChevronRight, ChevronDown,
  Sparkles, Database, FileText, Check
} from 'lucide-react';
import { Artifact, ParameterSummaryItem } from '../types';
import { PageHeader } from './PageHeader';
import { 
  normalizeSearchText, 
  getQueryTokens, 
  matchesAllTokens, 
  sortWithSearchPriority, 
  useDebouncedSearch 
} from '../utils/contextualSearch';
import { ContextualEmptyState } from './ContextualEmptyState';

interface ParameterAnalysisViewProps {
  artifacts: Artifact[];
  onOpenMap: (map: Artifact) => void;
  searchTerm?: string;
  onSearchChange?: (val: string) => void;
}

export const ParameterAnalysisView: React.FC<ParameterAnalysisViewProps> = ({ 
  artifacts,
  onOpenMap,
  searchTerm,
  onSearchChange,
}) => {
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  const effectiveSearchTerm = searchTerm !== undefined ? searchTerm : localSearchTerm;
  const [selectedParamKey, setSelectedParamKey] = useState<string | null>(null);
  const [selectedDistinctValue, setSelectedDistinctValue] = useState<string | null>(null);
  
  const [isDistinctValuesExpanded, setIsDistinctValuesExpanded] = useState(false);
  const [isMapsExpanded, setIsMapsExpanded] = useState(false);

  // Consolidated parameter dictionary
  const parametersCatalog = useMemo(() => {
    const map = new Map<string, {
      name: string;
      occurrences: number;
      screensCount: number;
      mapsCount: number;
      distinctValues: Set<string>;
      valueTypes: Record<string, number>;
      associatedMaps: Artifact[];
      products: Set<string>;
    }>();

    artifacts.forEach(art => {
      if (art.artifact_type !== 'MAPA') return;
      const artParams = art.parameter_summary || [];
      const prodName = art.produto || 'Sem Produto';

      artParams.forEach(param => {
        if (!map.has(param.name)) {
          map.set(param.name, {
            name: param.name,
            occurrences: 0,
            screensCount: 0,
            mapsCount: 0,
            distinctValues: new Set(),
            valueTypes: {},
            associatedMaps: [],
            products: new Set()
          });
        }
        
        const entry = map.get(param.name)!;
        entry.occurrences += param.occurrences;
        entry.screensCount += param.screens_count;
        entry.mapsCount += 1;
        entry.associatedMaps.push(art);
        if (prodName) entry.products.add(prodName);
        
        (param.distinct_values || []).forEach(v => entry.distinctValues.add(v));
        
        Object.entries(param.value_types || {}).forEach(([vType, count]) => {
          entry.valueTypes[vType] = (entry.valueTypes[vType] || 0) + count;
        });
      });
    });

    return Array.from(map.values()).map(p => {
      // Deduplicate associated maps
      const uniqueMaps = Array.from(new Map(p.associatedMaps.map(m => [m.id, m])).values());

      return {
        ...p,
        distinctValuesList: Array.from(p.distinctValues),
        productsList: Array.from(p.products),
        associatedMaps: uniqueMaps
      };
    }).sort((a, b) => b.occurrences - a.occurrences);
  }, [artifacts]);

  const debouncedSearch = useDebouncedSearch(effectiveSearchTerm, 150);

  // Índice textual leve montado UMA ÚNICA VEZ quando o catálogo de parâmetros mudar
  const indexedParameters = useMemo(() => {
    return parametersCatalog.map(param => {
      const parts = [
        param.name,
        ...param.distinctValuesList,
        ...param.productsList,
        ...param.associatedMaps.map(m => m.id),
        ...param.associatedMaps.map(m => m.titulo),
        ...param.associatedMaps.map(m => m.subproduto || '')
      ];
      return {
        param,
        normId: '',
        normTitle: normalizeSearchText(param.name),
        searchableText: normalizeSearchText(parts.join(' ')),
      };
    });
  }, [parametersCatalog]);

  const filteredCatalog = useMemo(() => {
    const queryTokens = getQueryTokens(debouncedSearch);
    if (queryTokens.length === 0) return parametersCatalog;

    const matched = indexedParameters.filter(({ searchableText }) =>
      matchesAllTokens(searchableText, queryTokens)
    );

    const prioritized = sortWithSearchPriority(matched, debouncedSearch);
    return prioritized.map(item => item.param);
  }, [indexedParameters, parametersCatalog, debouncedSearch]);

  const activeParam = selectedParamKey 
    ? filteredCatalog.find(p => p.name === selectedParamKey) || filteredCatalog[0] || null
    : filteredCatalog[0] || null;

  // Clear drill-down states when param changes
  useEffect(() => {
    setSelectedDistinctValue(null);
    setIsDistinctValuesExpanded(false);
    setIsMapsExpanded(false);
  }, [activeParam?.name]);

  const handleSelectDistinctValue = (val: string) => {
    setSelectedDistinctValue(prev => prev === val ? null : val);
    setIsMapsExpanded(false);
  };

  const activeParamFilteredMaps = useMemo(() => {
    if (!activeParam) return [];
    if (!selectedDistinctValue) return activeParam.associatedMaps;
    
    return activeParam.associatedMaps.filter(mapItem => {
      const paramSummaries = mapItem.parameter_summary || [];
      return paramSummaries.some(ps => 
        ps.name === activeParam.name && 
        (ps.distinct_values || []).includes(selectedDistinctValue)
      );
    });
  }, [activeParam, selectedDistinctValue]);

  // Derived Values for UI states
  const displayedDistinctValues = useMemo(() => {
    if (!activeParam) return [];
    let list = [...activeParam.distinctValuesList];
    
    const term = effectiveSearchTerm.trim().toLowerCase();
    if (term) {
      list.sort((a, b) => {
        const aMatch = a.toLowerCase().includes(term);
        const bMatch = b.toLowerCase().includes(term);
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });
    }

    if (!isDistinctValuesExpanded && list.length > 10) {
      let preview = list.slice(0, 10);
      if (selectedDistinctValue && !preview.includes(selectedDistinctValue)) {
        preview = [selectedDistinctValue, ...preview.slice(0, 9)];
      }
      return preview;
    }
    return list;
  }, [activeParam, effectiveSearchTerm, isDistinctValuesExpanded, selectedDistinctValue]);

  const displayedMaps = useMemo(() => {
    if (isMapsExpanded) return activeParamFilteredMaps;
    return activeParamFilteredMaps.slice(0, 3);
  }, [activeParamFilteredMaps, isMapsExpanded]);

  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    const regex = new RegExp(`(${highlight})`, 'gi');
    const parts = text.split(regex);
    return (
      <span className="break-all">
        {parts.map((part, i) => 
          regex.test(part) ? <span key={i} className="bg-yellow-200 dark:bg-yellow-900/60 text-gray-900 dark:text-white rounded-sm px-[1px]">{part}</span> : part
        )}
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Análise por Parâmetro"
        subtitle="Frequência, mapeamento de tipos e valores distintos utilizados no disparo de eventos."
      />

      {filteredCatalog.length === 0 ? (
        <ContextualEmptyState
          searchTerm={effectiveSearchTerm}
          onClearSearch={() => {
            if (onSearchChange) onSearchChange('');
            setLocalSearchTerm('');
          }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left side: Parameter List */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            {filteredCatalog.map(param => {
              const isSelected = activeParam?.name === param.name;
              return (
                <div 
                  key={param.name}
                  onClick={() => setSelectedParamKey(param.name)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-red-50/50 dark:bg-slate-800/80 border-bradesco-red shadow-neu-raised ring-1 ring-inset ring-bradesco-red' 
                      : 'flat-card border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700 shadow-neu-card'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-gray-900 dark:text-slate-100">
                        {param.name}
                      </span>
                    </div>
                    <span className="text-[11px] font-ui font-medium text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full border border-gray-200 dark:border-slate-700 tabular-nums">
                      {param.occurrences}x
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] font-ui text-gray-500 dark:text-slate-400 flex-wrap">
                    <span className="tabular-nums">{param.screensCount} telas</span>
                    <span>•</span>
                    <span className="tabular-nums">{param.mapsCount} mapas</span>
                    <span>•</span>
                    <span className="tabular-nums">{param.distinctValuesList.length} {param.distinctValuesList.length === 1 ? 'valor distinto' : 'valores distintos'}</span>
                  </div>
                </div>
              );
            })}
          </div>

        {/* Right side: Parameter Details */}
        <div className="lg:col-span-7">
          {activeParam ? (
            <div className="flat-card rounded-2xl border border-gray-200 dark:border-slate-800 p-6 md:p-8 space-y-6 shadow-neu-card">
              <div className="pb-6 border-b border-gray-100 dark:border-slate-800">
                <span className="text-[10px] font-ui font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                  Detalhes do Parâmetro
                </span>
                <div className="flex items-center gap-3 mt-1">
                  <h3 className="text-2xl font-mono font-bold text-gray-900 dark:text-slate-50 tracking-tight">
                    {activeParam.name}
                  </h3>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-3 text-center font-ui">
                <div className="p-3 bg-gray-50/80 dark:bg-slate-800/80 rounded-xl border border-gray-200 dark:border-slate-700">
                  <span className="text-[10px] font-medium text-gray-400 uppercase block">Ocorrências</span>
                  <span className="text-xl font-heading font-bold text-gray-900 dark:text-slate-100 tabular-nums">{activeParam.occurrences}</span>
                </div>
                <div className="p-3 bg-gray-50/80 dark:bg-slate-800/80 rounded-xl border border-gray-200 dark:border-slate-700">
                  <span className="text-[10px] font-medium text-gray-400 uppercase block">Telas com Campo</span>
                  <span className="text-xl font-heading font-bold text-gray-900 dark:text-slate-100 tabular-nums">{activeParam.screensCount}</span>
                </div>
                <div className="p-3 bg-gray-50/80 dark:bg-slate-800/80 rounded-xl border border-gray-200 dark:border-slate-700">
                  <span className="text-[10px] font-medium text-gray-400 uppercase block">Mapas Vinculados</span>
                  <span className="text-xl font-heading font-bold text-gray-900 dark:text-slate-100 tabular-nums">{activeParam.mapsCount}</span>
                </div>
              </div>

              {/* Distinct Values Sample */}
              <div>
                <h4 className="text-xs font-ui font-semibold uppercase text-gray-500 dark:text-slate-400 tracking-wider mb-2">
                  Valores Distintos Identificados ({activeParam.distinctValuesList.length})
                </h4>
                <div className={`flex flex-wrap gap-1.5 p-3 bg-gray-50/80 dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 ${isDistinctValuesExpanded ? 'max-h-[320px] overflow-y-auto custom-scrollbar' : ''}`}>
                  {displayedDistinctValues.map((val, idx) => {
                    const isSelected = selectedDistinctValue === val;
                    return (
                      <button 
                        key={idx}
                        onClick={() => handleSelectDistinctValue(val)}
                        className={`px-3 py-1.5 border rounded-lg text-xs font-mono transition-all outline-none focus:ring-2 focus:ring-bradesco-red/20 text-left ${
                          isSelected 
                            ? 'bg-bradesco-red text-white border-bradesco-red shadow-md' 
                            : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 text-gray-800 dark:text-slate-200 hover:border-gray-300 dark:hover:border-slate-500 hover:bg-gray-50 dark:hover:bg-slate-600 cursor-pointer'
                        }`}
                      >
                        {highlightText(val, effectiveSearchTerm)}
                      </button>
                    );
                  })}
                </div>
                
                {activeParam.distinctValuesList.length > 10 && (
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={() => setIsDistinctValuesExpanded(!isDistinctValuesExpanded)}
                      className="flex items-center gap-1 text-[11px] font-ui text-gray-500 hover:text-bradesco-red transition-colors px-2 py-1 rounded cursor-pointer"
                    >
                      {isDistinctValuesExpanded ? 'Recolher valores' : `Ver todos os valores (${activeParam.distinctValuesList.length})`}
                      <ChevronDown className={`w-3 h-3 transition-transform ${isDistinctValuesExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                )}
              </div>

              {/* Associated Maps */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-ui font-semibold uppercase text-gray-500 dark:text-slate-400 tracking-wider">
                    {selectedDistinctValue 
                      ? 'Mapas com o valor selecionado' 
                      : 'Mapas onde o parâmetro está presente'}
                  </h4>
                  {selectedDistinctValue && (
                    <span className="text-[10px] font-medium bg-red-100 text-bradesco-red dark:bg-red-900/30 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-900/50">
                      {activeParamFilteredMaps.length} encontrados
                    </span>
                  )}
                </div>
                
                {activeParamFilteredMaps.length === 0 ? (
                  <div className="p-6 text-center bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-gray-200 dark:border-slate-700 text-sm text-gray-500 dark:text-slate-400">
                    Nenhum mapa encontrado com este valor.
                  </div>
                ) : (
                  <>
                    <div className={`space-y-2 ${isMapsExpanded ? 'max-h-[60vh] overflow-y-auto custom-scrollbar' : ''}`}>
                      {displayedMaps.map(mapItem => (
                        <div 
                          key={mapItem.id}
                          onClick={() => onOpenMap(mapItem)}
                          className={`p-3 bg-gray-50/80 dark:bg-slate-800 hover:bg-red-50/50 dark:hover:bg-slate-750 rounded-xl border flex items-center justify-between cursor-pointer transition-colors group ${
                            selectedDistinctValue ? 'border-l-4 border-l-bradesco-red border-y-gray-200 border-r-gray-200 dark:border-y-slate-700 dark:border-r-slate-700' : 'border-gray-200 dark:border-slate-700'
                          }`}
                        >
                          <div className="overflow-hidden pr-2">
                            <p className="text-xs font-bold text-gray-900 dark:text-slate-100 group-hover:text-bradesco-red transition-colors truncate">
                              {mapItem.titulo}
                            </p>
                            <span className="text-[10px] text-gray-400">
                              {mapItem.produto} • {mapItem.subproduto || 'Geral'}
                            </span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-bradesco-red shrink-0" />
                        </div>
                      ))}
                    </div>
                    
                    {activeParamFilteredMaps.length > 3 && (
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={() => setIsMapsExpanded(!isMapsExpanded)}
                          className="flex items-center gap-1 text-[11px] font-ui text-gray-500 hover:text-bradesco-red transition-colors px-2 py-1 rounded cursor-pointer"
                        >
                          {isMapsExpanded ? 'Recolher mapas' : `Ver todos os mapas (${activeParamFilteredMaps.length})`}
                          <ChevronDown className={`w-3 h-3 transition-transform ${isMapsExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-gray-400 flat-card border border-gray-200 dark:border-slate-800 rounded-2xl shadow-neu-card">
              Selecione um parâmetro para inspecionar seus detalhes e ocorrências.
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
};
