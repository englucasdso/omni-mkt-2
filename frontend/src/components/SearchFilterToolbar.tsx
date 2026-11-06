import React, { useState, ReactNode } from 'react';
import { Search, SlidersHorizontal, X, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface SearchFilterToolbarProps {
  /** The value of the search input */
  searchValue?: string;
  /** Callback when search value changes */
  onSearchChange?: (value: string) => void;
  /** Placeholder for the search input */
  searchPlaceholder?: string;
  /** Renders the expandable filter area. If not provided, the "Filtros" button is hidden. */
  filters?: ReactNode;
  /** The number of currently active filters, to display on the button badge */
  activeFiltersCount?: number;
  /** Callback to clear all filters */
  onClearFilters?: () => void;
  /** If true, the component will not render the search bar and filter button, only the filters themselves in a compact right-aligned bar (for Insights mode) */
  insightsMode?: boolean;
}

export const SearchFilterToolbar: React.FC<SearchFilterToolbarProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar...",
  filters,
  activeFiltersCount = 0,
  onClearFilters,
  insightsMode = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (insightsMode) {
    return (
      <div className="w-full min-w-0 max-w-full flex flex-col md:flex-row md:justify-end gap-3 mb-6">
        {filters}
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full mb-6 flat-card border border-gray-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-neu-card overflow-hidden">
      {/* Main Bar: Search + Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3 p-3">
        {/* Search Field */}
        <div className="relative flex-1 w-full min-w-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue || ''}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50/50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-bradesco-red/20 outline-none transition-all dark:text-slate-200 placeholder:text-gray-400 min-w-0"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          {activeFiltersCount > 0 && onClearFilters && (
            <button
              onClick={onClearFilters}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-ui font-medium text-gray-500 hover:text-bradesco-red dark:text-slate-400 transition-colors w-full sm:w-auto justify-center"
            >
              <X className="w-3.5 h-3.5" />
              Limpar filtros
            </button>
          )}

          {filters && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-ui font-medium transition-colors border w-full sm:w-auto justify-center shrink-0 ${
                isExpanded || activeFiltersCount > 0
                  ? 'bg-red-50/50 dark:bg-slate-800 border-bradesco-red text-bradesco-red shadow-sm'
                  : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-750 shadow-sm'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtros
              {activeFiltersCount > 0 && (
                <span className="flex items-center justify-center w-5 h-5 rounded-md bg-bradesco-red text-white text-[10px] font-bold">
                  {activeFiltersCount}
                </span>
              )}
              {isExpanded ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
            </button>
          )}
        </div>
      </div>

      {/* Expandable Filters Area */}
      <AnimatePresence>
        {isExpanded && filters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-gray-100 dark:border-slate-800"
          >
            <div className="p-4 sm:p-5">
              {filters}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
