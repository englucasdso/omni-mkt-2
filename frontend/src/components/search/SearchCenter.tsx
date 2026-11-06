import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  X,
  SlidersHorizontal,
  Sparkles,
  FileText,
  Loader2,
  Activity,
  AlertCircle,
  RefreshCw,
  Code2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Artifact, ActiveSearch, ParameterArtifactGroupSummary } from '../../types';
import { searchWorkerClient } from '../../services/searchWorkerClient';
import type { ParameterCriterion } from '../../workers/artifactSearch.worker';

export interface SearchCenterProps {
  artifacts: Artifact[];
  activeSearch?: ActiveSearch | null;
  resetSignal?: number;
  onApplyToCards?: (
    query: string,
    filteredIds: string[],
    meta?: {
      mode: 'conteudo' | 'parametros' | 'ia';
      parameterCriteria?: ParameterCriterion[];
      aiQuestion?: string;
      scope?: 'SNIPPET' | 'SCREEN';
      operator?: 'AND' | 'OR';
      parameterGroups?: Record<string, ParameterArtifactGroupSummary>;
      matchedTerms?: string[];
      queryKind?: string;
    }
  ) => void;
  onNavigateToOperationalInsights?: () => void;
  // Optional callbacks kept for API compatibility
  onOpenDetails?: (artifact: Artifact) => void;
  onOpenSnippet?: (artifact: Artifact, screenId?: string, snippetIndex?: number) => void;
  onViewInTree?: (artifactId: string) => void;
  onOpenJourney?: (mapId: string) => void;
}

const PARAM_EXAMPLES = [
  {
    title: 'Nome de parâmetro',
    label: 'user_id',
    code: 'user_id',
    description: 'Localiza artefatos que usam este parâmetro',
  },
  {
    title: 'Nome e valor',
    label: 'tipo_pessoa: "PF"',
    code: 'tipo_pessoa: "PF"',
    description: 'Chave e valor específico',
  },
  {
    title: 'Fragmento de código',
    label: 'event + produto + tipo_pessoa',
    code: `event: "contratacao",
produto: "credito",
tipo_pessoa: "PF"`,
    description: 'Múltiplos parâmetros no trecho',
  },
  {
    title: 'Disparo completo',
    label: 'dataLayer.push({ ... })',
    code: `dataLayer.push({
  event: "contratacao",
  produto: "credito",
  tipo_pessoa: "PF"
});`,
    description: 'Engenharia reversa a partir de snippet completo',
  },
];

