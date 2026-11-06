// frontend/src/workers/artifactSearch.worker.ts
// Native Vite Web Worker for indexing and querying artifacts

import {
  artifactSearchEngine,
  WorkerArtifactItem,
  IndexedSnippet,
  IndexedScreen,
  IndexedArtifact,
  ContentSearchResult,
  ParameterCriterion,
  ParameterSearchResult,
  ParameterMatchQuality,
  ParameterOccurrence,
  ParameterArtifactGroup,
  AdvancedParameterSearchResponse,
} from '../services/artifactSearchEngine';

export type {
  WorkerArtifactItem,
  IndexedSnippet,
  IndexedScreen,
  IndexedArtifact,
  ContentSearchResult,
  ParameterCriterion,
  ParameterSearchResult,
  ParameterMatchQuality,
  ParameterOccurrence,
  ParameterArtifactGroup,
  AdvancedParameterSearchResponse,
};

self.addEventListener('message', (event: MessageEvent) => {
  const { type, queryId, payload } = event.data || {};

  try {
    if (type === 'INIT_INDEX') {
      artifactSearchEngine.buildIndex(payload?.artifacts || []);
      self.postMessage({ type: 'INDEX_READY', ready: true });
    } else if (type === 'SEARCH_CONTENT') {
      const startTime = Date.now();
      const results = artifactSearchEngine.searchContent(payload?.query || '', payload?.limit || 50);
      self.postMessage({
        type: 'SEARCH_CONTENT_RESULT',
        queryId,
        results,
        total: results.length,
        durationMs: Date.now() - startTime,
      });
    } else if (type === 'SEARCH_CODE_AND_PARAMETERS') {
      const response = artifactSearchEngine.searchCodeAndParameters(payload?.rawQuery || '', payload?.options);
      self.postMessage({
        type: 'SEARCH_CODE_AND_PARAMETERS_RESULT',
        queryId,
        response,
      });
    } else if (type === 'SEARCH_PARAMETERS') {
      const startTime = Date.now();
      const results = artifactSearchEngine.searchParameters(
        payload?.criteria || [],
        payload?.combination || 'AND',
        payload?.scope || 'SNIPPET',
        payload?.limit || 50
      );
      self.postMessage({
        type: 'SEARCH_PARAMETERS_RESULT',
        queryId,
        results,
        total: results.length,
        durationMs: Date.now() - startTime,
      });
    } else if (type === 'GET_PARAMETER_SUGGESTIONS') {
      const suggestions = artifactSearchEngine.getSuggestions(payload?.field || 'nome', payload?.input || '', payload?.limit || 10);
      self.postMessage({
        type: 'PARAMETER_SUGGESTIONS_RESULT',
        queryId,
        suggestions,
      });
    }
  } catch (err: any) {
    console.error('[Worker] Error processing message:', err);
    self.postMessage({
      type: 'WORKER_ERROR',
      queryId,
      error: err?.message || 'Internal worker error',
    });
  }
});
