import React, { useState, useEffect, useRef } from 'react';
import { ROUTES } from '../app/routes';
import { 
  LayoutList, 
  Landmark, 
  Layers, 
  Tag, 
  Sparkles, 
  Network, 
  RefreshCw,
  X,
  Route,
  Search,
  Database,
  BookOpen,
  HeartPulse,
  ChevronsUpDown,
  Check
} from 'lucide-react';
import { formatUltimaSincronizacao } from '../utils/helpers';
import type { Workspace } from '../services/workspace';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Explorar',
    items: [
      { id: 'results', label: 'Cards', path: ROUTES.results, icon: LayoutList },
      { id: 'inventory_table', label: 'Inventário', path: ROUTES.inventory_table, icon: Landmark },
      { id: 'graph', label: 'Conexões', path: ROUTES.graph, icon: Network },
      { id: 'journeys', label: 'Jornadas', path: ROUTES.journeys, icon: Route },
    ]
  },
  {
    title: 'Analisar',
    items: [
      { id: 'produtos_analise', label: 'Por produto', path: ROUTES.produtos_analise, icon: Layers },
      { id: 'parametros_analise', label: 'Por parâmetro', path: ROUTES.parametros_analise, icon: Tag },
      { id: 'insights', label: 'Insights', path: ROUTES.insights, icon: Sparkles },
    ]
  },
  {
    title: 'Governar',
    items: [
      { id: 'padroes', label: 'Base de padrões', path: ROUTES.padroes, icon: Database },
      { id: 'guia', label: 'Guia de tagueamento', path: ROUTES.guia, icon: BookOpen },
      { id: 'saude', label: 'Saúde da documentação', path: ROUTES.saude, icon: HeartPulse },
    ]
  }
];


interface AppSidebarProps {
  currentRouteId: string;
  onNavigate: (item: NavItem) => void;
  onHomeClick: () => void;
  onNewSearch?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onSyncClick?: () => void;
  lastSync?: string | null;
  workspaces?: Workspace[];
  activeWorkspace?: Workspace;
  onSwitchWorkspace?: (id: string) => void;
  workspaceSwitchLocked?: boolean;
}

