import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, ExternalLink, FileText, AlertTriangle, Layers, Tag, Code2, Copy, Check, 
  ChevronDown, ChevronUp, Image as ImageIcon, ArrowRight, CheckCircle2, AlertCircle,
  Network
} from 'lucide-react';
import { Artifact, ScreenItem, SnippetItem } from '../types';
import { getStatusStyle, normalizarStatus } from '../utils/statusUtils';
import { formatUltimaSincronizacao } from '../utils/helpers';

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

  if (!item) return null;

  const screens = item.screens || [];
  const parameters = item.parameter_summary || [];
  const patterns = item.pattern_summary || [];
  const header = item.header || {};
  const isDoc = item.artifact_type === 'DOCUMENTACAO';
  const isMap = item.artifact_type === 'MAPA';
  

  let artifactBadgeLabel = 'Não classificado';
  if (isDoc) artifactBadgeLabel = 'Documento';
  else if (isMap) artifactBadgeLabel = 'Mapa'; else if (item.artifact_type === 'NO') artifactBadgeLabel = 'Nó';
  

  // Classificação de Mensuração (não é status)
  const getMeasurementLabel = () => {
    if (!isMap) return null; // Apenas mapas possuem classificação (GA4, GA3, Híbrido)
    const mc = item.measurement_class;
    if (mc === 'GA4') return 'GA4';
    if (mc === 'GA3') return 'GA3';
    if (mc === 'HIBRIDO') return 'Híbrido';
    if (mc === 'NAO_CLASSIFICADO') return 'Não classificado';
    if (mc) return mc;
    return 'Não classificado';
  };

  const measurementLabel = getMeasurementLabel();

  // Resumo de Telas & Homologação
  const totalScreens = item.total_screens ?? screens.length ?? 0;
  
  const getScreenCountByStatus = (statusNorm: string) => {
    if (item.status_summary) {
      if (statusNorm === 'VALIDADO') return item.status_summary.VALIDADO ?? 0;
      if (statusNorm === 'CORREÇÃO') return item.status_summary['EM CORREÇÃO'] ?? item.status_summary.CORRECAO ?? item.status_summary['CORREÇÃO'] ?? 0;
      if (statusNorm === 'NOVO') return item.status_summary.NOVO ?? 0;
      if (statusNorm === 'EXCLUIR') return item.status_summary.EXCLUIR ?? 0;
      if (statusNorm === 'DESCONTINUAR') return item.status_summary.DESCONTINUAR ?? 0;
    }
    return screens.filter(s => normalizarStatus(s.status) === statusNorm).length;
  };

  const validatedScreens = item.validated_screens ?? getScreenCountByStatus('VALIDADO');
  const correctionScreens = getScreenCountByStatus('CORREÇÃO');
  const newScreens = getScreenCountByStatus('NOVO');
  const deleteScreens = getScreenCountByStatus('EXCLUIR');
  const discontinueScreens = getScreenCountByStatus('DESCONTINUAR');
  
  const homologationPercentage = item.homologation_percentage ?? (totalScreens > 0 ? Math.round((validatedScreens / totalScreens) * 100) : 0);

  // Badge de Homologação do Mapa (3 estados canônicos, nunca "Validado")
  let homologationBadge = null;
  if (isMap) {
    const status = item.homologation_status || (homologationPercentage === 100 && totalScreens > 0 ? 'HOMOLOGADO' : (homologationPercentage > 0 ? 'PARCIAL' : 'NAO_HOMOLOGADO'));
    if (status === 'HOMOLOGADO') {
      homologationBadge = {
        label: `Homologado · ${homologationPercentage}%`,
        bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
      };
    } else if (status === 'PARCIAL') {
      homologationBadge = {
        label: `Parcial · ${homologationPercentage}%`,
        bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
      };
    } else {
      homologationBadge = {
        label: `Não homologado · ${homologationPercentage}%`,
        bg: 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700'
      };
    }
  }

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
  const getIndividualScreenBadge = (status?: string | null) => {
    const norm = normalizarStatus(status);
    if (norm) {
      return getStatusStyle(norm);
    }
    return {
      bg: 'bg-slate-100 dark:bg-slate-800',
      text: 'text-slate-600 dark:text-slate-400',
      border: 'border-slate-200 dark:border-slate-700',
      label: status || 'Não Classificado'
    };
  };

  // Link do Figma / XD
  const figmaRaw = header.figma_xd?.value || item.figma_xd;
  const isFigmaLink = figmaRaw && figmaRaw !== '-' && figmaRaw.trim() !== '' && (figmaRaw.startsWith('http://') || figmaRaw.startsWith('https://'));

  const tabs = [
    { id: 'telas', label: `Telas (${screens.length})`, icon: Layers },
    { id: 'parametros', label: `Parâmetros (${parameters.length})`, icon: Tag },
    { id: 'padroes', label: `Padrões (${patterns.length})`, icon: Code2 },
    { id: 'detalhes', label: 'Detalhes', icon: FileText }
  ] as const;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh] w-full max-w-5xl"
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
                  {homologationBadge && (
                    <span className={`px-2.5 py-1 text-[11px] font-ui font-semibold rounded-lg border ${homologationBadge.bg}`}>
                      {homologationBadge.label}
                    </span>
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
                  const sBadge = getIndividualScreenBadge(screen.status);
                  const screenKey = screen.screen_id || `screen-${sIdx}`;
                  const isExpanded = !!expandedScreens[screenKey];
                  const screenSnippets = screen.snippets || [];
                  const totalScreenParams = screenSnippets.reduce((acc, sn) => acc + (sn.parameters?.length || 0), 0);

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
                            #{screen.screen_index || (sIdx + 1)}
                          </span>
                          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border shrink-0 ${sBadge.bg} ${sBadge.text} ${sBadge.border}`}>
                            {sBadge.label}
                          </span>
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
                      const distinctValues = param.distinct_values || [];

                      return (
                        <div key={param.name || pIdx} className="transition-colors">
                          <button
                            type="button"
                            onClick={() => toggleParam(param.name)}
                            className="w-full grid grid-cols-12 gap-3 px-4 py-3 items-center text-left hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                          >
                            <div className="col-span-6 sm:col-span-7 font-mono text-xs font-semibold text-gray-900 dark:text-slate-100 truncate">
                              {param.name}
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
                              {distinctValues.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto custom-scrollbar p-1">
                                  {distinctValues.map((val, vIdx) => (
                                    <span 
                                      key={vIdx}
                                      className="px-2 py-0.5 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 text-[11px] rounded border border-gray-200 dark:border-slate-700 font-mono"
                                    >
                                      {val === '' ? '"" (vazio)' : val}
                                    </span>
                                  ))}
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
                    return (
                      <div 
                        key={pat.pattern_id || ptIdx}
                        className="p-4 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
                      >
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
                                  className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded text-[11px] font-mono border border-gray-200 dark:border-slate-700"
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

              {/* Origem dos campos técnicos (Dropdown recolhido por padrão) */}
              <details className="border border-gray-200 dark:border-slate-800 rounded-xl p-4 bg-gray-50/50 dark:bg-slate-800/30 group">
                <summary className="cursor-pointer text-xs font-semibold text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 flex items-center justify-between select-none">
                  <span>Ver origem dos campos</span>
                  <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform text-gray-400" />
                </summary>
                <div className="mt-3 space-y-2 pt-3 border-t border-gray-200 dark:border-slate-700 text-xs text-gray-500 dark:text-slate-400">
                  {Object.entries(header).length === 0 ? (
                    <p className="italic text-gray-400">Nenhum metadado de auditoria disponível.</p>
                  ) : (
                    Object.entries(header).map(([key, field]) => {
                      if (!field || typeof field !== 'object') return null;
                      return (
                        <div key={key} className="flex flex-wrap items-center justify-between gap-2 py-1 border-b border-gray-100 dark:border-slate-800/50 last:border-0">
                          <span className="font-mono text-gray-700 dark:text-slate-300 font-medium">{key}:</span>
                          <span className="text-[11px]">
                            Rótulo original: <em className="text-gray-700 dark:text-slate-300">"{field.raw_label || '-'}"</em> ({field.source || 'tabela'})
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </details>
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
