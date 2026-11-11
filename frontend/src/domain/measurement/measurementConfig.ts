import { MeasurementClass } from '../../types';

export interface MeasurementConfig {
  value: MeasurementClass;
  label: string;
  shortLabel: string;
  description: string;
  badgeClasses: string;
  /** Cor da série em gráficos (mesma família do selo) */
  hex: string;
  order: number;
}

export const MEASUREMENT_CONFIGS: Record<MeasurementClass, MeasurementConfig> = {
  GA4: {
    value: 'GA4',
    label: 'GA4',
    shortLabel: 'GA4',
    description: 'Padrão moderno Google Analytics 4 (dataLayer compatível).',
    badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    hex: '#10b981',
    order: 1
  },
  GA3: {
    value: 'GA3',
    label: 'Universal Analytics (GA3)',
    shortLabel: 'Universal Analytics (GA3)',
    description: 'Padrão legado Universal Analytics.',
    badgeClasses: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
    hex: '#3b82f6',
    order: 2
  },
  HIBRIDO: {
    value: 'HIBRIDO',
    label: 'Híbrido',
    shortLabel: 'Híbrido',
    description: 'Coexistência de mensuração GA4 e Universal Analytics.',
    badgeClasses: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
    hex: '#a855f7',
    order: 3
  },
  NAO_CLASSIFICADO: {
    value: 'NAO_CLASSIFICADO',
    label: 'Não classificado',
    shortLabel: 'Não classificado',
    description: 'Sem assinatura ou evidência técnica conclusiva de mensuração.',
    badgeClasses: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    hex: '#94a3b8',
    order: 4
  }
};

export const ORDERED_MEASUREMENT_CLASSES: MeasurementClass[] = ['GA4', 'GA3', 'HIBRIDO', 'NAO_CLASSIFICADO'];
