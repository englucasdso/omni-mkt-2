import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  RotateCcw, 
  Search, 
  Check, 
  SlidersHorizontal 
} from 'lucide-react';

interface SidebarFilterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  title?: string;
  activeCount?: number;
  onResetAll?: () => void;
  children: React.ReactNode;
}

export const SidebarFilterPopover: React.FC<SidebarFilterPopoverProps> = ({
  isOpen,
  onClose,
  anchorRef,
  title = 'Filtros',
  activeCount = 0,
  onResetAll,
  children,
}) => {
  const [isMobile, setIsMobile] = useState(false);
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Position calculation for desktop
  const updatePosition = () => {
    if (isMobile || !anchorRef.current || !isOpen) return;

    const anchorRect = anchorRef.current.getBoundingClientRect();
    const popoverWidth = 340;
    const padding = 16;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Coloca à direita do botão/sidebar com um respiro de 12px
    let left = anchorRect.right + 12;
    if (left + popoverWidth > windowWidth - padding) {
      left = windowWidth - popoverWidth - padding;
    }

    // Alinhamento vertical ancorado
    const popoverEl = popoverRef.current;
    const popoverHeight = popoverEl ? popoverEl.offsetHeight : 480;

    // Tenta alinhar a base do popover com o botão ou centralizar
    let top = anchorRect.bottom - popoverHeight;
    if (top < padding) {
      top = padding;
    }
    if (top + popoverHeight > windowHeight - padding) {
      top = windowHeight - popoverHeight - padding;
    }

    setPopoverCoords({ top, left });
  };

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, isMobile]);

  useEffect(() => {
    if (!isOpen) return;

    const handleWindowChange = () => {
      updatePosition();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current && 
        !popoverRef.current.contains(target) &&
        anchorRef.current && 
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    };

    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const content = (
    <>
      {/* Backdrop transparente ou sutil para mobile */}
      <div 
        className={`fixed inset-0 z-50 transition-opacity duration-200 ${
          isMobile ? 'bg-black/40 backdrop-blur-sm' : 'bg-transparent pointer-events-none'
        }`}
        onClick={isMobile ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Popover container */}
      <div
        ref={popoverRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={!isMobile ? { top: `${popoverCoords.top}px`, left: `${popoverCoords.left}px` } : undefined}
        className={`z-50 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-2xl flex flex-col transition-all duration-150 ${
          isMobile
            ? 'fixed bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl'
            : 'fixed w-[340px] max-h-[calc(100vh-32px)] rounded-2xl'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-800/80 shrink-0">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#7B0209]" />
            <h3 className="text-sm font-heading font-bold text-gray-900 dark:text-slate-100">
              {title}
            </h3>
            {activeCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-ui font-bold bg-[#7B0209] text-white tabular-nums">
                {activeCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {activeCount > 0 && onResetAll && (
              <button
                type="button"
                onClick={onResetAll}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-ui font-semibold text-[#7B0209] hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                title="Limpar todos os filtros"
              >
                <RotateCcw className="w-3 h-3 text-[#7B0209]" />
                Limpar
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Fechar painel de filtros"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body com scroll interno */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 text-xs font-ui">
          {children}
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
};

// -------------------------------------------------------------
// Componentes Modernos de Controle (sem <select> nativo)
// -------------------------------------------------------------

/**
 * Segmented Control / Chip Row para poucas opções exclusivas
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function FilterSegmentedRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (val: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-ui font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider block">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isSelected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-ui font-medium transition-colors cursor-pointer border ${
                isSelected
                  ? 'bg-red-50 dark:bg-red-950/40 text-[#7B0209] border-[#7B0209]/40 font-semibold shadow-sm'
                  : 'bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700/80'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Single Select pesquisável para listas médias/extensas (ex: Responsável, Ano, Subproduto)
 */
export function FilterSearchableSingle({
  label,
  options,
  value,
  onChange,
  allOptionLabel = 'Todos',
  placeholder = 'Buscar...',
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (val: string) => void;
  allOptionLabel?: string;
  placeholder?: string;
}) {
  const [internalQuery, setInternalQuery] = useState('');
  const isDefaultSelected = !value || value === 'todos' || value === 'todas' || value === 'TODOS' || value === 'all';

  const filteredOptions = options.filter(opt => 
    opt.toLowerCase().includes(internalQuery.toLowerCase().trim())
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-ui font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
          {label}
        </label>
        {!isDefaultSelected && (
          <button
            type="button"
            onClick={() => onChange(options.includes('TODOS') ? 'TODOS' : options.includes('all') ? 'all' : options.includes('todas') ? 'todas' : 'todos')}
            className="text-[10px] text-[#7B0209] hover:underline font-medium cursor-pointer"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Chip ativo removível */}
      {!isDefaultSelected && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-50 dark:bg-red-950/40 text-[#7B0209] border border-[#7B0209]/30">
            <span className="truncate max-w-[240px]">{value}</span>
            <button
              type="button"
              onClick={() => onChange(options.includes('TODOS') ? 'TODOS' : options.includes('all') ? 'all' : options.includes('todas') ? 'todas' : 'todos')}
              className="p-0.5 hover:bg-[#7B0209]/10 rounded cursor-pointer"
            >
              <X className="w-3 h-3 text-[#7B0209]" />
            </button>
          </span>
        </div>
      )}

      {/* Campo de busca interno caso haja mais de 5 itens */}
      {options.length > 5 && (
        <div className="relative w-full">
          <Search className="w-3 h-3 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder={placeholder}
            value={internalQuery}
            onChange={(e) => setInternalQuery(e.target.value)}
            className="w-full pl-7 pr-6 py-1 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-slate-600"
          />
          {internalQuery && (
            <button
              type="button"
              onClick={() => setInternalQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      )}

      {/* Lista de opções em chips/lista rolável */}
      <div className="max-h-36 overflow-y-auto custom-scrollbar flex flex-wrap gap-1 pt-1">
        <button
          type="button"
          onClick={() => onChange(options.includes('TODOS') ? 'TODOS' : options.includes('all') ? 'all' : options.includes('todas') ? 'todas' : 'todos')}
          className={`px-2 py-1 rounded-lg text-xs font-ui transition-colors cursor-pointer border text-left ${
            isDefaultSelected
              ? 'bg-red-50 dark:bg-red-950/40 text-[#7B0209] border-[#7B0209]/40 font-semibold'
              : 'bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-100'
          }`}
        >
          {allOptionLabel}
        </button>

        {filteredOptions.map((opt) => {
          const isSelected = opt === value;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`px-2 py-1 rounded-lg text-xs font-ui transition-colors cursor-pointer border truncate max-w-[280px] text-left ${
                isSelected
                  ? 'bg-red-50 dark:bg-red-950/40 text-[#7B0209] border-[#7B0209]/40 font-semibold'
                  : 'bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-100'
              }`}
            >
              {opt}
            </button>
          );
        })}

        {filteredOptions.length === 0 && (
          <span className="text-[11px] text-gray-400 p-1">Nenhuma opção encontrada</span>
        )}
      </div>
    </div>
  );
}

/**
 * MultiSelect moderno com busca interna, checkboxes e chips removíveis no topo
 */
export function FilterMultiSelectSearchable({
  label,
  options,
  values,
  onChange,
  placeholder = 'Buscar...',
}: {
  label: string;
  options: { v: string; l: string }[];
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
}) {
  const [internalQuery, setInternalQuery] = useState('');
  const activeSelected = (values || []).filter(v => v !== 'all');

  const filteredOptions = options.filter(opt => 
    opt.v !== 'all' && opt.l.toLowerCase().includes(internalQuery.toLowerCase().trim())
  );

  const handleToggle = (val: string) => {
    if (activeSelected.includes(val)) {
      onChange(activeSelected.filter(v => v !== val));
    } else {
      onChange([...activeSelected, val]);
    }
  };

  const handleClear = () => {
    onChange([]);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-ui font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
            {label}
          </label>
          {activeSelected.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#7B0209] text-white">
              {activeSelected.length}
            </span>
          )}
        </div>
        {activeSelected.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="text-[10px] text-[#7B0209] hover:underline font-medium cursor-pointer"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Chips selecionados no topo */}
      {activeSelected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {activeSelected.map(val => {
            const opt = options.find(o => o.v === val);
            const displayLabel = opt ? opt.l.replace(/\s*\(\d+\)$/, '') : val;
            return (
              <span 
                key={val}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-red-50 dark:bg-red-950/40 text-[#7B0209] border border-[#7B0209]/30"
              >
                <span className="truncate max-w-[140px]">{displayLabel}</span>
                <button
                  type="button"
                  onClick={() => handleToggle(val)}
                  className="hover:text-red-800 cursor-pointer"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Busca interna se houver mais de 4 opções */}
      {options.length > 4 && (
        <div className="relative w-full">
          <Search className="w-3 h-3 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder={placeholder}
            value={internalQuery}
            onChange={(e) => setInternalQuery(e.target.value)}
            className="w-full pl-7 pr-6 py-1 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-slate-600"
          />
          {internalQuery && (
            <button
              type="button"
              onClick={() => setInternalQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      )}

      {/* Lista com checkboxes */}
      <div className="max-h-36 overflow-y-auto custom-scrollbar border border-gray-100 dark:border-slate-800 rounded-lg p-1 space-y-0.5 bg-gray-50/50 dark:bg-slate-800/50">
        {filteredOptions.map((opt) => {
          const isChecked = activeSelected.includes(opt.v);
          return (
            <button
              key={opt.v}
              type="button"
              onClick={() => handleToggle(opt.v)}
              className="w-full flex items-center justify-between px-2 py-1 rounded text-left text-xs hover:bg-gray-100 dark:hover:bg-slate-700/60 cursor-pointer transition-colors"
            >
              <span className={`truncate mr-2 ${isChecked ? 'font-semibold text-gray-900 dark:text-slate-100' : 'text-gray-600 dark:text-slate-400'}`}>
                {opt.l}
              </span>
              <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0 transition-colors ${
                isChecked 
                  ? 'bg-[#7B0209] border-[#7B0209] text-white' 
                  : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800'
              }`}>
                {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
              </div>
            </button>
          );
        })}
        {filteredOptions.length === 0 && (
          <div className="text-[11px] text-gray-400 p-2 text-center">
            Nenhuma opção encontrada
          </div>
        )}
      </div>
    </div>
  );
}
