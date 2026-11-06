import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { Artifact, ScreenItem } from '../types';
import { 
  Loader2, 
  Search, 
  BrainCircuit, 
  Info, 
  ExternalLink, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';

export function useDebouncedSearch(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// --- CUSTOM NODES ---

const ScreenNode = React.memo(({ data, selected }: any) => {
  const isAmbiguous = data.confidence === 'AMBIGUO';
  const isAi = data.isAiGenerated;
  const snippets: any[] = data.screen?.snippets || [];
  const snippetCount = snippets.length;

  const [currentSnippetIdx, setCurrentSnippetIdx] = useState(() => {
    const pref = Number(data.preferredSnippetIndex);
    if (!isNaN(pref) && pref >= 0 && pref < snippetCount) return pref;
    return 0;
  });

  // Atualiza snippet se o índice preferido mudar
  useEffect(() => {
    const pref = Number(data.preferredSnippetIndex);
    if (!isNaN(pref) && pref >= 0 && pref < snippetCount) {
      setCurrentSnippetIdx(pref);
    }
  }, [data.preferredSnippetIndex, snippetCount]);

  const currentSnippet = snippets[currentSnippetIdx] || snippets[0] || null;
  const currentEvent = currentSnippet?.event_normalized 
    || currentSnippet?.base_key 
    || currentSnippet?.event_raw 
    || (snippetCount > 0 ? 'evento' : 'Sem snippet catalogado');

  const rawCode = currentSnippet?.raw_code || '';

  const handlePrevSnippet = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentSnippetIdx(prev => (prev > 0 ? prev - 1 : snippetCount - 1));
  };

  const handleNextSnippet = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentSnippetIdx(prev => (prev < snippetCount - 1 ? prev + 1 : 0));
  };

  const handleOpenSnippet = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onOpenSnippet) {
      data.onOpenSnippet(currentSnippetIdx);
    } else if (data.onOpenScreen) {
      data.onOpenScreen();
    }
  };

  return (
    <>
      <Handle 
        type="target" 
        position={Position.Left} 
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white dark:!border-slate-900" 
      />
      <div 
        className={`p-4 rounded-xl border-2 bg-white dark:bg-slate-900 shadow-md w-[360px] transition-all cursor-pointer flex flex-col ${
          selected 
            ? 'border-[#7B0209] ring-2 ring-[#7B0209]/20 shadow-lg scale-[1.01]' 
            : 'border-gray-200 dark:border-slate-800 hover:border-[#7B0209]/60'
        }`}
        onClick={() => data.onOpenScreen && data.onOpenScreen()}
      >
        {/* Cabeçalho do Nó */}
        <div className="flex justify-between items-center mb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 px-2.5 py-1 rounded-md">
              Etapa #{data.screen?.screen_index ?? data.screenIndex ?? '?'}
            </span>
            {data.screen?.screen_id && (
              <span className="text-[10px] font-mono text-gray-400 dark:text-slate-500 truncate max-w-[120px]">
                {data.screen.screen_id}
              </span>
            )}
          </div>
          
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
            isAi 
              ? isAmbiguous ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
          }`}>
            {isAi ? data.confidence : 'DOCUMENTAL'}
          </span>
        </div>
        
        {/* Instrução da Tela */}
        <h4 className="text-xs font-semibold text-gray-900 dark:text-slate-100 leading-snug mb-3 line-clamp-2">
          {data.summary || 'Tela sem instrução especificada'}
        </h4>
        
        {/* Bloco de Evento Principal */}
        <div className="bg-gray-50 dark:bg-slate-800/80 rounded-lg p-2.5 mb-2.5 border border-gray-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-gray-400 dark:text-slate-400 font-bold uppercase tracking-wider">
              Evento Principal
            </span>
            {snippetCount > 1 && (
              <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-slate-400">
                <button
                  type="button"
                  onClick={handlePrevSnippet}
                  className="p-0.5 hover:bg-gray-200 dark:hover:bg-slate-700 rounded transition-colors cursor-pointer"
                  title="Snippet anterior"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <span>{currentSnippetIdx + 1} de {snippetCount}</span>
                <button
                  type="button"
                  onClick={handleNextSnippet}
                  className="p-0.5 hover:bg-gray-200 dark:hover:bg-slate-700 rounded transition-colors cursor-pointer"
                  title="Próximo snippet"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
          <span className="block text-xs font-mono font-bold text-[#7B0209] dark:text-red-400 truncate">
            {currentEvent}
          </span>
        </div>
        
        {/* Bloco de Código com Rolagem Vertical Controlada */}
        {rawCode ? (
          <div 
            className="nodrag nowheel max-h-36 overflow-y-auto custom-scrollbar bg-slate-950 text-slate-100 p-2.5 rounded-lg border border-slate-800 text-[10px] font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere] mb-2.5"
            onClick={handleOpenSnippet}
            title="Clique para abrir este snippet no modal"
          >
            <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] m-0 font-mono text-emerald-400">
              {rawCode}
            </pre>
          </div>
        ) : (
          <div className="bg-gray-50/50 dark:bg-slate-900/50 p-2 rounded text-[10px] text-gray-400 italic mb-2.5">
            Nenhum código dataLayer nesta etapa.
          </div>
        )}
        
        {/* Rodapé do Nó */}
        <div className="flex justify-between items-center text-[10px] text-gray-500 dark:text-slate-400 pt-1 border-t border-gray-100 dark:border-slate-800/80">
          <span>{snippetCount} {snippetCount === 1 ? 'snippet' : 'snippets'}</span>
          <button
            type="button"
            onClick={handleOpenSnippet}
            className="text-[10px] font-semibold text-[#7B0209] hover:underline flex items-center gap-1 cursor-pointer"
          >
            Ver snippet completo <ExternalLink className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
      <Handle 
        type="source" 
        position={Position.Right} 
        className="!w-3 !h-3 !bg-[#7B0209] !border-2 !border-white dark:!border-slate-900" 
      />
    </>
  );
});

const DecisionNode = React.memo(({ data, selected }: any) => {
  return (
    <>
      <Handle 
        type="target" 
        position={Position.Left} 
        className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-white dark:!border-slate-900" 
      />
      <div 
        className="w-[120px] h-[120px] relative flex items-center justify-center cursor-pointer select-none group"
        onClick={data.onClick}
      >
        {/* Losango visível com dimensões adequadas (84px * sqrt(2) ≈ 119px) */}
        <div className={`w-[84px] h-[84px] absolute rotate-45 rounded-lg border-2 transition-all ${
          selected 
            ? 'border-[#7B0209] bg-amber-100 dark:bg-amber-900/80 ring-2 ring-[#7B0209]/40 shadow-lg' 
            : 'border-amber-500 bg-amber-50 dark:bg-amber-950/70 hover:border-[#7B0209] shadow-md'
        }`} />

        {/* Conteúdo interno desrotacionado */}
        <div className="relative z-10 w-[80px] text-center flex flex-col items-center justify-center p-1">
          <span className="text-[8px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 mb-0.5">
            {data.confidence || 'DECISÃO'}
          </span>
          <p className="text-[9px] font-semibold text-gray-800 dark:text-slate-100 line-clamp-3 leading-tight">
            {data.condition || 'Condição de desvio'}
          </p>
        </div>

        {/* Tooltip com Rationale detalhado ao passar o mouse */}
        {data.rationale && (
          <div className="absolute top-[125px] left-1/2 -translate-x-1/2 w-52 bg-slate-900 text-white text-[10px] p-2.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl border border-slate-700">
            <p className="font-bold text-amber-300 mb-1">Inferência de Decisão</p>
            <p className="leading-relaxed text-slate-200">{data.rationale}</p>
          </div>
        )}
      </div>
      <Handle 
        type="source" 
        position={Position.Right} 
        className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-white dark:!border-slate-900" 
      />
    </>
  );
});

const nodeTypes = {
  screen: ScreenNode,
  decision: DecisionNode
};

// --- DAGRE LAYOUT ---

const getLayoutedElements = (nodes: any[], edges: any[], direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  const nodeWidth = 360;
  const nodeHeight = 240;
  const decisionSize = 130;
  
  dagreGraph.setGraph({ rankdir: direction, ranksep: 100, nodesep: 70 });
  
  nodes.forEach((node) => {
    const isDecision = node.type === 'decision';
    dagreGraph.setNode(node.id, { 
      width: isDecision ? decisionSize : nodeWidth, 
      height: isDecision ? decisionSize : nodeHeight 
    });
  });
  
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });
  
  dagre.layout(dagreGraph);
  
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id) || { x: 0, y: 0 };
    const isDecision = node.type === 'decision';
    const w = isDecision ? decisionSize : nodeWidth;
    const h = isDecision ? decisionSize : nodeHeight;
    return {
      ...node,
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      position: {
        x: nodeWithPosition.x - w / 2,
        y: nodeWithPosition.y - h / 2,
      },
    };
  });
  
  return { nodes: layoutedNodes, edges };
};

// Cache em memória para respostas válidas de IA
const journeyAiCache = new Map<string, any>();

interface JourneysCanvasProps {
  artifacts: Artifact[];
  selectedMapId: string | null;
  onOpenScreen: (map: Artifact, target?: { screenId?: string; snippetIndex?: number }) => void;
  onSelectScreen?: (screen: any) => void;
}

const JourneysCanvasInner: React.FC<JourneysCanvasProps> = ({ 
  artifacts, 
  selectedMapId, 
  onOpenScreen,
  onSelectScreen
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAiGenerated, setIsAiGenerated] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedSearch(searchQuery, 300);
  
  const { fitView, setCenter } = useReactFlow();

  const selectedMap = useMemo(() => {
    return artifacts.find((a: any) => String(a.id) === selectedMapId);
  }, [artifacts, selectedMapId]);

  const screens = useMemo(() => {
    if (!selectedMap || !Array.isArray(selectedMap.screens)) return [];
    return [...selectedMap.screens].sort((a: any, b: any) => {
      const idxA = a.screen_index ?? 9999;
      const idxB = b.screen_index ?? 9999;
      if (idxA !== idxB) return idxA - idxB;
      return String(a.screen_id || "").localeCompare(String(b.screen_id || ""));
    });
  }, [selectedMap]);

  // Handler para abertura segura no modal
  const handleOpenTarget = useCallback((target?: { screenId?: string; snippetIndex?: number }) => {
    if (!selectedMap) return;
    if (onOpenScreen) {
      onOpenScreen(selectedMap, target);
    } else if (onSelectScreen) {
      const targetScreen = target?.screenId 
        ? screens.find(s => String(s.screen_id) === String(target.screenId)) || screens[0]
        : screens[0];
      onSelectScreen({ ...targetScreen, belongsToMap: selectedMap });
    }
  }, [selectedMap, screens, onOpenScreen, onSelectScreen]);

  // Renderiza análise (IA ou fallback estruturado)
  const renderAnalysis = useCallback((analysis: any, isFromAi: boolean) => {
    if (!selectedMap) return;
    
    const newNodes = (analysis.nodes || []).map((n: any) => {
      const isDecision = n.kind === 'decision';
      const screenObj = isDecision ? null : screens.find(s => String(s.screen_id) === String(n.screenId)) || screens[0];
      
      return {
        id: n.id,
        type: n.kind,
        data: {
          ...n,
          isAiGenerated: isFromAi,
          screen: screenObj,
          onOpenScreen: () => {
            if (!isDecision && screenObj) {
              handleOpenTarget({ 
                screenId: screenObj.screen_id, 
                snippetIndex: n.preferredSnippetIndex ?? 0 
              });
            }
          },
          onOpenSnippet: (snippetIndex: number) => {
            if (!isDecision && screenObj) {
              handleOpenTarget({ 
                screenId: screenObj.screen_id, 
                snippetIndex 
              });
            }
          },
          onClick: () => {
            if (!isDecision && screenObj) {
              handleOpenTarget({ 
                screenId: screenObj.screen_id, 
                snippetIndex: n.preferredSnippetIndex ?? 0 
              });
            }
          }
        }
      };
    });
    
    const newEdges = (analysis.edges || []).map((e: any) => {
      const isAmbiguous = e.confidence === 'AMBIGUO';
      return {
        ...e,
        type: 'smoothstep',
        animated: isAmbiguous,
        label: e.label,
        labelStyle: { fill: '#7B0209', fontWeight: 600, fontSize: 10 },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95, rx: 4, ry: 4 },
        style: { 
          strokeWidth: 2, 
          stroke: isAmbiguous ? '#fbbf24' : '#7B0209',
          strokeDasharray: isAmbiguous ? '5,5' : 'none'
        },
        markerEnd: { 
          type: MarkerType.ArrowClosed, 
          color: isAmbiguous ? '#fbbf24' : '#7B0209' 
        }
      };
    });
    
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(newNodes, newEdges, 'LR');
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    setIsAiGenerated(isFromAi);

    // Enquadramento inicial legível: não diminuir os nós até ficarem microscópicos
    setTimeout(() => {
      if (layoutedNodes.length <= 3) {
        fitView({ padding: 0.2, maxZoom: 0.85, duration: 600 });
      } else {
        // Enquadrar o início da jornada com zoom legível
        const firstNode = layoutedNodes[0];
        if (firstNode && firstNode.position) {
          setCenter(firstNode.position.x + 360, firstNode.position.y + 120, { zoom: 0.75, duration: 600 });
        } else {
          fitView({ padding: 0.2, maxZoom: 0.85, duration: 600 });
        }
      }
    }, 120);
  }, [selectedMap, screens, setNodes, setEdges, fitView, setCenter, handleOpenTarget]);

  // Renderiza sequência documental inicial (baseline)
  const renderDeterministic = useCallback(() => {
    if (!selectedMap) return;
    const newNodes: any[] = [];
    const newEdges: any[] = [];
    
    screens.forEach((screen, i) => {
      const id = `journey-screen-${selectedMap.id}-${screen.screen_id || i}`;
      newNodes.push({
        id,
        type: 'screen',
        data: {
          screen,
          screenIndex: screen.screen_index ?? (i + 1),
          summary: screen.instruction || 'Tela sem instrução especificada',
          confidence: 'INFERIDO',
          isAiGenerated: false,
          preferredSnippetIndex: 0,
          onOpenScreen: () => {
            handleOpenTarget({ screenId: screen.screen_id, snippetIndex: 0 });
          },
          onOpenSnippet: (snippetIndex: number) => {
            handleOpenTarget({ screenId: screen.screen_id, snippetIndex });
          },
          onClick: () => {
            handleOpenTarget({ screenId: screen.screen_id, snippetIndex: 0 });
          }
        }
      });
      
      if (i > 0) {
        const prevScreen = screens[i - 1];
        const prevId = `journey-screen-${selectedMap.id}-${prevScreen.screen_id || (i - 1)}`;
        newEdges.push({
          id: `journey-edge-${prevId}-${id}-seq`,
          source: prevId,
          target: id,
          type: 'smoothstep',
          animated: false,
          style: { strokeWidth: 2, stroke: '#94a3b8' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }
        });
      }
    });
    
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(newNodes, newEdges, 'LR');
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    setIsAiGenerated(false);
    
    setTimeout(() => {
      if (layoutedNodes.length <= 3) {
        fitView({ padding: 0.2, maxZoom: 0.85, duration: 600 });
      } else {
        const firstNode = layoutedNodes[0];
        if (firstNode && firstNode.position) {
          setCenter(firstNode.position.x + 360, firstNode.position.y + 120, { zoom: 0.75, duration: 600 });
        } else {
          fitView({ padding: 0.2, maxZoom: 0.85, duration: 600 });
        }
      }
    }, 120);
  }, [selectedMap, screens, setNodes, setEdges, fitView, setCenter, handleOpenTarget]);

  // Carrega baseline documental ou cache ao trocar de mapa
  useEffect(() => {
    if (!selectedMap) {
      setNodes([]);
      setEdges([]);
      setError(null);
      setStatusMessage(null);
      setIsAiGenerated(false);
      return;
    }
    
    if (screens.length === 0) {
      setNodes([]);
      setEdges([]);
      setError(null);
      setStatusMessage(null);
      return;
    }
    
    const mapAny = selectedMap as any;
    const cacheKey = `${selectedMap.id}-${mapAny?.version || "1.0"}-${mapAny?.signature_hash || ""}`;
    const cached = journeyAiCache.get(cacheKey);
    
    if (cached) {
      renderAnalysis(cached, true);
      setStatusMessage("Jornada analisada por IA.");
      setError(null);
      return;
    }
    
    // Renderiza a sequência documental imediatamente
    setError(null);
    setStatusMessage(null);
    renderDeterministic();
  }, [selectedMap?.id, screens.length]);

  // Dispara análise real de IA
  const handleAnalyze = async () => {
    if (!selectedMap) return;
    setIsAnalyzing(true);
    setError(null);
    setStatusMessage("Analisando jornada…");

    try {
      const res = await fetch("/api/insights/journeys/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifact: selectedMap })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const backendError = data.error || "Falha ao conectar com o serviço de IA.";
        setError(backendError);
        setStatusMessage("Não foi possível concluir a análise por IA. Exibindo apenas a sequência documental.");
        if (data.fallback && data.nodes) {
          renderAnalysis(data, false);
        } else {
          renderDeterministic();
        }
        return;
      }

      // Sucesso na análise
      const mapAny = selectedMap as any;
      const cacheKey = `${selectedMap.id}-${mapAny?.version || "1.0"}-${mapAny?.signature_hash || ""}`;
      journeyAiCache.set(cacheKey, data);

      renderAnalysis(data, true);
      setStatusMessage("Jornada analisada por IA.");
      setError(null);
    } catch (e: any) {
      console.error("[JourneysCanvas] Erro na requisição:", e);
      setError(e.message || "Erro de rede ao solicitar análise.");
      setStatusMessage("Não foi possível concluir a análise por IA. Exibindo apenas a sequência documental.");
      renderDeterministic();
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Busca textual nas telas sem recalcular layout
  useEffect(() => {
    if (!debouncedSearch) {
      setNodes(nds => nds.map(n => ({ ...n, selected: false })));
      return;
    }
    
    const term = debouncedSearch.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let foundNode: any = null;
    
    setNodes(nds => nds.map(n => {
      let isMatch = false;
      const d = n.data;
      if (d.summary && d.summary.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term)) isMatch = true;
      if (d.condition && d.condition.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term)) isMatch = true;
      if (d.rationale && d.rationale.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term)) isMatch = true;
      if (d.screen) {
        if (d.screen.screen_id && d.screen.screen_id.toLowerCase().includes(term)) isMatch = true;
        const snips = d.screen.snippets || [];
        for (const s of snips) {
          if (s.event_normalized && s.event_normalized.toLowerCase().includes(term)) isMatch = true;
          if (s.base_key && s.base_key.toLowerCase().includes(term)) isMatch = true;
          if (s.raw_code && s.raw_code.toLowerCase().includes(term)) isMatch = true;
        }
      }
      
      if (isMatch && !foundNode) foundNode = n;
      return { ...n, selected: isMatch };
    }));
    
    if (foundNode && foundNode.position) {
      setCenter(foundNode.position.x + 180, foundNode.position.y + 120, { duration: 600, zoom: 0.95 });
    }
  }, [debouncedSearch, setNodes, setCenter]);

  if (!selectedMapId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/50 dark:bg-slate-900/50 p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center mb-3 text-gray-400">
          <BrainCircuit className="w-6 h-6" />
        </div>
        <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">
          Selecione um mapa para visualizar sua jornada.
        </p>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 max-w-sm">
          Escolha um produto e subproduto nos filtros laterais para carregar as telas catalogadas.
        </p>
      </div>
    );
  }

  if (screens.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/50 dark:bg-slate-900/50 p-8 text-center">
        <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">
          Nenhuma tela estruturada foi encontrada neste mapa.
        </p>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
          O artefato pode conter apenas documentação conceitual sem tabela de telas associadas.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative bg-gray-50/30 dark:bg-slate-950 overflow-hidden">
      
      {/* Controles de Cabeçalho */}
      <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-3">
        {/* Campo de Busca */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar tela, evento ou código..."
            className="pl-9 pr-4 py-2 w-[280px] sm:w-[320px] h-10 rounded-full border border-gray-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm text-xs font-ui focus:outline-none focus:ring-2 focus:ring-[#7B0209] transition-all shadow-sm dark:text-slate-200"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        
        {/* Botão Gerar Jornada / Analisar Novamente */}
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="h-10 px-5 rounded-full bg-[#7B0209] hover:bg-[#630005] text-white text-xs font-ui font-semibold flex items-center gap-2 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analisando jornada…</span>
            </>
          ) : (
            <>
              <BrainCircuit className="w-4 h-4" />
              <span>{isAiGenerated ? 'Analisar novamente' : 'Gerar jornada'}</span>
            </>
          )}
        </button>

        {/* Badge de Status Atual */}
        {statusMessage && !isAnalyzing && (
          <div className={`px-3 py-1.5 rounded-full text-xs font-ui font-semibold flex items-center gap-1.5 shadow-sm backdrop-blur-sm ${
            isAiGenerated 
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800'
          }`}>
            {isAiGenerated ? <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> : <Info className="w-3.5 h-3.5 text-amber-600" />}
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Banner de Erro Real com Ação de Tentar Novamente */}
      {error && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 max-w-xl w-[90%] bg-red-50 dark:bg-red-950/90 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-xs shadow-lg flex items-center justify-between gap-3 backdrop-blur-md">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
            <p className="truncate font-medium">{error}</p>
          </div>
          <button
            type="button"
            onClick={handleAnalyze}
            className="shrink-0 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Tentar novamente
          </button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView={false}
        minZoom={0.2}
        maxZoom={1.8}
      >
        <Background color="#ccc" gap={16} />
        <Controls />
        <MiniMap 
          nodeColor={(n: any) => {
            if (n.type === 'decision') return '#fbbf24';
            return n.selected ? '#7B0209' : '#cbd5e1';
          }}
          maskColor="rgba(0,0,0,0.1)"
          className="dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700"
        />
      </ReactFlow>
    </div>
  );
};

export const JourneysCanvas: React.FC<JourneysCanvasProps> = (props) => (
  <ReactFlowProvider>
    <JourneysCanvasInner {...props} />
  </ReactFlowProvider>
);
