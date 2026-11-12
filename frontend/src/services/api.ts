/**
 * Arquivo: api.ts
 * Propósito: Centralizar todas as requisições (chamadas de rede) que o Frontend faz para o Backend.
 * Ter isso separado torna o código dos componentes mais limpo e facilita a manutenção, 
 * caso a url da API ou a forma de buscar os dados mude no futuro.
 */

import { guarded, CircuitOpenError } from '../resilience/circuitBreaker';

/** fetch que troca o erro genérico de rede ("Failed to fetch") por uma mensagem clara. */
export async function safeFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    // Cancelamento pedido pela própria tela não é falha do servidor
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('O servidor do OMNI não respondeu. Confira se ele está rodando (npm run dev) e tente de novo.');
  }
}

/** Mensagem curta e legível para mostrar ao usuário a partir de qualquer erro. */
export function describeError(error: unknown): string {
  if (error instanceof CircuitOpenError) {
    return `O servidor falhou várias vezes seguidas. Nova tentativa liberada em ${Math.ceil(error.retryInMs / 1000)}s.`;
  }
  if (error instanceof SyntaxError) return 'O servidor devolveu uma resposta inválida.';
  if (error instanceof Error && error.message) return error.message.split('\n')[0].trim();
  return 'Erro desconhecido.';
}

/** Garante o formato { total, resultados: [] } antes de a tela usar os dados. */
function ensureSearchResponse(data: any, what: string) {
  if (!data || !Array.isArray(data.resultados)) {
    throw new Error(`O servidor devolveu ${what} num formato inesperado.`);
  }
  return { ...data, total: typeof data.total === 'number' ? data.total : data.resultados.length };
}

/**
 * Busca o inventário completo (todos os artefatos) do backend.
 * Chamado primariamente quando o usuário acessa a aba "Inventário".
 */
export async function fetchInventory() {
  return guarded('api:inventario', async () => {
    const res = await safeFetch("/api/inventario");
    if (!res.ok) throw new Error(`O servidor respondeu com erro ${res.status} ao carregar a base.`);
    return ensureSearchResponse(await res.json(), 'a base');
  });
}

/**
 * Realiza uma busca inteligente no backend com base no texto digitado pelo usuário.
 * O backend se encarregará de procurar artefatos que batem com os termos recebidos.
 * 
 * @param query - O texto que o usuário digitou no campo de busca.
 */
export async function searchContent(query: string) {
  // EncodeURIComponent é usado para garantir que espaços e caracteres especiais 
  // na busca não quebrem o formato da URL (ex: "mapa site" vira "mapa%20site").
  return guarded('api:busca', async () => {
    const res = await safeFetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`O servidor respondeu com erro ${res.status} na busca.`);
    return ensureSearchResponse(await res.json(), 'a busca');
  });
}

export async function fetchUsers() {
  const res = await fetch('/api/users');
  if (!res.ok) throw new Error("Falha ao carregar usuários");
  return res.json();
}

export async function createUser(user: any) {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Falha ao criar usuário");
  }
  return res.json();
}

export async function updateUser(id: string, user: any) {
  const res = await fetch(`/api/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Falha ao atualizar usuário");
  }
  return res.json();
}

export async function deleteUser(id: string) {
  const res = await fetch(`/api/users/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error("Falha ao deletar usuário");
  return res.json();
}
