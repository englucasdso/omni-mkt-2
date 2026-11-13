/**
 * Rotas do OMNI: fonte única para menu, navegação e leitura da URL.
 * Endereços antigos (/hub-de-artefatos/...) continuam funcionando por redirecionamento.
 */
export type AppView =
  | 'initial'
  | 'results'
  | 'inventory_table'
  | 'produtos_analise'
  | 'parametros_analise'
  | 'insights'
  | 'graph'
  | 'journeys'
  | 'padroes'
  | 'guia'
  | 'saude';

export const ROUTES: Record<AppView, string> = {
  initial: '/',
  results: '/cards',
  inventory_table: '/inventario',
  produtos_analise: '/por-produto',
  parametros_analise: '/por-parametro',
  insights: '/insights',
  graph: '/conexoes',
  journeys: '/jornadas',
  padroes: '/base-de-padroes',
  guia: '/guia-de-tagueamento',
  saude: '/saude-da-documentacao',
};

const VIEW_BY_PATH: Record<string, AppView> = Object.fromEntries(
  Object.entries(ROUTES).map(([view, path]) => [path, view as AppView])
);

/** Tela correspondente a um caminho (sem barra no final). */
export function viewFromPath(pathname: string): AppView | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  return VIEW_BY_PATH[p] ?? null;
}

/** Endereços antigos → novos. Devolve null se o caminho não for legado. */
export function legacyRedirect(pathname: string): string | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/home' || p === '/overview' || p === '/hub-de-eventos') return ROUTES.initial;
  if (p === '/insights/resumo-executivo' || p === '/insights-operacionais') return ROUTES.insights;
  if (p === '/hub-de-artefatos') return ROUTES.initial;
  if (p.startsWith('/hub-de-artefatos/')) {
    const rest = p.slice('/hub-de-artefatos'.length);
    if (rest === '/insights/resumo-executivo' || rest === '/insights-operacionais') return ROUTES.insights;
    return viewFromPath(rest) ? rest : ROUTES.initial;
  }
  return null;
}
