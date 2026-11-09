import React from 'react';
import { getStatusStyle } from '../../utils/statusUtils';

interface ScreenStatusBadgeProps {
  status?: string | null;
  className?: string;
  size?: 'sm' | 'md';
}

export const ScreenStatusBadge: React.FC<ScreenStatusBadgeProps> = ({
  status,
  className = '',
  size = 'sm'
}) => {
  const style = getStatusStyle(status);
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center font-ui font-medium rounded-md border ${style.bg} ${style.text} ${style.border} ${sizeClasses} ${className}`}
    >
      {style.label}
    </span>
  );
};
