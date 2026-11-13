/**
 * Catálogo de parâmetros padronizados, montado a partir das tabelas dos documentos
 * de padrões (colunas do tipo Parameters | Description | Type | Example).
 */
import { Artifact } from '../../types';
import { StandardDoc } from './types';

export interface StandardParameter {
  /** Nome como está na documentação (ex.: element_name) */
  name: string;
  /** Nome normalizado para comparar com os mapas */
  key: string;
  description: string;
  /** Escopo/tipo declarado (ex.: EVENT, USER) */
  type: string;
  examples: string[];
  /** Seção da página onde a tabela está (ex.: "[parameters] - Event") */
  section: string;
  docId: string;
  docTitle: string;
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

export function parameterKey(name: string): string {
  return norm(name).replace(/["'`]/g, '').replace(/\s+/g, '_');
}

export function buildParameterCatalog(docs: StandardDoc[]): StandardParameter[] {
  const out: StandardParameter[] = [];
  for (const doc of docs || []) {
    for (const block of doc.blocks || []) {
      if (block.type !== 'table' || !isParameterTable(block.headers)) continue;
      const iDesc = findCol(block.headers, /descri/);
      const iType = findCol(block.headers, /^(type|tipo|escopo|scope)/);
      const iEx = findCol(block.headers, /exem|example/);
      for (const row of block.rows) {
        const name = String(row[0] || '').split('\n')[0].trim();
        if (!name) continue;
        out.push({
          name,
          key: parameterKey(name),
          description: iDesc >= 0 ? row[iDesc] || '' : '',
          type: iType >= 0 ? (row[iType] || '').trim() : '',
          examples:
            iEx >= 0
              ? String(row[iEx] || '')
                  .split('\n')
                  .map((e) => e.trim())
                  .filter(Boolean)
              : [],
          section: block.section || '',
          docId: doc.id,
          docTitle: doc.title,
        });
      }
    }
  }
  return out;
}

/** Para cada nome de parâmetro (normalizado), os mapas que o usam em algum código de disparo */
export function mapsByParameter(artifacts: Artifact[]): Map<string, string[]> {
  const index = new Map<string, Set<string>>();
  for (const art of artifacts || []) {
    if (art.artifact_type !== 'MAPA') continue;
    const id = String(art.id);
    for (const screen of art.screens || []) {
      for (const snip of (screen as any).snippets || []) {
        for (const p of snip.parameters || []) {
          const key = parameterKey(p.name || p.key || '');
          if (!key) continue;
          if (!index.has(key)) index.set(key, new Set());
          index.get(key)!.add(id);
        }
      }
    }
  }
  const out = new Map<string, string[]>();
  index.forEach((ids, key) => out.set(key, Array.from(ids)));
  return out;
}

export function docStats(doc: StandardDoc) {
  const tables = doc.blocks.filter((b) => b.type === 'table');
  return {
    sections: doc.blocks.filter((b) => b.type === 'heading').length,
    tables: tables.length,
    codes: doc.blocks.filter((b) => b.type === 'code').length,
    parameters: tables.filter((t) => t.type === 'table' && isParameterTable(t.headers)).reduce((n, t) => n + (t.type === 'table' ? t.rows.length : 0), 0),
  };
}
