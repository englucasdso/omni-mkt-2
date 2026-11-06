import React from 'react';

interface FilterFieldProps {
  icon?: React.ElementType;
  label: string;
  children: React.ReactNode;
}

export const FilterField: React.FC<FilterFieldProps> = ({ icon: Icon, label, children }) => {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-ui font-bold uppercase tracking-wider text-gray-400 dark:text-slate-400 flex items-center gap-1.5 text-left">
        {Icon && <Icon className="w-3 h-3 text-bradesco-red shrink-0" />}
        {label}
      </label>
      {children}
    </div>
  );
};
