# Omni Marketing Platform

A Plataforma Omni Marketing é o portal centralizado do time de Martech, unindo gestão de artefatos de dados, inventário de propriedades digitais, visualização de conexões e geração de insights através de Inteligência Artificial Generativa (Google Gemini) e integração automatizada com Confluence e GA4.

---

## 🚀 O Que a Plataforma Faz

- **Copilot Central:** Assistente conversacional na página inicial ajudando a guiar os usuários de acordo com seu perfil de acesso e fornecendo resumos contextuais.
- **Hub de Artefatos:** Busca unificada (Fuzzy Search) em todos os mapeamentos de tagueamento e documentos, facilitando encontrar a jornada de cada subproduto.
- **Conexões (Canvas):** Uma visão inteligente em árvore mostrando a relação hierárquica `Produto -> Subproduto -> Mapas`, usando layout de grafos com D3.js e ReactFlow.
- **Insights Operacionais com IA:** Geração instantânea de Resumos Executivos estruturados a partir dos artefatos utilizando inteligência do Google Gemini.
- **Hub de Eventos:** Integração automatizada com Google Analytics 4 utilizando Service Accounts via script em Python, possibilitando o monitoramento de eventos que estão ativos versus inativos.
- **Integração Confluence:** Scraping inteligente das páginas de documentação do Confluence via API (Basic Auth) para auto-povoamento do inventário de métricas.
- **Visão Dark / Light Mode:** Uma interface moderna baseada em Glassmorphism, Design Tokens e TailwindCSS, implementando o "Bradesco Neo-Dark".
- **Gestão de Controle de Acesso (RBAC):** Múltiplos níveis de permissão (Administrador, Gestor 360, Estratégico, Eventos, Artefatos).

---

## 🏗️ Arquitetura do Projeto (Atualizada)

O projeto evoluiu para uma arquitetura Enterprise Limpa, adotando **Monorepo / Full-Stack** utilizando Node.js (com TSX), Express, React e Vite. A separação estrita de domínios garante a escalabilidade do sistema.

### Estrutura Global
```text
/
├── backend/                  # Monolito Backend isolado em sua infra
│   ├── src/                  
│   │   ├── certs/            # Certificados Root caso existam proxies corporativos
│   │   ├── config/           # Configurações de ambiente / chaves
│   │   ├── controllers/      # Handlers (se expandir rotas mvc)
│   │   ├── data/             # Banco de dados local Base (.json de estados atuais)
│   │   ├── integrations/     # Python Scripts (sync_ga4.py) e SDKs (confluenceClient.js)
│   │   ├── middlewares/      # Interceptores do Express (Autenticadores futuros)
│   │   ├── providers/        # Integração estrita de infra (BDs)
│   │   ├── routes/           # Mapeamento do Express (search, users, ga4)
│   │   ├── services/         # Lógica de negócio pesada (IA, Levenshtein, Insights)
│   │   ├── types/            # Tipos e interfaces estritos do lado server
│   │   ├── utils/            # Utilitários (parsings)
│   │   └── index.ts          # Arquivo Central - Entrypoint Express Backend
│   ├── requirements.txt      # Dependências para Integração Python GA4
│
├── frontend/                 # Aplicação React (SPA servida pelo Vite/Middleware)
│   ├── src/
│   │   ├── app/              # Lógica core visual (App.tsx global, router-wrapper)
│   │   ├── assets/           # Imagens e fontes estáticas
│   │   ├── components/       # Componentes Globais reutilizáveis (Canvas, UI solta)
│   │   ├── contexts/         # React Contexts
│   │   ├── features/         # Módulos estritos por Página/Domínio. 
│   │   │   ├── catalog/      
│   │   │   ├── copilot/      
│   │   │   ├── event-capture/
│   │   │   └── home/
│   │   ├── hooks/            # Custom Hooks Compartilhados
│   │   ├── layouts/          # Estruturas padrão de Container
│   │   ├── routes/           # Declaração das trilhas do Router
│   │   ├── services/         # Wrappers Fetch pra enviar requests à nossa API (api.ts)
│   │   ├── styles/           # Tailwind CSS index de classes
│   │   ├── types/            # Contratos de tipos (Interfaces e Tipagens)
│   │   ├── utils/            # Helpers de formatação frontend, datas e manipulação visual
│   │   └── main.tsx          # Ponto de Injeção no index.html
│
├── package.json              # Gerenciador único de módulos (Vite + Express)
```

