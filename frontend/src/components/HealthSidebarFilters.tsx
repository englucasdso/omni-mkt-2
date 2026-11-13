import React, { useMemo, useRef, useState } from 'react';
import { Artifact } from '../types';
import { isMap } from '../domain/artifacts/artifactSelectors';
import { DEFAULT_HEALTH_THRESHOLDS } from '../domain/health/documentationHealth';
import { SidebarFilterPopover, FilterSegmentedRow, FilterSearchableSingle } from './SidebarFilterPopover';

interface Props {
  artifacts: Artifact[];
  staleDays: number;
  onStaleDaysChange: (v: number) => void;
  wasteDays: number;
  onWasteDaysChange: (v: number) => void;
  product: string;
  onProductChange: (v: string) => void;
}

const isAll = (v: string) => !v || ['todos', 'todas', 'all', 'TODOS'].includes(v);

/** Botão Filtros da Saúde da documentação, no mesmo padrão das outras abas */
export const HealthSidebarFilters: React.FC<Props> = ({
  artifacts,
  staleDays,
  onStaleDaysChange,
  wasteDays,
  onWasteDaysChange,
  product,
  onProductChange,
}) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const products = useMemo(() => {
    const set = new Set<string>();
    (artifacts || []).forEach((a) => {
      if (isMap(a) && a.artifact_type === 'MAPA' && a.produto && String(a.produto).trim()) set.add(String(a.produto).trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [artifacts]);

  const activeCount =
    (staleDays !== DEFAULT_HEALTH_THRESHOLDS.staleDays ? 1 : 0) +
    (wasteDays !== DEFAULT_HEALTH_THRESHOLDS.wasteDays ? 1 : 0) +
    (product ? 1 : 0);

  return (
    <div className="flex items-center gap-2 min-w-0" id="sidebar-contextual-saude">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`h-8 shrink-0 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-all border cursor-pointer ${
          open || activeCount > 0
            ? 'bg-red-50 text-omni-bordo border-omni-bordo/30 font-semibold'
            : 'bg-white border-omni-line text-omni-ink-secondary hover:text-omni-ink hover:border-gray-300 shadow-neu-card'
        }`}
      >
        <span>Filtros</span>
        {activeCount > 0 && (
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-omni-bordo text-white">{activeCount}</span>
        )}
      </button>

      <SidebarFilterPopover
        isOpen={open}
        onClose={() => setOpen(false)}
        anchorRef={buttonRef}
        title="Filtros da saúde"
        activeCount={activeCount}
        onResetAll={() => {
          onStaleDaysChange(DEFAULT_HEALTH_THRESHOLDS.staleDays);
          onWasteDaysChange(DEFAULT_HEALTH_THRESHOLDS.wasteDays);
          onProductChange('');
        }}
      >
        <FilterSearchableSingle
          label="Produto"
          options={products}
          value={product || 'todos'}
          onChange={(v) => onProductChange(isAll(v) ? '' : v)}
          allOptionLabel="Todos os produtos"
          placeholder="Buscar produto..."
        />

        <div className="space-y-3 pt-1">
          <p className="text-xs font-ui font-semibold text-omni-ink">Regras de tempo</p>
          <FilterSegmentedRow
            label="Parado e Correção esquecida: sem atualizar há mais de"
            value={String(staleDays)}
            onChange={(v) => onStaleDaysChange(Number(v))}
            options={[
              { value: '60', label: '60 dias' },
              { value: '90', label: '90 dias' },
              { value: '180', label: '180 dias' },
            ]}
          />
          <FilterSegmentedRow
            label="Desperdício: sem atualizar há mais de"
            value={String(wasteDays)}
            onChange={(v) => onWasteDaysChange(Number(v))}
            options={[
              { value: '180', label: '180 dias' },
              { value: '365', label: '1 ano' },
              { value: '730', label: '2 anos' },
            ]}
          />
        </div>
      </SidebarFilterPopover>
    </div>
  );
};
