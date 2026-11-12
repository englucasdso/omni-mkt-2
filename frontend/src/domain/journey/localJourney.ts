/**
 * Organização local de jornadas (sem IA).
 *
 * Lê o texto de cada tela (nome, instrução, eventos e valores de parâmetros) e
 * encaixa a tela em uma etapa de negócio. Telas de erro viram ramificações da
 * tela anterior, em vez de entrar na fila principal.
 *
 * O formato de saída é o mesmo da análise por IA (nodes, edges, stages), para
 * que a tela de Jornadas desenhe as duas do mesmo jeito.
 */

export interface JourneyStageDef {
  key: string;
  name: string;
  kind: 'main' | 'exception';
  patterns: RegExp;
}

/** Etapas na ordem em que o usuário costuma passar por elas. */
export const JOURNEY_STAGES: JourneyStageDef[] = [
  {
    key: 'entrada',
    name: 'Entrada',
    kind: 'main',
    patterns: /\b(home|inicio|inicial|landing|vitrine|menu|acesso|abertura|splash|onboarding|apresentacao|boas vindas|entrada|banner|card de oferta|atalho)\b/,
  },
  {
    key: 'identificacao',
    name: 'Identificação',
    kind: 'main',
    patterns: /\b(login|logon|cpf|cnpj|autentica\w*|token|senha|biometria|identifica\w*|chave de seguranca|validacao de identidade|selfie)\b/,
  },
  {
    key: 'escolha',
    name: 'Simulação e escolha',
    kind: 'main',
    patterns: /\b(simula\w*|parcela\w*|prazo\w*|oferta\w*|escolh\w*|selecion\w*|plano\w*|limite\w*|cotacao|taxa\w*|valor\w*|opcao|opcoes|modalidade\w*|lista de|catalogo|comparar)\b/,
  },
  {
    key: 'dados',
    name: 'Dados e preenchimento',
    kind: 'main',
    patterns: /\b(formulario|preench\w*|endereco|documento\w*|upload|cadastr\w*|dados pessoais|dados do|informe|informar|digit\w*|renda|profissao|contato)\b/,
  },
  {
    key: 'revisao',
    name: 'Revisão e confirmação',
    kind: 'main',
    patterns: /\b(resumo|revis\w*|confirm\w*|termo\w*|contrato|aceite|aceitar|assinatura|assinar|autoriza\w*|efetivar)\b/,
  },
  {
    key: 'conclusao',
    name: 'Conclusão',
    kind: 'main',
    patterns: /\b(sucesso|conclu\w*|comprovante|finaliz\w*|efetivad\w*|aprovad\w*|parabens|obrigado|pronto|realizad\w*|contratad\w*|purchase|feedback)\b/,
  },
  {
    key: 'excecoes',
    name: 'Erros e exceções',
    kind: 'exception',
    patterns: /\b(erro\w*|falha\w*|indisponi\w*|recusad\w*|negad\w*|timeout|invalid\w*|tente novamente|bloquead\w*|cancel\w*|nao foi possivel|exception|error|reprovad\w*|expirad\w*)\b/,
  },
];

const EXCEPTION_KEY = 'excecoes';

function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_\-/.:]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Texto que descreve a tela: o que o documento diz e o que o código dispara. */
function screenText(screen: any): { primary: string; secondary: string } {
  const primary = normalize(`${screen?.screen_name || ''} ${screen?.instruction || ''}`);
  const secondaryParts: string[] = [String(screen?.additional_information || '')];
  for (const snip of screen?.snippets || []) {
    secondaryParts.push(String(snip?.event_raw || snip?.event_normalized || ''));
    for (const p of snip?.parameters || []) {
      const name = normalize(p?.name || '');
      // Só parâmetros que descrevem a tela/ação; ids e valores técnicos geram ruído
      if (/(screen|page|step|etapa|tela|action|acao|label|name|nome|category|flow|fluxo|location|title|titulo|type|tipo|status|description)/.test(name)) {
        secondaryParts.push(String(p?.normalized_value ?? p?.value ?? ''));
      }
    }
  }
  return { primary, secondary: normalize(secondaryParts.join(' ')) };
}

