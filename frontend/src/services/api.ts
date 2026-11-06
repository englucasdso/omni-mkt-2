/**
 * Arquivo: api.ts
 * Propósito: Centralizar todas as requisições (chamadas de rede) que o Frontend faz para o Backend.
 * Ter isso separado torna o código dos componentes mais limpo e facilita a manutenção, 
 * caso a url da API ou a forma de buscar os dados mude no futuro.
 */

/**
 * Busca o inventário completo (todos os artefatos) do backend.
 * Chamado primariamente quando o usuário acessa a aba "Inventário".
 */
export async function fetchInventory() {
  const res = await fetch("/api/inventario");
  if (!res.ok) throw new Error("Falha ao carregar inventário");
  return res.json();
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
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("Falha na busca");
  return res.json();
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
