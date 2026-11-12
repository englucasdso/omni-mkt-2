import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDebouncedSearch } from '../utils/contextualSearch';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Artifact } from '../types';
import { StatusBadge } from './badges/StatusBadge';
import { buildLocalJourney } from '../domain/journey/localJourney';
import {
  Search,
  BrainCircuit,
  Info,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Code2,
} from 'lucide-react';

// --- Medidas do layout ---------------------------------------------------------

const CARD_WIDTH = 300;
const CARD_HEIGHT = 214;
const CARD_HEIGHT_WITH_CODE = 340;
const STAGE_HEADER = 44;
const STAGE_PADDING = 20;

// --- Nós ---------------------------------------------------------------------

function paramChips(snippet: any): Array<{ name: string; value: string }> {
  const params: any[] = snippet?.parameters || [];
  return params
    .filter((p) => p?.name && !/^event$/i.test(p.name))
    .slice(0, 3)
    .map((p) => ({
      name: String(p.name),
      value: String(p.normalized_value ?? p.value ?? '').slice(0, 28),
    }));
}

const ScreenNode = React.memo(({ data, selected }: any) => {
  const snippets: any[] = data.screen?.snippets || [];
  const snippetCount = snippets.length;
  const isException = data.stageKind === 'exception';

  const [currentSnippetIdx, setCurrentSnippetIdx] = useState(() => {
    const pref = Number(data.preferredSnippetIndex);
    return !isNaN(pref) && pref >= 0 && pref < snippetCount ? pref : 0;
  });

  useEffect(() => {
    const pref = Number(data.preferredSnippetIndex);
    if (!isNaN(pref) && pref >= 0 && pref < snippetCount) setCurrentSnippetIdx(pref);
  }, [data.preferredSnippetIndex, snippetCount]);

  const snippet = snippets[currentSnippetIdx] || snippets[0] || null;
  const eventName = snippet?.event_raw || snippet?.event_normalized || snippet?.base_key || '';
  const chips = paramChips(snippet);
  const rawIdx = data.screen?.screen_index ?? data.screenIndex;
  const screenNumber = Number.isInteger(rawIdx) ? rawIdx + 1 : '?';

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const openSnippet = (e: React.MouseEvent) => {
    e.stopPropagation();
    data.onOpenSnippet?.(currentSnippetIdx);
  };

  return (
    <>
      <Handle id="l" type="target" position={Position.Left} className="!w-2 !h-2 !bg-omni-line !border-2 !border-white" />
      <Handle id="t" type="target" position={Position.Top} className="!w-2 !h-2 !bg-omni-line !border-2 !border-white" />
      <div
        className={`rounded-xl border bg-white shadow-sm transition-all cursor-pointer flex flex-col overflow-hidden ${
          selected
            ? 'border-omni-bordo ring-2 ring-omni-bordo/25 shadow-md'
            : isException
            ? 'border-red-200 hover:border-red-400'
            : 'border-omni-line hover:border-omni-bordo/50'
        }`}
        style={{ width: CARD_WIDTH, height: data.showCode ? CARD_HEIGHT_WITH_CODE : CARD_HEIGHT }}
        onClick={() => data.onOpenSnippet?.(currentSnippetIdx)}
        title="Abrir esta tela no detalhe do mapa"
      >
        <div className={`h-1 ${isException ? 'bg-red-400' : 'bg-omni-bordo/70'}`} />
        <div className="p-3 flex flex-col gap-2 flex-1 min-h-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-omni-ink-secondary tabular-nums">Tela {screenNumber}</span>
            {data.screen?.status && <StatusBadge status={data.screen.status} className="!text-[10px] !px-1.5" />}
          </div>

          <h4 className="text-[13px] font-semibold text-omni-ink leading-snug line-clamp-2 min-h-[34px]">
            {data.summary || 'Tela sem instrução'}
          </h4>

          <div className="flex items-center justify-between gap-2 min-h-[22px]">
            {eventName ? (
              <span className="text-[11px] font-mono font-semibold text-omni-bordo truncate" title={eventName}>
                {eventName}
              </span>
            ) : (
              <span className="text-[11px] text-omni-muted italic">Sem snippet</span>
            )}
            {snippetCount > 1 && (
              <div className="nodrag flex items-center gap-0.5 text-[10px] text-omni-muted shrink-0" onClick={stop}>
                <button
                  type="button"
                  onClick={() => setCurrentSnippetIdx((p) => (p > 0 ? p - 1 : snippetCount - 1))}
                  className="p-0.5 hover:bg-omni-mist rounded cursor-pointer"
                  aria-label="Snippet anterior"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <span className="tabular-nums">
                  {currentSnippetIdx + 1}/{snippetCount}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentSnippetIdx((p) => (p < snippetCount - 1 ? p + 1 : 0))}
                  className="p-0.5 hover:bg-omni-mist rounded cursor-pointer"
                  aria-label="Próximo snippet"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {!data.showCode && chips.length > 0 && (
            <div className="flex flex-wrap gap-1 max-h-[44px] overflow-hidden">
              {chips.map((c) => (
                <span
                  key={c.name}
                  className="max-w-full truncate text-[10px] font-mono px-1.5 py-0.5 rounded bg-omni-mist border border-omni-line text-omni-ink-secondary"
                  title={`${c.name}: ${c.value}`}
                >
                  {c.name}: {c.value || '—'}
                </span>
              ))}
            </div>
          )}

          {data.showCode && snippet?.raw_code && (
            <div
              className="nodrag nowheel max-h-[136px] overflow-y-auto custom-scrollbar bg-slate-950 rounded-lg p-2 text-[10px]"
              onClick={openSnippet}
            >
              <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] m-0 font-mono text-emerald-300">
                {snippet.raw_code}
              </pre>
            </div>
          )}

          <button
            type="button"
            onClick={openSnippet}
            className="nodrag mt-auto self-start text-[11px] font-semibold text-omni-bordo hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            Abrir tela <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
      <Handle id="r" type="source" position={Position.Right} className="!w-2 !h-2 !bg-omni-bordo !border-2 !border-white" />
      <Handle id="b" type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-omni-bordo !border-2 !border-white" />
    </>
  );
});