export const SearchCenter: React.FC<SearchCenterProps> = ({
  artifacts,
  activeSearch,
  resetSignal,
  onApplyToCards,
  onNavigateToOperationalInsights,
}) => {
  // Current Mode: 'conteudo' | 'parametros' | 'ia'
  const [mode, setMode] = useState<'conteudo' | 'parametros' | 'ia'>('conteudo');

  // Input states per mode
  const [contentQuery, setContentQuery] = useState('');
  const [paramInput, setParamInput] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');

  // Parameter mode controls
  const [criteriaCombination, setCriteriaCombination] = useState<'AND' | 'OR'>('AND');
  const [criteriaScope, setCriteriaScope] = useState<'SNIPPET' | 'SCREEN'>('SNIPPET');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(true);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(true);

  // Status & Feedback states
  const [isSearching, setIsSearching] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-resize for textarea in parameter mode
  const adjustTextareaHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollH = textareaRef.current.scrollHeight;
      const newH = Math.min(Math.max(scrollH, 44), 260);
      textareaRef.current.style.height = `${newH}px`;
    }
  }, []);

  useEffect(() => {
    if (mode === 'parametros') {
      adjustTextareaHeight();
    }
  }, [mode, paramInput, adjustTextareaHeight]);

  // Função interna para zerar completamente a pesquisa do SearchCenter
  const resetInternalSearch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMode('conteudo');
    setContentQuery('');
    setParamInput('');
    setAiQuestion('');
    setCriteriaCombination('AND');
    setCriteriaScope('SNIPPET');
    setShowAdvancedOptions(false);
    setIgnoreCase(true);
    setIgnoreWhitespace(true);
    setIsSearching(false);
    setAiLoading(false);
    setAiError(null);
    setIsFocused(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
  }, []);

  // Sync index with worker
  useEffect(() => {
    if (artifacts && artifacts.length > 0) {
      searchWorkerClient.initIndex(artifacts).catch((err) => {
        console.warn('[SearchCenter] Worker index init:', err);
      });
    }
  }, [artifacts]);

  // Sync state from activeSearch when present or restored, or reset when cleared
  useEffect(() => {
    if (activeSearch) {
      setMode(activeSearch.mode);
      if (activeSearch.mode === 'conteudo') {
        setContentQuery(activeSearch.query || '');
      } else if (activeSearch.mode === 'parametros') {
        setParamInput(activeSearch.query || '');
        if (activeSearch.operator) {
          setCriteriaCombination(activeSearch.operator);
        }
        if (activeSearch.scope) {
          setCriteriaScope(activeSearch.scope);
        }
      } else if (activeSearch.mode === 'ia') {
        setAiQuestion(activeSearch.aiQuestion || activeSearch.query || '');
      }
    } else if (activeSearch === null) {
      resetInternalSearch();
    }
  }, [activeSearch, resetInternalSearch]);

  // Listener explícito de sinal de reset central
  const prevResetSignalRef = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal !== undefined && resetSignal !== prevResetSignalRef.current) {
      prevResetSignalRef.current = resetSignal;
      resetInternalSearch();
    }
  }, [resetSignal, resetInternalSearch]);

  // Titles per mode
  const getModeTitle = () => {
    switch (mode) {
      case 'conteudo':
        return 'Qual artefato você quer encontrar?';
      case 'parametros':
        return 'Buscar por parâmetros ou trecho de código';
      case 'ia':
        return 'O que você gostaria de perguntar à IA sobre os artefatos?';
    }
  };

  // Placeholders per mode
  const getModePlaceholder = () => {
    switch (mode) {
      case 'conteudo':
        return 'Busque por ID, nome do mapa ou qualquer termo relacionado';
      case 'parametros':
        return 'Cole aqui um trecho de código, dataLayer.push, objeto JSON ou parâmetros como tipo_pessoa: "PF"';
      case 'ia':
        return 'Ex: Onde é disparado o evento de confirmação de pagamento?';
    }
  };

  // Current input value based on mode
  const currentInputValue =
    mode === 'conteudo' ? contentQuery : mode === 'parametros' ? paramInput : aiQuestion;

  const handleInputChange = (val: string) => {
    if (mode === 'conteudo') {
      setContentQuery(val);
    } else if (mode === 'parametros') {
      setParamInput(val);
    } else {
      setAiQuestion(val);
      if (aiError) setAiError(null);
    }
  };

  const handleClearInput = () => {
    if (mode === 'conteudo') {
      setContentQuery('');
      inputRef.current?.focus();
    } else if (mode === 'parametros') {
      setParamInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '44px';
        textareaRef.current.focus();
      }
    } else {
      setAiQuestion('');
      setAiError(null);
      inputRef.current?.focus();
    }
  };

  // Execute Search in Conteúdo Mode
  const executeContentSearch = async (searchQuery: string) => {
    const q = searchQuery.trim();
    setIsSearching(true);
    try {
      if (!q || q.toLowerCase() === 'inventario' || q.toLowerCase() === 'inventário') {
        const allIds = artifacts.map((a) => String(a.id));
        onApplyToCards?.(q, allIds, { mode: 'conteudo' });
        return;
      }

      const res = await searchWorkerClient.searchContent(q, 500);
      const filteredIds = Array.from(new Set(res.results.map((r) => String(r.artifactId))));
      onApplyToCards?.(q, filteredIds, { mode: 'conteudo' });
    } catch (err) {
      console.error('[SearchCenter] Content search error:', err);
      // Fallback: match in inventory
      const lower = q.toLowerCase();
      const fallbackIds = artifacts
        .filter(
          (a) =>
            a.id?.toLowerCase().includes(lower) ||
            a.titulo?.toLowerCase().includes(lower) ||
            a.produto?.toLowerCase().includes(lower) ||
            a.subproduto?.toLowerCase().includes(lower)
        )
        .map((a) => String(a.id));
      onApplyToCards?.(q, fallbackIds, { mode: 'conteudo' });
    } finally {
      setIsSearching(false);
    }
  };

  // Execute Search in Parâmetros Mode (Deterministic Code & Parameter reverse-engineering)
  const executeParamSearch = async (overrideInput?: string) => {
    const rawQuery = (overrideInput !== undefined ? overrideInput : paramInput).trim();
    setIsSearching(true);
    try {
      if (!rawQuery) {
        // If empty, return all artifacts
        const allIds = artifacts.map((a) => String(a.id));
        onApplyToCards?.('', allIds, {
          mode: 'parametros',
          scope: criteriaScope,
          operator: criteriaCombination,
        });
        return;
      }

      const res = await searchWorkerClient.searchCodeAndParameters(rawQuery, {
        scope: criteriaScope,
        condition: criteriaCombination,
        limit: 500,
      });

      const groupMap: Record<string, ParameterArtifactGroupSummary> = {};
      const allGroups = [...res.completeGroups, ...res.partialGroups];
      allGroups.forEach((g) => {
        groupMap[g.artifactId] = {
          artifactId: g.artifactId,
          totalOccurrences: g.totalOccurrences,
          uniqueScreensCount: g.uniqueScreensCount,
          uniqueSnippetsCount: g.uniqueSnippetsCount,
          bestQuality: g.bestQuality,
          bestQualityLabel: g.bestQualityLabel,
          bestQualityScore: g.bestQualityScore,
          isPartial: g.isPartial,
          occurrences: g.occurrences.map((occ) => ({
            screenId: occ.screenId,
            screenIndex: occ.screenIndex,
            screenTitle: occ.screenTitle,
            snippetIndex: occ.snippetIndex,
            event: occ.event,
            quality: occ.quality,
            qualityLabel: occ.qualityLabel,
            rawCodePreview: occ.rawCodePreview,
            rawCodeFull: occ.rawCodeFull,
            matchedTerms: occ.matchedTerms,
          })),
        };
      });

      const matchedTerms = res.extractedParams.flatMap((p) =>
        [p.name, p.value].filter((v): v is string => Boolean(v))
      );

      onApplyToCards?.(rawQuery, res.allArtifactIds, {
        mode: 'parametros',
        scope: criteriaScope,
        operator: criteriaCombination,
        parameterGroups: groupMap,
        matchedTerms,
        queryKind: res.queryKind,
      });
    } catch (err) {
      console.error('[SearchCenter] Parameter search error:', err);
      onApplyToCards?.(rawQuery, [], {
        mode: 'parametros',
        scope: criteriaScope,
        operator: criteriaCombination,
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectParamExample = (code: string) => {
    setParamInput(code);
    setTimeout(() => {
      adjustTextareaHeight();
    }, 0);
    executeParamSearch(code);
  };

  // Execute Search in Perguntar à IA Mode
  const executeAiSearch = async (questionToAsk?: string) => {
    const q = (questionToAsk !== undefined ? questionToAsk : aiQuestion).trim();
    if (!q) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setAiLoading(true);
    setAiError(null);

    try {
      const response = await fetch('/api/search/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
        signal: abortController.signal,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.message || data.error || 'Serviço de IA temporariamente indisponível.'
        );
      }

      const rawResults = Array.isArray(data.results) ? data.results : [];
      const filteredIds: string[] = Array.from(
        new Set(
          rawResults
            .map((r: any) => String(r.artifactId || r.id || ''))
            .filter((id: string) => id.length > 0)
        )
      );

      onApplyToCards?.(q, filteredIds, {
        mode: 'ia',
        aiQuestion: q,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('[SearchCenter] AI Search error:', err);
      setAiError(
        err.message ||
          'Não foi possível consultar a IA no momento. Verifique a conexão ou tente novamente.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  // Central submit handler
  const handleExecuteSearch = () => {
    if (mode === 'conteudo') {
      executeContentSearch(contentQuery);
    } else if (mode === 'parametros') {
      executeParamSearch();
    } else if (mode === 'ia') {
      executeAiSearch();
    }
  };

  // Handle Enter key for single-line inputs
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleExecuteSearch();
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center justify-start">
      {/* Dynamic Animated Title */}
      <div className="flex flex-col items-center text-center justify-center mb-6 w-full gap-2 min-h-[60px]">
        <AnimatePresence mode="wait">
          <motion.h2
            key={mode}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="text-3xl sm:text-4xl font-normal text-gray-900 dark:text-slate-50 tracking-tight leading-tight"
          >
            {getModeTitle()}
          </motion.h2>
        </AnimatePresence>
      </div>

      {/* Mode Selector Segmented Control */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-gray-100/90 dark:bg-slate-800/90 border border-gray-200/80 dark:border-slate-700/80 shadow-inner mb-6">
        <button
          type="button"
          onClick={() => setMode('conteudo')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
            mode === 'conteudo'
              ? 'bg-[#7B0209] text-white shadow-sm'
              : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Conteúdo</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('parametros')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
            mode === 'parametros'
              ? 'bg-[#7B0209] text-white shadow-sm'
              : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Parâmetros</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('ia')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
            mode === 'ia'
              ? 'bg-[#7B0209] text-white shadow-sm'
              : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Perguntar à IA</span>
        </button>
      </div>

      {/* Central Unified Search Bar */}
      <div className="w-full relative mb-3">
        <div className="animated-border">
          <div
            className={`inner-container glass-card px-5 transition-all duration-300 ${
              mode === 'parametros' ? 'py-3.5 flex items-start gap-3.5' : 'py-3.5 flex items-center gap-3.5'
            } ${
              isFocused
                ? 'bg-white dark:bg-slate-900 border-[#7B0209]/40 shadow-md ring-2 ring-[#7B0209]/20'
                : 'border-gray-200 dark:border-slate-800'
            }`}
          >
            <div className={`shrink-0 ${mode === 'parametros' ? 'pt-1 text-[#7B0209]' : 'text-gray-400 dark:text-slate-500'}`}>
              {mode === 'parametros' ? (
                <Code2 className="w-5 h-5 text-[#7B0209]" />
              ) : (
                <Search className="w-5 h-5" />
              )}
            </div>

            {mode === 'parametros' ? (
              <textarea
                ref={textareaRef}
                value={paramInput}
                onChange={(e) => {
                  setParamInput(e.target.value);
                  adjustTextareaHeight();
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // Enter without shift on single line, or Ctrl/Cmd+Enter on multiline triggers search
                    if (e.ctrlKey || e.metaKey || (!e.shiftKey && !paramInput.includes('\n'))) {
                      e.preventDefault();
                      executeParamSearch(paramInput);
                    }
                  }
                }}
                placeholder={getModePlaceholder()}
                rows={1}
                className="w-full bg-transparent border-none outline-none font-mono text-xs sm:text-sm text-gray-900 dark:text-slate-50 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-0 resize-none overflow-y-auto custom-scrollbar max-h-64 leading-relaxed"
                style={{ minHeight: '44px' }}
              />
            ) : (
              <input
                ref={inputRef}
                type="text"
                value={mode === 'conteudo' ? contentQuery : aiQuestion}
                onChange={(e) => handleInputChange(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                placeholder={getModePlaceholder()}
                className="w-full bg-transparent border-none outline-none text-base sm:text-lg text-gray-900 dark:text-slate-50 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-0"
              />
            )}

            {/* Clear button */}
            {currentInputValue && !isSearching && !aiLoading && (
              <button
                type="button"
                onClick={handleClearInput}
                className={`p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 transition-colors shrink-0 ${
                  mode === 'parametros' ? 'mt-1' : ''
                }`}
                title="Limpar campo"
                aria-label="Limpar campo"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Spinner indicator if searching */}
            {(isSearching || aiLoading) && (
              <Loader2 className={`w-4 h-4 animate-spin text-[#7B0209] shrink-0 ${mode === 'parametros' ? 'mt-2' : ''}`} />
            )}

            {/* Submit Action Button */}
            <button
              type="button"
              onClick={handleExecuteSearch}
              disabled={isSearching || aiLoading}
              className={`px-5 py-2.5 rounded-xl bg-[#7B0209] hover:bg-[#630207] text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50 ${
                mode === 'parametros' ? 'mt-0.5' : ''
              }`}
            >
              {mode === 'ia' ? (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Perguntar</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Buscar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mode-Specific Sub-Controls & Assistance */}

      {/* Mode 1: Conteúdo Assistance */}
      {mode === 'conteudo' && (
        <div className="w-full flex flex-col items-start gap-3 mt-4 px-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setContentQuery('Abertura de Contas');
                executeContentSearch('Abertura de Contas');
              }}
              className="text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-[#7B0209] dark:hover:text-red-400 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-800/80 border border-gray-200/60 dark:border-slate-700/60 cursor-pointer"
            >
              <Search className="w-3 h-3 text-gray-400" />
              <span>Abertura de contas PF e PJ</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setContentQuery('Cartões');
                executeContentSearch('Cartões');
              }}
              className="text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-[#7B0209] dark:hover:text-red-400 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-800/80 border border-gray-200/60 dark:border-slate-700/60 cursor-pointer"
            >
              <Search className="w-3 h-3 text-gray-400" />
              <span>Cartões de crédito ou BIA</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setContentQuery('inventario');
                executeContentSearch('inventario');
              }}
              className="text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-[#7B0209] dark:hover:text-red-400 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-800/80 border border-gray-200/60 dark:border-slate-700/60 cursor-pointer"
            >
              <Search className="w-3 h-3 text-gray-400" />
              <span>Digite "inventário" para ver toda a base</span>
            </button>

            {onNavigateToOperationalInsights && (
              <button
                type="button"
                onClick={onNavigateToOperationalInsights}
                className="text-xs font-semibold text-gray-600 dark:text-slate-300 hover:text-[#7B0209] transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50/50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-900/30 cursor-pointer ml-auto"
              >
                <Activity className="w-3.5 h-3.5 text-[#7B0209]" />
                <span>Ver insights</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mode 2: Parâmetros Assistance & Advanced Options */}
      {mode === 'parametros' && (
        <div className="w-full flex flex-col gap-3 px-1 mt-1">
          {/* Clickable Quick Examples */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mr-1">
              Exemplos rápidos:
            </span>
            {PARAM_EXAMPLES.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectParamExample(ex.code)}
                className="group text-xs font-mono text-gray-600 dark:text-slate-300 hover:text-[#7B0209] dark:hover:text-red-400 transition-all flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-800/80 hover:bg-red-50/50 dark:hover:bg-slate-800 border border-gray-200/70 dark:border-slate-700/70 hover:border-red-200 dark:hover:border-red-900/50 cursor-pointer shadow-sm"
                title={ex.description}
              >
                <span className="text-[10px] font-sans font-medium text-gray-400 dark:text-slate-500 group-hover:text-[#7B0209]">
                  {ex.title}:
                </span>
                <span className="font-semibold text-gray-800 dark:text-slate-200 group-hover:text-[#7B0209]">
                  {ex.label}
                </span>
              </button>
            ))}
          </div>

          {/* Advanced Options Toggle */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-slate-400 hover:text-[#7B0209] dark:hover:text-red-400 transition-colors cursor-pointer py-1"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Opções avançadas</span>
              {showAdvancedOptions ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {paramInput && (
              <button
                type="button"
                onClick={() => {
                  setParamInput('');
                  setTimeout(() => adjustTextareaHeight(), 0);
                  executeParamSearch('');
                }}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
              >
                Limpar entrada
              </button>
            )}
          </div>

          {/* Advanced Options Content (Collapsed by Default) */}
          <AnimatePresence>
            {showAdvancedOptions && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700 flex flex-wrap gap-6 items-center">
                  {/* Escopo */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                      Escopo da correspondência
                    </span>
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setCriteriaScope('SNIPPET')}
                        className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                          criteriaScope === 'SNIPPET'
                            ? 'bg-[#7B0209] text-white'
                            : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                        }`}
                      >
                        No mesmo snippet
                      </button>
                      <button
                        type="button"
                        onClick={() => setCriteriaScope('SCREEN')}
                        className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                          criteriaScope === 'SCREEN'
                            ? 'bg-[#7B0209] text-white'
                            : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                        }`}
                      >
                        Na mesma tela
                      </button>
                    </div>
                  </div>

                  {/* Combinação */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                      Combinação de parâmetros
                    </span>
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-gray-200 dark:border-slate-700 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setCriteriaCombination('AND')}
                        className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                          criteriaCombination === 'AND'
                            ? 'bg-[#7B0209] text-white'
                            : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                        }`}
                      >
                        Todos (AND)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCriteriaCombination('OR')}
                        className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                          criteriaCombination === 'OR'
                            ? 'bg-[#7B0209] text-white'
                            : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                        }`}
                      >
                        Pelo menos um (OR)
                      </button>
                    </div>
                  </div>

                  {/* Sensibilidade / Normalização */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                      Normalização de sintaxe
                    </span>
                    <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-slate-300 pt-1">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ignoreCase}
                          onChange={(e) => setIgnoreCase(e.target.checked)}
                          className="rounded border-gray-300 text-[#7B0209] focus:ring-[#7B0209]"
                        />
                        <span>Ignorar maiúsculas/minúsculas</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ignoreWhitespace}
                          onChange={(e) => setIgnoreWhitespace(e.target.checked)}
                          className="rounded border-gray-300 text-[#7B0209] focus:ring-[#7B0209]"
                        />
                        <span>Ignorar espaços e quebras de linha</span>
                      </label>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Mode 3: Perguntar à IA Sub-Controls */}
      {mode === 'ia' && (
        <div className="w-full flex flex-col items-start gap-3 mt-3 px-2">
          {/* AI Loading indicator */}
          {aiLoading && (
            <div className="w-full p-3 rounded-xl bg-red-50/60 dark:bg-slate-800/60 border border-red-100 dark:border-slate-700 flex items-center gap-3 text-xs font-ui text-gray-700 dark:text-slate-200">
              <Loader2 className="w-4 h-4 animate-spin text-[#7B0209] shrink-0" />
              <span>Consultando inteligência artificial sobre os artefatos...</span>
            </div>
          )}

          {/* AI Error banner */}
          {aiError && (
            <div className="w-full p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-center justify-between gap-3 text-xs font-ui text-red-800 dark:text-red-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                <span>{aiError}</span>
              </div>
              <button
                type="button"
                onClick={() => executeAiSearch()}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer shrink-0"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Tentar novamente</span>
              </button>
            </div>
          )}

          {/* Example AI questions */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
              Exemplos:
            </span>
            <button
              type="button"
              onClick={() => {
                const q = 'Onde é disparado o evento de confirmação de pagamento?';
                setAiQuestion(q);
                executeAiSearch(q);
              }}
              className="text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-[#7B0209] dark:hover:text-red-400 transition-colors flex items-center gap-1 px-3 py-1 rounded-lg bg-gray-50 dark:bg-slate-800/80 border border-gray-200/60 dark:border-slate-700/60 cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-[#7B0209]" />
              <span>Confirmação de pagamento</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const q = 'Quais mapas possuem fluxos de Pix ou Cartões?';
                setAiQuestion(q);
                executeAiSearch(q);
              }}
              className="text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-[#7B0209] dark:hover:text-red-400 transition-colors flex items-center gap-1 px-3 py-1 rounded-lg bg-gray-50 dark:bg-slate-800/80 border border-gray-200/60 dark:border-slate-700/60 cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-[#7B0209]" />
              <span>Fluxos de Pix ou Cartões</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const q = 'Em qual tela é coletado o CPF do usuário?';
                setAiQuestion(q);
                executeAiSearch(q);
              }}
              className="text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-[#7B0209] dark:hover:text-red-400 transition-colors flex items-center gap-1 px-3 py-1 rounded-lg bg-gray-50 dark:bg-slate-800/80 border border-gray-200/60 dark:border-slate-700/60 cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-[#7B0209]" />
              <span>Coleta de CPF</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

