import React, { useMemo, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { Artifact } from '../types';
import {
  analyzeDocumentationHealth,
  formatAge,
  HealthGroup,
  HealthKind,
  HEALTH_KIND_LABEL,
} from '../domain/health/documentationHealth';
import { STATUS_CONFIGS } from '../domain/status';

interface Props {
  artifacts: Artifact[];
  /** Limites e produto vêm do botão Filtros, no topo */
  staleDays: number;
  wasteDays: number;
  product: string;
  onOpenMap: (map: Artifact) => void;
  /** Abre os mapas em Cards (mesmo clique dos Insights) */
  onDrillDown: (label: string, ids: string[], target: 'cards' | 'inventario') => void;
}

const fmt = (n: number) => n.toLocaleString('pt-BR');
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);
const NEUTRAL_BAR = '#64748b';

/** Cor de cada situação: desperdício e correção usam as cores dos status de origem */
const KIND_HEX: Record<HealthKind, string> = {
  DESPERDICIO: STATUS_CONFIGS.NOVO.hex,
  CORRECAO_ESQUECIDA: STATUS_CONFIGS['CORREÇÃO'].hex,
  PARADO: NEUTRAL_BAR,
};

const Panel: React.FC<{ title: string; hint?: React.ReactNode; className?: string; children: React.ReactNode }> = ({
  title,
  hint,
  className = '',
  children,
}) => (
  <section className={`panel min-w-0 p-6 space-y-4 ${className}`}>
    <div className="flex items-start justify-between gap-3">
      <h3 className="text-base font-heading font-bold text-omni-ink">{title}</h3>
      {hint}
    </div>
    {children}
  </section>
);

const Bars: React.FC<{
  rows: Array<{ key: string; label: string; value: number; detail?: string; ids: string[] }>;
  color: string;
  unit: [string, string];
  onClick: (label: string, ids: string[]) => void;
}> = ({ rows, color, unit, onClick }) => {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) return <p className="text-xs text-omni-muted">Nada nesta situação.</p>;
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => onClick(r.label, r.ids)}
          disabled={!r.ids.length}
          title={`${r.label}: ${fmt(r.value)} ${r.value === 1 ? unit[0] : unit[1]}${r.detail ? `, ${r.detail}` : ''}`}
          className="w-full flex items-center gap-3 py-1.5 px-1 rounded-lg text-left hover:bg-omni-mist disabled:hover:bg-transparent cursor-pointer disabled:cursor-default group"
        >
          <span className="w-44 shrink-0 text-xs text-omni-ink truncate group-hover:text-omni-bordo">{r.label}</span>
          <span className="flex-1 h-2 rounded-full bg-omni-mist overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </span>
          <span className="w-16 shrink-0 text-right text-xs font-semibold text-omni-ink tabular-nums">{fmt(r.value)}</span>
          {r.detail !== undefined && (
            <span className="w-20 shrink-0 text-right text-[11px] text-omni-muted tabular-nums">{r.detail}</span>
          )}
        </button>
      ))}
    </div>
  );
};

