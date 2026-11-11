/**
 * Cliente único de IA do OMNI.
 *
 * Fala o formato "OpenAI Chat Completions", que hoje é aceito por quase todos os
 * provedores com camada gratuita (Groq, Gemini, OpenRouter, GitHub Models) e
 * também por modelos locais (Ollama). Trocar de provedor é só trocar o .env.
 *
 * Não usa SDK nem dependência externa: usa os módulos http/https do Node.
 * Isso permite atravessar o proxy corporativo (HTTPS_PROXY), coisa que o fetch
 * nativo do Node 18 não faz, e aceita o certificado raiz da empresa (AI_CA_CERT).
 *
 * Variáveis de ambiente:
 *   AI_PROVIDER   groq | gemini | openrouter | github | ollama | custom
 *   AI_API_KEY    chave do provedor (não é necessária para ollama)
 *   AI_MODEL      opcional; cada provedor tem um modelo padrão
 *   AI_BASE_URL   opcional; obrigatório quando AI_PROVIDER=custom
 *   AI_TIMEOUT_MS opcional; padrão 60000
 *
 * Compatibilidade: sem AI_PROVIDER, se GEMINI_API_KEY existir, usa Gemini
 * (com GEMINI_MODEL, se definido).
 */
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';
import type { Socket } from 'node:net';

/**
 * Certificado raiz da empresa (redes que inspecionam HTTPS).
 * NODE_EXTRA_CA_CERTS só funciona se definido antes do Node iniciar; AI_CA_CERT
 * pode ficar no .env e é lido aqui.
 */
let cachedCa: string[] | undefined | null = null;
function getExtraCa(): string[] | undefined {
  if (cachedCa !== null) return cachedCa;
  const file = (process.env.AI_CA_CERT || '').trim();
  cachedCa = undefined;
  if (file) {
    try {
      cachedCa = [...tls.rootCertificates, fs.readFileSync(file, 'utf8')];
    } catch (err: any) {
      console.error(`[IA] Não consegui ler AI_CA_CERT (${file}): ${err.message}`);
    }
  }
  return cachedCa;
}

export type AiProviderId = 'groq' | 'gemini' | 'openrouter' | 'github' | 'ollama' | 'custom';

interface ProviderPreset {
  label: string;
  baseUrl: string;
  defaultModel: string;
  requiresKey: boolean;
  keyHint: string;
}

export const AI_PROVIDERS: Record<AiProviderId, ProviderPreset> = {
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    requiresKey: true,
    keyHint: 'Crie a chave em console.groq.com → API Keys.',
  },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    requiresKey: true,
    keyHint: 'Crie a chave em aistudio.google.com → Get API key.',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    requiresKey: true,
    keyHint: 'Crie a chave em openrouter.ai → Keys.',
  },
  github: {
    label: 'GitHub Models',
    baseUrl: 'https://models.github.ai/inference',
    defaultModel: 'openai/gpt-4.1-mini',
    requiresKey: true,
    keyHint: 'Use um token do GitHub com permissão "models:read".',
  },
  ollama: {
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1',
    requiresKey: false,
    keyHint: 'Não precisa de chave; o Ollama precisa estar rodando na máquina.',
  },
  custom: {
    label: 'Endpoint compatível com OpenAI',
    baseUrl: '',
    defaultModel: '',
    requiresKey: false,
    keyHint: 'Defina AI_BASE_URL, AI_MODEL e, se exigido, AI_API_KEY.',
  },
};

export type AiErrorKind =
  | 'NAO_CONFIGURADO'
  | 'CHAVE_INVALIDA'
  | 'MODELO_INVALIDO'
  | 'LIMITE_ATINGIDO'
  | 'TEMPO_ESGOTADO'
  | 'REDE_BLOQUEADA'
  | 'CERTIFICADO'
  | 'RESPOSTA_INVALIDA'
  | 'ERRO_PROVEDOR';

const ERROR_STATUS: Record<AiErrorKind, number> = {
  NAO_CONFIGURADO: 503,
  CHAVE_INVALIDA: 502,
  MODELO_INVALIDO: 502,
  LIMITE_ATINGIDO: 429,
  TEMPO_ESGOTADO: 504,
  REDE_BLOQUEADA: 502,
  CERTIFICADO: 502,
  RESPOSTA_INVALIDA: 502,
  ERRO_PROVEDOR: 502,
};

export class AiError extends Error {
  kind: AiErrorKind;
  httpStatus: number;
  constructor(kind: AiErrorKind, message: string) {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
    this.httpStatus = ERROR_STATUS[kind];
  }
}

