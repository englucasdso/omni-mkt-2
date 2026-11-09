import React from 'react';

interface HomologationIndicatorProps {
  percentage: number | null;
  className?: string;
  size?: 'sm' | 'md';
}

export const HomologationIndicator: React.FC<HomologationIndicatorProps> = ({
  percentage,
  className = '',
  size = 'sm'
}) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  if (percentage === null || percentage === undefined) {
    return (
      <span className={`inline-flex items-center font-ui font-medium rounded-md border bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 ${sizeClasses} ${className}`}>
        Não calculável
      </span>
    );
  }

  const is100 = percentage === 100;
  const isZero = percentage === 0;

  const colorClasses = is100
    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
    : isZero
    ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
    : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';

  return (
    <span className={`inline-flex items-center font-ui font-semibold rounded-md border tabular-nums ${colorClasses} ${sizeClasses} ${className}`}>
      {percentage}% homologado
    </span>
  );
};
