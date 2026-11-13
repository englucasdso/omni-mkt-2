# OMNI

O OMNI organiza os mapas de mensuração (tagueamento) que estão no Confluence. Ele lê a árvore de páginas, reconhece telas, status e códigos de disparo e mostra tudo num inventário pesquisável. Nada depende de IA ou de serviço externo: tudo roda na máquina, com regras fixas.

## O que tem

- **Nova busca**: por nome, por parâmetro ou trecho de código e por pergunta.
- **Cards** e **Inventário**: a base inteira, com filtros e exportação (Excel, CSV ou JSON).
- **Conexões**: a árvore Produto > Subproduto > Mapa.
- **Jornadas**: as telas de um mapa agrupadas em etapas.
- **Por produto**, **Por parâmetro** e **Insights**: homologação, GA4 x Universal Analytics, parâmetros e idade da documentação.
- **Base de padrões**: cadastro das páginas de padrões do Confluence (pelo favorito Extrator OMNI) e os pontos roxos "para conferir" nos mapas.
- **Guia de tagueamento**: leitura dos padrões cadastrados, com busca.
- **Saúde da documentação**: mapas parados, correções esquecidas e desperdício.

## Como rodar

Requisitos: **Node 18.17.x** e **npm 9.6.x** (outras versões não são suportadas) e o **Google Chrome** instalado (a sincronização usa o Chrome pelo Playwright).

Na pasta do projeto:

```sh
npm install
```

Para usar no dia a dia (mais rápido):

```sh
npm run producao
```

Para mexer no código (recompila a cada alteração, mais lento):

```sh
npm run dev
```

Nos dois casos o OMNI abre em `http://localhost:3000`.

Outros comandos:

- `npm run lint`: confere os tipos do TypeScript.
- `npm run build`: só gera a pasta `dist` (o `producao` já faz isso).

O arquivo `.env` é opcional. O `.env.example` mostra o que dá para ajustar.

## Sincronizar com o Confluence

O botão **Atualizar do Confluence** relê a árvore inteira. Na primeira vez (ou quando a sessão expira) o Chrome abre para você entrar com SSO/MFA; depois a coleta segue sozinha, em segundo plano. Se der erro ou você cancelar, o inventário anterior é mantido.

## Onde ficam os dados

Tudo em `backend/data/`:

| Arquivo | O que é | Vai para o Git? |
|---|---|---|
| `inventario.json` | Inventário sincronizado do Confluence | Só a versão de exemplo |
| `users.json` | Usuários locais | Sim |
| `padroes.json` | Páginas de padrões importadas na Base de padrões | Não |
| `playwright_session/` | Sessão do Chrome usada na sincronização | Não, nunca |

## Estrutura

```text
backend/src/
  index.ts                  servidor Express (API em /api e o site)
  routes/                   rotas: inventário e busca, usuários, padrões
  integrations/confluence/  sessão do Chrome, leitura da árvore, leitura dos mapas, parâmetros, Unicode
  services/                 inventário, classificação (taxonomia, GA4/GA3), busca por pergunta
  repositories/             leitura e gravação segura dos .json

frontend/src/
  app/                      App.tsx e as rotas
  components/               telas e peças da interface
  domain/                   regras: status, homologação, mensuração, saúde, jornadas, padrões
  services/                 chamadas à API e motor de busca
  workers/                  busca rodando fora da tela (não trava a interface)
```
