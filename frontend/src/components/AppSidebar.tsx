import React, { useEffect } from 'react';
import {
  LayoutList,
  Table2,
  Layers,
  Tag,
  BarChart3,
  Network,
  Route,
  RefreshCw,
  Search,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { formatUltimaSincronizacao } from '../utils/helpers';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Explorar',
    items: [
      { id: 'results', label: 'Cards', path: '/hub-de-artefatos/cards', icon: LayoutList },
      { id: 'inventory_table', label: 'Inventário', path: '/hub-de-artefatos/inventario', icon: Table2 },
      { id: 'graph', label: 'Conexões', path: '/hub-de-artefatos/conexoes', icon: Network },
      { id: 'journeys', label: 'Jornadas', path: '/hub-de-artefatos/jornadas', icon: Route },
    ],
  },
  {
    label: 'Analisar',
    items: [
      { id: 'produtos_analise', label: 'Por produto', path: '/hub-de-artefatos/por-produto', icon: Layers },
      { id: 'parametros_analise', label: 'Por parâmetro', path: '/hub-de-artefatos/por-parametro', icon: Tag },
      { id: 'insights', label: 'Insights', path: '/hub-de-artefatos/insights', icon: BarChart3 },
    ],
  },
];

/** Lista plana mantida para compatibilidade com consumidores antigos. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

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
  onToggleCollapsed?: () => void;
  /** @deprecated filtros agora ficam na própria página (AppShell). */
  contextualContent?: React.ReactNode;
}

export const SIDEBAR_WIDTH = 248;
export const SIDEBAR_COLLAPSED_WIDTH = 72;

export const AppSidebar: React.FC<AppSidebarProps> = ({
  currentRouteId,
  onNavigate,
  onHomeClick,
  onNewSearch,
  isMobileOpen = false,
  onCloseMobile,
  onSyncClick,
  lastSync,
  isCollapsed = false,
  onToggleCollapsed,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCloseMobile) onCloseMobile();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCloseMobile]);

  // No mobile o menu sempre abre completo.
  const compact = isCollapsed && !isMobileOpen;
  const isSearchActive = currentRouteId === 'initial' || currentRouteId === 'home';

  const handleNav = (item: NavItem) => {
    onNavigate(item);
    onCloseMobile?.();
  };

  return (
    <>
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-omni-ink/50 backdrop-blur-[2px] z-40 md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Navegação principal"
        style={{ width: compact ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
        className={`omni-gradient fixed inset-y-0 left-0 z-50 flex flex-col text-white transition-[width,transform] duration-200 ease-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        {/* Textura sutil para dar profundidade ao degradê sem competir com o conteúdo */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 0%, #fff 0, transparent 45%)' }}
          aria-hidden="true"
        />

        {/* Marca */}
        <div className={`relative flex items-center h-16 shrink-0 ${compact ? 'justify-center px-0' : 'px-5 justify-between'}`}>
          <button
            onClick={() => { onHomeClick(); onCloseMobile?.(); }}
            className="flex items-center gap-3 rounded-md cursor-pointer min-w-0"
            aria-label="OMNI — página inicial"
          >
            <img
              src="/omni-logo-1-icone.png"
              alt=""
              className="w-8 h-8 shrink-0 rounded-lg ring-1 ring-white/25 shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
            />
            {!compact && (
              <span className="flex flex-col items-start leading-none min-w-0">
                <span className="font-heading font-bold text-[17px] tracking-[0.08em]">OMNI</span>
                <span className="text-[11px] text-white/65 mt-1 truncate">Governança de mensuração</span>
              </span>
            )}
          </button>
          {isMobileOpen && (
            <button onClick={onCloseMobile} className="md:hidden p-2 rounded-md text-white/80 hover:bg-white/10" aria-label="Fechar navegação">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Ação principal */}
        <div className={`relative shrink-0 ${compact ? 'px-3' : 'px-4'} pt-2 pb-4`}>
          <button
            onClick={() => { (onNewSearch || onHomeClick)(); onCloseMobile?.(); }}
            title={compact ? 'Nova busca' : undefined}
            aria-current={isSearchActive ? 'page' : undefined}
            className={`w-full flex items-center gap-2.5 h-10 rounded-lg bg-white text-omni-bordo font-semibold text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.25)] hover:bg-white/95 transition-colors cursor-pointer
              ${compact ? 'justify-center' : 'px-3.5'}`}
          >
            <Search className="w-4 h-4 shrink-0" />
            {!compact && <span>Nova busca</span>}
            {!compact && <kbd className="ml-auto text-[10px] font-medium text-omni-bordo/60 border border-omni-bordo/15 rounded px-1.5 py-0.5">/</kbd>}
          </button>
        </div>

        {/* Navegação */}
        <nav className="relative flex-1 overflow-y-auto px-3 pb-4 space-y-5" aria-label="Seções do sistema">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!compact ? (
                <p className="px-2.5 mb-1.5 text-[11px] font-medium text-white/50">{group.label}</p>
              ) : (
                <div className="mx-3 mb-2 h-px bg-white/15" aria-hidden="true" />
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentRouteId === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => handleNav(item)}
                        aria-current={isActive ? 'page' : undefined}
                        title={compact ? item.label : undefined}
                        className={`relative w-full flex items-center gap-3 h-9 rounded-md text-[13.5px] transition-colors cursor-pointer
                          ${compact ? 'justify-center' : 'px-2.5'}
                          ${isActive
                            ? 'bg-white/[0.14] text-white font-semibold'
                            : 'text-white/75 hover:text-white hover:bg-white/[0.07] font-medium'}`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-white" aria-hidden="true" />
                        )}
                        <Icon className="w-[18px] h-[18px] shrink-0" />
                        {!compact && <span className="truncate">{item.label}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Sincronização + recolher */}
        <div className="relative shrink-0 border-t border-white/10 p-3 space-y-1">
          <button
            onClick={() => { onSyncClick?.(); onCloseMobile?.(); }}
            title={compact ? 'Atualizar do Confluence' : undefined}
            className={`w-full flex items-center gap-3 rounded-md py-2 text-left text-white/85 hover:bg-white/[0.07] transition-colors cursor-pointer ${compact ? 'justify-center' : 'px-2.5'}`}
          >
            <RefreshCw className="w-[18px] h-[18px] shrink-0" />
            {!compact && (
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">Atualizar do Confluence</span>
                <span className="block text-[11px] text-white/55 truncate">
                  {lastSync ? `Última: ${formatUltimaSincronizacao(lastSync)}` : 'Nenhuma sincronização ainda'}
                </span>
              </span>
            )}
          </button>
          {onToggleCollapsed && (
            <button
              onClick={onToggleCollapsed}
              className={`hidden md:flex w-full items-center gap-3 rounded-md py-2 text-white/60 hover:text-white hover:bg-white/[0.07] transition-colors cursor-pointer text-[12.5px] ${compact ? 'justify-center' : 'px-2.5'}`}
              aria-label={compact ? 'Expandir menu' : 'Recolher menu'}
              title={compact ? 'Expandir menu' : undefined}
            >
              {compact ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
              {!compact && <span>Recolher menu</span>}
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
