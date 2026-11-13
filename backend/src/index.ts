/**
 * Arquivo: backend/index.ts
 * Propósito: Ponto de entrada (Entrypoint) do servidor do projeto.
 * Ele inicializa um servidor usando o framework Express, responsável por 
 * gerenciar rotas de API (pedidos de dados) e também por "servir" os arquivos
 * visuais do frontend para o navegador.
 */

import 'dotenv/config';
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import searchRoutes from "./routes/search.routes";
import usersRoutes from "./routes/users.routes";
import padroesRoutes from "./routes/padroes.routes";

async function startServer() {
  const app = express();
  const PORT = 3000; // A porta oficial onde o serviço ficará disponível

  // Permite que o servidor entenda dados enviados no formato JSON (aumentado para evitar PayloadTooLargeError)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Roteamento da API (Backend)
  // Tudo que começar com "/api" será repassado para as lógicas de busca 
  // definidas dentro do arquivo searchRoutes.ts
  app.use("/api", searchRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/padroes", padroesRoutes);


  // Integração e Servimento do Frontend (Visão do Usuário)
  // Produção: NODE_ENV=production ou "npm run producao" (passa --prod).
  // Serve o site já empacotado, sem as verificações do modo de desenvolvimento.
  const isProduction = process.env.NODE_ENV === "production" || process.argv.includes("--prod");

  if (!isProduction) {
    // Modo de Desenvolvimento (Programação): 
    // Usa o Vite como intermediário (middleware) para dar suporte à compilação em tempo real.
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa", // spa = Single Page Application
    });
    app.use(vite.middlewares);
  } else {
    // Modo de Produção (Pronto para o ar):
    // Serve os arquivos já empacotados e otimizados pelo vite (que ficam na pasta /dist).
    const distPath = path.join(process.cwd(), "dist");
    // Arquivos de /assets têm o conteúdo no nome (ex.: index-ColsAN6y.js): o navegador pode guardar por 1 ano.
    // O index.html é sempre conferido, para uma versão nova aparecer na hora.
    app.use("/assets", express.static(path.join(distPath, "assets"), { immutable: true, maxAge: "1y", fallthrough: false }));
    app.use(express.static(distPath, { index: false }));
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Inicializa o servidor e o faz "escutar" os acessos na porta definida
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}${isProduction ? " (modo produção)" : ""}`);
    console.log(isProduction ? "Servindo o site empacotado (pasta dist)" : "Modo de desenvolvimento: Vite compilando em tempo real");
  });
}

startServer();
