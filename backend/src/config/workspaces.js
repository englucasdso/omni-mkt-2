/**
 * Espaços que o OMNI consegue ler. Cada um é um nó raiz do Confluence,
 * com o seu próprio inventário: os dados de um nunca se misturam com os do outro.
 *
 * O primeiro da lista é o padrão e continua usando o inventario.json de sempre,
 * para não perder a base que já existe.
 */
export const WORKSPACES = [
  {
    id: 'salla',
    name: 'Salla de Performance',
    shortName: 'SP',
    rootId: '1542391004',
    inventoryFile: 'inventario.json',
  },
  {
    id: 'be',
    name: 'BE',
    shortName: 'BE',
    rootId: '2403672447',
    inventoryFile: 'inventario-be.json',
  },
];

export const DEFAULT_WORKSPACE_ID = WORKSPACES[0].id;

/** Devolve o espaço pelo id. Sem id, devolve o padrão. Id desconhecido devolve null. */
export function resolveWorkspace(id) {
  if (id === undefined || id === null || String(id).trim() === '') {
    return WORKSPACES[0];
  }
  const key = String(id).trim().toLowerCase();
  return WORKSPACES.find((ws) => ws.id === key) || null;
}

/** Dados que podem ir para a tela (sem nome de arquivo). */
export function publicWorkspace(ws) {
  return { id: ws.id, name: ws.name, shortName: ws.shortName, rootId: ws.rootId };
}
