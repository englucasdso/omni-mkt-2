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
import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate, useLocation } from "react-router-dom";
import { ROUTES, viewFromPath, legacyRedirect, type AppView } from "./routes";
import { HealthSidebarFilters } from "../components/HealthSidebarFilters";
import { DEFAULT_HEALTH_THRESHOLDS } from "../domain/health/documentationHealth";
import { ErrorBoundary } from "../resilience/ErrorBoundary";
import { lazyView, preloadLazyViews } from "../utils/lazyView";
import { X, AlertTriangle, CheckCircle2, Shield, Trash2, Plus, Loader2, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, Download, MessageCircleQuestion } from "lucide-react";
import { JourneysSidebarFilters, JourneyMapPicker } from "../components/JourneysSidebarFilters";
import { fetchStandards } from "../services/api";
import { analyzeAdherence } from "../domain/padroes/adherence";
import type { StandardDoc } from "../domain/padroes/types";
import { fetchInventory, searchContent, fetchUsers, createUser, updateUser, deleteUser, safeFetch, describeError } from "../services/api";
import { guarded } from "../resilience/circuitBreaker";
import { Artifact, SearchResponse, User as UserType, UserRole, UserStatus, ActiveSearch, ParameterArtifactGroupSummary, ContentMatchSummary, QuestionMatchSummary } from "../types";
import { normalizar, formatDataBR } from "../utils/helpers";
import { 
  buildArtifactSearchableText, 
  normalizeSearchText, 
  getQueryTokens, 
  matchesAllTokens, 
  sortWithSearchPriority, 
  useDebouncedSearch 
} from "../utils/contextualSearch";
import { ContextualEmptyState } from "../components/ContextualEmptyState";
import { AppShell } from "../components/AppShell";
import { PageHeader } from "../components/PageHeader";
import { SidebarContextualArea } from "../components/SidebarContextualArea";
import { CardFilters, EMPTY_CARD_FILTERS, countCardFilters, matchesCardFilters, buildCardFilterOptions } from "../domain/filters/cardFilters";
import { SearchCenter } from "../components/search/SearchCenter";
import { ArtifactResultCard } from "../components/search/ArtifactResultCard";
import { isMap, isRoot, isCataloged, getArtifactTypeLabel, ARTIFACT_TYPE_CONFIGS } from "../domain/artifacts";
import { resolveMeasurementClass, getMeasurementLabel, MEASUREMENT_CONFIGS, ORDERED_MEASUREMENT_CLASSES } from "../domain/measurement";

// Telas carregadas sob demanda (o pacote inicial fica só com busca e cards)
const ExportDialog = lazyView(() => import("../components/export/ExportDialog").then((m) => m.ExportDialog));
const DocumentationHealthView = lazyView(() => import("../components/DocumentationHealthView").then((m) => m.DocumentationHealthView));
const StandardsBaseView = lazyView(() => import("../components/StandardsBaseView").then((m) => m.StandardsBaseView));
const TaggingGuideView = lazyView(() => import("../components/TaggingGuideView").then((m) => m.TaggingGuideView));
const ConexoesCanvas = lazyView(() => import("../components/ConexoesCanvas").then((m) => m.ConexoesCanvas));
const JourneysCanvas = lazyView(() => import("../components/JourneysCanvas").then((m) => m.JourneysCanvas));
const MapDetailModal = lazyView(() => import("../components/MapDetailModal").then((m) => m.MapDetailModal));
const ProductAnalysisView = lazyView(() => import("../components/ProductAnalysisView").then((m) => m.ProductAnalysisView));
const ParameterAnalysisView = lazyView(() => import("../components/ParameterAnalysisView").then((m) => m.ParameterAnalysisView));
const CanonicalInsightsDashboard = lazyView(() => import("../components/CanonicalInsightsDashboard").then((m) => m.CanonicalInsightsDashboard));

const GraphView = ({ 
  data, 
  isEmbedded = false, 
  targetArtifactId,
  targetRequestKey,
  onClearTargetArtifactId,
  onClose, 
  onOpenMap 
}: { 
  data: Artifact[], 
  isEmbedded?: boolean, 
  targetArtifactId?: string | null,
  targetRequestKey?: number,
  onClearTargetArtifactId?: () => void,
  onClose?: () => void, 
  onOpenMap?: (item: Artifact) => void 
}) => {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(targetArtifactId || null);

  useEffect(() => {
    if (targetArtifactId) {
      setSelectedItemId(targetArtifactId);
    }
  }, [targetArtifactId]);

  const handleSelectItem = useCallback((id: string | null) => {
    setSelectedItemId(id);
  }, []);

  const handleOpenItem = useCallback((item: Artifact) => {
    if (item && isCataloged(item)) {
      onOpenMap?.(item);
    }
  }, [onOpenMap]);

  const content = (
    <div className="flex-1 rounded-[40px] overflow-hidden border border-gray-100 dark:border-slate-700/50 shadow-sm relative w-full h-[calc(100vh-250px)] min-h-[600px] flex">
      <ConexoesCanvas 
        data={data} 
        selectedItemId={selectedItemId} 
        targetArtifactId={targetArtifactId}
        targetRequestKey={targetRequestKey}
        onClearTargetArtifactId={onClearTargetArtifactId}
        onSelectItem={handleSelectItem} 
        onOpenItem={handleOpenItem}
      />
    </div>
  );

  if (isEmbedded) {
    return <div className="flex flex-col h-[800px] min-h-[800px]">{content}</div>;
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] bg-white dark:bg-slate-900 dark:border-slate-800 backdrop-blur-3xl p-12 flex flex-col"
    >
      <div className="flex justify-between items-center mb-12 px-4 max-w-7xl mx-auto w-full">
         <div className="flex items-center gap-4">
            <h1 className="brand-text text-2xl font-black tracking-tight text-gray-900 dark:text-slate-50 transition-colors">
              Hub de Artefatos
            </h1>
         </div>
         <button onClick={() => { if (onClose) onClose(); }} className="p-4 hover:bg-gray-100 dark:bg-slate-700 rounded-full transition-all hover:rotate-90">
            <X className="w-6 h-6 text-gray-400 dark:text-slate-500" />
         </button>
      </div>
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col">
        {content}
      </div>
    </motion.div>
  );
};

