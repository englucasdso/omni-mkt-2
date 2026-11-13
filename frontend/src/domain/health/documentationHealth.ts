/**
 * Saúde da documentação: mapas que pararam no meio do caminho.
 *
 * Usa só o que o OMNI já lê do Confluence: o status de cada tela e a data da
 * última atualização do mapa. Nenhum dado de coleta (GA4, AppsFlyer, BQ).
 */
import { Artifact } from '../../types';
import { isMap } from '../artifacts/artifactSelectors';
import { getMapStatusMetrics } from '../status';
import { daysSinceUpdate } from '../metrics/documentationFreshness';

export interface HealthThresholds {
  /** Dias sem atualizar para um mapa com telas pendentes ser considerado parado */
  staleDays: number;
  /** Dias sem atualizar para um mapa sem nenhuma tela validada virar desperdício */
  wasteDays: number;
}

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = { staleDays: 90, wasteDays: 180 };

/**
 * DESPERDICIO: nenhuma tela validada, telas em Novo, parado além do limite de desperdício.
 *   O mapa foi pedido e criado, mas a homologação nunca aconteceu.
 * CORRECAO_ESQUECIDA: telas em Correção num mapa parado.
 * PARADO: outras telas pendentes (Novo) num mapa parado.
 */
export type HealthKind = 'DESPERDICIO' | 'CORRECAO_ESQUECIDA' | 'PARADO';

export const HEALTH_KIND_LABEL: Record<HealthKind, string> = {
  DESPERDICIO: 'Desperdício',
  CORRECAO_ESQUECIDA: 'Correção esquecida',
  PARADO: 'Parado',
};

export interface HealthItem {
  artifact: Artifact;
  id: string;
  title: string;
  produto: string;
  subproduto: string;
  responsavel: string;
  days: number;
  totalScreens: number;
  validated: number;
  novo: number;
  correcao: number;
  /** Classificação principal (a mais grave) */
  kind: HealthKind;
}

export interface HealthGroup {
  name: string;
  ids: string[];
  screens: number;
}

export interface AgeBucket {
  id: string;
  label: string;
  ids: string[];
}

export interface HealthReport {
  /** Mapas com telas e com data (os que dá para avaliar) */
  evaluated: number;
  /** Mapas com telas sem data de atualização (não entram na análise) */
  withoutDate: number;
  items: HealthItem[];
  byKind: Record<HealthKind, { ids: string[]; screens: number }>;
  /** Telas de mapas em desperdício: o trabalho que ficou sem uso */
  wasteScreens: number;
  wasteByProduct: HealthGroup[];
  wasteByOwner: HealthGroup[];
  wasteAge: AgeBucket[];
}

const clean = (v: unknown, fallback: string) => {
  const s = String(v ?? '').trim();
  return !s || /^[-—–]+$/.test(s) ? fallback : s;
};

function groupBy(items: HealthItem[], key: (i: HealthItem) => string): HealthGroup[] {
  const map = new Map<string, HealthGroup>();
  for (const it of items) {
    const name = key(it);
    const g = map.get(name) || { name, ids: [], screens: 0 };
    g.ids.push(it.id);
    g.screens += it.totalScreens;
    map.set(name, g);
  }
  return Array.from(map.values()).sort((a, b) => b.ids.length - a.ids.length || b.screens - a.screens);
}

export function analyzeDocumentationHealth(
  artifacts: Artifact[],
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
  now: Date = new Date()
): HealthReport {
  const items: HealthItem[] = [];
  let evaluated = 0;
  let withoutDate = 0;

  for (const art of artifacts || []) {
    if (!isMap(art) || art.artifact_type !== 'MAPA') continue;
    const m = getMapStatusMetrics(art);
    if (!m.hasScreens) continue;
    const days = daysSinceUpdate(art, now);
    if (days === null) {
      withoutDate++;
      continue;
    }
    evaluated++;

    let kind: HealthKind | null = null;
    if (m.validated === 0 && m.new > 0 && days >= thresholds.wasteDays) kind = 'DESPERDICIO';
    else if (m.correction > 0 && days >= thresholds.staleDays) kind = 'CORRECAO_ESQUECIDA';
    else if (m.new > 0 && days >= thresholds.staleDays) kind = 'PARADO';
    if (!kind) continue;

    items.push({
      artifact: art,
      id: String(art.id),
      title: clean(art.titulo, String(art.id)),
      produto: clean(art.produto, 'Sem produto'),
      subproduto: clean(art.subproduto, 'Sem subproduto'),
      responsavel: clean(art.responsavel, 'Sem responsável'),
      days,
      totalScreens: m.totalScreens,
      validated: m.validated,
      novo: m.new,
      correcao: m.correction,
      kind,
    });
  }

  items.sort((a, b) => b.days - a.days || b.totalScreens - a.totalScreens);

  const byKind: HealthReport['byKind'] = {
    DESPERDICIO: { ids: [], screens: 0 },
    CORRECAO_ESQUECIDA: { ids: [], screens: 0 },
    PARADO: { ids: [], screens: 0 },
  };
  for (const it of items) {
    byKind[it.kind].ids.push(it.id);
    // Telas que esperam ação: Novo + Correção (no desperdício, todas as telas do mapa)
    byKind[it.kind].screens += it.kind === 'DESPERDICIO' ? it.totalScreens : it.novo + it.correcao;
  }

  const waste = items.filter((i) => i.kind === 'DESPERDICIO');
  const ageDefs: Array<{ id: string; label: string; test: (d: number) => boolean }> = [
    { id: 'ate1', label: 'Até 1 ano', test: (d) => d < 365 },
    { id: '1a2', label: '1 a 2 anos', test: (d) => d >= 365 && d < 730 },
    { id: '2a3', label: '2 a 3 anos', test: (d) => d >= 730 && d < 1095 },
    { id: 'mais3', label: 'Mais de 3 anos', test: (d) => d >= 1095 },
  ];

  return {
    evaluated,
    withoutDate,
    items,
    byKind,
    wasteScreens: byKind.DESPERDICIO.screens,
    wasteByProduct: groupBy(waste, (i) => i.produto),
    wasteByOwner: groupBy(waste, (i) => i.responsavel),
    wasteAge: ageDefs.map((b) => ({ id: b.id, label: b.label, ids: waste.filter((w) => b.test(w.days)).map((w) => w.id) })),
  };
}

/** "3 anos e 2 meses", "8 meses", "45 dias" */
export function formatAge(days: number): string {
  if (days < 60) return `${days} dias`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} meses`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = `${years} ${years === 1 ? 'ano' : 'anos'}`;
  return rest ? `${y} e ${rest} ${rest === 1 ? 'mês' : 'meses'}` : y;
}