const StageNode = React.memo(({ data }: any) => {
  const isException = data.kind === 'exception';
  return (
    <div
      className={`w-full h-full rounded-2xl border ${
        isException ? 'bg-red-50/50 border-red-200 border-dashed' : 'bg-omni-mist/60 border-omni-line'
      }`}
    >
      <div className="px-4 pt-3 flex items-baseline justify-between gap-3">
        <span className={`text-sm font-semibold ${isException ? 'text-red-800' : 'text-omni-ink'}`}>{data.name}</span>
        <span className="text-[11px] text-omni-muted tabular-nums shrink-0">
          {data.count} {data.count === 1 ? 'tela' : 'telas'}
        </span>
      </div>
      {data.description && <p className="px-4 text-[11px] text-omni-ink-secondary truncate">{data.description}</p>}
    </div>
  );
});

const nodeTypes = { screen: ScreenNode, stage: StageNode };

// --- Layout ------------------------------------------------------------------

interface StageInfo {
  id: string;
  name: string;
  kind?: 'main' | 'exception';
  description?: string;
  screenIds: string[];
}

const COLUMN_GAP = 72;
const ROW_GAP = 28;

/**
 * Quadro de etapas: cada etapa é uma coluna (na ordem da jornada) e as telas da
 * etapa ficam empilhadas de cima para baixo, na ordem do documento.
 * Telas sem etapa vão para uma coluna "Outras telas".
 */
function layoutJourney(nodes: any[], stages: StageInfo[], cardHeight: number) {
  const screenNodes = nodes.filter((n) => n.type === 'screen');
  const byScreenId = new Map(screenNodes.map((n) => [String(n.data?.screenId ?? n.data?.screen?.screen_id), n]));
  const placed = new Set<string>();

  const columns: Array<{ stage: StageInfo; members: any[] }> = [];
  stages.forEach((st) => {
    const members = st.screenIds.map((sid) => byScreenId.get(String(sid))).filter((n): n is any => Boolean(n) && !placed.has(n.id));
    members.forEach((n) => placed.add(n.id));
    if (members.length) columns.push({ stage: st, members });
  });
  const leftovers = screenNodes.filter((n) => !placed.has(n.id));
  if (leftovers.length) {
    columns.push({ stage: { id: 'stage-outras', name: 'Outras telas', kind: 'main', screenIds: [] }, members: leftovers });
  }
  // Exceções sempre por último, para a fila principal ler da esquerda para a direita
  columns.sort((a, b) => Number(a.stage.kind === 'exception') - Number(b.stage.kind === 'exception'));

  const columnOf = new Map<string, number>();
  const laidOut: any[] = [];
  const frames: any[] = [];

  columns.forEach((col, ci) => {
    const x = ci * (CARD_WIDTH + STAGE_PADDING * 2 + COLUMN_GAP);
    col.members.forEach((n, ri) => {
      columnOf.set(n.id, ci);
      laidOut.push({
        ...n,
        position: { x: x + STAGE_PADDING, y: STAGE_HEADER + ri * (cardHeight + ROW_GAP) },
        zIndex: 1,
      });
    });
    const height = STAGE_HEADER + col.members.length * (cardHeight + ROW_GAP) - ROW_GAP + STAGE_PADDING;
    frames.push({
      id: col.stage.id,
      type: 'stage',
      position: { x, y: 0 },
      style: { width: CARD_WIDTH + STAGE_PADDING * 2, height },
      data: { name: col.stage.name, kind: col.stage.kind, description: col.stage.description, count: col.members.length },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: 0,
    });
  });

  return { nodes: [...frames, ...laidOut], columnOf };
}

