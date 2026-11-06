/**
 * Arquivo: backend/index.ts
 * Propósito: Ponto de entrada (Entrypoint) do servidor do projeto.
 * Ele inicializa um servidor usando o framework Express, responsável por 
 * gerenciar rotas de API (pedidos de dados) e também por "servir" os arquivos
 * visuais do frontend para o navegador.
 */

import 'dotenv/config';
console.log('DEV SERVER GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'Present' : 'Undefined');
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import searchRoutes from "./routes/search.routes";
import usersRoutes from "./routes/users.routes";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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


  // Integração e Servimento do Frontend (Visão do Usuário)
  if (process.env.NODE_ENV !== "production") {
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
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Inicializa o servidor e o faz "escutar" os acessos na porta definida
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Frontend integration active via Vite middleware`);
  });
}

startServer();
