import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Check, ExternalLink, BookOpen } from 'lucide-react';
import { Artifact } from '../types';
import { StandardBlock, StandardDoc } from '../domain/padroes/types';
import { isParameterTable, mapsByParameter, parameterName } from '../domain/padroes/standardsCatalog';
import { shortDocTitle } from '../domain/padroes/sanitize';
import { fetchStandards, describeError } from '../services/api';

interface Props {
  artifacts: Artifact[];
  /** Busca do cabeçalho (procura em todos os documentos) */
  query: string;
  onQueryChange: (q: string) => void;
  onOpenStandardsBase: () => void;
  onDrillDown: (label: string, ids: string[], target: 'cards' | 'inventario') => void;
}

const fmt = (n: number) => n.toLocaleString('pt-BR');
const norm = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const blockId = (docId: string, i: number) => `guia-${docId}-${i}`;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** Texto pesquisável de um bloco */
function blockText(b: StandardBlock): string {
  switch (b.type) {
    case 'heading':
    case 'paragraph':
      return b.text;
    case 'list':
      return b.items.join('\n');
    case 'code':
      return `${b.title}\n${b.text}`;
    case 'table':
      return [b.headers.join(' '), ...b.rows.map((r) => r.join(' '))].join('\n');
  }
}

/** Trecho curto em volta do termo encontrado */
function excerpt(text: string, q: string): { before: string; hit: string; after: string } {
  const flat = text.replace(/\s+/g, ' ').trim();
  const i = norm(flat).indexOf(q);
  if (i < 0) return { before: flat.slice(0, 140), hit: '', after: '' };
  const start = Math.max(0, i - 60);
  return {
    before: (start > 0 ? '...' : '') + flat.slice(start, i),
    hit: flat.slice(i, i + q.length),
    after: flat.slice(i + q.length, i + q.length + 80) + (i + q.length + 80 < flat.length ? '...' : ''),
  };
}

const CodeBlock: React.FC<{ block: Extract<StandardBlock, { type: 'code' }> }> = ({ block }) => {
  const [copied, setCopied] = useState(false);
  return (
    <figure className="rounded-xl overflow-hidden border border-black/10 bg-[#1A1D24]">
      <figcaption className="flex items-center justify-between gap-3 px-4 h-9 border-b border-white/10">
        <span className="text-xs font-medium text-gray-300 truncate">{block.title || block.language || 'Código'}</span>
        <button
          type="button"
          onClick={async () => {
            if (await copyText(block.text)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }
          }}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-400 hover:text-white cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </figcaption>
      <pre className="px-4 py-3 text-[12.5px] leading-relaxed font-mono text-gray-100 overflow-x-auto custom-scrollbar whitespace-pre">
        {block.text}
      </pre>
    </figure>
  );
};

