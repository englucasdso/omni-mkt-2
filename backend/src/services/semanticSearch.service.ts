/**
 * Fazer uma pergunta: busca em linguagem natural, sem IA.
 *
 * Tira da pergunta as palavras que não ajudam ("existe", "quais", "mapa"...),
 * tolera plural e flexão por radical, e pontua cada artefato pelo que encontra
 * no título, na taxonomia, na instrução das telas, nos eventos e nos valores
 * dos parâmetros. Artefatos que cobrem mais termos da pergunta sobem.
 * Cada resultado diz quais termos encontrou, onde, e qual tela abrir.
 */
import { getInventoryData } from './inventory.service.js';

export interface SemanticSearchResultItem {
  artifactId: string;
  title: string;
  artifactType: string;
  produto: string;
  subproduto: string;
  screenId?: string;
  screenIndex?: number;
  screenTitle?: string;
  snippetIndex?: number;
  score: number;
  confidence: 'ALTA' | 'MEDIA' | 'BAIXA';
  reason: string;
  evidence: string[];
  codeSnippet?: string;
  event?: string;
}

export interface SemanticSearchResponse {
  message: string;
  results: SemanticSearchResultItem[];
  /** Termos da pergunta que entraram na busca (depois de tirar as palavras vazias) */
  terms: string[];
}

const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no',
  'nas', 'nos', 'para', 'pra', 'por', 'com', 'sem', 'que', 'qual', 'quais', 'onde', 'como', 'quando',
  'existe', 'existem', 'tem', 'tem', 'ha', 'há', 'sao', 'são', 'esta', 'está', 'estao', 'ser', 'e',
  'ou', 'ao', 'aos', 'se', 'mais', 'menos', 'algum', 'alguma', 'algo', 'isso', 'esse', 'essa', 'este',
  'mapa', 'mapas', 'tela', 'telas', 'artefato', 'artefatos', 'possui', 'possuem', 'relacionado',
  'relacionada', 'relacionados', 'relacionadas', 'sobre', 'meu', 'minha', 'me', 'mostre', 'mostra',
  'liste', 'listar', 'encontre', 'buscar', 'busca', 'quero', 'ver', 'fluxo', 'fluxos', 'jornada',
  'jornadas', 'disparado', 'disparo', 'evento', 'eventos', 'usuario', 'usuário',
]);

