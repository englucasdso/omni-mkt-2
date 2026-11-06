// frontend/src/services/artifactSearchEngine.ts
// Pure in-memory deterministic search engine for tracking artifacts, screens, snippets, and parameters.
// Runs seamlessly in Web Workers, Node, or Browser main thread without DOM dependencies.

import { Artifact } from '../types';
import {
  cleanCodeLiteral,
  normalizeCodeForComparison,
  detectQueryKind,
  extractQueryParams,
  normalizeText,
  ParameterQueryKind,
  ParsedQueryParam,
} from '../utils/parameterSearchParser';

export interface WorkerArtifactItem {
  id: string;
  titulo: string;
  artifact_type: string;
  produto?: string;
  subproduto?: string;
  full_path?: string;
  ancestor_titles?: string[];
  responsavel?: string;
  screens?: Array<{
    screen_id: string;
    screen_index?: number;
    instruction?: string;
    status?: string;
    snippets?: Array<{
      snippet_id?: string;
      raw_code?: string;
      event_normalized?: string;
      base_key?: string;
      parameters?: Array<{
        name?: string;
        path?: string;
        value?: any;
      }>;
    }>;
  }>;
}

export interface IndexedSnippet {
  snippet_index: number;
  event_normalized: string;
  normEvent: string;
  base_key: string;
  normBaseKey: string;
  raw_code: string;
  raw_code_clean: string;
  raw_code_normalized: string;
  normRawCode: string;
  parameters: Array<{
    name: string;
    normName: string;
    path: string;
    normPath: string;
    value: string;
    normValue: string;
  }>;
  normParamNames: Set<string>;
  normParamPaths: Set<string>;
  normParamValues: Set<string>;
}

export interface IndexedScreen {
  screen_id: string;
  screen_index: number;
  instruction: string;
  normInstruction: string;
  status: string;
  snippets: IndexedSnippet[];
}

export interface IndexedArtifact {
  id: string;
  normId: string;
  titulo: string;
  normTitle: string;
  artifact_type: string;
  produto: string;
  normProduto: string;
  subproduto: string;
  normSubproduto: string;
  full_path: string;
  normFullPath: string;
  responsavel: string;
  screens: IndexedScreen[];
}

export interface ContentSearchResult {
  artifactId: string;
  score: number;
  matchedFields: string[];
  screenId?: string;
  screenIndex?: number;
  screenTitle?: string;
  snippetIndex?: number;
  codeExcerpt?: string;
  matchedValue?: string;
}

export interface ParameterCriterion {
  field: 'nome' | 'caminho' | 'valor' | 'qualquer';
  operator: 'existe' | 'igual' | 'contem' | 'comeca_com';
  value: string;
}

export interface ParameterSearchResult {
  artifactId: string;
  screenId: string;
  screenIndex: number;
  screenTitle?: string;
  snippetIndex: number;
  matchedCriteria: string[];
  matchedValues: string[];
  rawCodePreview?: string;
  event?: string;
  additionalMatchesCount: number;
}

export type ParameterMatchQuality =
  | 'identical_snippet'
  | 'literal_slice'
  | 'normalized_code'
  | 'all_params_snippet'
  | 'all_params_screen'
  | 'partial_match';

export interface ParameterOccurrence {
  screenId: string;
  screenIndex: number;
  screenTitle: string;
  snippetIndex: number;
  event: string;
  quality: ParameterMatchQuality;
  qualityLabel: string;
  qualityScore: number;
  matchedCount: number;
  totalCount: number;
  rawCodePreview: string;
  rawCodeFull: string;
  matchedTerms: string[];
}

export interface ParameterArtifactGroup {
  artifactId: string;
  totalOccurrences: number;
  uniqueScreensCount: number;
  uniqueSnippetsCount: number;
  bestQuality: ParameterMatchQuality;
  bestQualityLabel: string;
  bestQualityScore: number;
  isPartial: boolean;
  occurrences: ParameterOccurrence[];
}

export interface AdvancedParameterSearchResponse {
  completeGroups: ParameterArtifactGroup[];
  partialGroups: ParameterArtifactGroup[];
  allArtifactIds: string[];
  totalArtifactsCount: number;
  queryKind: ParameterQueryKind;
  extractedParams: ParsedQueryParam[];
  durationMs: number;
}

