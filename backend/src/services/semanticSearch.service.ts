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

function matches(text: string, t: QueryTerm): boolean {
  return text.includes(t.term) || text.includes(t.stem);
}

interface LocalCandidate {
  artifact: any;
  score: number;
  matchedTerms: Set<string>;
  where: Set<string>;
  bestScreen: any | null;
  bestScreenScore: number;
  bestSnippetIndex: number;
}

/** Ranking local: título e taxonomia pesam mais; telas e snippets confirmam. */
function selectLocalCandidates(inventory: any[], terms: QueryTerm[], maxCandidates = 20): LocalCandidate[] {
  if (terms.length === 0) return [];
  const scored: LocalCandidate[] = [];

  for (const item of inventory) {
    if (item.artifact_type === 'RAIZ') continue;
    const cand: LocalCandidate = {
      artifact: item,
      score: 0,
      matchedTerms: new Set(),
      where: new Set(),
      bestScreen: null,
      bestScreenScore: 0,
      bestSnippetIndex: 0,
    };

    const fields: Array<[string, string, number]> = [
      ['título', normalizeString(item.titulo || ''), 35],
      ['produto', normalizeString(item.produto || ''), 20],
      ['subproduto', normalizeString(item.subproduto || ''), 20],
      ['caminho', normalizeString(item.full_path || item.pai || ''), 8],
    ];
    for (const [label, text, weight] of fields) {
      if (!text) continue;
      for (const t of terms) {
        if (matches(text, t)) {
          cand.score += weight;
          cand.matchedTerms.add(t.term);
          cand.where.add(label);
        }
      }
    }

    if (Array.isArray(item.screens)) {
      for (const screen of item.screens) {
        let screenScore = 0;
        let bestSnip = 0;
        let bestSnipScore = 0;
        const inst = normalizeString(`${screen.instruction || ''} ${screen.screen_name || ''} ${screen.additional_information || ''}`);
        for (const t of terms) {
          if (matches(inst, t)) {
            screenScore += 15;
            cand.matchedTerms.add(t.term);
            cand.where.add('instrução da tela');
          }
        }
        (screen.snippets || []).forEach((snip: any, snipIdx: number) => {
          let snipScore = 0;
          const evt = normalizeString(`${snip.event_raw || ''} ${snip.event_normalized || ''}`);
          const values = normalizeString(
            (snip.parameters || [])
              .map((p: any) => `${p.name || ''} ${p.normalized_value ?? p.value ?? ''}`)
              .join(' ')
          );
          for (const t of terms) {
            if (matches(evt, t)) {
              snipScore += 12;
              cand.matchedTerms.add(t.term);
              cand.where.add('evento');
            }
            if (matches(values, t)) {
              snipScore += 9;
              cand.matchedTerms.add(t.term);
              cand.where.add('parâmetros');
            }
          }
          if (snipScore > bestSnipScore) {
            bestSnipScore = snipScore;
            bestSnip = snipIdx;
          }
          screenScore += snipScore;
        });
        cand.score += Math.min(screenScore, 60);
        if (screenScore > cand.bestScreenScore) {
          cand.bestScreenScore = screenScore;
          cand.bestScreen = screen;
          cand.bestSnippetIndex = bestSnip;
        }
      }
    }

    if (cand.matchedTerms.size === 0) continue;
    // Cobrir mais termos da pergunta vale mais do que repetir o mesmo termo
    const coverage = cand.matchedTerms.size / terms.length;
    cand.score = cand.score * (0.4 + coverage);
    scored.push(cand);
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxCandidates);
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

function localResults(candidates: LocalCandidate[], terms: QueryTerm[], limit: number): SemanticSearchResultItem[] {
  const top = candidates[0]?.score || 1;
  return candidates.slice(0, limit).map((c) => {
    const coverage = c.matchedTerms.size / Math.max(terms.length, 1);
    const confidence: 'ALTA' | 'MEDIA' | 'BAIXA' = coverage >= 0.99 ? 'ALTA' : coverage >= 0.5 ? 'MEDIA' : 'BAIXA';
    const shown = terms.filter((t) => c.matchedTerms.has(t.term)).map((t) => t.display);
    const evidence = [`Termos encontrados: ${shown.join(', ')}`, `Onde: ${Array.from(c.where).join(', ')}`];
    if (c.bestScreen) evidence.push(screenLabel(c.bestScreen));
    return buildResult(c.artifact, c.bestScreenScore > 0 ? c.bestScreen : null, c.bestSnippetIndex, {
      score: Math.round((c.score / top) * 100) / 100,
      confidence,
      reason: `Contém ${c.matchedTerms.size} de ${terms.length} termos da pergunta.`,
      evidence,
    });
  });
}

export function searchSemantic(question: string, limit = 10): SemanticSearchResponse {
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
  return {
    message:
      results.length > 0
        ? `Encontrei ${results.length} artefato${results.length > 1 ? 's' : ''} com os termos ${terms.map((t) => `"${t.display}"`).join(', ')}.`
        : `Nenhum artefato contém ${terms.map((t) => `"${t.display}"`).join(', ')}. Tente outra palavra ou o nome do evento.`,
    results,
    terms: terms.map((t) => t.display),
  };
}
