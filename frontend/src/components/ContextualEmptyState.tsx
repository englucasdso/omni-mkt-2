import React from 'react';
import { Search, RotateCcw, X } from 'lucide-react';

export interface ContextualEmptyStateProps {
  searchTerm?: string;
  hasActiveFilters?: boolean;
  onClearSearch?: () => void;
  onClearFilters?: () => void;
  onClearAll?: () => void;
  customTitle?: string;
  customDescription?: string;
  className?: string;
}

export const ContextualEmptyState: React.FC<ContextualEmptyStateProps> = ({
  searchTerm = '',
  hasActiveFilters = false,
  onClearSearch,
  onClearFilters,
  onClearAll,
  customTitle,
  customDescription,
  className = '',
}) => {
  const hasSearch = Boolean(searchTerm && searchTerm.trim().length > 0);
  const title = customTitle || 'Nenhum resultado encontrado';

  let description = customDescription;
  if (!description) {
    if (hasSearch && hasActiveFilters) {
      description = `Não encontramos itens correspondentes a “${searchTerm}” com os filtros aplicados nesta visualização.`;
    } else if (hasSearch) {
      description = `Não encontramos itens correspondentes a “${searchTerm}” nesta visualização.`;
    } else if (hasActiveFilters) {
      description = 'Não encontramos itens correspondentes aos critérios de filtro selecionados nesta visualização.';
    } else {
      description = 'Nenhum item disponível para exibição nesta visualização.';
    }
  }

  return (
    <div 
      className={`w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-8 sm:p-12 text-center shadow-neu-card ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Ícone discreto em cinza neutro */}
      <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 flex items-center justify-center mx-auto mb-4">
        <Search className="w-5 h-5" />
      </div>

      {/* Título */}
      <h3 className="text-base font-heading font-bold text-gray-900 dark:text-slate-100 mb-1.5">
        {title}
      </h3>

      {/* Descrição */}
      <p className="text-xs font-ui text-gray-600 dark:text-slate-300 max-w-md mx-auto mb-1">
        {description}
      </p>

      {/* Texto auxiliar */}
      {(hasSearch || hasActiveFilters) && (
        <p className="text-[11px] font-ui text-gray-400 dark:text-slate-500 max-w-md mx-auto mb-6">
          Tente usar menos palavras, verificar a escrita ou remover alguns filtros.
        </p>
      )}

      {/* Ações */}
      {(hasSearch || hasActiveFilters) && (
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
          {hasSearch && onClearSearch && (
            <button
              type="button"
              onClick={onClearSearch}
              className="btn-neu inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-ui font-semibold text-gray-700 dark:text-slate-200 hover:text-gray-900 cursor-pointer"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
              Limpar busca
            </button>
          )}

          {hasActiveFilters && onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="btn-neu inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-ui font-semibold text-[#7B0209] hover:text-[#5E0207] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#7B0209]" />
              Limpar filtros
            </button>
          )}

          {hasSearch && hasActiveFilters && onClearAll && (
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-ui font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpar tudo
            </button>
          )}
        </div>
      )}
    </div>
  );
};