/** Selo com a sigla do espaço (SP, BE): aparece mesmo com o menu fechado. */
const WorkspaceBadge: React.FC<{ ws?: Workspace; active?: boolean }> = ({ ws, active = true }) => (
  <span
    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-heading font-bold tracking-wide
      ${active ? 'bg-white text-bradesco-red' : 'bg-white/10 text-white border border-white/20'}`}
    aria-hidden="true"
  >
    {ws?.shortName || '?'}
  </span>
);

// Menu que abre ao passar o mouse (expand on hover): fica como faixa de ícones
// e abre por cima do conteúdo, sem empurrar a página.
const RAIL_WIDTH = '72px';
const OPEN_DELAY_MS = 80; // evita abrir quando o mouse só atravessa a faixa
const CLOSE_DELAY_MS = 180; // evita fechar ao escorregar um pouco para fora

export const AppSidebar: React.FC<AppSidebarProps> = ({
  currentRouteId,
  onNavigate,
  onHomeClick,
  onNewSearch,
  isMobileOpen = false,
  onCloseMobile,
  onSyncClick,
  lastSync,
  workspaces = [],
  activeWorkspace,
  onSwitchWorkspace,
  workspaceSwitchLocked = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const timerRef = useRef<number | null>(null);
  // Lista de espaços (abre para cima, como a troca de conta)
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isWorkspaceMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(e.target as globalThis.Node)) {
        setIsWorkspaceMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsWorkspaceMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isWorkspaceMenuOpen]);

  // O menu recolhido fecha também a lista de espaços
  useEffect(() => {
    if (!isExpanded && !isMobileOpen) setIsWorkspaceMenuOpen(false);
  }, [isExpanded, isMobileOpen]);

  const schedule = (open: boolean) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setIsExpanded(open), open ? OPEN_DELAY_MS : CLOSE_DELAY_MS);
  };

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  // No computador o menu vive como faixa de ícones; no celular abre pelo botão de menu
  const isCollapsed = !isExpanded;

  // A página sempre reserva só a faixa de ícones: o menu aberto passa por cima
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', RAIL_WIDTH);
  }, []);

  // Tecla Escape para fechar mobile
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileOpen && onCloseMobile) {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, onCloseMobile]);

  // Textos sempre presentes: só aparecem/somem, para nada mudar de lugar ao abrir
  const showLabels = !isCollapsed || isMobileOpen;
  const labelFade = `transition-opacity duration-150 ${showLabels ? 'opacity-100 delay-75' : 'opacity-0 pointer-events-none'}`;

  const sidebarWidthClass = isCollapsed ? 'md:w-[72px]' : 'md:w-[248px] md:shadow-2xl';

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar: fundo omni-gradient, texto branco, largura 248px ou 72px */}
      <aside
        onMouseEnter={() => schedule(true)}
        onMouseLeave={() => schedule(false)}
        onFocus={() => schedule(true)}
        onBlur={(e) => {
          // Teclado: fecha quando o foco sai do menu
          if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) schedule(false);
        }}
        className={`fixed top-0 left-0 h-screen z-40 bg-omni-gradient text-white transition-[width,transform,box-shadow] duration-200 ease-in-out flex flex-col select-none shadow-xl overflow-x-hidden
          ${isMobileOpen ? 'translate-x-0 w-[248px]' : '-translate-x-full md:translate-x-0'}
          ${sidebarWidthClass}
        `}
        aria-label="Navegação principal"
      >
        {/* 1. Topo (64px): logo fixo; nome aparece ao abrir */}
        <div className="h-16 flex items-center shrink-0 border-b border-white/10 pl-[18px] pr-3">
          <button
            onClick={() => {
              onHomeClick();
              if (onCloseMobile) onCloseMobile();
            }}
            className="flex items-center gap-3 text-left cursor-pointer focus:outline-none group min-w-0 flex-1"
            title="OMNI - Governança de mensuração"
            aria-label="OMNI - Página inicial"
          >
            {/* Só o símbolo branco: o fundo do menu já é vermelho */}
            <img
              src="/omni-logo-branco.png"
              alt="OMNI"
              className="w-9 h-9 object-contain shrink-0 opacity-95 group-hover:opacity-100 transition-opacity"
            />
            <div className={`flex flex-col min-w-0 whitespace-nowrap ${labelFade}`} aria-hidden={!showLabels}>
              <span className="flex items-center gap-2 leading-tight">
                <span className="font-heading font-bold text-white text-base tracking-[0.08em]">OMNI</span>
                <span
                  className="px-1.5 py-px rounded border border-white/35 text-[9.5px] font-ui font-semibold text-white/85 tracking-wide"
                  title="Primeira versão, em avaliação"
                >
                  Beta
                </span>
              </span>
              <span className="text-[11px] text-white/65 font-ui truncate leading-tight mt-0.5">
                Governança de mensuração
              </span>
            </div>
          </button>

          {/* Botão fechar apenas no mobile */}
          {isMobileOpen && (
            <button
              onClick={onCloseMobile}
              className="md:hidden p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 ml-auto"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* 2. Nova busca: mesmo estilo dos itens do menu, com espaço em relação ao logo */}
        <div className="px-2 pt-4 pb-1 shrink-0">
          <button
            id="sidebar-nova-busca"
            type="button"
            onClick={() => {
              if (onNewSearch) onNewSearch();
              else onHomeClick();
              if (onCloseMobile) onCloseMobile();
            }}
            aria-label="Nova busca"
            className="relative w-full h-9 rounded-lg flex items-center pl-[19px] pr-3 gap-3 transition-colors duration-150 cursor-pointer text-left text-white/85 hover:bg-white/[0.07] hover:text-white font-medium"
          >
            <Search className="w-[18px] h-[18px] shrink-0" />
            <span className={`text-xs font-ui truncate whitespace-nowrap leading-none flex-1 ${labelFade}`}>Nova busca</span>
            <kbd
              className={`px-1.5 py-0.5 text-[10px] font-mono text-white/55 rounded border border-white/20 leading-none ${labelFade}`}
              title="Atalho: tecla /"
            >
              /
            </kbd>
          </button>
        </div>

        {/* 3. Navegação em dois grupos (Explorar & Analisar): títulos ocupam sempre o mesmo espaço */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-1 space-y-4 custom-scrollbar" aria-label="Navegação principal">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1">
              <div className={`h-6 flex items-center text-[11px] text-white/50 font-ui font-medium px-3 whitespace-nowrap ${labelFade}`} aria-hidden={!showLabels}>
                {group.title}
              </div>

              {group.items.map((item) => {
                const isActive = currentRouteId === item.id;
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onNavigate(item);
                      if (onCloseMobile) onCloseMobile();
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={item.label}
                    className={`relative w-full h-9 rounded-lg flex items-center pl-[19px] pr-3 gap-3 transition-colors duration-150 cursor-pointer text-left
                      ${isActive
                        ? 'bg-white/[0.14] text-white font-semibold'
                        : 'text-white/75 hover:bg-white/[0.07] hover:text-white font-medium'
                      }
                    `}
                  >
                    {/* Barra branca de 3px à esquerda quando ativo */}
                    {isActive && (
                      <span className="absolute left-0 inset-y-1.5 w-[3px] bg-white rounded-r" aria-hidden="true" />
                    )}

                    <Icon className="w-[18px] h-[18px] shrink-0" />

                    <span className={`text-xs font-ui truncate whitespace-nowrap leading-none ${labelFade}`}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* 4. Rodapé (borda branco/10): espaço ativo e sincronização, altura fixa nos dois estados */}
        <div className="shrink-0 border-t border-white/10 p-2 space-y-1">
          {activeWorkspace && (
            <div className="relative" ref={workspaceMenuRef}>
              {isWorkspaceMenuOpen && (
                <div
                  role="menu"
                  aria-label="Trocar de espaço"
                  className="absolute bottom-full left-0 right-0 mb-2 rounded-xl bg-white text-omni-ink shadow-2xl border border-omni-line p-1.5 z-50"
                >
                  <div className="px-2.5 pt-1.5 pb-2 text-[11px] text-omni-muted font-ui">Trocar de espaço</div>
                  {workspaces.map((ws) => {
                    const isCurrent = ws.id === activeWorkspace.id;
                    return (
                      <button
                        key={ws.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isCurrent}
                        onClick={() => {
                          setIsWorkspaceMenuOpen(false);
                          if (!isCurrent && onSwitchWorkspace) onSwitchWorkspace(ws.id);
                        }}
                        className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left text-xs font-ui transition-colors cursor-pointer
                          ${isCurrent ? 'bg-omni-mist font-semibold' : 'hover:bg-omni-mist/70 font-medium'}`}
                      >
                        <span
                          className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-[10.5px] font-heading font-bold
                            ${isCurrent ? 'bg-bradesco-red text-white' : 'bg-omni-mist text-omni-ink border border-omni-line'}`}
                          aria-hidden="true"
                        >
                          {ws.shortName}
                        </span>
                        <span className="flex-1 min-w-0 truncate">{ws.name}</span>
                        {isCurrent && <Check className="w-4 h-4 shrink-0 text-bradesco-red" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (workspaceSwitchLocked) return;
                  setIsWorkspaceMenuOpen((open) => !open);
                }}
                aria-haspopup="menu"
                aria-expanded={isWorkspaceMenuOpen}
                aria-label={`Espaço: ${activeWorkspace.name}. Trocar de espaço`}
                title={workspaceSwitchLocked
                  ? 'Aguarde a sincronização terminar para trocar de espaço'
                  : `Espaço: ${activeWorkspace.name}`}
                className={`w-full h-11 rounded-lg text-left transition-colors flex items-center pl-[14px] pr-3 gap-3
                  ${workspaceSwitchLocked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-white/[0.07] cursor-pointer'}`}
              >
                <WorkspaceBadge ws={activeWorkspace} />
                <div className={`flex flex-col min-w-0 flex-1 whitespace-nowrap ${labelFade}`}>
                  <span className="text-[10px] text-white/50 font-ui leading-tight">Espaço</span>
                  <span className="text-xs font-ui font-semibold text-white leading-tight truncate mt-0.5">
                    {activeWorkspace.name}
                  </span>
                </div>
                {workspaces.length > 1 && (
                  <ChevronsUpDown className={`w-4 h-4 shrink-0 text-white/60 ${labelFade}`} aria-hidden="true" />
                )}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (onSyncClick) onSyncClick();
              if (onCloseMobile) onCloseMobile();
            }}
            title={`Atualizar ${activeWorkspace ? activeWorkspace.name : ''} do Confluence (Última: ${formatUltimaSincronizacao(lastSync)})`}
            className="w-full h-11 rounded-lg text-left text-white/75 hover:bg-white/[0.07] hover:text-white transition-colors cursor-pointer flex items-center pl-5 pr-3 gap-3"
          >
            <RefreshCw className="w-4 h-4 shrink-0 text-white/75" />
            <div className={`flex flex-col min-w-0 whitespace-nowrap ${labelFade}`}>
              <span className="text-xs font-ui font-medium leading-tight truncate">
                Atualizar do Confluence
              </span>
              <span className="text-[10px] text-white/50 font-ui leading-tight truncate mt-0.5">
                {formatUltimaSincronizacao(lastSync)}
              </span>
            </div>
          </button>
        </div>
      </aside>
    </>
  );
};
