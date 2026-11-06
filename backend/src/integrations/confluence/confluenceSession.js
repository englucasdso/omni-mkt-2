import { chromium } from 'playwright';
import path from 'path';

const MANUAL_AUTH_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos para conclusão de SSO/MFA
const AUTH_POLL_INTERVAL_MS = 1500;
const INITIAL_GOTO_TIMEOUT_MS = 45000;

let currentSyncSessionStatus = {
  active: false,
  phase: 'idle',
  step: 0,
  message: '',
  error: null
};

export function getSyncSessionStatus() {
  return { ...currentSyncSessionStatus };
}

export function setSyncSessionStatus(update) {
  currentSyncSessionStatus = {
    ...currentSyncSessionStatus,
    ...update
  };
}

export class ConfluenceSession {
  constructor(baseUrl = 'https://confluence.bradesco.com.br:8443') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.expectedHost = new URL(this.baseUrl).host.toLowerCase();
    this.context = null;
    this.page = null;
    this.isCancelled = false;
    this.userDataDir = path.resolve('backend/data/playwright_session');
  }

  notifyStatus(phase, step, message, error = null) {
    setSyncSessionStatus({
      active: phase !== 'completed' && phase !== 'error' && phase !== 'idle',
      phase,
      step,
      message,
      error
    });
  }

  /**
   * Verifica se uma URL pertence ao host esperado do Confluence (confluence.bradesco.com.br:8443).
   */
  isOnConfluenceHost(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false;
    try {
      const parsed = new URL(urlStr);
      return parsed.host.toLowerCase() === this.expectedHost;
    } catch (_) {
      return false;
    }
  }

  /**
   * Identifica se a URL indica redirecionamento para login corporativo (Microsoft, SAML, SSO, login.action, etc.)
   * ou se está fora do host confluence.bradesco.com.br:8443.
   */
  isAuthUrlOrExternalHost(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false;
    if (urlStr === 'about:blank' || urlStr.startsWith('chrome-error://')) return false;

    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch (_) {
      return false;
    }

    const host = parsed.host.toLowerCase();
    const href = parsed.href.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (
      host.includes('login.microsoftonline.com') ||
      host.includes('microsoftonline') ||
      host.includes('msftauth') ||
      host.includes('live.com') ||
      href.includes('saml') ||
      href.includes('adfs') ||
      href.includes('oauth') ||
      href.includes('openid') ||
      pathname.includes('login.action') ||
      pathname.includes('dologin.action') ||
      pathname.includes('/login') ||
      pathname.includes('websudo')
    ) {
      return true;
    }

    if (host !== this.expectedHost) {
      return true;
    }

    return false;
  }

  /**
   * Distingue erros reais de rede/conexão de redirecionamentos de autenticação ou timeouts.
   */
  isRealNetworkError(err) {
    const msg = String(err && err.message ? err.message : err || '');
    return (
      msg.includes('ERR_NAME_NOT_RESOLVED') ||
      msg.includes('ERR_CONNECTION_REFUSED') ||
      msg.includes('ERR_CONNECTION_RESET') ||
      msg.includes('ERR_CONNECTION_CLOSED') ||
      msg.includes('ERR_CONNECTION_TIMED_OUT') ||
      msg.includes('ERR_INTERNET_DISCONNECTED') ||
      msg.includes('ERR_NETWORK_CHANGED') ||
      msg.includes('ERR_ADDRESS_UNREACHABLE') ||
      msg.includes('ERR_PROXY_CONNECTION_FAILED') ||
      msg.includes('ERR_TUNNEL_CONNECTION_FAILED') ||
      msg.includes('ERR_SOCKS_CONNECTION_FAILED')
    );
  }

  isTimeoutError(err) {
    if (!err) return false;
    const name = String(err.name || '');
    const msg = String(err.message || err);
    return name === 'TimeoutError' || /timeout .* exceeded/i.test(msg);
  }

  sanitizeErrorMessage(err) {
    const raw = String(err && err.message ? err.message : err || 'Erro desconhecido');
    return raw.split('\n')[0].trim();
  }

  /**
   * Abre o persistent context do Google Chrome garantindo que nenhum contexto anterior
   * esteja utilizando o mesmo userDataDir simultaneamente.
   */
  async launchContext(headless) {
    await this.closeContextOnly();

    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      channel: 'chrome',
      headless,
      ignoreHTTPSErrors: true,
      viewport: headless ? { width: 1440, height: 900 } : null,
      args: [
        ...(headless ? [] : ['--start-maximized']),
        '--ignore-certificate-errors',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });

    const existingPages = this.context.pages();
    this.page = existingPages.length > 0 ? existingPages[0] : await this.context.newPage();
    return this.page;
  }

  /**
   * Valida se uma página específica está autenticada no Confluence e tem acesso válido à página raiz.
   */
  async validatePageSession(page, rootPageId, navigationResponse = null) {
    if (!page || page.isClosed()) {
      return { authenticated: false, reason: 'Página encerrada' };
    }

    const currentUrl = page.url() || '';

    if (!currentUrl || currentUrl === 'about:blank' || currentUrl.startsWith('chrome-error://')) {
      return {
        authenticated: false,
        networkError: true,
        reason: 'Página sem resposta válida do servidor'
      };
    }

    // 1. Verificar se a URL redirecionou para login.microsoftonline.com, SAML, login.action, dologin.action ou host externo
    if (this.isAuthUrlOrExternalHost(currentUrl)) {
      return {
        authenticated: false,
        reason: 'Redirecionado para provedor de autenticação ou fora do host do Confluence'
      };
    }

    // 2. Verificar status HTTP da resposta de navegação, se disponível
    if (navigationResponse) {
      const status = navigationResponse.status();
      if (status === 401 || status === 403) {
        return {
          authenticated: false,
          reason: `Resposta HTTP ${status}`
        };
      }
      if (status >= 500) {
        return {
          authenticated: false,
          networkError: true,
          reason: `Servidor Confluence retornou HTTP ${status}`
        };
      }
    }

    // 3. Inspecionar DOM e validar acesso autenticado à página raiz no contexto do navegador
    try {
      const evaluation = await page.evaluate(async ({ rootId, expectedHost }) => {
        const currentHost = (window.location.host || '').toLowerCase();
        const currentHref = (window.location.href || '').toLowerCase();
        const currentPath = (window.location.pathname || '').toLowerCase();

        if (currentHost !== expectedHost) {
          return { authenticated: false, reason: 'Host final diferente do Confluence' };
        }

        if (
          currentPath.includes('login.action') ||
          currentPath.includes('dologin.action') ||
          currentHref.includes('login.microsoftonline.com') ||
          currentHref.includes('saml')
        ) {
          return { authenticated: false, reason: 'URL de login detectada' };
        }

        // Verificar presença de formulário corporativo de autenticação
        const loginSelectors = [
          '#os_username',
          '#os_password',
          '#loginButton',
          'form[name="loginform"]',
          'form#loginForm',
          'form[action*="dologin"]',
          'form[action*="login.action"]',
          'form[action*="saml"]',
          'input[name="os_username"]',
          'input[name="os_password"]',
          'input[name="loginfmt"]',
          'input[name="passwd"]',
          '#i0116',
          '#i0118',
          'input[type="password"]'
        ];

        for (const selector of loginSelectors) {
          if (document.querySelector(selector)) {
            return { authenticated: false, reason: 'Formulário corporativo de autenticação presente' };
          }
        }

        // Verificar conteúdo esperado do Confluence
        const hasConfluenceContent = Boolean(
          document.querySelector(
            '#main-content, #content, #page-content, #title-text, meta[name="ajs-page-id"], meta[name="ajs-context-path"], #com-atlassian-confluence'
          )
        );

        if (!hasConfluenceContent) {
          return { authenticated: false, reason: 'Ausência do conteúdo esperado do Confluence' };
        }

        const remoteUserMeta = document.querySelector('meta[name="ajs-remote-user"]');
        const remoteUser = remoteUserMeta ? (remoteUserMeta.getAttribute('content') || '').trim() : null;
        const hasAnonymousLoginLink = Boolean(
          document.querySelector('#login-link, a[href*="login.action"], a[href*="dologin.action"]')
        );

        if (remoteUserMeta && !remoteUser && hasAnonymousLoginLink) {
          return { authenticated: false, reason: 'Sessão anônima sem usuário autenticado' };
        }

        // Confirmar acesso autenticado à página raiz via API REST do Confluence
        try {
          const apiUrl = `${window.location.protocol}//${window.location.host}/rest/api/content/${rootId}?expand=version`;
          const resp = await fetch(apiUrl, {
            credentials: 'include',
            headers: {
              Accept: 'application/json'
            }
          });

          const respUrl = (resp.url || '').toLowerCase();
          if (
            resp.status === 401 ||
            resp.status === 403 ||
            respUrl.includes('login.action') ||
            respUrl.includes('dologin.action') ||
            respUrl.includes('login.microsoftonline.com') ||
            respUrl.includes('saml')
          ) {
            return { authenticated: false, reason: `Acesso não autenticado na validação da página raiz (HTTP ${resp.status})` };
          }

          if (!resp.ok) {
            return {
              authenticated: false,
              networkError: resp.status >= 500,
              reason: `Falha ao validar página raiz (HTTP ${resp.status})`
            };
          }

          const contentType = (resp.headers.get('content-type') || '').toLowerCase();
          if (!contentType.includes('application/json')) {
            return { authenticated: false, reason: 'Resposta da API do Confluence não é JSON autenticado' };
          }

          const data = await resp.json();
          if (!data || String(data.id) !== String(rootId)) {
            return { authenticated: false, reason: 'Conteúdo da página raiz não confirmado' };
          }

          return { authenticated: true };
        } catch (fetchErr) {
          return {
            authenticated: false,
            networkError: true,
            reason: `Erro de rede ao validar API da página raiz: ${fetchErr && fetchErr.message ? fetchErr.message : String(fetchErr)}`
          };
        }
      }, { rootId: String(rootPageId), expectedHost: this.expectedHost });

      return evaluation;
    } catch (evalErr) {
      // Se o contexto de execução foi destruído durante redirecionamento para SSO/SAML
      await new Promise(resolve => setTimeout(resolve, 800));
      const updatedUrl = !page.isClosed() ? (page.url() || '') : '';
      if (this.isAuthUrlOrExternalHost(updatedUrl)) {
        return {
          authenticated: false,
          reason: 'Redirecionamento para autenticação em andamento'
        };
      }
      return {
        authenticated: false,
        reason: `Não foi possível validar o conteúdo da página: ${this.sanitizeErrorMessage(evalErr)}`
      };
    }
  }

  /**
   * Navega até a página raiz e classifica o estado da sessão tratando timeouts e erros de rede separadamente.
   */
  async navigateAndValidate(page, rootPageId, targetUrl) {
    let response = null;

    try {
      response = await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: INITIAL_GOTO_TIMEOUT_MS
      });
    } catch (gotoErr) {
      const currentUrl = !page.isClosed() ? (page.url() || '') : '';

      // Se a página já redirecionou para um provedor de autenticação (Microsoft, SAML, login.action, host externo)
      if (this.isAuthUrlOrExternalHost(currentUrl)) {
        return {
          authenticated: false,
          reason: 'Redirecionado para provedor de autenticação'
        };
      }

      // Tratamento específico para timeout de navegação conforme regra obrigatória
      if (this.isTimeoutError(gotoErr)) {
        if (this.isOnConfluenceHost(currentUrl)) {
          return await this.validatePageSession(page, rootPageId, null);
        }
        throw new Error(
          `[ConfluenceSession] Etapa: navegação inicial. Falha de rede: tempo limite excedido sem resposta do Confluence ao acessar ${targetUrl}.`
        );
      }

      // Erros reais de rede/conexão não devem ser classificados como sessão expirada
      if (this.isRealNetworkError(gotoErr) || !currentUrl || currentUrl === 'about:blank' || currentUrl.startsWith('chrome-error://')) {
        throw new Error(
          `[ConfluenceSession] Etapa: navegação inicial. Falha de conexão ao acessar o Confluence: ${this.sanitizeErrorMessage(gotoErr)}`
        );
      }

      throw new Error(
        `[ConfluenceSession] Etapa: navegação inicial. Erro de navegação ao acessar o Confluence: ${this.sanitizeErrorMessage(gotoErr)}`
      );
    }

    const validation = await this.validatePageSession(page, rootPageId, response);
    if (validation.networkError) {
      throw new Error(
        `[ConfluenceSession] Etapa: validação de sessão. Falha de conexão com o Confluence: ${validation.reason}`
      );
    }

    return validation;
  }

  /**
   * Monitora todas as abas/páginas do contexto visível até que o usuário conclua o login/SSO/MFA
   * ou até que a janela seja fechada / o prazo de 10 minutos expire.
   */
  async waitForManualAuthentication(rootPageId, targetUrl) {
    const startTime = Date.now();
    let contextClosedByUser = false;

    const onContextClose = () => {
      contextClosedByUser = true;
    };

    if (this.context) {
      this.context.once('close', onContextClose);
    }

    try {
      while (Date.now() - startTime < MANUAL_AUTH_TIMEOUT_MS) {
        if (this.isCancelled || contextClosedByUser || !this.context) {
          throw new Error(
            'Autenticação do Confluence não concluída. A sincronização foi cancelada sem alterar o inventário.'
          );
        }

        const openPages = this.context.pages().filter(p => !p.isClosed());
        if (openPages.length === 0) {
          throw new Error(
            'Autenticação do Confluence não concluída. A sincronização foi cancelada sem alterar o inventário.'
          );
        }

        for (const candidatePage of openPages) {
          if (candidatePage.isClosed()) continue;

          const url = candidatePage.url() || '';
          if (!this.isOnConfluenceHost(url) || this.isAuthUrlOrExternalHost(url)) {
            continue;
          }

          // A página está no host confluence.bradesco.com.br:8443 e fora de login.action/dologin.action
          const check = await this.validatePageSession(candidatePage, rootPageId, null);
          if (check.authenticated) {
            // Garantir que a página raiz em si está acessível nessa sessão autenticada
            if (!url.includes(`pageId=${rootPageId}`)) {
              try {
                const rootResp = await candidatePage.goto(targetUrl, {
                  waitUntil: 'domcontentloaded',
                  timeout: 30000
                });
                const rootCheck = await this.validatePageSession(candidatePage, rootPageId, rootResp);
                if (!rootCheck.authenticated) {
                  continue;
                }
              } catch (_) {
                continue;
              }
            }

            // Pequena pausa para garantir gravação de cookies de sessão no perfil persistente antes de fechar
            await new Promise(resolve => setTimeout(resolve, 1000));
            return true;
          }
        }

        await new Promise(resolve => setTimeout(resolve, AUTH_POLL_INTERVAL_MS));
      }

      throw new Error(
        'Autenticação do Confluence não concluída. A sincronização foi cancelada sem alterar o inventário.'
      );
    } finally {
      if (this.context) {
        this.context.removeListener('close', onContextClose);
      }
    }
  }

  /**
   * Fluxo principal de gerenciamento automático de sessão:
   * 1. Valida em headless: true;
   * 2. Se válida, retorna a página autenticada em segundo plano;
   * 3. Se expirada, fecha o headless, abre Chrome visível (headless: false) para login manual SSO/MFA;
   * 4. Após autenticação, fecha o Chrome visível, reabre em headless: true, revalida e continua a sincronização.
   */
  async authenticate(rootPageId) {
    this.isCancelled = false;
    const targetUrl = `${this.baseUrl}/pages/viewpage.action?pageId=${rootPageId}`;

    console.log('[ConfluenceSession] Validando sessão salva...');
    this.notifyStatus('validating_session', 0, 'Validando sessão do Confluence...');

    // 1. Abrir persistent context em segundo plano (headless: true)
    const headlessPage = await this.launchContext(true);

    // 2 e 3. Navegar para a página raiz e validar se a sessão está realmente autenticada
    const initialValidation = await this.navigateAndValidate(headlessPage, rootPageId, targetUrl);

    // 4. Se a sessão estiver válida, manter contexto headless e continuar coleta normalmente
    if (initialValidation.authenticated) {
      console.log('[ConfluenceSession] Sessão válida. Executando em segundo plano.');
      this.notifyStatus('crawling', 3, 'Lendo árvore e mapas do Confluence...');
      this.page = headlessPage;
      return headlessPage;
    }

    // 5. Sessão expirada: fechar completamente o contexto headless antes de abrir o visível
    console.log('[ConfluenceSession] Sessão expirada. Abrindo Chrome para autenticação...');
    this.notifyStatus('waiting_auth', 1, 'Sessão expirada. Conclua a autenticação na janela do Chrome.');

    await this.closeContextOnly();

    if (this.isCancelled) {
      throw new Error(
        'Autenticação do Confluence não concluída. A sincronização foi cancelada sem alterar o inventário.'
      );
    }

    // Abrir novo persistent context visível (headless: false) no mesmo userDataDir
    const visiblePage = await this.launchContext(false);

    // Iniciar navegação até a página raiz sem abortar por timeout de 30s enquanto o usuário realiza SSO/MFA
    visiblePage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 0 }).catch(() => {
      // Erros de navegação intermediários durante redirecionamentos SSO/SAML ou fechamento manual são tratados pelo monitor
    });

    // 6. Aguardar automaticamente a conclusão da autenticação em qualquer página do contexto
    await this.waitForManualAuthentication(rootPageId, targetUrl);

    // 7. Autenticação concluída: fechar o contexto visível para persistir cookies e aguardar encerramento completo
    console.log('[ConfluenceSession] Autenticação concluída.');
    this.notifyStatus('auth_completed', 2, 'Autenticação concluída. Retomando a sincronização...');

    await this.closeContextOnly();

    if (this.isCancelled) {
      throw new Error(
        'Autenticação do Confluence não concluída. A sincronização foi cancelada sem alterar o inventário.'
      );
    }

    // Reabrir o mesmo persistent context com headless: true e validar novamente a sessão
    console.log('[ConfluenceSession] Retomando sincronização em segundo plano.');
    const resumedHeadlessPage = await this.launchContext(true);
    const resumedValidation = await this.navigateAndValidate(resumedHeadlessPage, rootPageId, targetUrl);

    if (!resumedValidation.authenticated) {
      await this.closeContextOnly();
      throw new Error(
        `[ConfluenceSession] Etapa: revalidação pós-login. A sessão permaneceu inválida após a autenticação (${resumedValidation.reason || 'acesso não confirmado'}). Sincronização interrompida.`
      );
    }

    this.notifyStatus('crawling', 3, 'Lendo árvore e mapas do Confluence...');
    this.page = resumedHeadlessPage;
    return resumedHeadlessPage;
  }

  getPage() {
    return this.page;
  }

  async closeContextOnly() {
    if (this.context) {
      const ctx = this.context;
      this.context = null;
      this.page = null;
      try {
        await Promise.race([
          ctx.close(),
          new Promise(resolve => setTimeout(resolve, 10000))
        ]);
      } catch (_) {
        // Ignorado se já encerrado
      }
      // Aguardar liberação completa do lock do userDataDir pelo processo do Chrome
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  async close() {
    this.isCancelled = true;
    await this.closeContextOnly();
  }
}
