import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, X, SlidersHorizontal, Check } from 'lucide-react';
import type { ParameterCriterion } from '../../workers/artifactSearch.worker';
import { searchWorkerClient } from '../../services/searchWorkerClient';

export interface ParameterCriteriaBuilderProps {
  criteria: ParameterCriterion[];
  onChangeCriteria: (criteria: ParameterCriterion[]) => void;
  combination: 'AND' | 'OR';
  onChangeCombination: (combination: 'AND' | 'OR') => void;
  scope: 'SNIPPET' | 'SCREEN';
  onChangeScope: (scope: 'SNIPPET' | 'SCREEN') => void;
  onSearch: () => void;
}

export const ParameterCriteriaBuilder: React.FC<ParameterCriteriaBuilderProps> = ({
  criteria,
  onChangeCriteria,
  combination,
  onChangeCombination,
  scope,
  onChangeScope,
  onSearch,
}) => {
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [focusedField, setFocusedField] = useState<'name' | 'path' | 'value' | null>(null);

  const fetchSuggestions = async (field: 'nome' | 'caminho' | 'valor', text: string) => {
    try {
      const list = await searchWorkerClient.getParameterSuggestions(field, text, 8);
      setSuggestions(list);
    } catch {
      setSuggestions([]);
    }
  };

  const handleAddCriterion = () => {
    onChangeCriteria([
      ...criteria,
      { field: 'nome', operator: 'contem', value: '' },
    ]);
  };

  const handleRemoveCriterion = (index: number) => {
    const next = [...criteria];
    next.splice(index, 1);
    onChangeCriteria(next);
  };

  const handleUpdateCriterion = (index: number, updates: Partial<ParameterCriterion>) => {
    const next = [...criteria];
    next[index] = { ...next[index], ...updates };
    onChangeCriteria(next);
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar: Combination + Scope + Add Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700">
        <div className="flex flex-wrap items-center gap-3">
          {/* AND / OR Combination */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-semibold">
            <button
              type="button"
              onClick={() => onChangeCombination('AND')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                combination === 'AND'
                  ? 'bg-[#7B0209] text-white'
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
              }`}
            >
              Todos — AND
            </button>
            <button
              type="button"
              onClick={() => onChangeCombination('OR')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                combination === 'OR'
                  ? 'bg-[#7B0209] text-white'
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
              }`}
            >
              Qualquer — OR
            </button>
          </div>

          {/* Scope: Same Snippet vs Same Screen */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-semibold">
            <button
              type="button"
              onClick={() => onChangeScope('SNIPPET')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                scope === 'SNIPPET'
                  ? 'bg-[#7B0209] text-white'
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
              }`}
            >
              No mesmo snippet
            </button>
            <button
              type="button"
              onClick={() => onChangeScope('SCREEN')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                scope === 'SCREEN'
                  ? 'bg-[#7B0209] text-white'
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
              }`}
            >
              Na mesma tela
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {criteria.length > 0 && (
            <button
              type="button"
              onClick={() => onChangeCriteria([])}
              className="px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-700 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Limpar critérios
            </button>
          )}

          <button
            type="button"
            onClick={handleAddCriterion}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#7B0209] text-white hover:bg-[#600207] shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar parâmetro
          </button>
        </div>
      </div>

      {/* Criteria Rows */}
      {criteria.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-2xl bg-gray-50/50 dark:bg-slate-900/50 space-y-3">
          <SlidersHorizontal className="w-8 h-8 text-gray-300 dark:text-slate-600 mx-auto" />
          <p className="text-sm font-medium text-gray-600 dark:text-slate-400">
            Adicione um ou mais parâmetros para iniciar a busca.
          </p>
          <div className="flex flex-wrap justify-center gap-2 text-xs text-gray-400">
            <span>Exemplos rápidos:</span>
            <button
              type="button"
              onClick={() =>
                onChangeCriteria([
                  { field: 'nome', operator: 'existe', value: 'event' },
                  { field: 'nome', operator: 'contem', value: 'produto' },
                ])
              }
              className="text-[#7B0209] dark:text-red-400 underline hover:no-underline cursor-pointer"
            >
              event existe + produto contém
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() =>
                onChangeCriteria([
                  { field: 'caminho', operator: 'contem', value: 'event_data' },
                  { field: 'valor', operator: 'contem', value: 'cartao' },
                ])
              }
              className="text-[#7B0209] dark:text-red-400 underline hover:no-underline cursor-pointer"
            >
              event_data + cartão
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {criteria.map((crit, idx) => (
            <div
              key={idx}
              className="relative flex flex-wrap items-center gap-2 p-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-850 shadow-sm"
            >
              <span className="text-[11px] font-mono font-bold text-gray-400 w-5 text-center">
                #{idx + 1}
              </span>

              {/* Field Selector */}
              <select
                value={crit.field}
                onChange={(e) =>
                  handleUpdateCriterion(idx, {
                    field: e.target.value as ParameterCriterion['field'],
                  })
                }
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-xs font-semibold text-gray-800 dark:text-slate-200 focus:outline-none focus:border-[#7B0209]"
              >
                <option value="nome">Nome do Parâmetro</option>
                <option value="caminho">Caminho (Path)</option>
                <option value="valor">Valor</option>
                <option value="qualquer">Qualquer Campo</option>
              </select>

              {/* Operator Selector */}
              <select
                value={crit.operator}
                onChange={(e) =>
                  handleUpdateCriterion(idx, {
                    operator: e.target.value as ParameterCriterion['operator'],
                  })
                }
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-xs font-semibold text-gray-800 dark:text-slate-200 focus:outline-none focus:border-[#7B0209]"
              >
                <option value="existe">existe</option>
                <option value="igual">igual a</option>
                <option value="contem">contém</option>
                <option value="comeca_com">começa com</option>
              </select>

              {/* Value Input with Auto-Suggestions */}
              <div className="flex-1 min-w-[200px] relative">
                <input
                  type="text"
                  value={crit.value}
                  placeholder={
                    crit.operator === 'existe'
                      ? 'Nome do parâmetro existente (ou deixe em branco)'
                      : 'Valor a buscar...'
                  }
                  onChange={(e) => {
                    handleUpdateCriterion(idx, { value: e.target.value });
                    if (crit.field !== 'qualquer') {
                      fetchSuggestions(crit.field, e.target.value);
                    }
                  }}
                  onFocus={() => {
                    setActiveSuggestionIdx(idx);
                    if (crit.field !== 'qualquer') {
                      fetchSuggestions(crit.field, crit.value);
                    }
                  }}
                  onBlur={() => {
                    // Small timeout to allow clicking a suggestion
                    setTimeout(() => setActiveSuggestionIdx(null), 200);
                  }}
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:outline-none focus:border-[#7B0209]"
                />

                {/* Suggestions Dropdown */}
                {activeSuggestionIdx === idx && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl bg-white dark:bg-slate-850 border border-gray-200 dark:border-slate-700 shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                    <div className="px-2.5 py-1 bg-gray-50 dark:bg-slate-800 text-[10px] uppercase font-bold text-gray-400">
                      Sugestões do inventário
                    </div>
                    {suggestions.map((sug, sIdx) => (
                      <button
                        key={sIdx}
                        type="button"
                        onMouseDown={() => {
                          handleUpdateCriterion(idx, { value: sug });
                          setActiveSuggestionIdx(null);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-slate-200 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-[#7B0209] transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <span className="truncate">{sug}</span>
                        <Check className="w-3 h-3 opacity-0 hover:opacity-100 text-[#7B0209]" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Remove Button */}
              <button
                type="button"
                onClick={() => handleRemoveCriterion(idx)}
                className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Remover critério"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