export const DocumentationHealthView: React.FC<Props> = ({ artifacts, staleDays, wasteDays, product, onOpenMap, onDrillDown }) => {
  const [showHelp, setShowHelp] = useState(false);
  const [groupBy, setGroupBy] = useState<'produto' | 'responsavel'>('produto');
  const [kindFilter, setKindFilter] = useState<HealthKind | 'TODOS'>('TODOS');
  const [showAll, setShowAll] = useState(false);

  const scoped = useMemo(
    () => (product ? (artifacts || []).filter((a) => String(a.produto || '').trim() === product) : artifacts),
    [artifacts, product]
  );
  const report = useMemo(
    () => analyzeDocumentationHealth(scoped, { staleDays, wasteDays: Math.max(wasteDays, staleDays) }),
    [scoped, staleDays, wasteDays]
  );

  const drill = (label: string, ids: string[]) => ids.length && onDrillDown(label, ids, 'cards');

  const listAll = kindFilter === 'TODOS' ? report.items : report.items.filter((i) => i.kind === kindFilter);
  const list = showAll ? listAll : listAll.slice(0, 25);
  const groups: HealthGroup[] = groupBy === 'produto' ? report.wasteByProduct : report.wasteByOwner;

  const tiles: Array<{ kind: HealthKind; title: string; detail: string }> = [
    {
      kind: 'DESPERDICIO',
      title: 'Desperdício',
      detail: `${fmt(report.wasteScreens)} telas criadas e nunca validadas, sem atualização há mais de ${wasteDays} dias`,
    },
    {
      kind: 'CORRECAO_ESQUECIDA',
      title: 'Correção esquecida',
      detail: `${fmt(report.byKind.CORRECAO_ESQUECIDA.screens)} telas em Correção ou Novo, paradas há mais de ${staleDays} dias`,
    },
    {
      kind: 'PARADO',
      title: 'Parado',
      detail: `${fmt(report.byKind.PARADO.screens)} telas em Novo, sem atualização há mais de ${staleDays} dias`,
    },
  ];

  return (
    <div className="space-y-6 pb-16">
      {/* Cabeçalho com "Como funciona" */}
      <div className="max-w-3xl">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-heading font-bold text-omni-ink">
            Saúde da documentação{product ? `: ${product}` : ''}
          </h2>
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            aria-expanded={showHelp}
            aria-label="Como funciona"
            title="Como funciona"
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              showHelp ? 'bg-omni-bordo/10 text-omni-bordo' : 'text-omni-muted hover:text-omni-bordo hover:bg-omni-mist'
            }`}
          >
            <HelpCircle className="w-[18px] h-[18px]" />
          </button>
        </div>
        <p className="text-sm text-omni-ink-secondary mt-1 leading-relaxed">
          Mapas que pararam no meio do caminho: sem atualização há muito tempo e com telas que ainda não foram validadas.
        </p>

        {showHelp && (
          <div className="relative mt-3 rounded-xl border border-omni-line bg-white p-4 pr-10 text-sm text-omni-ink-secondary leading-relaxed space-y-2">
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              aria-label="Fechar explicação"
              className="absolute top-3 right-3 p-1 rounded-md text-omni-muted hover:text-omni-ink cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <p className="font-semibold text-omni-ink">Como funciona</p>
            <p>
              Para cada mapa, o OMNI olha o status das telas e a data da última atualização no Confluence. Cada mapa entra numa só
              situação, a mais grave:
            </p>
            <ul className="space-y-1.5">
              <li className="flex gap-2">
                <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: KIND_HEX.DESPERDICIO }} aria-hidden="true" />
                <span>
                  <strong className="text-omni-ink">Desperdício:</strong> nenhuma tela validada, as pendentes só em Novo, e sem atualização há mais de{' '}
                  {wasteDays >= 365 ? `${wasteDays / 365 === 1 ? '1 ano' : `${wasteDays / 365} anos`}` : `${wasteDays} dias`}. O mapa foi
                  pedido e criado, mas a homologação nunca aconteceu.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: KIND_HEX.CORRECAO_ESQUECIDA }} aria-hidden="true" />
                <span>
                  <strong className="text-omni-ink">Correção esquecida:</strong> tem telas em Correção e está sem atualização há mais de{' '}
                  {staleDays} dias. Um problema foi apontado e ninguém voltou para resolver.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: KIND_HEX.PARADO }} aria-hidden="true" />
                <span>
                  <strong className="text-omni-ink">Parado:</strong> tem telas em Novo e está sem atualização há mais de {staleDays} dias,
                  mas não chegou a desperdício: ou a homologação começou e ficou pela metade, ou o mapa ainda não passou do limite de
                  desperdício.
                </span>
              </li>
            </ul>
            <p>
              Mapas atualizados recentemente ou 100% validados não aparecem. Os limites de tempo e o produto mudam no botão{' '}
              <strong className="text-omni-ink">Filtros</strong>, no canto de cima.
            </p>
          </div>
        )}
      </div>

      {/* Números principais: clique abre os mapas em Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tiles.map((t) => {
          const ids = report.byKind[t.kind].ids;
          return (
            <button
              key={t.kind}
              type="button"
              disabled={!ids.length}
              onClick={() => drill(`${t.title} (Saúde da documentação)`, ids)}
              className={`panel p-5 min-w-0 text-left ${ids.length ? 'cursor-pointer hover:border-omni-bordo/30' : 'cursor-default'}`}
            >
              <p className="text-xs font-medium text-omni-muted flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: KIND_HEX[t.kind] }} aria-hidden="true" />
                {t.title}
              </p>
              <p className="kpi-number text-3xl font-bold text-omni-ink tabular-nums mt-1">
                {fmt(ids.length)}
                <span className="text-sm font-medium text-omni-muted ml-1.5">
                  {ids.length === 1 ? 'mapa' : 'mapas'} ({pct(ids.length, report.evaluated)}%)
                </span>
              </p>
              <p className="text-[11.5px] text-omni-muted mt-1.5 leading-snug">{t.detail}</p>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-omni-muted -mt-2">
        {fmt(report.evaluated)} mapas com telas avaliados. Cada mapa entra numa só situação, a mais grave.
        {report.withoutDate > 0 && ` ${fmt(report.withoutDate)} mapas sem data de atualização ficaram de fora.`}
      </p>

      {/* Onde e há quanto tempo está o desperdício */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Panel
          title="Onde está o desperdício"
          className="lg:col-span-7"
          hint={
            <div className="inline-flex rounded-lg border border-omni-line p-0.5 shrink-0" role="group" aria-label="Agrupar desperdício por">
              {(
                [
                  ['produto', 'Produto'],
                  ['responsavel', 'Responsável'],
                ] as const
              ).map(([id, text]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setGroupBy(id)}
                  aria-pressed={groupBy === id}
                  className={`px-2.5 h-7 rounded-md text-xs font-semibold cursor-pointer ${
                    groupBy === id ? 'bg-omni-ink text-white' : 'text-omni-ink-secondary hover:text-omni-ink'
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
          }
        >
          <p className="text-xs text-omni-muted -mt-2">Mapas em desperdício e quantas telas eles somam. Clique para abrir os mapas.</p>
          <Bars
            rows={groups.slice(0, 10).map((g) => ({
              key: g.name,
              label: g.name,
              value: g.ids.length,
              detail: `${fmt(g.screens)} telas`,
              ids: g.ids,
            }))}
            color={KIND_HEX.DESPERDICIO}
            unit={['mapa', 'mapas']}
            onClick={(label, ids) => drill(`Desperdício: ${label}`, ids)}
          />
        </Panel>

        <Panel title="Há quanto tempo" className="lg:col-span-5">
          <p className="text-xs text-omni-muted -mt-2">Tempo sem atualização dos mapas em desperdício.</p>
          <Bars
            rows={report.wasteAge.map((b) => ({ key: b.id, label: b.label, value: b.ids.length, ids: b.ids }))}
            color={NEUTRAL_BAR}
            unit={['mapa', 'mapas']}
            onClick={(label, ids) => drill(`Desperdício há ${label.toLowerCase()}`, ids)}
          />
        </Panel>
      </div>

      {/* Lista para revisar */}
      <Panel
        title="Mapas para revisar"
        hint={<span className="text-xs text-omni-muted">Do mais antigo para o mais recente</span>}
      >
        <div className="flex flex-wrap gap-1.5 -mt-1">
          {(['TODOS', 'DESPERDICIO', 'CORRECAO_ESQUECIDA', 'PARADO'] as const).map((k) => {
            const active = kindFilter === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKindFilter(k);
                  setShowAll(false);
                }}
                aria-pressed={active}
                className={`px-3 py-1.5 rounded-xl text-xs font-ui font-medium border transition-colors cursor-pointer ${
                  active
                    ? 'bg-red-50 text-omni-bordo border-omni-bordo/40 font-semibold'
                    : 'bg-white text-omni-ink-secondary border-omni-line hover:text-omni-ink'
                }`}
              >
                {k === 'TODOS' ? 'Todos' : HEALTH_KIND_LABEL[k]}
              </button>
            );
          })}
        </div>

        {list.length === 0 ? (
          <p className="text-sm text-omni-muted py-6 text-center">Nenhum mapa nesta situação com os limites escolhidos.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-omni-muted border-b border-omni-line">
                  <th className="font-medium py-2 px-2">Mapa</th>
                  <th className="font-medium py-2 px-2">Produto</th>
                  <th className="font-medium py-2 px-2">Responsável</th>
                  <th className="font-medium py-2 px-2 whitespace-nowrap">Sem atualizar</th>
                  <th className="font-medium py-2 px-2 text-right whitespace-nowrap">Telas</th>
                  <th className="font-medium py-2 px-2 whitespace-nowrap">Pendentes</th>
                  <th className="font-medium py-2 px-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {list.map((it) => (
                  <tr
                    key={it.id}
                    onClick={() => onOpenMap(it.artifact)}
                    className="border-b border-omni-line-subtle hover:bg-omni-mist cursor-pointer group"
                  >
                    <td className="py-2 px-2 max-w-[340px]">
                      <span className="block truncate font-medium text-omni-ink group-hover:text-omni-bordo" title={it.title}>
                        {it.title}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-omni-ink-secondary whitespace-nowrap">{it.produto}</td>
                    <td className="py-2 px-2 text-omni-ink-secondary max-w-[180px]">
                      <span className="block truncate" title={it.responsavel}>
                        {it.responsavel}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-omni-ink-secondary whitespace-nowrap tabular-nums">{formatAge(it.days)}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-omni-ink-secondary">
                      {fmt(it.validated)}/{fmt(it.totalScreens)} validadas
                    </td>
                    <td className="py-2 px-2 whitespace-nowrap tabular-nums text-omni-ink-secondary">
                      {[it.novo ? `${fmt(it.novo)} Novo` : '', it.correcao ? `${fmt(it.correcao)} Correção` : '']
                        .filter(Boolean)
                        .join(' | ')}
                    </td>
                    <td className="py-2 px-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-omni-ink">
                        <span className="w-2 h-2 rounded-full" style={{ background: KIND_HEX[it.kind] }} aria-hidden="true" />
                        {HEALTH_KIND_LABEL[it.kind]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {listAll.length > 25 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs font-semibold text-omni-ink-secondary hover:text-omni-bordo cursor-pointer"
          >
            {showAll ? 'Mostrar só os 25 primeiros' : `Mostrar todos (${fmt(listAll.length)})`}
          </button>
        )}
      </Panel>
    </div>
  );
};
