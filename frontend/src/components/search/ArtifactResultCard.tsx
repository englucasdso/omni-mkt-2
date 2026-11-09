import React from 'react';
import { ChevronRight, ExternalLink, Network, User, CalendarDays, Layers } from 'lucide-react';
import type { Artifact, ActiveSearch } from '../../types';
import { isMap, getArtifactTypeLabel } from '../../domain/artifacts';
import { getMapStatusMetrics } from '../../domain/status';
import { MeasurementBadge } from '../badges/MeasurementBadge';

interface ArtifactResultCardProps {
  item: Artifact;
  activeSearch: ActiveSearch | null;
  onOpenDetails: (item: Artifact, target?: { screenId?: string; snippetIndex?: number } | null) => void;
  onViewInTree: (id: string) => void;
}

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');
};

const HOMOLOGATION_STYLE = {
  HOMOLOGADO: { label: 'Homologado', bar: 'bg-emerald-600', text: 'text-emerald-700 dark:text-emerald-400' },
  PARCIAL: { label: 'Parcial', bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
  NAO_HOMOLOGADO: { label: 'Não homologado', bar: 'bg-gray-300', text: 'text-gray-600 dark:text-slate-400' },
  NAO_CALCULAVEL: { label: 'Sem telas reconhecidas', bar: 'bg-gray-200', text: 'text-gray-500' },
} as const;

const QUALITY_STYLE: Record<string, string> = {
  EXACT_SNIPPET: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  EXACT_CODE_SLICE: 'bg-teal-50 text-teal-800 border-teal-200',
  COMPATIBLE_OBJECT: 'bg-sky-50 text-sky-800 border-sky-200',
  SAME_PARAMETERS: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  PARAM_NAME_DIFF_VAL: 'bg-amber-50 text-amber-800 border-amber-200',
  PARAM_NAME_ONLY: 'bg-violet-50 text-violet-800 border-violet-200',
};

export const ArtifactResultCard: React.FC<ArtifactResultCardProps> = ({
  item,
  activeSearch,
  onOpenDetails,
  onViewInTree,
}) => {
  const mapArtifact = isMap(item);
  const metrics = mapArtifact ? getMapStatusMetrics(item) : null;
  const homologation = metrics ? HOMOLOGATION_STYLE[metrics.homologationStatus] : null;
  const pct = metrics?.homologationPercentage ?? null;

  const path = [item.produto, item.subproduto, ...(Array.isArray(item.descendant_path_titles) ? item.descendant_path_titles : [])]
    .map((p) => (p ? String(p).trim() : ''))
    .filter(Boolean);

  const contentMatch = activeSearch?.mode === 'conteudo' ? activeSearch.contentMatches?.[item.id] : undefined;
  const isExactMatch = contentMatch && (contentMatch.matchType === 'EXACT_ID' || contentMatch.matchType === 'EXACT_TITLE');
  const paramGroup = activeSearch?.mode === 'parametros' ? activeSearch.parameterGroups?.[item.id] : undefined;
  const firstOcc = paramGroup?.occurrences?.[0];
  const updated = formatDate(item.ultima_atualizacao);

  return (
    <article
      className={`group panel dark:border-slate-800 px-5 py-4 sm:px-6 sm:py-5 transition-[border-color,box-shadow] hover:border-[#C9CDD5] hover:shadow-neu-card-hover ${
        isExactMatch ? 'ring-1 ring-emerald-300 border-emerald-300' : ''
      }`}
    >
      {/* Caminho na árvore + tipo de correspondência */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <p className="text-[12.5px] text-gray-500 dark:text-slate-400 truncate min-w-0" title={path.join(' › ')}>
          {path.length > 0 ? path.join(' › ') : 'Sem produto'}
        </p>
        {contentMatch && (
          <span
            className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
              isExactMatch
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-omni-mist text-gray-600 border-omni-line'
            }`}
          >
            {contentMatch.label}
          </span>
        )}
      </div>

      {/* Título */}
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onOpenDetails(item, null)}
          className="text-left font-heading font-bold text-[19px] leading-snug tracking-[-0.01em] text-omni-ink dark:text-slate-50 hover:text-omni-bordo transition-colors cursor-pointer"
        >
          {item.titulo}
        </button>
        {item.link && (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 p-1 rounded text-gray-400 hover:text-omni-bordo"
            title="Abrir no Confluence"
            aria-label={`Abrir ${item.titulo} no Confluence`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Metadados */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-gray-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-md bg-omni-mist dark:bg-slate-800 border border-omni-line dark:border-slate-700 text-[11px] font-semibold text-omni-ink dark:text-slate-200">
            {getArtifactTypeLabel(item.artifact_type)}
          </span>
          {mapArtifact && <MeasurementBadge measurementClass={item.measurement_class} />}
        </span>

        {homologation && metrics && (
          <span className="inline-flex items-center gap-2" title={`${metrics.validated} de ${metrics.recognizedScreens} telas validadas`}>
            <span className="w-20 h-1.5 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden" aria-hidden="true">
              <span className={`block h-full rounded-full ${homologation.bar}`} style={{ width: `${pct ?? 0}%` }} />
            </span>
            <span className={`font-semibold tabular-nums ${homologation.text}`}>
              {homologation.label}{pct !== null && metrics.homologationStatus !== 'NAO_CALCULAVEL' ? ` ${pct}%` : ''}
            </span>
          </span>
        )}

        {metrics && metrics.totalScreens > 0 && (
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Layers className="w-3.5 h-3.5 text-gray-400" />
            {metrics.totalScreens} {metrics.totalScreens === 1 ? 'tela' : 'telas'}
          </span>
        )}

        <span className="inline-flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-gray-400" />
          {item.responsavel?.trim() || 'Sem responsável'}
        </span>

        {updated && (
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
            {updated}
          </span>
        )}
      </div>

      {/* Evidência da busca por parâmetros */}
      {paramGroup && (
        <div className="mt-4 rounded-lg border border-omni-line dark:border-slate-700 bg-omni-mist/60 dark:bg-slate-800/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${QUALITY_STYLE[paramGroup.bestQuality] || 'bg-white text-gray-700 border-omni-line'}`}>
                {paramGroup.bestQualityLabel}
              </span>
              {paramGroup.isPartial && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                  Correspondência parcial
                </span>
              )}
            </div>
            <span className="text-[11.5px] text-gray-500 tabular-nums">
              {paramGroup.totalOccurrences} {paramGroup.totalOccurrences === 1 ? 'ocorrência' : 'ocorrências'} em {paramGroup.uniqueScreensCount} {paramGroup.uniqueScreensCount === 1 ? 'tela' : 'telas'}
            </span>
          </div>
          {firstOcc && (
            <>
              <div className="flex items-center justify-between gap-3 text-[12px] text-gray-600 dark:text-slate-300 mb-1.5">
                <span className="truncate">
                  Tela {firstOcc.screenIndex + 1}{firstOcc.screenTitle ? `: ${firstOcc.screenTitle}` : ''}
                  {firstOcc.event ? `, evento ${firstOcc.event}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenDetails(item, { screenId: firstOcc.screenId, snippetIndex: firstOcc.snippetIndex })}
                  className="shrink-0 inline-flex items-center gap-1 font-semibold text-omni-bordo hover:underline cursor-pointer"
                >
                  Abrir este snippet
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <pre className="p-3 rounded-md bg-[#1A1D24] text-gray-100 text-[11.5px] leading-relaxed overflow-x-auto max-h-40 omni-scroll">
                <code>{firstOcc.rawCodePreview || firstOcc.rawCodeFull}</code>
              </pre>
            </>
          )}
        </div>
      )}

      {/* Ações */}
      <div className="mt-4 flex items-center gap-1 -ml-2">
        <button
          type="button"
          onClick={() => onOpenDetails(item, null)}
          className="inline-flex items-center gap-1 h-8 px-2 rounded-md text-[13px] font-semibold text-omni-bordo hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
        >
          Ver detalhes
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onViewInTree(item.id)}
          className="inline-flex items-center gap-1.5 h-8 px-2 rounded-md text-[13px] font-medium text-gray-600 dark:text-slate-300 hover:text-omni-ink hover:bg-omni-mist dark:hover:bg-slate-800 cursor-pointer"
          title="Abrir a árvore de Conexões com este item destacado"
        >
          <Network className="w-4 h-4" />
          Ver na árvore
        </button>
      </div>
    </article>
  );
};
