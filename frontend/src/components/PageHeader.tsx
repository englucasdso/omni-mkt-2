import React from 'react';

export interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, badge, actions }) => {
  return (
    <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 pt-6 pb-6 w-full">
      <div className="min-w-0 max-w-3xl">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-[26px] leading-tight font-heading font-bold tracking-[-0.02em] text-omni-ink dark:text-slate-50">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="text-[14px] text-gray-600 dark:text-slate-400 mt-1.5 leading-relaxed">{subtitle}</p>
        )}
      </div>

      {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
    </header>
  );
};
