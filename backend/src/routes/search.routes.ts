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
import { WORKSPACES, resolveWorkspace, publicWorkspace } from "../config/workspaces.js";

const router = Router();

/** Lê o espaço pedido (?workspace= ou corpo). Sem espaço, usa o padrão. */
function workspaceFrom(value: unknown, res: any) {
  const ws = resolveWorkspace(typeof value === "string" ? value : undefined);
  if (!ws) {
    res.status(400).json({ error: `Espaço desconhecido: ${String(value)}.` });
    return null;
  }
  return ws;
}

/**
 * ROTA: GET /api/workspaces
 * Lista os espaços que o OMNI consegue ler (Salla de Performance, BE...).
 */
router.get("/workspaces", (_req, res) => {
  res.json({ workspaces: WORKSPACES.map(publicWorkspace), padrao: WORKSPACES[0].id });
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
  const ws = workspaceFrom(req.query.workspace, res);
  if (!ws) return;
  try {
    const inventory = getInventoryData(ws.id);
    res.json({
      total: inventory.length,
      resultados: inventory,
      workspace: publicWorkspace(ws)
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
  const { workspace, rootId, maxRows, mode, forceRefresh } = req.body || {};

  // O nó raiz vem da configuração do espaço, não da tela.
  // Chamadas antigas que mandam só o rootId continuam funcionando se ele for de um espaço conhecido.
  let ws = null;
  if (workspace) {
    ws = workspaceFrom(workspace, res);
    if (!ws) return;
  } else if (rootId) {
    ws = WORKSPACES.find((w) => w.rootId === String(rootId)) || null;
    if (!ws) {
      return res.status(400).json({ error: "Esse nó raiz não pertence a nenhum espaço configurado." });
    }
  } else {
    return res.status(400).json({ error: "Informe o espaço a sincronizar." });
  }

  try {
    const isFull = mode === "full" || forceRefresh === true;
    const data = await runCollection(ws.rootId, maxRows || null, {
      mode: isFull ? "full" : (mode || "incremental"),
      forceRefresh: Boolean(isFull),
      workspace: ws
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
  const ws = workspaceFrom(req.query.workspace, res);
  if (!ws) return;
  try {
    const results = searchArtifacts(query, ws.id);
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
  const { question, limit, workspace } = req.body || {};
  const queryText = String(question || "").trim();
  if (!queryText) {
    return res.status(400).json({ error: "Escreva uma pergunta sobre os artefatos." });
  }
  const ws = workspaceFrom(workspace, res);
  if (!ws) return;
  try {
    return res.json(searchSemantic(queryText, Math.min(Number(limit) || 50, 200), ws.id));
  } catch (error: any) {
    console.error(`[Pergunta] Falha na busca: ${error.message}`);
    return res.status(500).json({ error: "Não foi possível concluir a busca." });
  }
});

export default router;