---

## 💻 Setup Completo: Como Rodar Localmente

Siga o passo a passo de forma exata para subir seu projeto do zero, sem gambiarras:

### 1. Requisitos do Sistema
- **Node.js** (versão 18.17.0+ - Preferência ao LTS).
- **Python 3** instalado (preferencialmente >= 3.10) (Crucial para a sync do GA4).
- Terminal padrão com permissões de read/write.

### 2. Instalar Dependências do JS/TS
No diretório *raiz* do projeto:
```sh
npm install
```

### 3. Configuração de Variáveis de Ambiente
O sistema depende primariamente da API Generativa do Google. Outras chaves futuras também moram aqui.
Crie um arquivo `.env` idêntico ao conteúdo de `.env.example` na **raiz** do projeto e insira as credenciais reais:
```sh
GEMINI_API_KEY=sua_chave_real_aqui_para_ia
```

### 4. Configuração Python & Integração Google Analytics 4
O Módulo de Hub de Eventos consulta a API do Google Analytics usando Python:
1. Certifique-se de ter obtido um arquivo `ga4-service-account.json`. (Credenciais do GC para extrair a conta UA/GA4).
2. Cole esse arquivo em `/backend/src/secrets/ga4-service-account.json`.
3. Instale as bibliotecas padrão do Python (Analytics API) presentes no "requirements.txt". 
Dentro de `/backend/`:
```sh
cd backend
pip install -r requirements.txt
```

### 5. Configurar o Executável Global do Python (Opcional, porém recomendado para Windows)
No arquivo `/backend/src/routes/ga4.routes.ts`, caso você não possua o python mapeado mundialmente no seu Env Path (só se aplicável), existe a constante `PYTHON_EXE`. Pode ser alterada para `'python'` ou `'python3'` num mac/linux.

### 6. Executando para Desenvolvimento
Na máquina dev, você quer Hot-reload (Fast Refresh) e Logs verbosos no Express. 
Volte para a **raiz** do projeto e digite:
```sh
npm run dev
```
O framework "tsx" subirá o `backend/src/index.ts`, e ele mesmo embarca o `vite.middlewares` para compilar o Frontend via SSR-mock-routing no mesmo porto.
**URL Local:** `http://localhost:3000`

---

## 🚀 Build e Produção Integrados

Na hora de fazer Deploy ou ir para a Nuvem (Cloud Run, EC2, Azure), o projeto não utilizará o Middleware do Vite, mas sim servirá a pasta de assets já engessada (com cache agresivo).

1. Compilar todo o JS, TS e CSS para estáticos mimificados:
```sh
npm run build
```
*(O output estará na raiz da pasta `dist/`)*

2. Iniciar o Server simulando produção real:
```sh
NODE_ENV=production npm start
```
A partir daqui, quem recebe `/*` é a infra de fallback SPA do `express.static('dist')`. O painel subirá com máximo de performance.

---

## 🛠️ Manutenção e Limpeza Técnica
A refatoração da v2.0 removeu lixos como scripts órfãos `test-app`, versões aleatórias de cores (white.txt, bg50), aglomerando as chamadas em Services dedicados (`ai.service`, `executiveSummary.service`). Ninguém do frontend tem o direito de realizar um lookup pro Banco de Dados local ou IA de forma exposta; tudo converge mediante as rotas da porta 3000. 

*Felicidade no código! O projeto está homologado com padrão Enterprise.*
