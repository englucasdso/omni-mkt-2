import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  GitCompareArrows,
  RefreshCcw,
  FileWarning,
  Wrench,
  SpellCheck,
  LayoutList,
  Table2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Artifact } from '../types';
import { PageHeader } from './PageHeader';
import { normalizarStatus, OfficialStatus } from '../utils/statusUtils';
import { isMap } from '../domain/artifacts/artifactSelectors';
import { ARTIFACT_TYPE_CONFIGS } from '../domain/artifacts/artifactLabels';
import { resolveMeasurementClass } from '../domain/measurement/measurementResolver';
import { MEASUREMENT_CONFIGS, ORDERED_MEASUREMENT_CLASSES } from '../domain/measurement/measurementConfig';
import { STATUS_CONFIGS, getMapStatusMetrics, HOMOLOGATION_CONFIGS, HomologationStatus } from '../domain/status';
import { getDocumentationFreshness, daysSinceUpdate, getFreshnessBucketId } from '../domain/metrics/documentationFreshness';
import { findValueIssuesByParameter } from '../domain/quality/valueQuality';
import { StatusDistribution } from './badges/StatusDistribution';
import { formatDataBR } from '../utils/helpers';

export type DrillTarget = 'cards' | 'inventario';

interface CanonicalInsightsDashboardProps {
  artifacts: Artifact[];
  onOpenMap: (map: Artifact) => void;
  onFilterByProduct: (produto: string) => void;
  /** Abre os artefatos de um número do painel nos Cards ou no Inventário */
  onDrillDown?: (label: string, ids: string[], target: DrillTarget) => void;
  selectedProductFilter?: string;
  onProductFilterChange?: (val: string) => void;
  selectedSubprodutoFilter?: string;
  onSubprodutoFilterChange?: (val: string) => void;
  selectedMeasurementFilter?: string;
  onMeasurementFilterChange?: (val: string) => void;
}

/** Cor neutra para rankings (eventos, parâmetros, produtos por mapas). */
const NEUTRAL_BAR = '#64748b';
const HOMOLOGATION_HEX: Record<HomologationStatus, string> = {
  HOMOLOGADO: STATUS_CONFIGS.VALIDADO.hex,
  PARCIAL: STATUS_CONFIGS.NOVO.hex,
  NAO_HOMOLOGADO: STATUS_CONFIGS.EXCLUIR.hex,
  NAO_CALCULAVEL: '#d1d5db',
};

const fmt = (n: number) => n.toLocaleString('pt-BR');
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);
const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;

// --- Menu "abrir em" ------------------------------------------------------------

interface DrillRequest {
  label: string;
  ids: string[];
  x: number;
  y: number;
}

const DrillMenu: React.FC<{
  request: DrillRequest | null;
  onClose: () => void;
  onPick: (target: DrillTarget) => void;
}> = ({ request, onClose, onPick }) => {
  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, onClose]);
  if (!request) return null;
  const left = Math.min(request.x, window.innerWidth - 248);
  const top = Math.min(request.y + 8, window.innerHeight - 140);
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div role="menu" className="fixed z-50 w-60 rounded-xl border border-omni-line bg-white shadow-lg p-1.5" style={{ left, top }}>
        <p className="px-2.5 pt-1.5 pb-2 text-[11px] text-omni-muted leading-snug">
          {request.label} | {plural(request.ids.length, 'artefato', 'artefatos')}
        </p>
        {(
          [
            ['cards', 'Ver nos Cards', LayoutList],
            ['inventario', 'Ver no Inventário', Table2],
          ] as const
        ).map(([target, text, Icon]) => (
          <button
            key={target}
            type="button"
            role="menuitem"
            onClick={() => onPick(target)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-omni-ink hover:bg-omni-mist cursor-pointer"
          >
            <Icon className="w-3.5 h-3.5 text-omni-bordo" />
            {text}
          </button>
        ))}
      </div>
    </>
  );
};

// --- Peças visuais ------------------------------------------------------------------

interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
  ids?: string[];
}

type Drill = (label: string, ids: string[] | undefined, e: React.MouseEvent) => void;

