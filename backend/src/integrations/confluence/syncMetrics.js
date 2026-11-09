export const ERROR_CATEGORIES = {
  STATUS_NAO_ENCONTRADO: 'STATUS_NAO_ENCONTRADO',
  LEITURA_DETALHADA: 'LEITURA_DETALHADA',
  TIMEOUT: 'TIMEOUT',
  HTTP_429: 'HTTP_429',
  HTTP_5XX: 'HTTP_5XX',
  PARSING: 'PARSING',
  AUTH: 'AUTH',
  OUTROS: 'OUTROS'
};

export function classifySyncErrorCategory(err) {
  const msg = String(err && err.message ? err.message : err || '').toLowerCase();
  const name = String(err && err.name ? err.name : '').toLowerCase();

  if (name.includes('timeout') || msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout')) {
    return ERROR_CATEGORIES.TIMEOUT;
  }
  if (msg.includes('429') || msg.includes('rate limit')) {
    return ERROR_CATEGORIES.HTTP_429;
  }
  if (/http 5\d\d|\b50[0234]\b/.test(msg)) {
    return ERROR_CATEGORIES.HTTP_5XX;
  }
  if (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('login.action') ||
    msg.includes('dologin.action') ||
    msg.includes('autenticação') ||
    msg.includes('sessão expirada')
  ) {
    return ERROR_CATEGORIES.AUTH;
  }
  if (
    name.includes('syntaxerror') ||
    name.includes('typeerror') ||
    name.includes('referenceerror') ||
    msg.includes('require is not defined') ||
    msg.includes('json') ||
    msg.includes('parse')
  ) {
    return ERROR_CATEGORIES.PARSING;
  }
  return ERROR_CATEGORIES.OUTROS;
}

export function isTransientError(err) {
  if (!err) return false;
  const name = String(err.name || '');
  const msg = String(err.message || err || '');

  // Nunca repetir erros determinísticos de código, referência ou parsing
  if (
    name === 'ReferenceError' ||
    name === 'TypeError' ||
    name === 'SyntaxError' ||
    msg.includes('require is not defined') ||
    msg.includes('Operação cancelada')
  ) {
    return false;
  }

  const lower = msg.toLowerCase();
  return (
    name === 'TimeoutError' ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('etimedout') ||
    lower.includes('http 429') ||
    /http 5\d\d|\b50[0234]\b/.test(lower) ||
    lower.includes('erro de rede') ||
    lower.includes('network') ||
    lower.includes('econnreset') ||
    lower.includes('econnrefused') ||
    lower.includes('fetch failed')
  );
}

