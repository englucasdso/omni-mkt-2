import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import { AppSidebar, NavItem } from './AppSidebar';
import { formatUltimaSincronizacao } from '../utils/helpers';

interface AppShellProps {
  currentRouteId: string;
  onNavigate: (item: NavItem) => void;
  onHomeClick: () => void;
  onNewSearch?: () => void;
  lastSync?: string | null;
  onSyncClick?: () => void;
  children: React.ReactNode;
  contextualContent?: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentRouteId,
  onNavigate,
  onHomeClick,
  onNewSearch,
  lastSync,
  onSyncClick,
  children,
  contextualContent,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex w-full bg-[#f8f9fb] dark:bg-[#0b0f19] text-gray-800 dark:text-slate-100 relative overflow-x-hidden font-sans">
      {/* Global AppsFlyer-like Sidebar (64px collapsed, 240px expanded overlay) */}
      <AppSidebar
        currentRouteId={currentRouteId}
        onNavigate={onNavigate}
        onHomeClick={onHomeClick}
        onNewSearch={onNewSearch}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onSyncClick={onSyncClick}
        contextualContent={contextualContent}
      />

      {/* Main Content Area: Offset by 64px on desktop so expanded sidebar overlays it */}
      <div className="flex flex-col flex-1 min-w-0 md:pl-16 w-full min-h-screen transition-all">
        {/* Mobile Header Bar (Only visible on small viewports) */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 sticky top-0 z-30">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 rounded-xl text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
            aria-label="Abrir menu de navegação"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <button 
            onClick={onHomeClick}
            className="flex items-center gap-2"
          >
            <div className="w-7 h-7 rounded-lg bg-gray-900 text-white flex items-center justify-center font-heading font-bold text-xs">
              O
            </div>
            <span className="font-heading font-bold text-sm text-gray-900 dark:text-slate-50">
              Omni
            </span>
          </button>

          <div className="w-9" /> {/* Spacer for balance */}
        </div>

        {/* Inner Content Wrapper - Wide desktop container without horizontal scroll */}
        <main className="flex-1 flex flex-col w-full max-w-none px-4 sm:px-6 md:px-8 py-6">
          {children}
        </main>

        {/* Standardized Static Footer */}
        <footer className="mt-auto w-full border-t border-gray-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm py-4 px-4 sm:px-8 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs font-ui text-gray-400 dark:text-slate-500 z-10">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-center sm:text-left">
            <span>
              Desenvolvido por: <strong className="font-semibold text-gray-700 dark:text-slate-300 lowercase">lucas.doliveira@bradesco.com.br</strong>
            </span>
            <span className="text-[11px] text-gray-400 dark:text-slate-500">
              • Última sincronização: {formatUltimaSincronizacao(lastSync)}
            </span>
          </div>
          <div className="text-[11px] font-medium tracking-wider uppercase">
            Salla.MKT V1.0.0
          </div>
        </footer>
      </div>
    </div>
  );
};
