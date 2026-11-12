/**
 * Arquivo: backend/routes/search.routes.ts
 * Propósito: Define os "caminhos" (rotas) da API. Quando o frontend faz um 
 * request para `/api/qualquer-coisa`, é este arquivo que intercepta esse pedido
 * e decide qual função do service deve ser acionada.
 */
import { Router } from "express";
import { getInventoryData, searchArtifacts } from "../services/inventory.service.js";
import { runCollection, abortCollection, getSyncStatus } from "../integrations/confluenceClient.js";
import { searchSemantic } from "../services/semanticSearch.service.js";

const router = Router();

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
 * ROTA: POST /api/search/question
 * Fazer uma pergunta: busca em linguagem natural pelos termos da pergunta (sem IA).
 */
router.post("/search/question", (req, res) => {
  const { question, limit } = req.body || {};
  const queryText = String(question || "").trim();
  if (!queryText) {
    return res.status(400).json({ error: "Escreva uma pergunta sobre os artefatos." });
  }
  try {
    return res.json(searchSemantic(queryText, Number(limit) || 20));
  } catch (error: any) {
    console.error(`[Pergunta] Falha na busca: ${error.message}`);
    return res.status(500).json({ error: "Não foi possível concluir a busca." });
  }
});

export default router;
