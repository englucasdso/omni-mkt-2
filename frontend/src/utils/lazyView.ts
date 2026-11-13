import { lazy, type ComponentType } from 'react';

/**
 * Telas carregadas sob demanda: o navegador baixa primeiro só o necessário para a
 * busca e os cards. O resto vem logo depois, em segundo plano (preloadLazyViews),
 * para que abrir uma aba continue instantâneo.
 */
const loaders: Array<() => Promise<unknown>> = [];

export function lazyView<T extends ComponentType<any>>(load: () => Promise<T>) {
  loaders.push(load);
  return lazy(async () => ({ default: await load() }));
}

/** Baixa as telas restantes quando o navegador estiver livre */
export function preloadLazyViews() {
  const run = () => loaders.forEach((load) => load().catch(() => undefined));
  const idle = (window as any).requestIdleCallback as ((cb: () => void, o?: { timeout: number }) => void) | undefined;
  if (idle) idle(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}
