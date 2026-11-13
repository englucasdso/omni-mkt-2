import React, { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { AppSidebar, NavItem, NAV_GROUPS } from './AppSidebar';

interface AppShellProps {
  currentRouteId: string;
  onNavigate: (item: NavItem) => void;
  onHomeClick: () => void;
  onNewSearch?: () => void;
  lastSync?: string | null;
  onSyncClick?: () => void;
  children: React.ReactNode;
  contextualContent?: React.ReactNode;
  hasFilters?: boolean;
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
  hasFilters: explicitHasFilters,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Rotas que exibem a barra de filtros
  const filterEligibleRoutes = ['results', 'inventory_table', 'produtos_analise', 'parametros_analise', 'insights', 'journeys'];
  const hasFilters = explicitHasFilters !== undefined 
    ? explicitHasFilters 
    : filterEligibleRoutes.includes(currentRouteId);

  // Atalho global "/" para abrir Nova busca
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/') {
        const target = e.target as HTMLElement | null;
        if (target) {
          const tag = target.tagName.toLowerCase();
          if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
            return;
          }
        }
        e.preventDefault();
        if (onNewSearch) {
          onNewSearch();
        } else if (onHomeClick) {
          onHomeClick();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNewSearch, onHomeClick]);

  // Resolução da trilha (Breadcrumb)
  const getBreadcrumb = () => {
    if (currentRouteId === 'initial') {
      return (
        <span className="font-semibold text-omni-ink text-sm">
          Buscar artefatos
        </span>
      );
    }

    for (const group of NAV_GROUPS) {
      const match = group.items.find(item => item.id === currentRouteId);
      if (match) {
        return (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-omni-ink-secondary/70 font-medium">
              {group.title}
            </span>
            <span className="text-omni-muted font-normal">
              ›
            </span>
            <span className="font-semibold text-omni-ink">
              {match.label}
            </span>
          </div>
        );
      }
    }

    return (
      <span className="font-semibold text-omni-ink text-sm">
        OMNI
      </span>
    );
  };

  return (
    <div className="min-h-screen flex w-full bg-[#F4F5F7] text-omni-ink relative overflow-x-hidden font-sans">
      {/* Sidebar Corporativa Fixa com Fundo em Degradê Assinatura */}
      <AppSidebar
        currentRouteId={currentRouteId}
        onNavigate={onNavigate}
        onHomeClick={onHomeClick}
        onNewSearch={onNewSearch}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onSyncClick={onSyncClick}
        lastSync={lastSync}
      />

      {/* Área Principal: recua só a faixa de ícones (72px); o menu aberto passa por cima */}
      <div 
        className="flex flex-col flex-1 min-w-0 w-full min-h-screen transition-[padding] duration-200"
        style={{ paddingLeft: 'var(--sidebar-width, 72px)' }}
      >
        {/* Mobile Header Bar: 56px em degradê omni-gradient com hambúrguer e logo */}
        <div className="md:hidden flex items-center justify-between px-4 h-14 bg-omni-gradient text-white sticky top-0 z-30 shadow-md">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 -ml-2 rounded-lg text-white hover:bg-white/10 cursor-pointer"
            aria-label="Abrir menu de navegação"
          >
            <Menu className="w-5 h-5 text-white" />
          </button>
          
          <button 
            onClick={onHomeClick}
            className="flex items-center gap-2 cursor-pointer focus:outline-none"
            aria-label="Ir para o início"
          >
            <img
              src="/omni-logo-branco.png"
              alt="OMNI"
              className="w-7 h-7 object-contain"
            />
            <span className="font-heading font-bold text-sm tracking-[0.08em] text-white">
              OMNI
            </span>
          </button>

          <div className="w-8" /> {/* Espaçador para balanceamento */}
        </div>

        {/* Barra Superior Sticky Desktop: 60px, mist/85 + backdrop-blur, borda line */}
        <header className="sticky top-0 z-20 hidden md:flex items-center justify-between min-h-[60px] px-6 lg:px-8 bg-omni-mist/85 backdrop-blur-md border-b border-omni-line transition-all">
          {/* Trilha à esquerda */}
          <div className="flex items-center shrink-0 pr-4">
            {getBreadcrumb()}
          </div>

          {/* Filtros da Página à direita (envolvidos em .omni-filterbar) */}
          {hasFilters && contextualContent && (
            <div className="omni-filterbar flex-1 min-w-0 py-2">
              {contextualContent}
            </div>
          )}
        </header>

        {/* Barra de Filtros Mobile (quando aplicável) */}
        {hasFilters && contextualContent && (
          <div className="md:hidden px-4 py-3 bg-white border-b border-omni-line shadow-2xs">
            <div className="omni-filterbar w-full">
              {contextualContent}
            </div>
          </div>
        )}

        {/* Conteúdo Principal */}
        <main className="flex-1 flex flex-col w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-2">
          {children}
        </main>

        {/* Rodapé corporativo: versão beta e canal de feedback */}
        <footer className="mt-auto w-full border-t border-omni-line bg-white/70 backdrop-blur-sm py-3 px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-2 text-[11.5px] font-ui text-omni-muted z-10">
          <div className="flex items-center gap-2 text-center sm:text-left">
            <span className="font-semibold text-omni-ink-secondary">OMNI</span>
            <span className="px-1.5 py-px rounded border border-omni-line bg-omni-mist text-[10px] font-semibold text-omni-ink-secondary">
              Beta
            </span>
            <span>Primeira versão, em avaliação. Números e telas ainda podem mudar.</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="mailto:lucas.doliveira@bradesco.com.br?subject=OMNI%20Beta%20-%20Feedback"
              className="text-omni-ink-secondary hover:text-omni-bordo hover:underline"
            >
              Enviar feedback
            </a>
            <span className="text-omni-line" aria-hidden="true">|</span>
            <span className="tabular-nums">Versão 1.0 beta</span>
          </div>
        </footer>
      </div>
    </div>
  );
};
