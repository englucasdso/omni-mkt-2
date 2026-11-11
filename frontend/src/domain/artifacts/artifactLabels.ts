import { ArtifactType } from '../../types';

export interface ArtifactTypeConfig {
  type: ArtifactType;
  label: string;
  pluralLabel: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  badgeClasses: string;
  /** Cor da série em gráficos (mesma família do selo) */
  hex: string;
}

export const ARTIFACT_TYPE_CONFIGS: Record<ArtifactType, ArtifactTypeConfig> = {
  MAPA: {
    type: 'MAPA',
    label: 'Mapa',
    pluralLabel: 'Mapas',
    description: 'Mapa de mensuração e tagueamento com telas e disparos.',
    badgeBg: 'bg-red-50 dark:bg-red-950/40',
    badgeText: 'text-[#E30328] dark:text-red-400',
    badgeBorder: 'border-red-200 dark:border-red-800/60',
    badgeClasses: 'bg-red-50 text-[#E30328] border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/60',
    hex: '#E30328'
  },
  DOCUMENTACAO: {
    type: 'DOCUMENTACAO',
    label: 'Documentação',
    pluralLabel: 'Documentações',
    description: 'Documentação técnica, manuais de tagging e regras analíticas.',
    badgeBg: 'bg-slate-100 dark:bg-slate-800',
    badgeText: 'text-slate-700 dark:text-slate-300',
    badgeBorder: 'border-slate-300 dark:border-slate-700',
    badgeClasses: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    hex: '#475569'
  },
  NO: {
    type: 'NO',
    label: 'Nó',
    pluralLabel: 'Nós',
    description: 'Nó estrutural de agrupamento na taxonomia (produto ou subproduto).',
    badgeBg: 'bg-gray-100 dark:bg-slate-800',
    badgeText: 'text-gray-600 dark:text-slate-400',
    badgeBorder: 'border-gray-300 dark:border-slate-700',
    badgeClasses: 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    hex: '#94a3b8'
  },
  RAIZ: {
    type: 'RAIZ',
    label: 'Raiz',
    pluralLabel: 'Raízes',
    description: 'Página raiz da árvore no Confluence.',
    badgeBg: 'bg-indigo-50 dark:bg-indigo-950/40',
    badgeText: 'text-indigo-700 dark:text-indigo-300',
    badgeBorder: 'border-indigo-200 dark:border-indigo-800',
    badgeClasses: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
    hex: '#6366f1'
  },
  NAO_CLASSIFICADO: {
    type: 'NAO_CLASSIFICADO',
    label: 'Não classificado',
    pluralLabel: 'Não classificados',
    description: 'Artefato com estrutura não identificada ou pendente de varredura.',
    badgeBg: 'bg-amber-50 dark:bg-amber-950/40',
    badgeText: 'text-amber-800 dark:text-amber-300',
    badgeBorder: 'border-amber-200 dark:border-amber-800',
    badgeClasses: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    hex: '#d97706'
  }
};

export function getArtifactTypeConfig(type?: string | null): ArtifactTypeConfig {
  const norm = String(type || '').trim().toUpperCase();
  if (norm === 'MAPA') return ARTIFACT_TYPE_CONFIGS.MAPA;
  if (norm === 'DOCUMENTACAO' || norm === 'DOC' || norm === 'DOCUMENTO') return ARTIFACT_TYPE_CONFIGS.DOCUMENTACAO;
  if (norm === 'NO' || norm === 'NÓ') return ARTIFACT_TYPE_CONFIGS.NO;
  if (norm === 'RAIZ') return ARTIFACT_TYPE_CONFIGS.RAIZ;
  return ARTIFACT_TYPE_CONFIGS.NAO_CLASSIFICADO;
}

export function getArtifactTypeLabel(type?: string | null): string {
  return getArtifactTypeConfig(type).label;
}
