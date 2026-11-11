import React, { useState, useEffect, useRef } from 'react';
import { StatusBadge } from './badges/StatusBadge';
import { HomologationBadge } from './badges/HomologationBadge';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, ExternalLink, FileText, AlertTriangle, Layers, Tag, Code2, Copy, Check, 
  ChevronDown, ChevronUp, Image as ImageIcon, ArrowRight, CheckCircle2, AlertCircle,
  Network
} from 'lucide-react';
import { Artifact, ScreenItem, SnippetItem } from '../types';
import { getStatusStyle, normalizarStatus } from '../utils/statusUtils';
import { formatUltimaSincronizacao } from '../utils/helpers';
import { isMap as checkIsMap, isDocumentation, getArtifactTypeLabel } from '../domain/artifacts';
import { resolveMeasurementClass, getMeasurementLabel } from '../domain/measurement';
import { getMapStatusMetrics } from '../domain/status';
import { findArtifactValueIssues, findPatternIssues } from '../domain/quality/valueQuality';

interface MapDetailModalProps {
  item: Artifact | null;
  onClose: () => void;
  initialTab?: 'telas' | 'parametros' | 'padroes' | 'detalhes';
  initialScreenId?: string;
  initialSnippetIndex?: number;
  onViewInTree?: (id: string) => void;
}

