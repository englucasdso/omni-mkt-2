import React from 'react';
import { getArtifactTypeConfig } from '../../domain/artifacts/artifactLabels';

interface ArtifactTypeBadgeProps {
  type?: string | null;
  className?: string;
  size?: 'sm' | 'md';
}

export const ArtifactTypeBadge: React.FC<ArtifactTypeBadgeProps> = ({
  type,
  className = '',
  size = 'sm'
}) => {
  const config = getArtifactTypeConfig(type);
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center font-ui font-medium rounded-md border ${config.badgeClasses} ${sizeClasses} ${className}`}
      title={config.description}
    >
      {config.label}
    </span>
  );
};
