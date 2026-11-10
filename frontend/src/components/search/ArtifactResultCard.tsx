import React, { useMemo } from 'react';
import { HomologationBadge } from '../badges/HomologationBadge';
import { ExternalLink, ChevronRight, Network, Eye } from 'lucide-react';
import { Artifact } from '../../types';
import { isMap, isDocumentation, getArtifactTypeLabel } from '../../domain/artifacts';
import { getMapStatusMetrics } from '../../domain/status';
import { ArtifactTypeBadge } from '../badges/ArtifactTypeBadge';
import { MeasurementBadge } from '../badges/MeasurementBadge';
import { resolveArtifactTaxonomy } from '../../utils/taxonomyResolver';

export interface ArtifactResultCardProps {
  item: Artifact;
  activeSearch?: {
    mode?: 'conteudo' | 'parametros' | 'ia';
    query?: string;
    contentMatches?: Record<string, {
      matchType?: string;
      label?: string;
      score?: number;
    }>;
    parameterGroups?: Record<string, {
      bestQuality?: string;
      bestQualityLabel?: string;
      totalOccurrences?: number;
      uniqueScreensCount?: number;
      isPartial?: boolean;
      occurrences?: Array<{
        screenId?: string;
        screenIndex?: number;
        screenTitle?: string;
        snippetIndex?: number;
        event?: string;
        rawCodePreview?: string;
        rawCodeFull?: string;
      }>;
    }>;
  } | null;
  onOpenDetails: (item: Artifact) => void;
  onOpenSnippet?: (item: Artifact, target: { screenId?: string; snippetIndex?: number }) => void;
  onViewInTree: (artifactId: string) => void;
}

function formatPtBrDate(dateVal?: string | number | Date | null): string {
  if (!dateVal) return '—';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return String(dateVal);
  }
}

