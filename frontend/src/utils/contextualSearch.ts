import { useState, useEffect } from 'react';
import { Artifact } from '../types';

/**
 * contextualSearch.ts
 * Busca contextual ultraleve e de alto desempenho.
 * Sem Levenshtein, sem matrizes de tokens, sem regex pesadas a cada tecla.
 * Índice textual simples gerado uma única vez por aba com useMemo.
 */

export const SEARCH_ALIASES: Record<string, string> = {
  docs: 'documento',
  doc: 'documento',
  documentacao: 'documento',
  mapas: 'mapa',
  metricas: 'mapa',
  mensuracao: 'mapa',
  screens: 'tela',
  screen: 'tela',
  parameters: 'parametro',
  parameter: 'parametro',
  owner: 'responsavel',
  product: 'produto',
  subproduct: 'subproduto',
  node: 'no',
};

/**
 * Normaliza texto para busca:
 * - Converte maiúsculas para minúsculas
 * - Remove acentos
 * - Converte separadores (_, -, /, etc.) em espaços
 * - Remove espaços duplicados
 * - Aplica substituição de aliases diretos
 */
export function normalizeSearchText(text: unknown): string {
  if (text == null) return '';
  const cleaned = String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_\-–—/\\.,;:?!()[\]{}'"`~@#$%^&*+=|<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const words = cleaned.split(' ');
  for (let i = 0; i < words.length; i++) {
    const alias = SEARCH_ALIASES[words[i]];
    if (alias) {
      words[i] = alias;
    }
  }
  return words.join(' ');
}

/**
 * Divide a consulta normalizada em palavras únicas não vazias
 */
export function getQueryTokens(query: string): string[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

/**
 * Verifica de forma ultrarrápida se todas as palavras da busca aparecem no texto indexado
 */
export function matchesAllTokens(searchableText: string, queryTokens: string[]): boolean {
  if (queryTokens.length === 0) return true;
  for (let i = 0; i < queryTokens.length; i++) {
    if (!searchableText.includes(queryTokens[i])) {
      return false;
    }
  }
  return true;
}

export interface IndexedArtifact {
  artifact: Artifact;
  normId: string;
  normTitle: string;
  searchableText: string;
}

/**
 * Monta o texto pesquisável de um artefato uma única vez para indexação
 */
export function buildArtifactSearchableText(artifact: Artifact): string {
  const parts: string[] = [];

  if (artifact.id) parts.push(artifact.id);
  if (artifact.titulo) parts.push(artifact.titulo);
  if (artifact.produto) parts.push(artifact.produto);
  if (artifact.produto_id) parts.push(artifact.produto_id);
  if (artifact.subproduto) parts.push(artifact.subproduto);
  if (artifact.subproduto_id) parts.push(artifact.subproduto_id);
  if (artifact.descendant_path_titles && artifact.descendant_path_titles.length > 0) {
    for (let i = 0; i < artifact.descendant_path_titles.length; i++) {
      parts.push(artifact.descendant_path_titles[i]);
    }
  }
  if (artifact.responsavel) parts.push(artifact.responsavel);
  if (artifact.artifact_type) parts.push(artifact.artifact_type);
  if (artifact.measurement_class) parts.push(artifact.measurement_class);

  if (artifact.parameter_summary && artifact.parameter_summary.length > 0) {
    for (let i = 0; i < artifact.parameter_summary.length; i++) {
      const p = artifact.parameter_summary[i];
      if (p.name) parts.push(p.name);
      if (p.distinct_values && p.distinct_values.length > 0) {
        for (let j = 0; j < p.distinct_values.length; j++) {
          parts.push(p.distinct_values[j]);
        }
      }
    }
  }

  if (artifact.screens && artifact.screens.length > 0) {
    for (let i = 0; i < artifact.screens.length; i++) {
      const s = artifact.screens[i];
      if (s.instruction) parts.push(s.instruction);
    }
  }

  return normalizeSearchText(parts.join(' '));
}

/**
 * Ordenação rápida quando há termo de busca:
 * 1. Prioriza correspondência exata de ID
 * 2. Depois título começando pela consulta
 * 3. Depois mantém a ordenação já existente na tela
 */
export function sortWithSearchPriority<T extends { normId?: string; normTitle?: string }>(
  items: T[],
  query: string
): T[] {
  const normQuery = normalizeSearchText(query);
  if (!normQuery) return items;

  const exactId: T[] = [];
  const titleStarts: T[] = [];
  const others: T[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.normId && item.normId === normQuery) {
      exactId.push(item);
    } else if (item.normTitle && item.normTitle.startsWith(normQuery)) {
      titleStarts.push(item);
    } else {
      others.push(item);
    }
  }

  return exactId.concat(titleStarts, others);
}

/**
 * Hook de debounce simples de 150ms.
 * Cancela o timer anterior a cada nova tecla digitada.
 * Ao limpar o campo (string vazia), restaura imediatamente com 0ms.
 */
export function useDebouncedSearch(value: string, delay = 150): string {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    // Ao limpar o campo, restaura imediatamente todos os registros
    if (!value || value.trim() === '') {
      setDebouncedValue('');
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
