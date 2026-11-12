import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { getBreaker } from './circuitBreaker';

interface ErrorBoundaryProps {
  /** Nome da área, usado na mensagem e no disjuntor (ex.: "Insights") */
  area: string;
  children: React.ReactNode;
  /** Quando muda (ex.: troca de aba), o erro é esquecido e a área tenta de novo */
  resetKey?: unknown;
  /** 'page' ocupa a área de conteúdo; 'inline' é um aviso compacto; 'modal' oferece fechar */
  variant?: 'page' | 'inline' | 'modal';
  /** Ação extra no aviso (ex.: fechar o modal ou voltar para a busca) */
  onDismiss?: () => void;
  dismissLabel?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
  retryInMs: number;
}

/**
 * Contenção de erros por área (graceful degradation).
 * Se uma área quebrar, só ela mostra o aviso; o resto do OMNI continua funcionando.
 * Um disjuntor por área impede tentativas em sequência quando o erro se repete.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, retryInMs: 0 };
  private timer: number | null = null;

  private get breaker() {
    return getBreaker(`tela:${this.props.area}`);
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.breaker.recordFailure();
    console.error(`[OMNI] Erro em "${this.props.area}":`, error, info?.componentStack);
    this.tick();
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  componentWillUnmount() {
    if (this.timer) window.clearInterval(this.timer);
  }

  private tick() {
    if (this.timer) window.clearInterval(this.timer);
    const update = () => {
      const ms = this.breaker.retryInMs();
      this.setState({ retryInMs: ms });
      if (ms <= 0 && this.timer) {
        window.clearInterval(this.timer);
        this.timer = null;
      }
    };
    update();
    if (this.breaker.retryInMs() > 0) this.timer = window.setInterval(update, 1000);
  }

  private reset = () => {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    this.setState({ error: null, retryInMs: 0 });
  };

  private retry = () => {
    if (!this.breaker.canAttempt()) {
      this.tick();
      return;
    }
    this.reset();
  };

  render() {
    const { error, retryInMs } = this.state;
    if (!error) return this.props.children;

    const { area, variant = 'page', onDismiss, dismissLabel } = this.props;
    const blocked = retryInMs > 0;
    const seconds = Math.ceil(retryInMs / 1000);

    const box = (
      <div
        role="alert"
        className={
          variant === 'inline'
            ? 'flex items-start gap-3 rounded-xl border border-omni-line bg-white p-3'
            : `flex flex-col items-center justify-center text-center gap-3 rounded-2xl border border-omni-line bg-white px-6 ${variant === 'modal' ? 'py-8 shadow-xl' : 'py-12 my-6'}`
        }
      >
        <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 text-gray-500 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className={variant === 'inline' ? 'min-w-0 flex-1' : 'max-w-md'}>
          <p className="text-sm font-semibold text-omni-ink">Não foi possível exibir {area}.</p>
          <p className="text-xs text-omni-ink-secondary mt-1 leading-relaxed">
            {variant === 'modal'
              ? 'Feche e tente abrir de novo. O resto do OMNI continua funcionando.'
              : 'O resto do OMNI continua funcionando. Use o menu para ir a outra tela ou tente de novo.'}
          </p>
          {blocked && (
            <p className="text-xs text-omni-muted mt-1 tabular-nums">
              O erro se repetiu várias vezes. Nova tentativa liberada em {seconds}s.
            </p>
          )}
          <details className="mt-2 text-left">
            <summary className="text-[11px] text-omni-muted cursor-pointer select-none">Detalhe técnico</summary>
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[11px] text-omni-ink-secondary bg-omni-mist rounded-lg p-2">
              {error.message || String(error)}
            </pre>
          </details>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={this.retry}
            disabled={blocked}
            className="h-8 px-3 rounded-lg border border-omni-line bg-white text-xs font-semibold text-omni-ink inline-flex items-center gap-1.5 hover:border-omni-bordo/30 hover:text-omni-bordo disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {blocked ? `Tentar de novo em ${seconds}s` : 'Tentar de novo'}
          </button>
          {onDismiss && (
            <button
              type="button"
              onClick={() => {
                this.reset();
                onDismiss();
              }}
              className="h-8 px-3 rounded-lg text-xs font-semibold text-omni-ink-secondary hover:text-omni-bordo cursor-pointer"
            >
              {dismissLabel || 'Fechar'}
            </button>
          )}
        </div>
      </div>
    );

    if (variant === 'modal') {
      return (
        <div className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center p-6">
          <div className="w-full max-w-md">{box}</div>
        </div>
      );
    }
    return box;
  }
}

/** Contenção da aplicação inteira: último recurso, com recarregar a página. */
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[OMNI] Erro geral:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="min-h-screen flex items-center justify-center bg-omni-mist p-6">
        <div className="max-w-md w-full rounded-2xl border border-omni-line bg-white p-8 text-center space-y-3">
          <p className="text-base font-semibold text-omni-ink">O OMNI encontrou um erro e precisa ser recarregado.</p>
          <p className="text-xs text-omni-ink-secondary leading-relaxed">
            Nenhum dado foi perdido: a base fica no servidor. Se o erro voltar, envie o detalhe abaixo para o responsável.
          </p>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-left text-[11px] text-omni-ink-secondary bg-omni-mist rounded-lg p-2">
            {this.state.error.message || String(this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-9 px-4 rounded-lg bg-omni-bordo text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Recarregar o OMNI
          </button>
        </div>
      </div>
    );
  }
}
