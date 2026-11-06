import { GoogleGenerativeAI } from "@google/generative-ai";
import { getInventoryData } from "./inventory.service.js";

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
  confidence: "ALTA" | "MEDIA" | "BAIXA";
  reason: string;
  evidence: string[];
  codeSnippet?: string;
  event?: string;
}

export interface SemanticSearchResponse {
  message: string;
  results: SemanticSearchResultItem[];
}

interface CacheEntry {
  timestamp: number;
  data: SemanticSearchResponse;
}

// In-memory cache for successful AI queries (10 minutes TTL)
const searchAiCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function normalizeString(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Valida a configuração do Gemini para a busca semântica
 */
export function validateSearchGeminiConfig(): { apiKey: string; modelName: string } {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    console.error("[SearchAI] Erro de configuração: GEMINI_API_KEY não configurada.");
    throw new Error("Configuração ausente: variável de ambiente GEMINI_API_KEY não foi definida.");
  }

  const modelName = process.env.GEMINI_MODEL ? process.env.GEMINI_MODEL.trim() : "gemini-1.5-flash";
  return { apiKey: apiKey.trim(), modelName };
}

/**
 * Filtra e seleciona candidatos relevantes no inventário local para enviar ao modelo
 */
function selectLocalCandidates(inventory: any[], question: string, maxCandidates = 15): any[] {
  const normalizedQ = normalizeString(question);
  const terms = normalizedQ.split(" ").filter((t) => t.length > 2);

  if (terms.length === 0) {
    return inventory.slice(0, maxCandidates);
  }

  const scored: Array<{ artifact: any; score: number }> = [];

  for (const item of inventory) {
    let score = 0;
    const normTitle = normalizeString(item.titulo || "");
    const normProd = normalizeString(item.produto || "");
    const normSub = normalizeString(item.subproduto || "");
    const normPath = normalizeString(item.full_path || "");

    for (const term of terms) {
      if (normTitle.includes(term)) score += 35;
      if (normProd.includes(term)) score += 20;
      if (normSub.includes(term)) score += 20;
      if (normPath.includes(term)) score += 10;
    }

    // Screens and snippets content check
    if (Array.isArray(item.screens)) {
      for (const screen of item.screens) {
        const normInst = normalizeString(screen.instruction || "");
        for (const term of terms) {
          if (normInst.includes(term)) score += 15;
        }

        if (Array.isArray(screen.snippets)) {
          for (const snip of screen.snippets) {
            const normEvent = normalizeString(snip.event_normalized || "");
            const normKey = normalizeString(snip.base_key || "");
            for (const term of terms) {
              if (normEvent.includes(term)) score += 12;
              if (normKey.includes(term)) score += 10;
            }

            if (Array.isArray(snip.parameters)) {
              for (const p of snip.parameters) {
                const normPName = normalizeString(p.name || "");
                const normPVal = normalizeString(String(p.value || ""));
                for (const term of terms) {
                  if (normPName.includes(term)) score += 8;
                  if (normPVal.includes(term)) score += 10;
                }
              }
            }
          }
        }
      }
    }

    if (score > 0) {
      scored.push({ artifact: item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxCandidates).map((s) => s.artifact);
}

/**
 * Sanitiza candidatos para reduzir tokens antes de enviar ao Gemini
 */
function sanitizeCandidatesForModel(candidates: any[]) {
  return candidates.map((art) => ({
    id: String(art.id),
    titulo: String(art.titulo || ""),
    artifact_type: String(art.artifact_type || ""),
    produto: String(art.produto || ""),
    subproduto: String(art.subproduto || ""),
    screens: (art.screens || []).slice(0, 10).map((sc: any, scIdx: number) => ({
      screen_id: String(sc.screen_id || scIdx + 1),
      screen_index: sc.screen_index ?? scIdx + 1,
      instruction: (sc.instruction || "").slice(0, 200),
      status: sc.status || "",
      snippets: (sc.snippets || []).slice(0, 6).map((snip: any, snipIdx: number) => ({
        snippet_index: snipIdx,
        event: snip.event_normalized || "",
        base_key: snip.base_key || "",
        code_preview: (snip.raw_code || "").slice(0, 120),
        parameters: (snip.parameters || []).slice(0, 12).map((p: any) => ({
          name: p.name || "",
          path: p.path || "",
          value: String(p.value ?? "").slice(0, 60),
        })),
      })),
    })),
  }));
}

/**
 * Executa busca semântica em dois estágios com IA
 */
export async function searchSemantic(
  question: string,
  filters?: any,
  limit = 10
): Promise<SemanticSearchResponse> {
  const startTime = Date.now();
  const trimmedQuestion = question.trim();

  console.log(`[SearchAI] Início da requisição. Tamanho da pergunta: ${trimmedQuestion.length} caracteres.`);

  const { apiKey, modelName } = validateSearchGeminiConfig();
  console.log(`[SearchAI] Modelo configurado: ${modelName}`);

  const inventory = getInventoryData();
  const cacheKey = `${normalizeString(trimmedQuestion)}_${JSON.stringify(filters || {})}_${inventory.length}_${modelName}`;

  const cached = searchAiCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[SearchAI] Resultado recuperado do cache. Quantidade: ${cached.data.results.length}`);
    return cached.data;
  }

  // 1. Selecionar candidatos locais
  const localCandidates = selectLocalCandidates(inventory, trimmedQuestion, 15);
  console.log(`[SearchAI] Quantidade de candidatos locais: ${localCandidates.length}`);

  if (localCandidates.length === 0) {
    console.log(`[SearchAI] Nenhum candidato local encontrado para a pergunta.`);
    return {
      message: "Não encontrei artefatos com evidência suficiente para essa pergunta.",
      results: [],
    };
  }

  const sanitizedCandidates = sanitizeCandidatesForModel(localCandidates);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
    systemInstruction: `Você é o mecanismo de busca semântica do Hub de Artefatos de Tagueamento.
Sua responsabilidade é interpretar a pergunta do usuário e identificar quais artefatos do inventário fornecido correspondem à intenção.
REGRAS OBRIGATÓRIAS:
1. Responda ESTRITAMENTE em formato JSON.
2. NUNCA invente artefatos, IDs, telas ou códigos. Utilize APENAS os itens da lista de candidatos fornecida.
3. Para cada artefato correspondente, forneça:
   - "artifactId": ID exato do candidato
   - "screenId": ID da tela correspondente (se aplicável) ou null
   - "snippetIndex": índice numérico do snippet correspondente (se aplicável) ou null
   - "confidence": "ALTA", "MEDIA" ou "BAIXA"
   - "score": número entre 0.1 e 1.0 (relevância)
   - "reason": explicação concisa em português (1 a 2 frases) de por que este artefato é relevante para a pergunta
   - "evidence": lista de evidências concretas encontradas (ex: ["Instrução da tela cita benefício INSS", "Snippet possui evento 'proposta_consignado'"])
4. Se nenhum artefato possuir relação plausível ou evidência real para a pergunta, retorne a lista "results" vazia.
Schema JSON esperado:
{
  "results": [
    {
      "artifactId": "string",
      "screenId": "string | null",
      "snippetIndex": "number | null",
      "confidence": "ALTA" | "MEDIA" | "BAIXA",
      "score": 0.95,
      "reason": "string",
      "evidence": ["string"]
    }
  ]
}`,
  });

  const prompt = `Pergunta do usuário: "${trimmedQuestion.replace(/"/g, '\\"')}"

Candidatos disponíveis no inventário:
${JSON.stringify(sanitizedCandidates, null, 2)}

Identifique os artefatos mais relevantes para responder à pergunta com base em evidências reais.`;

  console.log(`[SearchAI] Início da chamada ao modelo Gemini: ${new Date().toISOString()}`);
  const modelStartTime = Date.now();

  let responseText = "";
  try {
    const aiResult = await model.generateContent(prompt);
    responseText = aiResult.response.text();
    console.log(`[SearchAI] Fim da chamada ao modelo. Duração: ${Date.now() - modelStartTime}ms`);
  } catch (modelError: any) {
    console.error(`[SearchAI] Erro na chamada ao modelo Gemini: ${modelError.message}`);
    throw new Error(`Erro ao consultar modelo Gemini: ${modelError.message}`);
  }

  // Parsing e Validação
  let parsedJson: any = null;
  try {
    parsedJson = JSON.parse(responseText);
  } catch (parseError: any) {
    console.error(`[SearchAI] Erro de parsing da resposta do modelo: ${parseError.message}`);
    throw new Error("Resposta inválida do modelo de IA.");
  }

  const rawResults = Array.isArray(parsedJson?.results) ? parsedJson.results : [];
  const inventoryMap = new Map<string, any>(inventory.map((item: any) => [String(item.id), item]));
  const validatedResults: SemanticSearchResultItem[] = [];

  for (const res of rawResults) {
    if (!res || !res.artifactId) continue;
    const realArtifact = inventoryMap.get(String(res.artifactId));
    if (!realArtifact) {
      console.warn(`[SearchAI] Candidato descartado por não existir no inventário real: ${res.artifactId}`);
      continue;
    }

    let targetScreen: any = null;
    let targetSnippet: any = null;
    let screenIndex: number | undefined;

    if (Array.isArray(realArtifact.screens) && realArtifact.screens.length > 0) {
      if (res.screenId) {
        targetScreen = realArtifact.screens.find(
          (s: any) => String(s.screen_id) === String(res.screenId)
        );
      }
      if (!targetScreen) {
        targetScreen = realArtifact.screens[0];
      }

      if (targetScreen) {
        screenIndex = targetScreen.screen_index;
        if (Array.isArray(targetScreen.snippets) && targetScreen.snippets.length > 0) {
          const sIdx = typeof res.snippetIndex === "number" ? res.snippetIndex : 0;
          targetSnippet = targetScreen.snippets[sIdx] || targetScreen.snippets[0];
        }
      }
    }

    const confidence: "ALTA" | "MEDIA" | "BAIXA" =
      res.confidence === "ALTA" || res.confidence === "MEDIA" || res.confidence === "BAIXA"
        ? res.confidence
        : "MEDIA";

    const evidences = Array.isArray(res.evidence)
      ? res.evidence.map((e: any) => String(e).trim()).filter(Boolean)
      : [];

    validatedResults.push({
      artifactId: String(realArtifact.id),
      title: realArtifact.titulo || "",
      artifactType: realArtifact.artifact_type || "MAPA",
      produto: realArtifact.produto || "",
      subproduto: realArtifact.subproduto || "",
      screenId: targetScreen ? String(targetScreen.screen_id) : undefined,
      screenIndex: screenIndex,
      screenTitle: targetScreen ? (targetScreen.instruction || `Tela ${screenIndex || 1}`) : undefined,
      snippetIndex: typeof res.snippetIndex === "number" ? res.snippetIndex : 0,
      score: typeof res.score === "number" ? res.score : 0.8,
      confidence,
      reason: String(res.reason || "Artefato relacionado aos termos pesquisados."),
      evidence: evidences.length > 0 ? evidences : ["Correspondência semântica identificada na especificação."],
      codeSnippet: targetSnippet?.raw_code ? targetSnippet.raw_code.slice(0, 180) : undefined,
      event: targetSnippet?.event_normalized || undefined,
    });
  }

  // Ordenar por score decrescente
  validatedResults.sort((a, b) => b.score - a.score);
  const slicedResults = validatedResults.slice(0, limit);

  console.log(`[SearchAI] Quantidade de resultados validados: ${slicedResults.length}. Duração total: ${Date.now() - startTime}ms`);

  const response: SemanticSearchResponse = {
    message:
      slicedResults.length > 0
        ? `Encontrei ${slicedResults.length} artefato${slicedResults.length > 1 ? "s" : ""} potencialmente relacionado${slicedResults.length > 1 ? "s" : ""} à sua busca.`
        : "Não encontrei artefatos com evidência suficiente para essa pergunta.",
    results: slicedResults,
  };

  // Armazena no cache apenas se tiver tido sucesso
  searchAiCache.set(cacheKey, { timestamp: Date.now(), data: response });

  return response;
}
