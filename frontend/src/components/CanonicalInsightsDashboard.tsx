import React, { useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle2, GitCompareArrows, RefreshCcw, FileWarning, Wrench } from 'lucide-react';
import { Artifact } from '../types';
import { PageHeader } from './PageHeader';
import { normalizarStatus, OfficialStatus } from '../utils/statusUtils';
import { isMap, isDocumentation } from '../domain/artifacts/artifactSelectors';
import { resolveMeasurementClass } from '../domain/measurement/measurementResolver';
import { MEASUREMENT_CONFIGS } from '../domain/measurement/measurementConfig';
import { OFFICIAL_STATUSES, STATUS_CONFIGS, getMapStatusMetrics, HOMOLOGATION_CONFIGS } from '../domain/status';
import { getDocumentationFreshness } from '../domain/metrics/documentationFreshness';
import { formatDataBR } from '../utils/helpers';

interface CanonicalInsightsDashboardProps {
  artifacts: Artifact[];
  onOpenMap: (map: Artifact) => void;
  onFilterByProduct: (produto: string) => void;
  selectedProductFilter?: string;
  onProductFilterChange?: (val: string) => void;
  selectedSubprodutoFilter?: string;
  onSubprodutoFilterChange?: (val: string) => void;
  selectedMeasurementFilter?: string;
  onMeasurementFilterChange?: (val: string) => void;
}

/**
 * Cores categóricas (paleta validada para daltonismo, ordem fixa).
 * Todo segmento tem rótulo e número visíveis, então a cor nunca é a única pista.
 */
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];

const fmt = (n: number) => n.toLocaleString('pt-BR');
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

// --- Peças visuais -------------------------------------------------------------

interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Barra 100% empilhada com legenda numérica logo abaixo. */
const StackedBar: React.FC<{ segments: Segment[]; total: number; unit: string }> = ({ segments, total, unit }) => (
  <div className="space-y-3">
    <div className="flex h-3 w-full rounded-full overflow-hidden bg-gray-100 gap-[2px]">
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <div
            key={s.key}
            style={{ width: `${(s.value / Math.max(total, 1)) * 100}%`, background: s.color }}
            className="h-full first:rounded-l-full last:rounded-r-full"
            title={`${s.label}: ${fmt(s.value)} ${unit} (${pct(s.value, total)}%)`}
          />
        ))}
    </div>
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
      {segments.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5 text-xs">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} aria-hidden="true" />
          <span className="text-omni-ink-secondary">{s.label}</span>
          <span className="font-semibold text-omni-ink tabular-nums">{fmt(s.value)}</span>
          <span className="text-omni-muted tabular-nums">({pct(s.value, total)}%)</span>
        </li>
      ))}
    </ul>
  </div>
);

interface HBarRow {
  key: string;
  label: string;
  value: number;
  display: string;
  detail?: string;
  onClick?: () => void;
}

/** Barras horizontais: rótulo à esquerda, valor à direita, barra fina no meio. */
const HBars: React.FC<{ rows: HBarRow[]; max: number; color: string; labelWidth?: string }> = ({
  rows,
  max,
  color,
  labelWidth = 'w-36',
}) => (
  <ul className="space-y-1">
    {rows.map((r) => {
      const Tag: any = r.onClick ? 'button' : 'div';
      return (
        <li key={r.key}>
          <Tag
            type={r.onClick ? 'button' : undefined}
            onClick={r.onClick}
            title={r.detail ? `${r.label}: ${r.display} · ${r.detail}` : `${r.label}: ${r.display}`}
            className={`w-full flex items-center gap-3 py-1.5 px-2 -mx-2 rounded-lg text-left ${
              r.onClick ? 'hover:bg-omni-mist cursor-pointer group' : ''
            }`}
          >
            <span className={`${labelWidth} shrink-0 text-xs text-omni-ink truncate`}>{r.label}</span>
            <span className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
              <span
                className="block h-full rounded-full"
                style={{ width: `${max > 0 ? Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0) : 0}%`, background: color }}
              />
            </span>
            <span className="w-24 shrink-0 text-right">
              <span className="text-xs font-semibold text-omni-ink tabular-nums">{r.display}</span>
              {r.detail && <span className="block text-[11px] text-omni-muted tabular-nums">{r.detail}</span>}
            </span>
          </Tag>
        </li>
      );
    })}
  </ul>
);

/** Anel de progresso para um único percentual (a homologação geral). */
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

// --- Painel ------------------------------------------------------------------

