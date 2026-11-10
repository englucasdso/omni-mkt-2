import { Artifact } from '../../types';
import { isMap, isDocumentation } from '../artifacts';

/**
 * Idade da documentação: há quanto tempo cada mapa/documentação foi atualizado no Confluence.
 * Fonte única para o Insights e para a exportação (substitui os "Insights operacionais").
 */

export type FreshnessBucketId = 'ATE_30' | 'DE_31_A_90' | 'DE_91_A_180' | 'ACIMA_180' | 'SEM_DATA';

export interface FreshnessBucket {
  id: FreshnessBucketId;
  label: string;
  count: number;
  percent: number;
  colorClass: string;
}

export const FRESHNESS_BUCKETS: ReadonlyArray<{ id: FreshnessBucketId; label: string; colorClass: string }> = [
  { id: 'ATE_30', label: 'Últimos 30 dias', colorClass: 'bg-emerald-500' },
  { id: 'DE_31_A_90', label: '31 a 90 dias', colorClass: 'bg-sky-500' },
  { id: 'DE_91_A_180', label: '91 a 180 dias', colorClass: 'bg-amber-500' },
  { id: 'ACIMA_180', label: 'Mais de 180 dias', colorClass: 'bg-rose-500' },
  { id: 'SEM_DATA', label: 'Sem data', colorClass: 'bg-gray-300' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseUpdateDate(artifact: Pick<Artifact, 'ultima_atualizacao'>): Date | null {
  const raw = artifact?.ultima_atualizacao;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysSinceUpdate(artifact: Pick<Artifact, 'ultima_atualizacao'>, now: Date = new Date()): number | null {
  const d = parseUpdateDate(artifact);
  if (!d) return null;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY_MS));
}

export function getFreshnessBucketId(days: number | null): FreshnessBucketId {
  if (days === null) return 'SEM_DATA';
  if (days <= 30) return 'ATE_30';
  if (days <= 90) return 'DE_31_A_90';
  if (days <= 180) return 'DE_91_A_180';
  return 'ACIMA_180';
}

export function getFreshnessLabel(days: number | null): string {
  const id = getFreshnessBucketId(days);
  return FRESHNESS_BUCKETS.find((b) => b.id === id)!.label;
}

/** Só conta conteúdo documental real (mapas e documentações), nunca raiz ou nós estruturais. */
const isDocumentedArtifact = (a: Artifact) => isMap(a) || isDocumentation(a);

export function getDocumentationFreshness(artifacts: Artifact[], now: Date = new Date()) {
  const items = (artifacts || []).filter(isDocumentedArtifact);
  const counts: Record<FreshnessBucketId, number> = {
    ATE_30: 0, DE_31_A_90: 0, DE_91_A_180: 0, ACIMA_180: 0, SEM_DATA: 0,
  };
  for (const a of items) counts[getFreshnessBucketId(daysSinceUpdate(a, now))]++;

  const total = items.length;
  const buckets: FreshnessBucket[] = FRESHNESS_BUCKETS.map((b) => ({
    ...b,
    count: counts[b.id],
    percent: total > 0 ? Math.round((counts[b.id] / total) * 100) : 0,
  }));

  const recent = items
    .map((artifact) => ({ artifact, date: parseUpdateDate(artifact) }))
    .filter((x): x is { artifact: Artifact; date: Date } => x.date !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 8);

  return { total, buckets, recent };
}
