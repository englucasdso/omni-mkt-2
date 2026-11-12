import { MeasurementClass } from '../../types';

export interface MeasurementConfig {
  value: MeasurementClass;
  label: string;
  shortLabel: string;
  description: string;
  badgeClasses: string;
  /** Cor da série em gráficos (mesma família do selo). Laranja e violeta são exclusivos da mensuração. */
  hex: string;
  order: number;
}

export const MEASUREMENT_CONFIGS: Record<MeasurementClass, MeasurementConfig> = {
  GA4: {
    value: 'GA4',
    label: 'GA4',
    shortLabel: 'GA4',
    description: 'Padrão moderno Google Analytics 4 (dataLayer compatível).',
    badgeClasses: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',
    hex: '#ea580c',
    order: 1
  },
  GA3: {
    value: 'GA3',
    label: 'Universal Analytics (GA3)',
    shortLabel: 'Universal Analytics (GA3)',
    description: 'Padrão legado Universal Analytics.',
    badgeClasses: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800',
    hex: '#7c3aed',
    order: 2
  },
  HIBRIDO: {
    value: 'HIBRIDO',
    label: 'Híbrido',
    shortLabel: 'Híbrido',
    description: 'Coexistência de mensuração GA4 e Universal Analytics.',
    badgeClasses: 'bg-orange-50 text-violet-700 border-violet-300 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800',
    hex: '#ea580c',
    order: 3
  },
  NAO_CLASSIFICADO: {
    value: 'NAO_CLASSIFICADO',
    label: 'Não classificado',
    shortLabel: 'Não classificado',
    description: 'Sem assinatura ou evidência técnica conclusiva de mensuração.',
    badgeClasses: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    hex: '#cbd5e1',
    order: 4
  }
};

export const ORDERED_MEASUREMENT_CLASSES: MeasurementClass[] = ['GA4', 'GA3', 'HIBRIDO', 'NAO_CLASSIFICADO'];