class ArtifactSearchEngine {
  private indexedArtifacts: IndexedArtifact[] = [];
  private isReady = false;
  private nameFrequency = new Map<string, { original: string; count: number }>();
  private pathFrequency = new Map<string, { original: string; count: number }>();
  private valueFrequency = new Map<string, { original: string; count: number }>();

  public get ready(): boolean {
    return this.isReady;
  }

  public buildIndex(artifacts: (Artifact | WorkerArtifactItem)[]): void {
    this.nameFrequency.clear();
    this.pathFrequency.clear();
    this.valueFrequency.clear();

    this.indexedArtifacts = artifacts.map((art) => {
      const screens: IndexedScreen[] = (art.screens || []).map((sc, scIdx) => {
        const snippets: IndexedSnippet[] = (sc.snippets || []).map((snip, snipIdx) => {
          const params = (snip.parameters || []).map((p) => {
            const rawName = String(p.name || '').trim();
            const rawPath = String(p.path || '').trim();
            const rawVal = p.value !== undefined && p.value !== null ? String(p.value).trim() : '';

            const nName = normalizeText(rawName);
            const nPath = normalizeText(rawPath);
            const nVal = normalizeText(rawVal);

            if (rawName && nName.length > 1) {
              const cur = this.nameFrequency.get(nName) || { original: rawName, count: 0 };
              cur.count++;
              this.nameFrequency.set(nName, cur);
            }
            if (rawPath && nPath.length > 1) {
              const cur = this.pathFrequency.get(nPath) || { original: rawPath, count: 0 };
              cur.count++;
              this.pathFrequency.set(nPath, cur);
            }
            if (rawVal && nVal.length > 1 && nVal.length < 50) {
              const cur = this.valueFrequency.get(nVal) || { original: rawVal, count: 0 };
              cur.count++;
              this.valueFrequency.set(nVal, cur);
            }

            return {
              name: rawName,
              normName: nName,
              path: rawPath,
              normPath: nPath,
              value: rawVal,
              normValue: nVal,
            };
          });

          const rawEvent = String(snip.event_normalized || '').trim();
          const rawBaseKey = String(snip.base_key || '').trim();
          const rawCode = String(snip.raw_code || '').trim();

          const normParamNames = new Set<string>();
          const normParamPaths = new Set<string>();
          const normParamValues = new Set<string>();

          params.forEach((p) => {
            if (p.normName) normParamNames.add(p.normName);
            if (p.normPath) normParamPaths.add(p.normPath);
            if (p.normValue) normParamValues.add(p.normValue);
          });

          return {
            snippet_index: snipIdx,
            event_normalized: rawEvent,
            normEvent: normalizeText(rawEvent),
            base_key: rawBaseKey,
            normBaseKey: normalizeText(rawBaseKey),
            raw_code: rawCode,
            raw_code_clean: cleanCodeLiteral(rawCode),
            raw_code_normalized: normalizeCodeForComparison(rawCode),
            normRawCode: normalizeText(rawCode),
            parameters: params,
            normParamNames,
            normParamPaths,
            normParamValues,
          };
        });

        const rawInst = String(sc.instruction || '').trim();
        return {
          screen_id: String(sc.screen_id || scIdx + 1),
          screen_index: sc.screen_index ?? scIdx + 1,
          instruction: rawInst,
          normInstruction: normalizeText(rawInst),
          status: String(sc.status || ''),
          snippets,
        };
      });

      const rawTitle = String(art.titulo || '');
      const rawProd = String(art.produto || '');
      const rawSub = String(art.subproduto || '');
      const rawPath = String(art.full_path || '');
      const rawId = String(art.id || '');

      return {
        id: rawId,
        normId: normalizeText(rawId),
        titulo: rawTitle,
        normTitle: normalizeText(rawTitle),
        artifact_type: art.artifact_type || 'MAPA',
        produto: rawProd,
        normProduto: normalizeText(rawProd),
        subproduto: rawSub,
        normSubproduto: normalizeText(rawSub),
        full_path: rawPath,
        normFullPath: normalizeText(rawPath),
        responsavel: String(art.responsavel || ''),
        screens,
      };
    });

    this.isReady = true;
  }

