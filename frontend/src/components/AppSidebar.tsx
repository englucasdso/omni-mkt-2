import React, { useState, useRef, useEffect } from 'react';
import { 
  LayoutList, 
  Landmark, 
  Layers, 
  Tag, 
  Sparkles, 
  Network, 
  RefreshCw,
  Plug,
  X,
  Compass,
  Route
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'results', label: 'Cards', path: '/hub-de-artefatos/cards', icon: LayoutList },
  { id: 'inventory_table', label: 'Inventário', path: '/hub-de-artefatos/inventario', icon: Landmark },
  { id: 'produtos_analise', label: 'Por Produto', path: '/hub-de-artefatos/por-produto', icon: Layers },
  { id: 'parametros_analise', label: 'Por Parâmetro', path: '/hub-de-artefatos/por-parametro', icon: Tag },
  { id: 'insights', label: 'Insights', path: '/hub-de-artefatos/insights', icon: Sparkles },
  { id: 'graph', label: 'Conexões', path: '/hub-de-artefatos/conexoes', icon: Network },
];

interface AppSidebarProps {
  currentRouteId: string;
  onNavigate: (item: NavItem) => void;
  onHomeClick: () => void;
  onNewSearch?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onSyncClick?: () => void;
  contextualContent?: React.ReactNode;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  currentRouteId,
  onNavigate,
  onHomeClick,
  onNewSearch,
  isMobileOpen = false,
  onCloseMobile,
  onSyncClick,
  contextualContent,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusedWithin, setIsFocusedWithin] = useState(false);
  const [hoveredTooltip, setHoveredTooltip] = useState<{ id: string; top: number; label: string } | null>(null);

  const sidebarRef = useRef<HTMLElement>(null);

  const isExpanded = isHovered || isFocusedWithin;

  // Handle outside click or escape key for mobile
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onCloseMobile) onCloseMobile();
        setHoveredTooltip(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCloseMobile]);

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar */}
      <aside
        ref={sidebarRef}
        onMouseEnter={() => {
          setIsHovered(true);
          setHoveredTooltip(null);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
          setHoveredTooltip(null);
        }}
        onFocus={() => setIsFocusedWithin(true)}
        onBlur={(e) => {
          if (!sidebarRef.current?.contains(e.relatedTarget as Node)) {
            setIsFocusedWithin(false);
          }
        }}
        className={`fixed top-0 left-0 h-screen z-40 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 transition-all duration-200 ease-in-out flex flex-col select-none
          ${isMobileOpen ? 'translate-x-0 w-[240px] shadow-2xl' : '-translate-x-full md:translate-x-0'}
          ${isExpanded ? 'md:w-[240px] md:shadow-2xl' : 'md:w-16'}
        `}
        aria-label="Navegação principal"
      >
        {/* 1. Top Header / Logo */}
        <div className="shrink-0">
          <div className="h-16 flex items-center px-3 border-b border-gray-100 dark:border-slate-800/80">
            <button
              onClick={() => {
                onHomeClick();
                if (onCloseMobile) onCloseMobile();
              }}
              className="relative flex items-center w-full h-11 rounded-xl text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--omni-brand-primary)] overflow-hidden"
              title="Ir para o início"
              aria-label="Omni Marketing - Página inicial"
            >
              {/* Símbolo oficial reduzido (sidebar recolhida) */}
              <div 
                className={`w-10 h-10 flex items-center justify-center shrink-0 transition-opacity duration-200 ${
                  isExpanded || isMobileOpen ? 'opacity-0 pointer-events-none absolute' : 'opacity-100'
                }`}
              >
                <img
                  src="/omni-logo-1-icone.png"
                  alt="Omni"
                  className="w-8 h-8 object-contain rounded-lg shadow-sm"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Logo oficial horizontal completo (sidebar expandida) */}
              <div 
                className={`flex items-center min-w-0 transition-all duration-200 ${
                  isExpanded || isMobileOpen 
                    ? 'opacity-100 translate-x-0 w-full pl-0.5' 
                    : 'opacity-0 -translate-x-2 pointer-events-none absolute'
                }`}
              >
                <img
                  src="/omni-logo-2-horizontal-branco.png"
                  alt="Omni Marketing"
                  className="h-8 max-w-[190px] object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            </button>

            {/* Close button for mobile */}
            {isMobileOpen && (
              <button
                onClick={onCloseMobile}
                className="md:hidden p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 ml-auto"
                aria-label="Fechar navegação"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* 2. Navigation Links */}
        <nav className="px-3 py-2 space-y-1 mt-3 shrink-0" aria-label="Seções do sistema">
            {NAV_ITEMS.map((item) => {
              const isActive = currentRouteId === item.id;
              const Icon = item.icon;

              return (
                <div key={item.id} className="relative">
                  <button
                    onClick={() => {
                      onNavigate(item);
                      if (onCloseMobile) onCloseMobile();
                    }}
                    onMouseEnter={(e) => {
                      if (!isExpanded && !isMobileOpen) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredTooltip({
                          id: item.id,
                          top: rect.top + rect.height / 2,
                          label: item.label,
                        });
                      }
                    }}
                    onMouseLeave={() => {
                      setHoveredTooltip(null);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={item.label}
                    className={`flex items-center w-full h-11 rounded-xl transition-all duration-150 cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-omni-brand-accent
                      ${isActive
                        ? 'bg-red-50/80 dark:bg-red-950/40 text-omni-brand-primary border border-red-200/70 dark:border-red-900/50 shadow-neu-raised font-semibold'
                        : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-100/70 dark:hover:bg-slate-800/60 font-medium'
                      }
                    `}
                  >
                    {/* Ícone fixo no centro exato da sidebar recolhida (w-10 dentro dos 64px) */}
                    <div className="w-10 h-10 flex items-center justify-center shrink-0">
                      <Icon className={`w-5 h-5 transition-transform duration-150 ${isActive ? 'text-omni-brand-primary scale-105' : 'text-gray-500 dark:text-slate-400'}`} />
                    </div>

                    {/* Rótulo visível apenas quando expandido */}
                    <span 
                      className={`text-xs font-ui whitespace-nowrap ml-2 transition-all duration-150 truncate ${
                        isExpanded || isMobileOpen ? 'opacity-100' : 'opacity-0 md:w-0'
                      }`}
                    >
                      {item.label}
                    </span>
                  </button>
                </div>
              );
            })}
            
            <div className="relative mt-6">
              <button
                onClick={() => {
                  if (onSyncClick) onSyncClick();
                  if (onCloseMobile) onCloseMobile();
                }}
                onMouseEnter={(e) => {
                  if (!isExpanded && !isMobileOpen) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoveredTooltip({
                      id: 'sync',
                      top: rect.top + rect.height / 2,
                      label: 'Sincronização',
                    });
                  }
                }}
                onMouseLeave={() => setHoveredTooltip(null)}
                aria-label="Sincronização"
                className="flex items-center w-full h-11 rounded-xl transition-all duration-150 cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-omni-brand-accent text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-100/70 dark:hover:bg-slate-800/60 font-medium"
              >
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  <RefreshCw className="w-5 h-5 transition-transform duration-150 text-gray-500 dark:text-slate-400" />
                </div>
                <span className={`text-xs font-ui whitespace-nowrap ml-2 transition-all duration-150 truncate ${
                  isExpanded || isMobileOpen ? 'opacity-100' : 'opacity-0 md:w-0'
                }`}>
                  Sincronização
                </span>
              </button>
            </div>
            
            <div className="relative">
              <button
                onClick={() => {
                  onNavigate({ id: 'journeys', label: 'Jornadas', path: '/hub-de-artefatos/jornadas', icon: Route });
                  if (onCloseMobile) onCloseMobile();
                }}
                onMouseEnter={(e) => {
                  if (!isExpanded && !isMobileOpen) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoveredTooltip({
                      id: 'journeys',
                      top: rect.top + rect.height / 2,
                      label: 'Jornadas',
                    });
                  }
                }}
                onMouseLeave={() => setHoveredTooltip(null)}
                aria-current={currentRouteId === 'journeys' ? 'page' : undefined}
                aria-label="Jornadas"
                className={`flex items-center w-full h-11 rounded-xl transition-all duration-150 cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-omni-brand-accent
                  ${currentRouteId === 'journeys'
                    ? 'bg-red-50/80 dark:bg-red-950/40 text-omni-brand-primary border border-red-200/70 dark:border-red-900/50 shadow-neu-raised font-semibold'
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-100/70 dark:hover:bg-slate-800/60 font-medium'
                  }
                `}
              >
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  <Route className={`w-5 h-5 transition-transform duration-150 ${currentRouteId === 'journeys' ? 'text-omni-brand-primary scale-105' : 'text-gray-500 dark:text-slate-400'}`} />
                </div>
                <span className={`text-xs font-ui whitespace-nowrap ml-2 transition-all duration-150 truncate ${
                  isExpanded || isMobileOpen ? 'opacity-100' : 'opacity-0 md:w-0'
                }`}>
                  Jornadas
                </span>
              </button>
            </div>

            <div className="relative">
              <button
                disabled
                aria-disabled="true"
                onMouseEnter={(e) => {
                  if (!isExpanded && !isMobileOpen) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoveredTooltip({
                      id: 'plugins',
                      top: rect.top + rect.height / 2,
                      label: 'Plugins',
                    });
                  }
                }}
                onMouseLeave={() => setHoveredTooltip(null)}
                aria-label="Plugins"
                className="flex items-center w-full h-11 rounded-xl transition-all duration-150 cursor-not-allowed text-left text-gray-400 dark:text-slate-600 opacity-60 font-medium"
              >
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  <Plug className="w-5 h-5 transition-transform duration-150 text-gray-400 dark:text-slate-600" />
                </div>
                <span className={`text-xs font-ui whitespace-nowrap ml-2 transition-all duration-150 truncate ${
                  isExpanded || isMobileOpen ? 'opacity-100' : 'opacity-0 md:w-0'
                }`}>
                  Plugins
                </span>
              </button>
            </div>
            
          </nav>

        {/* 3. Espaço flexível disponível */}
        <div className="flex-1 min-h-0" />

        {/* 4. Área contextual de busca e filtros (apenas no sidebar expandido ou mobile) */}
        {(isExpanded || isMobileOpen) && contextualContent && (
          <div className="shrink-0 max-h-[45vh] overflow-y-auto px-3 py-2.5 border-t border-gray-100 dark:border-slate-800/80 custom-scrollbar">
            {contextualContent}
          </div>
        )}

        {/* 5. Separador & 6. “Nova Busca” no rodapé */}
        <div className="shrink-0 p-3 border-t border-gray-100 dark:border-slate-800/80">
          <button
            id="sidebar-nova-busca"
            type="button"
            onClick={() => {
              if (onNewSearch) {
                onNewSearch();
              } else {
                onHomeClick();
              }
              if (onCloseMobile) onCloseMobile();
            }}
            className="flex items-center w-full h-10 rounded-xl text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors cursor-pointer"
            title="Buscar novo termo"
            aria-label="Buscar novo termo"
            >
            <div className="w-10 h-10 flex items-center justify-center shrink-0">
              <Compass className="w-4 h-4" />
            </div>
            <span 
              className={`text-[11px] font-ui whitespace-nowrap ml-2 transition-all duration-150 truncate ${
                isExpanded || isMobileOpen ? 'opacity-100' : 'opacity-0 md:w-0'
              }`}
            >
              Nova Busca
            </span>
          </button>
        </div>
      </aside>

      {/* Floating Tooltip when collapsed */}
      {hoveredTooltip && !isExpanded && !isMobileOpen && (
        <div 
          className="fixed left-[72px] z-50 px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-slate-100 text-white dark:text-gray-900 text-xs font-ui font-medium shadow-xl pointer-events-none -translate-y-1/2 transition-opacity duration-150 animate-fade-in"
          style={{ top: `${hoveredTooltip.top}px` }}
          role="tooltip"
        >
          {hoveredTooltip.label}
        </div>
      )}
    </>
  );
};
