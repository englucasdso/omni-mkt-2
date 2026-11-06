export class ConfluenceTransport {
  constructor(page) {
    if (!page) {
      throw new Error('[ConfluenceTransport] Instância da página autenticada é obrigatória.');
    }
    this.page = page;
    this.isCancelled = false;
    this.metrics = {
      totalRequests: 0,
      total429s: 0,
      totalErrors: 0
    };
  }

  cancel() {
    this.isCancelled = true;
  }

  async checkRoot(rootPageId) {
    const endpoint = `/rest/api/content/${rootPageId}/child/page?limit=10&start=0&expand=version,history.lastUpdated`;
    return await this.fetchApi(endpoint);
  }

  async fetchApi(endpoint, retries = 5, backoff = 1000) {
    if (this.isCancelled) {
      throw new Error('Operação cancelada pelo usuário.');
    }
    if (!this.page || this.page.isClosed()) {
      throw new Error('Sessão do navegador foi encerrada.');
    }

    this.metrics.totalRequests++;

    const responseInfo = await this.page.evaluate(async ({ endpoint }) => {
      const base = window.location.protocol + '//' + window.location.host;
      const url = endpoint.startsWith('http')
        ? endpoint
        : (endpoint.startsWith('/') ? `${base}${endpoint}` : `${base}/${endpoint}`);

      try {
        const response = await fetch(url, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json, text/html'
          }
        });

        const status = response.status;
        const ok = response.ok;
        const redirectedToLogin = Boolean(
          response.url && (
            response.url.includes('login.action') ||
            response.url.includes('dologin.action') ||
            response.url.includes('/login')
          )
        );

        let retryAfter = null;
        try {
          const ra = response.headers.get('Retry-After');
          if (ra) retryAfter = parseInt(ra, 10);
        } catch (_) {}

        if (redirectedToLogin || status === 401) {
          return {
            status: 401,
            ok: false,
            redirectedToLogin: true,
            url
          };
        }

        if (status === 403) {
          return {
            status: 403,
            ok: false,
            url
          };
        }

        if (status === 429) {
          return {
            status: 429,
            ok: false,
            retryAfter,
            url
          };
        }

        if (!ok) {
          return {
            status,
            ok: false,
            url
          };
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          return {
            status,
            ok: true,
            isJson: true,
            data,
            url
          };
        } else {
          const text = await response.text();
          return {
            status,
            ok: true,
            isJson: false,
            data: text,
            url
          };
        }
      } catch (err) {
        return {
          status: 0,
          ok: false,
          networkError: true,
          errorMessage: err && err.message ? err.message : String(err),
          url
        };
      }
    }, { endpoint });

    if (this.isCancelled) {
      throw new Error('Operação cancelada pelo usuário.');
    }

    // 401 ou redirecionamento para login: informar sessão expirada
    if (responseInfo.redirectedToLogin || responseInfo.status === 401) {
      throw new Error(`[BrowserTransport] Sessão expirada ou redirecionamento para login ao acessar ${endpoint}`);
    }

    // 403: interromper e informar acesso negado
    if (responseInfo.status === 403) {
      throw new Error(`[BrowserTransport] Acesso negado (HTTP 403) ao acessar ${endpoint}`);
    }

    // 429: aplicar espera controlada com limite de tentativas
    if (responseInfo.status === 429) {
      this.metrics.total429s++;
      if (retries > 0 && !this.isCancelled) {
        let waitTime = backoff;
        if (responseInfo.retryAfter && !isNaN(responseInfo.retryAfter)) {
          waitTime = responseInfo.retryAfter * 1000;
        }
        waitTime = Math.min(waitTime, 30000);
        console.log(`[BrowserTransport] HTTP 429 no navegador para ${endpoint}. Aguardando ${waitTime}ms... (${retries} tentativas restantes)`);
        await new Promise(r => setTimeout(r, waitTime));
        return this.fetchApi(endpoint, retries - 1, backoff * 2);
      } else {
        throw new Error(`[BrowserTransport] Excedido o limite de tentativas (HTTP 429) para ${endpoint}`);
      }
    }

    // Erro de rede dentro do browser: apresentar URL, status e etapa, sem informações sensíveis
    if (responseInfo.networkError) {
      this.metrics.totalErrors++;
      console.warn(`[BrowserTransport] Erro de rede no navegador. URL: ${responseInfo.url}, Status: 0, Etapa: requisição browser. Detalhe: ${responseInfo.errorMessage}`);
      if (retries > 0 && !this.isCancelled) {
        console.log(`[BrowserTransport] Tentando novamente em ${backoff}ms... (${retries} tentativas restantes)`);
        await new Promise(r => setTimeout(r, backoff));
        return this.fetchApi(endpoint, retries - 1, backoff * 2);
      }
      throw new Error(`[BrowserTransport] Erro de rede no browser: URL ${responseInfo.url}, Status: 0, Etapa: consulta`);
    }

    // Outros erros HTTP (ex: 500, 502)
    if (!responseInfo.ok) {
      this.metrics.totalErrors++;
      if (retries > 0 && responseInfo.status >= 500 && !this.isCancelled) {
        console.log(`[BrowserTransport] HTTP ${responseInfo.status} no navegador. Tentando novamente em ${backoff}ms... (${retries} tentativas restantes)`);
        await new Promise(r => setTimeout(r, backoff));
        return this.fetchApi(endpoint, retries - 1, backoff * 2);
      }
      throw new Error(`[BrowserTransport] HTTP ${responseInfo.status} ao acessar ${endpoint}`);
    }

    return responseInfo.data;
  }
}