// --- Componente --------------------------------------------------------------

interface JourneysCanvasProps {
  artifacts: Artifact[];
  selectedMapId: string | null;
  onOpenScreen: (map: Artifact, target?: { screenId?: string; snippetIndex?: number }) => void;
}

const normalizeText = (t: string) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const JourneysCanvasInner: React.FC<JourneysCanvasProps> = ({ artifacts, selectedMapId, onOpenScreen }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [showCode, setShowCode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedSearch(searchQuery, 300);
  const { fitView, setCenter } = useReactFlow();

  const selectedMap = useMemo(
    () => artifacts.find((a: any) => String(a.id) === selectedMapId),
    [artifacts, selectedMapId]
  );

  const screens = useMemo(() => {
    if (!selectedMap || !Array.isArray(selectedMap.screens)) return [];
    return [...selectedMap.screens].sort((a: any, b: any) => (a.screen_index ?? 9999) - (b.screen_index ?? 9999));
  }, [selectedMap]);

  const openTarget = useCallback(
    (screenId?: string, snippetIndex?: number) => {
      if (selectedMap) onOpenScreen(selectedMap, { screenId, snippetIndex: snippetIndex ?? 0 });
    },
    [selectedMap, onOpenScreen]
  );

  // Organização por etapas, calculada a partir do texto das telas
  const analysis = useMemo(
    () => (selectedMap && screens.length > 0 ? buildLocalJourney(selectedMap) : null),
    [selectedMap, screens.length]
  );

  useEffect(() => setSearchQuery(''), [selectedMap?.id]);

  // Desenha a análise atual
  useEffect(() => {
    if (!analysis || !selectedMap) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const data = analysis;
    const stages: StageInfo[] = Array.isArray(data.stages) ? data.stages : [];
    const stageKindByScreen = new Map<string, string>();
    stages.forEach((st) => st.screenIds.forEach((sid) => stageKindByScreen.set(String(sid), st.kind || 'main')));

    const flowNodes = (data.nodes || []).map((n: any) => {
      const screenObj = screens.find((s: any) => String(s.screen_id) === String(n.screenId)) || null;
      return {
        id: n.id,
        type: 'screen',
        data: {
          ...n,
          screen: screenObj,
          showCode,
          stageKind: screenObj ? stageKindByScreen.get(String(screenObj.screen_id)) : undefined,
          onOpenSnippet: (snippetIndex: number) => screenObj && openTarget(screenObj.screen_id, snippetIndex),
        },
      };
    });

    const { nodes: laidOut, columnOf } = layoutJourney(flowNodes, stages, showCode ? CARD_HEIGHT_WITH_CODE : CARD_HEIGHT);
    const nodeById = new Map(flowNodes.map((n: any) => [n.id, n]));

    const flowEdges = (data.edges || [])
      .filter((e: any) => nodeById.has(e.source) && nodeById.has(e.target))
      .map((e: any) => {
        const targetKind = nodeById.get(e.target)?.data?.stageKind;
        const isException = e.variant === 'exception' || targetKind === 'exception';
        const isAmbiguous = e.confidence === 'AMBIGUO';
        const sameColumn = columnOf.get(e.source) === columnOf.get(e.target);
        const color = isException ? '#dc2626' : isAmbiguous ? '#d97706' : '#7B0209';
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: sameColumn ? 'b' : 'r',
          targetHandle: sameColumn ? 't' : 'l',
          label: e.label,
          type: 'smoothstep',
          labelStyle: { fill: color, fontWeight: 600, fontSize: 11 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95 },
          labelBgPadding: [4, 2] as [number, number],
          style: { strokeWidth: 1.75, stroke: color, strokeDasharray: isException || isAmbiguous ? '5,4' : undefined },
          markerEnd: { type: MarkerType.ArrowClosed, color },
          zIndex: 1,
        };
      });

    setNodes(laidOut);
    setEdges(flowEdges);
    setTimeout(() => fitView({ padding: 0.08, maxZoom: 1, minZoom: 0.3, duration: 400 }), 80);
  }, [analysis, showCode, screens, selectedMap, openTarget, setNodes, setEdges, fitView]);

  // Busca: destaca e centraliza a primeira tela encontrada, sem refazer o layout
  useEffect(() => {
    const term = normalizeText(debouncedSearch.trim());
    let found: any = null;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.type === 'stage') return n;
        if (!term) return { ...n, selected: false };
        const d: any = n.data;
        const haystack = normalizeText(
          [
            d.summary,
            d.condition,
            d.screen?.instruction,
            d.screen?.screen_name,
            ...(d.screen?.snippets || []).flatMap((s: any) => [s.event_raw, s.event_normalized, s.raw_code]),
          ]
            .filter(Boolean)
            .join(' ')
        );
        const isMatch = haystack.includes(term);
        if (isMatch && !found) found = n;
        return { ...n, selected: isMatch };
      })
    );
    if (found?.position) {
      setCenter(found.position.x + CARD_WIDTH / 2, found.position.y + CARD_HEIGHT / 2, { duration: 500, zoom: 0.95 });
    }
  }, [debouncedSearch, setNodes, setCenter]);

  if (!selectedMapId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-omni-mist/40 p-8 text-center rounded-2xl border border-omni-line m-4">
        <div className="w-12 h-12 rounded-2xl bg-white border border-omni-line shadow-neu-card flex items-center justify-center mb-3 text-omni-bordo">
          <BrainCircuit className="w-6 h-6" />
        </div>
        <p className="text-base font-semibold text-omni-ink">Escolha um mapa para ver a jornada</p>
        <p className="text-xs text-omni-ink-secondary mt-1 max-w-md">
          Use Produto, Subproduto e Mapa na barra acima. As telas aparecem agrupadas por etapa da jornada.
        </p>
      </div>
    );
  }

  if (screens.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <p className="text-sm font-semibold text-omni-ink">Este mapa não tem telas estruturadas.</p>
        <p className="text-xs text-omni-ink-secondary mt-1">
          O artefato pode conter apenas documentação, sem blocos de tela e snippet.
        </p>
      </div>
    );
  }

  const summary: string = analysis?.summary || '';
  const classified = analysis?.classifiedCount ?? 0;
  const unclassified = screens.length - classified;

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden rounded-2xl border border-omni-line bg-white">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-omni-line bg-white">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-omni-muted" />
          <input
            type="text"
            placeholder="Buscar tela, evento ou código"
            className="pl-9 pr-3 h-9 w-[240px] sm:w-[280px] rounded-lg border border-omni-line bg-white text-xs focus:outline-none focus:ring-2 focus:ring-omni-bordo/30"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={() => setShowCode((v) => !v)}
          aria-pressed={showCode}
          className={`h-9 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
            showCode ? 'bg-omni-ink text-white border-omni-ink' : 'bg-white text-omni-ink-secondary border-omni-line hover:border-omni-bordo/40'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          {showCode ? 'Esconder código' : 'Mostrar código'}
        </button>

      </div>

      {/* Resumo da jornada */}
      <div className="flex items-start gap-2.5 px-4 py-2.5 border-b border-omni-line bg-omni-mist/50">
        <Info className="w-4 h-4 text-omni-muted shrink-0 mt-0.5" />
        <p className="text-xs text-omni-ink-secondary leading-relaxed">
          {summary}
          {unclassified > 0 &&
            ` ${unclassified} ${unclassified === 1 ? 'tela não tinha' : 'telas não tinham'} pista de etapa e ${unclassified === 1 ? 'ficou' : 'ficaram'} junto da tela anterior.`}{' '}
          Etapas definidas pelo texto, evento e parâmetros de cada tela; telas de erro saem da tela anterior em vermelho.
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          minZoom={0.15}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e5e7eb" gap={18} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n: any) => (n.type === 'stage' ? '#f3f4f6' : n.type === 'decision' ? '#fbbf24' : n.selected ? '#7B0209' : '#cbd5e1')}
            maskColor="rgba(0,0,0,0.06)"
            className="rounded-lg border border-omni-line"
          />
        </ReactFlow>
      </div>
    </div>
  );
};

export const JourneysCanvas: React.FC<JourneysCanvasProps> = (props) => (
  <ReactFlowProvider>
    <JourneysCanvasInner {...props} />
  </ReactFlowProvider>
);
