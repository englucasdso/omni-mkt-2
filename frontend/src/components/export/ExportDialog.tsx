import React, { useEffect, useMemo, useState } from 'react';
import { X, Download, Check } from 'lucide-react';
import type { Artifact } from '../../types';
import {
  REPORT_LEVELS,
  ReportLevel,
  ReportFormat,
  buildTable,
  buildRows,
  defaultColumnIds,
  serializeReport,
} from '../../domain/export/reportBuilder';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  /** O que está na tela agora (cards ou inventário com filtros aplicados). */
  currentItems: Artifact[];
  /** Base inteira sincronizada. */
  allItems: Artifact[];
  /** Nome da tela de origem, para o texto da opção "Resultado atual". */
  sourceLabel: string;
}

type Scope = 'atual' | 'base';

interface SavedConfig {
  level: ReportLevel;
  format: ReportFormat;
  columns: Partial<Record<ReportLevel, string[]>>;
}

const STORAGE_KEY = 'omni.export.config';

const loadConfig = (): SavedConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* sem armazenamento: usa o padrão */
  }
  return { level: 'artefatos', format: 'excel', columns: {} };
};

const saveConfig = (cfg: SavedConfig) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* preferência vale só nesta sessão */
  }
};

const FORMATS: { id: ReportFormat; label: string; hint: string }[] = [
  { id: 'excel', label: 'Excel', hint: 'Abre direto no Excel em português, com acentos.' },
  { id: 'csv', label: 'CSV', hint: 'Separado por vírgula, para outras ferramentas.' },
  { id: 'json', label: 'JSON', hint: 'Para integrações e scripts.' },
];

