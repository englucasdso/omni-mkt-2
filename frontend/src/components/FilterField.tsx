import React from 'react';

interface FilterFieldProps {
  icon?: React.ElementType;
  label: string;
  children: React.ReactNode;
}

export const FilterField: React.FC<FilterFieldProps> = ({ icon: Icon, label, children }) => {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-ui font-semibold text-omni-ink-secondary flex items-center gap-1.5 text-left">
        {Icon && <Icon className="w-3.5 h-3.5 text-omni-bordo shrink-0" />}
        {label}
      </label>
      {children}
    </div>
  );
};
