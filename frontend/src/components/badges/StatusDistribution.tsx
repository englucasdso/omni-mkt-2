import React from 'react';
import { OFFICIAL_STATUSES, STATUS_CONFIGS, OfficialStatus } from '../../domain/status';

interface StatusDistributionProps {
  counts: Record<OfficialStatus, number>;
  /** Mostra a barra empilhada acima dos blocos (proporção de cada status) */
  showBar?: boolean;
  /** Quando informado, cada bloco vira um botão (ex.: abrir os mapas daquele status) */
  onSelect?: (status: OfficialStatus, event: React.MouseEvent) => void;
}

/**
 * Distribuição padrão dos 5 status oficiais das telas, com as cores de STATUS_CONFIGS.
 * Usada em Por produto e em Insights, para o mesmo dado ter a mesma cara.
 */
export const StatusDistribution: React.FC<StatusDistributionProps> = ({ counts, showBar = false, onSelect }) => {
  const total = OFFICIAL_STATUSES.reduce((acc, s) => acc + (counts[s] || 0), 0);
  return (
    <div className="space-y-3">
      {showBar && (
        <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-gray-100 gap-[2px]" aria-hidden="true">
          {OFFICIAL_STATUSES.filter((s) => (counts[s] || 0) > 0).map((s) => (
            <div key={s} style={{ width: `${(counts[s] / Math.max(total, 1)) * 100}%`, background: STATUS_CONFIGS[s].hex }} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {OFFICIAL_STATUSES.map((s) => {
          const cfg = STATUS_CONFIGS[s];
          const value = counts[s] || 0;
          const pct = total > 0 ? Math.round((value / total) * 100) : 0;
          const Tag: any = onSelect && value > 0 ? 'button' : 'div';
          return (
            <Tag
              key={s}
              type={Tag === 'button' ? 'button' : undefined}
              onClick={Tag === 'button' ? (e: React.MouseEvent) => onSelect!(s, e) : undefined}
              className={`p-3 rounded-xl border text-center ${cfg.bg} ${cfg.text} ${cfg.border} ${
                Tag === 'button' ? 'cursor-pointer hover:brightness-95 hover:shadow-sm transition-all' : ''
              }`}
              title={`${cfg.label}: ${value} telas (${pct}%)`}
            >
              <span className="text-lg font-heading font-bold block tabular-nums">{value.toLocaleString('pt-BR')}</span>
              <span className="text-[11px] font-medium">{cfg.label}</span>
              {showBar && <span className="block text-[10.5px] opacity-75 tabular-nums">{pct}%</span>}
            </Tag>
          );
        })}
      </div>
    </div>
  );
};
