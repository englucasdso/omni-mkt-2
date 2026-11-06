import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Node,
  Edge,
  ReactFlowProvider
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { AlertCircle } from 'lucide-react';
import { Artifact } from '../types';

// ==========================================
// Custom Nodes
// ==========================================

const ExpandButton = ({ isExpanded, onClick, count }: any) => (
  <button 
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className="absolute -top-3 -right-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 text-[10px] font-ui font-bold min-w-[28px] h-[28px] flex items-center justify-center rounded-lg shadow-neu-raised z-20 hover:scale-105 active:scale-95 cursor-pointer transition-transform"
    title={isExpanded ? "Recolher" : "Expandir"}
  >
    {count}
  </button>
);

const ProdutoNode = React.memo(({ data }: any) => {
  const isSelected = data.isSelected;
  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-gray-400 !border-2 !border-white dark:!border-slate-800 opacity-0" />
      <div
        role="button"
        tabIndex={0}
        onClick={data.onSelect}
        className={`p-5 flat-card rounded-2xl border w-[260px] h-[92px] relative transition-all group flex flex-col justify-center cursor-pointer ${
          isSelected
            ? 'bg-red-50 dark:bg-red-950/40 border-[#7B0209] shadow-lg ring-4 ring-[#7B0209]/30'
            : 'bg-white dark:bg-slate-850 border-gray-200 dark:border-slate-800 shadow-neu-card hover:border-[#7B0209]'
        }`}
      >
        {data.hasChildren && (
          <ExpandButton isExpanded={data.isExpanded} onClick={data.onToggle} count={data.childrenCount} />
        )}
        <span className="text-[10px] font-ui font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Produto</span>
        <h4 className="text-base font-heading font-bold text-gray-900 dark:text-slate-50 tracking-tight leading-tight line-clamp-2 group-hover:text-[#7B0209] transition-colors">{data.label}</h4>
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-[#7B0209] !border-2 !border-white dark:!border-slate-800" />
    </>
  );
});

const SubprodutoNode = React.memo(({ data }: any) => {
  const isSelected = data.isSelected;
  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-gray-400 !border-2 !border-white dark:!border-slate-800" />
      <div
        role="button"
        tabIndex={0}
        onClick={data.onSelect}
        className={`p-4 flat-card rounded-2xl border w-[250px] h-[86px] relative transition-all group flex flex-col justify-center cursor-pointer ${
          isSelected
            ? 'bg-red-50 dark:bg-red-950/40 border-[#7B0209] shadow-lg ring-4 ring-[#7B0209]/30'
            : 'bg-gray-50/90 dark:bg-slate-800/90 border-gray-200 dark:border-slate-800 shadow-neu-card hover:border-[#E30328]'
        }`}
      >
        {data.hasChildren && (
          <ExpandButton isExpanded={data.isExpanded} onClick={data.onToggle} count={data.childrenCount} />
        )}
        <span className="text-[10px] font-ui font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Subproduto</span>
        <h4 className="text-sm font-heading font-bold text-gray-800 dark:text-slate-100 tracking-tight line-clamp-2 group-hover:text-[#E30328] transition-colors">{data.label}</h4>
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-gray-400 !border-2 !border-white dark:!border-slate-800" />
    </>
  );
});

const CategoriaNode = React.memo(({ data }: any) => {
  const isSelected = data.isSelected;
  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-gray-400 !border-2 !border-white dark:!border-slate-800" />
      <div
        role="button"
        tabIndex={0}
        onClick={data.onSelect}
        className={`p-4 flat-card rounded-2xl border w-[240px] h-[80px] relative transition-all group flex flex-col justify-center cursor-pointer ${
          isSelected
            ? 'bg-red-50 dark:bg-red-950/40 border-[#7B0209] shadow-lg ring-4 ring-[#7B0209]/30'
            : 'bg-gray-100/90 dark:bg-slate-900/90 border-gray-200 dark:border-slate-800 shadow-neu-card hover:border-gray-400'
        }`}
      >
        {data.hasChildren && (
          <ExpandButton isExpanded={data.isExpanded} onClick={data.onToggle} count={data.childrenCount} />
        )}
        <span className="text-[9px] font-ui font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Categoria</span>
        <h4 className="text-xs font-heading font-bold text-gray-800 dark:text-slate-100 tracking-tight line-clamp-2 transition-colors">{data.label}</h4>
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-gray-400 !border-2 !border-white dark:!border-slate-800" />
    </>
  );
});

