/**
 * Arquivo: backend/routes/search.routes.ts
 * Propósito: Define os "caminhos" (rotas) da API. Quando o frontend faz um 
 * request para `/api/qualquer-coisa`, é este arquivo que intercepta esse pedido
 * e decide qual função do service deve ser acionada.
 */
import { Router } from "express";
import { getInventoryData, calculateInsights, searchArtifacts } from "../services/inventory.service.js";
import { runCollection, abortCollection, getSyncStatus } from "../integrations/confluenceClient.js";
// ai.service.ts import and route have been moved to frontend

import { generateInsightsAnalysis } from "../services/ai.service.js";
import { generateExecutiveSummary } from "../services/executiveSummary.service.js";
import { analyzeJourneyWithAI, buildDocumentarySequence } from "../services/journeyAnalysis.service.js";
import { searchSemantic } from "../services/semanticSearch.service.js";

const router = Router();

router.post("/insights/executive-summary", async (req, res) => {
  try {
    const { artifacts, term, context } = req.body;
    if (!artifacts) {
      return res.status(400).json({ error: "No artifacts sent" });
    }
    const summary = await generateExecutiveSummary(artifacts, { term, context });
    res.json(summary);
  } catch (error: any) {
    console.error(`[API] Erro no Resumo Executivo:`, error);
    res.status(500).json({ error: error.message || "Erro ao gerar resumo executivo" });
  }
});

router.post("/insights/artifacts", async (req, res) => {
  try {
    const artifacts = req.body || [];
    const analysis = await generateInsightsAnalysis(artifacts);
    res.json(analysis);
  } catch (error: any) {
    console.error("[API] Erro ao gerar insights:", error);
    res.status(500).json({ error: "Erro ao gerar insights com IA." });
  }
});

router.post("/insights/journeys/analyze", async (req, res) => {
  const { artifact } = req.body || {};
  if (!artifact || !artifact.id) {
    return res.status(400).json({ error: "Nenhum mapa fornecido para análise." });
  }

  try {
    const result = await analyzeJourneyWithAI(artifact);
    return res.json(result);
  } catch (error: any) {
    const isConfigError = String(error.message || '').includes('Configuração ausente:');
    const statusCode = isConfigError ? 400 : 502;
    const fallbackSeq = buildDocumentarySequence(artifact);

    return res.status(statusCode).json({
      error: error.message || "Erro ao processar análise da jornada com IA.",
      isAiGenerated: false,
      fallback: true,
      nodes: fallbackSeq.nodes,
      edges: fallbackSeq.edges,
      message: "Não foi possível concluir a análise por IA. Exibindo apenas a sequência documental."
    });
  }
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
 * Traz todos os artefatos disponíveis de forma bruta, montando os insights gerais.
 */
router.get("/inventario", (req, res) => {
  try {
    const inventory = getInventoryData();
    res.json({
      total: inventory.length,
      resultados: inventory,
      insights: calculateInsights(inventory) // Os insights são gerados em tempo real com base na base total
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
  const { rootId, maxRows } = req.body || {};

  if (!rootId) {
    return res.status(400).json({ error: "ID root da página é obrigatório" });
  }

  try {
    const data = await runCollection(rootId, maxRows || null);
    res.json({ success: true, count: data.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
      resultados: results,
      insights: calculateInsights(results)
    });
  } catch (error) {
    res.status(500).json({ error: "Erro ao processar busca" });
  }
});

/**
 * ROTA: POST /api/search/semantic
 * Executa busca semântica em dois estágios utilizando IA (Gemini) sobre o inventário real.
 */
router.post("/search/semantic", async (req, res) => {
  const { question, query, filters, limit } = req.body || {};
  const queryText = String(question || query || "").trim();

  if (!queryText) {
    return res.status(400).json({
      error: "Pergunta é obrigatória para a busca com IA.",
      message: "Faça uma pergunta sobre os artefatos disponíveis."
    });
  }

  try {
    const result = await searchSemantic(queryText, filters, limit || 10);
    return res.json(result);
  } catch (error: any) {
    const isConfigError = String(error.message || "").includes("Configuração ausente:");
    const statusCode = isConfigError ? 400 : 502;
    console.error(`[SearchAI] Falha na busca por IA: ${error.message}`);
    return res.status(statusCode).json({
      error: error.message || "Não foi possível concluir a busca por IA.",
      message: "Não foi possível concluir a busca por IA."
    });
  }
});

export default router;
