/**
 * Arquivo: frontend/src/App.tsx
 * Propósito: Componente principal ("A casca" e o "coração" da tela).
 * É aqui que a mágica visual acontece:
 * 1. Controla qual "visão" entregar ao usuário (Buscador, Cards, Inventário, Insights ou Mapa de Conexões).
 * 2. Gerencia os "Estados" - Toda vez que o estado muda (ex: setAppState("insights")),
 *    o React redesenha a tela instantaneamente usando essas novas informações.
 * 3. Componentiza Modal de Exportar Tabela, Sidebar de Usuário e Admin de Usuários.
 * 
 * Importante: Lógicas pesadas de conta e busca (exclusões e levenshtein) 
 * devem morar no Backend. O frontend repassa ordens (api.ts) e obedece
 * os dados JSON que voltam da porta 3000.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate, useLocation, Routes, Route } from "react-router-dom";
import { X, AlertTriangle, Target, Network, Filter, CheckCircle2, AlertCircle, Clock, User, Info, Shield, LogOut, Trash2, Plus, Settings, Landmark, LayoutList, RefreshCw, Check, Loader2, KeyRound, Activity, ArrowRight, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, Download, Sparkles, FileText, Layers, Tag, Code2, Eye, ArrowUpDown, Calendar, RotateCcw, SlidersHorizontal } from "lucide-react";
import { JourneysSidebarFilters } from "../components/JourneysSidebarFilters";
import { getOperationalInsights } from "../utils/inventoryHelpers";
import { fetchInventory, searchContent, fetchUsers, createUser, updateUser, deleteUser } from "../services/api";
import { Artifact, Insights, SearchResponse, User as UserType, UserRole, UserStatus, ActiveSearch, ParameterArtifactGroupSummary, ContentMatchSummary } from "../types";
import { normalizar, formatDataBR, getFilteredInsights } from "../utils/helpers";
import { 
  buildArtifactSearchableText, 
  normalizeSearchText, 
  getQueryTokens, 
  matchesAllTokens, 
  sortWithSearchPriority, 
  useDebouncedSearch 
} from "../utils/contextualSearch";
import { ContextualEmptyState } from "../components/ContextualEmptyState";
import { MultiSelect } from "../components/MultiSelect";
import { FilterField } from "../components/FilterField";
import { TypewriterText } from "../components/TypewriterText";
import { MapDetailModal } from "../components/MapDetailModal";
import { AppShell } from "../components/AppShell";
import { ArtifactResultCard } from "../components/search/ArtifactResultCard";
import { PageHeader } from "../components/PageHeader";
import { AdminUsers } from "../features/admin/AdminUsers";
import { SyncWidget } from "../features/sync/SyncWidget";

// Telas pesadas (grafos, d3, painéis analíticos) carregadas sob demanda para reduzir o bundle inicial.
const GraphView = lazy(() => import("../features/connections/GraphView"));
const JourneysCanvas = lazy(() => import("../components/JourneysCanvas").then((m) => ({ default: m.JourneysCanvas })));
const ProductAnalysisView = lazy(() => import("../components/ProductAnalysisView").then((m) => ({ default: m.ProductAnalysisView })));
const ParameterAnalysisView = lazy(() => import("../components/ParameterAnalysisView").then((m) => ({ default: m.ParameterAnalysisView })));
const CanonicalInsightsDashboard = lazy(() => import("../components/CanonicalInsightsDashboard").then((m) => ({ default: m.CanonicalInsightsDashboard })));

const PageLoading = () => (
  <div className="flex-1 flex items-center justify-center py-32 text-[13px] text-gray-500" role="status">
    <Loader2 className="w-4 h-4 mr-2 animate-spin text-omni-bordo" /> Carregando…
  </div>
);
import { SidebarContextualArea } from "../components/SidebarContextualArea";
import { SearchCenter } from "../components/search/SearchCenter";
import { isMap, isDocumentation, isNode, isRoot, isCataloged, getArtifactTypeLabel } from "../domain/artifacts";
import { resolveMeasurementClass, getMeasurementLabel, MEASUREMENT_CONFIGS } from "../domain/measurement";
import { getMapStatusMetrics } from "../domain/status";

// Espaçamento lateral global reutilizado no cabeçalho e rodapé para alinhamento no mesmo eixo vertical
const GLOBAL_SCREEN_PADDING = "px-6 sm:px-8";

const INITIAL_USERS: UserType[] = [
  {
    id: '1',
    name: 'Lucas Admin',
    email: 'lucas.doliveira@bradesco.com.br',
    role: 'admin',
    status: 'ativo',
    createdAt: new Date().toISOString()
  },
  {
    id: '2',
    name: 'Usuário Teste',
    email: 'teste@bradesco.com.br',
    role: 'gestor360',
    status: 'ativo',
    createdAt: new Date().toISOString()
  }
];

export default function App() {
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('omni_dark_mode');
    localStorage.removeItem('cortex_current_user');
  }, []);

  const [query, setQuery] = useState("");
  const [usersDb, setUsersDb] = useState<UserType[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [results, setResults] = useState<Artifact[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const [rawAppState, setRawAppState] = useState<"home" | "catalog" | "initial" | "results" | "decision" | "insights" | "empty" | "inventory_table" | "graph" | "auth" | "syncing" | "events_capture" | "operational_insights" | "copilot" | "produtos_analise" | "parametros_analise" | "journeys">("initial");
  const appState = rawAppState;

  const [insightsActiveTab, setRawInsightsActiveTab] = useState<"indicadores" | "resumo_executivo">("indicadores");
  const [detailModalItem, setDetailModalItem] = useState<Artifact | null>(null);
  const [detailTarget, setDetailTarget] = useState<{ screenId?: string; snippetIndex?: number } | null>(null);
  const [conexoesTargetArtifactId, setConexoesTargetArtifactId] = useState<string | null>(null);

  const handleViewInTree = useCallback((artifactId: string) => {
    setDetailModalItem(null);
    setDetailTarget(null);
    setConexoesTargetArtifactId(artifactId);
    navigate(`/hub-de-artefatos/conexoes?artifactId=${encodeURIComponent(artifactId)}`);
  }, [navigate]);

  const handleOpenMapDetail = useCallback((art: Artifact) => {
    setDetailModalItem(art);
  }, []);

  const handleClearConexoesTarget = useCallback(() => {
    setConexoesTargetArtifactId(null);
    navigate('/hub-de-artefatos/conexoes', { replace: true });
  }, [navigate]);

  const setAppState = (newState: typeof rawAppState, updateUrl = true) => {
    setRawAppState(newState);
    if (!updateUrl) return;
    
    if (newState === 'initial' || newState === 'home') navigate('/hub-de-artefatos');
    else if (newState === 'results') navigate('/hub-de-artefatos/cards');
    else if (newState === 'inventory_table') navigate('/hub-de-artefatos/inventario');
    else if (newState === 'produtos_analise') navigate('/hub-de-artefatos/por-produto');
    else if (newState === 'parametros_analise') navigate('/hub-de-artefatos/por-parametro');
    else if (newState === 'insights' && insightsActiveTab === 'indicadores') navigate('/hub-de-artefatos/insights');
    else if (newState === 'insights' && insightsActiveTab === 'resumo_executivo') navigate('/hub-de-artefatos/insights/resumo-executivo');
    else if (newState === 'operational_insights') navigate('/hub-de-artefatos/insights-operacionais');
    else if (newState === 'graph') navigate('/hub-de-artefatos/conexoes');
    else if (newState === 'journeys') navigate('/hub-de-artefatos/jornadas');
    else if (newState === 'empty' || newState === 'decision') navigate('/hub-de-artefatos');
  };

  const setInsightsActiveTab = (tab: "indicadores" | "resumo_executivo", updateUrl = true) => {
    setRawInsightsActiveTab(tab);
    if (!updateUrl) return;
    if (tab === 'indicadores' && appState === 'insights') navigate('/hub-de-artefatos/insights');
    else if (tab === 'resumo_executivo' && appState === 'insights') navigate('/hub-de-artefatos/insights/resumo-executivo');
  };

  // Sync state from URL
  useEffect(() => {
    const p = location.pathname;
    const searchParams = new URLSearchParams(location.search);
    const targetArtId = searchParams.get('artifactId');

    if (p === '/hub-de-artefatos/conexoes') {
      setRawAppState('graph');
      setConexoesTargetArtifactId(targetArtId || null);
    } else {
      setConexoesTargetArtifactId(null);
    }

    if (p === '/' || p === '/home') {
      setRawAppState('initial');
      navigate('/hub-de-artefatos', { replace: true });
      if (p === '/home') setShowAdmin(false);
    } else if (p === '/home/gestao-de-usuarios') {
      setRawAppState('initial');
      setShowAdmin(true);
    } else if (p === '/overview' || p === '/hub-de-eventos') {
      setRawAppState('initial');
      navigate('/hub-de-artefatos', { replace: true });
    } else if (p === '/hub-de-artefatos') {
      setRawAppState('initial');
    } else if (p === '/hub-de-artefatos/cards') {
      setRawAppState('results');
    } else if (p === '/hub-de-artefatos/inventario') {
      setRawAppState('inventory_table');
    } else if (p === '/hub-de-artefatos/por-produto') {
      setRawAppState('produtos_analise');
    } else if (p === '/hub-de-artefatos/por-parametro') {
      setRawAppState('parametros_analise');
    } else if (p === '/hub-de-artefatos/jornadas') {
      setRawAppState('journeys');
    } else if (p === '/hub-de-artefatos/insights') {
      setRawAppState('insights');
      setRawInsightsActiveTab('indicadores');
    } else if (p === '/hub-de-artefatos/insights/resumo-executivo') {
      setRawAppState('insights');
      setRawInsightsActiveTab('resumo_executivo');
    } else if (p === '/hub-de-artefatos/insights-operacionais') {
      setRawAppState('operational_insights');
    } else if (p === '/hub-de-artefatos/conexoes') {
      setRawAppState('graph');
    } else if (p === '/hub-de-artefatos/jornadas') {
      setRawAppState('journeys');
    } else {
      // Not found handling / default
      if (p !== '/hub-de-artefatos' && p !== '/') {
        navigate('/hub-de-artefatos', { replace: true });
      }
    }
  }, [location.pathname, location.search]);

  const [showSummary, setShowSummary] = useState(false);
  const [capturePlatform, setCapturePlatform] = useState<string | null>(null);
  const [isSyncAuthOpen, setIsSyncAuthOpen] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [journeyProduct, setJourneyProduct] = useState("");
  const [journeySubproduct, setJourneySubproduct] = useState("");
  const [journeyMapId, setJourneyMapId] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [lastSync, setLastSync] = useState<string | null>(localStorage.getItem('last_sync'));
  const [showExportModal, setShowExportModal] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [showExecutiveModal, setShowExecutiveModal] = useState(false);

  const [executiveSummaryParams, setExecutiveSummaryParams] = useState<any>(null);
  const [executiveSummaryResult, setExecutiveSummaryResult] = useState<any>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const [fullInventory, setFullInventory] = useState<Artifact[]>([]);

  useEffect(() => {
    if ((appState === "operational_insights" || appState === "home" || appState === "journeys" || appState === "initial") && fullInventory.length === 0) {
      setLoading(true);
      fetchInventory()
        .then((res) => {
          setFullInventory(res.resultados);
          if (results.length === 0) {
            setResults(res.resultados);
          }
        })
        .catch((e) => console.error(e))
        .finally(() => setLoading(false));
    }
  }, [appState, fullInventory.length, results.length]);


  // Estado centralizado da busca ativa (ActiveSearch)
  const [activeSearch, setActiveSearch] = useState<ActiveSearch | null>(null);
  const [searchSessionId, setSearchSessionId] = useState(0);

  useEffect(() => {
    const mainCatalogStates = ["inventory_table", "results", "produtos_analise", "parametros_analise", "insights", "graph"];
    // Só carrega a base completa quando NÃO há busca ativa. Uma busca que retornou
    // zero resultados deve continuar mostrando zero (blueprint: nunca devolver tudo
    // quando a consulta não encontrou nada).
    if (mainCatalogStates.includes(appState) && results.length === 0 && !loading && !isSearchingRef.current && !activeSearch && (query === "" || query === "inventario")) {
      executeSearch("inventario");
    }
  }, [appState, results.length, loading, activeSearch]);

  // Callback de transporte de resultados para a tela de Cards
  const handleApplyToCards = useCallback((
    searchQuery: string,
    filteredIds: string[],
    meta?: {
      mode: 'conteudo' | 'parametros' | 'ia';
      parameterCriteria?: any[];
      aiQuestion?: string;
      scope?: 'SNIPPET' | 'SCREEN';
      operator?: 'AND' | 'OR';
      parameterGroups?: Record<string, ParameterArtifactGroupSummary>;
      contentMatches?: Record<string, ContentMatchSummary>;
      matchedTerms?: string[];
      queryKind?: string;
      partialMatchesCount?: number;
    }
  ) => {
    // 1. Receber filteredIds
    // 2. Remover duplicidades mantendo ordem
    const uniqueIds = Array.from(new Set((filteredIds || []).map(id => String(id).trim()).filter(Boolean)));

    // 3 & 4. Preservar a ordem de relevância e resolver os IDs contra fullInventory
    const inventoryMap = new Map<string, Artifact>();
    fullInventory.forEach(art => inventoryMap.set(String(art.id), art));

    // 5. Ignorar IDs inexistentes
    const resolvedArtifacts: Artifact[] = [];
    for (const id of uniqueIds) {
      const art = inventoryMap.get(id);
      if (art) {
        resolvedArtifacts.push(art);
      }
    }

    const currentMode = meta?.mode || 'conteudo';
    const isFullBase = (currentMode === 'conteudo' && (!searchQuery.trim() || searchQuery.toLowerCase().trim() === 'inventario' || searchQuery.toLowerCase().trim() === 'inventário') && uniqueIds.length === 0);
    const finalResults = isFullBase ? fullInventory : resolvedArtifacts;

    // 6. Atualizar results
    setResults(finalResults);

    // 7. Atualizar ActiveSearch
    const newActiveSearch: ActiveSearch = {
      mode: currentMode,
      query: searchQuery,
      resultsCount: finalResults.length,
      timestamp: Date.now(),
      filteredIds: uniqueIds,
      parameterCriteria: meta?.parameterCriteria,
      aiQuestion: meta?.aiQuestion,
      scope: meta?.scope,
      operator: meta?.operator,
      parameterGroups: meta?.parameterGroups,
      contentMatches: meta?.contentMatches,
      matchedTerms: meta?.matchedTerms,
      queryKind: meta?.queryKind,
      partialMatchesCount: meta?.partialMatchesCount,
    };
    setActiveSearch(newActiveSearch);

    // 8. Definir ordenação por Relevância para buscas ativas (preservando a ordem do buscador)
    setCardSort(isFullBase ? "recentes" : "relevancia");

    // 9. Resetar a paginação e limpar cardSearch para não conflitar
    setCardSearch("");
    setCardPage(1);

    // 10. Navegar para /hub-de-artefatos/cards
    setAppState("results");
  }, [fullInventory]);

  // Estados e controle exclusivos da tela de Cards
  const [cardSearch, setCardSearch] = useState("");
  const [cardSort, setCardSort] = useState<"relevancia" | "recentes" | "antigos" | "az" | "za">("recentes");
  const [cardArtifactType, setCardArtifactType] = useState<"todos" | "mapas" | "docs" | "nos">("todos");
  const [cardResponsible, setCardResponsible] = useState<string>("todos");
  const [cardYear, setCardYear] = useState<string>("todas");
  const [cardPage, setCardPage] = useState<number>(1);
  const cardsPerPage = 20;
  const cardsListRef = useRef<HTMLDivElement>(null);

  // Fonte de dados para a página de Cards
  const cardSource = useMemo(() => {
    if (activeSearch !== null) {
      return results;
    }
    return results.length > 0 ? results : fullInventory;
  }, [activeSearch, results, fullInventory]);

  // Lista dinâmica de responsáveis únicos, ordenados alfabeticamente
  const availableResponsibles = useMemo(() => {
    const list = Array.from(new Set(
      cardSource
        .map(i => i.responsavel?.trim())
        .filter(r => Boolean(r) && r !== "N/A" && r !== "-" && r !== "Não informado")
    )) as string[];
    return list.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [cardSource]);

  // Lista dinâmica de anos disponíveis a partir da última atualização
  const availableYears = useMemo(() => {
    const years = Array.from(new Set(
      cardSource.map(i => {
        if (!i.ultima_atualizacao) return null;
        const d = new Date(i.ultima_atualizacao);
        return isNaN(d.getTime()) ? null : d.getFullYear().toString();
      }).filter(Boolean) as string[]
    ));
    return years.sort((a, b) => Number(b) - Number(a));
  }, [cardSource]);

  const debouncedCardSearch = useDebouncedSearch(cardSearch, 150);

  // Índice textual leve montado UMA ÚNICA VEZ quando a fonte de cards mudar e a aba de cards estiver ativa
  const indexedCards = useMemo(() => {
    if (appState !== 'results') return [];
    return cardSource
      .filter(i => !isRoot(i))
      .map(artifact => ({
        artifact,
        normId: normalizeSearchText(artifact.id),
        normTitle: normalizeSearchText(artifact.titulo),
        searchableText: buildArtifactSearchableText(artifact),
      }));
  }, [cardSource, appState]);

  // Filtragem e ordenação combinadas para a tela de Cards
  const filteredAndSortedCards = useMemo(() => {
    let list = indexedCards;

    // 1. Filtro de Artefato (Todos, Mapas, Documentações, Nós)
    if (cardArtifactType === "mapas") {
      list = list.filter(({ artifact: i }) => isMap(i));
    } else if (cardArtifactType === "docs") {
      list = list.filter(({ artifact: i }) => isDocumentation(i));
    } else if (cardArtifactType === "nos") {
      list = list.filter(({ artifact: i }) => isNode(i));
    }

    // 2. Filtro de Responsável
    if (cardResponsible !== "todos") {
      list = list.filter(({ artifact: i }) => (i.responsavel || "").trim() === cardResponsible);
    }

    // 3. Filtro de Data (Ano)
    if (cardYear !== "todas") {
      list = list.filter(({ artifact: i }) => {
        if (!i.ultima_atualizacao) return false;
        const d = new Date(i.ultima_atualizacao);
        return !isNaN(d.getTime()) && d.getFullYear().toString() === cardYear;
      });
    }

    // 4. Busca textual rápida (todas as palavras presentes no searchableText)
    const queryTokens = getQueryTokens(debouncedCardSearch);
    if (queryTokens.length > 0) {
      list = list.filter(({ searchableText }) => matchesAllTokens(searchableText, queryTokens));
    }

    // 5. Ordenação da tela de Cards (quando cardSort === 'relevancia', preserva a ordem exata do buscador)
    const sorted = cardSort === "relevancia"
      ? [...list]
      : [...list].sort((a, b) => {
          const artA = a.artifact;
          const artB = b.artifact;
          if (cardSort === "recentes") {
            const timeA = artA.ultima_atualizacao ? new Date(artA.ultima_atualizacao).getTime() : 0;
            const timeB = artB.ultima_atualizacao ? new Date(artB.ultima_atualizacao).getTime() : 0;
            return timeB - timeA;
          }
          if (cardSort === "antigos") {
            const timeA = artA.ultima_atualizacao ? new Date(artA.ultima_atualizacao).getTime() : 0;
            const timeB = artB.ultima_atualizacao ? new Date(artB.ultima_atualizacao).getTime() : 0;
            return timeA - timeB;
          }
          if (cardSort === "az") {
            return (artA.titulo || "").localeCompare(artB.titulo || "", "pt-BR");
          }
          if (cardSort === "za") {
            return (artB.titulo || "").localeCompare(artA.titulo || "", "pt-BR");
          }
          return 0;
        });

    // 6. Quando houver busca secundária na barra lateral: priorizar correspondência exata de ID, depois título começando pela consulta
    const prioritized = queryTokens.length > 0
      ? sortWithSearchPriority(sorted, debouncedCardSearch)
      : sorted;

    return prioritized.map(({ artifact }) => artifact);
  }, [indexedCards, debouncedCardSearch, cardArtifactType, cardResponsible, cardYear, cardSort]);

  const totalCardsCount = filteredAndSortedCards.length;
  const totalCardPages = Math.max(1, Math.ceil(totalCardsCount / cardsPerPage));

  // Reajustar a página atual quando a quantidade de resultados diminuir
  useEffect(() => {
    if (cardPage > totalCardPages) {
      setCardPage(1);
    }
  }, [cardPage, totalCardPages]);

  // Paginação: fatia no máximo 20 cards por página
  const paginatedCards = useMemo(() => {
    const start = (cardPage - 1) * cardsPerPage;
    return filteredAndSortedCards.slice(start, start + cardsPerPage);
  }, [filteredAndSortedCards, cardPage]);

  // Indicador de filtro ativo
  const isCardFilterActive = useMemo(() => {
    const defaultSort = activeSearch !== null ? "relevancia" : "recentes";
    return (
      cardSearch.trim() !== "" ||
      cardSort !== defaultSort ||
      cardArtifactType !== "todos" ||
      cardResponsible !== "todos" ||
      cardYear !== "todas"
    );
  }, [cardSearch, cardSort, cardArtifactType, cardResponsible, cardYear, activeSearch]);

  const hasActiveCardFilters = cardArtifactType !== "todos" || cardResponsible !== "todos" || cardYear !== "todas";

  const clearOnlyCardFilters = () => {
    setCardArtifactType("todos");
    setCardResponsible("todos");
    setCardYear("todas");
    setCardPage(1);
  };

  const resetCardFilters = () => {
    setCardSearch("");
    setCardSort(activeSearch !== null ? "relevancia" : "recentes");
    setCardArtifactType("todos");
    setCardResponsible("todos");
    setCardYear("todas");
    setCardPage(1);
  };

  // Cálculo da janela de até 3 números de página visíveis
  const visiblePageNumbers = useMemo(() => {
    if (totalCardPages <= 3) {
      return Array.from({ length: totalCardPages }, (_, i) => i + 1);
    }
    if (cardPage <= 2) {
      return [1, 2, 3];
    }
    if (cardPage >= totalCardPages - 1) {
      return [totalCardPages - 2, totalCardPages - 1, totalCardPages];
    }
    return [cardPage - 1, cardPage, cardPage + 1];
  }, [cardPage, totalCardPages]);

  const handleCardPageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalCardPages || newPage === cardPage) return;
    setCardPage(newPage);
    if (cardsListRef.current) {
      cardsListRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };


  const { recentActivities, chartData } = useMemo(() => getOperationalInsights(fullInventory), [fullInventory]);

  const handleBarClick = (items: Artifact[]) => {
    if(items.length === 0) return;
    setResults(items);
    setAppState("results");
  };

  const handleActivityClick = (item: Artifact) => {
    setResults([item]);
    setAppState("results");
  };
  


  const [insightFilters, setInsightFilters] = useState({ ga: 'all', produto: 'all', subproduto: 'all' });
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const [inventoryViewMode, setInventoryViewMode] = useState<'table' | 'panel'>('table');
  
  const [syncJob, setSyncJob] = useState<{
    active: boolean;
    step: number; 
    phase: string;
    status: "running" | "success" | "error";
    message: string;
    processed: number;
    total: number;
    percentage: number;
    succeeded: number;
    reused: number;
    failed: number;
    warnings: number;
    errorMsg: string;
  }>({
    active: false,
    step: 0,
    phase: "idle",
    status: "running",
    message: "Validando sessão do Confluence...",
    processed: 0,
    total: 0,
    percentage: 0,
    succeeded: 0,
    reused: 0,
    failed: 0,
    warnings: 0,
    errorMsg: ""
  });

  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopSyncPolling = () => {
    if (syncPollRef.current) {
      clearInterval(syncPollRef.current);
      syncPollRef.current = null;
    }
  };

  const startBackgroundSync = async () => {
    if (syncJob.active && syncJob.status === "running") {
      return;
    }

    stopSyncPolling();
    setSyncJob({
      active: true,
      step: 0,
      phase: "validating_session",
      status: "running",
      message: "Validando sessão do Confluence...",
      processed: 0,
      total: 0,
      percentage: 0,
      succeeded: 0,
      reused: 0,
      failed: 0,
      warnings: 0,
      errorMsg: ""
    });

    syncPollRef.current = setInterval(async () => {
      try {
        const statusRes = await fetch("/api/sync-status");
        if (!statusRes.ok) return;
        const statusData = await statusRes.json();
        if (statusData) {
          setSyncJob(s => {
            if (s.status !== "running") return s;
            return {
              ...s,
              step: typeof statusData.step === "number" ? statusData.step : s.step,
              phase: statusData.phase || s.phase,
              message: statusData.message || s.message,
              processed: typeof statusData.processed === "number" ? statusData.processed : s.processed,
              total: typeof statusData.total === "number" ? statusData.total : s.total,
              percentage: typeof statusData.percentage === "number" ? statusData.percentage : s.percentage,
              succeeded: typeof statusData.succeeded === "number" ? statusData.succeeded : s.succeeded,
              reused: typeof statusData.reused === "number" ? statusData.reused : s.reused,
              failed: typeof statusData.failed === "number" ? statusData.failed : s.failed,
              warnings: typeof statusData.warnings === "number" ? statusData.warnings : s.warnings
            };
          });
        }
      } catch (_) {
        // Ignorar falhas pontuais de polling
      }
    }, 1000);

    try {
      const res = await fetch("/api/update-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootId: "1542391004", maxRows: null, mode: "full", forceRefresh: true })
      });
      
      const data = await res.json();
      stopSyncPolling();
      
      if (!res.ok) {
        throw new Error(data.error || "Falha na sincronização");
      }

      const finalStatus = data.status || {};
      const finalTotal = typeof finalStatus.total === "number" ? finalStatus.total : (typeof data.count === "number" ? data.count : 0);
      
      setSyncJob(s => ({
        ...s,
        step: 4,
        phase: "completed",
        status: "success",
        message: finalStatus.message || "Sincronização concluída.",
        processed: typeof finalStatus.processed === "number" ? finalStatus.processed : finalTotal,
        total: finalTotal || s.total,
        percentage: 100,
        succeeded: typeof finalStatus.succeeded === "number" ? finalStatus.succeeded : s.succeeded,
        reused: typeof finalStatus.reused === "number" ? finalStatus.reused : s.reused,
        failed: typeof finalStatus.failed === "number" ? finalStatus.failed : s.failed,
        warnings: typeof finalStatus.warnings === "number" ? finalStatus.warnings : s.warnings
      }));
      const now = new Date().toLocaleString('pt-BR');
      localStorage.setItem('last_sync', now);
      setLastSync(now);

      try {
        const refreshed = await fetchInventory();
        if (refreshed && Array.isArray(refreshed.resultados)) {
          setFullInventory(refreshed.resultados);
          if (!activeSearch) {
            setResults(refreshed.resultados);
          }
        }
      } catch (_) {}
      
      setTimeout(() => {
        setSyncJob(s => ({ ...s, active: false }));
      }, 10000);
    } catch (err: any) {
      stopSyncPolling();
      setSyncJob(s => ({
        ...s,
        phase: "error",
        status: "error",
        errorMsg: String(err.message || "Erro desconhecido").split("\n")[0].trim()
      }));
      setTimeout(() => {
        setSyncJob(s => ({ ...s, active: false }));
      }, 10000);
    }
  };

  const cancelSyncJob = async () => {
    stopSyncPolling();
    try {
      await fetch("/api/cancel-inventory", { method: "POST" });
    } catch(e) {}
    setSyncJob({
      active: false,
      step: 0,
      phase: "idle",
      status: "running",
      message: "Validando sessão do Confluence...",
      processed: 0,
      total: 0,
      percentage: 0,
      succeeded: 0,
      reused: 0,
      failed: 0,
      warnings: 0,
      errorMsg: ""
    });
  };

  
  // Advanced Inventory State
  const [inventoryFilters, setInventoryFilters] = useState<Record<string, string[]>>({
    tipo_mapa: [],
    produto: [],
    subproduto: [],
    responsavel: [],
    measurement_class: [],
    parametro: [],
    ano: []
  });
  const [onlyDivergent, setOnlyDivergent] = useState(false);
  const [onlyWithoutResponsible, setOnlyWithoutResponsible] = useState(false);
  const [onlyWithoutSubproduct, setOnlyWithoutSubproduct] = useState(false);
  const [inventorySort, setInventorySort] = useState<{
    field: keyof Artifact | string;
    direction: 'asc' | 'desc';
  }>({ field: 'null', direction: 'desc' });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleBack = () => {
    switch (appState) {
      case 'events_capture':
        if (capturePlatform) {
          setCapturePlatform(null);
        } else {
          setAppState('initial');
        }
        break;
      case 'inventory_table':
      case 'results':
      case 'graph':
      case 'insights':
      case 'decision':
      case 'empty':
      case 'operational_insights':
      case 'produtos_analise':
      case 'parametros_analise':
        setAppState('initial');
        break;
      case 'initial':
      case 'home':
      case 'catalog':
      default:
        setAppState('initial');
    }
  };

  useEffect(() => {
    // Connect to Users API
    fetchUsers().then(users => {
      setUsersDb(users);
    }).catch(err => {
      console.error("Failed to load users:", err);
    });
  }, []);

  const handleAddUser = async (userData: Omit<UserType, 'id' | 'createdAt'>) => {
    try {
      const newUser = await createUser(userData);
      const updatedUsers = await fetchUsers();
      setUsersDb(updatedUsers);
    } catch (err: any) {
      alert(err.message || "Erro ao adicionar usuário.");
    }
  };

  const handleUpdateUser = async (updated: UserType) => {
    try {
      await updateUser(updated.id, updated);
      const updatedUsers = await fetchUsers();
      setUsersDb(updatedUsers);
    } catch (err: any) {
      alert(err.message || "Erro ao atualizar usuário.");
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      await deleteUser(id);
      const updatedUsers = await fetchUsers();
      setUsersDb(updatedUsers);
    } catch (err: any) {
      alert(err.message || "Erro ao deletar usuário.");
    }
  };

  const autoResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 220)}px`;
    }
  };

  useEffect(() => {
    autoResize();
  }, [query]);

  /**
   * Realiza a busca quando o usuário clica em Enter ou no ícone da Lupa.
   * Ele usa as rotas da API que definimos no backend.
   * Se o usuário digitar "Tudo" (ou a variação base), ele busca os insights completos.
   * Caso contrário, ele busca com base em palavras exatas.
   * @param overrideQuery - Se passado, sobrepõe o texto digitado (usado ao clicar nos atalhos)
   */
  const isSearchingRef = useRef(false);

  const executeSearch = async (overrideQuery?: string) => {
    if (isSearchingRef.current || loading) return;

    const q = overrideQuery ?? query;
    if (!q.trim()) return;

    isSearchingRef.current = true;
    setLoading(true);
    setAppState("results");
    setResults([]);
    setInsightFilters({ ga: 'all', produto: 'all', subproduto: 'all' });
    setExecutiveSummaryResult(null);
    setInsightsActiveTab("indicadores");

    try {
      const normalizedQ = normalizar(q);
      const isInventory = normalizedQ.includes("inventario") || 
                        normalizedQ.includes("base completa") || 
                        normalizedQ.includes("lista") || 
                        normalizedQ.includes("todos os dados") ||
                        normalizedQ.includes("relatorio geral");

      const data: SearchResponse = isInventory 
        ? await fetchInventory() 
        : await searchContent(q);

      setResults(data.resultados);
      if (isInventory) {
        setFullInventory(data.resultados);
      }
      setInsights(getFilteredInsights(data.resultados, q) || null);

      if (isInventory) {
        setAppState(appState === "results" ? "results" : "inventory_table");
      } else if (data.total === 0) {
        setAppState("empty");
      } else if (data.total === 1) {
        setAppState("inventory_table");
        setDetailModalItem(data.resultados[0]);
      } else {
        setAppState("results");
      }
    } catch (error) {
      console.error("Search failed", error);
      setAppState("empty");
    } finally {
      setLoading(false);
      isSearchingRef.current = false;
    }
  };

  const applyInsightFilters = () => {
    let filtered = [...results];
    if (insightFilters.ga !== 'all') {
      filtered = filtered.filter(item => normalizar(item.tipo_mapa) === insightFilters.ga);
    }
    if (insightFilters.produto !== 'all') {
      filtered = filtered.filter(item => item.produto === insightFilters.produto);
    }
    if (insightFilters.subproduto !== 'all') {
      filtered = filtered.filter(item => item.subproduto === insightFilters.subproduto);
    }
    setInsights(getFilteredInsights(filtered, query));
  };

  useEffect(() => {
    if (appState === "insights") {
      applyInsightFilters();
    }
  }, [insightFilters, appState]);

  const handleGenerateExecutiveSummary = async () => {
    setIsGeneratingSummary(true);
    setShowExecutiveModal(false);
    try {
      const response = await fetch("/api/insights/executive-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifacts: results,
          term: query,
          context: "Geração de resumo executivo pelo Hub de Artefatos"
        })
      });

      if (!response.ok) throw new Error("Erro na rede ou IA insdisponível");
      const data = await response.json();
      setExecutiveSummaryResult(data);
      setInsightsActiveTab("resumo_executivo");
    } catch (e: any) {
      alert("Erro ao gerar resumo: " + e.message);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const debouncedTableFilter = useDebouncedSearch(tableFilter, 150);

  // Índice textual leve montado UMA ÚNICA VEZ quando os resultados mudarem e a aba de inventário estiver ativa
  const indexedInventory = useMemo(() => {
    if (appState !== 'inventory_table') return [];
    return results
      .filter(i => !isRoot(i))
      .map(artifact => ({
        artifact,
        normId: normalizeSearchText(artifact.id),
        normTitle: normalizeSearchText(artifact.titulo),
        searchableText: buildArtifactSearchableText(artifact),
      }));
  }, [results, appState]);

  // Inventory Logic - Computed Filtered & Sorted Results
  const filteredInventory = useMemo(() => {
    let list = indexedInventory;

    // Secondary Detailed Filters
    if (onlyWithoutResponsible) {
      list = list.filter(({ artifact: i }) => !i.responsavel || i.responsavel === '-');
    }
    if (onlyWithoutSubproduct) {
      list = list.filter(({ artifact: i }) => !i.subproduto || i.subproduto === '-');
    }
    if (onlyDivergent) {
      list = list.filter(({ artifact: i }) => i.status_divergent === true);
    }

    // Independent Multidimensional Filters
    if (inventoryFilters.tipo_mapa && inventoryFilters.tipo_mapa.length > 0) {
      list = list.filter(({ artifact: i }) => {
        const t = (i.artifact_type || 'NAO_CLASSIFICADO').toUpperCase();
        return inventoryFilters.tipo_mapa.includes(t);
      });
    }
    if (inventoryFilters.measurement_class && inventoryFilters.measurement_class.length > 0) {
      list = list.filter(({ artifact: i }) => {
        const m = resolveMeasurementClass(i);
        return inventoryFilters.measurement_class.includes(m);
      });
    }
    if (inventoryFilters.produto && inventoryFilters.produto.length > 0) {
      list = list.filter(({ artifact: i }) => inventoryFilters.produto.includes(i.produto || ""));
    }
    if (inventoryFilters.subproduto && inventoryFilters.subproduto.length > 0) {
      list = list.filter(({ artifact: i }) => inventoryFilters.subproduto.includes(i.subproduto || ""));
    }
    if (inventoryFilters.responsavel && inventoryFilters.responsavel.length > 0) {
      list = list.filter(({ artifact: i }) => inventoryFilters.responsavel.includes(i.responsavel || ""));
    }
    if (inventoryFilters.parametro && inventoryFilters.parametro.length > 0) {
      list = list.filter(({ artifact: i }) => (i.parameter_summary || []).some(p => inventoryFilters.parametro.includes(p.name)));
    }
    if (inventoryFilters.ano && inventoryFilters.ano.length > 0) {
      list = list.filter(({ artifact: i }) => {
        const date = new Date(i.ultima_atualizacao);
        return inventoryFilters.ano.includes(date.getFullYear().toString());
      });
    }

    // Busca textual rápida (todas as palavras presentes no searchableText)
    const queryTokens = getQueryTokens(debouncedTableFilter);
    if (queryTokens.length > 0) {
      list = list.filter(({ searchableText }) => matchesAllTokens(searchableText, queryTokens));
    }

    // Sorting: se o usuário selecionou uma coluna, respeitar a coluna. Caso contrário, se houver busca, priorizar correspondência exata de ID e início do título.
    if (inventorySort.field !== 'null') {
      const sorted = [...list].sort((aObj, bObj) => {
        const a = aObj.artifact;
        const b = bObj.artifact;
        let valA = '';
        let valB = '';
        if (inventorySort.field === 'artifact_type') {
          valA = a.artifact_type || 'NAO_CLASSIFICADO';
          valB = b.artifact_type || 'NAO_CLASSIFICADO';
        } else if (inventorySort.field === 'measurement_class') {
          valA = resolveMeasurementClass(a);
          valB = resolveMeasurementClass(b);
        } else {
          valA = String(a[inventorySort.field as keyof Artifact] || "");
          valB = String(b[inventorySort.field as keyof Artifact] || "");
        }
        
        if (inventorySort.direction === 'asc') {
          return valA.localeCompare(valB, 'pt-BR', { numeric: true });
        } else {
          return valB.localeCompare(valA, 'pt-BR', { numeric: true });
        }
      });
      return sorted.map(({ artifact }) => artifact);
    }

    if (queryTokens.length > 0) {
      const prioritized = sortWithSearchPriority(list, debouncedTableFilter);
      return prioritized.map(({ artifact }) => artifact);
    }

    return list.map(({ artifact }) => artifact);
  }, [indexedInventory, debouncedTableFilter, inventoryFilters, inventorySort, onlyDivergent, onlyWithoutResponsible, onlyWithoutSubproduct]);

  const currentInventoryInsights = useMemo(() => {
    return getFilteredInsights(filteredInventory, tableFilter || query);
  }, [filteredInventory, tableFilter, query]);

  const inventorySummary = useMemo(() => {
    return {
      total: filteredInventory.length,
      ga4: filteredInventory.filter(i => normalizar(i.tipo_mapa) === 'ga4').length,
      universalAnalytics: filteredInventory.filter(i => normalizar(i.tipo_mapa) === 'universal analytics').length,
      docs: filteredInventory.filter(i => {
        const t = normalizar(i.tipo_mapa);
        return t === 'doc' || (t !== 'ga4' && t !== 'universal analytics');
      }).length
    };
  }, [filteredInventory]);

  const startResize = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Find the current width or use the default min width from CSS / content
    const thElement = (e.target as HTMLElement).closest('th');
    const startWidth = thElement ? thElement.getBoundingClientRect().width : 120;
    
    resizingRef.current = {
      key,
      startX: e.clientX,
      startWidth
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingRef.current) return;
    
    const { key, startX, startWidth } = resizingRef.current;
    const diff = e.clientX - startX;
    const newWidth = Math.max(120, startWidth + diff); // 120px min width
    
    setColumnWidths(prev => ({
      ...prev,
      [key]: newWidth
    }));
  };

  const handleMouseUp = () => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const handleViewArtifactDetails = (id: string) => {
    setShowGraph(false);
    setAppState("inventory_table");
    setTableFilter(id);
    setInventoryFilters({
      tipo_mapa: [],
      produto: [],
      subproduto: [],
      responsavel: [],
      measurement_class: [],
      parametro: [],
      ano: []
    });
    setOnlyDivergent(false);
    setOnlyWithoutResponsible(false);
    setOnlyWithoutSubproduct(false);
    
    setTimeout(() => {
      const art = results.find(r => r.id === id);
      if (art) setDetailModalItem(art);
      const el = document.getElementById(`row-${id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  };

  const hasActiveInventoryFilters = useMemo(() => {
    return Object.values(inventoryFilters).some(arr => arr.length > 0) ||
      onlyDivergent ||
      onlyWithoutResponsible ||
      onlyWithoutSubproduct;
  }, [inventoryFilters, onlyDivergent, onlyWithoutResponsible, onlyWithoutSubproduct]);

  const clearOnlyInventoryFilters = () => {
    setInventoryFilters({
      tipo_mapa: [],
      produto: [],
      subproduto: [],
      responsavel: [],
      measurement_class: [],
      parametro: [],
      ano: []
    });
    setOnlyDivergent(false);
    setOnlyWithoutResponsible(false);
    setOnlyWithoutSubproduct(false);
  };

  const resetInventoryFilters = () => {
    setTableFilter("");
    setInventoryFilters({
      tipo_mapa: [],
      produto: [],
      subproduto: [],
      responsavel: [],
      measurement_class: [],
      parametro: [],
      ano: []
    });
    setOnlyDivergent(false);
    setOnlyWithoutResponsible(false);
    setOnlyWithoutSubproduct(false);
    setInventorySort({ field: 'null', direction: 'desc' });
  };

  const filterOptions = useMemo(() => {
    const prodCounts = new Map<string, number>();
    const subCounts = new Map<string, number>();
    const measurementCounts = new Map<string, number>();
    const typeCounts = new Map<string, number>();
    const paramCounts = new Map<string, number>();
    const yearCounts = new Map<string, number>();

    results.forEach(i => {
      if (i.produto) prodCounts.set(i.produto, (prodCounts.get(i.produto) || 0) + 1);
      if (i.subproduto) subCounts.set(i.subproduto, (subCounts.get(i.subproduto) || 0) + 1);

      const mc = resolveMeasurementClass(i);
      measurementCounts.set(mc, (measurementCounts.get(mc) || 0) + 1);

      const tp = (i.artifact_type || 'NAO_CLASSIFICADO').toUpperCase();
      typeCounts.set(tp, (typeCounts.get(tp) || 0) + 1);

      (i.parameter_summary || []).forEach(p => {
        paramCounts.set(p.name, (paramCounts.get(p.name) || 0) + 1);
      });

      if (i.ultima_atualizacao) {
        const y = new Date(i.ultima_atualizacao).getFullYear().toString();
        if (y && !isNaN(Number(y))) yearCounts.set(y, (yearCounts.get(y) || 0) + 1);
      }
    });

    const topParams = Array.from(paramCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25);

    return {
      tipoArtefato: [
        { v: 'all', l: 'Todos' },
        { v: 'MAPA', l: `Mapas (${typeCounts.get('MAPA') || 0})` },
        { v: 'DOCUMENTACAO', l: `Documentações (${typeCounts.get('DOCUMENTACAO') || 0})` },
        { v: 'NO', l: `Nós (${typeCounts.get('NO') || 0})` },
        { v: 'NAO_CLASSIFICADO', l: `Não classificados (${typeCounts.get('NAO_CLASSIFICADO') || 0})` }
      ],
      classificacao: [
        { v: 'all', l: 'Todos' },
        { v: 'GA4', l: `GA4 (${measurementCounts.get('GA4') || 0})` },
        { v: 'GA3', l: `Universal Analytics (GA3) (${measurementCounts.get('GA3') || 0})` },
        { v: 'HIBRIDO', l: `Híbrido (${measurementCounts.get('HIBRIDO') || 0})` },
        { v: 'NAO_CLASSIFICADO', l: `Não classificado (${measurementCounts.get('NAO_CLASSIFICADO') || 0})` }
      ],
      produtos: [
        { v: 'all', l: 'Todos' },
        ...Array.from(prodCounts.entries()).sort().map(([p, c]) => ({ v: p, l: `${p} (${c})` }))
      ],
      subprodutos: [
        { v: 'all', l: 'Todos' },
        ...Array.from(subCounts.entries()).sort().map(([s, c]) => ({ v: s, l: `${s} (${c})` }))
      ],
      parametros: [
        { v: 'all', l: 'Todos' },
        ...topParams.map(([p, c]) => ({ v: p, l: `${p} (${c})` }))
      ],
      anos: [
        { v: 'all', l: 'Todos' },
        ...Array.from(yearCounts.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([y, c]) => ({ v: y, l: `${y} (${c})` }))
      ]
    };
  }, [results]);

  const isInventoryFilterActive = useMemo(() => {
    return (
      tableFilter.trim() !== "" ||
      Object.values(inventoryFilters).some(arr => arr && arr.length > 0 && !arr.includes("all")) ||
      onlyWithoutResponsible ||
      onlyWithoutSubproduct ||
      onlyDivergent
    );
  }, [tableFilter, inventoryFilters, onlyWithoutResponsible, onlyWithoutSubproduct, onlyDivergent]);

  // Estados contextuais para Análise por Produto
  const [productSearch, setProductSearch] = useState("");
  const [productSubprodutoFilter, setProductSubprodutoFilter] = useState("TODOS");

  const availableProductSubprodutos = useMemo(() => {
    const subs = new Set<string>();
    results.forEach(a => {
      if (a.subproduto && a.subproduto.trim()) {
        subs.add(a.subproduto.trim());
      }
    });
    return Array.from(subs).sort();
  }, [results]);

  const isProductFilterActive = useMemo(() => {
    return productSearch.trim() !== "" || productSubprodutoFilter !== "TODOS";
  }, [productSearch, productSubprodutoFilter]);

  const resetProductFilters = () => {
    setProductSearch("");
    setProductSubprodutoFilter("TODOS");
  };

  // Estados contextuais para Análise por Parâmetro
  const [paramSearch, setParamSearch] = useState("");
  const isParamFilterActive = useMemo(() => paramSearch.trim() !== "", [paramSearch]);
  const resetParamFilters = () => {
    setParamSearch("");
  };

  // Estados contextuais para Insights Canônicos (sem busca)
  const [insightsProductFilter, setInsightsProductFilter] = useState("all");
  const [insightsSubprodutoFilter, setInsightsSubprodutoFilter] = useState("all");
  const [insightsMeasurementFilter, setInsightsMeasurementFilter] = useState("all");

  const availableInsightsProducts = useMemo(() => {
    return Array.from(new Set(results.map(a => a.produto).filter(Boolean))).sort() as string[];
  }, [results]);

  const availableInsightsSubprodutos = useMemo(() => {
    const list = results
      .filter(a => insightsProductFilter === "all" || a.produto === insightsProductFilter)
      .map(a => a.subproduto)
      .filter(Boolean) as string[];
    return Array.from(new Set(list)).sort();
  }, [results, insightsProductFilter]);

  const isInsightsFilterActive = useMemo(() => {
    return insightsProductFilter !== "all" || insightsSubprodutoFilter !== "all" || insightsMeasurementFilter !== "all";
  }, [insightsProductFilter, insightsSubprodutoFilter, insightsMeasurementFilter]);

  const resetInsightsFilters = () => {
    setInsightsProductFilter("all");
    setInsightsSubprodutoFilter("all");
    setInsightsMeasurementFilter("all");
  };

  const handleSort = (field: keyof Artifact | string) => {
    setInventorySort(prev => {
      if (prev.field === field) {
        return { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { field, direction: 'asc' };
    });
  };

  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    const regex = new RegExp(`(${highlight})`, "gi");
    const parts = String(text).split(regex);
    return parts.map((part, i) => 
      regex.test(part) ? <mark key={i} className="bg-yellow-100 text-gray-900 dark:text-slate-50 border-b-2 border-yellow-400 p-0 font-bold">{part}</mark> : part
    );
  };

  const useSuggestion = (text: string) => {
    setQuery(text);
    executeSearch(text);
  };

  // Função central única para encerrar completamente a pesquisa atual e voltar ao estado inicial da busca
  const resetSearchSession = useCallback(() => {
    // 1. Interromper qualquer processo de busca assíncrona ativo
    isSearchingRef.current = false;
    setLoading(false);

    // 2. Limpar busca textual e objeto central de ActiveSearch
    setQuery("");
    setActiveSearch(null);

    // 3. Restaurar resultados para o inventário já carregado (sem descarregar nem recarregar do backend)
    if (fullInventory.length > 0) {
      setResults(fullInventory);
    }

    // 4. Limpar filtros e paginação da tela de Cards (restaurando ordenação padrão 'recentes')
    setCardSearch("");
    setCardSort("recentes");
    setCardArtifactType("todos");
    setCardResponsible("todos");
    setCardYear("todas");
    setCardPage(1);

    // 5. Limpar filtros e estados contextuais das demais telas (Inventário, Produtos, Parâmetros, Insights)
    resetInventoryFilters();
    resetProductFilters();
    resetParamFilters();
    resetInsightsFilters();
    setInsightFilters({ ga: 'all', produto: 'all', subproduto: 'all' });
    setInsights(null);
    setExecutiveSummaryResult(null);
    setExecutiveSummaryParams(null);
    setIsGeneratingSummary(false);
    setInsightsActiveTab("indicadores");
    setShowGraph(false);
    setShowSummary(false);

    // 6. Fechar quaisquer modais abertos e limpar alvos de detalhe
    setDetailModalItem(null);
    setDetailTarget(null);
    setConexoesTargetArtifactId(null);
    setShowAdmin(false);
    setShowExportModal(false);
    setShowExecutiveModal(false);
    setIsSyncAuthOpen(false);

    // 7. Limpar chaves residuais de busca em sessionStorage e localStorage (caso existam)
    try {
      const searchKeys = [
        'search_query',
        'active_search',
        'search_mode',
        'search_params',
        'search_criteria',
        'param_input',
        'content_query',
        'ai_question',
      ];
      searchKeys.forEach((key) => {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
      });
    } catch (_) {
      // Ignorar eventuais restrições de sandbox
    }

    // 8. Incrementar sinalizador para resetar o SearchCenter imediatamente (mesmo quando o componente permanece montado)
    setSearchSessionId((prev) => prev + 1);

    // 9. Atualizar estado da aplicação para 'initial'
    setRawAppState('initial');

    // 10. Navegar explicitamente para /hub-de-artefatos sem parâmetros de query na URL
    navigate('/hub-de-artefatos', { replace: true });
  }, [fullInventory, navigate]);

  const resetSearch = resetSearchSession;

  const downloadFile = (data: string, filename: string, type: string) => {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = async (format: "csv" | "json") => {
    try {
      const items = filteredInventory;

      if (format === "json") {
        downloadFile(JSON.stringify(items, null, 2), "inventario_hub_filtrado.json", "application/json");
      } else {
        const headers = Object.keys(items[0]).join(",");
        const rows = items.map((item: any) => 
          Object.values(item).map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")
        );
        const csv = [headers, ...rows].join("\n");
        downloadFile(csv, "inventario_hub_filtrado.csv", "text/csv");
      }
      setShowExportModal(false);
    } catch (error) {
      console.error("Export failed", error);
    }
  };

  const GradientSparkles = ({ className, animate = false }: { className?: string; animate?: boolean }) => (
    <motion.div
      animate={animate ? { scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] } : {}}
      transition={{ repeat: Infinity, duration: 2 }}
      className={className}
    >
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "url(#sparkle-grad)" }}>
        <defs>
          <linearGradient id="sparkle-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7d046d" />
            <stop offset="100%" stopColor="#cc092f" />
          </linearGradient>
        </defs>
        <path d="m12 3 1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3Z"/>
        <path d="M5 3v4"/><path d="M3 5h4"/><path d="M21 17v4"/><path d="M19 19h4"/>
      </svg>
    </motion.div>
  );

  const hasPermission = true;

  return (
    <AppShell
      currentRouteId={appState}
      onNavigate={(item) => setAppState(item.id as any)}
      onHomeClick={resetSearchSession}
      onNewSearch={resetSearchSession}
      lastSync={lastSync}
      onSyncClick={() => startBackgroundSync()}
      hasFilters={['results', 'inventory_table', 'produtos_analise', 'parametros_analise', 'insights', 'journeys'].includes(appState)}
      contextualContent={
        appState === 'journeys' ? (
          <JourneysSidebarFilters
            artifacts={fullInventory}
            selectedProduct={journeyProduct}
            onSelectProduct={setJourneyProduct}
            selectedSubproduct={journeySubproduct}
            onSelectSubproduct={setJourneySubproduct}
            selectedMapId={journeyMapId}
            onSelectMapId={setJourneyMapId}
            isLoading={loading}
          />
        ) : (
        <SidebarContextualArea
          currentRouteId={appState}
          cardSearch={cardSearch}
          onCardSearchChange={(val) => {
            setCardSearch(val);
            setCardPage(1);
          }}
          cardSort={cardSort}
          onCardSortChange={(val) => {
            setCardSort(val);
            setCardPage(1);
          }}
          hasActiveSearch={activeSearch !== null}
          cardArtifactType={cardArtifactType}
          onCardArtifactTypeChange={(val) => {
            setCardArtifactType(val);
            setCardPage(1);
          }}
          cardResponsible={cardResponsible}
          onCardResponsibleChange={(val) => {
            setCardResponsible(val);
            setCardPage(1);
          }}
          cardYear={cardYear}
          onCardYearChange={(val) => {
            setCardYear(val);
            setCardPage(1);
          }}
          availableResponsibles={availableResponsibles}
          availableYears={availableYears}
          isCardFilterActive={isCardFilterActive}
          onResetCardFilters={resetCardFilters}

          tableFilter={tableFilter}
          onTableFilterChange={setTableFilter}
          inventoryFilters={inventoryFilters as any}
          onInventoryFiltersChange={setInventoryFilters}
          filterOptions={filterOptions}
          onlyWithoutResponsible={onlyWithoutResponsible}
          onToggleOnlyWithoutResponsible={() => setOnlyWithoutResponsible(prev => !prev)}
          onlyWithoutSubproduct={onlyWithoutSubproduct}
          onToggleOnlyWithoutSubproduct={() => setOnlyWithoutSubproduct(prev => !prev)}
          onlyDivergent={onlyDivergent}
          onToggleOnlyDivergent={() => setOnlyDivergent(prev => !prev)}
          isInventoryFilterActive={isInventoryFilterActive}
          onResetInventoryFilters={resetInventoryFilters}

          productSearch={productSearch}
          onProductSearchChange={setProductSearch}
          productSubprodutoFilter={productSubprodutoFilter}
          onProductSubprodutoFilterChange={setProductSubprodutoFilter}
          availableProductSubprodutos={availableProductSubprodutos}
          isProductFilterActive={isProductFilterActive}
          onResetProductFilters={resetProductFilters}

          paramSearch={paramSearch}
          onParamSearchChange={setParamSearch}
          isParamFilterActive={isParamFilterActive}
          onResetParamFilters={resetParamFilters}

          insightsProductFilter={insightsProductFilter}
          onInsightsProductFilterChange={setInsightsProductFilter}
          availableInsightsProducts={availableInsightsProducts}
          insightsSubprodutoFilter={insightsSubprodutoFilter}
          onInsightsSubprodutoFilterChange={setInsightsSubprodutoFilter}
          availableInsightsSubprodutos={availableInsightsSubprodutos}
          insightsMeasurementFilter={insightsMeasurementFilter}
          onInsightsMeasurementFilterChange={setInsightsMeasurementFilter}
          isInsightsFilterActive={isInsightsFilterActive}
          onResetInsightsFilters={resetInsightsFilters}
        />
        )
      }
    >
      <Suspense fallback={<PageLoading />}>
      <div className="relative w-full flex-1 flex flex-col min-h-screen">
      <AnimatePresence>
        <SyncWidget job={syncJob} onCancel={cancelSyncJob} />
      </AnimatePresence>

      <AnimatePresence>
        {showAdmin && (
          <AdminUsers 
            users={usersDb}
            onAddUser={handleAddUser}
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser}
            onClose={() => navigate('/hub-de-artefatos')}
          />
        )}
      </AnimatePresence>

      <div className={`flex flex-col flex-1 w-full transition-all relative opacity-100`}>

        {!hasPermission ? (
          <div className="flex flex-col items-center justify-center flex-1 py-32 text-center mt-32">
            <Shield className="w-16 h-16 text-gray-300 dark:text-slate-600 mb-6" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-50 tracking-tight">Você não possui permissão para acessar esta área.</h2>
            <button
               onClick={() => setAppState('copilot')}
               className="mt-8 px-6 py-3 bg-white dark:bg-slate-900 dark:border-slate-800 border border-gray-200 dark:border-slate-600 shadow-sm dark:shadow-none hover:border-gray-900 hover:text-gray-900 dark:text-slate-50 rounded-full font-bold transition-all text-xs text-gray-500 dark:text-slate-400"
            >
               Voltar ao Início
            </button>
          </div>
        ) : (
          <>
        <section className={`hero flex flex-col flex-1 w-full items-center justify-start pt-8 ${appState !== "initial" ? "!hidden" : ""}`}>
          <SearchCenter
            artifacts={fullInventory}
            activeSearch={activeSearch}
            resetSignal={searchSessionId}
            onApplyToCards={handleApplyToCards}
            onNavigateToOperationalInsights={() => setAppState("operational_insights")}
          />
        </section>

        {/* Level 2: Insights Dashboard (Operational) */}
        {appState === "operational_insights" && (
          <section className="w-full max-w-5xl mx-auto pt-8 pb-12">
            <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-3xl font-black text-gray-900 dark:text-slate-50 tracking-tight flex items-center gap-3">
                  <Activity className="w-8 h-8 text-purple-600" />
                  Insights Operacionais
                </h2>
                <p className="text-gray-500 dark:text-slate-400 font-medium mt-2">Atividades recentes e evolução de atualizações</p>
              </div>
            </div>
            <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Timeline */}
              <div className="glass-card p-8 rounded-[40px] border border-gray-100 dark:border-slate-700 flex flex-col h-[400px]">
                <div className="flex items-center gap-3 mb-6">
                  <Clock className="w-5 h-5 text-gray-400 dark:text-slate-500" />
                  <h3 className="font-bold text-gray-900 dark:text-slate-50">Atividades Recentes</h3>
                </div>
                <div className="flex-1 overflow-y-auto space-y-4 pr-3 custom-scrollbar">
                  {recentActivities.length > 0 ? recentActivities.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="group flex gap-4 cursor-pointer hover:bg-gray-50 dark:bg-slate-800/80 p-3 -ml-3 rounded-2xl transition-all duration-300"
                      onClick={() => window.open(item.link, '_blank')}
                      title="Abrir mapa em nova guia"
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 flex items-center justify-center shrink-0 group-hover:bg-purple-50 group-hover:border-purple-100 transition-colors">
                        <RefreshCw className="w-4 h-4 text-gray-400 dark:text-slate-500 group-hover:text-purple-600 transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 dark:text-slate-50 font-bold leading-snug truncate group-hover:text-purple-600 transition-colors">
                          {item.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[11px] font-medium text-gray-500 dark:text-slate-400">
                          <span className="whitespace-nowrap">{item.date}</span>
                          <span className="w-1 h-1 rounded-full bg-gray-300 shrink-0"></span>
                          <span className="truncate max-w-[120px]">{item.responsavel}</span>
                          <span className="w-1 h-1 rounded-full bg-gray-300 shrink-0"></span>
                          <span className="text-purple-600 font-bold whitespace-nowrap">{item.status}</span>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="text-sm text-gray-400 dark:text-slate-500 font-medium p-4 text-center">Nenhuma atividade!</div>
                  )}
                </div>
              </div>

              {/* Gráfico de Atualizações */}
              <div className="glass-card p-8 rounded-[40px] border border-gray-100 dark:border-slate-700 flex flex-col lg:col-span-2 h-[400px]">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-gray-400 dark:text-slate-500" />
                    <h3 className="font-bold text-gray-900 dark:text-slate-50">Evolução de Atualizações</h3>
                  </div>
                  <div className="flex gap-2">
                    <span className="px-4 py-1.5 bg-gray-900 dark:bg-slate-50 text-white rounded-full text-[11px] font-bold ">Histórico Real</span>
                  </div>
                </div>
                
                {/* Updated Elegant Graph Area avoiding overflow */}
                <div className="flex-1 w-full pt-8 relative flex flex-col justify-end">
                  <div className="flex items-end justify-between h-full gap-2 sm:gap-4 px-2 sm:px-6 w-full relative">
                  {chartData.length > 0 ? chartData.map((bar, idx) => (
                    <div 
                      key={idx} 
                      className="flex flex-col items-center flex-1 group cursor-pointer h-full relative"
                      onClick={() => handleBarClick(bar.items)}
                    >
                      {/* Tooltip on Hover */}
                      <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 scale-95 opacity-0 group-[&:hover]:opacity-100 group-[&:hover]:scale-100 transition-all duration-300 z-[100] pointer-events-none bg-gray-900 dark:bg-slate-50 text-white px-4 py-3 rounded-2xl text-xs font-medium shadow-2xl dark:shadow-none min-w-[200px] flex flex-col gap-2">
                        <div className="font-bold text-sm border-b border-gray-700/50 pb-2 mb-1 flex justify-between items-center gap-4">
                          <span className="text-gray-300 dark:text-slate-600">{idx === chartData.length - 1 ? 'Hoje' : bar.label}</span>
                          <span className="text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md">{bar.value} atlz</span>
                        </div>
                        {bar.items.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {bar.items.slice(0, 3).map((item: any, i: number) => (
                              <span key={i} className="truncate text-gray-200 text-[11px] flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0"></span>
                                {item.titulo}
                              </span>
                            ))}
                            {bar.items.length > 3 && (
                              <span className="text-gray-500 dark:text-slate-400 text-[10px] font-bold mt-1 px-3">
                                + {bar.items.length - 3} itens alterados
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-500 dark:text-slate-400 text-[11px] italic">Nenhuma atividade neste dia</span>
                        )}
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-900 dark:bg-slate-50 rotate-45"></div>
                      </div>

                      <div className="flex-1 flex flex-col justify-end items-center w-full relative">
                         {bar.value > 0 && (
                            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 mb-2 opacity-0 group-[&:hover]:opacity-100 group-[&:hover]:text-purple-600 transition-all group-[&:hover]:-translate-y-1">
                              {bar.value}
                            </span>
                         )}
                         <div className="w-full flex justify-center h-full items-end relative">
                            {/* The line track */}
                            <div className="absolute w-[4px] bottom-0 bg-gray-50 dark:bg-slate-800 h-full rounded-t-full transition-colors group-[&:hover]:bg-gray-100 dark:bg-slate-700"></div>
                            {/* The actual filled bar */}
                            <div 
                              className={`w-[4px] rounded-t-full z-10 opacity-70 group-[&:hover]:opacity-100 transition-all duration-500 relative bg-gradient-to-t from-gray-300 to-gray-400 group-[&:hover]:from-purple-500 group-[&:hover]:to-purple-400 ${bar.value === 0 ? 'min-h-[4px] from-gray-200 to-gray-200' : ''}`}
                              style={{ height: bar.height }}
                            ></div>
                         </div>
                      </div>
                      
                      <span className={`text-[10px] font-bold whitespace-nowrap mt-3 transition-colors ${idx === chartData.length - 1 ? 'text-gray-900 dark:text-slate-50' : 'text-gray-400 dark:text-slate-500 group-[&:hover]:text-gray-900 dark:text-slate-50'}`}>
                        {idx === chartData.length - 1 ? 'Hoje' : bar.label}
                      </span>
                    </div>
                  )) : (
                    <div className="w-full flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm font-medium">Gerando evolução...</div>
                  )}
                  </div>
                </div>
              </div>
              </div>
          </section>
        )}

        {/* Content Section */}
        <section className={`content ${["initial", "catalog", "events_capture", "home", "operational_insights"].includes(appState) ? "!hidden" : ""}`}>
          
          {/* Decision / Loading Area */}
          <section className={`decision ${appState === "decision" || appState === "empty" ? "flex flex-col items-center justify-center text-center py-24" : "!hidden"}`}>
            <div className="mb-8 scale-150 transform transition-transform duration-500">
              <GradientSparkles className="w-12 h-12" animate={loading} />
            </div>
            
            {appState === "empty" ? (
              <div className="no-results flex flex-col items-center">
                <div className="glass-card rounded-[40px] p-12 text-center max-w-lg border border-gray-100 dark:border-slate-700/50 shadow-2xl dark:shadow-none">
                  <h3 className="text-3xl font-bold mb-4 tracking-tight">Não foi possível encontrar resultados</h3>
                  <p className="text-gray-500 dark:text-slate-400 mb-10 text-lg">Nenhum artefato foi encontrado para <strong>"{query}"</strong>.</p>
                  <button 
                    className="hover:opacity-90 text-white px-10 py-4 rounded-full font-bold shadow-xl dark:shadow-none transition-all hover:scale-105" 
                    onClick={resetSearch}
                    style={{ background: 'linear-gradient(90deg, #7D046D 0%, #cc092f 100%)' }}
                  >
                    Continuar buscando
                  </button>
                </div>
              </div>
            ) : appState === "decision" ? (
              <div className="flex flex-col items-center">
                <p className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900 dark:text-slate-50 leading-tight mb-12">
                  Foram encontrados <strong className="text-[var(--bradesco-red)]">{results.length}</strong> itens para <strong>"{query}"</strong>.<br />
                  O que você quer fazer agora?
                </p>
                <div className="flex flex-col sm:flex-row gap-6 items-center">
                  <button className="bg-white dark:bg-slate-900 dark:border-slate-800 border border-gray-200 dark:border-slate-600 hover:border-bradesco-red hover:text-bradesco-red text-gray-800 dark:text-slate-200 px-10 py-4 rounded-full font-bold transition-all shadow-sm dark:shadow-none hover:shadow-md dark:shadow-none min-w-[200px]" onClick={() => setAppState("results")}>Ver resultados</button>
                  <button className="bg-white dark:bg-slate-900 dark:border-slate-800 border border-gray-200 dark:border-slate-600 hover:border-purple-600 hover:text-purple-600 text-gray-800 dark:text-slate-200 px-10 py-4 rounded-full font-bold transition-all shadow-sm dark:shadow-none hover:shadow-md dark:shadow-none min-w-[200px] flex items-center gap-2 justify-center" onClick={() => setAppState("operational_insights")}>
                    <Activity className="w-4 h-4" />
                    Ver insights
                  </button>
                  <button className="text-gray-400 dark:text-slate-500 hover:text-bradesco-red font-bold px-8 py-4 transition-colors" onClick={resetSearch}>Continuar buscando</button>
                </div>
              </div>
            ) : null}
          </section>

          {/* Canonical Insights Dashboard */}
          {appState === "insights" && (
            <motion.section 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="summary pb-20"
            >
              <CanonicalInsightsDashboard 
                artifacts={results}
                onOpenMap={(art) => setDetailModalItem(art)}
                onFilterByProduct={(prod) => {
                  setInventoryFilters(f => ({ ...f, produto: [prod] }));
                  setAppState("inventory_table");
                }}
                selectedProductFilter={insightsProductFilter}
                onProductFilterChange={setInsightsProductFilter}
                selectedSubprodutoFilter={insightsSubprodutoFilter}
                onSubprodutoFilterChange={setInsightsSubprodutoFilter}
                selectedMeasurementFilter={insightsMeasurementFilter}
                onMeasurementFilterChange={setInsightsMeasurementFilter}
              />
            </motion.section>
          )}

          {/* Análise por Produto */}
          {appState === "produtos_analise" && (
            <motion.section 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="produtos-container pb-20"
            >
              <ProductAnalysisView 
                artifacts={results}
                onOpenMap={(art) => setDetailModalItem(art)}
                onSelectProduct={(prod) => {
                  setInventoryFilters(f => ({ ...f, produto: [prod] }));
                  setAppState("inventory_table");
                }}
                searchTerm={productSearch}
                onSearchChange={setProductSearch}
                selectedSubproduto={productSubprodutoFilter}
                onSubprodutoChange={setProductSubprodutoFilter}
              />
            </motion.section>
          )}

          {/* Análise por Parâmetro */}
          {appState === "parametros_analise" && (
            <motion.section 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="parametros-container pb-20"
            >
              <ParameterAnalysisView 
                artifacts={results}
                onOpenMap={(art) => setDetailModalItem(art)}
                searchTerm={paramSearch}
                onSearchChange={setParamSearch}
              />
            </motion.section>
          )}

          {false && appState === "insights" && (
            !insights ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-32"
              >
                <div className="w-20 h-20 bg-gray-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center mb-6">
                  <Filter className="w-8 h-8 text-gray-300 dark:text-slate-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-slate-50 mb-2">Nenhum insight disponível</h3>
                <p className="text-sm font-medium text-gray-500 dark:text-slate-400">A busca atual não retornou resultados suficientes para gerar análises.</p>
              </motion.div>
            ) : (
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="summary"
            >
              {/* Filter Header */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                <div className="flex items-center gap-4 bg-gray-50 dark:bg-slate-800/50 p-2 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm dark:shadow-none overflow-x-auto max-w-full no-scrollbar">
                  <div className="flex items-center gap-2 px-3 py-1 border-r border-gray-200 dark:border-slate-600">
                    <Filter className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                    <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 whitespace-nowrap">Filtros</span>
                  </div>
                  
                  <select 
                    value={insightFilters.ga}
                    onChange={(e) => setInsightFilters(prev => ({ ...prev, ga: e.target.value }))}
                    className="bg-transparent text-xs font-bold text-gray-800 dark:text-slate-200 outline-none border-none py-1 cursor-pointer hover:text-bradesco-red transition-colors"
                  >
                    <option value="all">TODOS PADRÕES</option>
                    <option value="ga4">APENAS GA4</option>
                    <option value="universal analytics">APENAS UNIVERSAL ANALYTICS</option>
                    <option value="doc">APENAS DOCUMENTOS</option>
                  </select>

                  <select 
                    value={insightFilters.produto}
                    onChange={(e) => setInsightFilters(prev => ({ ...prev, produto: e.target.value }))}
                    className="bg-transparent text-xs font-bold text-gray-800 dark:text-slate-200 outline-none border-none py-1 cursor-pointer hover:text-red-600 transition-colors max-w-[150px]"
                  >
                    <option value="all">TODOS PRODUTOS</option>
                    {(Array.from(new Set(results.map(r => r.produto))) as string[]).filter(Boolean).map(p => (
                      <option key={p} value={p}>{p.toUpperCase()}</option>
                    ))}
                  </select>

                  <select 
                    value={insightFilters.subproduto}
                    onChange={(e) => setInsightFilters(prev => ({ ...prev, subproduto: e.target.value }))}
                    className="bg-transparent text-xs font-bold text-gray-800 dark:text-slate-200 outline-none border-none py-1 cursor-pointer hover:text-red-600 transition-colors max-w-[150px]"
                  >
                    <option value="all">TODOS SUBPRODUTOS</option>
                    {(Array.from(new Set(results.map(r => r.subproduto))) as string[]).filter(Boolean).map(s => (
                      <option key={s} value={s}>{s.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>

                  {/* KPIs - Refreshed with Semantic Colors */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                <div className="group relative glass-card p-6 rounded-[32px] border border-gray-100 dark:border-slate-700 shadow-sm dark:shadow-none transition-all hover:shadow-xl dark:shadow-none hover:-translate-y-1">
                  <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600 mb-4 group-hover:scale-110 transition-transform">
                    <Target className="w-6 h-6" />
                  </div>
                  <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 mb-1">Total Artefatos</p>
                  <p className="text-4xl font-extrabold text-gray-900 dark:text-slate-50 leading-none">{insights.total}</p>
                  <p className="text-[10px] text-gray-400 dark:text-slate-500 font-bold mt-2 ">
                    Mapas ({insights.mapas}) vs Docs ({insights.documentos})
                  </p>
                </div>

                <div className="group relative glass-card p-6 rounded-[32px] border-b-4 border-b-green-500 border border-gray-100 dark:border-slate-700 shadow-sm dark:shadow-none transition-all hover:shadow-xl dark:shadow-none hover:-translate-y-1">
                  <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center text-green-600 mb-4 group-hover:scale-110 transition-transform">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 mb-1">GA4</p>
                  <p className="text-4xl font-extrabold text-gray-900 dark:text-slate-50 leading-none">{insights.ga4}</p>
                  <span className="absolute top-6 right-6 text-[10px] font-black text-green-600 bg-green-50 px-2 py-1 rounded-full">{insights.porcentagens.ga4}%</span>
                </div>

                <div className="group relative glass-card p-6 rounded-[32px] border-b-4 border-b-bradesco-red border border-gray-100 dark:border-slate-700 shadow-sm dark:shadow-none transition-all hover:shadow-xl dark:shadow-none hover:-translate-y-1">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-bradesco-red mb-4 group-hover:scale-110 transition-transform">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 mb-1">Universal Analytics (GA3)</p>
                  <p className="text-4xl font-extrabold text-gray-900 dark:text-slate-50 leading-none">{insights.universalAnalytics}</p>
                  <span className="absolute top-6 right-6 text-[10px] font-black text-bradesco-red bg-red-50 px-2 py-1 rounded-full">{insights.porcentagens.universalAnalytics}%</span>
                </div>

                <div className="group relative glass-card p-6 rounded-[32px] border-b-4 border-b-gray-400 border border-gray-100 dark:border-slate-700 shadow-sm dark:shadow-none transition-all hover:shadow-xl dark:shadow-none hover:-translate-y-1">
                  <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-slate-800 flex items-center justify-center text-gray-400 dark:text-slate-500 mb-4 group-hover:scale-110 transition-transform">
                    <FileText className="w-6 h-6" />
                  </div>
                  <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 mb-1">Documentações</p>
                  <p className="text-4xl font-extrabold text-gray-900 dark:text-slate-50 leading-none">{insights.documentos}</p>
                  <span className="absolute top-6 right-6 text-[10px] font-black text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded-full">{insights.porcentagens.documentos}%</span>
                </div>
              </div>

              {/* Detailed Operational Insights Panels */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
                <div className="lg:col-span-2 flex flex-col gap-8">
                  {/* Tempo de Atualização */}
                  <div className="glass-card p-10 rounded-[40px] border border-gray-100 dark:border-slate-700 shadow-sm dark:shadow-none relative overflow-hidden">
                    <h4 className="text-xs font-black text-gray-400 dark:text-slate-500 mb-6 flex items-center gap-2">
                       <Clock className="w-4 h-4 text-purple-500" />
                       Frescor da Base
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 mb-1">Últimos 30 dias</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-slate-50">{insights.updates?.last30Days || 0}</p>
                        <p className="text-[11px] font-bold text-green-600">{insights.updates?.percentLast30Days || "0"}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 mb-1">Últimos 60 dias</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-slate-50">{insights.updates?.last60Days || 0}</p>
                        <p className="text-[11px] font-bold text-green-500">{insights.updates?.percentLast60Days || "0"}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 mb-1">Últimos 90 dias</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-slate-50">{insights.updates?.last90Days || 0}</p>
                        <p className="text-[11px] font-bold text-yellow-600">{insights.updates?.percentLast90Days || "0"}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 mb-1">Defasados (+90 dias)</p>
                        <p className="text-2xl font-bold text-red-600">{insights.updates?.olderThan90Days || 0}</p>
                        <p className="text-[11px] font-bold text-red-500">{insights.updates?.percentOlderThan90Days || "0"}%</p>
                      </div>
                    </div>
                  </div>

                  {/* Distribuição por Produto */}
                  <div className="glass-card p-10 rounded-[40px] border border-gray-100 dark:border-slate-700 shadow-sm dark:shadow-none relative overflow-hidden">
                    <h4 className="text-xs font-black text-gray-400 dark:text-slate-500 mb-6 flex items-center gap-2">
                       <Layers className="w-4 h-4 text-purple-500" />
                       Distribuição de Escopos
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="flex flex-col gap-4">
                         <h5 className="text-[10px] font-black text-gray-400 dark:text-slate-500 ">Produtos</h5>
                         {insights.distribProduto?.slice(0, 4).map((p, i) => (
                            <div key={i} className="flex justify-between items-center bg-gray-50 dark:bg-slate-800 p-4 rounded-2xl border border-gray-100 dark:border-slate-700">
                               <span className="text-sm font-bold text-gray-800 dark:text-slate-200">{p.name === "-" ? "N/A" : p.name}</span>
                               <div className="flex items-center gap-4">
                                  <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 ">{p.count} itens</span>
                               </div>
                            </div>
                         ))}
                      </div>

                      <div className="flex flex-col gap-4">
                         <h5 className="text-[10px] font-black text-gray-400 dark:text-slate-500 ">Subprodutos</h5>
                         {insights.distribSubproduto?.slice(0, 4).map((p, i) => (
                            <div key={i} className="flex justify-between items-center bg-gray-50 dark:bg-slate-800 p-4 rounded-2xl border border-gray-100 dark:border-slate-700">
                               <span className="text-sm font-bold text-gray-800 dark:text-slate-200">{p.name === "-" ? "N/A" : p.name}</span>
                               <div className="flex items-center gap-4">
                                  <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 ">{p.count} itens</span>
                               </div>
                            </div>
                         ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-1 flex flex-col gap-8">
                  {/* Versionamento */}
                  <div className="p-8 rounded-[40px] border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm dark:shadow-none flex flex-col items-center justify-center text-center">
                    <h4 className="text-xs font-black text-gray-400 dark:text-slate-500 mb-4">
                      Média de Versões
                    </h4>
                    <div className="w-20 h-20 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 mb-4">
                      <FileText className="w-8 h-8" />
                    </div>
                    <p className="text-5xl font-black text-gray-900 dark:text-slate-50">{insights.versioning?.averageVersions || "1"}</p>
                    <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mt-2">Versões por artefato</p>
                  </div>

                  {/* Top Atualizados */}
                  <div className="p-8 rounded-[40px] border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm dark:shadow-none flex-1">
                    <h4 className="text-xs font-black text-gray-400 dark:text-slate-500 mb-4">
                      Artefatos Mais Iterados
                    </h4>
                    <div className="flex flex-col gap-3 mt-4">
                      {insights.versioning?.topUpdated?.map((item, i) => (
                        <div key={i} className="flex flex-col border-b border-gray-50 dark:border-slate-800 pb-3 last:border-0 last:pb-0">
                           <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-gray-800 dark:text-slate-200 hover:text-purple-600 cursor-pointer truncate" title={item.titulo}>
                             {item.titulo}
                           </a>
                           <div className="flex justify-between items-center mt-1">
                              <span className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">{item.produto || "N/A"}</span>
                              <span className="text-[10px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded-full">v{item.versao}</span>
                           </div>
                        </div>
                      ))}
                      {(!insights.versioning?.topUpdated || insights.versioning.topUpdated.length === 0) && (
                        <span className="text-xs text-gray-400 dark:text-slate-500 text-center py-4 italic">Sem versionamento no conjunto.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              

            </motion.section>
            )
          )}

          {/* Graph Visualization Section */}
          <AnimatePresence>
            {appState === "graph" && (
              <motion.section 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="graph-container pb-20 space-y-6"
              >
                <PageHeader
                  title="Conexões"
                  subtitle="A árvore do Confluence como ela é: produtos, subprodutos e os mapas dentro de cada um. Clique no número de um nó para abrir os filhos."
                />
                <GraphView 
                  data={fullInventory && fullInventory.length > 0 ? fullInventory : results} 
                  isEmbedded={true}
                  targetArtifactId={conexoesTargetArtifactId}
                  onClearTargetArtifactId={handleClearConexoesTarget}
                  onOpenMap={handleOpenMapDetail}
                />
              </motion.section>
            )}
          </AnimatePresence>

          {/* Journeys Visualization Section */}
          <AnimatePresence>
            {appState === "journeys" && (
              <motion.section 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="journeys-container pb-20 space-y-6 flex flex-col flex-1"
                style={{ height: 'calc(100vh - 100px)' }}
              >
                <JourneysCanvas
                  artifacts={fullInventory}
                  selectedMapId={journeyMapId}
                  onOpenScreen={(map, target) => {
                    setDetailModalItem(map);
                    setDetailTarget(target || null);
                  }}
                />
              </motion.section>
            )}
          </AnimatePresence>

          {/* Results Area (Tela de Cards) */}
          <section className={`results space-y-6 ${appState === "results" && !loading ? "" : "!hidden"}`}>
            <PageHeader
              title="Artefatos"
              subtitle={
                activeSearch ? (
                  activeSearch.mode === 'conteudo' ? (
                    activeSearch.query ? (
                      `Busca por conteúdo: ${totalCardsCount} ${totalCardsCount === 1 ? 'artefato encontrado' : 'artefatos encontrados'} para "${activeSearch.query}"`
                    ) : (
                      `Inventário completo: ${totalCardsCount} artefatos`
                    )
                  ) : activeSearch.mode === 'parametros' ? (
                    `Busca por parâmetros: ${totalCardsCount} ${totalCardsCount === 1 ? 'artefato encontrado' : 'artefatos encontrados'}${activeSearch.query ? ` para "${activeSearch.query}"` : ''}`
                  ) : (
                    `Busca por IA: ${totalCardsCount} ${totalCardsCount === 1 ? 'artefato encontrado' : 'artefatos encontrados'} para "${activeSearch.aiQuestion || activeSearch.query}"`
                  )
                ) : (
                  "Todos os artefatos sincronizados. Use Nova busca para encontrar por nome, parâmetro ou pergunta."
                )
              }
              actions={
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setAppState('initial');
                    }}
                    className="btn-neu flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-ui font-semibold text-gray-700 dark:text-slate-200 hover:text-[#7B0209] h-10 cursor-pointer"
                    title="Editar busca no Hub de Artefatos"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#7B0209]" />
                    <span>Editar busca</span>
                  </button>
                  <button 
                    onClick={() => setShowExportModal(true)}
                    className="btn-neu flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-ui font-semibold text-bradesco-red hover:text-bradesco-red-hover h-10 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-bradesco-red" />
                    Extrair Dados
                  </button>
                </div>
              }
            />

            {/* Âncora para rolagem suave ao trocar de página */}
            <div ref={cardsListRef} className="scroll-mt-6" />

            {/* Contador de Resultados (somente quando houver resultados) */}
            {totalCardsCount > 0 && (
              <div className="flex items-center justify-between px-1 text-xs font-ui text-gray-500 dark:text-slate-400">
                <span className="tabular-nums">
                  Exibindo <strong className="font-semibold text-gray-800 dark:text-slate-200">{(cardPage - 1) * cardsPerPage + 1}–{Math.min(cardPage * cardsPerPage, totalCardsCount)}</strong> de <strong className="font-semibold text-gray-800 dark:text-slate-200">{totalCardsCount}</strong> resultados
                </span>
              </div>
            )}

            {/* Mensagem padronizada quando não houver resultado */}
            {totalCardsCount === 0 && (
              <ContextualEmptyState
                searchTerm={cardSearch}
                hasActiveFilters={hasActiveCardFilters}
                customTitle={activeSearch?.mode === 'parametros' && activeSearch.query && !cardSearch && !hasActiveCardFilters
                  ? 'Nenhum artefato contém todos os parâmetros'
                  : undefined}
                customDescription={activeSearch?.mode === 'parametros' && activeSearch.query && !cardSearch && !hasActiveCardFilters
                  ? (activeSearch.partialMatchesCount
                      ? `Nenhum ${activeSearch.scope === 'SCREEN' ? 'tela' : 'snippet'} reúne todos os critérios de “${activeSearch.query}”. ${activeSearch.partialMatchesCount} ${activeSearch.partialMatchesCount === 1 ? 'artefato tem' : 'artefatos têm'} correspondência parcial. Para vê-los, troque o operador para OU em Editar busca.`
                      : `Nenhum ${activeSearch.scope === 'SCREEN' ? 'tela' : 'snippet'} contém os critérios de “${activeSearch.query}”.`)
                  : undefined}
                onClearSearch={() => setCardSearch("")}
                onClearFilters={clearOnlyCardFilters}
                onClearAll={resetCardFilters}
              />
            )}

            {/* 5. Lista de Cards (Coluna única, máximo 20 por página) */}
            <div className="space-y-3">
              <AnimatePresence>
                {paginatedCards.map((item) => (
                  <ArtifactResultCard
                    key={item.id}
                    item={item}
                    activeSearch={activeSearch}
                    onOpenDetails={(artifact, target) => {
                      setDetailTarget(target ?? null);
                      setDetailModalItem(artifact);
                    }}
                    onViewInTree={handleViewInTree}
                  />
                ))}
              </AnimatePresence>
            </div>

            {/* 6. Paginação (Apenas no final natural do scroll, após o último card) */}
            {totalCardPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 pb-4 mt-6 border-t border-gray-200 dark:border-slate-800">
                <div className="text-xs font-ui text-gray-500 dark:text-slate-400 tabular-nums">
                  Exibindo <strong className="font-semibold text-gray-800 dark:text-slate-200">{(cardPage - 1) * cardsPerPage + 1}–{Math.min(cardPage * cardsPerPage, totalCardsCount)}</strong> de <strong className="font-semibold text-gray-800 dark:text-slate-200">{totalCardsCount}</strong> resultados
                </div>

                <nav aria-label="Paginação da lista de cards" className="flex items-center gap-1.5">
                  {/* Primeira página << */}
                  {cardPage > 1 && (
                    <>
                      <button
                        onClick={() => handleCardPageChange(1)}
                        title="Primeira página"
                        aria-label="Primeira página"
                        className="btn-neu px-3 h-9 flex items-center justify-center rounded-xl text-xs font-ui font-bold text-gray-700 dark:text-slate-200 hover:text-bradesco-red cursor-pointer"
                      >
                        <ChevronsLeft className="w-4 h-4" />
                      </button>
                      {/* Página anterior < */}
                      <button
                        onClick={() => handleCardPageChange(cardPage - 1)}
                        title="Página anterior"
                        aria-label="Página anterior"
                        className="btn-neu px-3 h-9 flex items-center justify-center rounded-xl text-xs font-ui font-bold text-gray-700 dark:text-slate-200 hover:text-bradesco-red cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {/* Até 3 números de página visíveis */}
                  {visiblePageNumbers.map((pageNum) => {
                    const isActive = pageNum === cardPage;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handleCardPageChange(pageNum)}
                        aria-current={isActive ? "page" : undefined}
                        className={`min-w-9 h-9 px-3 flex items-center justify-center rounded-xl text-xs font-ui font-bold transition-all cursor-pointer ${
                          isActive
                            ? "bg-bradesco-red text-white shadow-neu-raised border border-bradesco-red font-extrabold"
                            : "btn-neu text-gray-700 dark:text-slate-300 hover:text-bradesco-red"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  {/* Próxima página > */}
                  {cardPage < totalCardPages && (
                    <>
                      <button
                        onClick={() => handleCardPageChange(cardPage + 1)}
                        title="Próxima página"
                        aria-label="Próxima página"
                        className="btn-neu px-3 h-9 flex items-center justify-center rounded-xl text-xs font-ui font-bold text-gray-700 dark:text-slate-200 hover:text-bradesco-red cursor-pointer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      {/* Última página >> */}
                      <button
                        onClick={() => handleCardPageChange(totalCardPages)}
                        title="Última página"
                        aria-label="Última página"
                        className="btn-neu px-3 h-9 flex items-center justify-center rounded-xl text-xs font-ui font-bold text-gray-700 dark:text-slate-200 hover:text-bradesco-red cursor-pointer"
                      >
                        <ChevronsRight className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </nav>
              </div>
            )}
          </section>

          {/* Inventory Table View (Functional Explorer Interface) */}
          {appState === "inventory_table" && (
            <motion.section 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="inventory-table-container pb-20"
            >
              {/* Header Padronizado com PageHeader */}
              <PageHeader
                title="Inventário"
                subtitle="A base completa em formato de tabela, com classificação, produto, responsável e data de atualização."
                actions={
                  <button 
                    onClick={() => setShowExportModal(true)}
                    className="btn-neu flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-ui font-semibold text-bradesco-red hover:text-bradesco-red-hover h-10 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-bradesco-red" />
                    Extrair Dados
                  </button>
                }
              />

              {/* Quando não houver resultados no Inventário */}
              {filteredInventory.length === 0 ? (
                <ContextualEmptyState
                  searchTerm={tableFilter}
                  hasActiveFilters={hasActiveInventoryFilters}
                  onClearSearch={() => setTableFilter("")}
                  onClearFilters={clearOnlyInventoryFilters}
                  onClearAll={resetInventoryFilters}
                />
              ) : (
                <>
                  {/* Single Counter Label Before Table */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-slate-800 mb-6">
                    <div className="text-xs font-ui text-gray-500 dark:text-slate-400 tabular-nums">
                      Exibindo <strong className="font-semibold text-gray-800 dark:text-slate-200">{filteredInventory.length}</strong> de <strong className="font-semibold text-gray-800 dark:text-slate-200">{results.length}</strong> resultados
                    </div>
                  </div>

                  {/* Main Content Area: Table or Panel */}
              <AnimatePresence mode="wait">
                {inventoryViewMode === 'table' ? (
                  <motion.div 
                    key="table"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="glass-card overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700 shadow-xl dark:shadow-none bg-white dark:bg-slate-900 dark:border-slate-800"
                  >
                    <div className="overflow-x-auto overflow-y-auto custom-scrollbar excel-table-wrapper relative">
                      <table className="w-full text-left border-collapse min-w-[1200px] excel-table">
                        <thead className="sticky top-0 z-20">
                          <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700">
                            <th style={{ width: columnWidths['titulo'] }} className="text-[12px] font-semibold text-gray-600 dark:text-slate-400 group transition-colors relative">
                              <div className="resizable-header min-w-[360px]">
                                <span onClick={() => handleSort('titulo')} className="flex items-center gap-2 cursor-pointer hover:text-red-600 transition-colors w-max">
                                  Título e ID
                                  {inventorySort.field === 'titulo' && (inventorySort.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                                </span>
                              </div>
                              <div className="column-resize-handle" onMouseDown={(e) => startResize(e, 'titulo')} />
                            </th>
                            <th style={{ width: columnWidths['artifact_type'] }} className="text-[12px] font-semibold text-gray-600 dark:text-slate-400 group transition-colors relative">
                              <div className="resizable-header min-w-[120px]">
                                <span onClick={() => handleSort('artifact_type')} className="cursor-pointer hover:text-red-600 transition-colors">Tipo</span>
                              </div>
                              <div className="column-resize-handle" onMouseDown={(e) => startResize(e, 'artifact_type')} />
                            </th>
                            <th style={{ width: columnWidths['measurement_class'] }} className="text-[12px] font-semibold text-gray-600 dark:text-slate-400 group transition-colors relative">
                              <div className="resizable-header min-w-[130px]">
                                <span onClick={() => handleSort('measurement_class')} className="cursor-pointer hover:text-red-600 transition-colors">Mensuração</span>
                              </div>
                              <div className="column-resize-handle" onMouseDown={(e) => startResize(e, 'measurement_class')} />
                            </th>
                            <th style={{ width: columnWidths['produto'] }} className="text-[12px] font-semibold text-gray-600 dark:text-slate-400 group transition-colors relative">
                              <div className="resizable-header">
                                <span onClick={() => handleSort('produto')} className="cursor-pointer hover:text-red-600 transition-colors">Produto</span>
                              </div>
                              <div className="column-resize-handle" onMouseDown={(e) => startResize(e, 'produto')} />
                            </th>
                            <th style={{ width: columnWidths['subproduto'] }} className="text-[12px] font-semibold text-gray-600 dark:text-slate-400 group transition-colors relative">
                              <div className="resizable-header">
                                <span onClick={() => handleSort('subproduto')} className="cursor-pointer hover:text-red-600 transition-colors">Subproduto</span>
                              </div>
                              <div className="column-resize-handle" onMouseDown={(e) => startResize(e, 'subproduto')} />
                            </th>
                            <th style={{ width: columnWidths['responsavel'] }} className="text-[12px] font-semibold text-gray-600 dark:text-slate-400 group transition-colors relative">
                              <div className="resizable-header">
                                <span onClick={() => handleSort('responsavel')} className="cursor-pointer hover:text-red-600 transition-colors">Responsável</span>
                              </div>
                              <div className="column-resize-handle" onMouseDown={(e) => startResize(e, 'responsavel')} />
                            </th>
                            <th style={{ width: columnWidths['ultima_atualizacao'] }} className="text-[12px] font-semibold text-gray-600 dark:text-slate-400 group transition-colors relative">
                              <div className="resizable-header">
                                <span onClick={() => handleSort('ultima_atualizacao')} className="cursor-pointer hover:text-red-600 transition-colors">Atualizado em</span>
                              </div>
                              <div className="column-resize-handle" onMouseDown={(e) => startResize(e, 'ultima_atualizacao')} />
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                          {filteredInventory.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-32 text-center">
                                <div className="flex flex-col items-center gap-6">
                                  <div className="w-20 h-20 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-gray-200">
                                    <Search className="w-10 h-10" />
                                  </div>
                                  <div>
                                    <h4 className="text-xl font-bold text-gray-900 dark:text-slate-50 mb-2">Nenhum artefato encontrado</h4>
                                    <p className="text-gray-400 dark:text-slate-500 text-sm mb-8">Refine seus filtros ou realize uma nova busca global.</p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            filteredInventory.map((item) => {
                              const isDoc = isDocumentation(item);
                              const isMapItem = isMap(item);
                              const artifactLabel = getArtifactTypeLabel(item.artifact_type);

                              let classLabel = '—';
                              let classStyle = 'text-gray-400 dark:text-slate-500';

                              if (isMapItem) {
                                const mc = resolveMeasurementClass(item);
                                classLabel = getMeasurementLabel(mc);
                                if (mc === 'GA4') {
                                  classStyle = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
                                } else if (mc === 'GA3') {
                                  classStyle = 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300';
                                } else if (mc === 'HIBRIDO') {
                                  classStyle = 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300';
                                } else {
                                  classStyle = 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300';
                                }
                              }

                              return (
                                <tr 
                                  key={item.id} 
                                  id={`row-${item.id}`} 
                                  onClick={() => setDetailModalItem(item)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setDetailModalItem(item);
                                    }
                                  }}
                                  tabIndex={0}
                                  role="button"
                                  className="group transition-all hover:bg-gray-50/80 dark:hover:bg-slate-800/60 cursor-pointer focus:outline-none focus:bg-red-50/20 dark:focus:bg-slate-800"
                                >
                                  <td className="px-4 py-3">
                                    <div className="flex flex-col items-start w-full overflow-hidden">
                                      <span className="block text-[13.5px] font-semibold text-omni-ink dark:text-slate-50 leading-snug truncate group-hover:text-omni-bordo transition-colors">
                                        {highlightText(item.titulo, tableFilter)}
                                      </span>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="block text-[11.5px] text-gray-500 dark:text-slate-500 truncate tabular-nums">
                                          {item.id}
                                        </span>
                                        {item.link && (
                                          <a 
                                            href={item.link} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="text-gray-400 hover:text-red-600 transition-colors p-0.5 rounded"
                                            title="Abrir no Confluence"
                                          >
                                            <ExternalLink className="w-3 h-3" />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                                      isDoc 
                                        ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' 
                                        : isNode(item)
                                          ? 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400'
                                          : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                                    }`}>
                                      {artifactLabel}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    {classLabel === '—' ? (
                                      <span className="text-gray-400 dark:text-slate-500 text-xs font-semibold">—</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold ${classStyle}`}>
                                        {classLabel}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-[13px] text-omni-ink dark:text-slate-300">
                                    <div className="block truncate w-full">{highlightText(item.produto || "-", tableFilter)}</div>
                                  </td>
                                  <td className="px-4 py-3 text-[13px] text-gray-600 dark:text-slate-400">
                                    <div className="block truncate w-full">{highlightText(item.subproduto || "-", tableFilter)}</div>
                                  </td>
                                  <td className="px-4 py-3 text-[13px] text-gray-700 dark:text-slate-200">
                                    <div className="block truncate w-full">{highlightText(item.responsavel || "-", tableFilter)}</div>
                                  </td>
                                  <td className="px-4 py-3 text-[12.5px] text-gray-500 dark:text-slate-400 tabular-nums">
                                    {formatDataBR(item.ultima_atualizacao)}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                ) : !currentInventoryInsights ? (
                  <motion.div 
                    key="panel-empty"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-12 text-center text-gray-500 dark:text-slate-400 font-bold mb-8 bg-gray-50 dark:bg-slate-800 rounded-[40px]"
                  >
                    Nenhum insight disponível para o filtro atual.
                  </motion.div>
                ) : (
                  <motion.div 
                    key="panel"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-1 lg:grid-cols-4 gap-8"
                  >
                    {/* Insights Panel Content */}
                    <div className="lg:col-span-1 space-y-6">
                       {/* Health Status */}
                       <div className={`p-8 rounded-[32px] border bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm dark:shadow-none flex flex-col items-center text-center
                         ${currentInventoryInsights.problemas.nivelRisco === 'alto' ? 'border-red-200' : 'border-gray-100 dark:border-slate-700'}
                       `}>
                          <h4 className="text-[9px] font-black text-gray-400 dark:text-slate-500 mb-6">Volume na Categoria</h4>
                          <div className="text-4xl font-black text-gray-900 dark:text-slate-50 mb-2">{currentInventoryInsights.total}</div>
                          <p className="text-[10px] font-black text-gray-400 dark:text-slate-500 mb-6">Artefatos Selecionados</p>
                          <div className={`text-[9px] font-black px-4 py-2 rounded-full text-white w-full
 ${currentInventoryInsights.problemas.nivelRisco === 'alto' ? 'bg-bradesco-gradient shadow-lg dark:shadow-none shadow-red-100' : 'bg-green-600 shadow-lg dark:shadow-none shadow-green-100'}
 `}>
                            Risco {currentInventoryInsights.problemas.nivelRisco}
                          </div>
                       </div>

                       {/* Quick Stats */}
                       <div className="p-8 rounded-[32px] border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm dark:shadow-none space-y-4">
                          {[
                            { l: 'Sem Resp.', v: currentInventoryInsights.problemas.semResponsavel },
                            { l: 'Sem Subp.', v: currentInventoryInsights.problemas.semSubproduto },
                            { l: 'Probs. Tagueamento', v: currentInventoryInsights.problemas.foraPadraoGA4 }
                          ].map((s, i) => (
                            <div key={i} className="flex justify-between items-center text-[10px] font-bold ">
                               <span className="text-gray-400 dark:text-slate-500">{s.l}</span>
                               <span className={s.v > 0 ? 'text-red-600 font-black' : 'text-gray-900 dark:text-slate-50'}>{s.v}</span>
                            </div>
                          ))}
                       </div>
                    </div>

                    <div className="lg:col-span-3 space-y-6">
                       {/* Main Insight Card */}
                       <div className="p-10 rounded-[32px] border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm dark:shadow-none relative overflow-hidden h-full">
                          
                          <div className="relative z-10">
                            <h4 className="text-[9px] font-black text-gray-400 dark:text-slate-500 mb-4">Visão Estrutural: Detalhamento do Grupo</h4>
                            <p className="text-xl font-medium tracking-tight text-gray-800 dark:text-slate-200 leading-tight mb-10 font-sans whitespace-pre-wrap">
                               Análise automática baseada nos {currentInventoryInsights.total} artefatos listados, destacando a distribuição técnica e o volume de atualizações recentes.
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                               <div className="space-y-6">
                                  <div>
                                    <h5 className="text-[9px] font-black text-gray-400 dark:text-slate-500 mb-6">Padrão de Tagueamento</h5>
                                    <div className="space-y-4">
                                       {currentInventoryInsights.distribTipos?.slice(0, 4).map((tipo, i) => (
                                         <div key={i} className="flex justify-between items-center text-[11px] font-bold border-b border-gray-50 dark:border-slate-800 pb-2 last:border-0">
                                            <span className="text-gray-700 dark:text-slate-300 pr-4">{tipo.name}</span>
                                            <span className="text-purple-600 font-black px-2 bg-purple-50 rounded-lg">{tipo.count}</span>
                                         </div>
                                       ))}
                                    </div>
                                  </div>
                                  <div>
                                    <h5 className="text-[9px] font-black text-gray-400 dark:text-slate-500 mb-4">Média de Versões</h5>
                                    <div className="text-3xl font-black text-purple-600">v{currentInventoryInsights.versioning?.averageVersions || "1"}</div>
                                  </div>
                               </div>
                               <div className="bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-3xl p-8">
                                  <h5 className="text-[9px] font-black text-gray-400 dark:text-slate-500 mb-6">Distribuição Operacional (Subprodutos)</h5>
                                  <div className="space-y-4">
                                     {currentInventoryInsights.distribSubproduto?.slice(0, 4).map((item, i) => (
                                       <div key={i} className="space-y-2">
                                          <div className="flex justify-between items-center text-[9px] font-black">
                                             <span className="text-gray-700 dark:text-slate-300 truncate pr-4">{item.name === "-" ? "Sem Subproduto" : item.name}</span>
                                             <span className="text-gray-400 dark:text-slate-500">{item.percent}%</span>
                                          </div>
                                          <div className="h-1 bg-white dark:bg-slate-900 dark:border-slate-800 rounded-full overflow-hidden">
                                             <div className="h-full bg-bradesco-gradient" style={{ width: `${item.percent}%` }} />
                                          </div>
                                       </div>
                                     ))}
                                     {(!currentInventoryInsights.distribSubproduto || currentInventoryInsights.distribSubproduto.length === 0) && (
                                       <p className="text-xs text-gray-400 dark:text-slate-500 font-medium">Sem dados.</p>
                                     )}
                                  </div>
                               </div>
                            </div>
                          </div>
                          
                          <div className="mt-10 pt-10 border-t border-gray-50 dark:border-slate-800 flex gap-4">
                            <button className="px-6 py-2 bg-gray-900 dark:bg-slate-50 transition-all hover:bg-black text-white rounded-xl text-[10px] font-black flex items-center gap-2 shadow-lg dark:shadow-none shadow-gray-200" onClick={() => setShowGraph(true)}>
                               <Network className="w-4 h-4" /> Conexões Map
                            </button>
                            <button className="px-6 py-2 bg-white dark:bg-slate-900 dark:border-slate-800 border border-gray-200 dark:border-slate-600 hover:border-red-200 transition-all text-gray-400 dark:text-slate-500 hover:text-red-600 rounded-xl text-[10px] font-black flex items-center gap-2" onClick={() => setShowExportModal(true)}>
                               <Download className="w-4 h-4" /> Exportar Planilha
                            </button>
                          </div>
                       </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
                </>
              )}
            </motion.section>
          )}
        </section>
        
        </>
        )}
      </div>

      {/* Export Modal */}
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowExportModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-slate-900 dark:border-slate-800 rounded-[40px] p-10 shadow-2xl dark:shadow-none border border-gray-100 dark:border-slate-700 max-w-sm w-full text-center"
            >
              <button 
                onClick={() => setShowExportModal(false)}
                className="absolute top-6 right-6 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:text-slate-300"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="mb-8 flex justify-center">
                <div className="w-16 h-16 rounded-3xl bg-red-50 flex items-center justify-center text-red-600">
                  <Download className="w-8 h-8" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-slate-50 mb-2">Extrair Base</h3>
              <p className="text-gray-500 dark:text-slate-400 text-sm mb-8">Escolha o formato desejado para exportar todos os artefatos do inventário.</p>
              
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => handleExport("csv")}
                  className="flex flex-col items-center gap-3 p-6 rounded-3xl bg-gray-50 dark:bg-slate-800 hover:bg-red-50 border border-gray-100 dark:border-slate-700 hover:border-red-200 transition-all group"
                >
                  <span className="text-xl font-black text-gray-400 dark:text-slate-500 group-hover:text-red-600">CSV</span>
                  <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 group-hover:text-red-500">Planilha</span>
                </button>
                <button 
                  onClick={() => handleExport("json")}
                  className="flex flex-col items-center gap-3 p-6 rounded-3xl bg-gray-50 dark:bg-slate-800 hover:bg-red-50 border border-gray-100 dark:border-slate-700 hover:border-red-200 transition-all group"
                >
                  <span className="text-xl font-black text-gray-400 dark:text-slate-500 group-hover:text-red-600">JSON</span>
                  <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 group-hover:text-red-500">Dados</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Executive Summary Modal */}
      <AnimatePresence>
        {showExecutiveModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowExecutiveModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-slate-900 rounded-[40px] p-10 shadow-2xl border border-gray-100 dark:border-slate-700 max-w-md w-full text-center"
            >
              <button 
                onClick={() => setShowExecutiveModal(false)}
                className="absolute top-6 right-6 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:text-slate-300"
              >
                <X className="w-6 h-6" />
              </button>
              
              <div className="mb-6 flex justify-center">
                <div className="w-16 h-16 rounded-3xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center text-purple-600">
                  <Sparkles className="w-8 h-8" />
                </div>
              </div>
              
              <h3 className="text-2xl font-bold text-gray-900 dark:text-slate-50 mb-4">Gerar Resumo Executivo</h3>
              
              <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 text-sm p-4 rounded-2xl text-left mb-8 border border-yellow-100 dark:border-yellow-800">
                <p className="font-bold flex items-center gap-2 mb-1">
                  <AlertCircle className="w-4 h-4" /> Importante
                </p>
                Este resumo é gerado por IA com base nos metadados e títulos dos artefatos filtrados. A qualidade depende da padronização do Confluence.
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={() => setShowExecutiveModal(false)}
                  className="flex-1 py-4 px-6 rounded-full font-bold text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-600 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleGenerateExecutiveSummary}
                  disabled={isGeneratingSummary}
                  className="flex-1 py-4 px-6 rounded-full font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingSummary ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Gerar resumo
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Detalhes Canônico de Telas e Snippets */}
      <MapDetailModal 
        item={detailModalItem} 
        initialTab={detailTarget ? 'telas' : undefined}
        initialScreenId={detailTarget?.screenId}
        initialSnippetIndex={detailTarget?.snippetIndex}
        onViewInTree={handleViewInTree}
        onClose={() => {
          setDetailModalItem(null);
          setDetailTarget(null);
        }} 
      />

      </div>
      </Suspense>
    </AppShell>
  );
}
