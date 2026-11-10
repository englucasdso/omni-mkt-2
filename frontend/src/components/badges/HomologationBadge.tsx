import React from 'react';
import { HOMOLOGATION_CONFIGS, HomologationStatus, formatHomologation } from '../../domain/status';

interface HomologationBadgeProps {
  status: HomologationStatus;
  percentage: number | null;
  /** "badge" = selo com borda; "bar" = barra de progresso + texto (usado nos cards). */
  variant?: 'badge' | 'bar';
  className?: string;
}

/** Representação única da homologação de um mapa em todas as telas. */
export const HomologationBadge: React.FC<HomologationBadgeProps> = ({ status, percentage, variant = 'badge', className = '' }) => {
  const cfg = HOMOLOGATION_CONFIGS[status];
  const text = formatHomologation(status, percentage);

  if (variant === 'bar') {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <span className="w-20 h-1.5 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden" aria-hidden="true">
          <span className={`block h-full rounded-full ${cfg.barClass}`} style={{ width: `${Math.max(4, percentage ?? 0)}%` }} />
        </span>
        <span className={`text-xs font-semibold tabular-nums ${cfg.textClass}`}>{text}</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md border tabular-nums ${cfg.badgeClasses} ${className}`}>
      {text}
    </span>
  );
};
