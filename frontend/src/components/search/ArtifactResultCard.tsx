import React, { useMemo } from 'react';
import { HomologationBadge } from '../badges/HomologationBadge';
import { ExternalLink, ChevronRight, Eye } from 'lucide-react';
import { Artifact } from '../../types';
import { isMap, isDocumentation, getArtifactTypeLabel } from '../../domain/artifacts';
import { getMapStatusMetrics } from '../../domain/status';
import { ArtifactTypeBadge } from '../badges/ArtifactTypeBadge';
import { MeasurementBadge } from '../badges/MeasurementBadge';
import { resolveMeasurementClass } from '../../domain/measurement';
import { resolveArtifactTaxonomy } from '../../utils/taxonomyResolver';

export interface ArtifactResultCardProps {
  item: Artifact;
  activeSearch?: {
    mode?: 'conteudo' | 'parametros' | 'pergunta';
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
    questionMatches?: Record<string, {
      reason: string;
      evidence: string[];
      confidence: 'ALTA' | 'MEDIA' | 'BAIXA';
      screenId?: string;
      screenIndex?: number;
      screenTitle?: string;
      snippetIndex?: number;
      event?: string;
    }>;
  } | null;
  onOpenDetails: (item: Artifact) => void;
  onOpenSnippet?: (item: Artifact, target: { screenId?: string; snippetIndex?: number }) => void;
  /** Mantido por compatibilidade; o card não mostra mais "Ver na árvore" */
  onViewInTree?: (artifactId: string) => void;
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

  // Evidência da busca por pergunta
  const questionMatch = activeSearch?.mode === 'pergunta' ? activeSearch?.questionMatches?.[item.id] : null;
  const COVERAGE_LABEL = { ALTA: 'Todos os termos', MEDIA: 'Parte dos termos', BAIXA: 'Poucos termos' } as const;

  // O card inteiro abre o detalhe; botões e links internos param o clique antes
  const openDetails = () => {
    // Quem está selecionando texto (ID, trecho de código) não quer abrir o detalhe
    if (window.getSelection()?.toString()) return;
    onOpenDetails(item);
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  // "-" ou "—" vindo do Confluence significa que não há responsável
  const responsible = String(item.responsavel || '').trim().replace(/^[-—–]+$/, '');

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={openDetails}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDetails(item);
        }
      }}
      aria-label={`Abrir detalhes de ${item.titulo || item.id}`}
      className="panel p-5 sm:p-6 hover:border-omni-bordo/30 hover:shadow-neu-card-hover transition-all relative flex flex-col gap-3 group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-omni-bordo/30">
      {/* Linha 1: Caminho e match badge */}
      <div className="flex items-center justify-between gap-3 min-w-0">
        <span 
          className="text-[12.5px] text-omni-muted truncate font-sans" 
          title={breadcrumb}
        >
          {breadcrumb}
        </span>

        {questionMatch && (
          <span
            className={`shrink-0 px-2.5 py-0.5 rounded-md text-[11px] font-medium font-sans border ${
              questionMatch.confidence === 'ALTA'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : questionMatch.confidence === 'MEDIA'
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-gray-100 text-omni-ink-secondary border-omni-line'
            }`}
          >
            {COVERAGE_LABEL[questionMatch.confidence]}
          </span>
        )}

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

      {/* Linha 2: Título */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[19px] font-heading font-bold text-omni-ink group-hover:text-omni-bordo transition-colors leading-snug text-left">
          {item.titulo || item.id}
        </h3>

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
        {isMapArtifact && (
          <MeasurementBadge measurementClass={resolveMeasurementClass(item)} size="sm" />
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

      </div>

      {/* Linha 4 (quando aplicável): por que a pergunta trouxe este artefato */}
      {questionMatch && (questionMatch.reason || questionMatch.evidence.length > 0) && (
        <div className="mt-1 p-3.5 rounded-xl bg-omni-mist border border-omni-line flex flex-col gap-2">
          {questionMatch.reason && <p className="text-[13px] text-omni-ink leading-relaxed">{questionMatch.reason}</p>}
          {questionMatch.evidence.length > 0 && (
            <ul className="flex flex-col gap-1">
              {questionMatch.evidence.map((ev, i) => (
                <li key={i} className="text-xs text-omni-ink-secondary leading-relaxed pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[7px] before:w-1 before:h-1 before:rounded-full before:bg-omni-bordo/60">
                  {ev}
                </li>
              ))}
            </ul>
          )}
          {questionMatch.screenId && onOpenSnippet && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSnippet(item, { screenId: questionMatch.screenId, snippetIndex: questionMatch.snippetIndex ?? 0 });
              }}
              className="self-start inline-flex items-center gap-1.5 text-xs font-semibold text-omni-bordo hover:underline cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              Abrir {questionMatch.screenTitle ? questionMatch.screenTitle.split(':')[0] : 'tela'}
              {questionMatch.event ? ` · ${questionMatch.event}` : ''}
            </button>
          )}
        </div>
      )}

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
                    onClick={(e) => {
                      e.stopPropagation();
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

      {/* Linha 5: Confluence à esquerda; telas, responsável e data à direita */}
      <div className="flex items-center justify-between gap-3 pt-2 mt-0.5 border-t border-omni-line-subtle min-w-0">
        {item.link ? (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            onKeyDown={stop}
            title="Abrir a página no Confluence"
            className="shrink-0 text-xs font-medium text-omni-ink-secondary hover:text-omni-bordo inline-flex items-center gap-1.5 transition-colors"
          >
            <span>Confluence</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <span />
        )}

        <div className="flex items-center justify-end gap-x-2 min-w-0 text-xs text-omni-ink-secondary">
          {isMapArtifact && (
            <>
              <span className="shrink-0">
                {screensCount} {screensCount === 1 ? 'tela' : 'telas'}
              </span>
              <span className="text-omni-muted">•</span>
            </>
          )}
          <span className="truncate max-w-[220px]" title={responsible || undefined}>
            {responsible || 'Sem responsável'}
          </span>
          {item.ultima_atualizacao && (
            <>
              <span className="text-omni-muted">•</span>
              <span className="shrink-0 text-omni-muted">{formatPtBrDate(item.ultima_atualizacao)}</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
};