function normalizeString(str: string): string {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface QueryTerm {
  term: string;
  stem: string;
  /** A palavra como o usuário escreveu, para mostrar na resposta */
  display: string;
}

function extractTerms(question: string): QueryTerm[] {
  const seen = new Set<string>();
  const terms: QueryTerm[] = [];
  for (const word of question.split(/\s+/)) {
    const display = word.replace(/^[^\p{L}\p{N}_]+|[^\p{L}\p{N}_]+$/gu, '').toLowerCase();
    for (const raw of normalizeString(word).split(' ')) {
      if (raw.length < 3 || STOPWORDS.has(raw) || seen.has(raw)) continue;
      seen.add(raw);
      // Radical simples para tolerar plural e flexão (cartoes ~ cartao, contratacao ~ contratar)
      const stem = raw.length >= 6 ? raw.slice(0, Math.max(4, raw.length - 3)) : raw;
      terms.push({ term: raw, stem, display: display || raw });
    }
  }
  return terms;
}

/** Conta quantas palavras do texto batem com o termo (palavra inteira, plural ou flexão). */
function countIn(tokens: string[], t: QueryTerm): number {
  let n = 0;
  for (const tok of tokens) {
    if (tok === t.term || tok.startsWith(t.stem)) n++;
  }
  return n;
}

const tokenize = (text: string): string[] => (text ? normalizeString(text).split(' ').filter(Boolean) : []);

/** Onde cada termo apareceu e quantas vezes */
type Area = 'título' | 'produto' | 'subproduto' | 'caminho' | 'instrução da tela' | 'evento' | 'parâmetros';
const AREA_WEIGHT: Record<Area, number> = {
  'título': 10,
  produto: 6,
  subproduto: 6,
  caminho: 2,
  'instrução da tela': 3,
  evento: 3,
  'parâmetros': 2,
};
/** Teto por área para um mapa enorme não ganhar só pelo tamanho */
const AREA_CAP = 40;

interface LocalCandidate {
  artifact: any;
  /** termo -> área -> ocorrências */
  hits: Map<string, Map<Area, number>>;
  /** Todos os termos (2+) aparecem juntos no mesmo snippet / na mesma tela */
  together: 'snippet' | 'tela' | null;
  bestScreen: any | null;
  bestSnippetIndex: number;
  weightedCoverage: number;
  occurrenceScore: number;
  score: number;
}

/**
 * Ranking em camadas:
 * 1. quem tem TODOS os termos vem primeiro;
 * 2. depois, quem cobre os termos mais específicos (palavra rara na base, como "INSS",
 *    vale mais do que palavra comum, como "cartão");
 * 3. termos juntos no mesmo snippet/tela sobem;
 * 4. por fim, quantas vezes os termos aparecem no título e nos parâmetros.
 */
function selectLocalCandidates(inventory: any[], terms: QueryTerm[], maxCandidates = 50): LocalCandidate[] {
  if (terms.length === 0) return [];
  const found: LocalCandidate[] = [];
  const docFreq = new Map<string, number>(terms.map((t) => [t.term, 0]));
  let totalDocs = 0;

  for (const item of inventory) {
    if (item.artifact_type === 'RAIZ') continue;
    totalDocs++;
    const hits = new Map<string, Map<Area, number>>();
    const add = (t: QueryTerm, area: Area, n: number) => {
      if (n <= 0) return;
      const m = hits.get(t.term) || new Map<Area, number>();
      m.set(area, (m.get(area) || 0) + n);
      hits.set(t.term, m);
    };

    const fields: Array<[Area, string]> = [
      ['título', item.titulo || ''],
      ['produto', item.produto || ''],
      ['subproduto', item.subproduto || ''],
      ['caminho', item.full_path || item.pai || ''],
    ];
    for (const [area, text] of fields) {
      const toks = tokenize(text);
      if (toks.length) for (const t of terms) add(t, area, countIn(toks, t));
    }

    let together: LocalCandidate['together'] = null;
    let bestScreen: any = null;
    let bestScreenKey = -1;
    let bestSnippetIndex = 0;

    for (const screen of Array.isArray(item.screens) ? item.screens : []) {
      const screenTerms = new Set<string>();
      let screenOcc = 0;
      let bestSnip = 0;
      let bestSnipKey = -1;
      const instToks = tokenize(`${screen.instruction || ''} ${screen.screen_name || ''} ${screen.additional_information || ''}`);
      for (const t of terms) {
        const n = countIn(instToks, t);
        if (n) {
          add(t, 'instrução da tela', n);
          screenTerms.add(t.term);
          screenOcc += n;
        }
      }
      (screen.snippets || []).forEach((snip: any, snipIdx: number) => {
        const snipTerms = new Set<string>();
        let snipOcc = 0;
        const evtToks = tokenize(`${snip.event_raw || ''} ${snip.event_normalized || ''}`);
        const paramToks = tokenize(
          (snip.parameters || []).map((p: any) => `${p.name || ''} ${p.normalized_value ?? p.value ?? ''}`).join(' ')
        );
        for (const t of terms) {
          const e = countIn(evtToks, t);
          const v = countIn(paramToks, t);
          add(t, 'evento', e);
          add(t, 'parâmetros', v);
          if (e + v > 0) {
            snipTerms.add(t.term);
            screenTerms.add(t.term);
            snipOcc += e + v;
          }
        }
        screenOcc += snipOcc;
        if (terms.length > 1 && snipTerms.size === terms.length) together = 'snippet';
        const key = snipTerms.size * 1000 + snipOcc;
        if (key > bestSnipKey) {
          bestSnipKey = key;
          bestSnip = snipIdx;
        }
      });
      if (terms.length > 1 && screenTerms.size === terms.length && together !== 'snippet') together = 'tela';
      // Melhor tela: a que tem mais termos diferentes, depois mais ocorrências
      const key = screenTerms.size * 1000 + screenOcc;
      if (screenTerms.size > 0 && key > bestScreenKey) {
        bestScreenKey = key;
        bestScreen = screen;
        bestSnippetIndex = bestSnip;
      }
    }

    if (hits.size === 0) continue;
    hits.forEach((_, term) => docFreq.set(term, (docFreq.get(term) || 0) + 1));
    found.push({
      artifact: item,
      hits,
      together,
      bestScreen,
      bestSnippetIndex,
      weightedCoverage: 0,
      occurrenceScore: 0,
      score: 0,
    });
  }

  // Peso de cada termo: quanto mais raro na base, mais ele define a pergunta
  const idf = new Map<string, number>();
  for (const t of terms) idf.set(t.term, Math.log(1 + totalDocs / Math.max(1, docFreq.get(t.term) || 0)));
  const idfTotal = terms.reduce((sum, t) => sum + (idf.get(t.term) || 0), 0) || 1;

  for (const c of found) {
    let covered = 0;
    let occ = 0;
    c.hits.forEach((areas, term) => {
      const w = idf.get(term) || 0;
      covered += w;
      areas.forEach((n, area) => (occ += w * AREA_WEIGHT[area] * Math.min(n, AREA_CAP)));
    });
    c.weightedCoverage = covered / idfTotal;
    c.occurrenceScore = occ;
  }

  const hasAll = (c: LocalCandidate) => c.hits.size === terms.length;
  const anyFull = found.some(hasAll);
  // Havendo resultados com todos os termos, só entram parciais que tenham os termos mais específicos
  const pool = anyFull ? found.filter((c) => hasAll(c) || c.weightedCoverage >= 0.5) : found;

  const togetherRank = (c: LocalCandidate) => (c.together === 'snippet' ? 2 : c.together === 'tela' ? 1 : 0);
  pool.sort(
    (a, b) =>
      Number(hasAll(b)) - Number(hasAll(a)) ||
      b.weightedCoverage - a.weightedCoverage ||
      togetherRank(b) - togetherRank(a) ||
      b.occurrenceScore - a.occurrenceScore
  );
  const top = pool[0]?.occurrenceScore || 1;
  pool.forEach((c) => (c.score = Math.round((c.weightedCoverage * 0.7 + Math.min(c.occurrenceScore / top, 1) * 0.3) * 100) / 100));
  return pool.slice(0, maxCandidates);
}

function screenLabel(screen: any, fallbackIdx = 0): string {
  const idx = Number.isInteger(screen?.screen_index) ? screen.screen_index : fallbackIdx;
  const name = String(screen?.screen_name || screen?.instruction || '').trim();
  return name ? `Tela ${idx + 1}: ${name.slice(0, 80)}` : `Tela ${idx + 1}`;
}

function buildResult(
  artifact: any,
  screen: any | null,
  snippetIndex: number,
  extra: Pick<SemanticSearchResultItem, 'score' | 'confidence' | 'reason' | 'evidence'>
): SemanticSearchResultItem {
  const snippet = screen?.snippets?.[snippetIndex] || screen?.snippets?.[0] || null;
  return {
    artifactId: String(artifact.id),
    title: artifact.titulo || '',
    artifactType: artifact.artifact_type || 'MAPA',
    produto: artifact.produto || '',
    subproduto: artifact.subproduto || '',
    screenId: screen ? String(screen.screen_id) : undefined,
    screenIndex: screen && Number.isInteger(screen.screen_index) ? screen.screen_index : undefined,
    screenTitle: screen ? screenLabel(screen) : undefined,
    snippetIndex: screen ? snippetIndex : undefined,
    codeSnippet: snippet?.raw_code ? String(snippet.raw_code).slice(0, 180) : undefined,
    event: snippet?.event_raw || snippet?.event_normalized || undefined,
    ...extra,
  };
}

function describeHits(areas: Map<Area, number>): string {
  return Array.from(areas.entries())
    .sort((x, y) => y[1] - x[1])
    .map(([area, n]) => (n > 1 ? `${area} (${n}x)` : area))
    .join(', ');
}

function localResults(candidates: LocalCandidate[], terms: QueryTerm[], limit: number): SemanticSearchResultItem[] {
  return candidates.slice(0, limit).map((c) => {
    const all = c.hits.size === terms.length;
    const confidence: 'ALTA' | 'MEDIA' | 'BAIXA' = all ? 'ALTA' : c.weightedCoverage >= 0.5 ? 'MEDIA' : 'BAIXA';
    const evidence = terms
      .filter((t) => c.hits.has(t.term))
      .map((t) => `${t.display}: ${describeHits(c.hits.get(t.term)!)}`);
    const missing = terms.filter((t) => !c.hits.has(t.term)).map((t) => t.display);
    if (c.together === 'snippet') evidence.push('Os termos aparecem juntos no mesmo código de disparo.');
    else if (c.together === 'tela') evidence.push('Os termos aparecem juntos na mesma tela.');
    const reason = all
      ? `Contém ${terms.length === 1 ? 'o termo' : `os ${terms.length} termos`} da pergunta.`
      : `Contém ${c.hits.size} de ${terms.length} termos. Não tem: ${missing.join(', ')}.`;
    return buildResult(c.artifact, c.bestScreen, c.bestSnippetIndex, {
      score: c.score,
      confidence,
      reason,
      evidence,
    });
  });
}

export function searchSemantic(question: string, limit = 50): SemanticSearchResponse {
  const trimmedQuestion = question.trim();
  const terms = extractTerms(trimmedQuestion);
  const candidates = selectLocalCandidates(getInventoryData(), terms, limit);
  const results = localResults(candidates, terms, limit);

  console.log(`[Pergunta] ${terms.length} termos úteis, ${results.length} resultados.`);

  if (terms.length === 0) {
    return {
      message: 'A pergunta não tem termos que dê para procurar. Use o nome do produto, da tela, do evento ou de um parâmetro.',
      results: [],
      terms: [],
    };
  }
  const fullCount = results.filter((r) => r.confidence === 'ALTA').length;
  const quoted = terms.map((t) => `"${t.display}"`).join(', ');
  let message: string;
  if (results.length === 0) {
    message = `Nenhum artefato contém ${quoted}. Tente outra palavra ou o nome do evento.`;
  } else if (fullCount === results.length) {
    message = `Encontrei ${fullCount} artefato${fullCount > 1 ? 's' : ''} com ${terms.length > 1 ? 'todos os termos' : 'o termo'} ${quoted}, olhando título e parâmetros. Os que mais citam os termos vêm primeiro.`;
  } else if (fullCount > 0) {
    const partial = results.length - fullCount;
    message = `Encontrei ${fullCount} artefato${fullCount > 1 ? 's' : ''} com todos os termos ${quoted}. Depois ${partial === 1 ? 'vem 1 artefato' : `vêm ${partial}`} com parte dos termos.`;
  } else {
    message = `Nenhum artefato tem todos os termos ${quoted}. Mostrando os que têm a maior parte, com prioridade para os termos mais específicos.`;
  }
  return { message, results, terms: terms.map((t) => t.display) };
}
