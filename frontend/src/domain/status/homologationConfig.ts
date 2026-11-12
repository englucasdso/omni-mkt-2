/**
 * Fonte única dos estados de homologação de um mapa (blueprint, seção 7):
 * todas as telas validadas → HOMOLOGADO; parte validada → PARCIAL; nenhuma → NAO_HOMOLOGADO.
 * Sem telas reconhecidas, a homologação não é calculável.
 */
export type HomologationStatus = 'HOMOLOGADO' | 'PARCIAL' | 'NAO_HOMOLOGADO' | 'NAO_CALCULAVEL';

export interface HomologationConfig {
  status: HomologationStatus;
  label: string;
  badgeClasses: string;
  barClass: string;
  textClass: string;
}

export const HOMOLOGATION_CONFIGS: Record<HomologationStatus, HomologationConfig> = {
  HOMOLOGADO: {
    status: 'HOMOLOGADO',
    label: 'Homologado',
    badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    barClass: 'bg-emerald-500',
    textClass: 'text-emerald-700 dark:text-emerald-400',
  },
  PARCIAL: {
    status: 'PARCIAL',
    label: 'Parcial',
    badgeClasses: 'bg-yellow-50 text-yellow-800 border-yellow-300 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800',
    barClass: 'bg-yellow-400',
    textClass: 'text-yellow-700 dark:text-yellow-400',
  },
  NAO_HOMOLOGADO: {
    status: 'NAO_HOMOLOGADO',
    label: 'Não homologado',
    badgeClasses: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    barClass: 'bg-gray-400',
    textClass: 'text-gray-600 dark:text-slate-400',
  },
  NAO_CALCULAVEL: {
    status: 'NAO_CALCULAVEL',
    label: 'Sem telas reconhecidas',
    badgeClasses: 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-slate-900 dark:text-slate-500 dark:border-slate-700',
    barClass: 'bg-gray-200',
    textClass: 'text-gray-500 dark:text-slate-500',
  },
};

/** Rótulo padrão: "Parcial 67%", "Homologado 100%", "Não homologado 0%". */
export function formatHomologation(status: HomologationStatus, percentage: number | null): string {
  const { label } = HOMOLOGATION_CONFIGS[status];
  if (status === 'NAO_CALCULAVEL' || percentage === null) return label;
  return `${label} ${percentage}%`;
}