const MapaNode = React.memo(({ data }: any) => {
  const isSelected = data.isSelected;
  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-gray-400 !border-2 !border-white dark:!border-slate-800" />
      <div 
        role="button"
        tabIndex={0}
        className={`p-4 flat-card rounded-2xl border transition-all cursor-pointer w-[320px] h-[82px] flex flex-col justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#7B0209] ${
          isSelected 
            ? 'bg-red-50 dark:bg-red-950/40 border-[#7B0209] shadow-lg ring-4 ring-[#7B0209]/30'
            : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm hover:border-[#7B0209]'
        }`}
        onClick={data.onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            data.onSelect?.();
          }
        }}
      >
        {data.hasChildren && (
          <ExpandButton isExpanded={data.isExpanded} onClick={data.onToggle} count={data.childrenCount} />
        )}
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-red-100 text-[#7B0209] dark:bg-red-900/40 dark:text-red-400">
            Mapa
          </span>
          <span className="text-[10px] text-gray-400 font-mono truncate">{data.item?.id || ''}</span>
        </div>
        <h4 className={`text-xs font-bold leading-tight line-clamp-2 ${isSelected ? 'text-[#7B0209] dark:text-red-400' : 'text-gray-900 dark:text-slate-100'}`}>
          {data.label}
        </h4>
      </div>
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className={`!w-2.5 !h-2.5 !bg-gray-400 !border-2 !border-white dark:!border-slate-800 ${data.hasChildren ? '' : 'opacity-0'}`} 
      />
    </>
  );
});

const DocumentoNode = React.memo(({ data }: any) => {
  const isSelected = data.isSelected;
  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-gray-400 !border-2 !border-white dark:!border-slate-800" />
      <div 
        role="button"
        tabIndex={0}
        className={`p-4 flat-card rounded-2xl border transition-all cursor-pointer w-[320px] h-[82px] flex flex-col justify-center ${
          isSelected 
            ? 'bg-red-50 dark:bg-red-950/40 border-[#7B0209] shadow-lg ring-4 ring-[#7B0209]/30'
            : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 shadow-sm hover:border-[#7B0209]'
        }`}
        onClick={data.onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            data.onSelect?.();
          }
        }}
      >
        {data.hasChildren && (
          <ExpandButton isExpanded={data.isExpanded} onClick={data.onToggle} count={data.childrenCount} />
        )}
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-[#64748B] dark:bg-slate-800/40 dark:text-slate-400">
            Documento
          </span>
          <span className="text-[10px] text-gray-400 font-mono truncate">{data.item?.id || ''}</span>
        </div>
        <h4 className={`text-xs font-bold leading-tight line-clamp-2 ${isSelected ? 'text-[#7B0209] dark:text-red-400' : 'text-gray-900 dark:text-slate-100'}`}>
          {data.label}
        </h4>
      </div>
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className={`!w-2.5 !h-2.5 !bg-gray-400 !border-2 !border-white dark:!border-slate-800 ${data.hasChildren ? '' : 'opacity-0'}`} 
      />
    </>
  );
});

const nodeTypes = {
  produto: ProdutoNode,
  subproduto: SubprodutoNode,
  categoria: CategoriaNode,
  mapa: MapaNode,
  documento: DocumentoNode,
};

// ==========================================
// Layout Engine (Dagre)
// ==========================================

