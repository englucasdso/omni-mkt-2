import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, ExternalLink, Trash2, Copy, Check, Search, X, ChevronDown, ChevronUp, Bookmark, Pencil } from 'lucide-react';
import { Artifact } from '../types';
import { StandardDoc } from '../domain/padroes/types';
import { buildParameterCatalog, docStats, mapsByParameter } from '../domain/padroes/standardsCatalog';
import { EXTRACTOR_BOOKMARKLET } from '../domain/padroes/extractorBookmarklet';
import { fetchStandards, importStandards, deleteStandard, replaceStandard, describeError } from '../services/api';
import { shortDocTitle } from '../domain/padroes/sanitize';

interface Props {
  artifacts: Artifact[];
  onDrillDown: (label: string, ids: string[], target: 'cards' | 'inventario') => void;
  /** Abre o Guia de tagueamento (a leitura dos padrões) */
  onOpenGuide: () => void;
  /** Avisa o App quando os documentos mudam (importar, substituir, remover) */
  onDocsChange?: (docs: StandardDoc[]) => void;
}

const fmt = (n: number) => n.toLocaleString('pt-BR');
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
};
const norm = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Copia texto mesmo fora de https (OMNI aberto pelo IP da rede) */
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

const Panel: React.FC<{ title: string; right?: React.ReactNode; children: React.ReactNode }> = ({ title, right, children }) => (
  <section className="panel min-w-0 p-6 space-y-4">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-base font-heading font-bold text-omni-ink">{title}</h3>
      {right}
    </div>
    {children}
  </section>
);

/** Passo a passo do extrator, com o favorito para arrastar */
const ExtractorHowTo: React.FC = () => {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);

  // O React bloqueia "javascript:" em href; o endereço do favorito entra direto no elemento
  useEffect(() => {
    linkRef.current?.setAttribute('href', EXTRACTOR_BOOKMARKLET);
  }, []);

  return (
    <ol className="space-y-3 text-sm text-omni-ink-secondary leading-relaxed list-decimal pl-5">
      <li>
        Arraste o botão abaixo para a barra de favoritos do navegador.
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <a
            ref={linkRef}
            onClick={(e) => e.preventDefault()}
            draggable
            title="Arraste para a barra de favoritos"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-omni-bordo text-white text-xs font-semibold cursor-grab active:cursor-grabbing select-none"
          >
            <Bookmark className="w-3.5 h-3.5" />
            Extrator OMNI
          </a>
          <button
            type="button"
            onClick={async () => {
              if (await copyText(EXTRACTOR_BOOKMARKLET)) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            }}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-omni-line bg-white text-xs font-semibold text-omni-ink-secondary hover:text-omni-bordo hover:border-omni-bordo/30 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Código copiado' : 'Copiar código'}
          </button>
        </div>
        <p className="text-xs text-omni-muted mt-1.5">
          Se não der para arrastar: copie o código, crie um favorito qualquer, edite e cole o código no campo do endereço (URL).
        </p>
      </li>
      <li>
        Abra a página de padrões no Confluence e clique no favorito <strong className="text-omni-ink">Extrator OMNI</strong>. Um
        arquivo <code className="text-xs">.json</code> é baixado. O extrator só lê a página aberta; não envia nada para lugar nenhum.
      </li>
      <li>
        Clique em <strong className="text-omni-ink">Importar arquivos</strong> e escolha o arquivo (pode ser mais de um). Para
        atualizar um documento, use o lápis ao lado dele e escolha o arquivo novo.
      </li>
    </ol>
  );
};

