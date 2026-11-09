import React from 'react';
import { getMeasurementConfig } from '../../domain/measurement/measurementResolver';

interface MeasurementBadgeProps {
  measurementClass?: string | null;
  className?: string;
  size?: 'sm' | 'md';
}

export const MeasurementBadge: React.FC<MeasurementBadgeProps> = ({
  measurementClass,
  className = '',
  size = 'sm'
}) => {
  const config = getMeasurementConfig(measurementClass);
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center font-ui font-medium rounded-md border tracking-wide ${config.badgeClasses} ${sizeClasses} ${className}`}
      title={config.description}
    >
      {config.label}
    </span>
  );
};