const getDagreLayout = (
  nodes: Node[],
  edges: Edge[],
  clickedNodeId: string | null,
  previousNodes: Node[]
): Node[] => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ 
    rankdir: 'TB', 
    nodesep: 70, 
    ranksep: 110, 
    marginx: 40, 
    marginy: 40 
  });

  dagreGraph.setNode('VIRTUAL_ROOT', { width: 1, height: 1 });

  nodes.forEach((node) => {
    let width = 240, height = 80;
    if (node.type === 'produto') { width = 260; height = 92; }
    else if (node.type === 'subproduto') { width = 250; height = 86; }
    else if (node.type === 'mapa' || node.type === 'documento') { width = 320; height = 82; }
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  const hasIncoming = new Set<string>();
  edges.forEach(e => hasIncoming.add(e.target));

  nodes.forEach(n => {
    if (!hasIncoming.has(n.id)) {
      dagreGraph.setEdge('VIRTUAL_ROOT', n.id);
    }
  });

  dagre.layout(dagreGraph);

  let dx = 0, dy = 0;
  if (clickedNodeId) {
    const oldNode = previousNodes.find(n => n.id === clickedNodeId);
    const newPos = dagreGraph.node(clickedNodeId);
    if (oldNode && newPos) {
      dx = oldNode.position.x - (newPos.x - newPos.width / 2);
      dy = oldNode.position.y - (newPos.y - newPos.height / 2);
    }
  }

  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const width = nodeWithPosition.width;
    const height = nodeWithPosition.height;
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - width / 2 + dx,
        y: nodeWithPosition.y - height / 2 + dy,
      },
    };
  });
};

// ==========================================
// Inner Canvas Component
// ==========================================

interface ConexoesCanvasInnerProps {
  onSelectItem?: (id: string) => void;
  data: Artifact[];
  selectedItemId?: string | null;
  targetArtifactId?: string | null;
  onClearTargetArtifactId?: () => void;
  onOpenMap?: (map: Artifact) => void;
  onOpenItem?: (item: Artifact) => void;
}