export const MapDetailModal: React.FC<MapDetailModalProps> = ({ 
  item, 
  onClose,
  initialTab,
  initialScreenId,
  initialSnippetIndex,
  onViewInTree
}) => {
  const [activeTab, setActiveTab] = useState<'telas' | 'parametros' | 'padroes' | 'detalhes'>(initialTab || 'telas');
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);
  const [expandedScreens, setExpandedScreens] = useState<Record<string, boolean>>({});
  const [expandedParams, setExpandedParams] = useState<Record<string, boolean>>({});
  const [highlightedSnippetKey, setHighlightedSnippetKey] = useState<string | null>(null);
  const modalBodyRef = useRef<HTMLDivElement>(null);

  // Reiniciar ou inicializar estado interno com foco em tela e snippet se fornecido
  useEffect(() => {
    if (!item) return;

    if (initialTab) {
      setActiveTab(initialTab);
    } else {
      setActiveTab('telas');
    }

    setExpandedParams({});
    setCopiedSnippetId(null);

    if (initialScreenId !== undefined) {
      const screensList = item.screens || [];
      const foundScreen = screensList.find((s, idx) => 
        String(s.screen_id) === String(initialScreenId) ||
        String(s.screen_index) === String(initialScreenId) ||
        `screen-${idx}` === String(initialScreenId)
      );
      const targetKey = foundScreen ? (foundScreen.screen_id || `screen-${screensList.indexOf(foundScreen)}`) : initialScreenId;
      
      setExpandedScreens({ [targetKey]: true });

      const targetSnipIdx = initialSnippetIndex !== undefined ? Number(initialSnippetIndex) : 0;
      setHighlightedSnippetKey(`${targetKey}-snippet-${targetSnipIdx}`);

      const highlightTimer = setTimeout(() => {
        setHighlightedSnippetKey(null);
      }, 3000);

      const scrollTimer = setTimeout(() => {
        const snippetEl = modalBodyRef.current?.querySelector(`[data-screen-id="${targetKey}"][data-snippet-index="${targetSnipIdx}"]`);
        if (snippetEl) {
          snippetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          const screenEl = modalBodyRef.current?.querySelector(`[data-screen-id="${targetKey}"]`);
          if (screenEl) {
            screenEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }, 200);

      return () => {
        clearTimeout(highlightTimer);
        clearTimeout(scrollTimer);
      };
    } else {
      setExpandedScreens({});
      setHighlightedSnippetKey(null);
      if (modalBodyRef.current) {
        modalBodyRef.current.scrollTop = 0;
      }
    }
  }, [item?.id, initialTab, initialScreenId, initialSnippetIndex]);

  // Fechar com Escape e travar scroll do body enquanto aberto
  useEffect(() => {
    if (!item) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [item, onClose]);

  if (!item) return null;

  const screens = item.screens || [];
  const parameters = item.parameter_summary || [];
  const patterns = item.pattern_summary || [];
  const header = item.header || {};
  // Alertas calculados no próprio mapa (sem IA): valores parecidos e padrões com uma única ocorrência
  const valueIssues = findArtifactValueIssues(item);
  const patternIssues = findPatternIssues(patterns as any);
  const valueIssueCount = Array.from(valueIssues.values()).reduce((acc, m) => acc + m.size, 0);
  const isDoc = isDocumentation(item);
  const isMap = checkIsMap(item);
  
  const artifactBadgeLabel = getArtifactTypeLabel(item.artifact_type);

  // Classificação de Mensuração Canônica (apenas para mapas, nunca para documentações ou nós)
  const measurementClass = resolveMeasurementClass(item);
  const measurementLabel = isMap ? getMeasurementLabel(measurementClass) : null;

  // Resumo de Telas & Homologação Canônicos
  const metrics = getMapStatusMetrics(item);
  const totalScreens = metrics.totalScreens;
  const validatedScreens = metrics.validated;
  const correctionScreens = metrics.correction;
  const newScreens = metrics.new;
  const deleteScreens = metrics.exclude;
  const discontinueScreens = metrics.discontinue;
  const homologationPercentage = metrics.homologationPercentage ?? 0;

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedSnippetId(id);
    setTimeout(() => setCopiedSnippetId(null), 2000);
  };

  const toggleScreen = (screenId: string) => {
    setExpandedScreens(prev => ({ ...prev, [screenId]: !prev[screenId] }));
  };

  const toggleParam = (paramName: string) => {
    setExpandedParams(prev => ({ ...prev, [paramName]: !prev[paramName] }));
  };

  // Status individual de cada tela
  // Link do Figma / XD
  const figmaRaw = header.figma_xd?.value || item.figma_xd;
  const isFigmaLink = figmaRaw && figmaRaw !== '-' && figmaRaw.trim() !== '' && (figmaRaw.startsWith('http://') || figmaRaw.startsWith('https://'));

  const tabs = [
    { id: 'telas', label: `Telas (${screens.length})`, icon: Layers, alerts: 0 },
    { id: 'parametros', label: `Parâmetros (${parameters.length})`, icon: Tag, alerts: valueIssueCount },
    { id: 'padroes', label: `Padrões (${patterns.length})`, icon: Code2, alerts: patternIssues.size },
    { id: 'detalhes', label: 'Detalhes', icon: FileText, alerts: 0 }
  ] as const;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.titulo || 'Detalhes do artefato'}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-[#1A1D24]/55 backdrop-blur-xs overflow-y-auto"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-omni-line rounded-2xl shadow-overlay flex flex-col overflow-hidden max-h-[90vh] w-full max-w-5xl"
      >
        {/* 1. CABEÇALHO DO ARTEFATO */}
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50">
          <div className="flex items-start justify-between gap-4 mb-3">
            {/* Badges Semânticos: Classificação de Mensuração & Homologação */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 text-[11px] font-ui font-semibold rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
                {artifactBadgeLabel}
              </span>
              {isMap && (
                <>
                  {measurementLabel && (
                    <span className="px-2.5 py-1 text-[11px] font-ui font-semibold rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
                      {measurementLabel}
                    </span>
                  )}
                  {isMap && metrics.hasScreens && (
                    <HomologationBadge status={metrics.homologationStatus} percentage={metrics.homologationPercentage} />
                  )}
                </>
              )}
            </div>

            {/* Ações: Confluence & Fechar */}
            <div className="flex items-center gap-2">
              {onViewInTree && (
                <button
                  type="button"
                  onClick={() => {
                    onViewInTree(item.id);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-slate-700 text-xs font-ui font-medium text-gray-700 dark:text-slate-300 hover:text-[#7B0209] hover:border-[#7B0209]/40 bg-white dark:bg-slate-800 transition-colors cursor-pointer"
                  title="Ver e destacar na árvore de conexões"
                >
                  <Network className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#7B0209]" />
                  Acessar na árvore
                </button>
              )}
              {item.link && (
                <a 
                  href={item.link} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-slate-700 text-xs font-ui font-medium text-gray-700 dark:text-slate-300 hover:text-bradesco-red hover:border-bradesco-red/40 bg-white dark:bg-slate-800 transition-colors"
                  title="Abrir no Confluence"
                >
                  Confluence <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <button 
                onClick={onClose}
                className="p-1.5 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Fechar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold font-heading text-gray-900 dark:text-slate-100 tracking-tight mb-2">
            {item.titulo}
          </h2>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs font-ui text-gray-500 dark:text-slate-400">
            <span><strong className="font-semibold text-gray-700 dark:text-slate-300">ID:</strong> {item.id}</span>
            <span><strong className="font-semibold text-gray-700 dark:text-slate-300">Produto:</strong> {item.produto || 'N/A'}</span>
            <span><strong className="font-semibold text-gray-700 dark:text-slate-300">Subproduto:</strong> {item.subproduto || 'N/A'}</span>
            <span><strong className="font-semibold text-gray-700 dark:text-slate-300">Responsável:</strong> {item.responsavel || 'N/A'}</span>
            <span><strong className="font-semibold text-gray-700 dark:text-slate-300">Versão:</strong> {item.versao || 1}</span>
          </div>

          {/* 2. RESUMO OPERACIONAL COMPACTO (Apenas para Mapas) */}
          {!isDoc && (
            <div className="mt-4 p-3 rounded-xl bg-gray-50/80 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700/80 flex flex-wrap items-center gap-x-3.5 gap-y-2 text-xs font-ui text-gray-600 dark:text-slate-300">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-gray-900 dark:text-slate-100">{totalScreens}</span>
                <span>{totalScreens === 1 ? 'tela' : 'telas'}</span>
              </div>
              <span className="text-gray-300 dark:text-slate-700">|</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="font-bold text-emerald-700 dark:text-emerald-400">{validatedScreens}</span>
                <span>{validatedScreens === 1 ? 'validada' : 'validadas'}</span>
              </div>
              <span className="text-gray-300 dark:text-slate-700">|</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                <span className="font-bold text-rose-700 dark:text-rose-400">{correctionScreens}</span>
                <span>{correctionScreens === 1 ? 'correção' : 'correções'}</span>
              </div>
              <span className="text-gray-300 dark:text-slate-700">|</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <span className="font-bold text-amber-700 dark:text-amber-400">{newScreens}</span>
                <span>{newScreens === 1 ? 'nova' : 'novas'}</span>
              </div>
              {deleteScreens > 0 && (
                <>
                  <span className="text-gray-300 dark:text-slate-700">|</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                    <span className="font-bold text-slate-700 dark:text-slate-300">{deleteScreens}</span>
                    <span>excluir</span>
                  </div>
                </>
              )}
              {discontinueScreens > 0 && (
                <>
                  <span className="text-gray-300 dark:text-slate-700">|</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <span className="font-bold text-blue-700 dark:text-blue-400">{discontinueScreens}</span>
                    <span>descontinuar</span>
                  </div>
                </>
              )}
              <span className="text-gray-300 dark:text-slate-700">|</span>
              <div className="flex items-center gap-1">
                <span className="font-bold text-gray-900 dark:text-slate-100">{homologationPercentage}%</span>
                <span>homologado</span>
              </div>
              <span className="text-gray-300 dark:text-slate-700">|</span>
              <div className="flex items-center gap-1">
                <span className="font-bold text-gray-900 dark:text-slate-100">{parameters.length}</span>
                <span>{parameters.length === 1 ? 'parâmetro' : 'parâmetros'}</span>
              </div>
              <span className="text-gray-300 dark:text-slate-700">|</span>
              <div className="flex items-center gap-1">
                <span className="font-bold text-gray-900 dark:text-slate-100">{patterns.length}</span>
                <span>{patterns.length === 1 ? 'padrão' : 'padrões'}</span>
              </div>
            </div>
          )}

          {/* 3. NAVEGAÇÃO POR ABAS */}
          <div className="flex items-center gap-1 mt-5 border-b border-gray-200 dark:border-slate-800 -mb-6">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-xs font-ui transition-colors cursor-pointer border-b-2 -mb-px ${
                    isActive 
                      ? 'text-bradesco-red border-bradesco-red font-semibold bg-red-50/20 dark:bg-red-950/10' 
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {tab.label}
                  {tab.alerts > 0 && (
                    <span
                      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-[10px] font-bold text-amber-950 tabular-nums"
                      title={`${tab.alerts} ${tab.alerts === 1 ? 'alerta' : 'alertas'} para conferir`}
                    >
                      {tab.alerts}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. CONTEÚDO DA ABA SELECIONADA */}
        <div ref={modalBodyRef} className="p-6 sm:p-8 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          {/* TAB: TELAS */}
          {activeTab === 'telas' && (
            <div className="space-y-3">
              {screens.length === 0 ? (
                <div className="p-12 text-center text-gray-400 dark:text-slate-500">
                  <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">Nenhuma tela estruturada encontrada neste artefato.</p>
                  <p className="text-xs mt-1">Pode se tratar de uma documentação geral ou mapa sem tabela de telas padronizada.</p>
                </div>
              ) : (
                screens.map((screen, sIdx) => {
                  const screenKey = screen.screen_id || `screen-${sIdx}`;
                  const isExpanded = !!expandedScreens[screenKey];
                  const screenSnippets = screen.snippets || [];
                  const totalScreenParams = screenSnippets.reduce((acc, sn) => acc + (sn.parameters?.length || 0), 0);
                  const displayScreenNumber = Number.isInteger(screen.screen_index)
                    ? screen.screen_index + 1
                    : sIdx + 1;

                  return (
                    <div 
                      key={screenKey}
                      data-screen-id={screenKey}
                      className="border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 transition-colors"
                    >
                      {/* Linha compacta da tela (Accordion Header) */}
                      <button 
                        type="button"
                        onClick={() => toggleScreen(screenKey)}
                        className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-6 h-6 rounded-md bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center shrink-0">
                            #{displayScreenNumber}
                          </span>
                          <StatusBadge status={screen.status} />
                          <span className="text-xs font-semibold text-gray-800 dark:text-slate-200 truncate">
                            {screen.instruction || 'Tela sem instrução especificada'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 text-xs font-ui text-gray-400 dark:text-slate-500">
                          <span>
                            {screenSnippets.length} {screenSnippets.length === 1 ? 'snippet' : 'snippets'} · {totalScreenParams} {totalScreenParams === 1 ? 'parâmetro' : 'parâmetros'}
                          </span>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </div>
                      </button>

                      {/* Conteúdo da tela expandida */}
                      {isExpanded && (
                        <div className="p-4 sm:p-5 pt-2 border-t border-gray-100 dark:border-slate-800 space-y-4 bg-gray-50/30 dark:bg-slate-900/30">
                          {screen.image_name && (
                            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-gray-200 dark:border-slate-700">
                              <ImageIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span>Evidência visual: <strong className="font-semibold text-gray-800 dark:text-slate-200">{screen.image_name}</strong></span>
                            </div>
                          )}

                          {screenSnippets.length > 0 ? (
                            <div className="space-y-4">
                              {screenSnippets.map((snip, snIdx) => {
                                const isCopied = copiedSnippetId === snip.snippet_id;
                                const snipParamCount = snip.parameters?.length || 0;
                                const isHighlighted = highlightedSnippetKey === `${screenKey}-snippet-${snIdx}`;
                                return (
                                  <div 
                                    key={snip.snippet_id || snIdx} 
                                    data-screen-id={screenKey}
                                    data-snippet-index={snIdx}
                                    className="space-y-2"
                                  >
                                    {/* Bloco preto de código */}
                                    <div className={`bg-slate-950 text-slate-100 rounded-xl p-4 font-mono text-xs border transition-all duration-500 ${
                                      isHighlighted 
                                        ? 'border-[#7B0209] ring-4 ring-[#7B0209]/40 shadow-lg shadow-[#7B0209]/20' 
                                        : 'border-slate-800'
                                    }`}>
                                      <div className="flex items-center justify-between mb-2 text-[10px] text-slate-400 border-b border-slate-800 pb-2">
                                        <div className="flex items-center gap-2">
                                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-bold">
                                            {snip.event_normalized || snip.event_raw || 'evento'}
                                          </span>
                                          <span className="text-slate-400">
                                            Padrão: {snip.pattern_id || 'custom'}
                                          </span>
                                          {snip.measurement_class && (
                                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-300">
                                              {snip.measurement_class}
                                            </span>
                                          )}
                                        </div>
                                        <button 
                                          type="button"
                                          onClick={() => copyCode(snip.raw_code, snip.snippet_id)}
                                          className="flex items-center gap-1 text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-850 hover:bg-slate-800 transition-colors cursor-pointer"
                                        >
                                          {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                          {isCopied ? 'Copiado' : 'Copiar'}
                                        </button>
                                      </div>

                                      <pre className="text-slate-200 custom-scrollbar overflow-x-auto py-1 whitespace-pre-wrap">
                                        {snip.raw_code}
                                      </pre>
                                    </div>

                                    {/* Resumo neutro fora do fundo preto */}
                                    <div className="flex items-center justify-between text-xs font-ui text-gray-500 dark:text-slate-400 px-1">
                                      <span>{snipParamCount} {snipParamCount === 1 ? 'parâmetro identificado' : 'parâmetros identificados'}</span>
                                      {snipParamCount > 0 && (
                                        <button 
                                          type="button"
                                          onClick={() => setActiveTab('parametros')}
                                          className="text-[11px] font-medium text-bradesco-red hover:underline inline-flex items-center gap-1 cursor-pointer"
                                        >
                                          Ver na aba Parâmetros <ArrowRight className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 italic">Sem snippets dataLayer catalogados nesta tela.</p>
                          )}

                          {screen.additional_information && (
                            <div className="text-xs text-gray-500 dark:text-slate-400 bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-gray-200 dark:border-slate-700">
                              <span className="font-semibold text-gray-700 dark:text-slate-300">Observações adicionais:</span> {screen.additional_information}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB: PARAMETROS */}
          {activeTab === 'parametros' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-ui text-gray-500 dark:text-slate-400">
                <p>
                  Total de <strong className="font-semibold text-gray-800 dark:text-slate-200">{parameters.length}</strong> parâmetros distintos mapeados.
                </p>
              </div>

              {valueIssueCount > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-900 leading-relaxed">
                    <strong className="font-semibold">
                      {valueIssueCount} {valueIssueCount === 1 ? 'valor parecido' : 'valores parecidos'} com outro já usado
                    </strong>{' '}
                    em {valueIssues.size} {valueIssues.size === 1 ? 'parâmetro' : 'parâmetros'}. Pode ser erro de digitação; abra o parâmetro marcado para ver qual.
                  </p>
                </div>
              )}

              {parameters.length === 0 ? (
                <div className="p-12 text-center text-gray-400 dark:text-slate-500">
                  <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">Nenhum parâmetro extraído deste mapa.</p>
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                  {/* Cabeçalho da Tabela */}
                  <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-800 text-[10px] font-ui font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                    <div className="col-span-6 sm:col-span-7">Parâmetro</div>
                    <div className="col-span-3 sm:col-span-2 text-center">Ocorrências</div>
                    <div className="col-span-2 sm:col-span-2 text-center">Telas</div>
                    <div className="col-span-1 text-right"></div>
                  </div>

                  {/* Linhas de Parâmetros */}
                  <div className="divide-y divide-gray-100 dark:divide-slate-800">
                    {parameters.map((param, pIdx) => {
                      const isExpanded = !!expandedParams[param.name];
                      const paramIssues = valueIssues.get(param.name);
                      // Valores com possível erro aparecem primeiro
                      const distinctValues = [...(param.distinct_values || [])].sort(
                        (a, b) => Number(!!paramIssues?.has(b)) - Number(!!paramIssues?.has(a))
                      );

                      return (
                        <div key={param.name || pIdx} className="transition-colors">
                          <button
                            type="button"
                            onClick={() => toggleParam(param.name)}
                            className="w-full grid grid-cols-12 gap-3 px-4 py-3 items-center text-left hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                          >
                            <div className="col-span-6 sm:col-span-7 font-mono text-xs font-semibold text-gray-900 dark:text-slate-100 truncate flex items-center gap-2">
                              <span className="truncate">{param.name}</span>
                              {paramIssues && (
                                <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-sans font-medium text-amber-800">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                                  {paramIssues.size} {paramIssues.size === 1 ? 'possível erro' : 'possíveis erros'}
                                </span>
                              )}
                            </div>
                            <div className="col-span-3 sm:col-span-2 text-center text-xs font-ui text-gray-600 dark:text-slate-300">
                              {param.occurrences}x
                            </div>
                            <div className="col-span-2 sm:col-span-2 text-center text-xs font-ui text-gray-600 dark:text-slate-300">
                              {param.screens_count}
                            </div>
                            <div className="col-span-1 flex justify-end text-gray-400">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                          </button>

                          {/* Conteúdo Expandido do Parâmetro (TODOS os valores distintos, sem slice) */}
                          {isExpanded && (
                            <div className="px-4 py-3 bg-gray-50/50 dark:bg-slate-800/20 border-t border-gray-100 dark:border-slate-800 space-y-2">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                                Valores Distintos ({distinctValues.length}):
                              </p>
                              {paramIssues && (
                                <ul className="space-y-0.5">
                                  {Array.from(paramIssues.entries()).map(([val, issue]) => (
                                    <li key={val} className="text-[11px] text-amber-900">
                                      <span className="font-mono font-semibold">{val}</span> ({issue.count}x): {issue.message}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {distinctValues.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto custom-scrollbar p-1">
                                  {distinctValues.map((val, vIdx) => {
                                    const issue = paramIssues?.get(val);
                                    return (
                                      <span 
                                        key={vIdx}
                                        title={issue?.message}
                                        className={`px-2 py-0.5 text-[11px] rounded border font-mono inline-flex items-center gap-1 ${
                                          issue
                                            ? 'bg-amber-50 text-amber-900 border-amber-300'
                                            : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700'
                                        }`}
                                      >
                                        {issue && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />}
                                        {val === '' ? '"" (vazio)' : val}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 italic">Nenhum valor explícito registrado.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: PADRÕES (Sem roxo) */}
          {activeTab === 'padroes' && (
            <div className="space-y-3">
              <p className="text-xs font-ui text-gray-500 dark:text-slate-400">
                Padrões canônicos de eventos e dataLayer identificados ({patterns.length}).
              </p>

              {patterns.length === 0 ? (
                <div className="p-12 text-center text-gray-400 dark:text-slate-500">
                  <Code2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">Nenhum padrão estruturado reconhecido.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {patterns.map((pat, ptIdx) => {
                    const fields = pat.signature || [];
                    const patIssue = patternIssues.get(pat.pattern_id);
                    const missing = new Set(patIssue?.missing || []);
                    const extra = new Set(patIssue?.extra || []);
                    return (
                      <div 
                        key={pat.pattern_id || ptIdx}
                        className={`p-4 rounded-xl border bg-white dark:bg-slate-900 space-y-3 ${
                          patIssue ? 'border-amber-300' : 'border-gray-200 dark:border-slate-800'
                        }`}
                      >
                        {patIssue && (
                          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-[11.5px] text-amber-900 leading-relaxed">{patIssue.message}</p>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-gray-900 dark:text-slate-100">
                              {pat.event || 'Evento'}
                            </span>
                            {pat.measurement_class && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
                                {pat.measurement_class}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-ui text-gray-500 dark:text-slate-400">
                            {pat.count}x {pat.count === 1 ? 'ocorrência' : 'ocorrências'} · presente em {pat.screens_count} {pat.screens_count === 1 ? 'tela' : 'telas'}
                          </span>
                        </div>

                        {/* Campos do padrão */}
                        {fields.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                              Campos do padrão:
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {fields.map((field, fIdx) => (
                                <span 
                                  key={fIdx} 
                                  title={extra.has(field) ? 'Só este disparo tem este campo' : undefined}
                                  className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                                    extra.has(field)
                                      ? 'bg-amber-50 text-amber-900 border-amber-300'
                                      : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700'
                                  }`}
                                >
                                  {field}
                                </span>
                              ))}
                              {Array.from(missing).map((field) => (
                                <span
                                  key={`faltando-${field}`}
                                  title="Os outros disparos deste evento têm este campo"
                                  className="px-2 py-0.5 rounded text-[11px] font-mono border border-dashed border-amber-400 text-amber-800 line-through decoration-amber-500"
                                >
                                  {field}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Dropdown discreto: Assinatura Técnica */}
                        {pat.pattern_id && (
                          <details className="text-xs text-gray-500 dark:text-slate-400 group pt-1">
                            <summary className="cursor-pointer text-[11px] font-medium text-gray-500 hover:text-gray-800 dark:hover:text-slate-200 inline-flex items-center gap-1 select-none">
                              <span>Ver assinatura técnica</span>
                              <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
                            </summary>
                            <div className="mt-2 p-2.5 bg-gray-50 dark:bg-slate-800/60 rounded-lg border border-gray-200 dark:border-slate-700 font-mono text-[10px] text-gray-600 dark:text-slate-300 break-all">
                              ID do Padrão: {pat.pattern_id}
                            </div>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: DETALHES (Antigo Cabeçalho Semântico) */}
          {activeTab === 'detalhes' && (
            <div className="space-y-6">
              {/* Grade limpa de 2 colunas com metadados do mapa */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { 
                    label: 'Produto / Serviço declarado', 
                    value: header.produto_servico?.value || item.produto_servico || item.produto || '—' 
                  },
                  { 
                    label: 'Número da Task', 
                    value: header.numero_task?.value || item.numero_da_task || '—' 
                  },
                  { 
                    label: 'Figma / XD', 
                    value: isFigmaLink ? (
                      <a 
                        href={figmaRaw} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-xs font-semibold text-gray-800 dark:text-slate-200 hover:text-bradesco-red inline-flex items-center gap-1.5 transition-colors"
                      >
                        Abrir Figma/XD <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      '—'
                    )
                  },
                  { 
                    label: 'GA4 Stream ID', 
                    value: header.ga4_stream_id?.value || item.propriedade_ga4_stream_id || '—' 
                  },
                  { 
                    label: 'Firebase', 
                    value: header.firebase?.value || item.firebase || '—' 
                  },
                  { 
                    label: 'GTM ID', 
                    value: header.gtm_id?.value || item.gtm_id || '—' 
                  },
                  { 
                    label: 'Domínio Exclusivo Web', 
                    value: header.dominio?.value || item.dominio_exclusivo_web || '—' 
                  },
                  { 
                    label: 'Status Homologação Declarado', 
                    value: header.status_homologacao?.value || item.declared_status || '—' 
                  }
                ].map((row, idx) => (
                  <div 
                    key={idx}
                    className="p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                  >
                    <p className="text-[10px] font-bold uppercase text-gray-400 dark:text-slate-500 tracking-wider mb-1">
                      {row.label}
                    </p>
                    <div className="text-sm font-semibold text-gray-800 dark:text-slate-200 break-words">
                      {row.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Seção Governança (Divergência de Status) */}
              <div className="pt-4 border-t border-gray-200 dark:border-slate-800 space-y-3">
                <h4 className="text-xs font-bold font-ui uppercase tracking-wider text-gray-400 dark:text-slate-500">
                  Governança
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <p className="text-[10px] font-bold uppercase text-gray-400 dark:text-slate-500 tracking-wider mb-1">
                      Status declarado no Confluence
                    </p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                      {item.declared_status || header.status_homologacao?.value || 'Não informado'}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <p className="text-[10px] font-bold uppercase text-gray-400 dark:text-slate-500 tracking-wider mb-1">
                      Status apurado pelo Omni
                    </p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                      {item.homologation_status || item.calculated_status || 'N/A'}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <p className="text-[10px] font-bold uppercase text-gray-400 dark:text-slate-500 tracking-wider mb-1">
                      Divergência identificada
                    </p>
                    <p className={`text-sm font-semibold ${item.status_divergent ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-slate-200'}`}>
                      {item.status_divergent ? 'Sim' : 'Não'}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <p className="text-[10px] font-bold uppercase text-gray-400 dark:text-slate-500 tracking-wider mb-1">
                      Explicação da divergência
                    </p>
                    <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed">
                      {item.status_divergent 
                        ? (item.divergence_reason || `O status declarado no cabeçalho (${item.declared_status || 'Nenhum'}) difere do apurado a partir das telas (${item.calculated_status || 'N/A'}).`)
                        : 'Nenhuma divergência entre o status declarado e o apurado pelo Omni.'}
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <div className="text-xs font-ui text-gray-400 dark:text-slate-500">
            Última sincronização no Confluence: {formatUltimaSincronizacao(item.ultima_atualizacao)}
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="btn-neu px-5 py-2 text-gray-700 dark:text-slate-200 rounded-xl font-ui font-semibold text-xs hover:text-bradesco-red transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </div>
  );
};
