import React from 'react';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  badge,
  actions,
}) => {
  return (
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-6 pb-6 mb-6 border-b border-gray-200/80 dark:border-slate-800/80 w-full transition-all">
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-heading font-bold tracking-tight text-gray-900 dark:text-slate-50 truncate">
              {title}
            </h1>
            {badge}
          </div>
          {subtitle && (
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 font-ui leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {actions}
        </div>
      )}
    </header>
  );
};