const TableBlock: React.FC<{
  block: Extract<StandardBlock, { type: 'table' }>;
  usage: Map<string, string[]>;
  onDrillDown: Props['onDrillDown'];
}> = ({ block, usage, onDrillDown }) => {
  const paramTable = isParameterTable(block.headers);
  return (
    <div className="rounded-xl border border-omni-line overflow-hidden">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-[13px]">
          {block.headers.length > 0 && (
            <thead className="bg-omni-mist">
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i} className="text-left font-semibold text-omni-ink px-3.5 py-2.5 border-b border-omni-line whitespace-nowrap">
                    {h}
                  </th>
                ))}
                {paramTable && (
                  <th className="text-right font-semibold text-omni-ink px-3.5 py-2.5 border-b border-omni-line whitespace-nowrap">
                    Nos mapas
                  </th>
                )}
              </tr>
            </thead>
          )}
          <tbody>
            {block.rows.map((row, r) => {
              const name = paramTable ? parameterName(String(row[0] || '').split('\n')[0]) : '';
              const ids = name ? usage.get(name) || [] : [];
              return (
                <tr key={r} className="align-top border-b border-omni-line-subtle last:border-0">
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className={`px-3.5 py-2.5 whitespace-pre-line ${
                        paramTable && c === 0 ? 'font-mono font-semibold text-omni-ink whitespace-nowrap' : 'text-omni-ink-secondary'
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                  {paramTable && (
                    <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                      {ids.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => onDrillDown(`Mapas com o parâmetro ${name}`, ids, 'cards')}
                          title="Abrir esses mapas em Cards"
                          className="text-xs font-semibold text-omni-ink hover:text-omni-bordo tabular-nums cursor-pointer"
                        >
                          {fmt(ids.length)} {ids.length === 1 ? 'mapa' : 'mapas'}
                        </button>
                      ) : (
                        <span className="text-xs text-omni-muted">nenhum</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/** Guia de tagueamento: leitura dos documentos cadastrados na Base de padrões */
export const TaggingGuideView: React.FC<Props> = ({ artifacts, query, onQueryChange, onOpenStandardsBase, onDrillDown }) => {
  const [docs, setDocs] = useState<StandardDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string>('');
  const [focusBlock, setFocusBlock] = useState<number | null>(null);
  const articleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchStandards()
      .then((d: StandardDoc[]) => {
        const sorted = [...d].sort((a, b) => shortDocTitle(a.title).localeCompare(shortDocTitle(b.title), 'pt-BR'));
        setDocs(sorted);
        setActiveId((cur) => cur || sorted[0]?.id || '');
      })
      .catch((e) => setError(describeError(e)))
      .finally(() => setLoading(false));
  }, []);

  const usage = useMemo(() => mapsByParameter(artifacts), [artifacts]);
  const doc = docs.find((d) => d.id === activeId) || docs[0];

  // Ao abrir um documento (ou um resultado da busca), leva até o ponto certo
  useEffect(() => {
    if (!doc) return;
    if (focusBlock === null) {
      articleRef.current?.scrollIntoView({ block: 'start' });
      return;
    }
    const el = document.getElementById(blockId(doc.id, focusBlock));
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const t = setTimeout(() => setFocusBlock(null), 2200);
    return () => clearTimeout(t);
  }, [doc?.id, focusBlock]);

  const q = norm(query.trim());
  const results = useMemo(() => {
    if (q.length < 2) return [];
    const out: { doc: StandardDoc; index: number; context: string; text: string }[] = [];
    for (const d of docs) {
      let context = '';
      d.blocks.forEach((b, i) => {
        if (b.type === 'heading') context = b.text;
        const text = blockText(b);
        if (norm(text).includes(q)) out.push({ doc: d, index: i, context: b.type === 'heading' ? '' : context, text });
      });
    }
    return out;
  }, [docs, q]);

  const toc = useMemo(
    () =>
      (doc?.blocks || [])
        .map((b, i) => ({ b, i }))
        .filter((x): x is { b: Extract<StandardBlock, { type: 'heading' }>; i: number } => x.b.type === 'heading' && x.b.level <= 3),
    [doc]
  );
  const minLevel = toc.reduce((m, x) => Math.min(m, x.b.level), 6);

  const openDoc = (id: string, index: number | null = null) => {
    setActiveId(id);
    setFocusBlock(index);
    if (query) onQueryChange('');
  };

  if (loading) return <p className="text-sm text-omni-muted">Carregando o guia...</p>;
  if (error)
    return (
      <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {error}
      </div>
    );
  if (!doc)
    return (
      <section className="flex-1 flex items-center justify-center py-24">
        <div className="max-w-md text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-xl bg-omni-mist border border-omni-line text-omni-muted flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-heading font-bold text-omni-ink">O guia ainda está vazio</h2>
          <p className="text-sm text-omni-ink-secondary leading-relaxed">
            O guia mostra as páginas de padrões cadastradas. Importe a primeira página na Base de padrões.
          </p>
          <button
            type="button"
            onClick={onOpenStandardsBase}
            className="h-9 px-4 rounded-lg bg-omni-bordo text-white text-xs font-semibold hover:brightness-110 cursor-pointer"
          >
            Ir para a Base de padrões
          </button>
        </div>
      </section>
    );

  const status = doc.meta['Status do Documento'] || '';
  const revisao = doc.meta['Data da Revisão'] || doc.meta['Data da Revisao'] || '';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_200px] gap-8 pb-16">
      {/* Documentos */}
      <nav aria-label="Documentos do guia" className="lg:sticky lg:top-4 self-start space-y-1">
        <p className="text-xs font-medium text-omni-muted px-3 mb-2">Documentos</p>
        {docs.map((d) => {
          const active = d.id === doc.id && !q;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => openDoc(d.id)}
              title={d.title}
              className={`w-full text-left px-3 py-2 rounded-lg text-[13px] leading-snug transition-colors cursor-pointer ${
                active ? 'bg-red-50 text-omni-bordo font-semibold' : 'text-omni-ink-secondary hover:text-omni-bordo hover:bg-omni-mist'
              }`}
            >
              {shortDocTitle(d.title)}
            </button>
          );
        })}
      </nav>

      {q.length >= 2 ? (
        /* Resultados da busca */
        <section className="min-w-0 space-y-4" aria-live="polite">
          <div>
            <h2 className="text-xl font-heading font-bold text-omni-ink">Resultados para "{query.trim()}"</h2>
            <p className="text-sm text-omni-muted mt-1">
              {results.length === 0
                ? 'Nada encontrado nos documentos do guia. Tente outro termo, como o nome de um parâmetro ou evento.'
                : `${fmt(results.length)} ${results.length === 1 ? 'trecho' : 'trechos'} em ${fmt(new Set(results.map((r) => r.doc.id)).size)} ${
                    new Set(results.map((r) => r.doc.id)).size === 1 ? 'documento' : 'documentos'
                  }`}
            </p>
          </div>
          <div className="space-y-2">
            {results.slice(0, 200).map((r) => {
              const ex = excerpt(r.text, q);
              return (
                <button
                  key={`${r.doc.id}-${r.index}`}
                  type="button"
                  onClick={() => openDoc(r.doc.id, r.index)}
                  className="panel w-full text-left p-4 hover:border-omni-bordo/30 transition-colors cursor-pointer block"
                >
                  <p className="text-xs text-omni-muted truncate">
                    {[shortDocTitle(r.doc.title), r.context].filter(Boolean).join(' > ')}
                  </p>
                  <p className="text-sm text-omni-ink-secondary mt-1 leading-relaxed">
                    {ex.before}
                    <mark className="bg-red-100 text-omni-bordo rounded px-0.5">{ex.hit}</mark>
                    {ex.after}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        /* Documento */
        <article ref={articleRef} className="min-w-0 max-w-[880px] scroll-mt-6">
          <header className="pb-6 mb-6 border-b border-omni-line">
            <h1 className="text-2xl font-heading font-bold text-omni-ink leading-tight">{shortDocTitle(doc.title)}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-omni-muted">
              {status && <span>Status: {status}</span>}
              {revisao && <span>Revisão: {revisao}</span>}
              {doc.url && (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-omni-ink-secondary hover:text-omni-bordo"
                >
                  Ver no Confluence <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </header>

          <div className="space-y-4">
            {doc.blocks.map((b, i) => {
              const focused = focusBlock === i;
              const wrap = (child: React.ReactNode, extra = '') => (
                <div
                  key={i}
                  id={blockId(doc.id, i)}
                  className={`scroll-mt-6 rounded-xl transition-shadow duration-500 ${focused ? 'ring-2 ring-omni-bordo/40 ring-offset-4' : ''} ${extra}`}
                >
                  {child}
                </div>
              );
              switch (b.type) {
                case 'heading': {
                  const size = b.level <= minLevel ? 'text-lg' : b.level === minLevel + 1 ? 'text-base' : 'text-sm';
                  return wrap(
                    <h2 className={`${size} font-heading font-bold text-omni-ink`}>{b.text}</h2>,
                    b.level <= minLevel ? 'pt-6' : 'pt-3'
                  );
                }
                case 'paragraph':
                  return wrap(<p className="text-sm text-omni-ink-secondary leading-relaxed whitespace-pre-line max-w-[72ch]">{b.text}</p>);
                case 'list':
                  return wrap(
                    <ul className="list-disc pl-5 space-y-1 text-sm text-omni-ink-secondary leading-relaxed max-w-[72ch]">
                      {b.items.map((it, k) => (
                        <li key={k} className="whitespace-pre-line">
                          {it}
                        </li>
                      ))}
                    </ul>
                  );
                case 'code':
                  return wrap(<CodeBlock block={b} />);
                case 'table':
                  return wrap(<TableBlock block={b} usage={usage} onDrillDown={onDrillDown} />);
              }
            })}
          </div>
        </article>
      )}

      {/* Nesta página */}
      {!q && toc.length > 1 && (
        <aside aria-label="Nesta página" className="hidden xl:block xl:sticky xl:top-4 self-start">
          <p className="text-xs font-medium text-omni-muted mb-2">Nesta página</p>
          <ul className="space-y-1 border-l border-omni-line">
            {toc.map(({ b, i }) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => document.getElementById(blockId(doc.id, i))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  style={{ paddingLeft: `${12 + (b.level - minLevel) * 10}px` }}
                  className="w-full text-left py-1 pr-2 text-xs leading-snug text-omni-ink-secondary hover:text-omni-bordo -ml-px border-l border-transparent hover:border-omni-bordo cursor-pointer"
                >
                  {b.text}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
};