export const ArtifactResultCard: React.FC<ArtifactResultCardProps> = ({
  item,
  activeSearch,
  onOpenDetails,
  onOpenSnippet,
  onViewInTree,
}) => {
  const isMapArtifact = isMap(item);
  const screensCount = Array.isArray(item.screens) ? item.screens.length : 0;

  // Caminho taxonômico
  const breadcrumb = useMemo(() => {
    const parts: string[] = [];
    if (item.produto) parts.push(String(item.produto).trim());
    if (item.subproduto && String(item.subproduto).trim() !== 'Sem Subproduto') {
      parts.push(String(item.subproduto).trim());
    }
    if (Array.isArray(item.descendant_path_titles)) {
      item.descendant_path_titles.forEach((t) => {
        if (t && !parts.includes(t)) parts.push(t);
      });
    }
    if (parts.length === 0) {
      const resolved = resolveArtifactTaxonomy(item);
      if (resolved.displayPath) return resolved.displayPath;
      return 'Sem classificação';
    }
    return parts.join(' › ');
  }, [item]);

  // Match badge (quando busca ativa por conteúdo)
  const contentMatch = activeSearch?.mode === 'conteudo' ? activeSearch?.contentMatches?.[item.id] : null;
  const isExactMatch = contentMatch?.matchType === 'EXACT_ID' || contentMatch?.matchType === 'EXACT_TITLE';

  // Métricas de homologação
  const metrics = useMemo(() => {
    if (!isMapArtifact) return null;
    return getMapStatusMetrics(item);
  }, [isMapArtifact, item]);

  // Parâmetros / Snippet evidence
  const paramGroup = activeSearch?.mode === 'parametros' ? activeSearch?.parameterGroups?.[item.id] : null;
  const firstOcc = paramGroup?.occurrences?.[0];

  return (
    <article className="panel p-5 sm:p-6 hover:border-omni-bordo/30 hover:shadow-neu-card-hover transition-all relative flex flex-col gap-3 group">
      {/* Linha 1: Caminho e match badge */}
      <div className="flex items-center justify-between gap-3 min-w-0">
        <span 
          className="text-[12.5px] text-omni-muted truncate font-sans" 
          title={breadcrumb}
        >
          {breadcrumb}
        </span>

        {contentMatch && (
          <span
            className={`shrink-0 px-2.5 py-0.5 rounded-md text-[11px] font-medium font-sans ${
              isExactMatch
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 ring-1 ring-emerald-300'
                : 'bg-gray-100 text-omni-ink-secondary border border-omni-line'
            }`}
          >
            {contentMatch.label || (isExactMatch ? 'Correspondência exata' : 'Correspondência')}
          </span>
        )}
      </div>

      {/* Linha 2: Título com link externo */}
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => onOpenDetails(item)}
          className="text-left group/title inline-flex items-center gap-2 cursor-pointer"
        >
          <h3 className="text-[19px] font-heading font-bold text-omni-ink group-hover/title:text-omni-bordo transition-colors leading-snug">
            {item.titulo || item.id}
          </h3>
          <ExternalLink className="w-4 h-4 text-omni-muted group-hover/title:text-omni-bordo shrink-0 transition-colors" />
        </button>

        <span className="text-[11px] text-omni-muted font-mono shrink-0 select-all">
          ID: {item.id}
        </span>
      </div>

      {/* Linha 3: Metadados em linha única */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-omni-ink-secondary pt-0.5">
        {/* Badge Tipo de artefato */}
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-omni-ink-secondary text-[11.5px] font-medium border border-omni-line">
          {getArtifactTypeLabel(item.artifact_type)}
        </span>

        {/* Badge Mensuração */}
        {item.measurement_class && (
          <MeasurementBadge measurementClass={item.measurement_class} size="sm" />
        )}

        {/* Barra de Homologação para Mapas */}
        {isMapArtifact && metrics && (
          <span className="inline-flex items-center gap-2">
            <span className="text-omni-muted text-xs">•</span>
            <HomologationBadge
              variant="bar"
              status={metrics.homologationStatus}
              percentage={metrics.homologationPercentage}
            />
          </span>
        )}

        {/* Quantidade de Telas */}
        {isMapArtifact && (
          <>
            <span className="text-omni-muted text-xs">•</span>
            <span className="text-xs text-omni-ink-secondary">
              {screensCount} {screensCount === 1 ? 'tela' : 'telas'}
            </span>
          </>
        )}

        {/* Responsável */}
        <span className="text-omni-muted text-xs">•</span>
        <span className="text-xs text-omni-ink-secondary truncate max-w-[180px]">
          {item.responsavel ? item.responsavel : 'Sem responsável'}
        </span>

        {/* Data de atualização */}
        {item.ultima_atualizacao && (
          <>
            <span className="text-omni-muted text-xs">•</span>
            <span className="text-xs text-omni-muted">
              {formatPtBrDate(item.ultima_atualizacao)}
            </span>
          </>
        )}
      </div>

      {/* Linha 4 (quando aplicável): Evidência de busca por parâmetros */}
      {paramGroup && (
        <div className="mt-1 p-3.5 rounded-xl bg-omni-mist border border-omni-line flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white border border-omni-line text-omni-ink">
                {paramGroup.bestQualityLabel || 'Parâmetro encontrado'}
              </span>
              {paramGroup.isPartial && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  Correspondência parcial
                </span>
              )}
            </div>
            <span className="text-[11.5px] text-omni-muted font-sans">
              {paramGroup.totalOccurrences} {paramGroup.totalOccurrences === 1 ? 'ocorrência' : 'ocorrências'} em {paramGroup.uniqueScreensCount} {paramGroup.uniqueScreensCount === 1 ? 'tela' : 'telas'}
            </span>
          </div>

          {firstOcc && (
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex items-center justify-between text-xs text-omni-ink-secondary">
                <span className="font-medium truncate max-w-[300px]">
                  {firstOcc.screenTitle ? `Tela: ${firstOcc.screenTitle}` : `Tela #${(firstOcc.screenIndex ?? 0) + 1}`}
                  {firstOcc.event ? ` (Evento: ${firstOcc.event})` : ''}
                </span>
                {onOpenSnippet && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSnippet(item, {
                        screenId: firstOcc.screenId,
                        snippetIndex: firstOcc.snippetIndex,
                      });
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-omni-bordo hover:text-omni-rubi cursor-pointer"
                  >
                    <span>Abrir este snippet</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <pre className="p-3 rounded-lg bg-[#1A1D24] text-gray-100 font-mono text-[11.5px] leading-relaxed overflow-x-auto max-h-[160px] custom-scrollbar border border-black/20">
                <code>{firstOcc.rawCodePreview || firstOcc.rawCodeFull}</code>
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Linha 5: Ações */}
      <div className="flex items-center justify-between gap-3 pt-2 mt-0.5 border-t border-omni-line-subtle">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onOpenDetails(item)}
            className="text-xs font-semibold text-omni-bordo hover:text-omni-rubi inline-flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span>Ver detalhes</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onViewInTree(item.id)}
            className="text-xs font-medium text-omni-muted hover:text-omni-ink inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            title="Destacar artefato na árvore de conexões"
          >
            <Network className="w-3.5 h-3.5 text-omni-muted" />
            <span>Ver na árvore</span>
          </button>
        </div>
      </div>
    </article>
  );
};
