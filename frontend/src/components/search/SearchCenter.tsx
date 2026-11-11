import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search,
  X,
  SlidersHorizontal,
  MessageCircleQuestion,
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
import {
  Artifact,
  ActiveSearch,
  ParameterArtifactGroupSummary,
  ContentMatchSummary,
  QuestionMatchSummary,
} from '../../types';
import { searchWorkerClient } from '../../services/searchWorkerClient';
import {
  artifactSearchEngine,
  getContentMatchLabel,
  type ContentSearchResult,
  type ParameterCriterion,
} from '../../services/artifactSearchEngine';

export interface SearchCenterProps {
  artifacts: Artifact[];
  activeSearch?: ActiveSearch | null;
  resetSignal?: number;
  onApplyToCards?: (
    query: string,
    filteredIds: string[],
    meta?: {
      mode: 'conteudo' | 'parametros' | 'pergunta';
      parameterCriteria?: ParameterCriterion[];
      questionText?: string;
      scope?: 'SNIPPET' | 'SCREEN';
      operator?: 'AND' | 'OR';
      parameterGroups?: Record<string, ParameterArtifactGroupSummary>;
      contentMatches?: Record<string, ContentMatchSummary>;
      matchedTerms?: string[];
      queryKind?: string;
      questionMessage?: string;
      questionMatches?: Record<string, QuestionMatchSummary>;
    }
  ) => void;
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
}) => {
  // Current Mode: 'conteudo' | 'parametros' | 'pergunta'
  const [mode, setMode] = useState<'conteudo' | 'parametros' | 'pergunta'>('conteudo');

  // Input states per mode
  const [contentQuery, setContentQuery] = useState('');
  const [paramInput, setParamInput] = useState('');
  const [questionText, setQuestionText] = useState('');

  // Parameter mode controls
  const [criteriaCombination, setCriteriaCombination] = useState<'AND' | 'OR'>('AND');
  const [criteriaScope, setCriteriaScope] = useState<'SNIPPET' | 'SCREEN'>('SNIPPET');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(true);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(true);

  // Status & Feedback states
  const [isSearching, setIsSearching] = useState(false);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
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
    setQuestionText('');
    setCriteriaCombination('AND');
    setCriteriaScope('SNIPPET');
    setShowAdvancedOptions(false);
    setIgnoreCase(true);
    setIgnoreWhitespace(true);
    setIsSearching(false);
    setQuestionLoading(false);
    setQuestionError(null);
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
      } else if (activeSearch.mode === 'pergunta') {
        setQuestionText(activeSearch.questionText || activeSearch.query || '');
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
        return 'Quais parâmetros ou código você procura?';
      case 'pergunta':
        return 'O que você quer saber sobre os artefatos?';
    }
  };

  // Subtitle stats calculated from synchronized artifacts (excluding RAIZ)
  const stats = useMemo(() => {
    const validArtifacts = (artifacts || []).filter((a) => a.artifact_type !== 'RAIZ');
    const total = validArtifacts.length;
    let mapas = 0;
    let telas = 0;
    for (const a of validArtifacts) {
      if (a.artifact_type === 'MAPA' || (!a.artifact_type && Array.isArray(a.screens) && a.screens.length > 0)) {
        mapas++;
        if (Array.isArray(a.screens)) {
          telas += a.screens.length;
        }
      }
    }
    return { total, mapas, telas };
  }, [artifacts]);

  // Placeholders per mode
  const getModePlaceholder = () => {
    switch (mode) {
      case 'conteudo':
        return 'Busque por ID, nome do mapa ou qualquer termo relacionado';
      case 'parametros':
        return 'Cole aqui um trecho de código, dataLayer.push, objeto JSON ou parâmetros como tipo_pessoa: "PF"';
      case 'pergunta':
        return 'Ex: Existe jornada de INSS relacionada à contratação de cartão?';
    }
  };

  // Current input value based on mode
  const currentInputValue =
    mode === 'conteudo' ? contentQuery : mode === 'parametros' ? paramInput : questionText;

  const handleInputChange = (val: string) => {
    if (mode === 'conteudo') {
      setContentQuery(val);
    } else if (mode === 'parametros') {
      setParamInput(val);
    } else {
      setQuestionText(val);
      if (questionError) setQuestionError(null);
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
      setQuestionText('');
      setQuestionError(null);
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

  // Fazer uma pergunta: busca em linguagem natural no backend (sem IA)
  const executeQuestionSearch = async (questionToAsk?: string) => {
    const q = (questionToAsk !== undefined ? questionToAsk : questionText).trim();
    if (!q) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setQuestionLoading(true);
    setQuestionError(null);

    try {
      const response = await fetch('/api/search/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
        signal: abortController.signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível concluir a busca.');
      }

      const rawResults: any[] = Array.isArray(data.results) ? data.results : [];
      const questionMatches: Record<string, QuestionMatchSummary> = {};
      const filteredIds: string[] = [];
      for (const r of rawResults) {
        const id = String(r.artifactId || r.id || '');
        if (!id || questionMatches[id]) continue;
        filteredIds.push(id);
        questionMatches[id] = {
          reason: String(r.reason || ''),
          evidence: Array.isArray(r.evidence) ? r.evidence.map(String) : [],
          confidence: r.confidence === 'ALTA' || r.confidence === 'BAIXA' ? r.confidence : 'MEDIA',
          screenId: r.screenId,
          screenIndex: typeof r.screenIndex === 'number' ? r.screenIndex : undefined,
          screenTitle: r.screenTitle,
          snippetIndex: typeof r.snippetIndex === 'number' ? r.snippetIndex : undefined,
          event: r.event,
        };
      }

      onApplyToCards?.(q, filteredIds, {
        mode: 'pergunta',
        questionText: q,
        questionMessage: String(data.message || ''),
        questionMatches,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('[SearchCenter] AI Search error:', err);
      setQuestionError(
        err.message ||
          'Não foi possível concluir a busca. Verifique se o OMNI está rodando e tente de novo.'
      );
    } finally {
      setQuestionLoading(false);
    }
  };

  // Central submit handler
  const handleExecuteSearch = () => {
    if (mode === 'conteudo') {
      executeContentSearch(contentQuery);
    } else if (mode === 'parametros') {
      executeParamSearch();
    } else if (mode === 'pergunta') {
      executeQuestionSearch();
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
      {/* Dynamic Animated Title and Subtitle */}
      <div className="flex flex-col items-center text-center justify-center mb-6 w-full min-h-[70px]">
        <AnimatePresence mode="wait">
          <motion.h2
            key={mode}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="text-3xl sm:text-[38px] font-heading font-bold text-omni-ink tracking-[-0.025em] leading-tight"
          >
            {getModeTitle()}
          </motion.h2>
        </AnimatePresence>
        <p className="text-sm text-omni-ink-secondary text-center max-w-xl font-sans mt-2">
          {stats.total} artefatos sincronizados do Confluence, dos quais {stats.mapas} são mapas com {stats.telas} telas documentadas.
        </p>
      </div>

      {/* Mode Selector Segmented Control */}
      <div className="flex items-center gap-1 p-1 rounded-[12px] bg-white border border-omni-line shadow-neu-card mb-6">
        <button
          type="button"
          onClick={() => setMode('conteudo')}
          className={`h-9 flex items-center gap-2 px-4 rounded-[8px] text-[13px] font-medium transition-all duration-200 cursor-pointer ${
            mode === 'conteudo'
              ? 'bg-omni-bordo text-white shadow-sm'
              : 'text-omni-ink-secondary hover:text-omni-ink'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Conteúdo</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('parametros')}
          className={`h-9 flex items-center gap-2 px-4 rounded-[8px] text-[13px] font-medium transition-all duration-200 cursor-pointer ${
            mode === 'parametros'
              ? 'bg-omni-bordo text-white shadow-sm'
              : 'text-omni-ink-secondary hover:text-omni-ink'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Parâmetros</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('pergunta')}
          className={`h-9 flex items-center gap-2 px-4 rounded-[8px] text-[13px] font-medium transition-all duration-200 cursor-pointer ${
            mode === 'pergunta'
              ? 'bg-omni-bordo text-white shadow-sm'
              : 'text-omni-ink-secondary hover:text-omni-ink'
          }`}
        >
          <MessageCircleQuestion className="w-3.5 h-3.5" />
          <span>Fazer uma pergunta</span>
        </button>
      </div>

      {/* Central Unified Search Bar */}
      <div className="w-full relative mb-3">
        <div
          className={`w-full bg-white rounded-[14px] border transition-all duration-200 px-5 shadow-neu-card ${
            mode === 'parametros' ? 'py-3.5 flex items-start gap-3.5' : 'min-h-[54px] flex items-center gap-3.5'
          } ${
            isFocused
              ? 'border-omni-bordo/40 ring-2 ring-omni-rubi/30 shadow-[0_10px_30px_rgba(123,2,9,0.12)]'
              : 'border-omni-line hover:border-gray-300'
          }`}
        >
          <div className={`shrink-0 ${mode === 'parametros' ? 'pt-1 text-omni-bordo' : 'text-omni-muted'}`}>
            {mode === 'parametros' ? (
              <Code2 className="w-5 h-5 text-omni-bordo" />
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
                  if (e.ctrlKey || e.metaKey || (!e.shiftKey && !paramInput.includes('\n'))) {
                    e.preventDefault();
                    executeParamSearch(paramInput);
                  }
                }
              }}
              placeholder={getModePlaceholder()}
              rows={1}
              className="w-full bg-transparent border-none outline-none font-mono text-xs sm:text-sm text-omni-ink placeholder:text-omni-muted focus:outline-none focus:ring-0 resize-none overflow-y-auto custom-scrollbar max-h-64 leading-relaxed"
              style={{ minHeight: '44px' }}
            />
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={mode === 'conteudo' ? contentQuery : questionText}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={handleKeyDown}
              placeholder={getModePlaceholder()}
              className="w-full bg-transparent border-none outline-none text-base text-omni-ink placeholder:text-omni-muted focus:outline-none focus:ring-0 font-sans"
            />
          )}

          {/* Clear button */}
          {currentInputValue && !isSearching && !questionLoading && (
            <button
              type="button"
              onClick={handleClearInput}
              className={`p-1 rounded-lg text-omni-muted hover:text-omni-ink transition-colors shrink-0 ${
                mode === 'parametros' ? 'mt-1' : ''
              }`}
              title="Limpar campo"
              aria-label="Limpar campo"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Spinner indicator if searching */}
          {(isSearching || questionLoading) && (
            <Loader2 className={`w-4 h-4 animate-spin text-omni-bordo shrink-0 ${mode === 'parametros' ? 'mt-2' : ''}`} />
          )}

          {/* Submit Action Button */}
          <button
            type="button"
            onClick={handleExecuteSearch}
            disabled={isSearching || questionLoading}
            className={`btn-primary h-10 px-5 text-xs font-semibold rounded-[8px] flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50 ${
              mode === 'parametros' ? 'mt-0.5' : ''
            }`}
          >
            {mode === 'pergunta' ? (
              <>
                <MessageCircleQuestion className="w-3.5 h-3.5" />
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
              className="h-8 text-[12.5px] font-sans text-omni-ink-secondary hover:text-omni-ink transition-colors flex items-center gap-1.5 px-3 rounded-lg bg-white border border-omni-line hover:bg-omni-mist hover:border-omni-bordo/30 shadow-neu-card cursor-pointer"
            >
              <Search className="w-3 h-3 text-omni-muted" />
              <span>Abertura de contas PF e PJ</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setContentQuery('Cartões');
                executeContentSearch('Cartões');
              }}
              className="h-8 text-[12.5px] font-sans text-omni-ink-secondary hover:text-omni-ink transition-colors flex items-center gap-1.5 px-3 rounded-lg bg-white border border-omni-line hover:bg-omni-mist hover:border-omni-bordo/30 shadow-neu-card cursor-pointer"
            >
              <Search className="w-3 h-3 text-omni-muted" />
              <span>Cartões de crédito ou BIA</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setContentQuery('inventario');
                executeContentSearch('inventario');
              }}
              className="h-8 text-[12.5px] font-sans text-omni-ink-secondary hover:text-omni-ink transition-colors flex items-center gap-1.5 px-3 rounded-lg bg-white border border-omni-line hover:bg-omni-mist hover:border-omni-bordo/30 shadow-neu-card cursor-pointer"
            >
              <Search className="w-3 h-3 text-omni-muted" />
              <span>Digite "inventário" para ver toda a base</span>
            </button>

          </div>
        </div>
      )}

      {/* Mode 2: Parâmetros Assistance & Advanced Options */}
      {mode === 'parametros' && (
        <div className="w-full flex flex-col gap-3 px-1 mt-1">
          {/* Clickable Quick Examples */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-omni-muted mr-1">
              Exemplos rápidos:
            </span>
            {PARAM_EXAMPLES.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectParamExample(ex.code)}
                className="h-8 text-[12.5px] font-mono text-omni-ink-secondary hover:text-omni-bordo transition-all flex items-center gap-1.5 px-3 rounded-lg bg-white hover:bg-omni-mist border border-omni-line hover:border-omni-bordo/30 cursor-pointer shadow-neu-card"
                title={ex.description}
              >
                <span className="text-[11px] font-sans text-omni-muted">
                  {ex.title}:
                </span>
                <span className="font-semibold text-omni-ink">
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
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-omni-ink-secondary hover:text-omni-bordo transition-colors cursor-pointer py-1"
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
                className="text-xs text-omni-muted hover:text-omni-ink transition-colors cursor-pointer"
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
                <div className="p-4 rounded-xl bg-white border border-omni-line shadow-neu-card flex flex-wrap gap-6 items-center">
                  {/* Escopo */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-omni-ink-secondary">
                      Escopo da correspondência
                    </span>
                    <div className="flex items-center gap-1 bg-omni-mist p-1 rounded-lg border border-omni-line text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setCriteriaScope('SNIPPET')}
                        className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                          criteriaScope === 'SNIPPET'
                            ? 'bg-omni-bordo text-white'
                            : 'text-omni-ink-secondary hover:text-omni-ink'
                        }`}
                      >
                        No mesmo snippet
                      </button>
                      <button
                        type="button"
                        onClick={() => setCriteriaScope('SCREEN')}
                        className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                          criteriaScope === 'SCREEN'
                            ? 'bg-omni-bordo text-white'
                            : 'text-omni-ink-secondary hover:text-omni-ink'
                        }`}
                      >
                        Na mesma tela
                      </button>
                    </div>
                  </div>

                  {/* Combinação */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-omni-ink-secondary">
                      Combinação de parâmetros
                    </span>
                    <div className="flex items-center gap-1 bg-omni-mist p-1 rounded-lg border border-omni-line text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setCriteriaCombination('AND')}
                        className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                          criteriaCombination === 'AND'
                            ? 'bg-omni-bordo text-white'
                            : 'text-omni-ink-secondary hover:text-omni-ink'
                        }`}
                      >
                        Todos (AND)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCriteriaCombination('OR')}
                        className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                          criteriaCombination === 'OR'
                            ? 'bg-omni-bordo text-white'
                            : 'text-omni-ink-secondary hover:text-omni-ink'
                        }`}
                      >
                        Pelo menos um (OR)
                      </button>
                    </div>
                  </div>

                  {/* Sensibilidade / Normalização */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-omni-ink-secondary">
                      Normalização de sintaxe
                    </span>
                    <div className="flex items-center gap-4 text-xs text-omni-ink-secondary pt-1">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ignoreCase}
                          onChange={(e) => setIgnoreCase(e.target.checked)}
                          className="rounded border-gray-300 text-omni-bordo focus:ring-omni-bordo"
                        />
                        <span>Ignorar maiúsculas/minúsculas</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ignoreWhitespace}
                          onChange={(e) => setIgnoreWhitespace(e.target.checked)}
                          className="rounded border-gray-300 text-omni-bordo focus:ring-omni-bordo"
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

      {/* Modo 3: Fazer uma pergunta */}
      {mode === 'pergunta' && (
        <div className="w-full flex flex-col items-start gap-3 mt-3 px-2">
          {/* AI Loading indicator */}
          {questionLoading && (
            <div className="w-full p-3 rounded-xl bg-red-50/60 border border-red-100 flex items-center gap-3 text-xs font-ui text-omni-ink">
              <Loader2 className="w-4 h-4 animate-spin text-omni-bordo shrink-0" />
              <span>Procurando nos artefatos…</span>
            </div>
          )}

          {/* AI Error banner */}
          {questionError && (
            <div className="w-full p-3 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-3 text-xs font-ui text-red-800">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{questionError}</span>
              </div>
              <button
                type="button"
                onClick={() => executeQuestionSearch()}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer shrink-0"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Tentar novamente</span>
              </button>
            </div>
          )}

          {/* Example AI questions */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-omni-muted">
              Exemplos:
            </span>
            <button
              type="button"
              onClick={() => {
                const q = 'Existe jornada de INSS relacionada à contratação de cartão?';
                setQuestionText(q);
                executeQuestionSearch(q);
              }}
              className="h-8 text-[12.5px] font-sans text-omni-ink-secondary hover:text-omni-ink transition-colors flex items-center gap-1.5 px-3 rounded-lg bg-white border border-omni-line hover:bg-omni-mist hover:border-omni-bordo/30 shadow-neu-card cursor-pointer"
            >
              <MessageCircleQuestion className="w-3 h-3 text-omni-bordo" />
              <span>INSS e cartão</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const q = 'Onde aparece o evento de pagamento com Pix?';
                setQuestionText(q);
                executeQuestionSearch(q);
              }}
              className="h-8 text-[12.5px] font-sans text-omni-ink-secondary hover:text-omni-ink transition-colors flex items-center gap-1.5 px-3 rounded-lg bg-white border border-omni-line hover:bg-omni-mist hover:border-omni-bordo/30 shadow-neu-card cursor-pointer"
            >
              <MessageCircleQuestion className="w-3 h-3 text-omni-bordo" />
              <span>Pagamento com Pix</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const q = 'Em qual tela é coletado o CPF do usuário?';
                setQuestionText(q);
                executeQuestionSearch(q);
              }}
              className="h-8 text-[12.5px] font-sans text-omni-ink-secondary hover:text-omni-ink transition-colors flex items-center gap-1.5 px-3 rounded-lg bg-white border border-omni-line hover:bg-omni-mist hover:border-omni-bordo/30 shadow-neu-card cursor-pointer"
            >
              <MessageCircleQuestion className="w-3 h-3 text-omni-bordo" />
              <span>Coleta de CPF</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