  public searchContent(query: string, limit = 50): ContentSearchResult[] {
    const normQuery = normalizeText(query);
    if (!normQuery) return [];

    const tokens = normQuery.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    const results: ContentSearchResult[] = [];

    for (const art of this.indexedArtifacts) {
      let score = 0;
      const matchedFields = new Set<string>();
      let bestScreenId: string | undefined;
      let bestScreenIndex: number | undefined;
      let bestScreenTitle: string | undefined;
      let bestSnippetIndex: number | undefined;
      let codeExcerpt: string | undefined;
      let matchedValue: string | undefined;

      // Check exact title or ID match
      if (art.normId === normQuery || art.normTitle === normQuery) {
        score += 150;
        matchedFields.add('Título/ID exato');
      } else if (art.normTitle.startsWith(normQuery) || art.normId.startsWith(normQuery)) {
        score += 100;
        matchedFields.add('Início do Título');
      }

      // Check tokens in title
      const titleTokenHits = tokens.filter((t) => art.normTitle.includes(t) || art.normId.includes(t)).length;
      if (titleTokenHits > 0) {
        score += titleTokenHits * 35;
        matchedFields.add('Título');
      }

      // Check Produto / Subproduto
      const prodHits = tokens.filter((t) => art.normProduto.includes(t) || art.normSubproduto.includes(t)).length;
      if (prodHits > 0) {
        score += prodHits * 25;
        matchedFields.add('Produto/Subproduto');
      }

      // Check Full Path
      const pathHits = tokens.filter((t) => art.normFullPath.includes(t)).length;
      if (pathHits > 0) {
        score += pathHits * 10;
        matchedFields.add('Caminho');
      }

      // Search inside screens and snippets
      let foundInSnippet = false;
      for (const sc of art.screens) {
        const instHits = tokens.filter((t) => sc.normInstruction.includes(t)).length;
        if (instHits > 0) {
          score += instHits * 20;
          matchedFields.add('Instrução da Tela');
          if (!bestScreenId) {
            bestScreenId = sc.screen_id;
            bestScreenIndex = sc.screen_index;
            bestScreenTitle = sc.instruction;
          }
        }

        for (const snip of sc.snippets) {
          let snippetScore = 0;
          const evHits = tokens.filter((t) => snip.normEvent.includes(t) || snip.normBaseKey.includes(t)).length;
          if (evHits > 0) {
            snippetScore += evHits * 30;
            matchedFields.add('Evento');
            matchedValue = snip.event_normalized || snip.base_key;
          }

          let paramHitCount = 0;
          for (const p of snip.parameters) {
            const matchParam = tokens.filter((t) => p.normName.includes(t) || p.normPath.includes(t) || p.normValue.includes(t)).length;
            if (matchParam > 0) {
              paramHitCount += matchParam;
              if (!matchedValue) matchedValue = `${p.name}: ${p.value}`;
            }
          }
          if (paramHitCount > 0) {
            snippetScore += paramHitCount * 18;
            matchedFields.add('Parâmetro');
          }

          const codeHits = tokens.filter((t) => snip.normRawCode.includes(t)).length;
          if (codeHits > 0) {
            snippetScore += codeHits * 12;
            matchedFields.add('Código');
          }

          if (snippetScore > 0 && !foundInSnippet) {
            foundInSnippet = true;
            bestScreenId = sc.screen_id;
            bestScreenIndex = sc.screen_index;
            bestScreenTitle = sc.instruction;
            bestSnippetIndex = snip.snippet_index;
            codeExcerpt = snip.raw_code ? snip.raw_code.slice(0, 140) : undefined;
          }

          score += snippetScore;
        }
      }

      if (score > 0) {
        results.push({
          artifactId: art.id,
          score,
          matchedFields: Array.from(matchedFields),
          screenId: bestScreenId,
          screenIndex: bestScreenIndex,
          screenTitle: bestScreenTitle,
          snippetIndex: bestSnippetIndex,
          codeExcerpt,
          matchedValue,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private evaluateCriterionOnSnippet(
    criterion: ParameterCriterion,
    snippet: IndexedSnippet
  ): { matched: boolean; label?: string; val?: string } {
    const op = criterion.operator;
    const f = criterion.field;
    const targetNorm = normalizeText(criterion.value);

    if (op === 'existe') {
      if (!targetNorm) {
        return { matched: snippet.parameters.length > 0, label: 'Parâmetro existe' };
      }
      const found = snippet.parameters.find(
        (p) =>
          (f === 'nome' && (p.normName === targetNorm || p.normName.includes(targetNorm))) ||
          (f === 'caminho' && (p.normPath === targetNorm || p.normPath.includes(targetNorm))) ||
          (f === 'valor' && (p.normValue === targetNorm || p.normValue.includes(targetNorm))) ||
          (f === 'qualquer' && (p.normName.includes(targetNorm) || p.normPath.includes(targetNorm) || p.normValue.includes(targetNorm)))
      );
      if (found) {
        return { matched: true, label: `${found.name} existe`, val: found.value };
      }
      if ((f === 'qualquer' || f === 'nome') && (snippet.normEvent.includes(targetNorm) || snippet.normBaseKey.includes(targetNorm))) {
        return { matched: true, label: `Evento ${snippet.event_normalized} existe`, val: snippet.event_normalized };
      }
      return { matched: false };
    }

    if (!targetNorm) return { matched: false };

    for (const p of snippet.parameters) {
      let matchesField = false;
      let valMatched = '';

      if (f === 'nome') {
        if (op === 'igual') matchesField = p.normName === targetNorm;
        else if (op === 'contem') matchesField = p.normName.includes(targetNorm);
        else if (op === 'comeca_com') matchesField = p.normName.startsWith(targetNorm);
        valMatched = `${p.name}: ${p.value}`;
      } else if (f === 'caminho') {
        if (op === 'igual') matchesField = p.normPath === targetNorm;
        else if (op === 'contem') matchesField = p.normPath.includes(targetNorm);
        else if (op === 'comeca_com') matchesField = p.normPath.startsWith(targetNorm);
        valMatched = `${p.path} = ${p.value}`;
      } else if (f === 'valor') {
        if (op === 'igual') matchesField = p.normValue === targetNorm;
        else if (op === 'contem') matchesField = p.normValue.includes(targetNorm);
        else if (op === 'comeca_com') matchesField = p.normValue.startsWith(targetNorm);
        valMatched = `${p.name} = "${p.value}"`;
      } else {
        if (op === 'igual') {
          matchesField = p.normName === targetNorm || p.normValue === targetNorm || p.normPath === targetNorm;
        } else if (op === 'contem') {
          matchesField = p.normName.includes(targetNorm) || p.normValue.includes(targetNorm) || p.normPath.includes(targetNorm);
        } else if (op === 'comeca_com') {
          matchesField = p.normName.startsWith(targetNorm) || p.normValue.startsWith(targetNorm);
        }
        valMatched = `${p.name} = ${p.value}`;
      }

      if (matchesField) {
        return { matched: true, label: `${p.name} (${op})`, val: valMatched };
      }
    }

    if (f === 'nome' || f === 'qualquer') {
      let evMatch = false;
      if (op === 'igual') evMatch = snippet.normEvent === targetNorm || snippet.normBaseKey === targetNorm;
      else if (op === 'contem') evMatch = snippet.normEvent.includes(targetNorm) || snippet.normBaseKey.includes(targetNorm);
      else if (op === 'comeca_com') evMatch = snippet.normEvent.startsWith(targetNorm) || snippet.normBaseKey.startsWith(targetNorm);

      if (evMatch) {
        return { matched: true, label: `Evento ${snippet.event_normalized}`, val: snippet.event_normalized };
      }
    }

    return { matched: false };
  }

  public searchParameters(
    criteria: ParameterCriterion[],
    combination: 'AND' | 'OR',
    scope: 'SNIPPET' | 'SCREEN',
    limit = 500
  ): ParameterSearchResult[] {
    if (!criteria || criteria.length === 0) return [];

    const canonicalCriteria = [...criteria].sort((a, b) => {
      const keyA = `${a.field || ''}:${a.operator || ''}:${a.value || ''}`;
      const keyB = `${b.field || ''}:${b.operator || ''}:${b.value || ''}`;
      return keyA.localeCompare(keyB);
    });

    interface ArtifactMatchGroup {
      artifactId: string;
      totalMatches: number;
      results: ParameterSearchResult[];
    }

    const matchedGroups: ArtifactMatchGroup[] = [];

    for (const art of this.indexedArtifacts) {
      let artifactMatchesCount = 0;
      const artifactResults: ParameterSearchResult[] = [];

      for (const sc of art.screens) {
        if (scope === 'SNIPPET') {
          for (const snip of sc.snippets) {
            const matchedCriteriaList: string[] = [];
            const matchedValuesList: string[] = [];

            let allMatched = true;
            let anyMatched = false;

            for (const crit of canonicalCriteria) {
              const evalRes = this.evaluateCriterionOnSnippet(crit, snip);
              if (evalRes.matched) {
                anyMatched = true;
                if (evalRes.label) matchedCriteriaList.push(evalRes.label);
                if (evalRes.val) matchedValuesList.push(evalRes.val);
              } else {
                allMatched = false;
              }
            }

            const isMatch = combination === 'AND' ? allMatched : anyMatched;
            if (isMatch) {
              artifactMatchesCount++;
              artifactResults.push({
                artifactId: art.id,
                screenId: sc.screen_id,
                screenIndex: sc.screen_index,
                screenTitle: sc.instruction,
                snippetIndex: snip.snippet_index,
                matchedCriteria: matchedCriteriaList,
                matchedValues: matchedValuesList,
                rawCodePreview: snip.raw_code ? snip.raw_code.slice(0, 160) : undefined,
                event: snip.event_normalized,
                additionalMatchesCount: 0,
              });
            }
          }
        } else {
          const screenCriteriaMatched = new Map<number, { label: string; val: string; snippetIdx: number }>();

          canonicalCriteria.forEach((crit, critIdx) => {
            for (const snip of sc.snippets) {
              const evalRes = this.evaluateCriterionOnSnippet(crit, snip);
              if (evalRes.matched) {
                screenCriteriaMatched.set(critIdx, {
                  label: evalRes.label || 'Parâmetro',
                  val: evalRes.val || '',
                  snippetIdx: snip.snippet_index,
                });
                break;
              }
            }
          });

          const isMatch =
            combination === 'AND'
              ? screenCriteriaMatched.size === canonicalCriteria.length
              : screenCriteriaMatched.size > 0;

          if (isMatch) {
            artifactMatchesCount++;
            const firstSnippetIdx = screenCriteriaMatched.values().next().value?.snippetIdx ?? 0;
            const snip = sc.snippets[firstSnippetIdx] || sc.snippets[0];

            artifactResults.push({
              artifactId: art.id,
              screenId: sc.screen_id,
              screenIndex: sc.screen_index,
              screenTitle: sc.instruction,
              snippetIndex: firstSnippetIdx,
              matchedCriteria: Array.from(screenCriteriaMatched.values()).map((v) => v.label),
              matchedValues: Array.from(screenCriteriaMatched.values()).map((v) => v.val),
              rawCodePreview: snip?.raw_code ? snip.raw_code.slice(0, 160) : undefined,
              event: snip?.event_normalized,
              additionalMatchesCount: 0,
            });
          }
        }
      }

      if (artifactResults.length > 0) {
        artifactResults[0].additionalMatchesCount = Math.max(0, artifactMatchesCount - 1);
        matchedGroups.push({
          artifactId: art.id,
          totalMatches: artifactMatchesCount,
          results: artifactResults,
        });
      }
    }

    matchedGroups.sort((a, b) => {
      if (b.totalMatches !== a.totalMatches) return b.totalMatches - a.totalMatches;
      return a.artifactId.localeCompare(b.artifactId);
    });

    const finalResults: ParameterSearchResult[] = [];
    for (const group of matchedGroups) {
      finalResults.push(...group.results);
      if (finalResults.length >= limit) break;
    }

    return finalResults.slice(0, limit);
  }

  public getSuggestions(field: string, input: string, limit = 10): string[] {
    const normInput = normalizeText(input);
    let mapToSearch = this.nameFrequency;
    if (field === 'caminho') mapToSearch = this.pathFrequency;
    else if (field === 'valor') mapToSearch = this.valueFrequency;

    const candidates: Array<{ original: string; count: number; starts: boolean }> = [];

    for (const [normKey, entry] of mapToSearch.entries()) {
      if (!normInput || normKey.includes(normInput)) {
        candidates.push({
          original: entry.original,
          count: entry.count,
          starts: normKey.startsWith(normInput),
        });
      }
    }

    candidates.sort((a, b) => {
      if (a.starts && !b.starts) return -1;
      if (!a.starts && b.starts) return 1;
      if (b.count !== a.count) return b.count - a.count;
      return a.original.localeCompare(b.original);
    });

    return candidates.slice(0, limit).map((c) => c.original);
  }

  public searchCodeAndParameters(
    rawQuery: string,
    options?: {
      matchType?: 'auto' | 'literal' | 'normalized' | 'params';
      scope?: 'SNIPPET' | 'SCREEN';
      condition?: 'AND' | 'OR';
      limit?: number;
    }
  ): AdvancedParameterSearchResponse {
    const startTime = Date.now();
    const trimmed = (rawQuery || '').trim();

    if (!trimmed) {
      return {
        completeGroups: [],
        partialGroups: [],
        allArtifactIds: [],
        totalArtifactsCount: 0,
        queryKind: 'parameter',
        extractedParams: [],
        durationMs: 0,
      };
    }

    const queryKind = detectQueryKind(trimmed);
    const cleanedQuery = cleanCodeLiteral(trimmed);
    const normalizedQuery = normalizeCodeForComparison(trimmed);
    const extractedParams = extractQueryParams(trimmed);

    const matchType = options?.matchType || 'auto';
    const scope = options?.scope || 'SNIPPET';
    const condition = options?.condition || 'AND';

    const searchTerms: string[] = [];
    extractedParams.forEach((p) => {
      if (p.name) searchTerms.push(p.name);
      if (p.value) searchTerms.push(p.value);
    });
    if (cleanedQuery.length < 50) {
      searchTerms.push(cleanedQuery);
    }

    const rawArtifactGroups: ParameterArtifactGroup[] = [];

    for (const art of this.indexedArtifacts) {
      const occurrencesMap = new Map<string, ParameterOccurrence>();

      for (const sc of art.screens) {
        for (const snip of sc.snippets) {
          let bestQuality: ParameterMatchQuality | null = null;
          let qualityLabel = '';
          let qualityScore = 0;
          let matchedCount = 0;
          const totalCount = extractedParams.length > 0 ? extractedParams.length : 1;
          const localMatchedTerms = new Set<string>();

          // Layer 1: Identical snippet
          if (
            (matchType === 'auto' || matchType === 'literal' || matchType === 'normalized') &&
            snip.raw_code_clean.length > 0 &&
            snip.raw_code_clean === cleanedQuery
          ) {
            bestQuality = 'identical_snippet';
            qualityLabel = 'Snippet idêntico';
            qualityScore = 1000;
            matchedCount = totalCount;
            searchTerms.forEach((t) => localMatchedTerms.add(t));
          }
          // Layer 2: Literal slice
          else if (
            (matchType === 'auto' || matchType === 'literal') &&
            cleanedQuery.length >= 3 &&
            snip.raw_code_clean.includes(cleanedQuery)
          ) {
            bestQuality = 'literal_slice';
            qualityLabel = 'Trecho exato';
            qualityScore = 800;
            matchedCount = totalCount;
            localMatchedTerms.add(cleanedQuery);
            searchTerms.forEach((t) => localMatchedTerms.add(t));
          }
          // Layer 3: Normalized code equivalent
          else if (
            (matchType === 'auto' || matchType === 'normalized') &&
            normalizedQuery.length >= 3 &&
            (snip.raw_code_normalized === normalizedQuery || snip.raw_code_normalized.includes(normalizedQuery))
          ) {
            bestQuality = 'normalized_code';
            qualityLabel = 'Código equivalente';
            qualityScore = 600;
            matchedCount = totalCount;
            searchTerms.forEach((t) => localMatchedTerms.add(t));
          }

          // Layer 4 & 6: Structured matching on snippet
          if (
            !bestQuality &&
            extractedParams.length > 0 &&
            (matchType === 'auto' || matchType === 'params')
          ) {
            let paramMatches = 0;

            for (const param of extractedParams) {
              const pNormName = normalizeText(param.name);
              const pNormVal = param.value ? normalizeText(param.value) : '';
              let paramHit = false;

              for (const p of snip.parameters) {
                const nameHit = p.normName === pNormName || p.normPath === pNormName || p.normName.includes(pNormName);
                if (pNormVal) {
                  const valHit = p.normValue === pNormVal || p.normValue.includes(pNormVal);
                  if (nameHit && valHit) {
                    paramHit = true;
                    localMatchedTerms.add(p.name);
                    localMatchedTerms.add(p.value);
                    break;
                  }
                } else if (nameHit) {
                  paramHit = true;
                  localMatchedTerms.add(p.name);
                  break;
                }
              }

              if (!paramHit && (pNormName === 'event' || pNormName === 'evento' || !param.value)) {
                if (pNormVal) {
                  if (snip.normEvent === pNormVal || snip.normBaseKey === pNormVal || snip.normEvent.includes(pNormVal)) {
                    paramHit = true;
                    localMatchedTerms.add(snip.event_normalized);
                    localMatchedTerms.add(param.value!);
                  }
                } else if (snip.normEvent.includes(pNormName) || snip.normBaseKey.includes(pNormName)) {
                  paramHit = true;
                  localMatchedTerms.add(snip.event_normalized);
                }
              }

              if (!paramHit && pNormName) {
                if (pNormVal) {
                  if (
                    snip.raw_code_normalized.includes(`${pNormName}:"${pNormVal}"`) ||
                    snip.raw_code_normalized.includes(`${pNormName}="${pNormVal}"`) ||
                    (snip.raw_code_normalized.includes(pNormName) && snip.raw_code_normalized.includes(pNormVal))
                  ) {
                    paramHit = true;
                    localMatchedTerms.add(param.name);
                    localMatchedTerms.add(param.value!);
                  }
                } else if (snip.raw_code_normalized.includes(pNormName)) {
                  paramHit = true;
                  localMatchedTerms.add(param.name);
                }
              }

              if (paramHit) {
                paramMatches++;
              }
            }

            if (condition === 'AND') {
              if (paramMatches === extractedParams.length) {
                bestQuality = 'all_params_snippet';
                qualityLabel = 'Todos os parâmetros encontrados';
                qualityScore = 400;
                matchedCount = paramMatches;
              } else if (paramMatches > 0 && scope === 'SNIPPET') {
                bestQuality = 'partial_match';
                qualityLabel = `Correspondência parcial (${paramMatches} de ${extractedParams.length})`;
                qualityScore = 50 + Math.round((paramMatches / extractedParams.length) * 100);
                matchedCount = paramMatches;
              }
            } else {
              if (paramMatches > 0) {
                bestQuality = 'all_params_snippet';
                qualityLabel = `${paramMatches} parâmetro(s) encontrado(s)`;
                qualityScore = 400;
                matchedCount = paramMatches;
              }
            }
          }

          if (bestQuality) {
            const occKey = `${sc.screen_id}#${snip.snippet_index}`;
            const existing = occurrencesMap.get(occKey);
            if (!existing || existing.qualityScore < qualityScore) {
              occurrencesMap.set(occKey, {
                screenId: sc.screen_id,
                screenIndex: sc.screen_index,
                screenTitle: sc.instruction || `Tela #${sc.screen_index}`,
                snippetIndex: snip.snippet_index,
                event: snip.event_normalized || snip.base_key || 'Snippet',
                quality: bestQuality,
                qualityLabel,
                qualityScore,
                matchedCount,
                totalCount,
                rawCodePreview: snip.raw_code ? snip.raw_code.slice(0, 320) : '',
                rawCodeFull: snip.raw_code || '',
                matchedTerms: Array.from(localMatchedTerms),
              });
            }
          }
        } // end snippet loop

        // Layer 5: Scope SCREEN evaluation
        if (
          scope === 'SCREEN' &&
          extractedParams.length > 1 &&
          (matchType === 'auto' || matchType === 'params')
        ) {
          let screenParamMatches = 0;
          const screenMatchedTerms = new Set<string>();

          for (const param of extractedParams) {
            const pNormName = normalizeText(param.name);
            const pNormVal = param.value ? normalizeText(param.value) : '';
            let foundInScreen = false;

            for (const snip of sc.snippets) {
              for (const p of snip.parameters) {
                const nameHit = p.normName === pNormName || p.normPath === pNormName || p.normName.includes(pNormName);
                if (pNormVal) {
                  const valHit = p.normValue === pNormVal || p.normValue.includes(pNormVal);
                  if (nameHit && valHit) {
                    foundInScreen = true;
                    screenMatchedTerms.add(p.name);
                    screenMatchedTerms.add(p.value);
                    break;
                  }
                } else if (nameHit) {
                  foundInScreen = true;
                  screenMatchedTerms.add(p.name);
                  break;
                }
              }
              if (foundInScreen) break;

              if (pNormName === 'event' || pNormName === 'evento' || !param.value) {
                if (pNormVal) {
                  if (snip.normEvent === pNormVal || snip.normBaseKey === pNormVal) {
                    foundInScreen = true;
                    screenMatchedTerms.add(snip.event_normalized);
                    screenMatchedTerms.add(param.value!);
                    break;
                  }
                }
              }
            }

            if (foundInScreen) {
              screenParamMatches++;
            }
          }

          const isScreenAllMatched = screenParamMatches === extractedParams.length;
          if (isScreenAllMatched) {
            const occKey = `${sc.screen_id}#screen_level`;
            if (!occurrencesMap.has(occKey)) {
              const firstSnip = sc.snippets[0];
              occurrencesMap.set(occKey, {
                screenId: sc.screen_id,
                screenIndex: sc.screen_index,
                screenTitle: sc.instruction || `Tela #${sc.screen_index}`,
                snippetIndex: 0,
                event: firstSnip?.event_normalized || 'Vários disparos',
                quality: 'all_params_screen',
                qualityLabel: 'Todos os parâmetros na mesma tela',
                qualityScore: 200,
                matchedCount: screenParamMatches,
                totalCount: extractedParams.length,
                rawCodePreview: firstSnip?.raw_code ? firstSnip.raw_code.slice(0, 320) : '',
                rawCodeFull: firstSnip?.raw_code || '',
                matchedTerms: Array.from(screenMatchedTerms),
              });
            }
          } else if (screenParamMatches > 0) {
            const occKey = `${sc.screen_id}#screen_partial`;
            if (!occurrencesMap.has(occKey) && occurrencesMap.size === 0) {
              const firstSnip = sc.snippets[0];
              occurrencesMap.set(occKey, {
                screenId: sc.screen_id,
                screenIndex: sc.screen_index,
                screenTitle: sc.instruction || `Tela #${sc.screen_index}`,
                snippetIndex: 0,
                event: firstSnip?.event_normalized || 'Snippet',
                quality: 'partial_match',
                qualityLabel: `Correspondência parcial (${screenParamMatches} de ${extractedParams.length})`,
                qualityScore: 40 + Math.round((screenParamMatches / extractedParams.length) * 100),
                matchedCount: screenParamMatches,
                totalCount: extractedParams.length,
                rawCodePreview: firstSnip?.raw_code ? firstSnip.raw_code.slice(0, 320) : '',
                rawCodeFull: firstSnip?.raw_code || '',
                matchedTerms: Array.from(screenMatchedTerms),
              });
            }
          }
        }
      } // end screen loop

      const occurrences = Array.from(occurrencesMap.values());
      if (occurrences.length > 0) {
        occurrences.sort((a, b) => b.qualityScore - a.qualityScore);
        const best = occurrences[0];

        const uniqueScreens = new Set(occurrences.map((o) => o.screenId)).size;
        const uniqueSnippets = new Set(occurrences.map((o) => `${o.screenId}-${o.snippetIndex}`)).size;

        rawArtifactGroups.push({
          artifactId: art.id,
          totalOccurrences: occurrences.length,
          uniqueScreensCount: uniqueScreens,
          uniqueSnippetsCount: uniqueSnippets,
          bestQuality: best.quality,
          bestQualityLabel: best.qualityLabel,
          bestQualityScore: best.qualityScore,
          isPartial: best.quality === 'partial_match',
          occurrences,
        });
      }
    } // end artifact loop

    const completeGroups = rawArtifactGroups.filter((g) => !g.isPartial);
    const partialGroups = rawArtifactGroups.filter((g) => g.isPartial);

    const groupSorter = (a: ParameterArtifactGroup, b: ParameterArtifactGroup) => {
      if (b.bestQualityScore !== a.bestQualityScore) return b.bestQualityScore - a.bestQualityScore;
      if (b.totalOccurrences !== a.totalOccurrences) return b.totalOccurrences - a.totalOccurrences;
      return a.artifactId.localeCompare(b.artifactId);
    };

    completeGroups.sort(groupSorter);
    partialGroups.sort(groupSorter);

    const allArtifactIds: string[] = [
      ...completeGroups.map((g) => g.artifactId),
      ...partialGroups.map((g) => g.artifactId),
    ];

    return {
      completeGroups,
      partialGroups,
      allArtifactIds,
      totalArtifactsCount: allArtifactIds.length,
      queryKind,
      extractedParams,
      durationMs: Date.now() - startTime,
    };
  }
}

export const artifactSearchEngine = new ArtifactSearchEngine();