export const CanonicalInsightsDashboard: React.FC<CanonicalInsightsDashboardProps> = ({
  artifacts,
  onOpenMap,
  onFilterByProduct,
  selectedProductFilter,
  selectedSubprodutoFilter,
  selectedMeasurementFilter,
}) => {
  const [productMetric, setProductMetric] = useState<'mapas' | 'homologacao'>('mapas');

  const effProduct = selectedProductFilter ?? 'all';
  const effSubproduto = selectedSubprodutoFilter ?? 'all';
  const effMeasurement = selectedMeasurementFilter ?? 'all';

  const filtered = useMemo(
    () =>
      artifacts.filter((art) => {
        if (effProduct !== 'all' && art.produto !== effProduct) return false;
        if (effSubproduto !== 'all' && (art.subproduto || 'Sem subproduto') !== effSubproduto) return false;
        if (effMeasurement !== 'all' && resolveMeasurementClass(art) !== effMeasurement) return false;
        return true;
      }),
    [artifacts, effProduct, effSubproduto, effMeasurement]
  );

  const stats = useMemo(() => {
    const maps = filtered.filter((a) => isMap(a) && a.artifact_type === 'MAPA');
    const docs = filtered.filter((a) => isDocumentation(a) && a.artifact_type === 'DOCUMENTACAO');
    const nodes = filtered.filter((a) => a.artifact_type === 'NO');
    const unclassified = filtered.filter((a) => a.artifact_type === 'NAO_CLASSIFICADO');

    const screenStatus: Record<OfficialStatus, number> = { VALIDADO: 0, 'CORREÇÃO': 0, NOVO: 0, EXCLUIR: 0, DESCONTINUAR: 0 };
    const mapHomologation = { HOMOLOGADO: 0, PARCIAL: 0, NAO_HOMOLOGADO: 0, NAO_CALCULAVEL: 0 };
    const measurement: Record<string, number> = { GA4: 0, GA3: 0, HIBRIDO: 0, NAO_CLASSIFICADO: 0 };
    const params = new Map<string, { count: number; maps: Set<string> }>();
    const events = new Map<string, number>();
    const products = new Map<string, { maps: number; screens: number; validated: number }>();

    let totalScreens = 0;
    let totalSnippets = 0;
    let divergent = 0;
    let mapsWithoutScreens = 0;
    let mapsWithCorrection = 0;
    const screensPerMap: number[] = [];

    maps.forEach((art) => {
      const screens = art.screens || [];
      const metrics = getMapStatusMetrics(art);
      mapHomologation[metrics.homologationStatus] = (mapHomologation[metrics.homologationStatus] || 0) + 1;
      if (art.status_divergent) divergent++;
      if (screens.length === 0) mapsWithoutScreens++;
      if (metrics.correction > 0) mapsWithCorrection++;
      screensPerMap.push(screens.length);

      let validatedHere = 0;
      screens.forEach((sc) => {
        const norm = normalizarStatus(sc.status);
        if (norm) {
          screenStatus[norm]++;
          totalScreens++;
          if (norm === 'VALIDADO') validatedHere++;
        }
        (sc.snippets || []).forEach((snip: any) => {
          totalSnippets++;
          const evt = String(snip.event_raw || snip.event_normalized || '').trim();
          if (evt) events.set(evt, (events.get(evt) || 0) + 1);
        });
      });

      measurement[resolveMeasurementClass(art)] = (measurement[resolveMeasurementClass(art)] || 0) + 1;

      const pName = art.produto || 'Sem produto';
      const p = products.get(pName) || { maps: 0, screens: 0, validated: 0 };
      p.maps++;
      p.screens += screens.length;
      p.validated += validatedHere;
      products.set(pName, p);

      (art.parameter_summary || []).forEach((ps) => {
        const cur = params.get(ps.name) || { count: 0, maps: new Set<string>() };
        cur.count += ps.occurrences;
        cur.maps.add(String(art.id));
        params.set(ps.name, cur);
      });
    });

    screensPerMap.sort((a, b) => a - b);
    const median = screensPerMap.length ? screensPerMap[Math.floor(screensPerMap.length / 2)] : 0;

    return {
      maps,
      totalMaps: maps.length,
      totalDocs: docs.length,
      totalNodes: nodes.length,
      totalUnclassified: unclassified.length,
      totalPages: maps.length + docs.length + nodes.length + unclassified.length,
      totalScreens,
      totalSnippets,
      screenStatus,
      mapHomologation,
      measurement,
      homologationRate: pct(screenStatus.VALIDADO, totalScreens),
      divergent,
      mapsWithoutScreens,
      mapsWithCorrection,
      medianScreens: median,
      topParams: Array.from(params.entries())
        .map(([name, v]) => ({ name, count: v.count, maps: v.maps.size }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      distinctParams: params.size,
      topEvents: Array.from(events.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      distinctEvents: events.size,
      products: Array.from(products.entries()).map(([name, v]) => ({
        name,
        ...v,
        rate: pct(v.validated, v.screens),
      })),
    };
  }, [filtered]);

  const freshness = useMemo(() => getDocumentationFreshness(filtered), [filtered]);

  const productRows = useMemo(() => {
    if (productMetric === 'mapas') {
      return [...stats.products].sort((a, b) => b.maps - a.maps).slice(0, 10);
    }
    return stats.products
      .filter((p) => p.screens > 0)
      .sort((a, b) => a.rate - b.rate || b.screens - a.screens)
      .slice(0, 10);
  }, [stats.products, productMetric]);

  const typeSegments: Segment[] = [
    { key: 'MAPA', label: 'Mapas', value: stats.totalMaps, color: SERIES[0] },
    { key: 'DOCUMENTACAO', label: 'Documentações', value: stats.totalDocs, color: SERIES[1] },
    { key: 'NO', label: 'Nós', value: stats.totalNodes, color: SERIES[2] },
    ...(stats.totalUnclassified > 0
      ? [{ key: 'NAO_CLASSIFICADO', label: 'Não classificados', value: stats.totalUnclassified, color: SERIES[3] }]
      : []),
  ];

  const measurementSegments: Segment[] = (['GA4', 'GA3', 'HIBRIDO', 'NAO_CLASSIFICADO'] as const).map((k, i) => ({
    key: k,
    label: MEASUREMENT_CONFIGS[k].label,
    value: stats.measurement[k] || 0,
    color: SERIES[i],
  }));

  const statusSegments: Segment[] = OFFICIAL_STATUSES.map((s) => ({
    key: s,
    label: STATUS_CONFIGS[s].label,
    value: stats.screenStatus[s] || 0,
    color: STATUS_CONFIGS[s].hex,
  }));

  const homologationSegments: Segment[] = (['HOMOLOGADO', 'PARCIAL', 'NAO_HOMOLOGADO', 'NAO_CALCULAVEL'] as const)
    .map((k) => ({
      key: k,
      label: HOMOLOGATION_CONFIGS[k].label,
      value: stats.mapHomologation[k] || 0,
      color: { HOMOLOGADO: '#10b981', PARCIAL: '#f59e0b', NAO_HOMOLOGADO: '#94a3b8', NAO_CALCULAVEL: '#d1d5db' }[k],
    }))
    .filter((s) => s.key !== 'NAO_CALCULAVEL' || s.value > 0);

  const ga3Share = pct(stats.measurement.GA3 + stats.measurement.HIBRIDO, stats.totalMaps);

  const attention = [
    {
      key: 'correcao',
      icon: Wrench,
      value: stats.screenStatus['CORREÇÃO'],
      label: 'telas pedindo correção',
      detail: `em ${fmt(stats.mapsWithCorrection)} ${stats.mapsWithCorrection === 1 ? 'mapa' : 'mapas'}`,
    },
    {
      key: 'divergente',
      icon: GitCompareArrows,
      value: stats.divergent,
      label: 'mapas com status divergente',
      detail: 'cabeçalho diz uma coisa, telas dizem outra',
    },
    {
      key: 'legado',
      icon: RefreshCcw,
      value: stats.measurement.GA3 + stats.measurement.HIBRIDO,
      label: 'mapas ainda com Universal Analytics',
      detail: `${ga3Share}% dos mapas (GA3 ou híbrido)`,
    },
    {
      key: 'semtelas',
      icon: FileWarning,
      value: stats.mapsWithoutScreens,
      label: 'mapas sem telas reconhecidas',
      detail: 'homologação não calculável',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in w-full min-w-0 max-w-full overflow-x-hidden">
      <PageHeader
        title="Insights"
        subtitle="O tamanho do inventário, quanto já está homologado, o que ainda é Universal Analytics e onde agir primeiro."
      />

      {/* 1. Números principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Mapas', value: stats.totalMaps, detail: `mediana de ${stats.medianScreens} telas por mapa` },
          { label: 'Telas', value: stats.totalScreens, detail: `${fmt(stats.totalSnippets)} snippets` },
          { label: 'Eventos distintos', value: stats.distinctEvents, detail: `${fmt(stats.distinctParams)} parâmetros distintos` },
          { label: 'Documentações e nós', value: stats.totalDocs + stats.totalNodes, detail: `${fmt(stats.totalDocs)} docs e ${fmt(stats.totalNodes)} nós` },
        ].map((k) => (
          <div key={k.label} className="panel p-5 min-w-0">
            <p className="text-xs font-medium text-omni-muted">{k.label}</p>
            <p className="kpi-number text-3xl font-bold text-omni-ink tabular-nums mt-1">{fmt(k.value)}</p>
            <p className="text-[11.5px] text-omni-muted mt-1.5 truncate" title={k.detail}>
              {k.detail}
            </p>
          </div>
        ))}
      </div>

      {/* 2. Composição do inventário + homologação geral */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Panel title="Composição do inventário" hint={`${fmt(stats.totalPages)} páginas sincronizadas`} className="lg:col-span-7">
          <StackedBar segments={typeSegments} total={stats.totalPages} unit="páginas" />
          <div className="pt-2 border-t border-omni-line">
            <p className="text-xs font-medium text-omni-ink-secondary mb-3">Mensuração dos mapas</p>
            <StackedBar segments={measurementSegments} total={stats.totalMaps} unit="mapas" />
          </div>
        </Panel>

        <Panel title="Homologação" hint="telas validadas sobre o total" className="lg:col-span-5">
          <div className="flex items-center gap-5">
            <Ring value={stats.homologationRate} color="#10b981" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm text-omni-ink">
                <span className="font-semibold tabular-nums">{fmt(stats.screenStatus.VALIDADO)}</span> de{' '}
                <span className="tabular-nums">{fmt(stats.totalScreens)}</span> telas validadas.
              </p>
              <p className="text-xs text-omni-muted">
                {fmt(stats.mapHomologation.HOMOLOGADO)} {stats.mapHomologation.HOMOLOGADO === 1 ? 'mapa está' : 'mapas estão'} 100% homologados.
              </p>
            </div>
          </div>
          <div className="pt-2 border-t border-omni-line">
            <p className="text-xs font-medium text-omni-ink-secondary mb-3">Mapas por situação</p>
            <StackedBar segments={homologationSegments} total={stats.totalMaps} unit="mapas" />
          </div>
        </Panel>
      </div>

      {/* 3. Onde agir */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {attention.map(({ key, icon: Icon, value, label, detail }) => (
          <div key={key} className="panel p-5 flex gap-3 min-w-0">
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
          </div>
        ))}
      </div>

      {/* 4. Status das telas + produtos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Panel title="Status das telas" hint="apurado tela a tela" className="lg:col-span-5">
          <HBars
            rows={statusSegments.map((s) => ({
              key: s.key,
              label: s.label,
              value: s.value,
              display: fmt(s.value),
              detail: `${pct(s.value, stats.totalScreens)}%`,
            }))}
            max={Math.max(...statusSegments.map((s) => s.value), 1)}
            color="#7B0209"
            labelWidth="w-24"
          />
        </Panel>

        <Panel title="Produtos" className="lg:col-span-7">
          <div className="flex items-center justify-between gap-3 -mt-2">
            <p className="text-xs text-omni-muted">
              {productMetric === 'mapas' ? 'Os 10 com mais mapas.' : 'Os 10 com menor homologação (com telas).'} Clique para abrir no Inventário.
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
              display: productMetric === 'mapas' ? `${fmt(p.maps)} ${p.maps === 1 ? 'mapa' : 'mapas'}` : `${p.rate}%`,
              detail: productMetric === 'mapas' ? `${fmt(p.screens)} telas` : `${fmt(p.validated)}/${fmt(p.screens)} telas`,
              onClick: () => onFilterByProduct(p.name),
            }))}
            max={productMetric === 'mapas' ? Math.max(...productRows.map((p) => p.maps), 1) : 100}
            color={productMetric === 'mapas' ? '#2a78d6' : '#10b981'}
          />
        </Panel>
      </div>

      {/* 5. Eventos e parâmetros */}
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
                detail: `${pct(e.count, stats.totalSnippets)}% dos snippets`,
              }))}
              max={stats.topEvents[0]?.count || 1}
              color="#2a78d6"
              labelWidth="w-40 font-mono"
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
                detail: `em ${fmt(p.maps)} ${p.maps === 1 ? 'mapa' : 'mapas'}`,
              }))}
              max={stats.topParams[0]?.count || 1}
              color="#2a78d6"
              labelWidth="w-40 font-mono"
            />
          )}
        </Panel>
      </div>

      {/* 6. Atualização da documentação */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Panel title="Idade da documentação" hint={`${fmt(freshness.total)} mapas e documentações`} className="lg:col-span-5">
          <div className="flex h-3 w-full rounded-full overflow-hidden bg-gray-100 gap-[2px]" aria-hidden="true">
            {freshness.buckets
              .filter((b) => b.count > 0)
              .map((b) => (
                <div key={b.id} className={b.colorClass} style={{ width: `${b.percent}%` }} title={`${b.label}: ${b.count}`} />
              ))}
          </div>
          <ul className="space-y-2">
            {freshness.buckets.map((b) => (
              <li key={b.id} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-omni-ink-secondary">
                  <span className={`w-2.5 h-2.5 rounded-sm ${b.colorClass}`} aria-hidden="true" />
                  {b.label}
                </span>
                <span className="text-omni-muted tabular-nums">
                  <span className="font-semibold text-omni-ink">{fmt(b.count)}</span> ({b.percent}%)
                </span>
              </li>
            ))}
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
