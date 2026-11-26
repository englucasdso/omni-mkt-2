import { ConfluenceOrchestrator } from './confluence/confluenceOrchestrator.js';
import { getSyncSessionStatus, setSyncSessionStatus } from './confluence/confluenceSession.js';
import { InventoryRepository } from '../repositories/inventoryRepository.js';
import { publicWorkspace } from '../config/workspaces.js';

let orchestratorInstance = null;
// Espaço da última sincronização iniciada (aparece no status para a tela)
let currentWorkspace = null;

async function abortCollection() {
  if (orchestratorInstance) {
    await orchestratorInstance.abort();
  }
  setSyncSessionStatus({
    active: false,
    phase: 'error',
    message: 'Autenticação do Confluence não concluída. A sincronização foi cancelada sem alterar o inventário.',
    error: 'Autenticação do Confluence não concluída. A sincronização foi cancelada sem alterar o inventário.'
  });
}

async function runCollection(rootPageId, maxRows, options = {}) {
  if (orchestratorInstance && orchestratorInstance.isCollecting) {
    throw new Error('A sincronização já está em andamento. Aguarde...');
  }

  // Cada espaço lê e grava só o próprio inventário
  const workspace = options && options.workspace ? options.workspace : null;
  currentWorkspace = workspace ? publicWorkspace(workspace) : null;
  orchestratorInstance = new ConfluenceOrchestrator(
    workspace ? { repository: new InventoryRepository(workspace.inventoryFile) } : {}
  );
  try {
    const result = await orchestratorInstance.run(rootPageId, maxRows, options);
    const syncStatus = getSyncSessionStatus();
    const isFullMode = Boolean(options && (options.mode === 'full' || options.forceRefresh === true));
    const completionMessage = (syncStatus && syncStatus.message) || (isFullMode
      ? `Sincronização completa concluída. ${result.length} páginas consultadas no Confluence.`
      : 'Sincronização concluída.');

    setSyncSessionStatus({
      active: false,
      phase: 'completed',
      step: 4,
      message: completionMessage,
      error: null
    });
    return result;
  } catch (err) {
    const msg = err && err.message ? err.message : 'Falha na sincronização.';
    setSyncSessionStatus({
      active: false,
      phase: 'error',
      message: msg,
      error: msg
    });
    throw err;
  }
}

function getSyncStatus() {
  const sessionStatus = getSyncSessionStatus();
  return {
    ...sessionStatus,
    isCollecting: Boolean(orchestratorInstance && orchestratorInstance.isCollecting),
    workspace: currentWorkspace
  };
}

export {
  runCollection,
  abortCollection,
  getSyncStatus
};