/** Barra 100% empilhada; cada item da legenda abre os artefatos daquele pedaço. */
const StackedBar: React.FC<{ segments: Segment[]; total: number; unit: string; context: string; onDrill?: Drill }> = ({
  segments,
  total,
  unit,
  context,
  onDrill,
}) => (
  <div className="space-y-3">
    <div className="flex h-3 w-full rounded-full overflow-hidden bg-gray-100 gap-[2px]">
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <div
            key={s.key}
            style={{ width: `${(s.value / Math.max(total, 1)) * 100}%`, background: s.color }}
            className="h-full"
            title={`${s.label}: ${fmt(s.value)} ${unit} (${pct(s.value, total)}%)`}
          />
        ))}
    </div>
    <ul className="flex flex-wrap gap-x-2 gap-y-1">
      {segments.map((s) => {
        const clickable = Boolean(onDrill && s.ids && s.ids.length > 0);
        return (
          <li key={s.key}>
            <button
              type="button"
              disabled={!clickable}
              onClick={(e) => onDrill?.(`${context}: ${s.label}`, s.ids, e)}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 -mx-0.5 rounded-md ${
                clickable ? 'hover:bg-omni-mist cursor-pointer' : 'cursor-default'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} aria-hidden="true" />
              <span className="text-omni-ink-secondary">{s.label}</span>
              <span className="font-semibold text-omni-ink tabular-nums">{fmt(s.value)}</span>
              <span className="text-omni-muted tabular-nums">({pct(s.value, total)}%)</span>
            </button>
          </li>
        );
      })}
    </ul>
  </div>
);

interface HBarRow {
  key: string;
  label: string;
  value: number;
  display: string;
  detail?: string;
  ids?: string[];
}

