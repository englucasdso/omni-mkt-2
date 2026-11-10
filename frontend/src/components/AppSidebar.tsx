import React, { useState, useEffect } from 'react';
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
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { formatUltimaSincronizacao } from '../utils/helpers';

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
      { id: 'results', label: 'Cards', path: '/hub-de-artefatos/cards', icon: LayoutList },
      { id: 'inventory_table', label: 'Inventário', path: '/hub-de-artefatos/inventario', icon: Landmark },
      { id: 'graph', label: 'Conexões', path: '/hub-de-artefatos/conexoes', icon: Network },
      { id: 'journeys', label: 'Jornadas', path: '/hub-de-artefatos/jornadas', icon: Route },
    ]
  },
  {
    title: 'Analisar',
    items: [
      { id: 'produtos_analise', label: 'Por produto', path: '/hub-de-artefatos/por-produto', icon: Layers },
      { id: 'parametros_analise', label: 'Por parâmetro', path: '/hub-de-artefatos/por-parametro', icon: Tag },
      { id: 'insights', label: 'Insights', path: '/hub-de-artefatos/insights', icon: Sparkles },
    ]
  }
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap(g => g.items);
export const NAV_ITEMS: NavItem[] = ALL_NAV_ITEMS;

interface AppSidebarProps {
  currentRouteId: string;
  onNavigate: (item: NavItem) => void;
  onHomeClick: () => void;
  onNewSearch?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onSyncClick?: () => void;
  lastSync?: string | null;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  currentRouteId,
  onNavigate,
  onHomeClick,
  onNewSearch,
  isMobileOpen = false,
  onCloseMobile,
  onSyncClick,
  lastSync,
  isCollapsed: controlledCollapsed,
  onToggleCollapse
}) => {
  // Estado de recolhimento com persistência em localStorage (omni.sidebar.collapsed)
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('omni.sidebar.collapsed');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  const handleToggle = () => {
    const next = !isCollapsed;
    try {
      localStorage.setItem('omni.sidebar.collapsed', String(next));
    } catch (e) {
      console.warn('Erro ao salvar omni.sidebar.collapsed:', e);
    }
    setInternalCollapsed(next);
    if (onToggleCollapse) {
      onToggleCollapse(next);
    }
  };

  // Mantém a variável CSS --sidebar-width sincronizada com o estado
  useEffect(() => {
    const width = isCollapsed ? '72px' : '248px';
    document.documentElement.style.setProperty('--sidebar-width', width);
  }, [isCollapsed]);

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

  const sidebarWidthClass = isCollapsed ? 'md:w-[72px]' : 'md:w-[248px]';

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
        className={`fixed top-0 left-0 h-screen z-40 bg-omni-gradient text-white transition-[width,transform] duration-200 ease-in-out flex flex-col select-none shadow-xl
          ${isMobileOpen ? 'translate-x-0 w-[248px]' : '-translate-x-full md:translate-x-0'}
          ${sidebarWidthClass}
        `}
        aria-label="Navegação principal"
      >
        {/* 1. Topo (64px) */}
        <div className="h-16 flex items-center px-4 shrink-0 border-b border-white/10">
          <button
            onClick={() => {
              onHomeClick();
              if (onCloseMobile) onCloseMobile();
            }}
            className="flex items-center gap-3 w-full text-left cursor-pointer focus:outline-none group overflow-hidden"
            title="OMNI - Governança de mensuração"
            aria-label="OMNI - Página inicial"
          >
            <div className="w-8 h-8 rounded-lg ring-1 ring-white/25 shadow-sm overflow-hidden flex items-center justify-center shrink-0 bg-black/20 group-hover:ring-white/40 transition-all">
              <img
                src="/omni-logo-1-icone.png"
                alt="OMNI"
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            
            {(!isCollapsed || isMobileOpen) && (
              <div className="flex flex-col min-w-0 transition-opacity duration-150">
                <span className="font-heading font-bold text-white text-base tracking-[0.08em] leading-tight">
                  OMNI
                </span>
                <span className="text-[11px] text-white/65 font-ui truncate leading-tight mt-0.5">
                  Governança de mensuração
                </span>
              </div>
            )}
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

        {/* 2. Botão "Nova busca" (40px) */}
        <div className="p-3 shrink-0">
          {(!isCollapsed || isMobileOpen) ? (
            <button
              id="sidebar-nova-busca"
              type="button"
              onClick={() => {
                if (onNewSearch) onNewSearch();
                else onHomeClick();
                if (onCloseMobile) onCloseMobile();
              }}
              className="w-full h-10 px-3 bg-white text-omni-bordo hover:bg-white/95 rounded-lg shadow-sm font-ui font-semibold text-xs flex items-center justify-between transition-all cursor-pointer group"
              title="Nova busca (/)"
              aria-label="Nova busca"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Search className="w-4 h-4 text-omni-bordo shrink-0 group-hover:scale-105 transition-transform" />
                <span className="truncate">Nova busca</span>
              </div>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-omni-mist text-omni-ink-secondary rounded border border-omni-line shadow-2xs">
                /
              </kbd>
            </button>
          ) : (
            <button
              id="sidebar-nova-busca-collapsed"
              type="button"
              onClick={() => {
                if (onNewSearch) onNewSearch();
                else onHomeClick();
              }}
              className="w-10 h-10 mx-auto flex items-center justify-center bg-white text-omni-bordo hover:bg-white/95 rounded-lg shadow-sm transition-all cursor-pointer group"
              title="Nova busca (/)"
              aria-label="Nova busca"
            >
              <Search className="w-4 h-4 text-omni-bordo group-hover:scale-105 transition-transform" />
            </button>
          )}
        </div>

        {/* 3. Navegação em dois grupos (Explorar & Analisar) */}
        <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-4 custom-scrollbar" aria-label="Navegação principal">
          {NAV_GROUPS.map((group, groupIdx) => (
            <div key={group.title} className="space-y-1">
              {(!isCollapsed || isMobileOpen) ? (
                <div className="text-[11px] text-white/50 font-ui font-medium px-3 pt-1 pb-1">
                  {group.title}
                </div>
              ) : (
                groupIdx > 0 && <div className="my-2 border-t border-white/10" />
              )}

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
                    title={isCollapsed && !isMobileOpen ? item.label : undefined}
                    className={`relative w-full h-9 rounded-lg flex items-center transition-colors duration-150 cursor-pointer text-left
                      ${isCollapsed && !isMobileOpen ? 'justify-center px-0' : 'px-3 gap-3'}
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

                    {(!isCollapsed || isMobileOpen) && (
                      <span className="text-xs font-ui truncate leading-none">
                        {item.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* 4. Rodapé (borda branco/10): Sincronização & Recolher Menu */}
        <div className="shrink-0 border-t border-white/10 p-2 space-y-1">
          {/* Atualizar do Confluence */}
          <button
            type="button"
            onClick={() => {
              if (onSyncClick) onSyncClick();
              if (onCloseMobile) onCloseMobile();
            }}
            title={isCollapsed && !isMobileOpen ? `Atualizar do Confluence (Última: ${formatUltimaSincronizacao(lastSync)})` : undefined}
            className={`w-full rounded-lg text-left text-white/75 hover:bg-white/[0.07] hover:text-white transition-colors cursor-pointer flex items-center
              ${isCollapsed && !isMobileOpen ? 'h-9 justify-center px-0' : 'px-3 py-2 gap-3'}
            `}
          >
            <RefreshCw className="w-4 h-4 shrink-0 text-white/75" />
            {(!isCollapsed || isMobileOpen) && (
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-ui font-medium leading-tight truncate">
                  Atualizar do Confluence
                </span>
                <span className="text-[10px] text-white/50 font-ui leading-tight truncate mt-0.5">
                  {formatUltimaSincronizacao(lastSync)}
                </span>
              </div>
            )}
          </button>

          {/* Recolher / Expandir Menu (Desktop) */}
          <button
            type="button"
            onClick={handleToggle}
            title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
            className={`hidden md:flex w-full h-9 rounded-lg items-center text-white/70 hover:bg-white/[0.07] hover:text-white transition-colors cursor-pointer
              ${isCollapsed ? 'justify-center px-0' : 'px-3 gap-3'}
            `}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4 shrink-0" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4 shrink-0" />
                <span className="text-xs font-ui font-medium truncate">
                  Recolher menu
                </span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};
