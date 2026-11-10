import { Artifact, ScreenItem, SnippetItem, ParameterItem } from '../../types';
import { isRoot, getArtifactTypeLabel } from '../artifacts';
import { getMeasurementLabel, resolveMeasurementClass } from '../measurement';
import { getMapStatusMetrics, getStatusStyle, formatHomologation } from '../status';
import { daysSinceUpdate, getFreshnessLabel } from '../metrics/documentationFreshness';

/**
 * Relatórios exportáveis do OMNI ("Extrair dados").
 * Três níveis, colunas configuráveis, sempre derivados das regras canônicas de domain/.
 */

export type ReportLevel = 'artefatos' | 'telas' | 'parametros';
export type ReportFormat = 'excel' | 'csv' | 'json';
type Cell = string | number;

export interface ReportColumn<Row> {
  id: string;
  label: string;
  /** Faz parte da seleção padrão. */
  default?: boolean;
  value: (row: Row) => Cell;
}

interface ScreenRow { artifact: Artifact; screen: ScreenItem; position: number }
interface ParameterRow { artifact: Artifact; screen: ScreenItem; position: number; snippet: SnippetItem; snippetPosition: number; parameter: ParameterItem }

// ── Helpers de formatação ─────────────────────────────────────────────
const fmtDate = (value?: string | null): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('pt-BR');
};
const joinPath = (a: Artifact) =>
  [a.produto, a.subproduto, ...(Array.isArray(a.descendant_path_titles) ? a.descendant_path_titles : [])]
    .map((p) => (p ? String(p).trim() : ''))
    .filter(Boolean)
    .join(' > ');
const screenNumber = (screen: ScreenItem, position: number) =>
  typeof screen.screen_index === 'number' && screen.screen_index >= 0 ? screen.screen_index + 1 : position + 1;
const screenName = (screen: ScreenItem) =>
  String((screen as any).screen_name || screen.instruction || '').trim();
