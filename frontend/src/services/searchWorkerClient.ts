// frontend/src/services/searchWorkerClient.ts
// Robust search client that communicates with Web Worker when supported in the host environment,
// with transparent fallback to in-memory artifactSearchEngine in sandboxed/iframe contexts.

import { Artifact } from '../types';
import {
  artifactSearchEngine,
  ContentSearchResult,
  ParameterCriterion,
  ParameterSearchResult,
  AdvancedParameterSearchResponse,
} from './artifactSearchEngine';

export type {
  ContentSearchResult,
  ParameterCriterion,
  ParameterSearchResult,
  AdvancedParameterSearchResponse,
};

interface PendingRequest {
  resolve: (data: any) => void;
  reject: (err: any) => void;
  fallback: () => any;
  timer: any;
}

class SearchWorkerClient {
  private worker: Worker | null = null;
  private isIndexReady = false;
  private useWorker = false;
  private pendingCallbacks = new Map<number, PendingRequest>();
  private currentQueryId = 0;
  private initPromise: Promise<void> | null = null;
  private initResolve: (() => void) | null = null;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      this.useWorker = false;
      return;
    }

    try {
      this.worker = new Worker(
        new URL('../workers/artifactSearch.worker.ts', import.meta.url),
        { type: 'module' }
      );
      this.useWorker = true;

      this.worker.onmessage = (event: MessageEvent) => {
        const { type, queryId, results, total, durationMs, suggestions, response, error } = event.data || {};

        if (type === 'INDEX_READY') {
          this.isIndexReady = true;
          if (this.initResolve) {
            this.initResolve();
            this.initResolve = null;
          }
          return;
        }

        if (queryId !== undefined && this.pendingCallbacks.has(queryId)) {
          const req = this.pendingCallbacks.get(queryId);
          this.pendingCallbacks.delete(queryId);
          if (req) {
            clearTimeout(req.timer);
            if (error) {
              req.resolve(req.fallback());
            } else if (type === 'SEARCH_CODE_AND_PARAMETERS_RESULT') {
              req.resolve(response);
            } else if (type === 'PARAMETER_SUGGESTIONS_RESULT') {
              req.resolve(suggestions);
            } else {
              req.resolve({ results, total, durationMs });
            }
          }
        }
      };

      this.worker.onerror = () => {
        // In sandboxed environments or iframes where module workers are restricted by origin/CSP,
        // degrade smoothly to the synchronous in-memory search engine without unhandled console errors.
        this.useWorker = false;
        if (this.worker) {
          try {
            this.worker.terminate();
          } catch (_) {
            // ignore
          }
          this.worker = null;
        }

        if (this.initResolve) {
          this.initResolve();
          this.initResolve = null;
        }
        this.isIndexReady = true;

        for (const [, req] of this.pendingCallbacks.entries()) {
          clearTimeout(req.timer);
          try {
            req.resolve(req.fallback());
          } catch (e) {
            req.reject(e);
          }
        }
        this.pendingCallbacks.clear();
      };
    } catch (_) {
      this.useWorker = false;
      this.worker = null;
    }
  }

  public get ready(): boolean {
    return this.isIndexReady || artifactSearchEngine.ready;
  }

  public initIndex(artifacts: Artifact[]): Promise<void> {
    // Always index synchronously in the in-memory engine first
    artifactSearchEngine.buildIndex(artifacts);

    if (!this.useWorker || !this.worker) {
      this.isIndexReady = true;
      return Promise.resolve();
    }

    if (this.initPromise && !this.isIndexReady) {
      return this.initPromise;
    }

    this.isIndexReady = false;
    this.initPromise = new Promise<void>((resolve) => {
      this.initResolve = resolve;

      // Timeout safeguard: if worker doesn't acknowledge within 300ms, mark ready and proceed with local engine
      const timeoutTimer = setTimeout(() => {
        if (this.initResolve) {
          this.initResolve();
          this.initResolve = null;
          this.isIndexReady = true;
        }
      }, 300);

      try {
        this.worker?.postMessage({
          type: 'INIT_INDEX',
          payload: { artifacts },
        });
      } catch (_) {
        clearTimeout(timeoutTimer);
        this.useWorker = false;
        this.isIndexReady = true;
        resolve();
      }
    });

    return this.initPromise;
  }

  public searchContent(
    query: string,
    limit = 500
  ): Promise<{ results: ContentSearchResult[]; total: number; durationMs: number }> {
    const fallbackFn = () => {
      const start = Date.now();
      const results = artifactSearchEngine.searchContent(query, limit);
      return { results, total: results.length, durationMs: Date.now() - start };
    };

    if (!this.useWorker || !this.worker || !this.isIndexReady) {
      return Promise.resolve(fallbackFn());
    }

    const queryId = ++this.currentQueryId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCallbacks.delete(queryId);
        resolve(fallbackFn());
      }, 400);

      this.pendingCallbacks.set(queryId, {
        resolve,
        reject,
        fallback: fallbackFn,
        timer,
      });

      try {
        this.worker?.postMessage({
          type: 'SEARCH_CONTENT',
          queryId,
          payload: { query, limit },
        });
      } catch (_) {
        clearTimeout(timer);
        this.pendingCallbacks.delete(queryId);
        resolve(fallbackFn());
      }
    });
  }

  public searchCodeAndParameters(
    rawQuery: string,
    options?: {
      matchType?: 'auto' | 'literal' | 'normalized' | 'params';
      scope?: 'SNIPPET' | 'SCREEN';
      condition?: 'AND' | 'OR';
      limit?: number;
    }
  ): Promise<AdvancedParameterSearchResponse> {
    const fallbackFn = () => {
      return artifactSearchEngine.searchCodeAndParameters(rawQuery, options);
    };

    if (!this.useWorker || !this.worker || !this.isIndexReady) {
      return Promise.resolve(fallbackFn());
    }

    const queryId = ++this.currentQueryId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCallbacks.delete(queryId);
        resolve(fallbackFn());
      }, 400);

      this.pendingCallbacks.set(queryId, {
        resolve,
        reject,
        fallback: fallbackFn,
        timer,
      });

      try {
        this.worker?.postMessage({
          type: 'SEARCH_CODE_AND_PARAMETERS',
          queryId,
          payload: { rawQuery, options },
        });
      } catch (_) {
        clearTimeout(timer);
        this.pendingCallbacks.delete(queryId);
        resolve(fallbackFn());
      }
    });
  }

  public searchParameters(
    criteria: ParameterCriterion[],
    combination: 'AND' | 'OR' = 'AND',
    scope: 'SNIPPET' | 'SCREEN' = 'SNIPPET',
    limit = 500
  ): Promise<{ results: ParameterSearchResult[]; total: number; durationMs: number }> {
    const fallbackFn = () => {
      const start = Date.now();
      const results = artifactSearchEngine.searchParameters(criteria, combination, scope, limit);
      return { results, total: results.length, durationMs: Date.now() - start };
    };

    if (!this.useWorker || !this.worker || !this.isIndexReady) {
      return Promise.resolve(fallbackFn());
    }

    const queryId = ++this.currentQueryId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCallbacks.delete(queryId);
        resolve(fallbackFn());
      }, 400);

      this.pendingCallbacks.set(queryId, {
        resolve,
        reject,
        fallback: fallbackFn,
        timer,
      });

      try {
        this.worker?.postMessage({
          type: 'SEARCH_PARAMETERS',
          queryId,
          payload: { criteria, combination, scope, limit },
        });
      } catch (_) {
        clearTimeout(timer);
        this.pendingCallbacks.delete(queryId);
        resolve(fallbackFn());
      }
    });
  }

  public getParameterSuggestions(field: string, input: string, limit = 10): Promise<string[]> {
    const fallbackFn = () => {
      return artifactSearchEngine.getSuggestions(field, input, limit);
    };

    if (!this.useWorker || !this.worker || !this.isIndexReady) {
      return Promise.resolve(fallbackFn());
    }

    const queryId = ++this.currentQueryId;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingCallbacks.delete(queryId);
        resolve(fallbackFn());
      }, 400);

      this.pendingCallbacks.set(queryId, {
        resolve,
        reject: () => resolve([]),
        fallback: fallbackFn,
        timer,
      });

      try {
        this.worker?.postMessage({
          type: 'GET_PARAMETER_SUGGESTIONS',
          queryId,
          payload: { field, input, limit },
        });
      } catch (_) {
        clearTimeout(timer);
        this.pendingCallbacks.delete(queryId);
        resolve(fallbackFn());
      }
    });
  }
}

export const searchWorkerClient = new SearchWorkerClient();
