import React from 'react';
import { getStatusStyle } from '../../domain/status';

interface StatusBadgeProps {
  status?: string | null;
  className?: string;
}

/** Selo padrão do status de uma tela (Validado, Correção, Novo, Excluir, Descontinuar). */
export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const s = getStatusStyle(status);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md border shrink-0 ${s.bg} ${s.text} ${s.border} ${className}`}>
      {s.label}
    </span>
  );
};