const downloadFile = (content: string, filename: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const plural = (n: number, singular: string) => {
  const p = singular.endsWith('ão') ? singular.replace(/ão$/, 'ões') : `${singular}s`;
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : p}`;
};

export const ExportDialog: React.FC<ExportDialogProps> = ({ open, onClose, currentItems, allItems, sourceLabel }) => {
  const [config, setConfig] = useState<SavedConfig>(loadConfig);
  const [scope, setScope] = useState<Scope>('atual');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const level = config.level;
  const levelDef = REPORT_LEVELS[level];
  const selected = config.columns[level] ?? defaultColumnIds(level);
  const source = scope === 'atual' ? currentItems : allItems;

  const rowCounts = useMemo(() => {
    if (!open) return { artefatos: 0, telas: 0, parametros: 0 };
    return {
      artefatos: buildRows('artefatos', source).length,
      telas: buildRows('telas', source).length,
      parametros: buildRows('parametros', source).length,
    };
  }, [open, source]);

  const preview = useMemo(() => {
    if (!open) return null;
    const table = buildTable(level, source, selected);
    return { columns: table.columns, rows: table.rows.slice(0, 3).map(table.cells) };
  }, [open, level, source, selected]);

  if (!open) return null;

  const update = (patch: Partial<SavedConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    saveConfig(next);
  };
  const setColumns = (ids: string[]) => {
    // mantém a ordem do catálogo, não a ordem do clique
    const ordered = levelDef.columns.map((c) => c.id).filter((id) => ids.includes(id));
    update({ columns: { ...config.columns, [level]: ordered } });
  };
  const toggleColumn = (id: string) =>
    setColumns(selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id]);

  const handleDownload = () => {
    const out = serializeReport(level, source, selected, config.format);
    downloadFile(out.content, out.filename, out.mime);
    onClose();
  };

  const rowCount = rowCounts[level];
  const canDownload = selected.length > 0 && rowCount > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-omni-ink/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-title"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-xl shadow-overlay border border-omni-line dark:border-slate-700">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-omni-line dark:border-slate-800">
          <div>
            <h2 id="export-title" className="text-[19px] font-heading font-bold text-omni-ink dark:text-slate-50">Extrair dados</h2>
            <p className="text-[13px] text-gray-500 mt-0.5">Escolha o nível do relatório, as colunas e o formato.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:text-omni-ink hover:bg-omni-mist cursor-pointer" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto omni-scroll px-6 py-5 space-y-6">
          {/* Nível */}
          <section>
            <h3 className="text-[13px] font-semibold text-omni-ink mb-2">O que exportar</h3>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Nível do relatório">
              {(Object.keys(REPORT_LEVELS) as ReportLevel[]).map((id) => {
                const active = level === id;
                return (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={active}
                    onClick={() => update({ level: id })}
                    className={`text-left rounded-lg border px-3.5 py-3 transition-colors cursor-pointer ${
                      active ? 'border-omni-bordo bg-red-50/60 dark:bg-red-950/20' : 'border-omni-line hover:border-[#C9CDD5]'
                    }`}
                  >
                    <span className={`block text-[13.5px] font-semibold ${active ? 'text-omni-bordo' : 'text-omni-ink dark:text-slate-100'}`}>
                      {REPORT_LEVELS[id].label}
                    </span>
                    <span className="block text-[12px] text-gray-500 tabular-nums">
                      {plural(rowCounts[id], id === 'parametros' ? 'linha' : REPORT_LEVELS[id].rowLabel)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Origem */}
          <section>
            <h3 className="text-[13px] font-semibold text-omni-ink mb-2">De onde</h3>
            <div className="flex flex-wrap gap-2">
              {([
                { id: 'atual', label: `${sourceLabel}: ${plural(currentItems.filter((a) => a.artifact_type !== 'RAIZ').length, 'artefato')}` },
                { id: 'base', label: `Base completa: ${plural(allItems.filter((a) => a.artifact_type !== 'RAIZ').length, 'artefato')}` },
              ] as { id: Scope; label: string }[]).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setScope(opt.id)}
                  aria-pressed={scope === opt.id}
                  className={`h-9 px-3.5 rounded-lg border text-[13px] tabular-nums cursor-pointer transition-colors ${
                    scope === opt.id ? 'border-omni-bordo text-omni-bordo bg-red-50/60 font-semibold' : 'border-omni-line text-gray-600 hover:border-[#C9CDD5]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          {/* Colunas */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[13px] font-semibold text-omni-ink">
                Colunas <span className="font-normal text-gray-500 tabular-nums">({selected.length} de {levelDef.columns.length})</span>
              </h3>
              <div className="flex items-center gap-1 text-[12.5px]">
                <button onClick={() => setColumns(defaultColumnIds(level))} className="px-2 py-1 rounded text-omni-bordo hover:bg-red-50 cursor-pointer">Padrão</button>
                <button onClick={() => setColumns(levelDef.columns.map((c) => c.id))} className="px-2 py-1 rounded text-omni-bordo hover:bg-red-50 cursor-pointer">Todas</button>
                <button onClick={() => setColumns([])} className="px-2 py-1 rounded text-gray-500 hover:bg-omni-mist cursor-pointer">Limpar</button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {levelDef.columns.map((col) => {
                const on = selected.includes(col.id);
                return (
                  <button
                    key={col.id}
                    onClick={() => toggleColumn(col.id)}
                    role="checkbox"
                    aria-checked={on}
                    className={`flex items-center gap-2 text-left h-9 px-2.5 rounded-md border text-[12.5px] cursor-pointer transition-colors ${
                      on ? 'border-omni-bordo/40 bg-red-50/40 text-omni-ink' : 'border-omni-line text-gray-600 hover:border-[#C9CDD5]'
                    }`}
                  >
                    <span className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${on ? 'bg-omni-bordo border-omni-bordo' : 'border-gray-300 bg-white'}`}>
                      {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </span>
                    <span className="truncate">{col.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Pré-visualização */}
          {preview && preview.columns.length > 0 && (
            <section>
              <h3 className="text-[13px] font-semibold text-omni-ink mb-2">Pré-visualização</h3>
              {preview.rows.length === 0 ? (
                <p className="text-[12.5px] text-gray-500">Nenhuma linha para exportar com essa combinação.</p>
              ) : (
                <div className="overflow-x-auto omni-scroll rounded-lg border border-omni-line">
                  <table className="min-w-full text-[12px]">
                    <thead className="bg-[#FAFAFB]">
                      <tr>
                        {preview.columns.map((c) => (
                          <th key={c.id} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap border-b border-omni-line">{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((cells, i) => (
                        <tr key={i} className="border-b border-omni-line last:border-0">
                          {cells.map((v, j) => (
                            <td key={j} className="px-3 py-2 text-omni-ink whitespace-nowrap max-w-[220px] truncate tabular-nums">{String(v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-t border-omni-line dark:border-slate-800">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-omni-mist" role="radiogroup" aria-label="Formato">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                role="radio"
                aria-checked={config.format === f.id}
                title={f.hint}
                onClick={() => update({ format: f.id })}
                className={`h-8 px-3 rounded-md text-[12.5px] font-semibold cursor-pointer ${
                  config.format === f.id ? 'bg-white text-omni-bordo shadow-neu-raised' : 'text-gray-600 hover:text-omni-ink'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button onClick={handleDownload} disabled={!canDownload} className="btn-primary inline-flex flex-row items-center gap-2 h-10 px-5 text-[13px] cursor-pointer">
            <Download className="w-4 h-4" />
            Baixar {plural(rowCount, 'linha')}
          </button>
        </div>
      </div>
    </div>
  );
};
