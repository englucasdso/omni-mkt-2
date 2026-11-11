/**
 * Arquivo: backend/routes/search.routes.ts
 * Propósito: Define os "caminhos" (rotas) da API. Quando o frontend faz um 
 * request para `/api/qualquer-coisa`, é este arquivo que intercepta esse pedido
 * e decide qual função do service deve ser acionada.
 */
import { Router } from "express";
import { getInventoryData, searchArtifacts } from "../services/inventory.service.js";
import { runCollection, abortCollection, getSyncStatus } from "../integrations/confluenceClient.js";
import { analyzeJourneyWithAI, buildDocumentarySequence } from "../services/journeyAnalysis.service.js";
import { searchSemantic } from "../services/semanticSearch.service.js";
import { describeAiConfig, testAiConnection, toAiErrorResponse } from "../services/ai/llmClient.js";

const router = Router();

router.post("/insights/journeys/analyze", async (req, res) => {
  const { artifact } = req.body || {};
  if (!artifact || !artifact.id) {
    return res.status(400).json({ error: "Nenhum mapa fornecido para análise." });
  }

  try {
    const result = await analyzeJourneyWithAI(artifact);
    return res.json(result);
  } catch (error: any) {
    const { status, body } = toAiErrorResponse(error);
    const fallbackSeq = buildDocumentarySequence(artifact);
    return res.status(status).json({
      ...body,
      isAiGenerated: false,
      fallback: true,
      nodes: fallbackSeq.nodes,
      edges: fallbackSeq.edges,
    });
  }
});

/**
 * ROTA: GET /api/ai/status
 * Mostra qual IA está configurada (sem expor a chave).
 * Com ?test=1, faz uma chamada mínima para provar que a IA responde desta máquina.
 */
router.get("/ai/status", async (req, res) => {
  const config = describeAiConfig();
  if (req.query.test && config.configured) {
    const test = await testAiConnection();
    return res.json({ ...config, test });
  }
  return res.json(config);
});

router.post("/cancel-inventory", async (req, res) => {
  console.log(`[API] POST /api/cancel-inventory - Solicitação de cancelamento recebida.`);
  try {
    await abortCollection();
    res.json({ success: true, message: "Cancelamento solicitado" });
  } catch (error: any) {
    console.error(`[API] Erro ao cancelar: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * ROTA: GET /api/inventario
 * Traz todos os artefatos disponíveis. Indicadores são calculados no frontend (domain/).
 */
router.get("/inventario", (req, res) => {
  try {
    const inventory = getInventoryData();
    res.json({
      total: inventory.length,
      resultados: inventory
    });
  } catch (error) {
    res.status(500).json({ error: "Erro ao carregar inventário" });
  }
});

router.get("/sync-status", (_req, res) => {
  res.json(getSyncStatus());
});

/**
 * ROTA: POST /api/update-inventory
 * Uma rota "admin" usada para disparar a atualização do banco de dados 
 * lendo diretamente do sistema Confluence.
 */
router.post("/update-inventory", async (req, res) => {
  const { rootId, maxRows, mode, forceRefresh } = req.body || {};

  if (!rootId) {
    return res.status(400).json({ error: "ID root da página é obrigatório" });
  }

  try {
    const isFull = mode === "full" || forceRefresh === true;
    const data = await runCollection(rootId, maxRows || null, {
      mode: isFull ? "full" : (mode || "incremental"),
      forceRefresh: Boolean(isFull)
    });
    res.json({ success: true, count: data.length, status: getSyncStatus() });
  } catch (error: any) {
    res.status(500).json({ error: error.message, status: getSyncStatus() });
  }
});

/**
 * ROTA: GET /api/search?q=algumTexto
 * Responsável por filtrar os artefatos com base no parâmetro 'q' 
 * (abreviação comum para query). Retorna apenas os achados relevantes.
 */
router.get("/search", (req, res) => {
  const query = req.query.q as string || "";
  try {
    const results = searchArtifacts(query);
    res.json({
      total: results.length,
      resultados: results
    });
  } catch (error) {
    res.status(500).json({ error: "Erro ao processar busca" });
  }
});

/**
 * ROTA: POST /api/search/semantic
 * Perguntar à IA: ranking local + reranqueamento pela IA configurada.
 * Sem IA, devolve o ranking local e explica o motivo em aiUnavailableReason.
 */
router.post("/search/semantic", async (req, res) => {
  const { question, query, filters, limit } = req.body || {};
  const queryText = String(question || query || "").trim();

  if (!queryText) {
    return res.status(400).json({ error: "Escreva uma pergunta sobre os artefatos." });
  }

  try {
    const result = await searchSemantic(queryText, filters, limit || 10);
    return res.json(result);
  } catch (error: any) {
    console.error(`[SearchAI] Falha na busca: ${error.message}`);
    const { status, body } = toAiErrorResponse(error);
    return res.status(status).json(body);
  }
});

export default router;
