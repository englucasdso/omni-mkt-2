/**
 * Disjuntor (circuit breaker) do OMNI.
 *
 * Cada área ou chamada ao servidor tem um disjuntor com nome próprio:
 *   - FECHADO: funciona normalmente;
 *   - ABERTO: depois de N falhas dentro da janela, para de tentar por um tempo,
 *     para não travar a tela nem sobrecarregar o servidor;
 *   - MEIO-ABERTO: passado o tempo de espera, libera uma tentativa. Se der certo,
 *     fecha; se falhar, abre de novo.
 */

export type BreakerState = 'FECHADO' | 'ABERTO' | 'MEIO_ABERTO';

export interface BreakerOptions {
  /** Falhas dentro da janela para abrir o disjuntor */
  failureThreshold: number;
  /** Janela de contagem das falhas (ms) */
  windowMs: number;
  /** Tempo aberto antes de liberar uma nova tentativa (ms) */
  cooldownMs: number;
}

export const DEFAULT_BREAKER_OPTIONS: BreakerOptions = {
  failureThreshold: 3,
  windowMs: 60_000,
  cooldownMs: 30_000,
};

type Listener = () => void;

export class CircuitBreaker {
  readonly name: string;
  private readonly opts: BreakerOptions;
  private failures: number[] = [];
  private openedAt: number | null = null;
  private halfOpen = false;
  private listeners = new Set<Listener>();

  constructor(name: string, opts: Partial<BreakerOptions> = {}) {
    this.name = name;
    this.opts = { ...DEFAULT_BREAKER_OPTIONS, ...opts };
  }

  get state(): BreakerState {
    if (this.openedAt === null) return 'FECHADO';
    if (Date.now() - this.openedAt >= this.opts.cooldownMs) return 'MEIO_ABERTO';
    return 'ABERTO';
  }

  /** Milissegundos até a próxima tentativa ser liberada (0 se já pode tentar). */
  retryInMs(): number {
    if (this.openedAt === null) return 0;
    return Math.max(0, this.opts.cooldownMs - (Date.now() - this.openedAt));
  }

  canAttempt(): boolean {
    const s = this.state;
    if (s === 'FECHADO') return true;
    if (s === 'MEIO_ABERTO' && !this.halfOpen) {
      this.halfOpen = true;
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    const changed = this.openedAt !== null || this.failures.length > 0;
    this.failures = [];
    this.openedAt = null;
    this.halfOpen = false;
    if (changed) this.emit();
  }

  recordFailure(): void {
    const now = Date.now();
    if (this.halfOpen) {
      // A tentativa de teste falhou: abre de novo e reinicia a espera
      this.openedAt = now;
      this.halfOpen = false;
      this.emit();
      return;
    }
    this.failures = this.failures.filter((t) => now - t < this.opts.windowMs);
    this.failures.push(now);
    if (this.failures.length >= this.opts.failureThreshold && this.openedAt === null) {
      this.openedAt = now;
      console.warn(`[OMNI] Disjuntor "${this.name}" aberto após ${this.failures.length} falhas. Nova tentativa em ${Math.round(this.opts.cooldownMs / 1000)}s.`);
    }
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

const registry = new Map<string, CircuitBreaker>();

/** Disjuntor pelo nome (o mesmo nome devolve sempre o mesmo disjuntor). */
export function getBreaker(name: string, opts?: Partial<BreakerOptions>): CircuitBreaker {
  let b = registry.get(name);
  if (!b) {
    b = new CircuitBreaker(name, opts);
    registry.set(name, b);
  }
  return b;
}

export class CircuitOpenError extends Error {
  readonly retryInMs: number;
  readonly breaker: string;
  constructor(breaker: string, retryInMs: number) {
    super(`Muitas falhas seguidas. Nova tentativa em ${Math.ceil(retryInMs / 1000)}s.`);
    this.name = 'CircuitOpenError';
    this.breaker = breaker;
    this.retryInMs = retryInMs;
  }
}

/**
 * Executa uma chamada protegida pelo disjuntor. Com o disjuntor aberto, falha na hora
 * (sem ir ao servidor) com CircuitOpenError.
 */
export async function guarded<T>(name: string, fn: () => Promise<T>, opts?: Partial<BreakerOptions>): Promise<T> {
  const breaker = getBreaker(name, opts);
  if (!breaker.canAttempt()) {
    throw new CircuitOpenError(name, breaker.retryInMs());
  }
  try {
    const result = await fn();
    breaker.recordSuccess();
    return result;
  } catch (err) {
    // Cancelamento pedido pela tela não conta como falha
    if (!(err instanceof DOMException && err.name === 'AbortError')) breaker.recordFailure();
    throw err;
  }
}
