import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { ScreenStatusMetrics, calculateScreenStatusMetrics } from '../../domain/status/screenStatusMetrics';
import { Artifact, ScreenItem } from '../../types';

interface ScreenStatusSummaryProps {
  metrics?: ScreenStatusMetrics | null;
  artifact?: Artifact | null;
  screens?: ScreenItem[] | Array<{ status?: string | null }> | null;
  className?: string;
  showZeroStatuses?: boolean;
}

export const ScreenStatusSummary: React.FC<ScreenStatusSummaryProps> = ({
  metrics: propMetrics,
  artifact,
  screens,
  className = '',
  showZeroStatuses = true
}) => {
  const metrics = propMetrics || calculateScreenStatusMetrics(screens || artifact?.screens || []);

  if (metrics.totalScreens === 0) {
    return (
      <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          Sem telas detectadas
        </span>
        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          —
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {/* VALIDADO */}
      {(showZeroStatuses || metrics.validated > 0) && (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 tabular-nums">
          {metrics.validated} {metrics.validated === 1 ? 'Validada' : 'Validadas'}
        </span>
      )}

      {/* CORREÇÃO */}
      {(showZeroStatuses || metrics.correction > 0) && (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 tabular-nums">
          {metrics.correction} {metrics.correction === 1 ? 'Correção' : 'Correções'}
        </span>
      )}

      {/* NOVO */}
      {(showZeroStatuses || metrics.new > 0) && (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 tabular-nums">
          {metrics.new} {metrics.new === 1 ? 'Nova' : 'Novas'}
        </span>
      )}

      {/* EXCLUIR */}
      {(showZeroStatuses || metrics.exclude > 0) && (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 tabular-nums">
          {metrics.exclude} Excluir
        </span>
      )}

      {/* DESCONTINUAR */}
      {(showZeroStatuses || metrics.discontinue > 0) && (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 tabular-nums">
          {metrics.discontinue} Descontinuar
        </span>
      )}

      {/* Percentual homologado */}
      {metrics.recognizedScreens > 0 ? (
        <span
          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border tabular-nums ${
            metrics.homologationPercentage === 100
              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
          }`}
        >
          {metrics.homologationPercentage}% homologado
        </span>
      ) : (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          Não calculável
        </span>
      )}

      {/* Diagnóstico em caso de status não reconhecido */}
      {metrics.unrecognizedScreens > 0 && (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-100/70 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700 flex items-center gap-1">
          <AlertTriangle className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0" />
          {metrics.unrecognizedScreens} status não reconhecido{metrics.unrecognizedScreens > 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
};