export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${mm}m${ss}s`;
}

export class SyncMetricsAggregator {
  constructor(options = {}) {
    this.batchLogSize = options.batchLogSize || 25;
    this.debug = options.debug !== undefined ? Boolean(options.debug) : process.env.SYNC_DEBUG === '1';
    this.startTime = Date.now();
    this.total = 0;
    this.processed = 0;
    this.percentage = 0;
    this.succeeded = 0;
    this.reused = 0;
    this.failed = 0;
    this.warnings = 0;
    this.saved = false;

    this.countsByCategory = {
      [ERROR_CATEGORIES.STATUS_NAO_ENCONTRADO]: 0,
      [ERROR_CATEGORIES.LEITURA_DETALHADA]: 0,
      [ERROR_CATEGORIES.TIMEOUT]: 0,
      [ERROR_CATEGORIES.HTTP_429]: 0,
      [ERROR_CATEGORIES.HTTP_5XX]: 0,
      [ERROR_CATEGORIES.PARSING]: 0,
      [ERROR_CATEGORIES.AUTH]: 0,
      [ERROR_CATEGORIES.OUTROS]: 0
    };

    this.events = [];
  }

  setTotal(total) {
    this.total = Math.max(0, Number(total) || 0);
    if (this.processed > this.total) {
      this.processed = this.total;
    }
  }

  recordStatusMissing(details = {}) {
    this.countsByCategory[ERROR_CATEGORIES.STATUS_NAO_ENCONTRADO]++;
    this.warnings++;
    this.events.push({
      category: ERROR_CATEGORIES.STATUS_NAO_ENCONTRADO,
      ...details
    });
    if (this.debug) {
      const displayNum =
        details.displayScreenNumber ??
        (Number.isInteger(details.screenIndex) ? details.screenIndex + 1 : '');
      const candidatos = JSON.stringify(details.candidateValues || []);
      console.warn(
        `[STATUS] mapa=${details.mapId || ''} tela=${displayNum} candidatos=${candidatos}`
      );
    }
  }

  recordReadFailure(err, details = {}) {
    this.countsByCategory[ERROR_CATEGORIES.LEITURA_DETALHADA]++;
    const causeCategory = classifySyncErrorCategory(err);
    if (causeCategory !== ERROR_CATEGORIES.LEITURA_DETALHADA) {
      this.countsByCategory[causeCategory] = (this.countsByCategory[causeCategory] || 0) + 1;
    }

    const cleanMessage = String(err && err.message ? err.message : err || 'Erro de leitura').split('\n')[0].trim();
    this.events.push({
      category: ERROR_CATEGORIES.LEITURA_DETALHADA,
      causeCategory,
      message: cleanMessage,
      ...details
    });

    if (this.debug) {
      console.warn(
        `[ConfluenceOrchestrator] Falha ao ler página ${details.pageId || ''} (${details.title || ''}): ${cleanMessage}`
      );
    }

    return causeCategory;
  }

  recordWarning(category, details = {}) {
    const key = this.countsByCategory[category] !== undefined ? category : ERROR_CATEGORIES.OUTROS;
    this.countsByCategory[key]++;
    this.warnings++;
    this.events.push({ category: key, ...details });
  }

  /**
   * Registra a conclusão do processamento de uma página garantindo monotonicidade
   * e que processed nunca ultrapasse total.
   */
  recordPageProcessed(outcome = 'succeeded') {
    if (outcome === 'succeeded') {
      this.succeeded++;
    } else if (outcome === 'reused') {
      this.reused++;
    } else if (outcome === 'reused_on_failure') {
      this.reused++;
      this.failed++;
    } else if (outcome === 'failed') {
      this.failed++;
    }

    if (this.total > 0) {
      this.processed = Math.min(this.total, this.processed + 1);
      const computed = Math.min(99, Math.round((this.processed / this.total) * 100));
      this.percentage = Math.max(this.percentage, computed);
    } else {
      this.processed++;
    }

    if (
      this.total > 0 &&
      (this.processed % this.batchLogSize === 0 || this.processed === this.total)
    ) {
      console.log(
        `[SYNC] ${this.processed}/${this.total} (${this.percentage}%) | lidas ${this.succeeded} | cache ${this.reused} | falhas ${this.failed}`
      );
    }

    return this.getSnapshot();
  }

  markSaved() {
    this.saved = true;
    if (this.total > 0) {
      this.processed = this.total;
    }
    this.percentage = 100;
    return this.getSnapshot();
  }

  getSnapshot() {
    return {
      processed: this.processed,
      total: this.total,
      percentage: this.percentage,
      succeeded: this.succeeded,
      reused: this.reused,
      failed: this.failed,
      warnings: this.warnings,
      countsByCategory: { ...this.countsByCategory }
    };
  }

  formatAlertsSummary() {
    const parts = [];
    const c = this.countsByCategory;
    if (c[ERROR_CATEGORIES.STATUS_NAO_ENCONTRADO] > 0) {
      parts.push(`status não encontrado ${c[ERROR_CATEGORIES.STATUS_NAO_ENCONTRADO]}`);
    }
    if (c[ERROR_CATEGORIES.TIMEOUT] > 0) {
      parts.push(`timeout ${c[ERROR_CATEGORIES.TIMEOUT]}`);
    }
    if (c[ERROR_CATEGORIES.HTTP_429] > 0) {
      parts.push(`http 429 ${c[ERROR_CATEGORIES.HTTP_429]}`);
    }
    if (c[ERROR_CATEGORIES.HTTP_5XX] > 0) {
      parts.push(`http 5xx ${c[ERROR_CATEGORIES.HTTP_5XX]}`);
    }
    if (c[ERROR_CATEGORIES.PARSING] > 0) {
      parts.push(`parsing ${c[ERROR_CATEGORIES.PARSING]}`);
    }
    if (c[ERROR_CATEGORIES.AUTH] > 0) {
      parts.push(`auth ${c[ERROR_CATEGORIES.AUTH]}`);
    }
    if (c[ERROR_CATEGORIES.OUTROS] > 0) {
      parts.push(`outros ${c[ERROR_CATEGORIES.OUTROS]}`);
    }
    return parts.length > 0 ? parts.join(' | ') : 'nenhum';
  }

  logFinalSummary() {
    const duration = formatDuration(Date.now() - this.startTime);
    console.log(`[SYNC] Concluída em ${duration}`);
    console.log(
      `[SYNC] Total ${this.total} | lidas ${this.succeeded} | cache ${this.reused} | falhas ${this.failed}`
    );
    console.log(`[SYNC] Alertas: ${this.formatAlertsSummary()}`);
    console.log(`[SYNC] Inventário salvo com segurança`);
  }

  logFatalFailure(phaseLabel, err) {
    const cleanReason = String(err && err.message ? err.message : err || 'Erro desconhecido')
      .split('\n')[0]
      .trim();
    console.error(`[SYNC] FALHA na fase "${phaseLabel}": ${cleanReason}`);
    console.error(`[SYNC] Inventário anterior preservado`);
  }
}