const HBars: React.FC<{
  rows: HBarRow[];
  max: number;
  color: string;
  context: string;
  labelClass?: string;
  onDrill?: Drill;
}> = ({ rows, max, color, context, labelClass = 'w-36', onDrill }) => (
  <ul className="space-y-0.5">
    {rows.map((r) => {
      const clickable = Boolean(onDrill && r.ids && r.ids.length > 0);
      return (
        <li key={r.key}>
          <button
            type="button"
            disabled={!clickable}
            onClick={(e) => onDrill?.(`${context}: ${r.label}`, r.ids, e)}
            title={r.detail ? `${r.label}: ${r.display} (${r.detail})` : `${r.label}: ${r.display}`}
            className={`w-full flex items-center gap-3 py-1.5 px-2 -mx-2 rounded-lg text-left ${
              clickable ? 'hover:bg-omni-mist cursor-pointer' : 'cursor-default'
            }`}
          >
            <span className={`${labelClass} shrink-0 text-xs text-omni-ink truncate`}>{r.label}</span>
            <span className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${max > 0 ? Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0) : 0}%`,
                  background: color,
                }}
              />
            </span>
            <span className="w-24 shrink-0 text-right">
              <span className="text-xs font-semibold text-omni-ink tabular-nums">{r.display}</span>
              {r.detail && <span className="block text-[11px] text-omni-muted tabular-nums">{r.detail}</span>}
            </span>
          </button>
        </li>
      );
    })}
  </ul>
);

const Ring: React.FC<{ value: number; color: string }> = ({ value, color }) => {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0" aria-hidden="true">
      <circle cx="44" cy="44" r={r} fill="none" stroke="#f1f1f1" strokeWidth="8" />
      <circle
        cx="44"
        cy="44"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        transform="rotate(-90 44 44)"
      />
      <text x="44" y="49" textAnchor="middle" className="fill-omni-ink" style={{ fontSize: 17, fontWeight: 700 }}>
        {value}%
      </text>
    </svg>
  );
};

const Panel: React.FC<{ title: string; hint?: string; className?: string; children: React.ReactNode }> = ({
  title,
  hint,
  className = '',
  children,
}) => (
  <section className={`panel min-w-0 p-6 space-y-4 ${className}`}>
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-base font-heading font-bold text-omni-ink">{title}</h3>
      {hint && <span className="text-xs text-omni-muted text-right">{hint}</span>}
    </div>
    {children}
  </section>
);

// --- Painel ------------------------------------------------------------------------

export const CanonicalInsightsDashboard: React.FC<CanonicalInsightsDashboardProps> = ({
  artifacts,
  onOpenMap,
  onDrillDown,
  selectedProductFilter,
  selectedSubprodutoFilter,
  selectedMeasurementFilter,
}) => {
  const [productMetric, setProductMetric] = useState<'mapas' | 'homologacao'>('mapas');
  const [drill, setDrill] = useState<DrillRequest | null>(null);

  const effProduct = selectedProductFilter ?? 'all';
  const effSubproduto = selectedSubprodutoFilter ?? 'all';
  const effMeasurement = selectedMeasurementFilter ?? 'all';

  const filtered = useMemo(
    () =>
      artifacts.filter((art) => {
        if (art.artifact_type === 'RAIZ') return false;
        if (effProduct !== 'all' && art.produto !== effProduct) return false;
        if (effSubproduto !== 'all' && (art.subproduto || 'Sem subproduto') !== effSubproduto) return false;
        if (effMeasurement !== 'all' && resolveMeasurementClass(art) !== effMeasurement) return false;
        return true;
      }),
    [artifacts, effProduct, effSubproduto, effMeasurement]
  );

  const stats = useMemo(() => {
    const maps = filtered.filter((a) => isMap(a) && a.artifact_type === 'MAPA');
    const byType: Record<string, string[]> = { MAPA: [], DOCUMENTACAO: [], NO: [], NAO_CLASSIFICADO: [] };
    filtered.forEach((a) => {
      const t = a.artifact_type in byType ? a.artifact_type : 'NAO_CLASSIFICADO';
      byType[t].push(String(a.id));
    });

    const screenStatus: Record<OfficialStatus, number> = { VALIDADO: 0, 'CORREÇÃO': 0, NOVO: 0, EXCLUIR: 0, DESCONTINUAR: 0 };
    const mapsByStatus: Record<OfficialStatus, string[]> = { VALIDADO: [], 'CORREÇÃO': [], NOVO: [], EXCLUIR: [], DESCONTINUAR: [] };
    const byHomologation: Record<HomologationStatus, string[]> = { HOMOLOGADO: [], PARCIAL: [], NAO_HOMOLOGADO: [], NAO_CALCULAVEL: [] };
    const byMeasurement: Record<string, string[]> = { GA4: [], GA3: [], HIBRIDO: [], NAO_CLASSIFICADO: [] };
    const params = new Map<string, { count: number; maps: Set<string> }>();
    const events = new Map<string, { count: number; maps: Set<string> }>();
    const products = new Map<string, { ids: string[]; screens: number; validated: number; correction: number; legacy: number }>();
    const divergentIds: string[] = [];
    const noScreenIds: string[] = [];
    let totalScreens = 0;
    let totalSnippets = 0;
    const screensPerMap: number[] = [];

    maps.forEach((art) => {
      const id = String(art.id);
      const screens = art.screens || [];
      const metrics = getMapStatusMetrics(art);
      byHomologation[metrics.homologationStatus].push(id);
      if (art.status_divergent) divergentIds.push(id);
      if (screens.length === 0) noScreenIds.push(id);
      screensPerMap.push(screens.length);
      const mClass = resolveMeasurementClass(art);
      byMeasurement[mClass].push(id);

      const seenStatus = new Set<OfficialStatus>();
      screens.forEach((sc) => {
        const norm = normalizarStatus(sc.status);
        if (norm) {
          screenStatus[norm]++;
          totalScreens++;
          seenStatus.add(norm);
        }
        (sc.snippets || []).forEach((snip: any) => {
          totalSnippets++;
          const evt = String(snip.event_raw || snip.event_normalized || '').trim();
          if (!evt) return;
          const e = events.get(evt) || { count: 0, maps: new Set<string>() };
          e.count++;
          e.maps.add(id);
          events.set(evt, e);
        });
      });
      seenStatus.forEach((st) => mapsByStatus[st].push(id));

      const pName = art.produto || 'Sem produto';
      const p = products.get(pName) || { ids: [], screens: 0, validated: 0, correction: 0, legacy: 0 };
      p.ids.push(id);
      p.screens += screens.length;
      p.validated += metrics.validated;
      p.correction += metrics.correction;
      if (mClass === 'GA3' || mClass === 'HIBRIDO') p.legacy++;
      products.set(pName, p);

      (art.parameter_summary || []).forEach((ps) => {
        const cur = params.get(ps.name) || { count: 0, maps: new Set<string>() };
        cur.count += ps.occurrences;
        cur.maps.add(id);
        params.set(ps.name, cur);
      });
    });

    // Possíveis erros de digitação e os mapas onde aparecem
    const valueIssues = findValueIssuesByParameter(maps);
    let suspiciousValues = 0;
    valueIssues.forEach((m) => (suspiciousValues += m.size));
    const typoMapIds = new Set<string>();
    if (valueIssues.size > 0) {
      maps.forEach((art) => {
        for (const sc of art.screens || []) {
          for (const snip of sc.snippets || []) {
            for (const p of (snip as any).parameters || []) {
              const v = String(p.normalized_value ?? p.value ?? '').trim();
              if (valueIssues.get(p.name)?.has(v)) typoMapIds.add(String(art.id));
            }
          }
        }
      });
    }
    const topTypoParam = Array.from(valueIssues.entries()).sort((a, b) => b[1].size - a[1].size)[0];

    screensPerMap.sort((a, b) => a - b);
    const productList = Array.from(products.entries()).map(([name, v]) => ({
      name,
      ...v,
      maps: v.ids.length,
      rate: pct(v.validated, v.screens),
    }));

    return {
      byType,
      totalPages: filtered.length,
      totalMaps: maps.length,
      totalScreens,
      totalSnippets,
      screenStatus,
      mapsByStatus,
      byHomologation,
      byMeasurement,
      homologationRate: pct(screenStatus.VALIDADO, totalScreens),
      divergentIds,
      noScreenIds,
      legacyIds: [...byMeasurement.GA3, ...byMeasurement.HIBRIDO],
      medianScreens: screensPerMap.length ? screensPerMap[Math.floor(screensPerMap.length / 2)] : 0,
      topParams: Array.from(params.entries())
        .map(([name, v]) => ({ name, count: v.count, ids: Array.from(v.maps) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      distinctParams: params.size,
      topEvents: Array.from(events.entries())
        .map(([name, v]) => ({ name, count: v.count, ids: Array.from(v.maps) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      distinctEvents: events.size,
      products: productList,
      suspiciousValues,
      suspiciousParams: valueIssues.size,
      typoMapIds: Array.from(typoMapIds),
      topTypoParam: topTypoParam ? { name: topTypoParam[0], size: topTypoParam[1].size } : null,
    };
  }, [filtered]);

  const freshness = useMemo(() => getDocumentationFreshness(filtered), [filtered]);
  const freshnessIds = useMemo(() => {
    const out: Record<string, string[]> = {};
    filtered
      .filter((a) => a.artifact_type === 'MAPA' || a.artifact_type === 'DOCUMENTACAO')
      .forEach((a) => {
        const b = getFreshnessBucketId(daysSinceUpdate(a));
        (out[b] = out[b] || []).push(String(a.id));
      });
    return out;
  }, [filtered]);

  const openDrill: Drill = (label, ids, e) => {
    if (!onDrillDown || !ids || ids.length === 0) return;
    setDrill({ label, ids, x: e.clientX, y: e.clientY });
  };

  // --- Destaques escritos a partir dos números (sem IA) ---
  const highlights = useMemo(() => {
    const items: Array<{ key: string; tone: 'alerta' | 'info'; text: string; label: string; ids: string[] }> = [];
    const withScreens = stats.products.filter((p) => p.screens >= 5);
    const worst = [...withScreens].sort((a, b) => a.rate - b.rate)[0];
    const best = [...withScreens].sort((a, b) => b.rate - a.rate)[0];
    if (worst && best && worst.name !== best.name) {
      items.push({
        key: 'homolog',
        tone: worst.rate < 50 ? 'alerta' : 'info',
        text: `${worst.name} tem a menor homologação (${worst.rate}% das telas validadas); ${best.name} lidera com ${best.rate}%.`,
        label: `Mapas de ${worst.name}`,
        ids: worst.ids,
      });
    }
    const corrTop = [...stats.products].sort((a, b) => b.correction - a.correction)[0];
    if (stats.screenStatus['CORREÇÃO'] > 0 && corrTop && corrTop.correction > 0) {
      items.push({
        key: 'correcao',
        tone: 'alerta',
        text: `${plural(stats.screenStatus['CORREÇÃO'], 'tela pede', 'telas pedem')} correção; ${pct(corrTop.correction, stats.screenStatus['CORREÇÃO'])}% delas estão em ${corrTop.name}.`,
        label: 'Mapas com telas em correção',
        ids: stats.mapsByStatus['CORREÇÃO'],
      });
    }
    if (stats.legacyIds.length > 0) {
      const legacyTop = [...stats.products].sort((a, b) => b.legacy - a.legacy)[0];
      items.push({
        key: 'legado',
        tone: 'alerta',
        text: `${plural(stats.legacyIds.length, 'mapa ainda usa', 'mapas ainda usam')} Universal Analytics (${pct(stats.legacyIds.length, stats.totalMaps)}% dos mapas)${
          legacyTop && legacyTop.legacy > 0 ? `; o produto com mais é ${legacyTop.name} (${legacyTop.legacy}).` : '.'
        }`,
        label: 'Mapas com Universal Analytics',
        ids: stats.legacyIds,
      });
    }
    if (stats.suspiciousValues > 0) {
      items.push({
        key: 'digitacao',
        tone: 'alerta',
        text: `${plural(stats.suspiciousValues, 'valor parece', 'valores parecem')} erro de digitação em ${plural(stats.suspiciousParams, 'parâmetro', 'parâmetros')}${
          stats.topTypoParam ? ` (mais em ${stats.topTypoParam.name})` : ''
        }. Detalhes em Por parâmetro.`,
        label: 'Mapas com possível erro de digitação',
        ids: stats.typoMapIds,
      });
    }
    if (stats.divergentIds.length > 0) {
      items.push({
        key: 'divergente',
        tone: 'alerta',
        text: `${plural(stats.divergentIds.length, 'mapa declara', 'mapas declaram')} no cabeçalho um status diferente do que as telas mostram.`,
        label: 'Mapas com status divergente',
        ids: stats.divergentIds,
      });
    }
    const old = freshnessIds.ACIMA_180 || [];
    if (old.length > 0) {
      items.push({
        key: 'antigos',
        tone: pct(old.length, freshness.total) >= 50 ? 'alerta' : 'info',
        text: `${pct(old.length, freshness.total)}% dos mapas e documentações não são atualizados há mais de 180 dias.`,
        label: 'Sem atualização há mais de 180 dias',
        ids: old,
      });
    }
    return items.slice(0, 6);
  }, [stats, freshnessIds, freshness.total]);

  const productRows = useMemo(() => {
    if (productMetric === 'mapas') return [...stats.products].sort((a, b) => b.maps - a.maps).slice(0, 10);
    return stats.products
      .filter((p) => p.screens > 0)
      .sort((a, b) => a.rate - b.rate || b.screens - a.screens)
      .slice(0, 10);
  }, [stats.products, productMetric]);

  const typeSegments: Segment[] = (['MAPA', 'DOCUMENTACAO', 'NO', 'NAO_CLASSIFICADO'] as const)
    .map((t) => ({
      key: t,
      label: ARTIFACT_TYPE_CONFIGS[t].pluralLabel,
      value: stats.byType[t].length,
      color: ARTIFACT_TYPE_CONFIGS[t].hex,
      ids: stats.byType[t],
    }))
    .filter((s) => s.key !== 'NAO_CLASSIFICADO' || s.value > 0);

  const measurementSegments: Segment[] = ORDERED_MEASUREMENT_CLASSES.map((k) => ({
    key: k,
    label: MEASUREMENT_CONFIGS[k].label,
    value: stats.byMeasurement[k].length,
    color: MEASUREMENT_CONFIGS[k].hex,
    ids: stats.byMeasurement[k],
  })).filter((s) => s.key !== 'NAO_CLASSIFICADO' || s.value > 0);

  const homologationSegments: Segment[] = (['HOMOLOGADO', 'PARCIAL', 'NAO_HOMOLOGADO', 'NAO_CALCULAVEL'] as const)
    .map((k) => ({
      key: k,
      label: HOMOLOGATION_CONFIGS[k].label,
      value: stats.byHomologation[k].length,
      color: HOMOLOGATION_HEX[k],
      ids: stats.byHomologation[k],
    }))
    .filter((s) => s.key !== 'NAO_CALCULAVEL' || s.value > 0);

  const attention = [
    { key: 'correcao', icon: Wrench, ids: stats.mapsByStatus['CORREÇÃO'], value: stats.screenStatus['CORREÇÃO'], label: 'telas pedindo correção', detail: `em ${plural(stats.mapsByStatus['CORREÇÃO'].length, 'mapa', 'mapas')}` },
    { key: 'divergente', icon: GitCompareArrows, ids: stats.divergentIds, value: stats.divergentIds.length, label: 'mapas com status divergente', detail: 'cabeçalho diferente das telas' },
    { key: 'legado', icon: RefreshCcw, ids: stats.legacyIds, value: stats.legacyIds.length, label: 'mapas com Universal Analytics', detail: `${pct(stats.legacyIds.length, stats.totalMaps)}% dos mapas (GA3 ou híbrido)` },
    { key: 'digitacao', icon: SpellCheck, ids: stats.typoMapIds, value: stats.suspiciousValues, label: 'valores com possível erro de digitação', detail: `em ${plural(stats.typoMapIds.length, 'mapa', 'mapas')}` },
    { key: 'semtelas', icon: FileWarning, ids: stats.noScreenIds, value: stats.noScreenIds.length, label: 'mapas sem telas reconhecidas', detail: 'homologação não calculável' },
  ];

  return (
    <div className="space-y-6 animate-fade-in w-full min-w-0 max-w-full overflow-x-hidden">
      <PageHeader
        title="Insights"
        subtitle="Tamanho do inventário, homologação, o que ainda é Universal Analytics e onde agir primeiro. Clique em um número para abrir os artefatos."
      />

      <DrillMenu
        request={drill}
        onClose={() => setDrill(null)}
        onPick={(target) => {
          if (drill) onDrillDown?.(drill.label, drill.ids, target);
          setDrill(null);
        }}
      />

      {/* 1. Números principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Mapas', value: stats.totalMaps, detail: `mediana de ${stats.medianScreens} telas por mapa`, ids: stats.byType.MAPA },
          { label: 'Telas', value: stats.totalScreens, detail: `${fmt(stats.totalSnippets)} snippets`, ids: undefined },
          { label: 'Eventos distintos', value: stats.distinctEvents, detail: `${fmt(stats.distinctParams)} parâmetros distintos`, ids: undefined },
          {
            label: 'Documentações e nós',
            value: stats.byType.DOCUMENTACAO.length + stats.byType.NO.length,
            detail: `${fmt(stats.byType.DOCUMENTACAO.length)} docs e ${fmt(stats.byType.NO.length)} nós`,
            ids: [...stats.byType.DOCUMENTACAO, ...stats.byType.NO],
          },
        ].map((k) => {
          const clickable = Boolean(onDrillDown && k.ids && k.ids.length);
          return (
            <button
              key={k.label}
              type="button"
              disabled={!clickable}
              onClick={(e) => openDrill(k.label, k.ids, e)}
              className={`panel p-5 min-w-0 text-left ${clickable ? 'cursor-pointer hover:border-omni-bordo/30' : 'cursor-default'}`}
            >
              <p className="text-xs font-medium text-omni-muted">{k.label}</p>
              <p className="kpi-number text-3xl font-bold text-omni-ink tabular-nums mt-1">{fmt(k.value)}</p>
              <p className="text-[11.5px] text-omni-muted mt-1.5 truncate" title={k.detail}>
                {k.detail}
              </p>
            </button>
          );
        })}
      </div>

      {/* 2. Destaques automáticos */}
      {highlights.length > 0 && (
        <Panel title="Destaques" hint="calculados a partir dos números desta tela">
          <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {highlights.map((h) => (
              <li key={h.key}>
                <button
                  type="button"
                  onClick={(e) => openDrill(h.label, h.ids, e)}
                  className={`w-full h-full flex items-start gap-2.5 p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                    h.tone === 'alerta'
                      ? 'bg-amber-50 border-amber-200 hover:border-amber-300'
                      : 'bg-omni-mist/60 border-omni-line hover:border-omni-bordo/30'
                  }`}
                >
                  {h.tone === 'alerta' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-4 h-4 text-omni-muted shrink-0 mt-0.5" />
                  )}
                  <span className="text-[13px] text-omni-ink leading-relaxed">{h.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* 3. Composição + homologação */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Panel title="Composição do inventário" hint={`${fmt(stats.totalPages)} páginas sincronizadas`} className="lg:col-span-7">
          <StackedBar segments={typeSegments} total={stats.totalPages} unit="páginas" context="Tipo" onDrill={openDrill} />
          <div className="pt-3 border-t border-omni-line">
            <p className="text-xs font-medium text-omni-ink-secondary mb-3">Mensuração dos mapas</p>
            <StackedBar segments={measurementSegments} total={stats.totalMaps} unit="mapas" context="Mensuração" onDrill={openDrill} />
          </div>
        </Panel>

        <Panel title="Homologação" hint="telas validadas sobre o total" className="lg:col-span-5">
          <div className="flex items-center gap-5">
            <Ring value={stats.homologationRate} color={STATUS_CONFIGS.VALIDADO.hex} />
            <div className="min-w-0 space-y-1">
              <p className="text-sm text-omni-ink">
                <span className="font-semibold tabular-nums">{fmt(stats.screenStatus.VALIDADO)}</span> de{' '}
                <span className="tabular-nums">{fmt(stats.totalScreens)}</span> telas validadas.
              </p>
              <p className="text-xs text-omni-muted">
                {plural(stats.byHomologation.HOMOLOGADO.length, 'mapa está', 'mapas estão')} 100% homologados.
              </p>
            </div>
          </div>
          <div className="pt-3 border-t border-omni-line">
            <p className="text-xs font-medium text-omni-ink-secondary mb-3">Mapas por situação</p>
            <StackedBar segments={homologationSegments} total={stats.totalMaps} unit="mapas" context="Homologação" onDrill={openDrill} />
          </div>
        </Panel>
      </div>

      {/* 4. Status das telas, no mesmo formato de Por produto */}
      <Panel title="Status das telas" hint={`${fmt(stats.totalScreens)} telas | clique para ver os mapas`}>
        <StatusDistribution
          counts={stats.screenStatus}
          showBar
          onSelect={(status, e) => openDrill(`Mapas com telas em ${STATUS_CONFIGS[status].label}`, stats.mapsByStatus[status], e)}
        />
      </Panel>

      {/* 5. Onde agir */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {attention.map(({ key, icon: Icon, value, label, detail, ids }) => {
          const clickable = Boolean(onDrillDown && ids.length);
          return (
            <button
              key={key}
              type="button"
              disabled={!clickable}
              onClick={(e) => openDrill(label.charAt(0).toUpperCase() + label.slice(1), ids, e)}
              className={`panel p-5 flex gap-3 min-w-0 text-left ${clickable ? 'cursor-pointer hover:border-amber-300' : 'cursor-default'}`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                  value > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                }`}
              >
                {value > 0 ? <Icon className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-omni-ink tabular-nums leading-none">{fmt(value)}</p>
                <p className="text-xs font-medium text-omni-ink mt-1.5">{label}</p>
                <p className="text-[11px] text-omni-muted mt-0.5">{detail}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* 6. Produtos */}
      <Panel title="Produtos">
        <div className="flex items-center justify-between gap-3 -mt-2">
          <p className="text-xs text-omni-muted">
            {productMetric === 'mapas' ? 'Os 10 com mais mapas.' : 'Os 10 com menor homologação (com telas).'} Clique para abrir os mapas.
          </p>
          <div className="inline-flex rounded-lg border border-omni-line p-0.5 shrink-0" role="group" aria-label="Métrica dos produtos">
            {(
              [
                ['mapas', 'Mapas'],
                ['homologacao', 'Homologação'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setProductMetric(id)}
                aria-pressed={productMetric === id}
                className={`px-2.5 h-7 rounded-md text-xs font-semibold cursor-pointer ${
                  productMetric === id ? 'bg-omni-ink text-white' : 'text-omni-ink-secondary hover:text-omni-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <HBars
          rows={productRows.map((p) => ({
            key: p.name,
            label: p.name,
            value: productMetric === 'mapas' ? p.maps : p.rate,
            display: productMetric === 'mapas' ? plural(p.maps, 'mapa', 'mapas') : `${p.rate}%`,
            detail: productMetric === 'mapas' ? `${fmt(p.screens)} telas` : `${fmt(p.validated)}/${fmt(p.screens)} telas`,
            ids: p.ids,
          }))}
          max={productMetric === 'mapas' ? Math.max(...productRows.map((p) => p.maps), 1) : 100}
          color={productMetric === 'mapas' ? NEUTRAL_BAR : STATUS_CONFIGS.VALIDADO.hex}
          context="Produto"
          labelClass="w-44"
          onDrill={openDrill}
        />
      </Panel>

      {/* 7. Eventos e parâmetros */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Eventos mais disparados" hint="snippets por evento">
          {stats.topEvents.length === 0 ? (
            <p className="text-xs text-omni-muted">Nenhum evento catalogado para os filtros atuais.</p>
          ) : (
            <HBars
              rows={stats.topEvents.map((e) => ({
                key: e.name,
                label: e.name,
                value: e.count,
                display: fmt(e.count),
                detail: `em ${plural(e.ids.length, 'mapa', 'mapas')}`,
                ids: e.ids,
              }))}
              max={stats.topEvents[0]?.count || 1}
              color={NEUTRAL_BAR}
              context="Evento"
              labelClass="w-40 font-mono"
              onDrill={openDrill}
            />
          )}
        </Panel>

        <Panel title="Parâmetros mais usados" hint="ocorrências e mapas">
          {stats.topParams.length === 0 ? (
            <p className="text-xs text-omni-muted">Nenhum parâmetro catalogado para os filtros atuais.</p>
          ) : (
            <HBars
              rows={stats.topParams.map((p) => ({
                key: p.name,
                label: p.name,
                value: p.count,
                display: `${fmt(p.count)}x`,
                detail: `em ${plural(p.ids.length, 'mapa', 'mapas')}`,
                ids: p.ids,
              }))}
              max={stats.topParams[0]?.count || 1}
              color={NEUTRAL_BAR}
              context="Parâmetro"
              labelClass="w-40 font-mono"
              onDrill={openDrill}
            />
          )}
        </Panel>
      </div>

      {/* 8. Atualização da documentação */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Panel title="Idade da documentação" hint={`${fmt(freshness.total)} mapas e documentações`} className="lg:col-span-5">
          <div className="flex h-3 w-full rounded-full overflow-hidden bg-gray-100 gap-[2px]" aria-hidden="true">
            {freshness.buckets
              .filter((b) => b.count > 0)
              .map((b) => (
                <div key={b.id} className={b.colorClass} style={{ width: `${b.percent}%` }} title={`${b.label}: ${b.count}`} />
              ))}
          </div>
          <ul className="space-y-0.5">
            {freshness.buckets.map((b) => {
              const ids = freshnessIds[b.id] || [];
              const clickable = Boolean(onDrillDown && ids.length);
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={(e) => openDrill(`Atualização: ${b.label}`, ids, e)}
                    className={`w-full flex items-center justify-between text-xs py-1.5 px-2 -mx-2 rounded-md ${
                      clickable ? 'hover:bg-omni-mist cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-omni-ink-secondary">
                      <span className={`w-2.5 h-2.5 rounded-sm ${b.colorClass}`} aria-hidden="true" />
                      {b.label}
                    </span>
                    <span className="text-omni-muted tabular-nums">
                      <span className="font-semibold text-omni-ink">{fmt(b.count)}</span> ({b.percent}%)
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Atualizados recentemente" className="lg:col-span-7">
          {freshness.recent.length === 0 ? (
            <p className="text-xs text-omni-muted">Nenhum artefato com data de atualização para os filtros atuais.</p>
          ) : (
            <ul className="divide-y divide-omni-line -my-1">
              {freshness.recent.map(({ artifact }) => (
                <li key={artifact.id}>
                  <button
                    type="button"
                    onClick={() => onOpenMap(artifact)}
                    className="w-full flex items-center justify-between gap-4 py-2.5 text-left group cursor-pointer"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-omni-ink truncate group-hover:text-omni-bordo">
                        {artifact.titulo}
                      </span>
                      <span className="block text-[11.5px] text-omni-muted truncate">
                        {[artifact.produto, artifact.subproduto].filter(Boolean).join(' › ') || 'Sem produto'}
                        {artifact.responsavel && artifact.responsavel !== '-' ? ` | ${artifact.responsavel}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 flex items-center gap-1.5 text-[11.5px] text-omni-muted tabular-nums">
                      {formatDataBR(artifact.ultima_atualizacao)}
                      <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
};