export const StandardsBaseView: React.FC<Props> = ({ artifacts, onDrillDown, onOpenGuide, onDocsChange }) => {
  const [docs, setDocs] = useState<StandardDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [docFilter, setDocFilter] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<StandardDoc | null>(null);

  useEffect(() => {
    fetchStandards()
      .then((d) => setDocs(d))
      .catch((e) => setError(describeError(e)))
      .finally(() => setLoading(false));
  }, []);

  // Mantém o App em dia (os pontos roxos dependem dos documentos)
  useEffect(() => {
    if (!loading && !error) onDocsChange?.(docs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, loading]);

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => /\.json$/i.test(f.name));
    if (!list.length) {
      setError('Escolha arquivos .json gerados pelo Extrator OMNI.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const parsed: unknown[] = [];
      const bad: string[] = [];
      for (const f of list) {
        try {
          parsed.push(JSON.parse(await f.text()));
        } catch {
          bad.push(f.name);
        }
      }
      if (!parsed.length) throw new Error(`Não foi possível ler: ${bad.join(', ')}.`);
      const r = await importStandards(parsed);
      setDocs(r.documentos);
      const problems = [...bad.map((b) => `${b}: arquivo inválido.`), ...r.erros];
      setNotice(
        `Importado: ${r.importados.join(', ')}.` + (problems.length ? ` Não importado: ${problems.join(' ')}` : '')
      );
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      setDocs(await deleteStandard(id));
      setConfirmRemove(null);
      if (docFilter === id) setDocFilter('');
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  /** Lápis: troca o documento pelo arquivo novo escolhido */
  const handleReplace = async (file: File | undefined) => {
    const target = replacing;
    if (replaceRef.current) replaceRef.current.value = '';
    setReplacing(null);
    if (!file || !target) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error(`${file.name}: arquivo inválido. Use o arquivo .json gerado pelo Extrator OMNI.`);
      }
      const r = await replaceStandard(target.id, parsed);
      setDocs(r.documentos);
      if (docFilter === target.id) setDocFilter('');
      setNotice(`"${shortDocTitle(target.title)}" foi substituído por "${shortDocTitle(r.importados[0] || file.name)}".`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const catalog = useMemo(() => buildParameterCatalog(docs), [docs]);
  const usage = useMemo(() => mapsByParameter(artifacts), [artifacts]);
  const coverage = useMemo(() => {
    const names = Array.from(usage.keys());
    const documented = new Set(catalog.map((p) => p.name));
    return { inMaps: names.length, documented: names.filter((n) => documented.has(n)).length };
  }, [usage, catalog]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return catalog.filter(
      (p) =>
        (!docFilter || p.sources.some((s) => s.docId === docFilter)) &&
        (!q || [p.name, ...p.descriptions, ...p.types, ...p.examples].some((v) => norm(v).includes(q)))
    );
  }, [catalog, query, docFilter]);

  const hasDocs = docs.length > 0;

  return (
    <div
      className="space-y-6 pb-16 relative"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      {dragging && (
        <div className="absolute inset-0 z-20 rounded-2xl border-2 border-dashed border-omni-bordo/50 bg-red-50/70 flex items-center justify-center pointer-events-none">
          <p className="text-sm font-semibold text-omni-bordo">Solte os arquivos do extrator para importar</p>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-xl font-heading font-bold text-omni-ink">Base de padrões</h2>
          <p className="text-sm text-omni-ink-secondary mt-1 leading-relaxed">
            Cadastro das páginas de padrões do Confluence. Para ler e consultar os padrões, use o{' '}
            <button type="button" onClick={onOpenGuide} className="font-semibold text-omni-bordo hover:underline cursor-pointer">
              Guia de tagueamento
            </button>
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasDocs && (
            <button
              type="button"
              onClick={() => setShowHowTo((v) => !v)}
              className="h-9 px-3 rounded-lg text-xs font-semibold text-omni-ink-secondary hover:text-omni-bordo inline-flex items-center gap-1 cursor-pointer"
            >
              Como extrair do Confluence
              {showHowTo ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="h-9 px-4 rounded-lg bg-omni-bordo text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:brightness-110 disabled:opacity-60 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            {busy ? 'Importando...' : 'Importar arquivos'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <input
            ref={replaceRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => handleReplace(e.target.files?.[0])}
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          <p className="flex-1">{error}</p>
          <button type="button" onClick={() => setError(null)} aria-label="Fechar aviso" className="p-0.5 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-omni-line bg-white px-4 py-2.5 text-xs text-omni-ink-secondary">
          <p className="flex-1">{notice}</p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso" className="p-0.5 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-omni-muted">Carregando padrões...</p>
      ) : !hasDocs ? (
        <Panel title="Comece importando a primeira página de padrões">
          <ExtractorHowTo />
          <p className="text-xs text-omni-muted">Você também pode arrastar os arquivos .json para esta tela.</p>
        </Panel>
      ) : (
        <>
          {showHowTo && (
            <Panel title="Como extrair do Confluence">
              <ExtractorHowTo />
            </Panel>
          )}

          {/* Documentos importados */}
          <Panel
            title="Documentos cadastrados"
            right={<span className="text-xs text-omni-muted tabular-nums">{fmt(docs.length)} {docs.length === 1 ? 'documento' : 'documentos'}</span>}
          >
            <div className="divide-y divide-omni-line-subtle">
              {docs.map((d) => {
                const st = docStats(d);
                const status = d.meta['Status do Documento'] || '';
                const revisao = d.meta['Data da Revisão'] || d.meta['Data da Revisao'] || '';
                return (
                  <div key={d.id} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-omni-ink truncate" title={d.title}>
                        {shortDocTitle(d.title)}
                      </p>
                      <p className="text-xs text-omni-muted mt-0.5">
                        {[
                          `${fmt(st.tables)} tabelas`,
                          `${fmt(st.codes)} blocos de código`,
                          status && `Status: ${status}`,
                          revisao && `Revisão: ${revisao}`,
                          `Extraído em ${fmtDate(d.extractedAt)}`,
                        ]
                          .filter(Boolean)
                          .join(' | ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {d.url && (
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-omni-ink-secondary hover:text-omni-bordo inline-flex items-center gap-1.5"
                        >
                          Confluence <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {confirmRemove === d.id ? (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className="text-omni-ink-secondary">Remover?</span>
                          <button
                            type="button"
                            onClick={() => remove(d.id)}
                            disabled={busy}
                            className="h-7 px-2.5 rounded-md bg-omni-bordo text-white font-semibold cursor-pointer"
                          >
                            Remover
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemove(null)}
                            className="h-7 px-2 rounded-md text-omni-ink-secondary hover:text-omni-ink cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <>
                        <button
                          type="button"
                          onClick={() => {
                            setReplacing(d);
                            replaceRef.current?.click();
                          }}
                          disabled={busy}
                          aria-label={`Substituir ${d.title}`}
                          title="Substituir por um arquivo novo"
                          className="p-1.5 rounded-md text-omni-muted hover:text-omni-bordo hover:bg-omni-mist cursor-pointer disabled:opacity-50"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemove(d.id)}
                          aria-label={`Remover ${d.title}`}
                          title="Remover da base"
                          className="p-1.5 rounded-md text-omni-muted hover:text-omni-bordo hover:bg-omni-mist cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* Catálogo de parâmetros */}
          <Panel
            title="Parâmetros cadastrados"
            right={
              <div className="flex items-center gap-2">
                {docs.length > 1 && (
                  <select
                    value={docFilter}
                    onChange={(e) => setDocFilter(e.target.value)}
                    className="h-8 max-w-[220px] rounded-lg border border-omni-line bg-white text-xs px-2.5 text-omni-ink truncate"
                    aria-label="Documento"
                  >
                    <option value="">Todos os documentos</option>
                    {docs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {shortDocTitle(d.title)}
                      </option>
                    ))}
                  </select>
                )}
                <div className="relative w-[240px]">
                  <Search className="w-3.5 h-3.5 text-omni-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar parâmetro, descrição ou exemplo..."
                    className="w-full pl-8 pr-2 h-8 bg-white border border-omni-line rounded-lg text-xs text-omni-ink placeholder:text-omni-muted focus:outline-none focus:ring-2 focus:ring-omni-rubi/20 focus:border-omni-rubi"
                  />
                </div>
              </div>
            }
          >
            <p className="text-xs text-omni-muted -mt-2">
              {fmt(catalog.length)} parâmetros. Os que têm o mesmo nome exato aparecem uma vez só; maiúsculas e minúsculas contam como nomes diferentes.{' '}
              {fmt(coverage.documented)} de {fmt(coverage.inMaps)} nomes de parâmetro usados nos mapas estão cadastrados.
            </p>
            {filtered.length === 0 ? (
              <p className="text-sm text-omni-muted py-6 text-center">
                {catalog.length === 0
                  ? 'Nenhuma tabela de parâmetros encontrada nos documentos importados. As tabelas precisam ter a primeira coluna "Parameters" (ou "Parâmetro").'
                  : 'Nenhum parâmetro com esse filtro.'}
              </p>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-omni-muted border-b border-omni-line">
                      <th className="font-medium py-2 px-2">Parâmetro</th>
                      <th className="font-medium py-2 px-2">Escopo</th>
                      <th className="font-medium py-2 px-2">Descrição</th>
                      <th className="font-medium py-2 px-2">Exemplos</th>
                      <th className="font-medium py-2 px-2">Documentos</th>
                      <th className="font-medium py-2 px-2 text-right whitespace-nowrap">Usado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const ids = usage.get(p.name) || [];
                      const docsTip = p.sources.map((x) => `${shortDocTitle(x.docTitle)}${x.section ? ` > ${x.section}` : ''}`).join('\n');
                      const docCount = new Set(p.sources.map((x) => x.docId)).size;
                      return (
                        <tr key={p.name} className="border-b border-omni-line-subtle align-top">
                          <td className="py-2.5 px-2 font-mono font-semibold text-omni-ink whitespace-nowrap">{p.name}</td>
                          <td className="py-2.5 px-2 text-omni-ink-secondary whitespace-nowrap">{p.types.join(', ')}</td>
                          <td className="py-2.5 px-2 text-omni-ink-secondary min-w-[220px] max-w-[360px]">
                            <span className="whitespace-pre-line">{p.descriptions[0] || ''}</span>
                            {p.descriptions.length > 1 && (
                              <span className="block text-[11px] text-omni-muted mt-1" title={p.descriptions.slice(1).join('\n\n')}>
                                +{p.descriptions.length - 1} {p.descriptions.length === 2 ? 'descrição diferente' : 'descrições diferentes'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="flex flex-wrap gap-1 max-w-[260px]">
                              {p.examples.slice(0, 4).map((ex) => (
                                <code key={ex} className="px-1.5 py-0.5 rounded bg-omni-mist text-[11px] text-omni-ink-secondary">
                                  {ex}
                                </code>
                              ))}
                              {p.examples.length > 4 && (
                                <span className="text-[11px] text-omni-muted" title={p.examples.slice(4).join('\n')}>
                                  +{p.examples.length - 4}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-omni-muted max-w-[200px]">
                            <span className="block truncate" title={docsTip}>
                              {docCount === 1 ? shortDocTitle(p.sources[0].docTitle) : `${fmt(docCount)} documentos`}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-right whitespace-nowrap">
                            {ids.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => onDrillDown(`Mapas com o parâmetro ${p.name}`, ids, 'cards')}
                                className="font-semibold text-omni-ink hover:text-omni-bordo cursor-pointer tabular-nums"
                                title="Abrir esses mapas em Cards"
                              >
                                {fmt(ids.length)} {ids.length === 1 ? 'mapa' : 'mapas'}
                              </button>
                            ) : (
                              <span className="text-omni-muted">nenhum mapa</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
};
