import React, { useEffect, useState } from 'react';
import { Menu, ChevronRight } from 'lucide-react';
import { AppSidebar, NavItem, NAV_GROUPS, SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from './AppSidebar';

interface AppShellProps {
  currentRouteId: string;
  onNavigate: (item: NavItem) => void;
  onHomeClick: () => void;
  onNewSearch?: () => void;
  lastSync?: string | null;
  onSyncClick?: () => void;
  children: React.ReactNode;
  /** Filtros da tela atual. Renderizados na barra superior da página. */
  contextualContent?: React.ReactNode;
  /** Indica se a rota atual possui filtros (evita painel vazio). */
  hasFilters?: boolean;
}

const readPref = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
};
const writePref = (key: string, value: boolean) => {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* armazenamento indisponível: preferência vale só nesta sessão */
  }
};

export const AppShell: React.FC<AppShellProps> = ({
  currentRouteId,
  onNavigate,
  onHomeClick,
  onNewSearch,
  lastSync,
  onSyncClick,
  children,
  contextualContent,
  hasFilters = false,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => readPref('omni.sidebar.collapsed', false));

  // Atalho "/" abre a busca (fora de campos de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      e.preventDefault();
      (onNewSearch || onHomeClick)();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNewSearch, onHomeClick]);

  const sidebarWidth = isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;
  const showFilterBar = hasFilters && Boolean(contextualContent);
  const crumb = (() => {
    for (const g of NAV_GROUPS) {
      const item = g.items.find((i) => i.id === currentRouteId);
      if (item) return { group: g.label, page: item.label };
    }
    if (currentRouteId === 'initial' || currentRouteId === 'home') return { group: '', page: 'Buscar artefatos' };
    if (currentRouteId === 'operational_insights') return { group: 'Analisar', page: 'Insights operacionais' };
    return { group: '', page: 'OMNI' };
  })();

  return (
    <div className="min-h-screen flex w-full bg-omni-mist dark:bg-[#0b0f19] text-omni-ink dark:text-slate-100 relative overflow-x-hidden font-sans">
      <AppSidebar
        currentRouteId={currentRouteId}
        onNavigate={onNavigate}
        onHomeClick={onHomeClick}
        onNewSearch={onNewSearch}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onSyncClick={onSyncClick}
        lastSync={lastSync}
        isCollapsed={isCollapsed}
        onToggleCollapsed={() => {
          setIsCollapsed((prev) => {
            writePref('omni.sidebar.collapsed', !prev);
            return !prev;
          });
        }}
      />

      <div
        className="flex flex-col flex-1 min-w-0 w-full min-h-screen transition-[padding] duration-200 md:pl-[var(--omni-sidebar-w)]"
        style={{ ['--omni-sidebar-w' as any]: `${sidebarWidth}px` }}
      >
        {/* Barra superior mobile */}
        <div className="md:hidden flex items-center justify-between px-4 h-14 omni-gradient text-white sticky top-0 z-30">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 -ml-2 rounded-md hover:bg-white/10"
            aria-label="Abrir menu de navegação"
          >
            <Menu className="w-5 h-5" />
          </button>
          <button onClick={onHomeClick} className="flex items-center gap-2">
            <img src="/omni-logo-1-icone.png" alt="" className="w-6 h-6 rounded-md ring-1 ring-white/25" />
            <span className="font-heading font-bold text-sm tracking-[0.08em]">OMNI</span>
          </button>
          <div className="w-9" />
        </div>

        {/* Barra superior: contexto da página à esquerda, filtros da página à direita */}
        <div className="sticky top-0 md:top-0 z-20 border-b border-omni-line/80 dark:border-slate-800 bg-omni-mist/85 dark:bg-[#0b0f19]/85 backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 min-h-[60px] px-4 sm:px-6 lg:px-10 py-2.5">
            <nav aria-label="Você está em" className="flex items-center gap-2 text-[13px] min-w-0">
              {crumb.group && <span className="text-gray-500 dark:text-slate-400">{crumb.group}</span>}
              {crumb.group && <ChevronRight className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />}
              <span className="font-semibold text-omni-ink dark:text-slate-100 truncate">{crumb.page}</span>
            </nav>
            {showFilterBar && (
              <div
                className="omni-filterbar ml-auto flex items-center gap-2 min-w-0 flex-wrap justify-end"
                aria-label="Filtros da página"
              >
                {contextualContent}
              </div>
            )}
          </div>
        </div>

        <main className="flex-1 flex flex-col min-w-0 px-4 sm:px-6 lg:px-10 pb-8">
          {children}
        </main>

        <footer className="mt-auto w-full border-t border-omni-line dark:border-slate-800 py-4 px-4 sm:px-10 flex flex-col sm:flex-row justify-between items-center gap-1 text-[11.5px] text-gray-500 dark:text-slate-500">
          <span>
            OMNI, desenvolvido por <span className="font-medium text-gray-700 dark:text-slate-300">lucas.doliveira@bradesco.com.br</span>
          </span>
          <span className="tabular-nums">Salla.MKT v1.0.0</span>
        </footer>
      </div>
    </div>
  );
};
