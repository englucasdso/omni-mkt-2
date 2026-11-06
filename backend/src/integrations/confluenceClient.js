import { ConfluenceOrchestrator } from './confluence/confluenceOrchestrator.js';
import { getSyncSessionStatus, setSyncSessionStatus } from './confluence/confluenceSession.js';

let orchestratorInstance = null;

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

async function runCollection(rootPageId, maxRows) {
  if (orchestratorInstance && orchestratorInstance.isCollecting) {
    throw new Error('A sincronização já está em andamento. Aguarde...');
  }

  orchestratorInstance = new ConfluenceOrchestrator();
  try {
    const result = await orchestratorInstance.run(rootPageId, maxRows);
    setSyncSessionStatus({
      active: false,
      phase: 'completed',
      step: 4,
      message: 'Sincronização concluída.',
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
    isCollecting: Boolean(orchestratorInstance && orchestratorInstance.isCollecting)
  };
}

export {
  runCollection,
  abortCollection,
  getSyncStatus
};
