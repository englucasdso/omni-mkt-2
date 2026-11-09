import { Artifact } from '../../types';

/**
 * artifactSelectors.ts
 *
 * Fonte única de verdade para seleção e classificação de tipos de artefatos no frontend.
 * Conforme a governança do Hub de Artefatos:
 * - Somente artifact_type === 'MAPA' é considerado mapa de mensuração.
 * - Somente artifact_type === 'DOCUMENTACAO' é considerado documentação técnica.
 * - Nós (NO) e raízes (RAIZ) são artefatos estruturais de navegação, nunca mapas.
 * - NAO_CLASSIFICADO nunca entra silenciosamente em mapas ou documentações.
 * - O frontend nunca reclassifica artefatos por heurística local (profundidade, presença de telas, etc).
 */

export function isMap(artifact?: Artifact | null): boolean {
  return artifact?.artifact_type === 'MAPA';
}

export function isDocumentation(artifact?: Artifact | null): boolean {
  return artifact?.artifact_type === 'DOCUMENTACAO';
}

export function isNode(artifact?: Artifact | null): boolean {
  return artifact?.artifact_type === 'NO';
}

export function isRoot(artifact?: Artifact | null): boolean {
  return artifact?.artifact_type === 'RAIZ';
}

export function isUnclassified(artifact?: Artifact | null): boolean {
  if (!artifact) return false;
  return artifact.artifact_type === 'NAO_CLASSIFICADO' || !artifact.artifact_type;
}

export function isStructural(artifact?: Artifact | null): boolean {
  return isNode(artifact) || isRoot(artifact);
}

export function isCataloged(artifact?: Artifact | null): boolean {
  return isMap(artifact) || isDocumentation(artifact);
}

/**
 * Retorna exclusivamente os mapas de mensuração.
 */
export function getMaps(artifacts: Artifact[] = []): Artifact[] {
  return artifacts.filter(isMap);
}

/**
 * Retorna exclusivamente as documentações.
 */
export function getDocuments(artifacts: Artifact[] = []): Artifact[] {
  return artifacts.filter(isDocumentation);
}

/**
 * Retorna os artefatos catalogados (Mapas + Documentações).
 * Nós, raiz e não-classificados são excluídos desta lista.
 */
export function getCatalogedArtifacts(artifacts: Artifact[] = []): Artifact[] {
  return artifacts.filter(isCataloged);
}

/**
 * Retorna os artefatos estruturais (Nós + Raiz).
 */
export function getStructuralArtifacts(artifacts: Artifact[] = []): Artifact[] {
  return artifacts.filter(isStructural);
}

/**
 * Deduplica uma lista de artefatos garantindo unicidade estrita por ID.
 * Preserva a primeira ocorrência encontrada.
 */
export function deduplicateArtifactsById(artifacts: Artifact[] = []): Artifact[] {
  const seen = new Set<string>();
  const result: Artifact[] = [];
  for (const item of artifacts) {
    if (!item) continue;
    const idStr = String(item.id);
    if (!seen.has(idStr)) {
      seen.add(idStr);
      result.push(item);
    }
  }
  return result;
}
