/**
 * Utilitários e padronização oficial dos 5 status de telas do Omni.
 * Regra estrita:
 * 1. VALIDADO: verde
 * 2. CORREÇÃO: vermelho
 * 3. NOVO: amarelo
 * 4. EXCLUIR: cinza
 * 5. DESCONTINUAR: azul
 *
 * Não criar novos valores.
 * Não inferir status por cor.
 * Não permitir "Sem status" como categoria de negócio.
 */

export type OfficialStatus = 'VALIDADO' | 'CORREÇÃO' | 'NOVO' | 'EXCLUIR' | 'DESCONTINUAR';

export const OFFICIAL_STATUSES: readonly OfficialStatus[] = [
  'VALIDADO',
  'CORREÇÃO',
  'NOVO',
  'EXCLUIR',
  'DESCONTINUAR'
] as const;

/**
 * Normaliza qualquer texto de status para um dos 5 valores oficiais.
 * - remove espaços extras e quebras de linha
 * - converte para maiúsculas
 * - aceita diferença de acentuação somente para reconhecer CORREÇÃO (ex: CORRECAO -> CORREÇÃO)
 * - retorna null se o valor não corresponder exatamente a um dos 5 status oficiais
 */
export function normalizarStatus(raw: string | null | undefined): OfficialStatus | null {
  if (!raw || typeof raw !== 'string') return null;
  const clean = raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!clean) return null;

  if (clean === 'VALIDADO') return 'VALIDADO';
  if (clean === 'CORREÇÃO' || clean === 'CORRECAO') return 'CORREÇÃO';
  if (clean === 'NOVO') return 'NOVO';
  if (clean === 'EXCLUIR') return 'EXCLUIR';
  if (clean === 'DESCONTINUAR') return 'DESCONTINUAR';

  return null;
}

export interface StatusStyleConfig {
  status: OfficialStatus;
  label: string;
  bg: string;
  text: string;
  border: string;
  badgeBg: string;
  hex: string;
  chartColor: string;
}

export const STATUS_CONFIGS: Record<OfficialStatus, StatusStyleConfig> = {
  VALIDADO: {
    status: 'VALIDADO',
    label: 'Validado',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
    badgeBg: 'bg-emerald-500',
    hex: '#10b981',
    chartColor: '#10b981'
  },
  'CORREÇÃO': {
    status: 'CORREÇÃO',
    label: 'Correção',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-200 dark:border-rose-800',
    badgeBg: 'bg-rose-500',
    hex: '#ef4444',
    chartColor: '#ef4444'
  },
  NOVO: {
    status: 'NOVO',
    label: 'Novo',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-800 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
    badgeBg: 'bg-amber-500',
    hex: '#f59e0b',
    chartColor: '#f59e0b'
  },
  EXCLUIR: {
    status: 'EXCLUIR',
    label: 'Excluir',
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-300 dark:border-slate-700',
    badgeBg: 'bg-slate-400',
    hex: '#94a3b8',
    chartColor: '#94a3b8'
  },
  DESCONTINUAR: {
    status: 'DESCONTINUAR',
    label: 'Descontinuar',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
    badgeBg: 'bg-blue-500',
    hex: '#3b82f6',
    chartColor: '#3b82f6'
  }
};

export function getStatusStyle(raw: string | null | undefined): StatusStyleConfig {
  const norm = normalizarStatus(raw);
  if (norm && STATUS_CONFIGS[norm]) {
    return STATUS_CONFIGS[norm];
  }
  // Fallback neutro estrito para visualização de diagnóstico se houver falha de extração
  return {
    status: 'VALIDADO',
    label: raw || 'Não reconhecido',
    bg: 'bg-gray-100 dark:bg-slate-800',
    text: 'text-gray-600 dark:text-slate-400',
    border: 'border-gray-300 dark:border-slate-700',
    badgeBg: 'bg-gray-400',
    hex: '#64748b',
    chartColor: '#64748b'
  };
}
