/**
 * Catálogo de parâmetros padronizados, montado a partir das tabelas dos documentos
 * de padrões (colunas do tipo Parameters | Description | Type | Example).
 */
import { Artifact } from '../../types';
import { StandardDoc } from './types';

/** Onde um parâmetro aparece na documentação */
export interface StandardParameterSource {
  docId: string;
  docTitle: string;
  /** Seção da página onde a tabela está (ex.: "[parameters] - Event") */
  section: string;
}

/**
 * Um parâmetro do catálogo. Linhas com o mesmo nome exato (inclusive maiúsculas e
 * minúsculas) viram um parâmetro só; nomes que diferem só na caixa são parâmetros diferentes.
 */
export interface StandardParameter {
  /** Nome exatamente como está na documentação (ex.: element_name) */
  name: string;
  /** Descrições diferentes encontradas para o mesmo nome */
  descriptions: string[];
  /** Escopos/tipos declarados (ex.: EVENT, USER) */
  types: string[];
  examples: string[];
  sources: StandardParameterSource[];
  /** Quantas linhas de tabela foram juntadas neste parâmetro */
  rows: number;
}

const norm = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const findCol = (headers: string[], re: RegExp) => headers.findIndex((h) => re.test(norm(h)));

/** Uma tabela é de parâmetros quando a primeira coluna fala de parâmetro/campo/chave */
function isParameterTable(headers: string[]): boolean {
  return headers.length >= 2 && /param|campo|chave|key|variavel/.test(norm(headers[0]));
}

/** Nome do parâmetro para comparar: só tira espaços e aspas das pontas, a caixa é mantida */
export function parameterName(name: string): string {
  return String(name || '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
}

const pushUnique = (list: string[], value: string) => {
  const v = value.trim();
  if (v && !list.includes(v)) list.push(v);
};

export function buildParameterCatalog(docs: StandardDoc[]): StandardParameter[] {
  const byName = new Map<string, StandardParameter>();
  for (const doc of docs || []) {
    for (const block of doc.blocks || []) {
      if (block.type !== 'table' || !isParameterTable(block.headers)) continue;
      const iDesc = findCol(block.headers, /descri/);
      const iType = findCol(block.headers, /^(type|tipo|escopo|scope)/);
      const iEx = findCol(block.headers, /exem|example/);
      for (const row of block.rows) {
        const name = parameterName(String(row[0] || '').split('\n')[0]);
        if (!name) continue;
        let p = byName.get(name);
        if (!p) {
          p = { name, descriptions: [], types: [], examples: [], sources: [], rows: 0 };
          byName.set(name, p);
        }
        p.rows += 1;
        if (iDesc >= 0) pushUnique(p.descriptions, row[iDesc] || '');
        if (iType >= 0) pushUnique(p.types, row[iType] || '');
        if (iEx >= 0) String(row[iEx] || '').split('\n').forEach((e) => pushUnique(p!.examples, e));
        if (!p.sources.some((x) => x.docId === doc.id && x.section === (block.section || ''))) {
          p.sources.push({ docId: doc.id, docTitle: doc.title, section: block.section || '' });
        }
      }
    }
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** Para cada nome exato de parâmetro, os mapas que o usam em algum código de disparo */
export function mapsByParameter(artifacts: Artifact[]): Map<string, string[]> {
  const index = new Map<string, Set<string>>();
  for (const art of artifacts || []) {
    if (art.artifact_type !== 'MAPA') continue;
    const id = String(art.id);
    for (const screen of art.screens || []) {
      for (const snip of (screen as any).snippets || []) {
        for (const p of snip.parameters || []) {
          const name = parameterName(p.name_raw || p.name || '');
          if (!name) continue;
          if (!index.has(name)) index.set(name, new Set());
          index.get(name)!.add(id);
        }
      }
    }
  }
  const out = new Map<string, string[]>();
  index.forEach((ids, name) => out.set(name, Array.from(ids)));
  return out;
}

/** Tabela de parâmetros (usada também pelo Guia para destacar os nomes) */
export { isParameterTable };

export function docStats(doc: StandardDoc) {
  const tables = doc.blocks.filter((b) => b.type === 'table');
  return {
    sections: doc.blocks.filter((b) => b.type === 'heading').length,
    tables: tables.length,
    codes: doc.blocks.filter((b) => b.type === 'code').length,
    parameters: tables.filter((t) => t.type === 'table' && isParameterTable(t.headers)).reduce((n, t) => n + (t.type === 'table' ? t.rows.length : 0), 0),
  };
}
