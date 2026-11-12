/**
 * Filtros da tela de Cards, no mesmo formato do Inventário: listas de seleção
 * múltipla com contagem. Dentro de um filtro vale qualquer opção marcada (OU);
 * entre filtros diferentes valem todos (E).
 *
 * Homologação, status das telas, mensuração e divergência só existem em mapas:
 * com qualquer um deles ativo, a lista mostra só mapas.
 */
import { Artifact } from '../../types';
import { isMap, isDocumentation, isNode } from '../artifacts';
import { resolveMeasurementClass, MEASUREMENT_CONFIGS } from '../measurement';
import { getMapStatusMetrics, HOMOLOGATION_CONFIGS, STATUS_CONFIGS } from '../status';

export interface CardFilters {
  tipo: string[];
  homologacao: string[];
  statusTela: string[];
  mensuracao: string[];
  produto: string[];
  responsavel: string[];
  ano: string[];
  divergente: boolean;
}

export const EMPTY_CARD_FILTERS: CardFilters = {
  tipo: [],
  homologacao: [],
  statusTela: [],
  mensuracao: [],
  produto: [],
  responsavel: [],
  ano: [],
  divergente: false,
};

export function countCardFilters(f: CardFilters): number {
  return (
    (f.tipo.length ? 1 : 0) +
    (f.homologacao.length ? 1 : 0) +
    (f.statusTela.length ? 1 : 0) +
    (f.mensuracao.length ? 1 : 0) +
    (f.produto.length ? 1 : 0) +
    (f.responsavel.length ? 1 : 0) +
    (f.ano.length ? 1 : 0) +
    (f.divergente ? 1 : 0)
  );
}

const SCREEN_STATUS_KEYS = ['CORREÇÃO', 'NOVO', 'EXCLUIR', 'DESCONTINUAR'] as const;
const HOMOLOGATION_KEYS = ['HOMOLOGADO', 'PARCIAL', 'NAO_HOMOLOGADO', 'NAO_CALCULAVEL'] as const;
const MEASUREMENT_KEYS = ['GA4', 'GA3', 'HIBRIDO'] as const;

function artifactType(a: Artifact): string {
  if (isMap(a)) return 'MAPA';
  if (isDocumentation(a)) return 'DOCUMENTACAO';
  if (isNode(a)) return 'NO';
  return 'OUTRO';
}

function yearOf(a: Artifact): string | null {
  if (!a.ultima_atualizacao) return null;
  const d = new Date(a.ultima_atualizacao);
  return isNaN(d.getTime()) ? null : String(d.getFullYear());
}

function screenStatusCount(a: Artifact, status: string): number {
  const m = getMapStatusMetrics(a);
  return ({ 'CORREÇÃO': m.correction, NOVO: m.new, EXCLUIR: m.exclude, DESCONTINUAR: m.discontinue } as Record<string, number>)[status] || 0;
}

export function matchesCardFilters(a: Artifact, f: CardFilters): boolean {
  if (f.tipo.length && !f.tipo.includes(artifactType(a))) return false;
  if (f.produto.length && !f.produto.includes((a.produto || '').trim())) return false;
  if (f.responsavel.length && !f.responsavel.includes((a.responsavel || '').trim())) return false;
  if (f.ano.length) {
    const y = yearOf(a);
    if (!y || !f.ano.includes(y)) return false;
  }

  const needsMap = f.homologacao.length || f.statusTela.length || f.mensuracao.length || f.divergente;
  if (needsMap) {
    if (!isMap(a)) return false;
    if (f.divergente && !a.status_divergent) return false;
    if (f.mensuracao.length && !f.mensuracao.includes(resolveMeasurementClass(a))) return false;
    if (f.homologacao.length && !f.homologacao.includes(getMapStatusMetrics(a).homologationStatus)) return false;
    if (f.statusTela.length && !f.statusTela.some((s) => screenStatusCount(a, s) > 0)) return false;
  }
  return true;
}

export interface CardFilterOptions {
  tipo: { v: string; l: string }[];
  homologacao: { v: string; l: string }[];
  statusTela: { v: string; l: string }[];
  mensuracao: { v: string; l: string }[];
  produto: { v: string; l: string }[];
  responsavel: { v: string; l: string }[];
  ano: { v: string; l: string }[];
}

/** Opções com contagem, calculadas sobre o conjunto exibido nos Cards. */
export function buildCardFilterOptions(items: Artifact[]): CardFilterOptions {
  const count = (map: Map<string, number>, key: string | null | undefined) => {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  };
  const tipo = new Map<string, number>();
  const homolog = new Map<string, number>();
  const status = new Map<string, number>();
  const measure = new Map<string, number>();
  const produto = new Map<string, number>();
  const resp = new Map<string, number>();
  const ano = new Map<string, number>();

  for (const a of items) {
    count(tipo, artifactType(a));
    count(produto, (a.produto || '').trim());
    const r = (a.responsavel || '').trim();
    if (r && r !== 'N/A' && r !== '-' && r !== 'Não informado') count(resp, r);
    count(ano, yearOf(a));
    if (isMap(a)) {
      count(homolog, getMapStatusMetrics(a).homologationStatus);
      count(measure, resolveMeasurementClass(a));
      for (const s of SCREEN_STATUS_KEYS) if (screenStatusCount(a, s) > 0) count(status, s);
    }
  }

  const withCount = (label: string, n = 0) => `${label} (${n})`;
  const sorted = (m: Map<string, number>) => Array.from(m.keys()).sort((x, y) => x.localeCompare(y, 'pt-BR'));

  return {
    tipo: [
      { v: 'MAPA', l: withCount('Mapas', tipo.get('MAPA')) },
      { v: 'DOCUMENTACAO', l: withCount('Documentações', tipo.get('DOCUMENTACAO')) },
      { v: 'NO', l: withCount('Nós', tipo.get('NO')) },
    ],
    homologacao: HOMOLOGATION_KEYS.filter((k) => k !== 'NAO_CALCULAVEL' || homolog.get(k)).map((k) => ({
      v: k,
      l: withCount(HOMOLOGATION_CONFIGS[k].label, homolog.get(k)),
    })),
    statusTela: SCREEN_STATUS_KEYS.map((k) => ({ v: k, l: withCount(STATUS_CONFIGS[k].label, status.get(k)) })),
    mensuracao: MEASUREMENT_KEYS.map((k) => ({ v: k, l: withCount(MEASUREMENT_CONFIGS[k].label, measure.get(k)) })),
    produto: sorted(produto).map((p) => ({ v: p, l: withCount(p, produto.get(p)) })),
    responsavel: sorted(resp).map((r) => ({ v: r, l: withCount(r, resp.get(r)) })),
    ano: Array.from(ano.keys())
      .sort((x, y) => Number(y) - Number(x))
      .map((y) => ({ v: y, l: withCount(y, ano.get(y)) })),
  };
}