export interface AiConfig {
  provider: AiProviderId;
  providerLabel: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

function env(name: string): string {
  return (process.env[name] || '').trim();
}

/** Lê a configuração do .env. Retorna null quando não há IA configurada. */
export function readAiConfig(): AiConfig | null {
  let provider = env('AI_PROVIDER').toLowerCase() as AiProviderId;
  let apiKey = env('AI_API_KEY');
  let model = env('AI_MODEL');

  if (!provider) {
    if (env('GEMINI_API_KEY')) {
      provider = 'gemini';
      apiKey = apiKey || env('GEMINI_API_KEY');
      model = model || env('GEMINI_MODEL');
    } else {
      return null;
    }
  }

  const preset = AI_PROVIDERS[provider];
  if (!preset) {
    throw new AiError(
      'NAO_CONFIGURADO',
      `AI_PROVIDER="${provider}" não é reconhecido. Use: ${Object.keys(AI_PROVIDERS).join(', ')}.`
    );
  }

  if (provider === 'gemini' && !apiKey) apiKey = env('GEMINI_API_KEY');

  const baseUrl = (env('AI_BASE_URL') || preset.baseUrl).replace(/\/+$/, '');
  model = model || preset.defaultModel;
  const timeoutMs = Number(env('AI_TIMEOUT_MS')) > 0 ? Number(env('AI_TIMEOUT_MS')) : 60000;

  return { provider, providerLabel: preset.label, baseUrl, model, apiKey, timeoutMs };
}

/** Igual a readAiConfig, mas falha com mensagem clara quando falta algo. */
export function requireAiConfig(): AiConfig {
  const config = readAiConfig();
  if (!config) {
    throw new AiError(
      'NAO_CONFIGURADO',
      'A IA não está configurada. Defina AI_PROVIDER e AI_API_KEY no arquivo .env e reinicie o OMNI.'
    );
  }
  const preset = AI_PROVIDERS[config.provider];
  if (!config.baseUrl) {
    throw new AiError('NAO_CONFIGURADO', 'AI_BASE_URL não foi definida para o provedor custom.');
  }
  if (!config.model) {
    throw new AiError('NAO_CONFIGURADO', 'AI_MODEL não foi definido.');
  }
  if (preset.requiresKey && !config.apiKey) {
    throw new AiError(
      'NAO_CONFIGURADO',
      `Falta a chave do ${preset.label}. Preencha AI_API_KEY no .env. ${preset.keyHint}`
    );
  }
  return config;
}

// ---------------------------------------------------------------------------
// Transporte HTTP com suporte a proxy corporativo
// ---------------------------------------------------------------------------

function shouldBypassProxy(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
  const noProxy = (process.env.NO_PROXY || process.env.no_proxy || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const host = hostname.toLowerCase();
  return noProxy.some((rule) => {
    if (rule === '*') return true;
    const clean = rule.replace(/^\*?\./, '');
    return host === clean || host.endsWith(`.${clean}`);
  });
}

function getProxyUrl(target: URL): URL | null {
  if (shouldBypassProxy(target.hostname)) return null;
  const raw =
    target.protocol === 'https:'
      ? process.env.AI_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
      : process.env.AI_PROXY || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!raw) return null;
  try {
    return new URL(raw.includes('://') ? raw : `http://${raw}`);
  } catch {
    return null;
  }
}

function openTunnel(proxy: URL, host: string, port: number, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { Host: `${host}:${port}` };
    if (proxy.username) {
      const auth = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
      headers['Proxy-Authorization'] = `Basic ${Buffer.from(auth).toString('base64')}`;
    }
    const req = http.request({
      host: proxy.hostname,
      port: Number(proxy.port) || 80,
      method: 'CONNECT',
      path: `${host}:${port}`,
      headers,
      timeout: timeoutMs,
    });
    req.on('connect', (res, socket) => {
      if (res.statusCode === 200) {
        resolve(socket);
      } else {
        socket.destroy();
        reject(
          new AiError(
            'REDE_BLOQUEADA',
            `O proxy corporativo recusou a conexão com ${host} (HTTP ${res.statusCode}).`
          )
        );
      }
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new AiError('TEMPO_ESGOTADO', `O proxy não respondeu ao conectar em ${host}.`));
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

interface RawResponse {
  status: number;
  body: string;
}

async function postJson(
  urlString: string,
  headers: Record<string, string>,
  payload: unknown,
  timeoutMs: number
): Promise<RawResponse> {
  const url = new URL(urlString);
  const isHttps = url.protocol === 'https:';
  const port = Number(url.port) || (isHttps ? 443 : 80);
  const body = JSON.stringify(payload);
  const proxy = getProxyUrl(url);

  let tunnel: Socket | null = null;
  if (proxy && isHttps) {
    tunnel = await openTunnel(proxy, url.hostname, port, timeoutMs);
  }

  return new Promise<RawResponse>((resolve, reject) => {
    const options: https.RequestOptions = {
      method: 'POST',
      hostname: url.hostname,
      port,
      path: `${url.pathname}${url.search}`,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: timeoutMs,
    };
    const ca = getExtraCa();
    if (ca && isHttps) options.ca = ca;

    if (tunnel) {
      const socket = tunnel;
      options.agent = false;
      (options as any).createConnection = () => tls.connect({ socket, servername: url.hostname, ...(ca ? { ca } : {}) });
    } else if (proxy && !isHttps) {
      // HTTP simples via proxy: caminho absoluto para o proxy
      options.hostname = proxy.hostname;
      options.port = Number(proxy.port) || 80;
      options.path = url.toString();
    }

    const client = isHttps ? https : http;
    const req = client.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') })
      );
      res.on('error', reject);
    });

    const timer = setTimeout(() => {
      req.destroy(new AiError('TEMPO_ESGOTADO', `A IA não respondeu em ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);
    req.on('close', () => clearTimeout(timer));
    req.on('timeout', () => {
      req.destroy(new AiError('TEMPO_ESGOTADO', `A IA não respondeu em ${Math.round(timeoutMs / 1000)}s.`));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function translateNetworkError(err: any, config: AiConfig): AiError {
  if (err instanceof AiError) return err;
  const code = String(err?.code || '');
  const host = (() => {
    try {
      return new URL(config.baseUrl).hostname;
    } catch {
      return config.baseUrl;
    }
  })();

  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/i.test(code) || /certificate/i.test(err?.message || '')) {
    return new AiError(
      'CERTIFICADO',
      `A rede corporativa interceptou o certificado de ${host}. Exporte o certificado raiz da empresa (.pem), informe o caminho em AI_CA_CERT no .env e reinicie.`
    );
  }
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    return new AiError(
      'REDE_BLOQUEADA',
      `Não foi possível encontrar ${host}. A rede pode estar bloqueando esse endereço ou exige proxy (HTTPS_PROXY).`
    );
  }
  if (['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT'].includes(code)) {
    return new AiError(
      'REDE_BLOQUEADA',
      config.provider === 'ollama'
        ? 'O Ollama não está respondendo em localhost:11434. Abra o Ollama e tente de novo.'
        : `A conexão com ${host} foi bloqueada ou caiu (${code}). Verifique proxy e firewall.`
    );
  }
  return new AiError('ERRO_PROVEDOR', `Falha ao falar com ${config.providerLabel}: ${err?.message || 'erro desconhecido'}.`);
}

function translateHttpError(status: number, body: string, config: AiConfig): AiError {
  let detail = '';
  try {
    const parsed = JSON.parse(body);
    const e = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error;
    detail = String(e?.message || e || parsed?.message || '').slice(0, 200);
  } catch {
    detail = body.slice(0, 200);
  }
  const suffix = detail ? ` Detalhe: ${detail}` : '';

  if (status === 401 || status === 403) {
    return new AiError('CHAVE_INVALIDA', `${config.providerLabel} recusou a chave (HTTP ${status}). Confira AI_API_KEY.${suffix}`);
  }
  if (status === 404) {
    return new AiError('MODELO_INVALIDO', `O modelo "${config.model}" não existe ou não está disponível em ${config.providerLabel}. Ajuste AI_MODEL.${suffix}`);
  }
  if (status === 429) {
    return new AiError('LIMITE_ATINGIDO', `O limite gratuito do ${config.providerLabel} foi atingido. Espere um minuto ou troque de modelo.${suffix}`);
  }
  if (status === 407) {
    return new AiError('REDE_BLOQUEADA', `O proxy corporativo exige autenticação (HTTP 407).${suffix}`);
  }
  return new AiError('ERRO_PROVEDOR', `${config.providerLabel} respondeu com erro HTTP ${status}.${suffix}`);
}

// ---------------------------------------------------------------------------
// Chamada de chat e extração de JSON
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  tag?: string;
}

export interface ChatResult {
  text: string;
  model: string;
  provider: AiProviderId;
  durationMs: number;
}

export async function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
  const config = requireAiConfig();
  const tag = options.tag || 'AI';
  const headers: Record<string, string> = {};
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  if (config.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'http://localhost:3000';
    headers['X-Title'] = 'OMNI';
  }

  const payload: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: options.temperature ?? 0.1,
  };
  if (options.maxTokens) payload.max_tokens = options.maxTokens;
  if (options.json) payload.response_format = { type: 'json_object' };

  const url = `${config.baseUrl}/chat/completions`;
  const started = Date.now();
  console.log(`[${tag}] Chamando ${config.providerLabel} (${config.model})...`);

  let res: RawResponse;
  try {
    res = await postJson(url, headers, payload, config.timeoutMs);
    // Alguns modelos não aceitam response_format: tenta de novo sem ele
    if (res.status === 400 && options.json && /response_format|json/i.test(res.body)) {
      delete payload.response_format;
      res = await postJson(url, headers, payload, config.timeoutMs);
    }
  } catch (err) {
    const translated = translateNetworkError(err, config);
    console.error(`[${tag}] ${translated.kind}: ${translated.message}`);
    throw translated;
  }

  if (res.status < 200 || res.status >= 300) {
    const translated = translateHttpError(res.status, res.body, config);
    console.error(`[${tag}] ${translated.kind}: ${translated.message}`);
    throw translated;
  }

  let text = '';
  try {
    const parsed = JSON.parse(res.body);
    text = String(parsed?.choices?.[0]?.message?.content ?? '');
  } catch {
    throw new AiError('RESPOSTA_INVALIDA', `${config.providerLabel} devolveu uma resposta que não é JSON.`);
  }
  if (!text.trim()) {
    throw new AiError('RESPOSTA_INVALIDA', `${config.providerLabel} devolveu uma resposta vazia.`);
  }

  const durationMs = Date.now() - started;
  console.log(`[${tag}] Resposta recebida em ${durationMs}ms.`);
  return { text, model: config.model, provider: config.provider, durationMs };
}

/** Extrai o primeiro objeto JSON de um texto (tolera cercas ``` e texto em volta). */
export function parseJsonObject(text: string): any {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* cai no erro abaixo */
      }
    }
  }
  throw new AiError('RESPOSTA_INVALIDA', 'A IA respondeu fora do formato JSON esperado.');
}

export async function chatJson(messages: ChatMessage[], options: ChatOptions = {}): Promise<{ data: any; meta: ChatResult }> {
  const result = await chat(messages, { ...options, json: true });
  return { data: parseJsonObject(result.text), meta: result };
}

/** Estado público da configuração (sem expor a chave). */
export function describeAiConfig() {
  try {
    const config = readAiConfig();
    if (!config) {
      return { configured: false, message: 'IA não configurada. Defina AI_PROVIDER e AI_API_KEY no .env.' };
    }
    const preset = AI_PROVIDERS[config.provider];
    const missingKey = preset.requiresKey && !config.apiKey;
    let host = config.baseUrl;
    try {
      host = new URL(config.baseUrl).host;
    } catch {
      /* mantém */
    }
    return {
      configured: !missingKey,
      provider: config.provider,
      providerLabel: config.providerLabel,
      model: config.model,
      host,
      usesProxy: Boolean(getProxyUrl(new URL(config.baseUrl || 'https://x'))),
      message: missingKey ? `Falta AI_API_KEY. ${preset.keyHint}` : 'Configuração encontrada.',
    };
  } catch (err: any) {
    return { configured: false, message: err?.message || 'Configuração de IA inválida.' };
  }
}

/** Faz uma chamada mínima para provar que a IA responde desta máquina. */
export async function testAiConnection() {
  const started = Date.now();
  try {
    const { meta } = await chatJson(
      [
        { role: 'system', content: 'Responda somente com JSON.' },
        { role: 'user', content: 'Responda exatamente {"ok": true}' },
      ],
      { maxTokens: 20, tag: 'AITest' }
    );
    return { ok: true, provider: meta.provider, model: meta.model, durationMs: Date.now() - started };
  } catch (err: any) {
    return {
      ok: false,
      kind: err instanceof AiError ? err.kind : 'ERRO_PROVEDOR',
      message: err?.message || 'Falha desconhecida.',
      durationMs: Date.now() - started,
    };
  }
}

/** Converte qualquer erro em resposta HTTP padronizada. */
export function toAiErrorResponse(err: any): { status: number; body: { error: string; kind: AiErrorKind } } {
  if (err instanceof AiError) {
    return { status: err.httpStatus, body: { error: err.message, kind: err.kind } };
  }
  return { status: 502, body: { error: err?.message || 'Falha inesperada na IA.', kind: 'ERRO_PROVEDOR' } };
}
