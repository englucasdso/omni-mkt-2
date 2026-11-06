import React, { useMemo, useState } from 'react';
import { 
  Target, CheckCircle2, AlertTriangle, AlertCircle, FileText, 
  Layers, Tag, Code2, Clock, Filter, ArrowUpRight, ShieldCheck,
  TrendingUp, BarChart3, Database
} from 'lucide-react';
import { Artifact } from '../types';
import { PageHeader } from './PageHeader';
import { normalizarStatus, OfficialStatus } from '../utils/statusUtils';

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

export const CanonicalInsightsDashboard: React.FC<CanonicalInsightsDashboardProps> = ({
  artifacts,
  onOpenMap,
  onFilterByProduct,
  selectedProductFilter,
  onProductFilterChange,
  selectedSubprodutoFilter,
  onSubprodutoFilterChange,
  selectedMeasurementFilter,
  onMeasurementFilterChange,
}) => {
  const [localProductFilter, setLocalProductFilter] = useState('all');
  const [localSubprodutoFilter, setLocalSubprodutoFilter] = useState('all');
  const [localMeasurementFilter, setLocalMeasurementFilter] = useState('all');

  const effProductFilter = selectedProductFilter !== undefined ? selectedProductFilter : localProductFilter;
  const effSubprodutoFilter = selectedSubprodutoFilter !== undefined ? selectedSubprodutoFilter : localSubprodutoFilter;
  const effMeasurementFilter = selectedMeasurementFilter !== undefined ? selectedMeasurementFilter : localMeasurementFilter;

  const filteredArtifacts = useMemo(() => {
    return artifacts.filter(art => {
      if (effProductFilter !== 'all' && art.produto !== effProductFilter) return false;
      if (effSubprodutoFilter !== 'all' && (art.subproduto || 'Sem subproduto') !== effSubprodutoFilter) return false;
      if (effMeasurementFilter !== 'all') {
        const mc = art.measurement_class || (art.tipo_mapa?.toLowerCase().includes('ga4') ? 'GA4' : 'GA3');
        if (mc !== effMeasurementFilter) return false;
      }
      return true;
    });
  }, [artifacts, effProductFilter, effSubprodutoFilter, effMeasurementFilter]);

  const stats = useMemo(() => {
    let totalMaps = 0;
    let totalDocs = 0;
    let totalScreens = 0;
    let totalSnippets = 0;
    let divergentCount = 0;

    const screenStatusCounts: Record<OfficialStatus, number> = {
      VALIDADO: 0,
      'CORREÇÃO': 0,
      NOVO: 0,
      EXCLUIR: 0,
      DESCONTINUAR: 0
    };

    const measurementCounts: Record<string, number> = {
      GA4: 0,
      GA3: 0,
      HIBRIDO: 0,
      NAO_CLASSIFICADO: 0
    };

    const paramMap = new Map<string, { count: number; screens: number }>();
    const patternMap = new Map<string, { count: number; event: string }>();
    const productStatsMap = new Map<string, { maps: number; screens: number }>();

    filteredArtifacts.forEach(art => {
      if (art.artifact_type === 'DOCUMENTACAO') {
        totalDocs++;
      } else {
        totalMaps++;
      }

      if (art.status_divergent) {
        divergentCount++;
      }

      const screens = art.screens || [];
      // Contagem de status feita estritamente por tela
      screens.forEach(sc => {
        const norm = normalizarStatus(sc.status);
        if (norm) {
          screenStatusCounts[norm]++;
          totalScreens++;
        }
        totalSnippets += (sc.snippets || []).length;
      });

      const mClass = art.measurement_class || (art.tipo_mapa?.toLowerCase().includes('ga4') ? 'GA4' : 'GA3');
      measurementCounts[mClass] = (measurementCounts[mClass] || 0) + 1;

      // Products aggregation
      const pName = art.produto || 'Sem Produto';
      if (!productStatsMap.has(pName)) {
        productStatsMap.set(pName, { maps: 0, screens: 0 });
      }
      const pEntry = productStatsMap.get(pName)!;
      pEntry.maps += 1;
      pEntry.screens += screens.length;

      // Parameters aggregation
      (art.parameter_summary || []).forEach(p => {
        const cur = paramMap.get(p.name) || { count: 0, screens: 0 };
        cur.count += p.occurrences;
        cur.screens += p.screens_count;
        paramMap.set(p.name, cur);
      });

      // Patterns aggregation
      (art.pattern_summary || []).forEach(pat => {
        const cur = patternMap.get(pat.pattern_id) || { count: 0, event: pat.event };
        cur.count += pat.count;
        patternMap.set(pat.pattern_id, cur);
      });
    });

    const totalArtifacts = filteredArtifacts.length;
    const validatedScreens = screenStatusCounts.VALIDADO || 0;
    const taxaHomologacao = totalScreens > 0 ? Math.round((validatedScreens / totalScreens) * 100) : 0;
    const taxaDivergencia = totalArtifacts > 0 ? Math.round((divergentCount / totalArtifacts) * 100) : 0;

    const topParameters = Array.from(paramMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([name, data]) => ({ name, ...data }));

    const topPatterns = Array.from(patternMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([id, data]) => ({ id, ...data }));

    const topProductsByMaps = Array.from(productStatsMap.entries())
      .sort((a, b) => b[1].maps - a[1].maps)
      .slice(0, 6)
      .map(([name, data]) => ({ name, ...data }));

    const topProductsByScreens = Array.from(productStatsMap.entries())
      .sort((a, b) => b[1].screens - a[1].screens)
      .slice(0, 6)
      .map(([name, data]) => ({ name, ...data }));

    return {
      totalArtifacts,
      totalMaps,
      totalDocs,
      percentMaps: totalArtifacts > 0 ? Math.round((totalMaps / totalArtifacts) * 100) : 0,
      percentDocs: totalArtifacts > 0 ? Math.round((totalDocs / totalArtifacts) * 100) : 0,
      totalScreens,
      totalSnippets,
      totalParamsCount: paramMap.size,
      screenStatusCounts,
      measurementCounts,
      taxaHomologacao,
      divergentCount,
      taxaDivergencia,
      topParameters,
      topPatterns,
      topProductsByMaps,
      topProductsByScreens
    };
  }, [filteredArtifacts]);

  const uniqueProducts = useMemo(() => {
    return Array.from(new Set(artifacts.map(a => a.produto).filter(Boolean))).sort() as string[];
  }, [artifacts]);

  return (
    <div className="space-y-6 animate-fade-in w-full min-w-0 max-w-full overflow-x-hidden">
      <PageHeader
        title="Indicadores e Governança Analítica"
        subtitle="Métricas canônicas da esteira de tagueamento, telas mapeadas e conformidade técnica."
      />

      {/* Top 4 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Total Artefatos */}
        <div className="flat-card min-w-0 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-neu-card relative overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 shadow-neu-raised flex items-center justify-center mb-3">
            <Target className="w-5 h-5" />
          </div>
          <p className="text-[10px] font-ui font-semibold uppercase text-gray-400 tracking-wider">Artefatos Catalogados</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="kpi-number text-3xl font-bold text-gray-900 dark:text-slate-50 tabular-nums">{stats.totalArtifacts}</p>
            <span className="text-xs font-ui text-gray-400">
              ({stats.totalMaps} Mapas • {stats.totalDocs} Docs)
            </span>
          </div>
          {/* Progress bar map vs doc */}
          <div className="w-full bg-gray-100 dark:bg-slate-800 h-2 rounded-full mt-4 overflow-hidden flex">
            <div style={{ width: `${stats.percentMaps}%` }} className="bg-bradesco-red h-full" title={`Mapas: ${stats.percentMaps}%`} />
            <div style={{ width: `${stats.percentDocs}%` }} className="bg-gray-400 h-full" title={`Docs: ${stats.percentDocs}%`} />
          </div>
        </div>

        {/* Card 2: Telas & Snippets */}
        <div className="flat-card min-w-0 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-neu-card relative overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 shadow-neu-raised flex items-center justify-center mb-3">
            <Layers className="w-5 h-5" />
          </div>
          <p className="text-[10px] font-ui font-semibold uppercase text-gray-400 tracking-wider">Telas & Snippets</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="kpi-number text-3xl font-bold text-gray-900 dark:text-slate-50 tabular-nums">{stats.totalScreens}</p>
            <span className="text-xs font-ui font-medium text-gray-600 dark:text-slate-300">
              telas estruturadas
            </span>
          </div>
          <p className="text-[11px] font-ui text-gray-500 dark:text-slate-400 mt-2">
            {stats.totalSnippets} snippets dataLayer associados
          </p>
        </div>

        {/* Card 3: Taxa de Homologação */}
        <div className="flat-card min-w-0 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-neu-card relative overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shadow-neu-raised flex items-center justify-center mb-3">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <p className="text-[10px] font-ui font-semibold uppercase text-gray-400 tracking-wider">Taxa de Homologação</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="kpi-number text-3xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{stats.taxaHomologacao}%</p>
            <span className="text-xs font-ui text-gray-400">
              ({stats.screenStatusCounts.VALIDADO} validadas)
            </span>
          </div>
          <p className="text-[11px] font-ui text-gray-500 dark:text-slate-400 mt-2">
            {stats.screenStatusCounts['CORREÇÃO']} telas requerem correção
          </p>
        </div>

        {/* Card 4: Parâmetros Distintos */}
        <div className="flat-card min-w-0 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-neu-card relative overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 shadow-neu-raised flex items-center justify-center mb-3">
            <Tag className="w-5 h-5" />
          </div>
          <p className="text-[10px] font-ui font-semibold uppercase text-gray-400 tracking-wider">Parâmetros Mapeados</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="kpi-number text-3xl font-bold text-gray-900 dark:text-slate-50 tabular-nums">{stats.totalParamsCount}</p>
            <span className="text-xs font-ui text-gray-400">distintos</span>
          </div>
          <p className="text-[11px] font-ui text-gray-500 dark:text-slate-400 mt-2">
            Taxa de divergência: <strong className={stats.taxaDivergencia > 0 ? 'text-amber-600' : 'text-emerald-600'}>{stats.taxaDivergencia}%</strong>
          </p>
        </div>
      </div>

      {/* Row 2: Distribuição de Status Real das Telas + Classificação de Mensuração */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Status Reais breakdown */}
        <div className="lg:col-span-7 flat-card p-6 md:p-8 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-neu-card space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-heading font-bold text-gray-900 dark:text-slate-50 uppercase tracking-wider">
              Distribuição de Status das Telas
            </h3>
            <span className="text-xs font-ui text-gray-400">Apurados tela a tela</span>
          </div>

          <div className="space-y-3 font-ui">
            {[
              { label: 'VALIDADO', count: stats.screenStatusCounts.VALIDADO || 0, color: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
              { label: 'CORREÇÃO', count: stats.screenStatusCounts['CORREÇÃO'] || 0, color: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400' },
              { label: 'NOVO', count: stats.screenStatusCounts.NOVO || 0, color: 'bg-amber-500', text: 'text-amber-800 dark:text-amber-400' },
              { label: 'EXCLUIR', count: stats.screenStatusCounts.EXCLUIR || 0, color: 'bg-slate-400', text: 'text-slate-600 dark:text-slate-400' },
              { label: 'DESCONTINUAR', count: stats.screenStatusCounts.DESCONTINUAR || 0, color: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-400' },
            ].map(st => {
              const pct = stats.totalScreens > 0 ? Math.round((st.count / stats.totalScreens) * 100) : 0;
              return (
                <div key={st.label} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-gray-700 dark:text-slate-300">{st.label}</span>
                    <span className="text-gray-500 tabular-nums">{st.count} telas ({pct}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div style={{ width: `${pct}%` }} className={`h-full ${st.color} rounded-full transition-all duration-500`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mensuração breakdown */}
        <div className="lg:col-span-5 flat-card p-6 md:p-8 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-neu-card space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-heading font-bold text-gray-900 dark:text-slate-50 uppercase tracking-wider">
              Maturidade da Mensuração
            </h3>
            <span className="text-xs font-ui text-gray-400">GA4 vs GA3</span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 font-ui">
            <div className="p-4 rounded-xl bg-gray-50/80 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 text-center shadow-neu-raised">
              <span className="text-[10px] font-medium uppercase text-gray-500 dark:text-slate-400 block">GA4 Puro</span>
              <span className="text-2xl font-heading font-bold text-gray-900 dark:text-slate-100 tabular-nums">{stats.measurementCounts.GA4 || 0}</span>
              <span className="text-[10px] text-gray-400 block mt-1">100% compliant</span>
            </div>
            <div className="p-4 rounded-xl bg-gray-50/80 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 text-center shadow-neu-raised">
              <span className="text-[10px] font-medium uppercase text-gray-500 dark:text-slate-400 block">Universal (GA3)</span>
              <span className="text-2xl font-heading font-bold text-gray-900 dark:text-slate-100 tabular-nums">{stats.measurementCounts.GA3 || 0}</span>
              <span className="text-[10px] text-gray-400 block mt-1">Legado</span>
            </div>
            <div className="p-4 rounded-xl bg-gray-50/80 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 text-center shadow-neu-raised">
              <span className="text-[10px] font-medium uppercase text-gray-500 dark:text-slate-400 block">Híbrido</span>
              <span className="text-2xl font-heading font-bold text-gray-900 dark:text-slate-100 tabular-nums">{stats.measurementCounts.HIBRIDO || 0}</span>
              <span className="text-[10px] text-gray-400 block mt-1">Transição</span>
            </div>
            <div className="p-4 rounded-xl bg-gray-50/80 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 text-center shadow-neu-raised">
              <span className="text-[10px] font-medium uppercase text-gray-500 dark:text-slate-400 block">Não Classificado</span>
              <span className="text-2xl font-heading font-bold text-gray-900 dark:text-slate-100 tabular-nums">{stats.measurementCounts.NAO_CLASSIFICADO || 0}</span>
              <span className="text-[10px] text-gray-400 block mt-1">Docs / Outros</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Top Parâmetros + Top Padrões de Eventos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Top 10 Parâmetros */}
        <div className="lg:col-span-7 flat-card p-6 md:p-8 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-neu-card space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-heading font-bold text-gray-900 dark:text-slate-50 uppercase tracking-wider flex items-center gap-2">
              <Tag className="w-4 h-4 text-gray-500 dark:text-slate-400" />
              Top 10 Parâmetros Mais Utilizados
            </h3>
            <span className="text-xs font-ui text-gray-400">Frequência em snippets</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {stats.topParameters.map((param, idx) => (
              <div 
                key={param.name}
                className="p-3 bg-gray-50/80 dark:bg-slate-800/80 rounded-xl border border-gray-200 dark:border-slate-700 flex items-center justify-between shadow-neu-raised"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-heading font-bold text-gray-400 w-5">#{idx + 1}</span>
                  <span className="font-mono text-xs font-semibold text-gray-900 dark:text-slate-100 truncate">
                    {param.name}
                  </span>
                </div>
                <div className="text-right shrink-0 font-ui">
                  <span className="text-xs font-heading font-bold text-gray-900 dark:text-slate-50 tabular-nums">{param.count}x</span>
                  <span className="text-[10px] text-gray-400 block tabular-nums">{param.screens} telas</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 5 Padrões de Eventos */}
        <div className="lg:col-span-5 flat-card p-6 md:p-8 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-neu-card space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-heading font-bold text-gray-900 dark:text-slate-50 uppercase tracking-wider flex items-center gap-2">
              <Code2 className="w-4 h-4 text-gray-500 dark:text-slate-400" />
              Padrões de Eventos Recorrentes
            </h3>
          </div>

          <div className="space-y-3">
            {stats.topPatterns.length === 0 ? (
              <p className="text-xs font-ui text-gray-400 italic">Nenhum padrão estrutural catalogado.</p>
            ) : (
              stats.topPatterns.map((pat) => (
                <div 
                  key={pat.id}
                  className="p-3.5 bg-gray-50/80 dark:bg-slate-800/80 rounded-xl border border-gray-200 dark:border-slate-700 shadow-neu-raised grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 overflow-hidden"
                >
                  <div className="min-w-0 w-full max-w-full overflow-hidden">
                    <span className="font-mono text-xs font-semibold text-gray-900 dark:text-slate-100 block">
                      {pat.event || pat.id}
                    </span>
                    <span 
                      className="text-[10px] font-ui font-medium text-gray-500 dark:text-slate-400 block min-w-0 max-w-full whitespace-normal"
                      style={{
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-all'
                      }}
                    >
                      ID: {pat.id}
                    </span>
                  </div>
                  <span className="shrink-0 whitespace-nowrap px-2.5 py-1 bg-white dark:bg-slate-700 text-xs font-heading font-bold text-gray-800 dark:text-slate-200 rounded-lg border border-gray-200 dark:border-slate-600 shadow-neu-raised tabular-nums">
                    {pat.count}x
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Row 4: Ranking de Produtos por Mapas e por Telas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="flat-card min-w-0 p-6 md:p-8 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-neu-card space-y-4">
          <h3 className="text-sm font-heading font-bold text-gray-900 dark:text-slate-50 uppercase tracking-wider">
            Ranking de Produtos por Quantidade de Mapas
          </h3>
          <div className="space-y-2">
            {stats.topProductsByMaps.map((p, idx) => (
              <div 
                key={p.name}
                onClick={() => onFilterByProduct(p.name)}
                className="p-3 bg-gray-50 dark:bg-slate-800/80 hover:bg-red-50/50 dark:hover:bg-slate-750 rounded-xl border border-gray-200 dark:border-slate-700 flex items-center justify-between cursor-pointer transition-all shadow-neu-card hover:shadow-neu-raised"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-heading font-bold text-gray-400 w-5">#{idx + 1}</span>
                  <span className="text-xs font-ui font-bold text-gray-900 dark:text-slate-100">{p.name}</span>
                </div>
                <div className="flex items-center gap-2 font-ui">
                  <span className="text-xs font-heading font-bold text-bradesco-red tabular-nums">{p.maps} mapas</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flat-card min-w-0 p-6 md:p-8 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-neu-card space-y-4">
          <h3 className="text-sm font-heading font-bold text-gray-900 dark:text-slate-50 uppercase tracking-wider">
            Ranking de Produtos por Quantidade de Telas
          </h3>
          <div className="space-y-2">
            {stats.topProductsByScreens.map((p, idx) => (
              <div 
                key={p.name}
                onClick={() => onFilterByProduct(p.name)}
                className="p-3 bg-gray-50 dark:bg-slate-800/80 hover:bg-red-50/50 dark:hover:bg-slate-750 rounded-xl border border-gray-200 dark:border-slate-700 flex items-center justify-between cursor-pointer transition-all shadow-neu-card hover:shadow-neu-raised"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-heading font-bold text-gray-400 w-5">#{idx + 1}</span>
                  <span className="text-xs font-ui font-bold text-gray-900 dark:text-slate-100">{p.name}</span>
                </div>
                <div className="flex items-center gap-2 font-ui">
                  <span className="text-xs font-heading font-bold text-gray-800 dark:text-slate-200 tabular-nums">{p.screens} telas</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