const AdminUsers = ({ users, onAddUser, onUpdateUser, onDeleteUser, onClose }: { 
  users: UserType[], 
  onAddUser: (u: Omit<UserType, 'id' | 'createdAt'>) => void,
  onUpdateUser: (u: UserType) => void,
  onDeleteUser: (id: string) => void,
  onClose: () => void 
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [formData, setFormData] = useState({ name: '', nickname: '', email: '', role: 'gestor360' as UserRole, status: 'ativo' as UserStatus });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate corporate email if needed, but not strictly asked, just "if applicable". Simple check could be `@bradesco.com.br` but we can leave without it or add a quick logic
    if (editingUser) {
      onUpdateUser({ ...editingUser, ...formData });
      setEditingUser(null);
    } else {
      onAddUser(formData);
      setShowAddForm(false);
    }
    setFormData({ name: '', nickname: '', email: '', role: 'gestor360', status: 'ativo' });
  };

  const startEdit = (user: UserType) => {
    setEditingUser(user);
    setFormData({ name: user.name, nickname: user.nickname || '', email: user.email, role: user.role, status: user.status || 'ativo' });
    setShowAddForm(true);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-white dark:bg-slate-900 dark:border-slate-800 backdrop-blur-xl p-8 flex flex-col"
    >
      <div className="max-w-5xl mx-auto w-full">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-medium tracking-tight text-gray-900 dark:text-slate-50">Gestão de Usuários</h2>
            <p className="text-gray-500 dark:text-slate-400">Controle de acesso e permissões da plataforma</p>
          </div>
          <div className="flex items-center gap-4">
             {!showAddForm && (
                <button 
                  onClick={() => { setShowAddForm(true); setEditingUser(null); setFormData({ name: '', nickname: '', email: '', role: 'gestor360', status: 'ativo' }); }}
                  className="flex items-center gap-2 px-6 py-3 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:opacity-90 transition-all shadow-xl dark:shadow-none shadow-red-200"
                   style={{ background: 'linear-gradient(90deg, #7D046D 0%, #cc092f 100%)' }}
                >
                  <Plus className="w-4 h-4" /> Novo Usuário
                </button>
             )}
            <button onClick={onClose} className="p-4 hover:bg-gray-100 dark:bg-slate-700 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {showAddForm ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-10 rounded-[40px] max-w-lg mx-auto">
            <h3 className="text-xl font-bold text-gray-900 dark:text-slate-50 mb-6">{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</h3>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-4">Nome Completo</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-6 py-4 bg-gray-50 dark:bg-slate-800 border border-transparent rounded-2xl focus:bg-white dark:bg-slate-900 dark:border-slate-800 focus:border-bradesco-red transition-all font-medium text-gray-800 dark:text-slate-200"
                  placeholder="Nome do colaborador"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-4">Apelido (Opcional)</label>
                <input 
                  type="text" 
                  value={formData.nickname}
                  onChange={e => setFormData({ ...formData, nickname: e.target.value })}
                  className="w-full px-6 py-4 bg-gray-50 dark:bg-slate-800 border border-transparent rounded-2xl focus:bg-white dark:bg-slate-900 dark:border-slate-800 focus:border-bradesco-red transition-all font-medium text-gray-800 dark:text-slate-200"
                  placeholder="Apelido/Nome de exibição"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-4">E-mail Corporativo</label>
                <input 
                  required
                  type="email" 
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-6 py-4 bg-gray-50 dark:bg-slate-800 border border-transparent rounded-2xl focus:bg-white dark:bg-slate-900 dark:border-slate-800 focus:border-bradesco-red transition-all font-medium text-gray-800 dark:text-slate-200"
                  placeholder="email@bradesco.com.br"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-4">Perfil de Acesso</label>
                <select 
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-6 py-4 bg-gray-50 dark:bg-slate-800 border border-transparent rounded-2xl focus:bg-white dark:bg-slate-900 dark:border-slate-800 focus:border-bradesco-red transition-all font-medium text-gray-800 dark:text-slate-200 appearance-none"
                >
                  <option value="gestor360">GESTOR 360 (Acesso Completo)</option>
                  <option value="estrategico">ESTRATÉGICO (Visão Estratégica)</option>
                  <option value="artefatos">ARTEFATOS (Hub de Artefatos)</option>
                  <option value="eventos">EVENTOS (Hub de Eventos)</option>
                  <option value="admin">ADMIN (Gestão Total)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-4">Status</label>
                <select 
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value as UserStatus })}
                  className="w-full px-6 py-4 bg-gray-50 dark:bg-slate-800 border border-transparent rounded-2xl focus:bg-white dark:bg-slate-900 dark:border-slate-800 focus:border-bradesco-red transition-all font-medium text-gray-800 dark:text-slate-200 appearance-none"
                >
                  <option value="ativo">ATIVO</option>
                  <option value="inativo">INATIVO</option>
                </select>
              </div>
              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 px-8 py-4 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-gray-200 dark:bg-slate-600 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-8 py-4 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:opacity-90 transition-all shadow-xl dark:shadow-none shadow-red-200"
                  style={{ background: 'linear-gradient(90deg, #7D046D 0%, #cc092f 100%)' }}
                >
                  {editingUser ? 'Salvar' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          <div className="glass-card overflow-hidden rounded-[40px] border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 dark:border-slate-800">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700">
                  <th className="p-6 text-[10px] font-black text-gray-400 dark:text-slate-500 tracking-widest">NOME / APELIDO</th>
                  <th className="p-6 text-[10px] font-black text-gray-400 dark:text-slate-500 tracking-widest">E-MAIL</th>
                  <th className="p-6 text-[10px] font-black text-gray-400 dark:text-slate-500 tracking-widest">PERFIL</th>
                  <th className="p-6 text-[10px] font-black text-gray-400 dark:text-slate-500 tracking-widest">STATUS</th>
                  <th className="p-6 text-[10px] font-black text-gray-400 dark:text-slate-500 tracking-widest text-right">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 dark:bg-slate-800/50 transition-colors">
                    <td className="p-6">
                      <p className="text-sm font-bold text-gray-900 dark:text-slate-50">{u.name}</p>
                      {u.nickname && <p className="text-xs text-gray-400 dark:text-slate-500 font-medium">({u.nickname})</p>}
                    </td>
                    <td className="p-6 text-sm text-gray-500 dark:text-slate-400">{u.email}</td>
                    <td className="p-6">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${u.role === 'admin' ? 'bg-purple-50 text-purple-600 border border-purple-100' : 'bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border border-gray-100 dark:border-slate-700'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="p-6">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${u.status === 'ativo' || u.status === 'active' ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                        {u.status === 'ativo' || u.status === 'active' ? 'ATIVO' : 'INATIVO'}
                      </span>
                    </td>
                    <td className="p-6 text-right space-x-2">
                       <button onClick={() => startEdit(u)} className="p-2 text-gray-400 dark:text-slate-500 hover:text-bradesco-red transition-colors">Editar</button>
                       {users.length > 1 && (
                         <button onClick={() => onDeleteUser(u.id)} className="p-2 text-gray-400 dark:text-slate-500 hover:text-bradesco-red transition-colors"><Trash2 className="w-4 h-4" /></button>
                       )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const SyncWidget = ({ job, onCancel }: { job: any, onCancel: () => void }) => {
  if (!job.active) return null;

  const hasTotal = typeof job.total === "number" && job.total > 0;
  const isSuccess = job.status === "success";
  const isError = job.status === "error";
  const isRunning = job.status === "running";
  const isDeterminate = isSuccess || (isRunning && hasTotal);
  const displayPercentage = isSuccess ? 100 : (hasTotal ? Math.max(0, Math.min(99, Number(job.percentage) || 0)) : null);
  const currentMessage = job.message || "Validando sessão do Confluence...";

  const cleanErrorMsg = isError
    ? String(job.errorMsg || "Não foi possível concluir a sincronização.").split("\n")[0].trim()
    : "";

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50, scale: 0.9 }} 
      animate={{ opacity: 1, y: 0, scale: 1 }} 
      exit={{ opacity: 0, y: 50, scale: 0.9 }}
      className="fixed bottom-6 right-6 z-[100] bg-white dark:bg-slate-900 dark:border-slate-800 rounded-2xl shadow-2xl dark:shadow-none border border-gray-100 dark:border-slate-700 p-4 w-80 flex flex-col gap-3 overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gray-100 dark:bg-slate-700 overflow-hidden">
        {isDeterminate ? (
          <div 
            className={`h-full transition-all duration-300 ease-out ${isError ? 'bg-red-500' : isSuccess ? 'bg-green-500' : 'bg-bradesco-red'}`} 
            style={{ width: `${displayPercentage ?? 0}%` }}
          />
        ) : isError ? (
          <div className="h-full w-full bg-red-500" />
        ) : (
          <div className="h-full w-2/5 bg-bradesco-red animate-pulse rounded-full" />
        )}
      </div>
      
      <div className="flex items-start justify-between mt-1">
        <div className="flex items-center gap-3 w-full">
          <div className="w-10 h-10 rounded-full bg-gray-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
             {isRunning && <Loader2 className="w-5 h-5 text-bradesco-red animate-spin" />}
             {isSuccess && <CheckCircle2 className="w-5 h-5 text-green-500" />}
             {isError && <AlertTriangle className="w-5 h-5 text-red-500" />}
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-gray-900 dark:text-slate-50 text-sm truncate">
                {isRunning ? "Sincronizando..." : isSuccess ? "Sincronização concluída" : "Falha na Sincronização"}
              </span>
              {displayPercentage !== null && !isError && (
                <span className="text-xs font-bold text-gray-700 dark:text-slate-200 tabular-nums shrink-0">
                  {displayPercentage}%
                </span>
              )}
            </div>

            {isRunning && hasTotal && (
              <span className="text-[11px] text-gray-700 dark:text-slate-300 font-semibold leading-tight mt-0.5 tabular-nums">
                {job.processed} de {job.total} páginas
              </span>
            )}

            {isSuccess && hasTotal && (
              <span className="text-[11px] text-gray-700 dark:text-slate-300 font-semibold leading-tight mt-0.5 tabular-nums">
                {job.total} páginas processadas
              </span>
            )}

            <span className="text-[10px] text-gray-500 dark:text-slate-400 font-medium leading-tight mt-0.5">
              {isError
                ? "Não foi possível concluir"
                : isSuccess
                  ? ((job.failed > 0 || job.reused > 0)
                      ? `${job.succeeded} lidas · ${job.reused} reutilizadas · ${job.failed} com falha`
                      : currentMessage)
                  : currentMessage}
            </span>
          </div>
        </div>
      </div>
      
      {isError && (
        <div className="text-[10px] text-red-600 font-medium bg-red-50 p-2 rounded-lg mt-1">
          {cleanErrorMsg}
        </div>
      )}
      
      {isRunning && (
        <button 
          onClick={onCancel}
          className="text-[10px] font-bold text-gray-400 dark:text-slate-500 hover:text-red-500 transition-colors w-full text-left flex items-center gap-1.5 px-1 py-1 mt-1 uppercase tracking-wider"
        >
          <X className="w-3 h-3" /> Cancelar processo
        </button>
      )}
    </motion.div>
  );
};


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
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const [rawAppState, setRawAppState] = useState<AppView | "empty">("initial");
  const appState = rawAppState;

  const [detailModalItem, setDetailModalItem] = useState<Artifact | null>(null);
  const [detailTarget, setDetailTarget] = useState<{ screenId?: string; snippetIndex?: number } | null>(null);
  // Mapa aberto pela Saúde da documentação: só aí mostra o que está fora do padrão
  const [detailFromHealth, setDetailFromHealth] = useState(false);
  const [conexoesTargetArtifactId, setConexoesTargetArtifactId] = useState<string | null>(null);
  // Conta os pedidos de "Acessar na árvore": pedir de novo o mesmo mapa também recentraliza
  const [conexoesTargetRequest, setConexoesTargetRequest] = useState(0);

  const handleViewInTree = useCallback((artifactId: string) => {
    setDetailModalItem(null);
    setDetailTarget(null);
    setDetailFromHealth(false);
    setConexoesTargetArtifactId(artifactId);
    setConexoesTargetRequest((n) => n + 1);
    navigate(`${ROUTES.graph}?artifactId=${encodeURIComponent(artifactId)}`);
  }, [navigate]);

  const handleOpenMapDetail = useCallback((art: Artifact) => {
    setDetailModalItem(art);
  }, []);

  const handleClearConexoesTarget = useCallback(() => {
    setConexoesTargetArtifactId(null);
    navigate(ROUTES.graph, { replace: true });
  }, [navigate]);

  const setAppState = (newState: typeof rawAppState, updateUrl = true) => {
    setRawAppState(newState);
    if (!updateUrl) return;
    
    navigate(newState === 'empty' ? ROUTES.initial : ROUTES[newState]);
  };



  // Sync state from URL
  useEffect(() => {
    const p = location.pathname;
    const searchParams = new URLSearchParams(location.search);
    const targetArtId = searchParams.get('artifactId');

    // Endereços antigos (/hub-de-artefatos/...) redirecionam para os novos, mantendo ?artifactId
    const legacy = legacyRedirect(p);
    if (legacy) {
      navigate(`${legacy}${location.search}`, { replace: true });
      return;
    }

    const view = viewFromPath(p);
    if (view === 'graph') {
      setConexoesTargetArtifactId(targetArtId || null);
    } else {
      setConexoesTargetArtifactId(null);
    }

    if (p === '/home/gestao-de-usuarios') {
      setRawAppState('initial');
      setShowAdmin(true);
    } else if (view) {
      setRawAppState(view);
      if (view === 'initial') setShowAdmin(false);
    } else {
      // Endereço desconhecido: volta para a busca
      navigate(ROUTES.initial, { replace: true });
    }
  }, [location.pathname, location.search]);

  const [journeyProduct, setJourneyProduct] = useState("");
  const [journeySubproduct, setJourneySubproduct] = useState("");
  const [journeyMapId, setJourneyMapId] = useState("");
  const [journeyShowCode, setJourneyShowCode] = useState(false);
  // Saúde da documentação: limites de tempo e produto (botão Filtros)
  const [healthStaleDays, setHealthStaleDays] = useState(DEFAULT_HEALTH_THRESHOLDS.staleDays);
  const [healthWasteDays, setHealthWasteDays] = useState(DEFAULT_HEALTH_THRESHOLDS.wasteDays);
  const [healthProduct, setHealthProduct] = useState("");
  // Base de padrões: documentos cadastrados (para os pontos roxos "para conferir")
  const [standardsDocs, setStandardsDocs] = useState<StandardDoc[]>([]);
  useEffect(() => {
    fetchStandards().then(setStandardsDocs).catch(() => setStandardsDocs([]));
  }, []);
  // Depois da primeira tela, baixa as outras abas em segundo plano
  useEffect(() => {
    preloadLazyViews();
  }, []);
  // Busca do Guia de tagueamento (no cabeçalho)
  const [guideQuery, setGuideQuery] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [lastSync, setLastSync] = useState<string | null>(localStorage.getItem('last_sync'));
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSource, setExportSource] = useState<'cards' | 'inventario'>('cards');


  const [fullInventory, setFullInventory] = useState<Artifact[]>([]);
  // Pontos para conferir com a Base de padrões, calculados uma vez para todas as telas
  const adherenceByMap = useMemo(
    () => analyzeAdherence(fullInventory.length > 0 ? fullInventory : results, standardsDocs),
    [fullInventory, results, standardsDocs]
  );
  // Falha ao falar com o servidor: a tela continua com os últimos dados e mostra um aviso
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryingData, setRetryingData] = useState(false);

  useEffect(() => {
    if ((appState === "journeys" || appState === "initial") && fullInventory.length === 0 && !dataError) {
      setLoading(true);
      fetchInventory()
        .then((res) => {
          setFullInventory(res.resultados);
          setDataError(null);
          if (results.length === 0) {
            setResults(res.resultados);
          }
        })
        .catch((e) => {
          console.error(e);
          setDataError(describeError(e));
        })
        .finally(() => setLoading(false));
    }
  }, [appState, fullInventory.length, results.length, dataError]);

  // Estado centralizado da busca ativa (ActiveSearch)
  const [activeSearch, setActiveSearch] = useState<ActiveSearch | null>(null);
  const [searchSessionId, setSearchSessionId] = useState(0);

  useEffect(() => {
    const mainCatalogStates = ["inventory_table", "results", "produtos_analise", "parametros_analise", "insights", "graph", "saude", "padroes", "guia"];
    // Uma busca que voltou vazia é um resultado legítimo: não recarregar a base inteira por cima dela
    if (mainCatalogStates.includes(appState) && results.length === 0 && !loading && !dataError && !isSearchingRef.current && !activeSearch && (query === "" || query === "inventario")) {
      executeSearch("inventario");
    }
  }, [appState, results.length, loading, activeSearch, dataError]);

  // Callback de transporte de resultados para a tela de Cards
  const handleApplyToCards = useCallback((
    searchQuery: string,
    filteredIds: string[],
    meta?: {
      mode: 'conteudo' | 'parametros' | 'pergunta';
      parameterCriteria?: any[];
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
      questionText: meta?.questionText,
      scope: meta?.scope,
      operator: meta?.operator,
      parameterGroups: meta?.parameterGroups,
      contentMatches: meta?.contentMatches,
      matchedTerms: meta?.matchedTerms,
      queryKind: meta?.queryKind,
      questionMessage: meta?.questionMessage,
      questionMatches: meta?.questionMatches,
    };
    setActiveSearch(newActiveSearch);

    // 8. Definir ordenação por Relevância para buscas ativas (preservando a ordem do buscador)
    setCardSort(isFullBase ? "recentes" : "relevancia");

    // 9. Resetar a paginação e limpar cardSearch para não conflitar
    setCardSearch("");
    setCardPage(1);

    // 10. Navegar para /cards
    setAppState("results");
  }, [fullInventory]);

  // Insights → abre um conjunto de artefatos nos Cards ou no Inventário
  const handleInsightDrillDown = useCallback((label: string, ids: string[], target: 'cards' | 'inventario') => {
    if (ids.length === 0) return;
    if (target === 'cards') {
      handleApplyToCards(label, ids, { mode: 'conteudo', queryKind: 'insight' });
      return;
    }
    setTableFilter("");
    setInventorySelection({ label, ids: new Set(ids) });
    setResults(fullInventory);
    setActiveSearch(null);
    setAppState("inventory_table");
  }, [handleApplyToCards, fullInventory]);

  // Estados e controle exclusivos da tela de Cards
  const [cardSearch, setCardSearch] = useState("");
  const [cardSort, setCardSort] = useState<"relevancia" | "recentes" | "antigos" | "az" | "za">("recentes");
  // Filtros dos Cards: listas de seleção múltipla, no mesmo formato do Inventário
  const [cardFilters, setCardFilters] = useState<CardFilters>(EMPTY_CARD_FILTERS);
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

  // Opções dos filtros (com contagem) calculadas sobre o que os Cards exibem
  const cardFilterOptions = useMemo(() => buildCardFilterOptions(cardSource.filter(i => !isRoot(i))), [cardSource]);

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

    // 1. Filtros (tipo, produto, responsável, ano e qualidade do mapa)
    if (countCardFilters(cardFilters) > 0) {
      list = list.filter(({ artifact: i }) => matchesCardFilters(i, cardFilters));
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
  }, [indexedCards, debouncedCardSearch, cardSort, cardFilters]);

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
      countCardFilters(cardFilters) > 0
    );
  }, [cardSearch, cardSort, activeSearch, cardFilters]);

  const hasActiveCardFilters = countCardFilters(cardFilters) > 0;

  const clearOnlyCardFilters = () => {
    setCardFilters(EMPTY_CARD_FILTERS);
    setCardPage(1);
  };

  const resetCardFilters = () => {
    setCardSearch("");
    setCardSort(activeSearch !== null ? "relevancia" : "recentes");
    setCardFilters(EMPTY_CARD_FILTERS);
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





  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  
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
        const statusRes = await guarded("api:sync-status", () => safeFetch("/api/sync-status"));
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
      const res = await safeFetch("/api/update-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootId: "1542391004", maxRows: null, mode: "full", forceRefresh: true })
      });
      
      const data = await res.json().catch(() => ({}));
      stopSyncPolling();
      
      if (!res.ok) {
        throw new Error(data.error || `O servidor respondeu com erro ${res.status} na sincronização.`);
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
          setDataError(null);
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
      await createUser(userData);
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
    const previousResults = results;
    setLoading(true);
    setAppState("results");
    setResults([]);

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
      setDataError(null);
      if (isInventory) {
        setFullInventory(data.resultados);
      }

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
      // Mantém o que já estava carregado e avisa, em vez de voltar para uma tela vazia
      setResults(previousResults.length > 0 ? previousResults : fullInventory);
      setDataError(describeError(error));
    } finally {
      setLoading(false);
      isSearchingRef.current = false;
    }
  };

  const debouncedTableFilter = useDebouncedSearch(tableFilter, 150);

  // Seleção vinda do Insights (ex.: "Mapas com telas em Correção") aplicada no Inventário
  const [inventorySelection, setInventorySelection] = useState<{ label: string; ids: Set<string> } | null>(null);

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

    if (inventorySelection) {
      list = list.filter(({ artifact: i }) => inventorySelection.ids.has(String(i.id)));
    }

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
  }, [inventorySelection, indexedInventory, debouncedTableFilter, inventoryFilters, inventorySort, onlyDivergent, onlyWithoutResponsible, onlyWithoutSubproduct]);

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
    setInventorySelection(null);
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
        ...(['MAPA', 'DOCUMENTACAO', 'NO', 'NAO_CLASSIFICADO'] as const).map((t) => ({
          v: t, l: ARTIFACT_TYPE_CONFIGS[t].pluralLabel
        }))
      ],
      classificacao: [
        { v: 'all', l: 'Todos' },
        ...ORDERED_MEASUREMENT_CLASSES.map((m) => ({
          v: m, l: MEASUREMENT_CONFIGS[m].label
        }))
      ],
      produtos: [
        { v: 'all', l: 'Todos' },
        ...Array.from(prodCounts.keys()).sort().map((p) => ({ v: p, l: p }))
      ],
      subprodutos: [
        { v: 'all', l: 'Todos' },
        ...Array.from(subCounts.keys()).sort().map((s) => ({ v: s, l: s }))
      ],
      parametros: [
        { v: 'all', l: 'Todos' },
        ...topParams.map(([p]) => ({ v: p, l: p }))
      ],
      anos: [
        { v: 'all', l: 'Todos' },
        ...Array.from(yearCounts.keys()).sort((a, b) => b.localeCompare(a)).map((y) => ({ v: y, l: y }))
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
    setCardFilters(EMPTY_CARD_FILTERS);
    setCardPage(1);

    // 5. Limpar filtros e estados contextuais das demais telas (Inventário, Produtos, Parâmetros, Insights)
    resetInventoryFilters();
    resetProductFilters();
    resetParamFilters();
    resetInsightsFilters();

    // 6. Fechar quaisquer modais abertos e limpar alvos de detalhe
    setDetailModalItem(null);
    setDetailTarget(null);
    setDetailFromHealth(false);
    setConexoesTargetArtifactId(null);
    setShowAdmin(false);
    setShowExportModal(false);

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

    // 10. Navegar explicitamente para a busca, sem parâmetros de query na URL
    navigate(ROUTES.initial, { replace: true });
  }, [fullInventory, navigate]);

  const resetSearch = resetSearchSession;

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

  const retryDataLoad = async () => {
    if (retryingData) return;
    setRetryingData(true);
    try {
      const data: SearchResponse = await fetchInventory();
      setFullInventory(data.resultados);
      if (!activeSearch) setResults(data.resultados);
      setDataError(null);
    } catch (error) {
      setDataError(describeError(error));
    } finally {
      setRetryingData(false);
    }
  };

  return (
    <AppShell
      currentRouteId={appState}
      onNavigate={(item) => setAppState(item.id as any)}
      onHomeClick={resetSearchSession}
      onNewSearch={resetSearchSession}
      lastSync={lastSync}
      onSyncClick={() => startBackgroundSync()}
      contextualContent={
        <ErrorBoundary area="os filtros" variant="inline" resetKey={appState}>
        {appState === 'journeys' ? (
          <JourneysSidebarFilters showCode={journeyShowCode} onShowCodeChange={setJourneyShowCode} />
        ) : appState === 'guia' ? (
          <div className="flex items-center gap-2 min-w-0" id="sidebar-contextual-guia">
            <div className="relative w-[260px] shrink-0">
              <Search className="w-3.5 h-3.5 text-omni-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
              <input
                type="text"
                placeholder="Buscar no guia: parâmetro, evento..."
                value={guideQuery}
                onChange={(e) => setGuideQuery(e.target.value)}
                className="w-full pl-8 pr-7 h-8 bg-white border border-omni-line rounded-lg text-xs font-ui text-omni-ink placeholder:text-omni-muted focus:outline-none focus:ring-2 focus:ring-omni-rubi/20 focus:border-omni-rubi transition-all truncate"
              />
              {guideQuery && (
                <button
                  type="button"
                  onClick={() => setGuideQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-omni-muted hover:text-omni-ink p-0.5"
                  title="Limpar busca"
                  aria-label="Limpar busca"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        ) : appState === 'saude' ? (
          <HealthSidebarFilters
            artifacts={fullInventory.length > 0 ? fullInventory : results}
            staleDays={healthStaleDays}
            onStaleDaysChange={setHealthStaleDays}
            wasteDays={healthWasteDays}
            onWasteDaysChange={setHealthWasteDays}
            product={healthProduct}
            onProductChange={setHealthProduct}
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
          cardFilters={cardFilters}
          onCardFiltersChange={(val) => {
            setCardFilters(val);
            setCardPage(1);
          }}
          cardFilterOptions={cardFilterOptions}
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
        )}
        </ErrorBoundary>
      }
    >
      <div className="relative w-full flex-1 flex flex-col min-h-screen">
        {dataError && (
          <div role="status" className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <p className="flex-1 min-w-0">
              <span className="font-semibold">Não foi possível atualizar os dados.</span>{' '}
              {fullInventory.length > 0 || results.length > 0 ? 'Você está vendo a última versão carregada. ' : ''}
              {dataError}
            </p>
            <button
              type="button"
              onClick={retryDataLoad}
              disabled={retryingData}
              className="shrink-0 h-7 px-3 rounded-lg border border-amber-300 bg-white font-semibold text-amber-900 hover:border-omni-bordo/40 hover:text-omni-bordo disabled:opacity-50 cursor-pointer"
            >
              {retryingData ? 'Tentando...' : 'Tentar de novo'}
            </button>
            <button
              type="button"
              onClick={() => setDataError(null)}
              aria-label="Fechar aviso"
              className="shrink-0 p-1 rounded-md text-amber-700 hover:text-omni-bordo cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
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
            onClose={() => navigate(ROUTES.initial)}
          />
        )}
      </AnimatePresence>

      <div className={`flex flex-col flex-1 w-full transition-all relative opacity-100`}>

        {!hasPermission ? (
          <div className="flex flex-col items-center justify-center flex-1 py-32 text-center mt-32">
            <Shield className="w-16 h-16 text-gray-300 dark:text-slate-600 mb-6" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-50 tracking-tight">Você não possui permissão para acessar esta área.</h2>
            <button
               onClick={() => setAppState('initial')}
               className="mt-8 px-6 py-3 bg-white dark:bg-slate-900 dark:border-slate-800 border border-gray-200 dark:border-slate-600 shadow-sm dark:shadow-none hover:border-gray-900 hover:text-gray-900 dark:text-slate-50 rounded-full font-bold transition-all text-xs uppercase tracking-widest text-gray-500 dark:text-slate-400"
            >
               Voltar ao Início
            </button>
          </div>
        ) : (
          <>
        <section className={`hero flex flex-col flex-1 w-full items-center justify-start pt-8 ${appState !== "initial" ? "!hidden" : ""}`}>
          <ErrorBoundary area="a busca" resetKey={searchSessionId}>
          <SearchCenter
            artifacts={fullInventory}
            activeSearch={activeSearch}
            resetSignal={searchSessionId}
            onApplyToCards={handleApplyToCards}
          />
          </ErrorBoundary>
        </section>

        {/* Content Section */}
        <section className={`content ${appState === "initial" ? "!hidden" : ""}`}>
          
          {/* Decision / Loading Area */}
          <section className={`decision ${appState === "empty" ? "flex flex-col items-center justify-center text-center py-24" : "!hidden"}`}>
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
            ) : null}
          </section>

          {/* Governar: telas reservadas (ainda não construídas) */}
          {appState === "padroes" && (
            <ErrorBoundary area="a Base de padrões" resetKey={appState}>
              <StandardsBaseView
                artifacts={fullInventory.length > 0 ? fullInventory : results}
                onDrillDown={handleInsightDrillDown}
                onOpenGuide={() => setAppState("guia")}
                onDocsChange={setStandardsDocs}
              />
            </ErrorBoundary>
          )}
          {appState === "guia" && (
            <ErrorBoundary area="o Guia de tagueamento" resetKey={appState}>
              <TaggingGuideView
                artifacts={fullInventory.length > 0 ? fullInventory : results}
                query={guideQuery}
                onQueryChange={setGuideQuery}
                onOpenStandardsBase={() => setAppState("padroes")}
                onDrillDown={handleInsightDrillDown}
              />
            </ErrorBoundary>
          )}
          {appState === "saude" && (
            <ErrorBoundary area="a Saúde da documentação" resetKey={appState}>
              <DocumentationHealthView
                artifacts={fullInventory.length > 0 ? fullInventory : results}
                staleDays={healthStaleDays}
                wasteDays={healthWasteDays}
                product={healthProduct}
                onOpenMap={(art, target) => {
                  setDetailFromHealth(true);
                  setDetailTarget(target || null);
                  setDetailModalItem(art);
                }}
                onDrillDown={handleInsightDrillDown}
                adherence={adherenceByMap}
                hasStandards={standardsDocs.length > 0}
              />
            </ErrorBoundary>
          )}

          {/* Canonical Insights Dashboard */}
          {appState === "insights" && (
            <motion.section 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="summary pb-20"
            >
              <ErrorBoundary area="os Insights">
              <CanonicalInsightsDashboard 
                artifacts={fullInventory.length > 0 ? fullInventory : results}
                onOpenMap={(art) => setDetailModalItem(art)}
                onDrillDown={handleInsightDrillDown}
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
              </ErrorBoundary>
            </motion.section>
          )}

          {/* Análise por Produto */}
          {appState === "produtos_analise" && (
            <motion.section 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="produtos-container pb-20"
            >
              <ErrorBoundary area="a análise por produto">
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
              </ErrorBoundary>
            </motion.section>
          )}

          {/* Análise por Parâmetro */}
          {appState === "parametros_analise" && (
            <motion.section 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="parametros-container pb-20"
            >
              <ErrorBoundary area="a análise por parâmetro">
              <ParameterAnalysisView 
                artifacts={results}
                onOpenMap={(art) => setDetailModalItem(art)}
                searchTerm={paramSearch}
                onSearchChange={setParamSearch}
              />
              </ErrorBoundary>
            </motion.section>
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
                <ErrorBoundary area="as Conexões">
                <GraphView 
                  data={fullInventory && fullInventory.length > 0 ? fullInventory : results} 
                  isEmbedded={true}
                  targetArtifactId={conexoesTargetArtifactId}
                  targetRequestKey={conexoesTargetRequest}
                  onClearTargetArtifactId={handleClearConexoesTarget}
                  onOpenMap={handleOpenMapDetail}
                />
                </ErrorBoundary>
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
                <ErrorBoundary area="as Jornadas">
                {/* Escolha do mapa, centralizada no topo: Produto → Subproduto → Mapa */}
                <JourneyMapPicker
                  artifacts={fullInventory}
                  selectedProduct={journeyProduct}
                  onSelectProduct={setJourneyProduct}
                  selectedSubproduct={journeySubproduct}
                  onSelectSubproduct={setJourneySubproduct}
                  selectedMapId={journeyMapId}
                  onSelectMapId={setJourneyMapId}
                  isLoading={loading}
                />
                <JourneysCanvas
                  artifacts={fullInventory}
                  selectedMapId={journeyMapId}
                  showCode={journeyShowCode}
                  onOpenScreen={(map, target) => {
                    setDetailModalItem(map);
                    setDetailTarget(target || null);
                  }}
                />
                </ErrorBoundary>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Results Area (Tela de Cards) */}
          <ErrorBoundary area="os Cards" resetKey={appState}>
          <section className={`results space-y-6 ${appState === "results" && !loading ? "" : "!hidden"}`}>
            <PageHeader
              title="Artefatos"
              subtitle={
                activeSearch ? (
                  activeSearch.mode === 'conteudo' && activeSearch.queryKind === 'insight' ? (
                    `Do Insights: ${activeSearch.query} | ${totalCardsCount} ${totalCardsCount === 1 ? 'artefato' : 'artefatos'}`
                  ) : activeSearch.mode === 'conteudo' ? (
                    activeSearch.query ? (
                      `Busca por conteúdo: ${totalCardsCount} ${totalCardsCount === 1 ? 'artefato encontrado' : 'artefatos encontrados'} para "${activeSearch.query}"`
                    ) : (
                      `Inventário completo: ${totalCardsCount} artefatos`
                    )
                  ) : activeSearch.mode === 'parametros' ? (
                    `Busca por parâmetros: ${totalCardsCount} ${totalCardsCount === 1 ? 'artefato encontrado' : 'artefatos encontrados'}${activeSearch.query ? ` para "${activeSearch.query}"` : ''}`
                  ) : (
                    `Pergunta: ${totalCardsCount} ${totalCardsCount === 1 ? 'artefato encontrado' : 'artefatos encontrados'} para "${activeSearch.questionText || activeSearch.query}"`
                  )
                ) : (
                  "Todos os artefatos sincronizados. Use Nova busca para encontrar por nome, parâmetro ou pergunta."
                )
              }
              actions={
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => { setExportSource('cards'); setShowExportModal(true); }}
                    className="btn-neu flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-ui font-semibold text-bradesco-red hover:text-bradesco-red-hover h-10 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-bradesco-red" />
                    Extrair Dados
                  </button>
                </div>
              }
            />

            {/* Fazer uma pergunta: o que foi procurado */}
            {activeSearch?.mode === 'pergunta' && activeSearch.questionMessage && (
              <div className="panel p-4 flex items-start gap-2.5">
                <MessageCircleQuestion className="w-4 h-4 text-omni-bordo shrink-0 mt-0.5" />
                <p className="text-sm text-omni-ink leading-relaxed">{activeSearch.questionMessage}</p>
              </div>
            )}

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
                onClearSearch={() => setCardSearch("")}
                onClearFilters={clearOnlyCardFilters}
                onClearAll={resetCardFilters}
              />
            )}

            {/* 5. Lista de Cards (Coluna única, gap 12px) */}
            <div className="flex flex-col gap-3">
              {paginatedCards.map((item) => (
                <ArtifactResultCard
                  key={item.id}
                  item={item}
                  activeSearch={activeSearch}
                  onOpenDetails={(artifact) => {
                    setDetailTarget(null);
                    setDetailFromHealth(false);
                    setDetailModalItem(artifact);
                  }}
                  onOpenSnippet={(artifact, target) => {
                    setDetailTarget(target);
                    setDetailModalItem(artifact);
                  }}
                  onViewInTree={(id) => handleViewInTree(id)}
                />
              ))}
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
          </ErrorBoundary>

          {/* Inventory Table View (Functional Explorer Interface) */}
          <ErrorBoundary area="o Inventário" resetKey={appState}>
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
                    onClick={() => { setExportSource('inventario'); setShowExportModal(true); }}
                    className="btn-neu flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-omni-bordo hover:text-omni-rubi hover:bg-red-50/50 h-8 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Extrair dados</span>
                  </button>
                }
              />

              {inventorySelection && (
                <div className="mb-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-omni-bordo/20 bg-red-50/40">
                  <p className="text-xs text-omni-ink">
                    <span className="text-omni-muted">Do Insights:</span>{' '}
                    <span className="font-semibold">{inventorySelection.label}</span>{' '}
                    <span className="text-omni-muted tabular-nums">({inventorySelection.ids.size})</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setInventorySelection(null)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-omni-bordo hover:underline cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    Ver inventário inteiro
                  </button>
                </div>
              )}

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
                {(
                  <motion.div 
                    key="table"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="overflow-hidden rounded-xl border border-omni-line shadow-neu-card bg-white"
                  >
                    <div 
                      className="overflow-x-auto overflow-y-auto custom-scrollbar excel-table-wrapper relative"
                      style={{ height: 'calc(100vh - 260px)', minHeight: '360px' }}
                    >
                      <table className="w-full text-left border-collapse min-w-[1100px] excel-table">
                        <thead className="sticky top-0 z-20">
                          <tr className="bg-[#FAFAFB] border-b border-omni-line">
                            <th style={{ width: columnWidths['titulo'] }} className="text-xs font-semibold text-omni-muted relative py-3 px-4">
                              <div className="resizable-header min-w-[320px]">
                                <span onClick={() => handleSort('titulo')} className="flex items-center gap-1.5 cursor-pointer hover:text-omni-bordo transition-colors w-max">
                                  Título e ID
                                  {inventorySort.field === 'titulo' && (inventorySort.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                                </span>
                              </div>
                              <div className="column-resize-handle" onMouseDown={(e) => startResize(e, 'titulo')} />
                            </th>
                            <th style={{ width: columnWidths['artifact_type'] }} className="text-xs font-semibold text-omni-muted relative py-3 px-4">
                              <div className="resizable-header min-w-[110px]">
                                <span onClick={() => handleSort('artifact_type')} className="cursor-pointer hover:text-omni-bordo transition-colors">Tipo</span>
                              </div>
                              <div className="column-resize-handle" onMouseDown={(e) => startResize(e, 'artifact_type')} />
                            </th>
                            <th style={{ width: columnWidths['measurement_class'] }} className="text-xs font-semibold text-omni-muted relative py-3 px-4">
                              <div className="resizable-header min-w-[120px]">
                                <span onClick={() => handleSort('measurement_class')} className="cursor-pointer hover:text-omni-bordo transition-colors">Mensuração</span>
                              </div>
                              <div className="column-resize-handle" onMouseDown={(e) => startResize(e, 'measurement_class')} />
                            </th>
                            <th style={{ width: columnWidths['produto'] }} className="text-xs font-semibold text-omni-muted relative py-3 px-4">
                              <div className="resizable-header">
                                <span onClick={() => handleSort('produto')} className="cursor-pointer hover:text-omni-bordo transition-colors">Produto</span>
                              </div>
                              <div className="column-resize-handle" onMouseDown={(e) => startResize(e, 'produto')} />
                            </th>
                            <th style={{ width: columnWidths['subproduto'] }} className="text-xs font-semibold text-omni-muted relative py-3 px-4">
                              <div className="resizable-header">
                                <span onClick={() => handleSort('subproduto')} className="cursor-pointer hover:text-omni-bordo transition-colors">Subproduto</span>
                              </div>
                              <div className="column-resize-handle" onMouseDown={(e) => startResize(e, 'subproduto')} />
                            </th>
                            <th style={{ width: columnWidths['responsavel'] }} className="text-xs font-semibold text-omni-muted relative py-3 px-4">
                              <div className="resizable-header">
                                <span onClick={() => handleSort('responsavel')} className="cursor-pointer hover:text-omni-bordo transition-colors">Responsável</span>
                              </div>
                              <div className="column-resize-handle" onMouseDown={(e) => startResize(e, 'responsavel')} />
                            </th>
                            <th style={{ width: columnWidths['ultima_atualizacao'] }} className="text-xs font-semibold text-omni-muted relative py-3 px-4">
                              <div className="resizable-header">
                                <span onClick={() => handleSort('ultima_atualizacao')} className="cursor-pointer hover:text-omni-bordo transition-colors">Atualizado em</span>
                              </div>
                              <div className="column-resize-handle" onMouseDown={(e) => startResize(e, 'ultima_atualizacao')} />
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-omni-line-subtle bg-white">
                          {filteredInventory.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-32 text-center">
                                <div className="flex flex-col items-center gap-6">
                                  <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-300">
                                    <Search className="w-10 h-10" />
                                  </div>
                                  <div>
                                    <h4 className="text-xl font-bold text-omni-ink mb-2">Nenhum artefato encontrado</h4>
                                    <p className="text-omni-muted text-sm mb-8">Refine seus filtros ou realize uma nova busca global.</p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            filteredInventory.map((item) => {
                              const isMapItem = isMap(item);
                              const artifactLabel = getArtifactTypeLabel(item.artifact_type);

                              let classLabel = '—';
                              let classStyle = 'text-omni-muted';

                              if (isMapItem) {
                                const mc = resolveMeasurementClass(item);
                                classLabel = getMeasurementLabel(mc);
                                if (mc === 'GA4') {
                                  classStyle = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
                                } else if (mc === 'GA3') {
                                  classStyle = 'bg-blue-50 text-blue-700 border border-blue-200';
                                } else if (mc === 'HIBRIDO') {
                                  classStyle = 'bg-purple-50 text-purple-700 border border-purple-200';
                                } else {
                                  classStyle = 'bg-gray-100 text-omni-ink-secondary border border-omni-line';
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
                                  className="group transition-colors hover:bg-[#FBF7F8] cursor-pointer focus:outline-none focus:bg-[#FBF7F8]"
                                >
                                  <td className="py-2.5 px-4">
                                    <div className="flex flex-col items-start w-full overflow-hidden">
                                      <span className="block text-[13.5px] font-semibold text-omni-ink leading-snug truncate group-hover:text-omni-bordo transition-colors">
                                        {highlightText(item.titulo, tableFilter)}
                                      </span>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="block text-[11.5px] font-mono text-omni-muted tabular-nums truncate">
                                          {item.id}
                                        </span>
                                        {item.link && (
                                          <a 
                                            href={item.link} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="text-omni-muted hover:text-omni-bordo transition-colors p-0.5 rounded"
                                            title="Abrir no Confluence"
                                          >
                                            <ExternalLink className="w-3 h-3" />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-4">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11.5px] font-medium bg-gray-100 text-omni-ink-secondary border border-omni-line">
                                      {artifactLabel}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-4">
                                    {classLabel === '—' ? (
                                      <span className="text-omni-muted text-xs">—</span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${classStyle}`}>
                                        {classLabel}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-4 text-[13px] text-omni-ink">
                                    <div className="block truncate w-full">{highlightText(item.produto || "—", tableFilter)}</div>
                                  </td>
                                  <td className="py-2.5 px-4 text-[13px] text-omni-ink-secondary">
                                    <div className="block truncate w-full">{highlightText(item.subproduto || "—", tableFilter)}</div>
                                  </td>
                                  <td className="py-2.5 px-4 text-[13px] text-omni-ink">
                                    <div className="block truncate w-full">{highlightText(item.responsavel || "—", tableFilter)}</div>
                                  </td>
                                  <td className="py-2.5 px-4 text-xs text-omni-muted tabular-nums">
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
                )}
              </AnimatePresence>
                </>
              )}
            </motion.section>
          )}
          </ErrorBoundary>
        </section>
        
        </>
        )}
      </div>

      {/* Extrair dados: relatórios configuráveis (domain/export) */}
        {showExportModal && (
        <ErrorBoundary area="a extração de dados" variant="modal" resetKey={showExportModal} onDismiss={() => setShowExportModal(false)}>
        <Suspense fallback={null}>
        <ExportDialog
          open={showExportModal}
          onClose={() => setShowExportModal(false)}
          currentItems={exportSource === 'cards' ? filteredAndSortedCards : filteredInventory}
          allItems={fullInventory.length > 0 ? fullInventory : results}
          sourceLabel={exportSource === 'cards' ? 'Cards exibidos' : 'Inventário filtrado'}
        />
        </Suspense>
        </ErrorBoundary>
        )}

      {/* Modal de Detalhes Canônico de Telas e Snippets */}
      <ErrorBoundary
        area="o detalhe do mapa"
        variant="modal"
        resetKey={detailModalItem?.id}
        onDismiss={() => {
          setDetailModalItem(null);
          setDetailTarget(null);
          setDetailFromHealth(false);
        }}
      >
      {detailModalItem && (
      <Suspense fallback={null}>
      <MapDetailModal 
        item={detailModalItem} 
        initialTab={detailTarget ? 'telas' : undefined}
        initialScreenId={detailTarget?.screenId}
        initialSnippetIndex={detailTarget?.snippetIndex}
        onViewInTree={handleViewInTree}
        adherence={detailFromHealth && detailModalItem ? adherenceByMap.get(String(detailModalItem.id)) : null}
        onOpenDocs={() => {
          setDetailModalItem(null);
          setDetailTarget(null);
          setDetailFromHealth(false);
          setAppState("guia");
        }}
        onClose={() => {
          setDetailModalItem(null);
          setDetailTarget(null);
          setDetailFromHealth(false);
        }} 
      />
      </Suspense>
      )}
      </ErrorBoundary>

      </div>
    </AppShell>
  );
}