const ConexoesCanvasInner: React.FC<ConexoesCanvasInnerProps> = ({
  data,
  selectedItemId,
  targetArtifactId,
  onClearTargetArtifactId,
  onOpenMap,
  onOpenItem,
  onSelectItem
}) => {
  const reactFlowInstance = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [lastClickedNode, setLastClickedNode] = useState<string | null>(null);
  const [isFirstRender, setIsFirstRender] = useState(true);
  const [pendingCenterNodeId, setPendingCenterNodeId] = useState<string | null>(null);
  const [isTargetNotFound, setIsTargetNotFound] = useState(false);
  const lastProcessedTargetIdRef = useRef<string | null>(null);

  // 1. Compute tree relationships securely
  const { roots, byParent, byId } = useMemo(() => {
    const mapByParent = new Map<string, Artifact[]>();
    const mapById = new Map<string, Artifact>();
    const rootsSet = new Set<Artifact>();

    data.forEach(a => mapById.set(a.id, a));

    data.forEach(a => {
      if (a.parent_id && mapById.has(a.parent_id)) {
        if (!mapByParent.has(a.parent_id)) mapByParent.set(a.parent_id, []);
        mapByParent.get(a.parent_id)!.push(a);
      } else {
        rootsSet.add(a);
      }
    });
    
    const sortByTitleAndId = (arr: Artifact[]) => {
      return arr.sort((a, b) => {
        const titleA = (a.titulo || '').toLowerCase();
        const titleB = (b.titulo || '').toLowerCase();
        if (titleA < titleB) return -1;
        if (titleA > titleB) return 1;
        return a.id.localeCompare(b.id);
      });
    };

    mapByParent.forEach((children, key) => {
      mapByParent.set(key, sortByTitleAndId(children));
    });

    let topLevel = sortByTitleAndId(Array.from(rootsSet));
    
    // Skip single abstract RAIZ node to show actual products
    if (topLevel.length === 1 && topLevel[0].artifact_type === 'RAIZ') {
      topLevel = mapByParent.get(topLevel[0].id) || [];
    }

    return { roots: topLevel, byParent: mapByParent, byId: mapById };
  }, [data]);

  const onSelectItemRef = useRef(onSelectItem);
  useEffect(() => {
    onSelectItemRef.current = onSelectItem;
  }, [onSelectItem]);

  // Handle targetArtifactId auto-expansion and focus
  useEffect(() => {
    if (!targetArtifactId || data.length === 0) {
      setIsTargetNotFound(false);
      lastProcessedTargetIdRef.current = null;
      return;
    }

    if (lastProcessedTargetIdRef.current === targetArtifactId) {
      return;
    }

    const target = byId.get(targetArtifactId);
    if (!target) {
      setIsTargetNotFound(true);
      return;
    }

    lastProcessedTargetIdRef.current = targetArtifactId;
    setIsTargetNotFound(false);

    // Collect all ancestors up to the root
    const ancestors = new Set<string>();
    let curr = target;
    while (curr && curr.parent_id) {
      ancestors.add(curr.parent_id);
      curr = byId.get(curr.parent_id) as Artifact;
    }

    setExpandedNodes(prev => {
      const next = new Set(prev);
      ancestors.forEach(id => next.add(id));
      return next;
    });

    if (onSelectItemRef.current) {
      onSelectItemRef.current(targetArtifactId);
    }
    setPendingCenterNodeId(targetArtifactId);
  }, [targetArtifactId, byId, data.length]);

  // 2. Action Handlers
  const handleToggle = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
        // Recursively remove descendants from expanded set
        const removeDescendants = (id: string) => {
          const children = byParent.get(id) || [];
          children.forEach(c => {
            next.delete(c.id);
            removeDescendants(c.id);
          });
        };
        removeDescendants(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
    setLastClickedNode(nodeId);
  }, [byParent]);

  // 3. Generate logical tree elements whenever state changes
  const { newNodes, newEdges } = useMemo(() => {
    const n: Node[] = [];
    const e: Edge[] = [];
    
    const traverse = (item: Artifact, level: number) => {
      const children = byParent.get(item.id) || [];
      const hasChildren = children.length > 0;
      const isExpanded = expandedNodes.has(item.id);
      
      let type = 'categoria';
      if (level === 0) type = 'produto';
      else if (level === 1) type = 'subproduto';
      
      if (item.artifact_type === 'MAPA') type = 'mapa';
      else if (item.artifact_type === 'DOCUMENTACAO') type = 'documento';

      n.push({
        id: item.id,
        type,
        position: { x: 0, y: 0 },
        data: {
          label: item.titulo,
          item,
          hasChildren,
          childrenCount: children.length,
          isExpanded,
          isSelected: false, // Updated by selection effect
          onToggle: () => handleToggle(item.id),
          onSelect: () => {
            if (onSelectItem) onSelectItem(item.id);
            if (type === 'mapa' || type === 'documento' || item.artifact_type === 'MAPA' || item.artifact_type === 'DOCUMENTACAO') {
              if (onOpenItem) {
                onOpenItem(item);
              } else if (onOpenMap) {
                onOpenMap(item);
              }
            }
          }
        }
      });

      if (isExpanded && hasChildren) {
        children.forEach(child => {
          const childIsSelected = false;
          e.push({
            id: `edge-${item.id}-${child.id}`,
            source: item.id,
            target: child.id,
            type: 'smoothstep',
            animated: false,
            style: {
              stroke: childIsSelected ? '#EF4444' : '#cbd5e1',
              strokeWidth: childIsSelected ? 3 : 2,
              zIndex: childIsSelected ? 10 : 0
            }
          });
          traverse(child, level + 1);
        });
      }
    };

    roots.forEach(r => traverse(r, 0));

    return { newNodes: n, newEdges: e };
  }, [roots, byParent, expandedNodes, handleToggle, onOpenMap, onOpenItem, onSelectItem]);

  // 4. Apply Layout & Update React Flow State
  useEffect(() => {
    if (newNodes.length === 0) return;

    const currentReactFlowNodes = reactFlowInstance.getNodes();
    const layouted = getDagreLayout(newNodes, newEdges, lastClickedNode, currentReactFlowNodes);
    
    setNodes(layouted);
    setEdges(newEdges);
    
    if (pendingCenterNodeId) {
      const targetNode = layouted.find(n => n.id === pendingCenterNodeId);
      if (targetNode) {
        setPendingCenterNodeId(null);
        setIsFirstRender(false);
        setTimeout(() => {
          reactFlowInstance.setCenter(
            targetNode.position.x + 150,
            targetNode.position.y + 40,
            { zoom: 1.0, duration: 800 }
          );
        }, 80);
      }
    } else if (isFirstRender) {
      setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.3, duration: 800, minZoom: 0.1, maxZoom: 1 });
      }, 50);
      setIsFirstRender(false);
    }
  }, [newNodes, newEdges, reactFlowInstance, isFirstRender, pendingCenterNodeId]);


  // Update selection without triggering layout recalculation
  useEffect(() => {
    setNodes(nds => nds.map(n => ({
      ...n,
      data: { ...n.data, isSelected: n.id === selectedItemId }
    })));
    setEdges(eds => eds.map(e => {
      const childIsSelected = selectedItemId === e.target;
      return {
        ...e,
        style: {
          ...e.style,
          stroke: childIsSelected ? '#7B0209' : '#cbd5e1',
          strokeWidth: childIsSelected ? 3 : 2,
          zIndex: childIsSelected ? 10 : 0
        }
      };
    }));
  }, [selectedItemId, setNodes, setEdges]);

  return (
    <div className="w-full h-full relative flex-1" style={{ width: '100%', height: '100%', minHeight: '600px' }}>
      {/* Target artifact not found notification banner */}
      {isTargetNotFound && (
        <div className="absolute top-4 left-4 right-4 z-50 flex items-center justify-between p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/90 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span className="font-semibold">Não foi possível localizar este artefato na árvore.</span>
          </div>
          {onClearTargetArtifactId && (
            <button
              type="button"
              onClick={() => {
                setIsTargetNotFound(false);
                onClearTargetArtifactId();
              }}
              className="px-3 py-1 rounded-xl bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold hover:bg-amber-300 transition-colors cursor-pointer"
            >
              Limpar e ver árvore
            </button>
          )}
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        minZoom={0.05}
        maxZoom={2}
        panOnDrag={true}
        className="bg-gray-50/30 dark:bg-[#0B0F19]/50 rounded-[40px] pointer-events-auto"
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={32} size={2} color="rgba(148, 163, 184, 0.2)" />
        <Controls 
           className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-100 dark:border-slate-700/50 shadow-2xl fill-gray-600 dark:fill-slate-300 rounded-2xl overflow-hidden p-1 gap-1"
           showInteractive={false}
        />
        <MiniMap 
          className="bg-white/80 dark:bg-slate-800/80 backdrop-blur border border-gray-200 dark:border-slate-700/50 shadow-lg rounded-2xl overflow-hidden"
          nodeColor={(n) => {
            if (n.type === 'produto') return '#7B0209';
            if (n.type === 'subproduto') return '#E30328';
            if (n.type === 'categoria') return '#B91C1C';
            if (n.type === 'mapa') return '#EF4444';
            if (n.type === 'documento') return '#64748B';
            return '#94A3B8';
          }}
          maskColor="rgba(255, 255, 255, 0.6)"
        />
      </ReactFlow>
    </div>
  );
};

export interface ConexoesCanvasProps {
  onSelectItem?: (id: string) => void;
  data: Artifact[];
  selectedItemId?: string | null;
  targetArtifactId?: string | null;
  onClearTargetArtifactId?: () => void;
  onOpenMap?: (map: Artifact) => void;
  onOpenItem?: (item: Artifact) => void;
}

export const ConexoesCanvas: React.FC<ConexoesCanvasProps> = (props) => (
  <ReactFlowProvider>
    <ConexoesCanvasInner {...props} />
  </ReactFlowProvider>
);
