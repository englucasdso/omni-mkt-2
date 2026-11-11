/**
 * Qualidade dos valores e padrões de mensuração (sem IA).
 *
 * 1. Possível erro de digitação: dentro de um mesmo parâmetro, um valor raro
 *    quase igual a um valor frequente ("contratacao" x "contratcao").
 *    A regra prefere deixar passar a acusar à toa:
 *    - só compara valores com 5+ caracteres;
 *    - diferença só de números é numeração legítima (tela_1, tela_2);
 *    - um trecho curto diferente (pf x pj, ga x gb) é outro código, não erro;
 *    - o valor sinalizado é sempre o menos frequente, e a sugestão é o mais usado.
 * 2. Mesma palavra escrita diferente: só maiúscula, acento ou separador mudam
 *    ("Cartao" x "cartão" x "cartao-credito" x "cartao_credito").
 * 3. Padrão com uma única ocorrência: no mapa, um evento disparado uma vez com
 *    um conjunto de campos diferente dos outros disparos do mesmo evento.
 */

export type ValueIssueKind = 'DIGITACAO' | 'GRAFIA';

export interface ValueIssue {
  kind: ValueIssueKind;
  /** Valor mais usado que este provavelmente deveria ser */
  suggestion: string;
  suggestionCount: number;
  count: number;
  message: string;
}

const SEPARATORS = /[\s_\-./:]+/g;

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Forma usada para comparar: minúscula, sem acento, separadores unificados. */
function canonical(value: string): string {
  return stripAccents(String(value).toLowerCase()).replace(SEPARATORS, '_').replace(/^_+|_+$/g, '');
}

function isComparable(value: string): boolean {
  const v = String(value).trim();
  if (v.length < 5) return false;
  if (/^\{\{.*\}\}$/.test(v)) return false; // placeholder
  if (/^[\d\s.,:/-]+$/.test(v)) return false; // número, data, hora
  if (/^(true|false|null|undefined)$/i.test(v)) return false;
  if (/^[a-zA-Z_$][\w$]*(\.[\w$]+)+$/.test(v) && !/\s/.test(v)) return false; // referência JS (window.x.y)
  return true;
}

/**
 * Distância de edição (inserção, remoção, troca e inversão de duas letras vizinhas).
 * Devolve max+1 assim que fica claro que passou do limite.
 */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2][j - 2] + 1);
      }
      d[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[rows - 1][cols - 1];
}

/** Limite de diferença aceito como erro de digitação, conforme o tamanho. */
function allowedDistance(length: number): number {
  if (length >= 10) return 2;
  if (length >= 4) return 1;
  return 0;
}

function compare(rare: string, common: string): ValueIssueKind | null {
  const cr = canonical(rare);
  const cc = canonical(common);
  if (!cr || !cc) return null;

  if (cr === cc) return 'GRAFIA';
  // Mesma coisa sem separador ("cartaocredito" x "cartao_credito")
  if (cr.replace(/_/g, '') === cc.replace(/_/g, '')) return 'GRAFIA';

  // Erro de digitação só dentro de um único trecho (entre separadores).
  // Mudou mais de um trecho, ou mudou a quantidade de trechos: é outro valor.
  const ta = cr.split('_');
  const tb = cc.split('_');
  if (ta.length !== tb.length) return null;
  const diffs: Array<[string, string]> = [];
  for (let i = 0; i < ta.length; i++) if (ta[i] !== tb[i]) diffs.push([ta[i], tb[i]]);
  if (diffs.length !== 1) return null;

  const [a, b] = diffs[0];
  // Trecho curto (pf x pj) ou com número (tela1 x tela2, v2 x v3) é outro código
  if (a.length < 4 || b.length < 4) return null;
  if (/\d/.test(a) || /\d/.test(b)) return null;

  const max = allowedDistance(Math.min(a.length, b.length));
  if (max === 0) return null;
  return editDistance(a, b, max) <= max ? 'DIGITACAO' : null;
}

/**
 * Recebe os valores de um parâmetro com quantas vezes cada um aparece e devolve
 * os valores suspeitos (sempre o menos frequente do par).
 */
