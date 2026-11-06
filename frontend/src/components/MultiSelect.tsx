import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { FilterField } from './FilterField';

interface MultiSelectProps {
  label: string;
  icon?: React.ElementType;
  options: { v: string; l: string }[];
  values: string[];
  onChange: (values: string[]) => void;
}

export function MultiSelect({ label, icon, options, values, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const hasSelections = values.length > 0;
  
  const toggle = (val: string) => {
    if (val === 'all') {
      onChange([]);
    } else {
      if (values.includes(val)) {
        onChange(values.filter(v => v !== val));
      } else {
        onChange([...values, val]);
      }
    }
  };

  const currentLabel = hasSelections 
    ? `${values.length} selecionados` 
    : (options.find(o => o.v === 'all')?.l || 'Todos');

  return (
    <div className="relative" ref={ref}>
      <FilterField label={label} icon={icon}>
        <button 
          onClick={() => setOpen(!open)}
          type="button"
          className={`neu-input w-full px-3 py-2 rounded-xl text-xs font-ui font-semibold text-gray-800 dark:text-slate-200 bg-gray-50/80 dark:bg-slate-800/80 border outline-none cursor-pointer flex items-center justify-between gap-2 text-left
            ${open 
              ? 'border-bradesco-red ring-1 ring-bradesco-red' 
              : 'border-gray-200 dark:border-slate-700 focus:border-bradesco-red'}
            ${hasSelections ? 'border-bradesco-red/40 text-bradesco-red' : ''}
          `}
        >
          <span className="truncate">{currentLabel}</span>
          <ChevronDown className="w-4 h-4 text-gray-400 dark:text-slate-500 shrink-0" />
        </button>
      </FilterField>

      {open && (
        <div className="absolute top-full left-0 right-0 w-full mt-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-neu-card rounded-xl z-[100] overflow-hidden flex flex-col text-left">
          <div className="max-h-60 overflow-y-auto p-1.5 flex flex-col gap-0.5 custom-scrollbar">
            <button 
              onClick={() => toggle('all')}
              className="flex items-center gap-2.5 p-2 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer w-full text-left transition-colors"
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${!hasSelections ? 'bg-bradesco-red border-bradesco-red' : 'border-gray-300 dark:border-slate-600'}`}>
                {!hasSelections && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-xs font-ui font-semibold text-gray-700 dark:text-slate-200 truncate">
                {options.find(o => o.v === 'all')?.l || 'TODOS'}
              </span>
            </button>
            <div className="h-px bg-gray-100 dark:bg-slate-800 my-1 mx-2" />
            {options.filter(o => o.v !== 'all').map(opt => {
              const isSelected = values.includes(opt.v);
              return (
                <button 
                  key={opt.v}
                  onClick={() => toggle(opt.v)}
                  title={opt.l}
                  className="flex items-center gap-2.5 p-2 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer w-full text-left transition-colors"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-bradesco-red border-bradesco-red' : 'border-gray-300 dark:border-slate-600'}`}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-xs font-ui font-medium text-gray-700 dark:text-slate-200 truncate">{opt.l}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
