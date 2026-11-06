import React from 'react';
import { Network, Eye, Code, Compass, CheckCircle2, AlertCircle, Info, Sparkles } from 'lucide-react';
import { Artifact } from '../../types';

export interface SearchResultCardProps {
  artifact: Artifact;
  mode: 'conteudo' | 'parametros' | 'ia';
  score?: number;
  matchedFields?: string[];
  screenId?: string;
  screenIndex?: number;
  screenTitle?: string;
  snippetIndex?: number;
  codeExcerpt?: string;
  matchedValue?: string;
  matchedCriteria?: string[];
  matchedValues?: string[];
  additionalMatchesCount?: number;
  aiConfidence?: 'ALTA' | 'MEDIA' | 'BAIXA';
  aiReason?: string;
  aiEvidences?: string[];
  onOpenDetails: (artifact: Artifact) => void;
  onOpenSnippet?: (artifact: Artifact, screenId?: string, snippetIndex?: number) => void;
  onViewInTree: (artifactId: string) => void;
  onOpenJourney?: (mapId: string) => void;
}

export const SearchResultCard: React.FC<SearchResultCardProps> = ({
  artifact,
  mode,
  screenId,
  screenIndex,
  screenTitle,
  snippetIndex,
  codeExcerpt,
  matchedFields,
  matchedValue,
  matchedCriteria,
  matchedValues,
  additionalMatchesCount = 0,
  aiConfidence,
  aiReason,
  aiEvidences,
  onOpenDetails,
  onOpenSnippet,
  onViewInTree,
  onOpenJourney,
}) => {
  const isMap = artifact.artifact_type === 'MAPA';
  const hasScreens = Array.isArray(artifact.screens) && artifact.screens.length > 0;
  const isJourneyEligible = isMap && hasScreens;

  const hasSnippetMatch = Boolean(
    screenId !== undefined || (typeof snippetIndex === 'number' && snippetIndex >= 0)
  );

  return (
    <div className="group rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-850 p-4 transition-all hover:border-[#7B0209] hover:shadow-md">
      {/* Header with Title and Badges */}
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                artifact.artifact_type === 'MAPA'
                  ? 'bg-red-100 text-[#E30328] dark:bg-red-950/40 dark:text-red-400'
                  : artifact.artifact_type === 'DOCUMENTACAO'
                  ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  : 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {artifact.artifact_type || 'ARTEFATO'}
            </span>

            {aiConfidence && (
              <span
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                  aiConfidence === 'ALTA'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                    : aiConfidence === 'MEDIA'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                Confiança {aiConfidence}
              </span>
            )}

            <span className="text-[11px] text-gray-400 font-mono">ID: {artifact.id}</span>
          </div>

          <h4 className="text-sm font-heading font-bold text-gray-900 dark:text-slate-100 leading-snug group-hover:text-[#7B0209] transition-colors">
            {artifact.titulo}
          </h4>
        </div>

        {/* Produto / Subproduto breadcrumbs */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500 dark:text-slate-400">
          {artifact.produto && (
            <span className="bg-gray-50 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-gray-100 dark:border-slate-700/50">
              {artifact.produto}
            </span>
          )}
          {artifact.subproduto && (
            <>
              <span className="text-gray-300">/</span>
              <span className="bg-gray-50 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-gray-100 dark:border-slate-700/50 font-medium">
                {artifact.subproduto}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Mode-Specific Context & Evidences */}
      {mode === 'ia' && (
        <div className="my-2.5 p-3 rounded-xl bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 text-xs space-y-1.5">
          {aiReason && (
            <p className="text-gray-800 dark:text-slate-200">
              <strong className="text-[#7B0209] dark:text-red-400 font-semibold">Por que apareceu: </strong>
              {aiReason}
            </p>
          )}
          {aiEvidences && aiEvidences.length > 0 && (
            <div className="text-[11px] text-gray-600 dark:text-slate-400 pt-1 border-t border-red-100/50 dark:border-red-900/20">
              <span className="font-semibold text-gray-700 dark:text-slate-300">Evidências:</span>
              <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                {aiEvidences.map((ev, idx) => (
                  <li key={idx} className="truncate">{ev}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {mode === 'parametros' && (
        <div className="my-2 p-2.5 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/40 text-xs space-y-1">
          {matchedCriteria && matchedCriteria.length > 0 && (
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-slate-400 mr-1">
                Critérios encontrados:
              </span>
              {matchedCriteria.map((crit, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded bg-white dark:bg-slate-700 text-[#7B0209] dark:text-red-400 font-medium border border-gray-200 dark:border-slate-600 text-[11px]"
                >
                  {crit}
                </span>
              ))}
            </div>
          )}

          {matchedValues && matchedValues.length > 0 && (
            <div className="text-[11px] text-gray-600 dark:text-slate-300 truncate">
              <span className="font-semibold">Valores: </span>
              {matchedValues.join(' | ')}
            </div>
          )}

          {additionalMatchesCount > 0 && (
            <div className="text-[10px] text-gray-400 italic">
              +{additionalMatchesCount} outro{additionalMatchesCount > 1 ? 's' : ''} snippet{additionalMatchesCount > 1 ? 's' : ''} correspondente{additionalMatchesCount > 1 ? 's' : ''} neste artefato.
            </div>
          )}
        </div>
      )}

      {mode === 'conteudo' && matchedFields && matchedFields.length > 0 && (
        <div className="my-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-gray-400 text-[10px] uppercase font-semibold">Correspondência em:</span>
          {matchedFields.map((f, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-medium text-[10px]"
            >
              {f}
            </span>
          ))}
          {matchedValue && (
            <span className="text-gray-500 dark:text-slate-400 font-mono text-[10px] truncate max-w-[280px]">
              ({matchedValue})
            </span>
          )}
        </div>
      )}

      {/* Screen & Code Excerpt if matched */}
      {hasSnippetMatch && (
        <div className="my-2 p-2 rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 text-[11px] space-y-1">
          <div className="flex items-center justify-between text-gray-500 dark:text-slate-400">
            <span className="font-semibold text-gray-700 dark:text-slate-300">
              {screenTitle ? `Tela: ${screenTitle}` : `Tela #${screenIndex || 1}`}
            </span>
            {typeof snippetIndex === 'number' && (
              <span className="font-mono text-[10px]">Snippet #{snippetIndex + 1}</span>
            )}
          </div>
          {codeExcerpt && (
            <pre className="font-mono text-[10px] bg-white dark:bg-slate-950 p-1.5 rounded border border-gray-100 dark:border-slate-800 text-gray-700 dark:text-slate-300 truncate overflow-x-auto">
              {codeExcerpt}
            </pre>
          )}
        </div>
      )}

      {/* Card Actions */}
      <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpenDetails(artifact)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-700 dark:text-slate-300 hover:text-[#7B0209] hover:bg-gray-50 dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            Ver detalhes
          </button>

          {hasSnippetMatch && onOpenSnippet && (
            <button
              type="button"
              onClick={() => onOpenSnippet(artifact, screenId, snippetIndex)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-[#7B0209] dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/40 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Code className="w-3.5 h-3.5 text-[#7B0209]" />
              Abrir snippet
            </button>
          )}

          <button
            type="button"
            onClick={() => onViewInTree(artifact.id)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-700 dark:text-slate-300 hover:text-[#7B0209] hover:bg-gray-50 dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
            title="Ver e destacar na árvore de conexões"
          >
            <Network className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#7B0209]" />
            Ver na árvore
          </button>

          {isJourneyEligible && onOpenJourney && (
            <button
              type="button"
              onClick={() => onOpenJourney(artifact.id)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-[#E30328] hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/40 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5 text-[#E30328]" />
              Abrir na jornada
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