export function findValueIssues(counts: Map<string, number>): Map<string, ValueIssue> {
  const issues = new Map<string, ValueIssue>();
  const values = Array.from(counts.entries())
    .filter(([v]) => isComparable(v))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  // Limite de segurança para parâmetros com valores livres demais
  if (values.length > 600) return issues;

  for (let i = 0; i < values.length; i++) {
    const [common, commonCount] = values[i];
    for (let j = i + 1; j < values.length; j++) {
      const [rare, rareCount] = values[j];
      if (issues.has(rare) || rare === common) continue;
      const kind = compare(rare, common);
      if (!kind) continue;
      issues.set(rare, {
        kind,
        suggestion: common,
        suggestionCount: commonCount,
        count: rareCount,
        message:
          kind === 'GRAFIA'
            ? `Mesma palavra escrita de outro jeito que "${common}" (maiúscula, acento ou separador).`
            : `Pode ser erro de digitação de "${common}", que aparece ${commonCount}x.`,
      });
    }
  }
  return issues;
}

/** Uma passada pelos snippets: parâmetro → valor → quantas vezes aparece. */
export function countValuesByParameter(artifacts: any[]): Map<string, Map<string, number>> {
  const byParam = new Map<string, Map<string, number>>();
  for (const art of artifacts || []) {
    for (const screen of art?.screens || []) {
      for (const snip of screen?.snippets || []) {
        for (const p of snip?.parameters || []) {
          if (!p?.name) continue;
          const v = String(p.normalized_value ?? p.value ?? '').trim();
          if (!v) continue;
          let m = byParam.get(p.name);
          if (!m) {
            m = new Map<string, number>();
            byParam.set(p.name, m);
          }
          m.set(v, (m.get(v) || 0) + 1);
        }
      }
    }
  }
  return byParam;
}

/** Valores suspeitos por parâmetro (só parâmetros com algum achado). */
export function findValueIssuesByParameter(artifacts: any[]): Map<string, Map<string, ValueIssue>> {
  const result = new Map<string, Map<string, ValueIssue>>();
  countValuesByParameter(artifacts).forEach((counts, name) => {
    const issues = findValueIssues(counts);
    if (issues.size > 0) result.set(name, issues);
  });
  return result;
}

/** Valores suspeitos de um único artefato (aba Parâmetros do detalhe do mapa). */
export function findArtifactValueIssues(artifact: any): Map<string, Map<string, ValueIssue>> {
  return findValueIssuesByParameter(artifact ? [artifact] : []);
}

// --- Padrões --------------------------------------------------------------------

export interface PatternIssue {
  /** Campos que os outros disparos do mesmo evento têm e este não tem */
  missing: string[];
  /** Campos que só este disparo tem */
  extra: string[];
  siblings: number;
  message: string;
}

/**
 * Sinaliza padrões com uma única ocorrência. Quando o mesmo evento aparece em
 * outros padrões do mapa, compara com o padrão mais usado desse evento e diz
 * quais campos faltam ou sobram.
 */
export function findPatternIssues(
  patterns: Array<{ pattern_id: string; event: string; signature: string[]; count: number }>
): Map<string, PatternIssue> {
  const issues = new Map<string, PatternIssue>();
  for (const pat of patterns || []) {
    if (pat.count !== 1) continue;
    const siblings = patterns.filter((p) => p !== pat && p.event === pat.event);
    if (siblings.length === 0) {
      issues.set(pat.pattern_id, {
        missing: [],
        extra: [],
        siblings: 0,
        message: 'Disparado uma única vez neste mapa. Confira se a tela e os campos estão certos.',
      });
      continue;
    }
    const main = [...siblings].sort((a, b) => b.count - a.count)[0];
    const mine = new Set(pat.signature || []);
    const theirs = new Set(main.signature || []);
    const missing = Array.from(theirs).filter((f) => !mine.has(f));
    const extra = Array.from(mine).filter((f) => !theirs.has(f));
    const total = siblings.reduce((acc, p) => acc + p.count, 0);
    issues.set(pat.pattern_id, {
      missing,
      extra,
      siblings: total,
      message: `Único disparo de "${pat.event}" com estes campos; os outros ${total} usam outro conjunto.`,
    });
  }
  return issues;
}
