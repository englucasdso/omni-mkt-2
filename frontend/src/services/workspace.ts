/**
 * Espaço ativo do OMNI (Salla de Performance, BE...).
 * Cada espaço tem o seu inventário; todas as chamadas de dados levam o espaço junto.
 * A lista oficial vem do servidor (/api/workspaces); aqui fica só a escolha da pessoa.
 */

export interface Workspace {
  id: string;
  name: string;
  shortName: string;
  rootId: string;
}

const STORAGE_KEY = 'omni_workspace';
export const DEFAULT_WORKSPACE_ID = 'salla';

/** Usado enquanto a lista do servidor não chega (e se ele estiver fora do ar). */
export const FALLBACK_WORKSPACES: Workspace[] = [
  { id: 'salla', name: 'Salla de Performance', shortName: 'SP', rootId: '1542391004' },
  { id: 'be', name: 'BE', shortName: 'BE', rootId: '2403672447' },
];

export function getActiveWorkspaceId(): string {
  try {
    const saved = (localStorage.getItem(STORAGE_KEY) || '').trim();
    // Escolha antiga de um espaço que não existe mais volta para o padrão
    return FALLBACK_WORKSPACES.some((ws) => ws.id === saved) ? saved : DEFAULT_WORKSPACE_ID;
  } catch {
    return DEFAULT_WORKSPACE_ID;
  }
}

export function setActiveWorkspaceId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Sem armazenamento no navegador: a escolha vale só até recarregar
  }
}

/** Chave da "última sincronização" de cada espaço. A Salla mantém a chave antiga. */
export function lastSyncKey(workspaceId: string = getActiveWorkspaceId()) {
  return workspaceId === DEFAULT_WORKSPACE_ID ? 'last_sync' : `last_sync:${workspaceId}`;
}

export function readLastSync(workspaceId?: string): string | null {
  try {
    return localStorage.getItem(lastSyncKey(workspaceId));
  } catch {
    return null;
  }
}

export function writeLastSync(value: string, workspaceId?: string) {
  try {
    localStorage.setItem(lastSyncKey(workspaceId), value);
  } catch {
    // ignora: só deixa de lembrar a data
  }
}