const distinct = (values: string[]) => Array.from(new Set(values.filter(Boolean)));
/** Valor legível do parâmetro: sem as aspas do código-fonte, preservando acentos. */
const parameterValue = (p: ParameterItem): string => {
  if (p.value !== undefined && p.value !== null) return String(p.value);
  const raw = String(p.raw_value ?? '').trim();
  const m = raw.match(/^(['"`])([\s\S]*)\1$/);
  return m ? m[2] : raw;
};

// ── Catálogo de colunas por nível ─────────────────────────────────────
const commonMapColumns = <Row extends { artifact: Artifact }>(): ReportColumn<Row>[] => [
  { id: 'mapa_id', label: 'ID do mapa', default: true, value: (r) => r.artifact.id },
  { id: 'mapa_titulo', label: 'Mapa', default: true, value: (r) => r.artifact.titulo },
  { id: 'produto', label: 'Produto', default: true, value: (r) => r.artifact.produto || '' },
  { id: 'subproduto', label: 'Subproduto', default: true, value: (r) => r.artifact.subproduto || '' },
  { id: 'mensuracao_mapa', label: 'Mensuração do mapa', value: (r) => getMeasurementLabel(resolveMeasurementClass(r.artifact)) },
  { id: 'link', label: 'Link no Confluence', value: (r) => r.artifact.link || '' },
];

export const ARTIFACT_COLUMNS: ReportColumn<Artifact>[] = [
  { id: 'id', label: 'ID', default: true, value: (a) => a.id },
  { id: 'titulo', label: 'Título', default: true, value: (a) => a.titulo },
  { id: 'tipo', label: 'Tipo', default: true, value: (a) => getArtifactTypeLabel(a.artifact_type) },
  { id: 'mensuracao', label: 'Mensuração', default: true, value: (a) => getMeasurementLabel(resolveMeasurementClass(a)) },
  { id: 'produto', label: 'Produto', default: true, value: (a) => a.produto || '' },
  { id: 'subproduto', label: 'Subproduto', default: true, value: (a) => a.subproduto || '' },
  { id: 'caminho', label: 'Caminho na árvore', value: joinPath },
  { id: 'homologacao', label: 'Homologação', default: true, value: (a) => {
    const m = getMapStatusMetrics(a);
    return a.artifact_type === 'MAPA' ? formatHomologation(m.homologationStatus, m.homologationPercentage) : '';
  } },
  { id: 'homologacao_pct', label: '% homologado', value: (a) => {
    const p = getMapStatusMetrics(a).homologationPercentage;
    return a.artifact_type === 'MAPA' && p !== null ? p : '';
  } },
  { id: 'telas_total', label: 'Telas', default: true, value: (a) => getMapStatusMetrics(a).totalScreens },
  { id: 'telas_validado', label: 'Telas validadas', value: (a) => getMapStatusMetrics(a).validated },
  { id: 'telas_correcao', label: 'Telas em correção', value: (a) => getMapStatusMetrics(a).correction },
  { id: 'telas_novo', label: 'Telas novas', value: (a) => getMapStatusMetrics(a).new },
  { id: 'telas_excluir', label: 'Telas para excluir', value: (a) => getMapStatusMetrics(a).exclude },
  { id: 'telas_descontinuar', label: 'Telas para descontinuar', value: (a) => getMapStatusMetrics(a).discontinue },
  { id: 'status_declarado', label: 'Status declarado no cabeçalho', value: (a) => a.declared_status || '' },
  { id: 'divergencia', label: 'Divergência de status', value: (a) => (a.status_divergent ? 'Sim' : 'Não') },
  { id: 'responsavel', label: 'Responsável', default: true, value: (a) => a.responsavel?.trim() || '' },
  { id: 'versao', label: 'Versão', value: (a) => a.versao ?? '' },
  { id: 'atualizado_em', label: 'Atualizado em', default: true, value: (a) => fmtDate(a.ultima_atualizacao) },
  { id: 'dias_sem_atualizar', label: 'Dias sem atualizar', value: (a) => daysSinceUpdate(a) ?? '' },
  { id: 'idade', label: 'Idade da documentação', value: (a) => getFreshnessLabel(daysSinceUpdate(a)) },
  { id: 'gtm_ids', label: 'GTM IDs', value: (a) => (a.gtm_ids || []).join(', ') || a.gtm_id || '' },
  { id: 'task', label: 'Nº da task', value: (a) => a.numero_da_task || '' },
  { id: 'link', label: 'Link no Confluence', default: true, value: (a) => a.link || '' },
];

export const SCREEN_COLUMNS: ReportColumn<ScreenRow>[] = [
  ...commonMapColumns<ScreenRow>(),
  { id: 'tela_n', label: 'Nº da tela', default: true, value: (r) => screenNumber(r.screen, r.position) },
  { id: 'tela_nome', label: 'Tela', default: true, value: (r) => screenName(r.screen) },
  { id: 'status', label: 'Status da tela', default: true, value: (r) => getStatusStyle(r.screen.status).label },
  { id: 'instrucao', label: 'Instrução', value: (r) => r.screen.instruction || '' },
  { id: 'eventos', label: 'Eventos', default: true, value: (r) => distinct((r.screen.snippets || []).map((s) => s.event_raw)).join(', ') },
  { id: 'mensuracao_tela', label: 'Mensuração da tela', value: (r) =>
      distinct((r.screen.snippets || []).map((s) => getMeasurementLabel(s.measurement_class))).join(', ') },
  { id: 'snippets', label: 'Snippets', default: true, value: (r) => (r.screen.snippets || []).length },
  { id: 'parametros', label: 'Parâmetros', default: true, value: (r) =>
      (r.screen.snippets || []).reduce((n, s) => n + (s.parameters?.length || 0), 0) },
];

export const PARAMETER_COLUMNS: ReportColumn<ParameterRow>[] = [
  ...commonMapColumns<ParameterRow>(),
  { id: 'tela_n', label: 'Nº da tela', default: true, value: (r) => screenNumber(r.screen, r.position) },
  { id: 'tela_nome', label: 'Tela', value: (r) => screenName(r.screen) },
  { id: 'status', label: 'Status da tela', default: true, value: (r) => getStatusStyle(r.screen.status).label },
  { id: 'snippet_n', label: 'Nº do snippet', value: (r) => r.snippetPosition + 1 },
  { id: 'evento', label: 'Evento', default: true, value: (r) => r.snippet.event_raw || '' },
  { id: 'chave', label: 'Parâmetro', default: true, value: (r) => r.parameter.name || r.parameter.name_raw || '' },
  { id: 'caminho', label: 'Caminho no objeto', default: true, value: (r) => r.parameter.path || '' },
  { id: 'valor', label: 'Valor', default: true, value: (r) => parameterValue(r.parameter) },
  { id: 'tipo_valor', label: 'Tipo do valor', value: (r) => r.parameter.value_type || '' },
  { id: 'mensuracao_snippet', label: 'Mensuração do snippet', value: (r) => getMeasurementLabel(r.snippet.measurement_class) },
];

export const REPORT_LEVELS: Record<ReportLevel, { label: string; rowLabel: string; columns: ReportColumn<any>[] }> = {
  artefatos: { label: 'Artefatos', rowLabel: 'artefato', columns: ARTIFACT_COLUMNS },
  telas: { label: 'Telas', rowLabel: 'tela', columns: SCREEN_COLUMNS },
  parametros: { label: 'Parâmetros', rowLabel: 'parâmetro', columns: PARAMETER_COLUMNS },
};

export const defaultColumnIds = (level: ReportLevel) =>
  REPORT_LEVELS[level].columns.filter((c) => c.default).map((c) => c.id);

// ── Linhas por nível ──────────────────────────────────────────────────
export function buildRows(level: ReportLevel, artifacts: Artifact[]): unknown[] {
  const items = (artifacts || []).filter((a) => !isRoot(a));
  if (level === 'artefatos') return items;

  const screenRows: ScreenRow[] = [];
  for (const artifact of items) {
    (artifact.screens || []).forEach((screen, position) => screenRows.push({ artifact, screen, position }));
  }
  if (level === 'telas') return screenRows;

  const paramRows: ParameterRow[] = [];
  for (const sr of screenRows) {
    (sr.screen.snippets || []).forEach((snippet, snippetPosition) => {
      (snippet.parameters || []).forEach((parameter) => paramRows.push({ ...sr, snippet, snippetPosition, parameter }));
    });
  }
  return paramRows;
}

export function buildTable(level: ReportLevel, artifacts: Artifact[], columnIds: string[]) {
  const all = REPORT_LEVELS[level].columns;
  const columns = columnIds.map((id) => all.find((c) => c.id === id)).filter(Boolean) as ReportColumn<any>[];
  const rows = buildRows(level, artifacts);
  return { columns, rows, cells: (row: unknown) => columns.map((c) => c.value(row)) };
}

// ── Serialização ──────────────────────────────────────────────────────
/** Evita que o Excel interprete conteúdo do Confluence como fórmula (=, +, @, -texto). */
const neutralizeFormula = (text: string) => (/^[=+@]|^-[^\d\s]/.test(text) ? `'${text}` : text);

const csvCell = (value: Cell, sep: string) => {
  if (typeof value === 'number') return sep === ';' ? String(value).replace('.', ',') : String(value);
  const text = neutralizeFormula(String(value ?? '').replace(/\r?\n/g, ' ').trim());
  return /["\n;,]/.test(text) || text.includes(sep) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function serializeReport(level: ReportLevel, artifacts: Artifact[], columnIds: string[], format: ReportFormat) {
  const { columns, rows, cells } = buildTable(level, artifacts, columnIds);
  const date = new Date().toISOString().slice(0, 10);
  const base = `omni_${level}_${date}`;

  if (format === 'json') {
    const data = rows.map((row) => Object.fromEntries(columns.map((c) => [c.id, c.value(row)])));
    return { content: JSON.stringify(data, null, 2), filename: `${base}.json`, mime: 'application/json', rowCount: rows.length };
  }

  // Excel em português usa ";" como separador e precisa do BOM para manter a acentuação.
  const sep = format === 'excel' ? ';' : ',';
  const lines = [
    columns.map((c) => csvCell(c.label, sep)).join(sep),
    ...rows.map((row) => cells(row).map((v) => csvCell(v, sep)).join(sep)),
  ];
  return {
    content: '﻿' + lines.join('\r\n'),
    filename: `${base}.csv`,
    mime: 'text/csv;charset=utf-8',
    rowCount: rows.length,
  };
}