/** Classifica a tela; null quando não há sinal suficiente. */
export function classifyScreenStage(screen: any): string | null {
  const { primary, secondary } = screenText(screen);
  // Erro tem prioridade: uma tela de "erro na simulação" é erro, não simulação
  const exception = JOURNEY_STAGES.find((s) => s.key === EXCEPTION_KEY)!;
  if (exception.patterns.test(primary)) return EXCEPTION_KEY;

  for (const stage of JOURNEY_STAGES) {
    if (stage.key === EXCEPTION_KEY) continue;
    if (stage.patterns.test(primary)) return stage.key;
  }
  if (exception.patterns.test(secondary)) return EXCEPTION_KEY;
  for (const stage of JOURNEY_STAGES) {
    if (stage.key === EXCEPTION_KEY) continue;
    if (stage.patterns.test(secondary)) return stage.key;
  }
  return null;
}

function sortScreens(screens: any[]): any[] {
  return [...(screens || [])].sort((a, b) => {
    const idxA = a?.screen_index ?? 9999;
    const idxB = b?.screen_index ?? 9999;
    if (idxA !== idxB) return idxA - idxB;
    return String(a?.screen_id || '').localeCompare(String(b?.screen_id || ''));
  });
}

export interface LocalJourney {
  nodes: any[];
  edges: any[];
  stages: Array<{ id: string; name: string; kind: 'main' | 'exception'; screenIds: string[] }>;
  summary: string;
  classifiedCount: number;
}

export function buildLocalJourney(artifact: any): LocalJourney {
  const screens = sortScreens(artifact?.screens || []);
  const mapId = String(artifact?.id || '');
  const nodeId = (sid: string) => `journey-screen-${mapId}-${sid}`;

  // 1. Etapa de cada tela; sem sinal, herda a etapa da tela anterior
  const stageOf = new Map<string, string>();
  let classifiedCount = 0;
  let lastMain = 'entrada';
  screens.forEach((screen, i) => {
    const sid = String(screen.screen_id || i);
    const found = classifyScreenStage(screen);
    if (found) classifiedCount++;
    const stage = found || lastMain;
    stageOf.set(sid, stage);
    if (stage !== EXCEPTION_KEY) lastMain = stage;
  });

  // 2. Nós de tela
  const nodes = screens.map((screen, i) => {
    const sid = String(screen.screen_id || i);
    const internalIndex = Number.isInteger(screen.screen_index) ? screen.screen_index : i;
    return {
      id: nodeId(sid),
      kind: 'screen',
      screenId: screen.screen_id,
      screenIndex: internalIndex,
      label: `Tela ${internalIndex + 1}`,
      summary: screen.screen_name || screen.instruction || 'Sem instrução',
      confidence: 'INFERIDO',
      evidence: ['ORGANIZACAO_LOCAL'],
      preferredSnippetIndex: 0,
    };
  });

  // 3. Arestas: fila principal na ordem do documento; erros saem da tela principal anterior
  const edges: any[] = [];
  let previousMain: string | null = null;
  screens.forEach((screen, i) => {
    const sid = String(screen.screen_id || i);
    const isException = stageOf.get(sid) === EXCEPTION_KEY;
    if (previousMain) {
      edges.push({
        id: `journey-edge-${previousMain}-${sid}`,
        source: nodeId(previousMain),
        target: nodeId(sid),
        confidence: isException ? 'AMBIGUO' : 'INFERIDO',
        evidence: ['ORGANIZACAO_LOCAL'],
        label: isException ? 'erro' : undefined,
        variant: isException ? 'exception' : 'main',
      });
    }
    if (!isException) previousMain = sid;
  });

  // 4. Etapas na ordem canônica, só as que têm telas
  const stages = JOURNEY_STAGES.map((def) => ({
    id: `stage-${mapId}-${def.key}`,
    name: def.name,
    kind: def.kind,
    screenIds: screens
      .map((s, i) => String(s.screen_id || i))
      .filter((sid) => stageOf.get(sid) === def.key),
  })).filter((s) => s.screenIds.length > 0);

  const mainStages = stages.filter((s) => s.kind === 'main').map((s) => s.name.toLowerCase());
  const exceptions = stages.find((s) => s.kind === 'exception')?.screenIds.length || 0;
  const summary =
    screens.length === 0
      ? 'Mapa sem telas.'
      : `${screens.length} ${screens.length === 1 ? 'tela' : 'telas'} em ${mainStages.length} ${mainStages.length === 1 ? 'etapa' : 'etapas'}` +
        (mainStages.length ? ` (${mainStages.join(', ')})` : '') +
        (exceptions ? ` e ${exceptions} ${exceptions === 1 ? 'tela de erro' : 'telas de erro'}` : '') +
        '.';

  return { nodes, edges, stages, summary, classifiedCount };
}
